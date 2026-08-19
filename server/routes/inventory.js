const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { applyStock } = require('../services/inventory');

const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('inventory.view'), (_req, res) => {
  const items = getDb().prepare(`
    SELECT * FROM catalog_items WHERE type = 'product' ORDER BY name
  `).all();
  res.json(items);
});

router.get('/movements', requirePermission('inventory.view'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const rows = getDb().prepare(`
    SELECT m.*, c.code, c.name, u.full_name AS created_by_name
    FROM inventory_movements m
    JOIN catalog_items c ON c.id = m.catalog_item_id
    LEFT JOIN users u ON u.id = m.created_by
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

router.post('/adjust', requirePermission('inventory.manage'), (req, res) => {
  const { catalog_item_id, stock, reason } = req.body || {};
  if (!catalog_item_id || stock == null) {
    return res.status(400).json({ error: 'Ítem y nuevo stock son obligatorios' });
  }
  try {
    applyStock(
      getDb(), catalog_item_id, Number(stock), 'adjustment',
      reason || 'Ajuste manual', 'adjustment', null, req.user.id
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/in', requirePermission('inventory.manage'), (req, res) => {
  const { catalog_item_id, qty, reason } = req.body || {};
  if (!catalog_item_id || !(Number(qty) > 0)) {
    return res.status(400).json({ error: 'Ítem y cantidad son obligatorios' });
  }
  try {
    applyStock(getDb(), catalog_item_id, Number(qty), 'in', reason || 'Entrada', 'purchase', null, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
