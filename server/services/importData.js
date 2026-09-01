/**
 * Importación de maestros (clientes, catálogo, trabajadores, órdenes) desde JSON o Excel.
 * El orden de columnas documentado coincide con las plantillas y con la exportación.
 */
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { nextNumber, ORDER_STATUS, round2, getSetting, setSetting, todayRate, localDate } = require('../utils/helpers');

const MODULES = {
  clientes: {
    key: 'clientes',
    label: 'Clientes',
    sheetNames: ['clientes', 'cliente', 'clients'],
    columns: [
      { key: 'name', header: 'Nombre', required: true, aliases: ['nombre', 'cliente', 'name'] },
      { key: 'document', header: 'Cédula/RIF', aliases: ['cedula', 'rif', 'cedularif', 'documento', 'document', 'ci'] },
      { key: 'phone', header: 'Teléfono', aliases: ['telefono', 'phone', 'celular', 'movil'] },
      { key: 'email', header: 'Correo', aliases: ['correo', 'email', 'mail'] },
      { key: 'address', header: 'Dirección', aliases: ['direccion', 'address'] },
      { key: 'notes', header: 'Notas', aliases: ['notas', 'notes', 'observaciones'] },
    ],
  },
  catalogo: {
    key: 'catalogo',
    label: 'Catálogo',
    sheetNames: ['catalogo', 'catalog', 'inventario', 'productos'],
    columns: [
      { key: 'code', header: 'Código', required: true, aliases: ['codigo', 'code', 'sku'] },
      { key: 'type', header: 'Tipo', required: true, aliases: ['tipo', 'type'] },
      { key: 'name', header: 'Nombre', required: true, aliases: ['nombre', 'producto', 'servicio', 'name'] },
      { key: 'description', header: 'Descripción', aliases: ['descripcion', 'description', 'detalle'] },
      { key: 'price_usd', header: 'Precio USD', aliases: ['preciousd', 'precio', 'price', 'priceusd'] },
      { key: 'stock', header: 'Stock', aliases: ['stock', 'existencia', 'cantidad'] },
      { key: 'min_stock', header: 'Mínimo', aliases: ['minimo', 'minstock', 'stockminimo'] },
      { key: 'estimated_minutes', header: 'Minutos', aliases: ['minutos', 'estimatedminutes', 'tiempo'] },
      { key: 'active', header: 'Activo', aliases: ['activo', 'active', 'estado'] },
    ],
  },
  trabajadores: {
    key: 'trabajadores',
    label: 'Trabajadores',
    sheetNames: ['trabajadores', 'trabajador', 'nomina', 'workers'],
    columns: [
      { key: 'full_name', header: 'Nombre', required: true, aliases: ['nombre', 'fullname', 'trabajador', 'name'] },
      { key: 'document', header: 'Cédula', aliases: ['cedula', 'documento', 'document', 'ci'] },
      { key: 'phone', header: 'Teléfono', aliases: ['telefono', 'phone', 'celular'] },
      { key: 'position', header: 'Cargo', aliases: ['cargo', 'position', 'puesto'] },
      { key: 'share_weight', header: 'Peso nómina', aliases: ['pesonomina', 'peso', 'shareweight', 'share'] },
      { key: 'active', header: 'Estado', aliases: ['estado', 'activo', 'active'] },
      { key: 'notes', header: 'Notas', aliases: ['notas', 'notes'] },
    ],
  },
  ordenes: {
    key: 'ordenes',
    label: 'Órdenes',
    sheetNames: ['ordenes', 'orden', 'orders', 'ots', 'ot', 'trabajo'],
    columns: [
      { key: 'number', header: 'Número', aliases: ['numero', 'number', 'ot', 'orden'] },
      { key: 'client_name', header: 'Cliente', required: true, aliases: ['cliente', 'client', 'nombrecliente', 'name'] },
      { key: 'document', header: 'Cédula/RIF', aliases: ['cedula', 'rif', 'cedularif', 'documento', 'document', 'ci'] },
      { key: 'phone', header: 'Teléfono', aliases: ['telefono', 'phone', 'celular'] },
      { key: 'status', header: 'Estado', aliases: ['estado', 'status'] },
      { key: 'device_brand', header: 'Marca', aliases: ['marca', 'brand'] },
      { key: 'device_model', header: 'Modelo', aliases: ['modelo', 'model'] },
      { key: 'serial_number', header: 'Serial', aliases: ['serial', 'serie', 'sn'] },
      { key: 'device_password', header: 'Contraseña', aliases: ['contrasena', 'password', 'pin', 'clave'] },
      { key: 'fault_description', header: 'Falla', aliases: ['falla', 'fault', 'descripcionfalla'] },
      { key: 'service_name', header: 'Tipo de servicio', aliases: ['tiposervicio', 'servicio', 'service', 'servicetype'] },
      { key: 'physical_notes', header: 'Observaciones', aliases: ['observaciones', 'notas', 'notes', 'physicalnotes'] },
      { key: 'technician_name', header: 'Técnico', aliases: ['tecnico', 'technician', 'responsable'] },
      { key: 'total', header: 'Total USD', aliases: ['totalusd', 'total', 'monto', 'precio'] },
      { key: 'received_at', header: 'Ingreso', aliases: ['ingreso', 'fecha', 'receivedat', 'recibido'] },
      { key: 'delivered_at', header: 'Entrega', aliases: ['entrega', 'deliveredat', 'entregado'] },
    ],
  },
};

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function cellText(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

function emptyRow(spec) {
  return Object.fromEntries(spec.columns.map((c) => [c.key, '']));
}

function specsPublic() {
  return Object.values(MODULES).map((m) => ({
    key: m.key,
    label: m.label,
    columns: m.columns.map((c) => ({
      key: c.key,
      header: c.header,
      required: !!c.required,
    })),
  }));
}

function detectModuleFromName(name) {
  const n = norm(name);
  for (const m of Object.values(MODULES)) {
    if (m.sheetNames.some((s) => norm(s) === n) || n === m.key) return m.key;
  }
  return null;
}

function detectModuleFromHeaders(headers) {
  const set = new Set(headers.map(norm).filter(Boolean));
  const score = (m) => m.columns.filter((c) => c.aliases.some((a) => set.has(norm(a)) || set.has(norm(c.header)))).length;
  let best = null;
  let bestN = 0;
  for (const m of Object.values(MODULES)) {
    const n = score(m);
    if (n > bestN) { best = m.key; bestN = n; }
  }
  return bestN >= 2 ? best : null;
}

function mapHeaderToKey(spec, header) {
  const n = norm(header);
  if (!n) return null;
  return spec.columns.find((c) => norm(c.header) === n || c.aliases.includes(n) || c.key === n)?.key || null;
}

function looksLikeHeader(spec, values) {
  return values.some((v) => mapHeaderToKey(spec, v));
}

function parseBool(v, fallback = 1) {
  const n = norm(v);
  if (!n) return fallback;
  if (['0', 'no', 'inactivo', 'false', 'off', 'inactiva'].includes(n)) return 0;
  if (['1', 'si', 'activo', 'true', 'on', 'activa', 'yes'].includes(n)) return 1;
  return fallback;
}

function parseOrderStatus(v) {
  const n = norm(v);
  if (!n) return 'recibido';
  const map = {
    recibido: 'recibido',
    received: 'recibido',
    diagnostico: 'diagnostico',
    endiagnostico: 'diagnostico',
    diagnosis: 'diagnostico',
    esperandorepuesto: 'esperando_repuesto',
    esperandopieza: 'esperando_repuesto',
    reparacion: 'reparacion',
    enreparacion: 'reparacion',
    listo: 'listo',
    ready: 'listo',
    entregado: 'entregado',
    delivered: 'entregado',
    cancelado: 'cancelado',
    cancelled: 'cancelado',
    canceled: 'cancelado',
  };
  if (map[n]) return map[n];
  const byLabel = Object.entries(ORDER_STATUS).find(([, label]) => norm(label) === n);
  return byLabel ? byLabel[0] : '';
}

function parseType(v) {
  const n = norm(v);
  if (['service', 'servicio', 'servicios'].includes(n)) return 'service';
  if (['product', 'producto', 'productos', 'repuesto', 'pieza'].includes(n)) return 'product';
  return '';
}

function parseDateTime(v, fallback = '') {
  const s = String(v || '').trim();
  if (!s) return fallback;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.length <= 10 ? `${s} 00:00:00` : s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} 00:00:00`;
  }
  return fallback;
}

function bumpSeqIfNeeded(db, seqKey, number) {
  const m = String(number || '').match(/(\d+)\s*$/);
  if (!m) return;
  const n = parseInt(m[1], 10) || 0;
  const current = parseInt(getSetting(db, seqKey, '0'), 10) || 0;
  if (n > current) setSetting(db, seqKey, n);
}

function findOrCreateClient(db, r) {
  const name = String(r.client_name || '').trim();
  const doc = String(r.document || '').trim();
  const phone = String(r.phone || '').trim();
  if (doc) {
    const byDoc = db.prepare('SELECT id FROM clients WHERE TRIM(document) != \'\' AND document = ? COLLATE NOCASE').get(doc);
    if (byDoc) return byDoc.id;
  }
  const byName = name
    ? db.prepare('SELECT id FROM clients WHERE name = ? COLLATE NOCASE').get(name)
    : null;
  if (byName) return byName.id;
  const info = db.prepare('INSERT INTO clients (name, document, phone) VALUES (?, ?, ?)').run(name, doc, phone);
  return Number(info.lastInsertRowid);
}

function findTechnicianId(db, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const row = db.prepare('SELECT id FROM users WHERE full_name = ? COLLATE NOCASE').get(n);
  return row ? row.id : null;
}

function matchCatalogService(services, raw) {
  const n = norm(raw);
  if (!n) return null;
  return services.find((it) => norm(it.code) === n || norm(it.name) === n) || null;
}

function saveImportedServiceItem(db, orderId, r, catalog, unitPrice) {
  const name = String(r.service_name || '').trim();
  db.prepare('DELETE FROM work_order_items WHERE work_order_id = ?').run(orderId);
  if (!name && !catalog) return;
  const description = catalog ? catalog.name : name;
  const price = round2(unitPrice);
  db.prepare(`
    INSERT INTO work_order_items (work_order_id, catalog_item_id, type, description, qty, unit_price, line_total)
    VALUES (?, ?, 'service', ?, 1, ?, ?)
  `).run(orderId, catalog ? catalog.id : null, description, price, price);
}

function totalsFromGross(db, gross) {
  const total = round2(Number(gross) || 0);
  const ivaEnabled = getSetting(db, 'iva_enabled') === '1' ? 1 : 0;
  const ivaRate = Number(getSetting(db, 'iva_rate', '16')) || 16;
  if (!ivaEnabled || !total) {
    return { subtotal: total, iva_amount: 0, total, iva_enabled: ivaEnabled, iva_rate: ivaRate };
  }
  const iva_amount = round2(total * ivaRate / (100 + ivaRate));
  const subtotal = round2(total - iva_amount);
  return { subtotal, iva_amount, total, iva_enabled: ivaEnabled, iva_rate: ivaRate };
}

function normalizeRow(moduleKey, raw) {
  const spec = MODULES[moduleKey];
  const row = emptyRow(spec);
  for (const col of spec.columns) {
    if (raw[col.key] != null) row[col.key] = cellText(raw[col.key]);
  }
  if (moduleKey === 'catalogo') {
    row.type = parseType(row.type) || row.type;
    row.price_usd = row.price_usd === '' ? '0' : row.price_usd;
    row.stock = row.stock === '' ? '0' : row.stock;
    row.min_stock = row.min_stock === '' ? '0' : row.min_stock;
    row.estimated_minutes = row.estimated_minutes === '' ? '0' : row.estimated_minutes;
    row.active = String(parseBool(row.active, 1));
  }
  if (moduleKey === 'trabajadores') {
    row.share_weight = row.share_weight === '' ? '1' : row.share_weight;
    row.active = String(parseBool(row.active, 1));
  }
  if (moduleKey === 'ordenes') {
    const parsed = parseOrderStatus(row.status);
    row.status = parsed || row.status || 'recibido';
  }
  return row;
}

function rowHasData(row) {
  return Object.values(row).some((v) => String(v || '').trim() !== '');
}

function validateRow(moduleKey, row, index) {
  const spec = MODULES[moduleKey];
  const errors = [];
  for (const col of spec.columns) {
    if (col.required && !String(row[col.key] || '').trim()) {
      errors.push(`Fila ${index + 1}: falta ${col.header}`);
    }
  }
  if (moduleKey === 'catalogo' && row.type && !['product', 'service'].includes(row.type)) {
    errors.push(`Fila ${index + 1}: tipo debe ser product o service (producto / servicio)`);
  }
  if (moduleKey === 'ordenes' && row.status && !ORDER_STATUS[row.status]) {
    errors.push(`Fila ${index + 1}: estado no válido (use recibido, diagnóstico, esperando_repuesto, reparación, listo, entregado o cancelado)`);
  }
  return errors;
}

function rowsFromMatrix(moduleKey, matrix) {
  const spec = MODULES[moduleKey];
  if (!matrix.length) return { rows: [], warnings: [] };
  const warnings = [];
  let start = 0;
  let keys = spec.columns.map((c) => c.key);
  if (looksLikeHeader(spec, matrix[0])) {
    keys = matrix[0].map((h) => mapHeaderToKey(spec, h));
    start = 1;
    if (keys.filter(Boolean).length < 1) {
      warnings.push('No se reconocieron encabezados; se usó el orden documentado.');
      keys = spec.columns.map((c) => c.key);
      start = 0;
    }
  }
  const rows = [];
  for (let i = start; i < matrix.length; i += 1) {
    const raw = {};
    keys.forEach((k, idx) => {
      if (k) raw[k] = matrix[i][idx];
    });
    const row = normalizeRow(moduleKey, raw);
    if (rowHasData(row)) rows.push(row);
  }
  return { rows, warnings };
}

function parseJsonPayload(payload, moduleHint) {
  const warnings = [];
  const datasets = [];

  const push = (moduleKey, list) => {
    if (!MODULES[moduleKey]) {
      warnings.push(`Módulo desconocido: ${moduleKey}`);
      return;
    }
    const rows = (list || []).map((r) => normalizeRow(moduleKey, r)).filter(rowHasData);
    datasets.push({ module: moduleKey, label: MODULES[moduleKey].label, rows });
  };

  if (Array.isArray(payload)) {
    const key = moduleHint && MODULES[moduleHint] ? moduleHint : null;
    if (!key) {
      throw Object.assign(new Error('El JSON es una lista. Indique el tipo de datos (clientes, catálogo, trabajadores u órdenes) o use un objeto con esas claves.'), { status: 400 });
    }
    push(key, payload);
    return { datasets, warnings };
  }

  if (payload && typeof payload === 'object') {
    if (payload.module && Array.isArray(payload.rows)) {
      push(payload.module, payload.rows);
      return { datasets, warnings };
    }
    let found = false;
    for (const key of Object.keys(MODULES)) {
      if (Array.isArray(payload[key])) {
        push(key, payload[key]);
        found = true;
      }
    }
    if (!found) {
      throw Object.assign(new Error('El JSON debe ser una lista de filas o un objeto con claves clientes, catalogo, trabajadores y/o ordenes.'), { status: 400 });
    }
    return { datasets, warnings };
  }

  throw Object.assign(new Error('El JSON no tiene un formato válido.'), { status: 400 });
}

async function sanitizeXlsxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (/(^|\/)(comments[^/]*\.xml|comments\/.+|[^/]*commentsDrawing[^/]*\.vml|vmlDrawing\d+\.vml)$/i.test(name)) {
      zip.remove(name);
      changed = true;
    }
  }
  for (const name of Object.keys(zip.files)) {
    if (!/worksheets\/_rels\/.+\.rels$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    const next = xml.replace(/<Relationship\b[^>]*\/?>/g, (tag) => (
      /relationships\/(comments|vmlDrawing)/i.test(tag) ? '' : tag
    ));
    if (next !== xml) {
      zip.file(name, next);
      changed = true;
    }
  }
  if (!changed) return buffer;
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

async function loadWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
    return wb;
  } catch (err) {
    const cleaned = await sanitizeXlsxBuffer(buffer);
    if (cleaned === buffer) throw err;
    const retry = new ExcelJS.Workbook();
    await retry.xlsx.load(cleaned);
    return retry;
  }
}

async function parseExcelBuffer(buffer, moduleHint) {
  const wb = await loadWorkbook(buffer);
  const warnings = [];
  const datasets = [];

  if (!wb.worksheets.length) {
    throw Object.assign(new Error('El Excel no tiene hojas.'), { status: 400 });
  }

  for (const ws of wb.worksheets) {
    const matrix = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const max = ws.columnCount || row.cellCount || 0;
      const values = [];
      for (let c = 1; c <= Math.max(max, 1); c += 1) values.push(cellText(row.getCell(c).value));
      if (values.some((v) => v)) matrix.push(values);
    });
    if (!matrix.length) continue;

    let moduleKey = detectModuleFromName(ws.name) || detectModuleFromHeaders(matrix[0]);
    if (!moduleKey && wb.worksheets.length === 1 && moduleHint && MODULES[moduleHint]) {
      moduleKey = moduleHint;
    }
    if (!moduleKey) {
      warnings.push(`Hoja «${ws.name}»: no se reconoció el tipo. Use el nombre Clientes, Catalogo, Trabajadores u Órdenes, o encabezados del instructivo.`);
      continue;
    }
    const parsed = rowsFromMatrix(moduleKey, matrix);
    warnings.push(...parsed.warnings.map((w) => `Hoja «${ws.name}»: ${w}`));
    const existing = datasets.find((d) => d.module === moduleKey);
    if (existing) existing.rows.push(...parsed.rows);
    else datasets.push({ module: moduleKey, label: MODULES[moduleKey].label, rows: parsed.rows });
  }

  return { datasets, warnings };
}

async function parseBuffer(buffer, filename, moduleHint) {
  const name = String(filename || '').toLowerCase();
  const hint = moduleHint && MODULES[moduleHint] ? moduleHint : null;
  if (name.endsWith('.json') || name.endsWith('.txt')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    let payload;
    try { payload = JSON.parse(text); }
    catch {
      throw Object.assign(new Error('El archivo JSON no es válido.'), { status: 400 });
    }
    return parseJsonPayload(payload, hint);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return parseExcelBuffer(buffer, hint);
  }
  if (name.endsWith('.xls')) {
    throw Object.assign(new Error('Use Excel .xlsx (no .xls) o un archivo JSON.'), { status: 400 });
  }
  try {
    return parseJsonPayload(JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')), hint);
  } catch {
    try {
      return await parseExcelBuffer(buffer, hint);
    } catch {
      throw Object.assign(new Error('Formato no reconocido. Suba un .xlsx o .json.'), { status: 400 });
    }
  }
}

function validateDatasets(datasets) {
  const errors = [];
  for (const ds of datasets || []) {
    if (!MODULES[ds.module]) {
      errors.push(`Módulo no válido: ${ds.module}`);
      continue;
    }
    (ds.rows || []).forEach((row, i) => {
      errors.push(...validateRow(ds.module, row, i).map((e) => `${MODULES[ds.module].label}: ${e}`));
    });
  }
  return errors;
}

function commitDatasets(db, datasets, userId) {
  const results = [];
  db.transaction(() => {
    for (const ds of datasets || []) {
      if (!MODULES[ds.module]) continue;
      const rows = (ds.rows || []).map((r) => normalizeRow(ds.module, r)).filter(rowHasData);
      let inserted = 0;
      let updated = 0;
      if (ds.module === 'clientes') {
        const findDoc = db.prepare('SELECT id FROM clients WHERE TRIM(document) != \'\' AND document = ? COLLATE NOCASE');
        const ins = db.prepare('INSERT INTO clients (name, document, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)');
        const upd = db.prepare(`
          UPDATE clients SET name = ?, document = ?, phone = ?, email = ?, address = ?, notes = ?,
            updated_at = datetime('now','localtime') WHERE id = ?
        `);
        for (const r of rows) {
          const name = String(r.name || '').trim();
          if (!name) continue;
          const doc = String(r.document || '').trim();
          const existing = doc ? findDoc.get(doc) : null;
          if (existing) {
            upd.run(name, doc, r.phone || '', r.email || '', r.address || '', r.notes || '', existing.id);
            updated += 1;
          } else {
            ins.run(name, doc, r.phone || '', r.email || '', r.address || '', r.notes || '');
            inserted += 1;
          }
        }
      }
      if (ds.module === 'catalogo') {
        const find = db.prepare('SELECT id, stock FROM catalog_items WHERE code = ? COLLATE NOCASE');
        const ins = db.prepare(`
          INSERT INTO catalog_items (type, code, name, description, price_usd, stock, min_stock, estimated_minutes, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const upd = db.prepare(`
          UPDATE catalog_items SET type = ?, name = ?, description = ?, price_usd = ?, stock = ?, min_stock = ?,
            estimated_minutes = ?, active = ?, updated_at = datetime('now','localtime') WHERE id = ?
        `);
        const move = db.prepare(`
          INSERT INTO inventory_movements (catalog_item_id, type, qty, reason, ref_type, ref_id, created_by)
          VALUES (?, 'adjustment', ?, 'Importación', 'import', NULL, ?)
        `);
        for (const r of rows) {
          const code = String(r.code || '').trim();
          const name = String(r.name || '').trim();
          const type = parseType(r.type) || r.type;
          if (!code || !name || !['product', 'service'].includes(type)) continue;
          const price = Number(r.price_usd) || 0;
          const stock = type === 'product' ? Number(r.stock) || 0 : 0;
          const minStock = Number(r.min_stock) || 0;
          const minutes = Number(r.estimated_minutes) || 0;
          const active = parseBool(r.active, 1);
          const existing = find.get(code);
          if (existing) {
            upd.run(type, name, r.description || '', price, stock, minStock, minutes, active, existing.id);
            if (type === 'product' && Number(existing.stock) !== stock) {
              move.run(existing.id, stock, userId);
            }
            updated += 1;
          } else {
            const info = ins.run(type, code, name, r.description || '', price, stock, minStock, minutes, active);
            if (type === 'product' && stock) move.run(info.lastInsertRowid, stock, userId);
            inserted += 1;
          }
        }
      }
      if (ds.module === 'trabajadores') {
        const findDoc = db.prepare('SELECT id FROM workers WHERE TRIM(document) != \'\' AND document = ? COLLATE NOCASE');
        const ins = db.prepare(`
          INSERT INTO workers (full_name, document, phone, position, share_weight, notes, active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const upd = db.prepare(`
          UPDATE workers SET full_name = ?, document = ?, phone = ?, position = ?, share_weight = ?, notes = ?,
            active = ?, updated_at = datetime('now','localtime') WHERE id = ?
        `);
        for (const r of rows) {
          const name = String(r.full_name || '').trim();
          if (!name) continue;
          const doc = String(r.document || '').trim();
          const weight = Number(r.share_weight) > 0 ? Number(r.share_weight) : 1;
          const active = parseBool(r.active, 1);
          const existing = doc ? findDoc.get(doc) : null;
          if (existing) {
            upd.run(name, doc, r.phone || '', r.position || '', weight, r.notes || '', active, existing.id);
            updated += 1;
          } else {
            ins.run(name, doc, r.phone || '', r.position || '', weight, r.notes || '', active);
            inserted += 1;
          }
        }
      }
      if (ds.module === 'ordenes') {
        const findNum = db.prepare('SELECT id FROM work_orders WHERE number = ? COLLATE NOCASE');
        const ins = db.prepare(`
          INSERT INTO work_orders (
            number, quote_id, client_id, technician_id, status,
            device_brand, device_model, serial_number, device_password,
            fault_description, physical_notes,
            rate_type, rate_value, iva_enabled, iva_rate,
            subtotal, iva_amount, total, received_at, ready_at, delivered_at, created_by
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const upd = db.prepare(`
          UPDATE work_orders SET
            client_id = ?, technician_id = ?, status = ?,
            device_brand = ?, device_model = ?, serial_number = ?, device_password = ?,
            fault_description = ?, physical_notes = ?,
            iva_enabled = ?, iva_rate = ?, subtotal = ?, iva_amount = ?, total = ?,
            received_at = ?, ready_at = ?, delivered_at = ?,
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `);
        const rate = todayRate(db);
        const rateType = 'bcv';
        const rateValue = rate ? Number(rate.bcv) || 1 : 1;
        const services = db.prepare(`SELECT id, code, name, price_usd FROM catalog_items WHERE type = 'service'`).all();
        for (const r of rows) {
          const clientName = String(r.client_name || '').trim();
          if (!clientName) continue;
          const clientId = findOrCreateClient(db, r);
          const status = parseOrderStatus(r.status) || 'recibido';
          const techId = findTechnicianId(db, r.technician_name);
          const catalog = matchCatalogService(services, r.service_name);
          const gross = Number(r.total) || (catalog ? Number(catalog.price_usd) : 0);
          const totals = totalsFromGross(db, gross);
          const receivedAt = parseDateTime(r.received_at, '') || `${localDate()} 00:00:00`;
          let deliveredAt = parseDateTime(r.delivered_at, '') || null;
          let readyAt = null;
          if (status === 'entregado' && !deliveredAt) deliveredAt = receivedAt;
          if (status === 'listo' || status === 'entregado') readyAt = receivedAt;
          const existingNum = String(r.number || '').trim();
          const existing = existingNum ? findNum.get(existingNum) : null;
          let orderId;
          if (existing) {
            upd.run(
              clientId, techId, status,
              r.device_brand || '', r.device_model || '', r.serial_number || '', r.device_password || '',
              r.fault_description || '', r.physical_notes || '',
              totals.iva_enabled, totals.iva_rate, totals.subtotal, totals.iva_amount, totals.total,
              receivedAt, readyAt, deliveredAt, existing.id
            );
            orderId = existing.id;
            updated += 1;
          } else {
            const number = existingNum || nextNumber(db, 'order_seq', 'OT');
            if (existingNum) bumpSeqIfNeeded(db, 'order_seq', number);
            const info = ins.run(
              number, clientId, techId, status,
              r.device_brand || '', r.device_model || '', r.serial_number || '', r.device_password || '',
              r.fault_description || '', r.physical_notes || '',
              rateType, rateValue, totals.iva_enabled, totals.iva_rate,
              totals.subtotal, totals.iva_amount, totals.total,
              receivedAt, readyAt, deliveredAt, userId
            );
            orderId = Number(info.lastInsertRowid);
            inserted += 1;
          }
          if (String(r.service_name || '').trim()) {
            saveImportedServiceItem(db, orderId, r, catalog, gross);
          }
        }
      }
      results.push({ module: ds.module, label: MODULES[ds.module].label, inserted, updated, total: rows.length });
    }
  })();
  return results;
}

async function buildTemplate(moduleKey) {
  const spec = MODULES[moduleKey];
  if (!spec) {
    throw Object.assign(new Error('Módulo de plantilla no válido'), { status: 404 });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tecno Fix';
  const ws = wb.addWorksheet(spec.label);
  ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  return wb;
}

module.exports = {
  MODULES,
  specsPublic,
  parseBuffer,
  validateDatasets,
  commitDatasets,
  buildTemplate,
  emptyRow,
};
