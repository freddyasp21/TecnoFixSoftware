const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { computeTotals, businessDateTime } = require('../utils/helpers');
const { deductProducts, restoreProducts } = require('../services/inventory');

const router = express.Router();
router.use(authRequired);

function hydrate(order) {
  if (!order) return null;
  const db = getDb();
  order.items = db.prepare('SELECT * FROM work_order_items WHERE work_order_id = ?').all(order.id);
  return order;
}

router.get('/lookups/technicians', requirePermission('orders.view'), (_req, res) => {
  const rows = getDb().prepare(`
    SELECT u.id, u.full_name, r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.active = 1 AND r.name IN ('Tecnico', 'Supervisor', 'Administrador')
    ORDER BY u.full_name
  `).all();
  res.json(rows);
});

router.get('/lookups/cashiers', requirePermission('orders.view'), (_req, res) => {
  const rows = getDb().prepare(`
    SELECT u.id, u.full_name, r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.active = 1 AND r.name IN ('Cajero', 'Gerente', 'Administrador')
    ORDER BY u.full_name
  `).all();
  res.json(rows);
});

router.get('/', requirePermission('orders.view'), (req, res) => {
  const { status, q } = req.query;
  let sql = `
    SELECT wo.*, c.name AS client_name, t.full_name AS technician_name,
           k.full_name AS cashier_name, q.number AS quote_number
    FROM work_orders wo
    LEFT JOIN clients c ON c.id = wo.client_id
    LEFT JOIN users t ON t.id = wo.technician_id
    LEFT JOIN users k ON k.id = wo.cashier_id
    LEFT JOIN quotes q ON q.id = wo.quote_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND wo.status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (wo.number LIKE ? OR c.name LIKE ? OR wo.serial_number LIKE ? OR wo.device_model LIKE ? OR t.full_name LIKE ? OR k.full_name LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  sql += ' ORDER BY wo.received_at DESC';
  res.json(getDb().prepare(sql).all(...params));
});

router.get('/:id', requirePermission('orders.view'), (req, res) => {
  const order = getDb().prepare(`
    SELECT wo.*, c.name AS client_name, c.phone AS client_phone, c.document AS client_document,
           t.full_name AS technician_name, k.full_name AS cashier_name
    FROM work_orders wo
    LEFT JOIN clients c ON c.id = wo.client_id
    LEFT JOIN users t ON t.id = wo.technician_id
    LEFT JOIN users k ON k.id = wo.cashier_id
    WHERE wo.id = ?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(hydrate(order));
});

function saveItems(db, orderId, items, ivaEnabled, ivaRate, userId, previousItems) {
  restoreProducts(previousItems || [], `Edición orden #${orderId} (reversa)`, 'work_order', orderId, userId);
  db.prepare('DELETE FROM work_order_items WHERE work_order_id = ?').run(orderId);
  const ins = db.prepare(`
    INSERT INTO work_order_items (work_order_id, catalog_item_id, type, description, qty, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const normalized = (items || []).map((it) => {
    const qty = Number(it.qty) || 1;
    const unit_price = Number(it.unit_price) || 0;
    return {
      ...it,
      qty, unit_price,
      line_total: Math.round(qty * unit_price * 100) / 100,
      type: it.type === 'service' ? 'service' : 'product',
    };
  });
  for (const it of normalized) {
    ins.run(orderId, it.catalog_item_id || null, it.type, it.description, it.qty, it.unit_price, it.line_total);
  }
  deductProducts(normalized, `Repuestos orden #${orderId}`, 'work_order', orderId, userId);
  const totals = computeTotals(normalized, ivaEnabled, ivaRate);
  db.prepare(`
    UPDATE work_orders SET subtotal = ?, iva_amount = ?, total = ?,
      updated_at = datetime('now','localtime') WHERE id = ?
  `).run(totals.subtotal, totals.iva_amount, totals.total, orderId);
}

function toDateTime(v, fallback) {
  if (v == null || v === '') return fallback;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return s;
}

router.post('/', requirePermission('orders.manage'), (_req, res) => {
  return res.status(400).json({
    error: 'La orden solo se crea al cobrar una cotización aprobada en caja.',
  });
});

router.put('/:id', requirePermission('orders.manage'), (req, res) => {
  const db = getDb();
  const order = hydrate(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id));
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  const b = req.body || {};
  const ivaEnabled = b.iva_enabled != null ? (b.iva_enabled ? 1 : 0) : order.iva_enabled;
  const ivaRate = b.iva_rate != null ? Number(b.iva_rate) : order.iva_rate;

  try {
    db.transaction(() => {
      const status = b.status ?? order.status;
      let readyAt = order.ready_at;
      let deliveredAt = order.delivered_at;
      const receivedAt = b.received_at !== undefined
        ? toDateTime(b.received_at, order.received_at)
        : order.received_at;
      if (b.delivered_at !== undefined) {
        deliveredAt = b.delivered_at ? toDateTime(b.delivered_at, null) : null;
      }
      if (status === 'listo' && !readyAt) readyAt = businessDateTime(db);
      if (status === 'entregado' && !deliveredAt) deliveredAt = businessDateTime(db);

      db.prepare(`
        UPDATE work_orders SET
          client_id = COALESCE(?, client_id),
          technician_id = COALESCE(?, technician_id),
          cashier_id = COALESCE(?, cashier_id),
          status = COALESCE(?, status),
          device_brand = COALESCE(?, device_brand),
          device_model = COALESCE(?, device_model),
          serial_number = COALESCE(?, serial_number),
          device_password = COALESCE(?, device_password),
          fault_description = COALESCE(?, fault_description),
          physical_notes = COALESCE(?, physical_notes),
          rate_type = COALESCE(?, rate_type),
          rate_value = COALESCE(?, rate_value),
          iva_enabled = ?, iva_rate = ?,
          received_at = ?, ready_at = ?, delivered_at = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(
        b.client_id ?? null, b.technician_id ?? null, b.cashier_id ?? null, b.status ?? null,
        b.device_brand ?? null, b.device_model ?? null, b.serial_number ?? null,
        b.device_password ?? null, b.fault_description ?? null, b.physical_notes ?? null,
        b.rate_type ?? null, b.rate_value == null ? null : Number(b.rate_value),
        ivaEnabled, ivaRate, receivedAt, readyAt, deliveredAt, order.id
      );

      if (b.status === 'cancelado' && order.status !== 'cancelado') {
        restoreProducts(order.items, `Cancelación ${order.number}`, 'work_order', order.id, req.user.id);
        db.prepare('DELETE FROM work_order_items WHERE work_order_id = ?').run(order.id);
        db.prepare('UPDATE work_orders SET subtotal = 0, iva_amount = 0, total = 0 WHERE id = ?').run(order.id);
      } else if (b.items) {
        saveItems(db, order.id, b.items, ivaEnabled, ivaRate, req.user.id, order.items);
      }
    })();
    res.json(hydrate(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(order.id)));
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', requirePermission('orders.delete'), (req, res) => {
  const db = getDb();
  const order = hydrate(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(req.params.id));
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  try {
    db.transaction(() => {
      restoreProducts(order.items, `Eliminación ${order.number}`, 'work_order', order.id, req.user.id);
      db.prepare('UPDATE cash_transactions SET work_order_id = NULL WHERE work_order_id = ?').run(order.id);
      db.prepare('DELETE FROM work_order_items WHERE work_order_id = ?').run(order.id);
      db.prepare('DELETE FROM work_orders WHERE id = ?').run(order.id);
    })();
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo eliminar la orden' });
  }
});

module.exports = router;
