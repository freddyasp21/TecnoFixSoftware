const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requirePermission('dashboard.view'));

router.get('/', (_req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const kpis = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM work_orders WHERE date(received_at) = date(?)) AS orders,
      (SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('entregado','cancelado')) AS pending,
      (SELECT COUNT(*) FROM work_orders WHERE status = 'entregado' AND date(COALESCE(delivered_at, updated_at)) = date(?)) AS delivered,
      (SELECT COUNT(*) FROM catalog_items WHERE type = 'product' AND stock <= min_stock) AS low_stock,
      (SELECT COALESCE(SUM(amount_usd),0) FROM cash_transactions WHERE type = 'income' AND date(created_at) = date(?)) AS income_usd,
      (SELECT COALESCE(SUM(amount_usd),0) FROM cash_transactions WHERE type = 'expense' AND date(created_at) = date(?)) AS expense_usd
  `).get(today, today, today, today);

  const orders = db.prepare(`
    SELECT status, COUNT(*) AS n FROM work_orders
    WHERE date(received_at) = date(?) GROUP BY status
  `).all(today);

  res.json({ kpis, orders });
});

module.exports = router;
