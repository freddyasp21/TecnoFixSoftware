-- =============================================================================
-- Tecno Fix — Esquema SQLite (ACID, WAL). Precios maestros en USD.
-- Las tasas BCV / Euro / USDT convierten a Bolívares en cotizaciones y caja.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- RBAC
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  module      TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- -----------------------------------------------------------------------------
-- Configuración clave-valor (IVA, GitHub, datos del taller, secretos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- -----------------------------------------------------------------------------
-- Tasas de cambio diarias (Bs por 1 USD / 1 EUR / 1 USDT según el caso)
-- bcv  = Bs por 1 USD (tasa oficial BCV)
-- euro = Bs por 1 EUR
-- usdt = Bs por 1 USDT (referencia Binance)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exchange_rates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rate_date  TEXT NOT NULL UNIQUE,
  bcv        REAL NOT NULL CHECK (bcv > 0),
  euro       REAL NOT NULL CHECK (euro > 0),
  usdt       REAL NOT NULL CHECK (usdt > 0),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  document   TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_document ON clients(document);

-- -----------------------------------------------------------------------------
-- Catálogo maestro: productos (con stock) y servicios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  type               TEXT NOT NULL CHECK (type IN ('product','service')),
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  price_usd          REAL NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  stock              REAL NOT NULL DEFAULT 0,
  min_stock          REAL NOT NULL DEFAULT 0,
  estimated_minutes  INTEGER DEFAULT 0,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_type ON catalog_items(type);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON catalog_items(name);

-- -----------------------------------------------------------------------------
-- Cotizaciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT NOT NULL UNIQUE,
  client_id    INTEGER REFERENCES clients(id),
  status       TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (status IN ('borrador','enviada','aprobada','rechazada','convertida')),
  rate_type    TEXT NOT NULL DEFAULT 'bcv' CHECK (rate_type IN ('bcv','euro','usdt')),
  rate_value   REAL NOT NULL DEFAULT 1,
  iva_enabled  INTEGER NOT NULL DEFAULT 0,
  iva_rate     REAL NOT NULL DEFAULT 16,
  subtotal     REAL NOT NULL DEFAULT 0,
  iva_amount   REAL NOT NULL DEFAULT 0,
  total        REAL NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  catalog_item_id INTEGER REFERENCES catalog_items(id),
  type            TEXT NOT NULL CHECK (type IN ('product','service')),
  description     TEXT NOT NULL,
  qty             REAL NOT NULL DEFAULT 1,
  unit_price      REAL NOT NULL DEFAULT 0,
  line_total      REAL NOT NULL DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- Órdenes de trabajo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            TEXT NOT NULL UNIQUE,
  quote_id          INTEGER REFERENCES quotes(id),
  client_id         INTEGER REFERENCES clients(id),
  technician_id     INTEGER REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'recibido'
                      CHECK (status IN (
                        'recibido','diagnostico','esperando_repuesto',
                        'reparacion','listo','entregado','cancelado'
                      )),
  device_brand      TEXT,
  device_model      TEXT,
  serial_number     TEXT,
  device_password   TEXT,
  fault_description TEXT,
  physical_notes    TEXT,
  rate_type         TEXT NOT NULL DEFAULT 'bcv' CHECK (rate_type IN ('bcv','euro','usdt')),
  rate_value        REAL NOT NULL DEFAULT 1,
  iva_enabled       INTEGER NOT NULL DEFAULT 0,
  iva_rate          REAL NOT NULL DEFAULT 16,
  subtotal          REAL NOT NULL DEFAULT 0,
  iva_amount        REAL NOT NULL DEFAULT 0,
  total             REAL NOT NULL DEFAULT 0,
  received_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ready_at          TEXT,
  delivered_at      TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_received ON work_orders(received_at);

CREATE TABLE IF NOT EXISTS work_order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id   INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  catalog_item_id INTEGER REFERENCES catalog_items(id),
  type            TEXT NOT NULL CHECK (type IN ('product','service')),
  description     TEXT NOT NULL,
  qty             REAL NOT NULL DEFAULT 1,
  unit_price      REAL NOT NULL DEFAULT 0,
  line_total      REAL NOT NULL DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- Movimientos de inventario (kardex)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_item_id INTEGER NOT NULL REFERENCES catalog_items(id),
  type            TEXT NOT NULL CHECK (type IN ('in','out','adjustment')),
  qty             REAL NOT NULL,
  reason          TEXT,
  ref_type        TEXT,
  ref_id          INTEGER,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- -----------------------------------------------------------------------------
-- Caja: sesiones diarias y movimientos
-- payment_method: usd_cash | bs_cash | bs_mobile | usdt
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  closed_at     TEXT,
  opened_by     INTEGER REFERENCES users(id),
  closed_by     INTEGER REFERENCES users(id),
  open_usd      REAL NOT NULL DEFAULT 0,
  open_bs       REAL NOT NULL DEFAULT 0,
  open_usdt     REAL NOT NULL DEFAULT 0,
  close_usd     REAL,
  close_bs      REAL,
  close_usdt    REAL,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);

CREATE TABLE IF NOT EXISTS cash_transactions (
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
  finance_bucket  TEXT CHECK (finance_bucket IS NULL OR finance_bucket IN ('payroll','supplies','savings','operation'))
);

-- Venta directa (mostrador) ligada a caja e inventario
CREATE TABLE IF NOT EXISTS sales (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        TEXT NOT NULL UNIQUE,
  client_id     INTEGER REFERENCES clients(id),
  session_id    INTEGER REFERENCES cash_sessions(id),
  payment_method TEXT NOT NULL,
  subtotal      REAL NOT NULL DEFAULT 0,
  iva_amount    REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  catalog_item_id INTEGER REFERENCES catalog_items(id),
  description     TEXT NOT NULL,
  qty             REAL NOT NULL,
  unit_price      REAL NOT NULL,
  line_total      REAL NOT NULL
);

-- -----------------------------------------------------------------------------
-- Calendario operativo: marcar días laborados
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_days (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT NOT NULL UNIQUE,
  worked  INTEGER NOT NULL DEFAULT 1,
  notes   TEXT
);
