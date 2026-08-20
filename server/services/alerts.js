/**
 * Alertas operativas: solo lectura sobre inventario, nómina y órdenes existentes.
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

  if (userCan(user, 'workers.view') || userCan(user, 'cash.view')) {
    const period = currentPeriod();
    const payroll = buildPayroll(db, period);
    const due = payroll.workers.filter((w) => w.remaining_usd > 0);
    data.payroll = {
      period: payroll.period,
      payroll_pct: payroll.payroll_pct,
      income_usd: payroll.income_usd,
      pool_usd: payroll.pool_usd,
      paid_usd: payroll.paid_usd,
      remaining_usd: payroll.remaining_usd,
      workers: due,
    };
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
    parts: data.parts_orders.length,
    ready: data.ready.length,
  };
  counts.total = counts.stock + counts.payroll + counts.parts + counts.ready;
  return { ...data, counts };
}

module.exports = { collectAlerts, userCan };
