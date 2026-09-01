/**
 * Centro de alertas: agrega stock bajo, cobros pendientes, nómina, piezas en espera y órdenes listas.
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { collectAlerts } = require('../services/alerts');

const router = express.Router();
router.use(authRequired, requirePermission('alerts.view'));

router.get('/summary', (req, res) => {
  const { counts } = collectAlerts(getDb(), req.user);
  res.json({ counts });
});

router.get('/', (req, res) => {
  res.json(collectAlerts(getDb(), req.user));
});

module.exports = router;
