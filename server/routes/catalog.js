const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('catalog.view'), (req, res) => {
  const { type, q } = req.query;
  let sql = 'SELECT * FROM catalog_items WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (q) {
    sql += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY type, name';
  res.json(getDb().prepare(sql).all(...params));
});

router.get('/search', requirePermission('catalog.view'), (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const rows = getDb().prepare(`
    SELECT id, type, code, name, price_usd, stock, estimated_minutes
    FROM catalog_items
    WHERE active = 1 AND (name LIKE ? OR code LIKE ?)
    ORDER BY name LIMIT 20
  `).all(q, q);
  res.json(rows);
});

router.post('/', requirePermission('catalog.manage'), (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name || !b.type) {
    return res.status(400).json({ error: 'Código, nombre y tipo son obligatorios' });
  }
  try {
    const info = getDb().prepare(`
      INSERT INTO catalog_items
        (type, code, name, description, price_usd, stock, min_stock, estimated_minutes, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      b.type, b.code.trim(), b.name.trim(), b.description || '',
      Number(b.price_usd) || 0,
      b.type === 'product' ? Number(b.stock) || 0 : 0,
      Number(b.min_stock) || 0,
      Number(b.estimated_minutes) || 0
    );
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un ítem con ese código' });
    }
    throw err;
  }
});

router.put('/:id', requirePermission('catalog.manage'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });
  const b = req.body || {};
  db.prepare(`
    UPDATE catalog_items SET
      type = COALESCE(?, type),
      code = COALESCE(?, code),
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price_usd = COALESCE(?, price_usd),
      min_stock = COALESCE(?, min_stock),
      estimated_minutes = COALESCE(?, estimated_minutes),
      active = COALESCE(?, active),
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    b.type ?? null, b.code ?? null, b.name ?? null, b.description ?? null,
    b.price_usd == null ? null : Number(b.price_usd),
    b.min_stock == null ? null : Number(b.min_stock),
    b.estimated_minutes == null ? null : Number(b.estimated_minutes),
    b.active == null ? null : (b.active ? 1 : 0),
    item.id
  );
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('catalog.manage'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });
  db.transaction(() => {
    db.prepare('UPDATE quote_items SET catalog_item_id = NULL WHERE catalog_item_id = ?').run(item.id);
    db.prepare('UPDATE work_order_items SET catalog_item_id = NULL WHERE catalog_item_id = ?').run(item.id);
    db.prepare('UPDATE sale_items SET catalog_item_id = NULL WHERE catalog_item_id = ?').run(item.id);
    db.prepare('DELETE FROM inventory_movements WHERE catalog_item_id = ?').run(item.id);
    db.prepare('DELETE FROM catalog_items WHERE id = ?').run(item.id);
  })();
  res.json({ ok: true });
});

module.exports = router;
