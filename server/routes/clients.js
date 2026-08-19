const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', requirePermission('clients.view'), (req, res) => {
  const q = req.query.q;
  let sql = 'SELECT * FROM clients WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (name LIKE ? OR document LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY name';
  res.json(getDb().prepare(sql).all(...params));
});

router.get('/:id', requirePermission('clients.view'), (req, res) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  const orders = db.prepare(`
    SELECT id, number, status, device_brand, device_model, serial_number, total, received_at, delivered_at
    FROM work_orders WHERE client_id = ? ORDER BY received_at DESC
  `).all(client.id);
  const quotes = db.prepare(`
    SELECT id, number, status, total, created_at FROM quotes WHERE client_id = ? ORDER BY created_at DESC
  `).all(client.id);
  res.json({ client, orders, quotes });
});

router.post('/', requirePermission('clients.manage'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = getDb().prepare(`
    INSERT INTO clients (name, document, phone, email, address, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(b.name.trim(), b.document || '', b.phone || '', b.email || '', b.address || '', b.notes || '');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', requirePermission('clients.manage'), (req, res) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  const b = req.body || {};
  db.prepare(`
    UPDATE clients SET
      name = COALESCE(?, name),
      document = COALESCE(?, document),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      address = COALESCE(?, address),
      notes = COALESCE(?, notes),
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    b.name ?? null, b.document ?? null, b.phone ?? null,
    b.email ?? null, b.address ?? null, b.notes ?? null, client.id
  );
  res.json({ ok: true });
});

module.exports = router;
