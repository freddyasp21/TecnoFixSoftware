const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { opsSnapshot, isDayOperable, requireOpsOpen, clampPeriodFrom } = require('../utils/opsDay');

const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('calendar.view'), (req, res) => {
  const db = getDb();
  const ops = opsSnapshot(db);
  const requestedFrom = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = req.query.to || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
  const from = clampPeriodFrom(db, requestedFrom);

  const orders = db.prepare(`
    SELECT id, number, status, client_id, received_at, ready_at, delivered_at,
           device_brand, device_model
    FROM work_orders
    WHERE date(received_at) BETWEEN date(?) AND date(?)
       OR date(ready_at) BETWEEN date(?) AND date(?)
       OR date(delivered_at) BETWEEN date(?) AND date(?)
  `).all(from, to, from, to, from, to);

  const workDays = db.prepare('SELECT * FROM work_days WHERE day BETWEEN ? AND ?').all(from, to);

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN date(received_at) BETWEEN date(?) AND date(?) THEN 1 ELSE 0 END) AS ingresadas,
      SUM(CASE WHEN status = 'listo' AND date(COALESCE(ready_at, updated_at)) BETWEEN date(?) AND date(?) THEN 1 ELSE 0 END) AS finalizadas,
      SUM(CASE WHEN status = 'entregado' AND date(COALESCE(delivered_at, updated_at)) BETWEEN date(?) AND date(?) THEN 1 ELSE 0 END) AS entregadas,
      SUM(CASE WHEN status NOT IN ('entregado','cancelado') THEN 1 ELSE 0 END) AS pendientes
    FROM work_orders
  `).get(from, to, from, to, from, to);

  res.json({ from, to, orders, workDays, stats, ops });
});

router.post('/work-days', requirePermission('calendar.manage'), (req, res) => {
  const db = getDb();
  if (!requireOpsOpen(db, res)) return;
  const { day, worked, notes } = req.body || {};
  if (!day) return res.status(400).json({ error: 'Fecha requerida' });
  if (!isDayOperable(db, day)) {
    return res.status(400).json({ error: 'Solo se marcan días desde la fecha de inicio hasta el día operativo actual' });
  }
  db.prepare(`
    INSERT INTO work_days (day, worked, notes) VALUES (?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET worked = excluded.worked, notes = excluded.notes
  `).run(day, worked ? 1 : 0, notes || '');
  res.json({ ok: true });
});

module.exports = router;
