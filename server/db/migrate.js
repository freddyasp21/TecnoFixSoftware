/**
 * Migraciones ligeras para bases ya creadas (ALTER + permisos nuevos).
 */
const { setSetting } = require('../utils/helpers');

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function addPermission(db, code, module, description) {
  db.prepare(`
    INSERT INTO permissions (code, module, description)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = ?)
  `).run(code, module, description, code);
}

function linkAllRoles(db, code) {
  db.prepare(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE p.code = ?
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_id = p.id
      )
  `).run(code);
}

function unlinkRoles(db, code, names) {
  db.prepare(`
    DELETE FROM role_permissions
    WHERE permission_id = (SELECT id FROM permissions WHERE code = ?)
      AND role_id IN (SELECT id FROM roles WHERE name IN (${names.map(() => '?').join(',')}))
  `).run(code, ...names);
}

function linkRoles(db, code, names) {
  db.prepare(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE p.code = ?
      AND r.name IN (${names.map(() => '?').join(',')})
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_id = p.id
      )
  `).run(code, ...names);
}

function migrate(db) {
  if (!columnExists(db, 'cash_transactions', 'finance_bucket')) {
    db.exec('ALTER TABLE cash_transactions ADD COLUMN finance_bucket TEXT');
  }
  if (!columnExists(db, 'cash_transactions', 'worker_id')) {
    db.exec('ALTER TABLE cash_transactions ADD COLUMN worker_id INTEGER');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS workers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER REFERENCES users(id),
      full_name     TEXT NOT NULL,
      document      TEXT,
      phone         TEXT,
      position      TEXT,
      share_weight  REAL NOT NULL DEFAULT 1 CHECK (share_weight > 0),
      active        INTEGER NOT NULL DEFAULT 1,
      notes         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS worker_attendance (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id  INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      day        TEXT NOT NULL,
      worked     INTEGER NOT NULL DEFAULT 1,
      notes      TEXT,
      UNIQUE(worker_id, day)
    );
    CREATE TABLE IF NOT EXISTS payroll_payments (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id            INTEGER NOT NULL REFERENCES workers(id),
      period_from          TEXT NOT NULL,
      period_to            TEXT NOT NULL,
      period_kind          TEXT NOT NULL CHECK (period_kind IN ('q1','q2')),
      days_worked          INTEGER NOT NULL DEFAULT 0,
      allocated_usd        REAL NOT NULL DEFAULT 0,
      amount_usd           REAL NOT NULL CHECK (amount_usd > 0),
      cash_transaction_id  INTEGER REFERENCES cash_transactions(id),
      created_by           INTEGER REFERENCES users(id),
      created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_day ON worker_attendance(day);
    CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_payments(period_from, period_to);
  `);

  addPermission(db, 'finance.view', 'finanzas', 'Consultar gestión financiera');
  addPermission(db, 'finance.manage', 'finanzas', 'Ajustar reglas y clasificar egresos');
  addPermission(db, 'workers.view', 'trabajadores', 'Consultar trabajadores y nómina');
  addPermission(db, 'workers.manage', 'trabajadores', 'Editar plantilla, asistencia y pagar nómina');
  addPermission(db, 'alerts.view', 'alertas', 'Ver alertas operativas del taller');

  linkAllRoles(db, 'alerts.view');
  linkAllRoles(db, 'rates.view');
  linkRoles(db, 'finance.view', ['Administrador']);
  linkRoles(db, 'finance.manage', ['Administrador']);
  linkRoles(db, 'workers.view', ['Administrador']);
  linkRoles(db, 'workers.manage', ['Administrador']);
  unlinkRoles(db, 'rates.manage', ['Tecnico', 'Cajero']);
  unlinkRoles(db, 'finance.view', ['Tecnico', 'Cajero']);
  unlinkRoles(db, 'finance.manage', ['Tecnico', 'Cajero']);
  unlinkRoles(db, 'workers.view', ['Tecnico', 'Cajero']);
  unlinkRoles(db, 'workers.manage', ['Tecnico', 'Cajero']);

  const has = db.prepare('SELECT 1 FROM settings WHERE key = ?');
  if (!has.get('finance_pct_payroll')) setSetting(db, 'finance_pct_payroll', '40');
  if (!has.get('finance_pct_supplies')) setSetting(db, 'finance_pct_supplies', '30');
  if (!has.get('finance_pct_savings')) setSetting(db, 'finance_pct_savings', '20');
}

module.exports = { migrate };
