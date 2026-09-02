const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { businessDate, localDate, round2 } = require('../utils/helpers');

const router = express.Router();
router.use(authRequired, requirePermission('dashboard.view'));

router.get('/', (_req, res) => {
  const db = getDb();
  const today = businessDate(db);
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

  const pendingCollect = db.prepare(`
    SELECT q.id, q.number, q.total, q.updated_at, q.created_at,
           c.name AS client_name, c.phone AS client_phone
    FROM quotes q
    LEFT JOIN clients c ON c.id = q.client_id
    WHERE q.status = 'aprobada'
    ORDER BY q.updated_at DESC
  `).all();

  res.json({ kpis, orders, pendingCollect });
});

function monthParts(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const prev = new Date(y, m - 2, 1);
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, '0')}`,
    days: last,
    prev: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
  };
}

function servicesInRange(db, from, to) {
  const sql = (typeFilter) => `
    SELECT i.description AS name,
           COALESCE(SUM(i.qty), 0) AS qty,
           COUNT(DISTINCT i.work_order_id) AS orders,
           COALESCE(SUM(i.line_total), 0) AS total_usd
    FROM work_order_items i
    JOIN work_orders w ON w.id = i.work_order_id
    WHERE w.status != 'cancelado'
      ${typeFilter}
      AND date(w.received_at) BETWEEN date(?) AND date(?)
    GROUP BY i.description
    ORDER BY qty DESC, total_usd DESC
  `;
  const services = db.prepare(sql("AND i.type = 'service'")).all(from, to);
  if (services.length) return services;
  return db.prepare(sql('')).all(from, to);
}

router.get('/charts', (req, res) => {
  const db = getDb();
  const monthRows = db.prepare(`
    SELECT m FROM (
      SELECT strftime('%Y-%m', received_at) AS m FROM work_orders
      UNION
      SELECT strftime('%Y-%m', created_at) AS m FROM cash_transactions WHERE type = 'income'
    ) WHERE m IS NOT NULL
    ORDER BY m DESC
  `).all().map((r) => r.m);
  const requested = String(req.query.month || '');
  const month = /^\d{4}-\d{2}$/.test(requested) ? requested : (monthRows[0] || localDate().slice(0, 7));
  const { from, to, days, prev } = monthParts(month);
  const prevRange = monthParts(prev);
  const months = [...new Set([month, ...monthRows])].sort().reverse();

  const currentServices = servicesInRange(db, from, to);
  const prevMap = Object.fromEntries(servicesInRange(db, prevRange.from, prevRange.to).map((r) => [r.name, r]));
  const services = currentServices.slice(0, 7).map((r) => ({
    name: r.name,
    qty: Number(r.qty) || 0,
    orders: Number(r.orders) || 0,
    total_usd: round2(r.total_usd),
    prev_qty: Number(prevMap[r.name]?.qty) || 0,
  }));

  const incomeRows = db.prepare(`
    SELECT date(created_at) AS day, COALESCE(SUM(amount_usd), 0) AS income_usd
    FROM cash_transactions
    WHERE type = 'income' AND date(created_at) BETWEEN date(?) AND date(?)
    GROUP BY date(created_at)
  `).all(from, to);
  const byDay = Object.fromEntries(incomeRows.map((r) => [r.day, Number(r.income_usd) || 0]));
  const income = [];
  for (let d = 1; d <= days; d += 1) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    income.push({ day, label: String(d), income_usd: round2(byDay[day] || 0) });
  }

  res.json({
    month,
    prev_month: prev,
    months,
    services,
    income,
    income_total: round2(income.reduce((s, r) => s + r.income_usd, 0)),
  });
});

module.exports = router;
