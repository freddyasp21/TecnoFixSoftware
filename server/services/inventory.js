/**
 * Servicio de inventario: descuenta/restaura stock en una transacción ACID.
 */
const { getDb } = require('../db/database');

function applyStock(db, catalogItemId, qty, type, reason, refType, refId, userId) {
  if (!catalogItemId || !qty) return;
  const item = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(catalogItemId);
  if (!item || item.type !== 'product') return;

  let next = item.stock;
  if (type === 'out') next = item.stock - qty;
  else if (type === 'in') next = item.stock + qty;
  else next = qty; // adjustment: qty es el nuevo saldo

  if (type === 'out' && next < 0) {
    const err = new Error(`Stock insuficiente para ${item.name} (disponible: ${item.stock})`);
    err.status = 400;
    throw err;
  }

  const delta = type === 'adjustment' ? (next - item.stock) : (type === 'out' ? -qty : qty);
  db.prepare(`UPDATE catalog_items SET stock = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(next, item.id);
  db.prepare(`
    INSERT INTO inventory_movements (catalog_item_id, type, qty, reason, ref_type, ref_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, type === 'adjustment' ? 'adjustment' : type, Math.abs(delta), reason, refType, refId, userId);
}

function deductProducts(items, reason, refType, refId, userId) {
  const db = getDb();
  for (const it of items) {
    if (it.type === 'product' && it.catalog_item_id) {
      applyStock(db, it.catalog_item_id, Number(it.qty) || 0, 'out', reason, refType, refId, userId);
    }
  }
}

function restoreProducts(items, reason, refType, refId, userId) {
  const db = getDb();
  for (const it of items) {
    if (it.type === 'product' && it.catalog_item_id) {
      applyStock(db, it.catalog_item_id, Number(it.qty) || 0, 'in', reason, refType, refId, userId);
    }
  }
}

module.exports = { applyStock, deductProducts, restoreProducts };
