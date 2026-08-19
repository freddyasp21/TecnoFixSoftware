/**
 * Gestión de usuarios, roles y restablecimiento de contraseñas (solo admin / users.manage).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requirePermission('users.manage'));

router.get('/', (_req, res) => {
  const users = getDb().prepare(`
    SELECT u.id, u.username, u.full_name, u.active, u.role_id, r.name AS role, u.created_at
    FROM users u JOIN roles r ON r.id = u.role_id
    ORDER BY u.full_name
  `).all();
  res.json(users);
});

router.get('/roles', (_req, res) => {
  const db = getDb();
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all();
  const perms = db.prepare('SELECT * FROM permissions ORDER BY module, code').all();
  const links = db.prepare('SELECT role_id, permission_id FROM role_permissions').all();
  const byRole = {};
  for (const l of links) {
    (byRole[l.role_id] ||= []).push(l.permission_id);
  }
  res.json({
    roles: roles.map((r) => ({ ...r, permission_ids: byRole[r.id] || [] })),
    permissions: perms,
  });
});

router.put('/roles/:id/permissions', (req, res) => {
  const db = getDb();
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
  const ids = Array.isArray(req.body.permission_ids) ? req.body.permission_ids : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
    const ins = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    for (const pid of ids) ins.run(role.id, pid);
  });
  tx();
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { username, password, full_name, role_id } = req.body || {};
  if (!username || !password || !full_name || !role_id) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const info = getDb().prepare(`
      INSERT INTO users (username, password_hash, full_name, role_id, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(username.trim(), bcrypt.hashSync(password, 10), full_name.trim(), role_id);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { full_name, role_id, active } = req.body || {};
  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      role_id = COALESCE(?, role_id),
      active = COALESCE(?, active),
      updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(full_name ?? null, role_id ?? null, active == null ? null : (active ? 1 : 0), user.id);
  res.json({ ok: true });
});

/** Restablecimiento administrativo (no pide la clave anterior). */
router.post('/:id/reset-password', (req, res) => {
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(bcrypt.hashSync(new_password, 10), user.id);
  res.json({ ok: true });
});

module.exports = router;
