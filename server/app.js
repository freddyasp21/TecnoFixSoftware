/**
 * Aplicación Express: API JSON + (en producción) estáticos de la PWA.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { getDb } = require('./db/database');
const { seed } = require('./db/seed');

function createApp() {
  seed(getDb());

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'Tecno Fix', version: require('../package.json').version });
  });

  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/rates', require('./routes/rates'));
  app.use('/api/catalog', require('./routes/catalog'));
  app.use('/api/clients', require('./routes/clients'));
  app.use('/api/quotes', require('./routes/quotes'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/calendar', require('./routes/calendar'));
  app.use('/api/ops', require('./routes/ops'));
  app.use('/api/inventory', require('./routes/inventory'));
  app.use('/api/cash', require('./routes/cash'));
  app.use('/api/finance', require('./routes/finance'));
  app.use('/api/workers', require('./routes/workers'));
  app.use('/api/alerts', require('./routes/alerts'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/export', require('./routes/export'));
  app.use('/api/import', require('./routes/import'));

  app.use((err, _req, res, _next) => {
    console.error('[Tecno Fix]', err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno' });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
