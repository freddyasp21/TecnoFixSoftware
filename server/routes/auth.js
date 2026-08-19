/**
 * Login, perfil y cambio de contraseña (bcrypt).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { loadUser, signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  if (!row || !row.active) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const user = loadUser(row.id);
  res.json({ token: signToken(user), user });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.put('/password', authRequired, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password || '', row.password_hash)) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
