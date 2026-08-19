/**
 * Migraciones ligeras para bases ya creadas (ALTER + permisos nuevos).
 */
const { setSetting } = require('../utils/helpers');

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrate(db) {
  if (!columnExists(db, 'cash_transactions', 'finance_bucket')) {
    db.exec('ALTER TABLE cash_transactions ADD COLUMN finance_bucket TEXT');
  }

  const insertPerm = db.prepare(`
    INSERT INTO permissions (code, module, description)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = ?)
  `);
  insertPerm.run('finance.view', 'finanzas', 'Consultar gestión financiera', 'finance.view');
  insertPerm.run('finance.manage', 'finanzas', 'Ajustar reglas y clasificar egresos', 'finance.manage');

  const link = db.prepare(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE p.code = ?
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_id = p.id
      )
  `);
  link.run('finance.view');

  const linkManage = db.prepare(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE p.code = ?
      AND r.name IN ('Administrador', 'Cajero')
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_id = p.id
      )
  `);
  linkManage.run('finance.manage');

  const has = db.prepare('SELECT 1 FROM settings WHERE key = ?');
  if (!has.get('finance_pct_payroll')) setSetting(db, 'finance_pct_payroll', '40');
  if (!has.get('finance_pct_supplies')) setSetting(db, 'finance_pct_supplies', '30');
  if (!has.get('finance_pct_savings')) setSetting(db, 'finance_pct_savings', '20');
}

module.exports = { migrate };
