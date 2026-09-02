/**
 * Alertas operativas: cobros pendientes (cotizaciones aprobadas), inventario, nómina y órdenes.
 * Tras cobrar en caja la cotización pasa a convertida y deja de aparecer.
 */
const { quincena, buildPayroll } = require('../utils/payroll');

function userCan(user, code) {
  return user.role === 'Administrador' || (user.permissions || []).includes(code);
}

function currentPeriod() {
  const now = new Date();
  const day = now.getDate();
  return quincena(now.getFullYear(), now.getMonth() + 1, day <= 15 ? 1 : 2);
}

function collectAlerts(db, user) {
  const data = {
    stock: [],
    payroll: { period: null, remaining_usd: 0, workers: [] },
    collect: [],
    parts_orders: [],
    parts_items: [],
    ready: [],
  };

  if (userCan(user, 'inventory.view') || userCan(user, 'catalog.view')) {
    data.stock = db.prepare(`
      SELECT id, code, name, stock, min_stock
      FROM catalog_items
      WHERE type = 'product' AND active = 1 AND stock <= min_stock
      ORDER BY (stock - min_stock) ASC, name COLLATE NOCASE
    `).all();
  }

  if (userCan(user, 'workers.view')) {
    const period = currentPeriod();
    const payroll = buildPayroll(db, period);
    const due = payroll.workers.filter((w) => w.remaining_usd > 0 || w.salary_remaining_usd > 0);
    data.payroll = {
      period: payroll.period,
      payroll_pct: payroll.payroll_pct,
      income_usd: payroll.income_usd,
      pool_usd: payroll.pool_usd,
      paid_usd: payroll.paid_usd,
      remaining_usd: payroll.remaining_usd,
      salary_remaining_usd: payroll.salary_remaining_usd,
      workers: due,
    };
  }

  if (userCan(user, 'quotes.view') || userCan(user, 'cash.view')) {
    data.collect = db.prepare(`
      SELECT q.id, q.number, q.total, q.updated_at, q.created_at,
             c.name AS client_name, c.phone AS client_phone
      FROM quotes q
      LEFT JOIN clients c ON c.id = q.client_id
      WHERE q.status = 'aprobada'
      ORDER BY q.updated_at DESC
    `).all();
  }

  if (userCan(user, 'orders.view')) {
    data.parts_orders = db.prepare(`
      SELECT wo.id, wo.number, wo.device_brand, wo.device_model, wo.fault_description,
             wo.updated_at, wo.received_at, c.name AS client_name, t.full_name AS technician_name
      FROM work_orders wo
      LEFT JOIN clients c ON c.id = wo.client_id
      LEFT JOIN users t ON t.id = wo.technician_id
      WHERE wo.status = 'esperando_repuesto'
      ORDER BY wo.updated_at DESC
    `).all();
    data.parts_items = db.prepare(`
      SELECT i.id, i.work_order_id, i.description, i.qty, i.catalog_item_id,
             wo.number AS order_number, cat.code AS catalog_code, cat.stock, cat.min_stock
      FROM work_order_items i
      JOIN work_orders wo ON wo.id = i.work_order_id
      LEFT JOIN catalog_items cat ON cat.id = i.catalog_item_id
      WHERE wo.status = 'esperando_repuesto' AND i.type = 'product'
      ORDER BY wo.updated_at DESC, i.id
    `).all();
    data.ready = db.prepare(`
      SELECT wo.id, wo.number, wo.device_brand, wo.device_model, wo.ready_at, wo.updated_at, wo.total,
             c.name AS client_name, c.phone AS client_phone, t.full_name AS technician_name
      FROM work_orders wo
      LEFT JOIN clients c ON c.id = wo.client_id
      LEFT JOIN users t ON t.id = wo.technician_id
      WHERE wo.status = 'listo'
      ORDER BY COALESCE(wo.ready_at, wo.updated_at) DESC
    `).all();
  }

  const counts = {
    stock: data.stock.length,
    payroll: data.payroll.workers.length,
    collect: data.collect.length,
    parts: data.parts_orders.length,
    ready: data.ready.length,
  };
  counts.total = counts.stock + counts.payroll + counts.collect + counts.parts + counts.ready;
  return { ...data, counts };
}

module.exports = { collectAlerts, userCan };
