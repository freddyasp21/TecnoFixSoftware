/**
 * Gestión financiera: reparte los ingresos de caja en sobres
 * (comisiones, salario, insumos, ahorro) y contrasta contra los egresos clasificados.
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { getSetting, setSetting, round2 } = require('../utils/helpers');
const { backfillImportedOrderIncome, cashInPeriodSql, importCashSessionSetting } = require('../services/importedCash');
const { salaryEnvelope } = require('../utils/payroll');
const { opsSnapshot } = require('../utils/opsDay');

const router = express.Router();
router.use(authRequired);

let importedIncomeSynced = false;

function ensureImportedIncome(db) {
  if (importedIncomeSynced) return;
  backfillImportedOrderIncome(db);
  importedIncomeSynced = true;
}

const BUCKETS = [
  { id: 'payroll', key: 'finance_pct_payroll', label: 'Comisiones', hint: 'Se reparte entre trabajadores según los días que cada uno laboró en el período' },
  { id: 'supplies', key: 'finance_pct_supplies', label: 'Insumos, piezas y herramientas', hint: 'Materiales y repuestos del taller' },
  { id: 'savings', key: 'finance_pct_savings', label: 'Ahorros e inversión', hint: 'Reserva y crecimiento del negocio' },
];

function rules(db) {
  const payroll = Number(getSetting(db, 'finance_pct_payroll', '40')) || 0;
  const supplies = Number(getSetting(db, 'finance_pct_supplies', '30')) || 0;
  const savings = Number(getSetting(db, 'finance_pct_savings', '20')) || 0;
  const operation = round2(Math.max(0, 100 - payroll - supplies - savings));
  const salary_increment_pct = Number(getSetting(db, 'salary_increment_pct_per_year', '5')) || 0;
  return { payroll, supplies, savings, operation, salary_increment_pct };
}

router.get('/', requirePermission('finance.view'), (req, res) => {
  const db = getDb();
  ensureImportedIncome(db);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const requestedFrom = DATE_RE.test(req.query.from) ? req.query.from : new Date().toISOString().slice(0, 8) + '01';
  const to = DATE_RE.test(req.query.to) ? req.query.to : new Date().toISOString().slice(0, 10);
  const from = requestedFrom;
  const pct = rules(db);
  const periodSql = cashInPeriodSql('t');
  const importSid = importCashSessionSetting(db);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_usd ELSE 0 END), 0) AS income_usd,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_usd ELSE 0 END), 0) AS expense_usd
    FROM cash_transactions t
    WHERE ${periodSql}
  `).get(from, to, importSid);

  const spentRows = db.prepare(`
    SELECT COALESCE(t.finance_bucket, 'unclassified') AS bucket,
           COALESCE(SUM(t.amount_usd), 0) AS amount_usd
    FROM cash_transactions t
    WHERE t.type = 'expense' AND ${periodSql}
    GROUP BY COALESCE(t.finance_bucket, 'unclassified')
  `).all(from, to, importSid);
  const spent = Object.fromEntries(spentRows.map((r) => [r.bucket, r.amount_usd]));

  const income = round2(totals.income_usd);
  const ivaRate = Number(getSetting(db, 'iva_rate', '16')) || 16;
  const iva_usd = round2(income * ivaRate / 100);
  const envelopes = BUCKETS.map((b) => {
    const allocated = round2(income * (pct[b.id] / 100));
    const used = round2(spent[b.id] || 0);
    return {
      id: b.id,
      label: b.label,
      hint: b.hint,
      pct: pct[b.id],
      allocated,
      spent: used,
      remaining: round2(allocated - used),
    };
  });
  const opAllocated = round2(income * (pct.operation / 100));
  const opSpent = round2(spent.operation || 0);
  envelopes.push({
    id: 'operation',
    label: 'Utilidad / operación',
    hint: 'Resto del ingreso (100% − las tres reglas). Use este sobre para gastos no cubiertos arriba.',
    pct: pct.operation,
    allocated: opAllocated,
    spent: opSpent,
    remaining: round2(opAllocated - opSpent),
  });
  envelopes.splice(1, 0, salaryEnvelope(db, from, to));

  const movements = db.prepare(`
    SELECT t.id, t.type, t.payment_method, t.amount, t.amount_usd, t.description,
           t.finance_bucket, t.created_at, t.worker_id,
           c.name AS client_name, wo.number AS order_number, w.full_name AS worker_name
    FROM cash_transactions t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN work_orders wo ON wo.id = t.work_order_id
    LEFT JOIN workers w ON w.id = t.worker_id
    WHERE ${periodSql}
    ORDER BY t.created_at DESC
  `).all(from, to, importSid);

  const payroll = db.prepare(`
    SELECT p.id, p.period_from, p.period_to, p.period_kind, p.days_worked,
           p.allocated_usd, p.amount_usd, COALESCE(p.kind, 'commission') AS kind,
           p.created_at, w.full_name AS worker_name
    FROM payroll_payments p
    JOIN workers w ON w.id = p.worker_id
    WHERE date(p.created_at) BETWEEN date(?) AND date(?)
       OR (p.period_from <= ? AND p.period_to >= ?)
    ORDER BY p.created_at DESC
  `).all(from, to, to, from);

  res.json({
    from,
    to,
    income_usd: income,
    iva_rate: ivaRate,
    iva_usd,
    expense_usd: round2(totals.expense_usd),
    net_usd: round2(income - totals.expense_usd),
    unclassified_expense_usd: round2(spent.unclassified || 0),
    rules: pct,
    envelopes,
    movements,
    payroll,
    ops: opsSnapshot(db),
  });
});

router.put('/rules', requirePermission('finance.manage'), (req, res) => {
  const payrollAmt = Number(req.body.payroll);
  const supplies = Number(req.body.supplies);
  const savings = Number(req.body.savings);
  if ([payrollAmt, supplies, savings].some((n) => Number.isNaN(n) || n < 0)) {
    return res.status(400).json({ error: 'Los porcentajes deben ser números mayores o iguales a cero' });
  }
  if (payrollAmt + supplies + savings > 100) {
    return res.status(400).json({ error: 'La suma de comisiones + insumos + ahorro no puede superar 100%' });
  }
  const increment = req.body.salary_increment_pct;
  if (increment != null && (Number.isNaN(Number(increment)) || Number(increment) < 0)) {
    return res.status(400).json({ error: 'El incremento por antigüedad debe ser un porcentaje mayor o igual a cero' });
  }
  const db = getDb();
  setSetting(db, 'finance_pct_payroll', payrollAmt);
  setSetting(db, 'finance_pct_supplies', supplies);
  setSetting(db, 'finance_pct_savings', savings);
  if (increment != null) setSetting(db, 'salary_increment_pct_per_year', Number(increment));
  res.json({ ok: true, rules: rules(db) });
});

router.put('/transactions/:id', requirePermission('finance.manage'), (req, res) => {
  const allowed = ['payroll', 'salary', 'supplies', 'savings', 'operation', null, ''];
  let bucket = req.body.finance_bucket;
  if (bucket === '') bucket = null;
  if (!allowed.includes(bucket)) {
    return res.status(400).json({ error: 'Clasificación no válida' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM cash_transactions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (row.type !== 'expense') {
    return res.status(400).json({ error: 'Solo los egresos se clasifican en un sobre' });
  }
  db.prepare('UPDATE cash_transactions SET finance_bucket = ? WHERE id = ?').run(bucket, row.id);
  res.json({ ok: true });
});

module.exports = router;
