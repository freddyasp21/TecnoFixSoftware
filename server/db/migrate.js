/**
 * Migraciones ligeras para bases ya creadas (ALTER + permisos nuevos).
 */
const { setSetting } = require('../utils/helpers');
const { ROLE_DEFS, ROLE_PERMS } = require('./seed');

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

function ensureRole(db, name, description) {
  db.prepare('INSERT OR IGNORE INTO roles (name, description, is_system) VALUES (?, ?, 1)').run(name, description);
  db.prepare('UPDATE roles SET description = ? WHERE name = ? AND (description IS NULL OR description = \'\')').run(description, name);
}

function ensureColumn(db, table, column, ddl) {
  if (!columnExists(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function allowSalaryFinanceBucket(db) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cash_transactions'`).get();
  const sql = row?.sql || '';
  if (sql.includes("'salary'")) return;
  const cols = db.prepare('PRAGMA table_info(cash_transactions)').all().map((c) => c.name);
  if (!cols.includes('finance_bucket')) return;
  const copy = [
    'id', 'session_id', 'type', 'payment_method', 'amount', 'amount_usd', 'rate_type', 'rate_value',
    'client_id', 'work_order_id', 'quote_id', 'description', 'created_by', 'created_at', 'finance_bucket', 'worker_id',
  ].filter((c) => cols.includes(c));
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE cash_transactions_new (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      INTEGER NOT NULL REFERENCES cash_sessions(id),
      type            TEXT NOT NULL CHECK (type IN ('income','expense')),
      payment_method  TEXT NOT NULL CHECK (payment_method IN ('usd_cash','bs_cash','bs_mobile','usdt')),
      amount          REAL NOT NULL CHECK (amount > 0),
      amount_usd      REAL NOT NULL DEFAULT 0,
      rate_type       TEXT,
      rate_value      REAL,
      client_id       INTEGER REFERENCES clients(id),
      work_order_id   INTEGER REFERENCES work_orders(id),
      quote_id        INTEGER REFERENCES quotes(id),
      description     TEXT,
      created_by      INTEGER REFERENCES users(id),
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      finance_bucket  TEXT CHECK (finance_bucket IS NULL OR finance_bucket IN ('payroll','supplies','savings','operation','salary')),
      worker_id       INTEGER
    );
    INSERT INTO cash_transactions_new (${copy.join(', ')})
    SELECT ${copy.join(', ')} FROM cash_transactions;
    DROP TABLE cash_transactions;
    ALTER TABLE cash_transactions_new RENAME TO cash_transactions;
  `);
  db.exec('PRAGMA foreign_keys = ON');
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

  for (const [name, description] of ROLE_DEFS) ensureRole(db, name, description);
  for (const [name, codes] of Object.entries(ROLE_PERMS)) {
    for (const code of codes) linkRoles(db, code, [name]);
  }

  const has = db.prepare('SELECT 1 FROM settings WHERE key = ?');
  if (!has.get('finance_pct_payroll')) setSetting(db, 'finance_pct_payroll', '40');
  if (!has.get('finance_pct_supplies')) setSetting(db, 'finance_pct_supplies', '30');
  if (!has.get('finance_pct_savings')) setSetting(db, 'finance_pct_savings', '20');
  if (!has.get('salary_increment_pct_per_year')) setSetting(db, 'salary_increment_pct_per_year', '5');

  ensureColumn(db, 'workers', 'hired_at', 'hired_at TEXT');
  ensureColumn(db, 'workers', 'base_salary_usd', 'base_salary_usd REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'payroll_payments', 'kind', "kind TEXT NOT NULL DEFAULT 'commission'");
  allowSalaryFinanceBucket(db);

  addPermission(db, 'ops.manage', 'operacion', 'Fijar fecha de inicio y cerrar el día operativo');
  unlinkRoles(db, 'ops.manage', ['Tecnico', 'Cajero', 'Supervisor']);
  linkRoles(db, 'ops.manage', ['Gerente']);

  ensureColumn(db, 'work_orders', 'cashier_id', 'cashier_id INTEGER REFERENCES users(id)');
  db.prepare(`
    UPDATE work_orders SET cashier_id = created_by
    WHERE cashier_id IS NULL AND created_by IS NOT NULL
  `).run();

  if (!has.get('iva_on_by_default')) {
    setSetting(db, 'iva_enabled', '1');
    setSetting(db, 'iva_on_by_default', '1');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS business_days (
      day         TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      opened_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      opened_by   INTEGER REFERENCES users(id),
      closed_at   TEXT,
      closed_by   INTEGER REFERENCES users(id),
      notes       TEXT
    );
  `);
}

module.exports = { migrate };
