const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requirePermission('reports.view'));

router.get('/summary', (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  const db = getDb();

  const orders = db.prepare(`
    SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS total
    FROM work_orders
    WHERE date(received_at) BETWEEN date(?) AND date(?)
    GROUP BY status
  `).all(from, to);

  const cash = db.prepare(`
    SELECT t.type, t.payment_method, SUM(t.amount) AS amount, SUM(t.amount_usd) AS amount_usd
    FROM cash_transactions t
    WHERE date(t.created_at) BETWEEN date(?) AND date(?)
    GROUP BY t.type, t.payment_method
  `).all(from, to);

  const quotes = db.prepare(`
    SELECT status, COUNT(*) AS n, COALESCE(SUM(total),0) AS total
    FROM quotes WHERE date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY status
  `).all(from, to);

  const topItems = db.prepare(`
    SELECT description, SUM(qty) AS qty, SUM(line_total) AS total
    FROM work_order_items i
    JOIN work_orders w ON w.id = i.work_order_id
    WHERE date(w.received_at) BETWEEN date(?) AND date(?)
    GROUP BY description
    ORDER BY total DESC LIMIT 10
  `).all(from, to);

  const kpis = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM work_orders WHERE date(received_at) BETWEEN date(?) AND date(?)) AS orders,
      (SELECT COUNT(*) FROM work_orders WHERE status NOT IN ('entregado','cancelado')) AS pending,
      (SELECT COUNT(*) FROM work_orders WHERE status = 'entregado' AND date(COALESCE(delivered_at, updated_at)) BETWEEN date(?) AND date(?)) AS delivered,
      (SELECT COUNT(*) FROM catalog_items WHERE type = 'product' AND stock <= min_stock) AS low_stock,
      (SELECT COALESCE(SUM(amount_usd),0) FROM cash_transactions WHERE type = 'income' AND date(created_at) BETWEEN date(?) AND date(?)) AS income_usd,
      (SELECT COALESCE(SUM(amount_usd),0) FROM cash_transactions WHERE type = 'expense' AND date(created_at) BETWEEN date(?) AND date(?)) AS expense_usd
  `).get(from, to, from, to, from, to, from, to);

  res.json({ from, to, kpis, orders, cash, quotes, topItems });
});

module.exports = router;
