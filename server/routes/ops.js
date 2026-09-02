/**
 * Fecha de inicio de operaciones y cierre del día (Administrador / Gerente).
 */
const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { opsSnapshot, setOpsStart, closeOpsDay } = require('../utils/opsDay');

const router = express.Router();
router.use(authRequired);

router.get('/', (_req, res) => {
  res.json(opsSnapshot(getDb()));
});

router.put('/start', requirePermission('ops.manage'), (req, res) => {
  try {
    const snap = setOpsStart(getDb(), String(req.body?.start_date || '').slice(0, 10), req.user.id);
    res.json(snap);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/close', requirePermission('ops.manage'), (req, res) => {
  try {
    const snap = closeOpsDay(getDb(), req.user.id, req.body?.notes || '');
    res.json(snap);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

module.exports = router;
