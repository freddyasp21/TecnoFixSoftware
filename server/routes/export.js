/**
 * Exportación nativa a Excel (.xlsx) por módulo, usando ExcelJS.
 */
const express = require('express');
const ExcelJS = require('exceljs');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { PAYMENT_LABELS, ORDER_STATUS } = require('../utils/helpers');

const FINANCE_LABELS = {
  payroll: 'Trabajadores',
  supplies: 'Insumos, piezas y herramientas',
  savings: 'Ahorros e inversión',
  operation: 'Utilidad / operación',
};

const router = express.Router();
router.use(authRequired, requirePermission('reports.view'));

async function sendWorkbook(res, filename, builder) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tecno Fix';
  wb.created = new Date();
  await builder(wb);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
}

const MODULES = {
  clientes: () => {
    const rows = getDb().prepare('SELECT * FROM clients ORDER BY name').all();
    return {
      sheet: 'Clientes',
      columns: [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Nombre', key: 'name', width: 28 },
        { header: 'Cédula/RIF', key: 'document', width: 16 },
        { header: 'Teléfono', key: 'phone', width: 16 },
        { header: 'Correo', key: 'email', width: 24 },
        { header: 'Dirección', key: 'address', width: 32 },
        { header: 'Notas', key: 'notes', width: 28 },
        { header: 'Alta', key: 'created_at', width: 20 },
      ],
      rows,
    };
  },
  catalogo: () => {
    const rows = getDb().prepare('SELECT * FROM catalog_items ORDER BY type, name').all();
    return {
      sheet: 'Catalogo',
      columns: [
        { header: 'Código', key: 'code', width: 14 },
        { header: 'Tipo', key: 'type', width: 12 },
        { header: 'Nombre', key: 'name', width: 32 },
        { header: 'Descripción', key: 'description', width: 32 },
        { header: 'Precio USD', key: 'price_usd', width: 14 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Mínimo', key: 'min_stock', width: 10 },
        { header: 'Minutos', key: 'estimated_minutes', width: 12 },
        { header: 'Activo', key: 'active', width: 10 },
      ],
      rows,
    };
  },
  inventario: () => {
    const rows = getDb().prepare(`SELECT * FROM catalog_items WHERE type = 'product' ORDER BY name`).all();
    return {
      sheet: 'Inventario',
      columns: [
        { header: 'Código', key: 'code', width: 14 },
        { header: 'Producto', key: 'name', width: 32 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Mínimo', key: 'min_stock', width: 10 },
        { header: 'Precio USD', key: 'price_usd', width: 14 },
      ],
      rows,
    };
  },
  cotizaciones: () => {
    const rows = getDb().prepare(`
      SELECT q.*, c.name AS client_name FROM quotes q
      LEFT JOIN clients c ON c.id = q.client_id ORDER BY q.created_at DESC
    `).all();
    return {
      sheet: 'Cotizaciones',
      columns: [
        { header: 'Número', key: 'number', width: 12 },
        { header: 'Cliente', key: 'client_name', width: 24 },
        { header: 'Estado', key: 'status', width: 14 },
        { header: 'Tasa', key: 'rate_type', width: 10 },
        { header: 'Valor tasa', key: 'rate_value', width: 12 },
        { header: 'Subtotal USD', key: 'subtotal', width: 14 },
        { header: 'IVA', key: 'iva_amount', width: 12 },
        { header: 'Total USD', key: 'total', width: 12 },
        { header: 'Fecha', key: 'created_at', width: 20 },
      ],
      rows,
    };
  },
  ordenes: () => {
    const rows = getDb().prepare(`
      SELECT wo.*, c.name AS client_name, t.full_name AS technician_name
      FROM work_orders wo
      LEFT JOIN clients c ON c.id = wo.client_id
      LEFT JOIN users t ON t.id = wo.technician_id
      ORDER BY wo.received_at DESC
    `).all().map((r) => ({ ...r, status_label: ORDER_STATUS[r.status] || r.status }));
    return {
      sheet: 'Ordenes',
      columns: [
        { header: 'Número', key: 'number', width: 12 },
        { header: 'Cliente', key: 'client_name', width: 24 },
        { header: 'Estado', key: 'status_label', width: 18 },
        { header: 'Marca', key: 'device_brand', width: 14 },
        { header: 'Modelo', key: 'device_model', width: 18 },
        { header: 'Serial', key: 'serial_number', width: 18 },
        { header: 'Técnico', key: 'technician_name', width: 20 },
        { header: 'Total USD', key: 'total', width: 12 },
        { header: 'Ingreso', key: 'received_at', width: 20 },
        { header: 'Entrega', key: 'delivered_at', width: 20 },
      ],
      rows,
    };
  },
  caja: () => {
    const rows = getDb().prepare(`
      SELECT t.*, s.opened_at, c.name AS client_name
      FROM cash_transactions t
      JOIN cash_sessions s ON s.id = t.session_id
      LEFT JOIN clients c ON c.id = t.client_id
      ORDER BY t.created_at DESC
    `).all().map((r) => ({
      ...r,
      method_label: PAYMENT_LABELS[r.payment_method] || r.payment_method,
      type_label: r.type === 'income' ? 'Ingreso' : 'Egreso',
      finance_bucket: r.type === 'expense'
        ? (FINANCE_LABELS[r.finance_bucket] || 'Sin clasificar')
        : '—',
    }));
    return {
      sheet: 'Caja',
      columns: [
        { header: 'Fecha', key: 'created_at', width: 20 },
        { header: 'Tipo', key: 'type_label', width: 12 },
        { header: 'Método', key: 'method_label', width: 18 },
        { header: 'Monto', key: 'amount', width: 12 },
        { header: 'Equivalente USD', key: 'amount_usd', width: 16 },
        { header: 'Sobre financiero', key: 'finance_bucket', width: 18 },
        { header: 'Cliente', key: 'client_name', width: 24 },
        { header: 'Descripción', key: 'description', width: 32 },
      ],
      rows,
    };
  },
  usuarios: () => {
    const rows = getDb().prepare(`
      SELECT u.id, u.username, u.full_name, r.name AS role, u.active, u.created_at
      FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.full_name
    `).all();
    return {
      sheet: 'Usuarios',
      columns: [
        { header: 'Usuario', key: 'username', width: 16 },
        { header: 'Nombre', key: 'full_name', width: 24 },
        { header: 'Rol', key: 'role', width: 16 },
        { header: 'Activo', key: 'active', width: 10 },
        { header: 'Alta', key: 'created_at', width: 20 },
      ],
      rows,
    };
  },
  finanzas: () => {
    const rows = getDb().prepare(`
      SELECT t.created_at, t.type, t.payment_method, t.amount, t.amount_usd,
             t.finance_bucket, t.description, c.name AS client_name, wo.number AS order_number,
             w.full_name AS worker_name
      FROM cash_transactions t
      LEFT JOIN clients c ON c.id = t.client_id
      LEFT JOIN work_orders wo ON wo.id = t.work_order_id
      LEFT JOIN workers w ON w.id = t.worker_id
      ORDER BY t.created_at DESC
    `).all().map((r) => ({
      ...r,
      type_label: r.type === 'income' ? 'Ingreso' : 'Egreso',
      method_label: PAYMENT_LABELS[r.payment_method] || r.payment_method,
      bucket_label: r.type === 'expense'
        ? (FINANCE_LABELS[r.finance_bucket] || 'Sin clasificar')
        : 'Ingreso (se reparte en sobres)',
    }));
    return {
      sheet: 'Finanzas',
      columns: [
        { header: 'Fecha', key: 'created_at', width: 20 },
        { header: 'Tipo', key: 'type_label', width: 12 },
        { header: 'Método', key: 'method_label', width: 18 },
        { header: 'Monto', key: 'amount', width: 12 },
        { header: 'USD', key: 'amount_usd', width: 12 },
        { header: 'Sobre', key: 'bucket_label', width: 28 },
        { header: 'Cliente', key: 'client_name', width: 24 },
        { header: 'Orden', key: 'order_number', width: 12 },
        { header: 'Trabajador', key: 'worker_name', width: 22 },
        { header: 'Descripción', key: 'description', width: 32 },
      ],
      rows,
    };
  },
  trabajadores: () => {
    const rows = getDb().prepare(`
      SELECT full_name, document, phone, position, share_weight, active, created_at
      FROM workers ORDER BY active DESC, full_name
    `).all().map((r) => ({ ...r, active_label: r.active ? 'Activo' : 'Inactivo' }));
    return {
      sheet: 'Trabajadores',
      columns: [
        { header: 'Nombre', key: 'full_name', width: 24 },
        { header: 'Cédula', key: 'document', width: 16 },
        { header: 'Teléfono', key: 'phone', width: 16 },
        { header: 'Cargo', key: 'position', width: 18 },
        { header: 'Peso nómina', key: 'share_weight', width: 14 },
        { header: 'Estado', key: 'active_label', width: 12 },
        { header: 'Alta', key: 'created_at', width: 20 },
      ],
      rows,
    };
  },
  nomina: () => {
    const rows = getDb().prepare(`
      SELECT p.*, w.full_name AS worker_name
      FROM payroll_payments p
      JOIN workers w ON w.id = p.worker_id
      ORDER BY p.created_at DESC
    `).all().map((r) => ({
      ...r,
      kind_label: r.period_kind === 'q1' ? '1 al 15' : '16 al último',
    }));
    return {
      sheet: 'Nomina',
      columns: [
        { header: 'Fecha pago', key: 'created_at', width: 20 },
        { header: 'Trabajador', key: 'worker_name', width: 24 },
        { header: 'Quincena', key: 'kind_label', width: 14 },
        { header: 'Desde', key: 'period_from', width: 12 },
        { header: 'Hasta', key: 'period_to', width: 12 },
        { header: 'Días', key: 'days_worked', width: 8 },
        { header: 'Asignado USD', key: 'allocated_usd', width: 14 },
        { header: 'Pagado USD', key: 'amount_usd', width: 14 },
      ],
      rows,
    };
  },
};

router.get('/:module', async (req, res) => {
  const factory = MODULES[req.params.module];
  if (!factory) return res.status(404).json({ error: 'Módulo de exportación no válido' });
  const { sheet, columns, rows } = factory();
  await sendWorkbook(res, `tecnofix-${req.params.module}.xlsx`, async (wb) => {
    const ws = wb.addWorksheet(sheet);
    ws.columns = columns;
    styleHeader(ws.getRow(1));
    rows.forEach((r) => ws.addRow(r));
  });
});

module.exports = router;
