/**
 * Plantilla de trabajadores, asistencia y pago de nómina quincenal desde caja.
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requireAdmin } = require('../middleware/auth');
const { todayRate, amountToUsd, round2 } = require('../utils/helpers');
const { quincena, buildPayroll } = require('../utils/payroll');

const METHODS = ['usd_cash', 'bs_cash', 'bs_mobile', 'usdt'];
const router = express.Router();
router.use(authRequired, requireAdmin);

function currentSession(db) {
  return db.prepare(`
    SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1
  `).get();
}

router.get('/', (_req, res) => {
  const rows = getDb().prepare(`
    SELECT w.*, u.full_name AS user_name
    FROM workers w
    LEFT JOIN users u ON u.id = w.user_id
    ORDER BY w.active DESC, w.full_name COLLATE NOCASE
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!String(b.full_name || '').trim()) {
    return res.status(400).json({ error: 'El nombre del trabajador es obligatorio' });
  }
  const weight = Number(b.share_weight);
  if (weight && !(weight > 0)) {
    return res.status(400).json({ error: 'El peso de nómina debe ser mayor a cero' });
  }
  const info = getDb().prepare(`
    INSERT INTO workers (user_id, full_name, document, phone, position, share_weight, notes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.user_id || null,
    String(b.full_name).trim(),
    b.document || '',
    b.phone || '',
    b.position || '',
    weight > 0 ? weight : 1,
    b.notes || '',
    b.active === 0 ? 0 : 1
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Trabajador no encontrado' });
  const b = req.body || {};
  const name = String(b.full_name ?? row.full_name).trim();
  if (!name) return res.status(400).json({ error: 'El nombre del trabajador es obligatorio' });
  const weight = b.share_weight !== undefined ? Number(b.share_weight) : row.share_weight;
  if (!(weight > 0)) return res.status(400).json({ error: 'El peso de nómina debe ser mayor a cero' });
  db.prepare(`
    UPDATE workers SET
      user_id = ?, full_name = ?, document = ?, phone = ?, position = ?,
      share_weight = ?, notes = ?, active = ?,
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    b.user_id === undefined ? row.user_id : (b.user_id || null),
    name,
    b.document ?? row.document,
    b.phone ?? row.phone,
    b.position ?? row.position,
    weight,
    b.notes ?? row.notes,
    b.active === undefined ? row.active : (b.active ? 1 : 0),
    row.id
  );
  res.json({ ok: true });
});

router.get('/payroll', (req, res) => {
  const now = new Date();
  const year = req.query.year || now.getFullYear();
  const month = req.query.month || (now.getMonth() + 1);
  const half = req.query.half || (now.getDate() <= 15 ? 1 : 2);
  try {
    const period = quincena(year, month, half);
    const data = buildPayroll(getDb(), period);
    const session = currentSession(getDb());
    res.json({ ...data, cash_open: !!session });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/:id/attendance', (req, res) => {
  const db = getDb();
  const worker = db.prepare('SELECT id FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: 'Trabajador no encontrado' });
  const day = req.body?.day;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }
  const worked = req.body.worked ? 1 : 0;
  db.prepare(`
    INSERT INTO worker_attendance (worker_id, day, worked, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(worker_id, day) DO UPDATE SET worked = excluded.worked, notes = excluded.notes
  `).run(worker.id, day, worked, req.body.notes || '');
  res.json({ ok: true });
});

router.post('/:id/pay', (req, res) => {
  const db = getDb();
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker || !worker.active) {
    return res.status(404).json({ error: 'Trabajador no encontrado o inactivo' });
  }
  const session = currentSession(db);
  if (!session) {
    return res.status(400).json({ error: 'Debe abrir caja para pagar la nómina' });
  }
  const now = new Date();
  let period;
  try {
    period = quincena(
      req.body.year || now.getFullYear(),
      req.body.month || (now.getMonth() + 1),
      req.body.half || (now.getDate() <= 15 ? 1 : 2)
    );
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (!METHODS.includes(req.body.payment_method)) {
    return res.status(400).json({ error: 'Método de pago no permitido' });
  }

  const payroll = buildPayroll(db, period);
  const row = payroll.workers.find((w) => w.id === worker.id);
  if (!row || row.remaining_usd <= 0) {
    return res.status(400).json({ error: 'Este trabajador no tiene saldo pendiente en la quincena' });
  }

  const rate = todayRate(db);
  const rateType = req.body.rate_type || 'bcv';
  const rateValue = Number(req.body.rate_value) || (rate ? rate[rateType] : 1);
  const payAmount = (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '')
    ? Number(req.body.amount)
    : (req.body.payment_method.startsWith('bs')
      ? round2(row.remaining_usd * rateValue)
      : row.remaining_usd);
  if (!(payAmount > 0)) return res.status(400).json({ error: 'El monto a pagar debe ser mayor a cero' });
  const amountUsd = amountToUsd(payAmount, req.body.payment_method, rateType, rateValue);
  if (amountUsd > row.remaining_usd + 0.009) {
    return res.status(400).json({
      error: `El pago (${amountUsd} USD) supera lo asignado pendiente (${row.remaining_usd} USD)`,
    });
  }

  try {
    const result = db.transaction(() => {
      const tx = db.prepare(`
        INSERT INTO cash_transactions (
          session_id, type, payment_method, amount, amount_usd, rate_type, rate_value,
          description, created_by, finance_bucket, worker_id
        ) VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, 'payroll', ?)
      `).run(
        session.id, req.body.payment_method, payAmount, amountUsd,
        rateType, rateValue,
        `Nómina ${period.label} · ${worker.full_name}`,
        req.user.id, worker.id
      );
      db.prepare(`
        INSERT INTO payroll_payments (
          worker_id, period_from, period_to, period_kind, days_worked,
          allocated_usd, amount_usd, cash_transaction_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        worker.id, period.from, period.to, period.kind, row.days_worked,
        row.allocated_usd, amountUsd, tx.lastInsertRowid, req.user.id
      );
      return { cash_transaction_id: tx.lastInsertRowid, amount_usd: amountUsd };
    })();
    res.status(201).json({ ok: true, ...result, remaining_usd: round2(row.remaining_usd - result.amount_usd) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
