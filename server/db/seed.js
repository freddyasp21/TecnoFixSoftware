/**
 * Semilla inicial: roles, permisos granulares, usuario admin y ajustes del taller.
 * Se ejecuta una sola vez cuando la BD está vacía.
 */
const bcrypt = require('bcryptjs');

const PERMISSIONS = [
  ['dashboard.view', 'dashboard', 'Ver panel principal'],
  ['users.manage', 'usuarios', 'Gestionar usuarios y roles'],
  ['rates.view', 'tasas', 'Consultar tasas de cambio'],
  ['rates.manage', 'tasas', 'Registrar y editar tasas de cambio'],
  ['catalog.view', 'catalogo', 'Consultar catálogo'],
  ['catalog.manage', 'catalogo', 'Crear y editar productos/servicios'],
  ['quotes.view', 'cotizaciones', 'Consultar cotizaciones'],
  ['quotes.manage', 'cotizaciones', 'Crear y editar cotizaciones'],
  ['quotes.delete', 'cotizaciones', 'Eliminar cotizaciones'],
  ['orders.view', 'ordenes', 'Consultar órdenes de trabajo'],
  ['orders.manage', 'ordenes', 'Crear y editar órdenes'],
  ['orders.delete', 'ordenes', 'Eliminar órdenes de trabajo'],
  ['calendar.view', 'calendario', 'Ver calendario operativo'],
  ['calendar.manage', 'calendario', 'Marcar días laborados'],
  ['ops.manage', 'operacion', 'Fijar fecha de inicio y cerrar el día operativo'],
  ['inventory.view', 'inventario', 'Consultar inventario'],
  ['inventory.manage', 'inventario', 'Ajustar stock y kardex'],
  ['clients.view', 'clientes', 'Consultar clientes'],
  ['clients.manage', 'clientes', 'Crear y editar clientes'],
  ['cash.view', 'caja', 'Consultar caja'],
  ['cash.manage', 'caja', 'Abrir/cerrar caja y registrar movimientos'],
  ['finance.view', 'finanzas', 'Consultar gestión financiera'],
  ['finance.manage', 'finanzas', 'Ajustar reglas y clasificar egresos'],
  ['workers.view', 'trabajadores', 'Consultar trabajadores y nómina'],
  ['workers.manage', 'trabajadores', 'Editar plantilla, asistencia y pagar nómina'],
  ['alerts.view', 'alertas', 'Ver alertas operativas del taller'],
  ['reports.view', 'reportes', 'Ver reportes y exportar Excel'],
  ['settings.manage', 'configuracion', 'Ajustes, IVA y actualizaciones'],
];

/** Permisos por rol (el Administrador recibe todos automáticamente). */
const ROLE_PERMS = {
  Gerente: [
    'dashboard.view', 'rates.view',
    'catalog.view', 'catalog.manage',
    'quotes.view', 'quotes.manage', 'quotes.delete',
    'orders.view', 'orders.manage', 'orders.delete',
    'calendar.view', 'calendar.manage', 'ops.manage',
    'inventory.view', 'inventory.manage',
    'clients.view', 'clients.manage',
    'cash.view', 'cash.manage',
    'finance.view', 'finance.manage',
    'workers.view', 'workers.manage',
    'alerts.view', 'reports.view',
  ],
  Supervisor: [
    'dashboard.view', 'rates.view',
    'catalog.view', 'catalog.manage',
    'quotes.view', 'quotes.manage',
    'orders.view', 'orders.manage',
    'calendar.view', 'calendar.manage',
    'inventory.view', 'inventory.manage',
    'clients.view', 'clients.manage',
    'alerts.view', 'reports.view',
  ],
  Tecnico: [
    'dashboard.view', 'rates.view', 'catalog.view', 'catalog.manage',
    'quotes.view', 'orders.view', 'orders.manage',
    'calendar.view', 'calendar.manage', 'inventory.view',
    'clients.view', 'clients.manage', 'alerts.view',
  ],
  Cajero: [
    'dashboard.view', 'rates.view',
    'catalog.view', 'quotes.view', 'quotes.manage',
    'orders.view', 'orders.manage', 'calendar.view', 'inventory.view',
    'clients.view', 'clients.manage',
    'cash.view', 'cash.manage',
    'alerts.view', 'reports.view',
  ],
};

const ROLE_DEFS = [
  ['Administrador', 'Acceso total al sistema'],
  ['Tecnico', 'Gestión de órdenes, catálogo y calendario'],
  ['Cajero', 'Caja, cotizaciones y clientes. Sin borrar órdenes ni editar inventario'],
  ['Gerente', 'Opera el taller: caja, finanzas y nómina. Sin usuarios, importación ni ajustes'],
  ['Supervisor', 'Supervisa órdenes, cotizaciones, inventario y catálogo'],
];

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name, description, is_system) VALUES (?, ?, 1)');
  for (const [name, description] of ROLE_DEFS) insertRole.run(name, description);

  const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (code, module, description) VALUES (?, ?, ?)');
  for (const [code, module, description] of PERMISSIONS) {
    insertPerm.run(code, module, description);
  }

  const roles = db.prepare('SELECT id, name FROM roles').all();
  const perms = db.prepare('SELECT id, code FROM permissions').all();
  const permByCode = Object.fromEntries(perms.map((p) => [p.code, p.id]));
  const link = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

  const tx = db.transaction(() => {
    for (const role of roles) {
      const codes = role.name === 'Administrador'
        ? PERMISSIONS.map((p) => p[0])
        : (ROLE_PERMS[role.name] || []);
      for (const code of codes) {
        if (permByCode[code]) link.run(role.id, permByCode[code]);
      }
    }
  });
  tx();

  const adminRoleId = roles.find((r) => r.name === 'Administrador').id;
  const hash = bcrypt.hashSync('Admin123!', 10);
  db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role_id, active)
    VALUES (?, ?, ?, ?, 1)
  `).run('admin', hash, 'Administrador', adminRoleId);

  const set = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const defaults = {
    shop_name: 'Tecno Fix',
    shop_subtitle: 'Software para talleres',
    shop_phone: '',
    shop_address: '',
    shop_rif: '',
    iva_enabled: '1',
    iva_rate: '16',
    github_owner: 'freddyasp21',
    github_repo: 'TecnoFixSoftware',
    jwt_secret: require('crypto').randomBytes(32).toString('hex'),
    quote_seq: '0',
    order_seq: '0',
    sale_seq: '0',
    finance_pct_payroll: '40',
    finance_pct_supplies: '30',
    finance_pct_savings: '20',
    salary_increment_pct_per_year: '5',
    app_version: require('../../package.json').version,
  };
  for (const [k, v] of Object.entries(defaults)) set.run(k, v);
}

module.exports = { seed, ROLE_DEFS, ROLE_PERMS };
