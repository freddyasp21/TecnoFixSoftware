/**
 * Conexión SQLite nativa (módulo `node:sqlite` de Node 22+).
 * Sin addons C++: instala en Windows sin Visual Studio ni prebuilds.
 * WAL + foreign_keys para concurrencia local e integridad referencial.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function resolveDataDir() {
  if (process.env.TECNOFIX_DATA_DIR) return process.env.TECNOFIX_DATA_DIR;
  if (process.env.TECNOFIX_USER_DATA) {
    return path.join(process.env.TECNOFIX_USER_DATA, 'data');
  }
  return path.join(__dirname, '..', '..', 'data');
}

function wrap(db) {
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = originalPrepare(sql);
    const originalRun = stmt.run.bind(stmt);
    stmt.run = (...args) => {
      const info = originalRun(...args);
      return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
    };
    return stmt;
  };
  db.pragma = (sql) => db.exec(`PRAGMA ${sql}`);
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  };
  return db;
}

function getDb() {
  if (global.__tecnoFixDb) return global.__tecnoFixDb;

  const dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'tecnofix.db');

  const db = wrap(new DatabaseSync(dbPath));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  global.__tecnoFixDb = db;
  return db;
}

module.exports = { getDb, resolveDataDir };
