/**
 * Crea la orden de trabajo a partir de una cotización ya cobrada.
 * Debe ejecutarse dentro de una transacción del llamador (caja).
 */
const { nextNumber } = require('../utils/helpers');
const { deductProducts } = require('./inventory');

function convertQuoteToOrder(db, quote, extra, userId) {
  if (!quote) {
    const err = new Error('Cotización no encontrada');
    err.status = 404;
    throw err;
  }
  if (quote.status === 'convertida') {
    const err = new Error('Esta cotización ya fue cobrada y convertida en orden');
    err.status = 400;
    throw err;
  }
  if (quote.status !== 'aprobada') {
    const err = new Error('Solo se crea la orden después de aprobar y cobrar la cotización en caja');
    err.status = 400;
    throw err;
  }
  const items = quote.items || db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(quote.id);
  const b = extra || {};
  const number = nextNumber(db, 'order_seq', 'OT');
  const info = db.prepare(`
    INSERT INTO work_orders (
      number, quote_id, client_id, technician_id, status,
      device_brand, device_model, serial_number, device_password,
      fault_description, physical_notes,
      rate_type, rate_value, iva_enabled, iva_rate,
      subtotal, iva_amount, total, created_by
    ) VALUES (?, ?, ?, ?, 'recibido', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    number, quote.id, quote.client_id, b.technician_id ? Number(b.technician_id) : null,
    b.device_brand || '', b.device_model || '', b.serial_number || '',
    b.device_password || '', b.fault_description || '', b.physical_notes || '',
    quote.rate_type, quote.rate_value, quote.iva_enabled, quote.iva_rate,
    quote.subtotal, quote.iva_amount, quote.total, userId
  );
  const orderId = Number(info.lastInsertRowid);
  const ins = db.prepare(`
    INSERT INTO work_order_items (work_order_id, catalog_item_id, type, description, qty, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const it of items) {
    ins.run(orderId, it.catalog_item_id, it.type, it.description, it.qty, it.unit_price, it.line_total);
  }
  deductProducts(items, `Cobro cotización ${quote.number}`, 'work_order', orderId, userId);
  db.prepare(`UPDATE quotes SET status = 'convertida', updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(quote.id);
  return { id: orderId, number };
}

module.exports = { convertQuoteToOrder };
