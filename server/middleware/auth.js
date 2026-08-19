/**
 * Autenticación JWT + control de acceso por permisos (RBAC).
 * El token viaja en Authorization: Bearer <jwt>.
 */
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { getSetting } = require('../utils/helpers');

function getSecret() {
  return getSetting(getDb(), 'jwt_secret', 'tecno-fix-dev-secret');
}

function loadUser(id) {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.active, u.role_id,
           r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
  `).get(id);
  if (!user) return null;
  const permissions = db.prepare(`
    SELECT p.code FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(user.role_id).map((p) => p.code);
  return { ...user, permissions };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    getSecret(),
    { expiresIn: '14h' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sesión requerida' });
  try {
    const payload = jwt.verify(token, getSecret());
    const user = loadUser(payload.sub);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requirePermission(code) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sesión requerida' });
    if (req.user.role === 'Administrador' || req.user.permissions.includes(code)) {
      return next();
    }
    return res.status(403).json({ error: 'No tiene permiso para esta acción' });
  };
}

module.exports = { loadUser, signToken, authRequired, requirePermission };
