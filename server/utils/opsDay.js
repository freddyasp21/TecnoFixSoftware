/**
 * Día operativo: fecha de inicio de cálculos y cierre diario (admin / gerente).
 * El reloj no avanza el día; hay que cerrarlo para pasar al siguiente.
 */
const { getSetting, setSetting, localDate, businessDateTime } = require('./helpers');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return localDate(new Date(y, m - 1, d + Number(n)));
}

function opsStartDate(db) {
  const v = getSetting(db, 'ops_start_date', '');
  return DATE_RE.test(v) ? v : '';
}

function opsCurrentDate(db) {
  const v = getSetting(db, 'ops_current_date', '');
  return DATE_RE.test(v) ? v : '';
}

function ensureDayRow(db, day, userId) {
  db.prepare(`
    INSERT INTO business_days (day, status, opened_at, opened_by)
    VALUES (?, 'open', datetime('now','localtime'), ?)
    ON CONFLICT(day) DO NOTHING
  `).run(day, userId || null);
}

function opsSnapshot(db) {
  const start_date = opsStartDate(db) || null;
  const current_date = opsCurrentDate(db) || null;
  const clock_date = localDate();
  const configured = Boolean(start_date && current_date);
  let current_status = 'unset';
  if (configured) {
    const row = db.prepare('SELECT status FROM business_days WHERE day = ?').get(current_date);
    current_status = row?.status || 'open';
  }
  const cash = db.prepare(`SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1`).get();
  const closed_days = configured
    ? db.prepare(`SELECT day FROM business_days WHERE status = 'closed' AND day >= ?`).all(start_date).map((r) => r.day)
    : [];
  return {
    start_date,
    current_date,
    clock_date,
    configured,
    current_status,
    cash_open: !!cash,
    closed_days,
  };
}

function requireOpsConfigured(db, res) {
  const start_date = opsStartDate(db);
  const current_date = opsCurrentDate(db);
  if (!start_date || !current_date) {
    res.status(409).json({
      error: 'El administrador o gerente debe fijar la fecha de inicio de operaciones en el calendario.',
    });
    return null;
  }
  return { start_date, current_date };
}

function requireOpsOpen(db, res) {
  const cfg = requireOpsConfigured(db, res);
  if (!cfg) return null;
  const row = db.prepare('SELECT status FROM business_days WHERE day = ?').get(cfg.current_date);
  if (row?.status === 'closed') {
    res.status(409).json({
      error: 'El día operativo está cerrado. El administrador o gerente debe cerrarlo para dar comienzo al siguiente.',
    });
    return null;
  }
  return cfg;
}

function clampPeriodFrom(db, from) {
  const start = opsStartDate(db);
  if (!start) return from;
  if (!from || from < start) return start;
  return from;
}

function isDayOperable(db, day) {
  const start = opsStartDate(db);
  const current = opsCurrentDate(db);
  if (!start || !current || !DATE_RE.test(day)) return false;
  return day >= start && day <= current;
}

function setOpsStart(db, startDate, userId) {
  if (!DATE_RE.test(startDate)) {
    const err = new Error('Fecha de inicio no válida');
    err.status = 400;
    throw err;
  }
  const existingStart = opsStartDate(db);
  const existingCurrent = opsCurrentDate(db);
  const clock = localDate();
  if (!existingStart || !existingCurrent) {
    const current = startDate > clock ? startDate : clock;
    setSetting(db, 'ops_start_date', startDate);
    setSetting(db, 'ops_current_date', current);
    ensureDayRow(db, current, userId);
    return opsSnapshot(db);
  }
  if (startDate > existingCurrent) {
    const err = new Error('La fecha de inicio no puede ser posterior al día operativo actual');
    err.status = 400;
    throw err;
  }
  setSetting(db, 'ops_start_date', startDate);
  return opsSnapshot(db);
}

function closeOpsDay(db, userId, notes) {
  const start = opsStartDate(db);
  const current = opsCurrentDate(db);
  if (!start || !current) {
    const err = new Error('Fije primero la fecha de inicio de operaciones');
    err.status = 409;
    throw err;
  }
  const cash = db.prepare(`SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1`).get();
  if (cash) {
    const err = new Error('Cierre la caja antes de cerrar el día operativo');
    err.status = 400;
    throw err;
  }
  const row = db.prepare('SELECT status FROM business_days WHERE day = ?').get(current);
  if (row?.status === 'closed') {
    const err = new Error('Este día operativo ya está cerrado');
    err.status = 400;
    throw err;
  }
  ensureDayRow(db, current, userId);
  db.prepare(`
    UPDATE business_days
    SET status = 'closed', closed_at = datetime('now','localtime'), closed_by = ?, notes = ?
    WHERE day = ?
  `).run(userId, notes || '', current);
  const next = addDays(current, 1);
  setSetting(db, 'ops_current_date', next);
  ensureDayRow(db, next, userId);
  return opsSnapshot(db);
}

module.exports = {
  addDays,
  opsStartDate,
  opsCurrentDate,
  opsSnapshot,
  opsDateTime: businessDateTime,
  requireOpsConfigured,
  requireOpsOpen,
  clampPeriodFrom,
  isDayOperable,
  setOpsStart,
  closeOpsDay,
};
