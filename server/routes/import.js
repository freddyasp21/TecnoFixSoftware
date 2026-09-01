/**
 * Importar maestros desde JSON o Excel. Solo administrador.
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requireAdmin } = require('../middleware/auth');
const {
  specsPublic,
  parseBuffer,
  validateDatasets,
  commitDatasets,
  buildTemplate,
} = require('../services/importData');

const router = express.Router();
router.use(authRequired, requireAdmin);

router.get('/spec', (_req, res) => {
  res.json({
    modules: specsPublic(),
    formats: ['.xlsx', '.json'],
    jsonExample: {
      clientes: [{ name: 'María Pérez', document: 'V-123', phone: '0414-0000000', email: '', address: '', notes: '' }],
      catalogo: [{
        code: 'SRV-001', type: 'service', name: 'Mantenimiento', description: '',
        price_usd: 25, stock: 0, min_stock: 0, estimated_minutes: 60, active: 1,
      }],
      trabajadores: [{ full_name: 'Juan Técnico', document: 'V-456', phone: '', position: 'Técnico', share_weight: 1, active: 1, notes: '' }],
      ordenes: [{
        number: 'OT-0001', client_name: 'María Pérez', document: 'V-123', phone: '0414-0000000',
        status: 'recibido', device_brand: 'Samsung', device_model: 'A54', serial_number: '',
        device_password: '', fault_description: 'No enciende', service_name: 'Mantenimiento',
        physical_notes: '', technician_name: '', total: 25, received_at: '', delivered_at: '',
      }],
    },
  });
});

router.get('/template/:module', async (req, res) => {
  try {
    const wb = await buildTemplate(req.params.module);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tecnofix-plantilla-${req.params.module}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/parse', express.raw({ type: () => true, limit: '12mb' }), async (req, res) => {
  try {
    const filename = decodeURIComponent(req.get('X-Filename') || 'archivo');
    const hint = req.get('X-Module') || req.query.module || '';
    const body = req.body;
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
    if (!buffer.length) return res.status(400).json({ error: 'El archivo está vacío' });
    const parsed = await parseBuffer(buffer, filename, hint);
    if (!parsed.datasets.length || parsed.datasets.every((d) => !d.rows.length)) {
      return res.status(400).json({
        error: 'No se encontraron filas. Revise el orden de columnas y el nombre de las hojas.',
        warnings: parsed.warnings,
        datasets: parsed.datasets,
      });
    }
    const errors = validateDatasets(parsed.datasets);
    res.json({ ...parsed, errors });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo leer el archivo' });
  }
});

router.post('/commit', (req, res) => {
  const datasets = req.body?.datasets;
  if (!Array.isArray(datasets) || !datasets.length) {
    return res.status(400).json({ error: 'No hay datos para guardar' });
  }
  const errors = validateDatasets(datasets);
  if (errors.length) {
    return res.status(400).json({ error: 'Corrija las filas incompletas antes de guardar', errors });
  }
  try {
    const results = commitDatasets(getDb(), datasets, req.user.id);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo guardar la importación' });
  }
});

module.exports = router;
