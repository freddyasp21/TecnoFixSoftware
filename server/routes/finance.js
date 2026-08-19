/**
 * Gestión financiera: reparte los ingresos de caja en sobres
 * (trabajadores, insumos, ahorro) y contrasta contra los egresos clasificados.
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { getSetting, setSetting, round2 } = require('../utils/helpers');

const router = express.Router();
router.use(authRequired);

const BUCKETS = [
  { id: 'payroll', key: 'finance_pct_payroll', label: 'Trabajadores', hint: 'Pago al personal de la empresa' },
  { id: 'supplies', key: 'finance_pct_supplies', label: 'Insumos, piezas y herramientas', hint: 'Materiales y repuestos del taller' },
  { id: 'savings', key: 'finance_pct_savings', label: 'Ahorros e inversión', hint: 'Reserva y crecimiento del negocio' },
];

function rules(db) {
  const payroll = Number(getSetting(db, 'finance_pct_payroll', '40')) || 0;
  const supplies = Number(getSetting(db, 'finance_pct_supplies', '30')) || 0;
  const savings = Number(getSetting(db, 'finance_pct_savings', '20')) || 0;
  const operation = round2(Math.max(0, 100 - payroll - supplies - savings));
  return { payroll, supplies, savings, operation };
}

function requireAny(...codes) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sesión requerida' });
    if (req.user.role === 'Administrador' || codes.some((c) => req.user.permissions.includes(c))) {
      return next();
    }
    return res.status(403).json({ error: 'No tiene permiso para esta acción' });
  };
}

router.get('/', requireAny('finance.view', 'cash.view'), (req, res) => {
  const db = getDb();
  const from = req.query.from || new Date().toISOString().slice(0, 8) + '01';
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const pct = rules(db);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount_usd ELSE 0 END), 0) AS income_usd,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_usd ELSE 0 END), 0) AS expense_usd
    FROM cash_transactions
    WHERE date(created_at) BETWEEN date(?) AND date(?)
  `).get(from, to);

  const spentRows = db.prepare(`
    SELECT COALESCE(finance_bucket, 'unclassified') AS bucket,
           COALESCE(SUM(amount_usd), 0) AS amount_usd
    FROM cash_transactions
    WHERE type = 'expense' AND date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY COALESCE(finance_bucket, 'unclassified')
  `).all(from, to);
  const spent = Object.fromEntries(spentRows.map((r) => [r.bucket, r.amount_usd]));

  const income = round2(totals.income_usd);
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

  const movements = db.prepare(`
    SELECT t.id, t.type, t.payment_method, t.amount, t.amount_usd, t.description,
           t.finance_bucket, t.created_at, c.name AS client_name, wo.number AS order_number
    FROM cash_transactions t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN work_orders wo ON wo.id = t.work_order_id
    WHERE date(t.created_at) BETWEEN date(?) AND date(?)
    ORDER BY t.created_at DESC
  `).all(from, to);

  res.json({
    from,
    to,
    income_usd: income,
    expense_usd: round2(totals.expense_usd),
    net_usd: round2(income - totals.expense_usd),
    unclassified_expense_usd: round2(spent.unclassified || 0),
    rules: pct,
    envelopes,
    movements,
  });
});

router.put('/rules', requirePermission('finance.manage'), (req, res) => {
  const payroll = Number(req.body.payroll);
  const supplies = Number(req.body.supplies);
  const savings = Number(req.body.savings);
  if ([payroll, supplies, savings].some((n) => Number.isNaN(n) || n < 0)) {
    return res.status(400).json({ error: 'Los porcentajes deben ser números mayores o iguales a cero' });
  }
  if (payroll + supplies + savings > 100) {
    return res.status(400).json({ error: 'La suma de trabajadores + insumos + ahorro no puede superar 100%' });
  }
  const db = getDb();
  setSetting(db, 'finance_pct_payroll', payroll);
  setSetting(db, 'finance_pct_supplies', supplies);
  setSetting(db, 'finance_pct_savings', savings);
  res.json({ ok: true, rules: rules(db) });
});

router.put('/transactions/:id', requirePermission('finance.manage'), (req, res) => {
  const allowed = ['payroll', 'supplies', 'savings', 'operation', null, ''];
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
