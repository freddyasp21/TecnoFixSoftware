const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { todayRate } = require('../utils/helpers');

const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('rates.view'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 365);
  const rows = getDb().prepare(`
    SELECT r.*, u.full_name AS created_by_name
    FROM exchange_rates r
    LEFT JOIN users u ON u.id = r.created_by
    ORDER BY r.rate_date DESC
    LIMIT ?
  `).all(limit);
  res.json({ today: todayRate(getDb()), history: rows });
});

router.get('/today', requirePermission('rates.view'), (_req, res) => {
  res.json(todayRate(getDb()));
});

router.post('/', requirePermission('rates.manage'), (req, res) => {
  const { rate_date, bcv, euro, usdt } = req.body || {};
  const date = rate_date || new Date().toISOString().slice(0, 10);
  if (!(Number(bcv) > 0 && Number(euro) > 0 && Number(usdt) > 0)) {
    return res.status(400).json({ error: 'Las tres tasas (BCV, Euro, USDT) deben ser mayores a cero' });
  }
  getDb().prepare(`
    INSERT INTO exchange_rates (rate_date, bcv, euro, usdt, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(rate_date) DO UPDATE SET
      bcv = excluded.bcv, euro = excluded.euro, usdt = excluded.usdt, created_by = excluded.created_by
  `).run(date, Number(bcv), Number(euro), Number(usdt), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
