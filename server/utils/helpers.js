/**
 * Helpers de negocio: ajustes, numeración correlativa, totales e IVA.
 */
function getSetting(db, key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function nextNumber(db, seqKey, prefix) {
  const current = parseInt(getSetting(db, seqKey, '0'), 10) || 0;
  const next = current + 1;
  setSetting(db, seqKey, next);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Fecha local YYYY-MM-DD (evita el desfase de toISOString en UTC). */
function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const RATE_REQUIRED_MSG = 'Debe actualizar las tasas del día (BCV, Euro y USDT) antes de abrir caja, cotizar o crear una orden.';

/** Tasa registrada hoy. Si no hay fila del día, null (no se reutiliza la de ayer). */
function todayRate(db) {
  return db.prepare('SELECT * FROM exchange_rates WHERE rate_date = ?').get(localDate()) || null;
}

function todayRateOr409(db, res) {
  const rate = todayRate(db);
  if (!rate) {
    res.status(409).json({ error: RATE_REQUIRED_MSG });
    return null;
  }
  return rate;
}

/**
 * Totales en USD. El precio de los ítems es el equivalente a cobrar.
 * Con IVA: el impuesto se extrae de ese monto (incluido); el total USD no aumenta.
 * Sin IVA: subtotal = total = suma de ítems.
 */
function computeTotals(items, ivaEnabled, ivaRate) {
  const gross = round2((items || []).reduce((s, it) => s + Number(it.line_total || 0), 0));
  if (!ivaEnabled) {
    return { subtotal: gross, iva_amount: 0, total: gross };
  }
  const rate = Number(ivaRate) || 16;
  const iva_amount = round2(gross * rate / (100 + rate));
  const subtotal = round2(gross - iva_amount);
  return { subtotal, iva_amount, total: gross };
}

function amountToUsd(amount, method, rateType, rateValue) {
  const n = Number(amount) || 0;
  if (method === 'usd_cash' || method === 'usdt') return round2(n);
  const rate = Number(rateValue) || 1;
  return round2(n / rate);
}

const PAYMENT_LABELS = {
  usd_cash: 'USD efectivo',
  bs_cash: 'Bs efectivo',
  bs_mobile: 'Pago móvil Bs',
  usdt: 'USDT Binance',
};

const ORDER_STATUS = {
  recibido: 'Recibido',
  diagnostico: 'En diagnóstico',
  esperando_repuesto: 'Esperando repuesto',
  reparacion: 'En reparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

module.exports = {
  getSetting,
  setSetting,
  nextNumber,
  round2,
  localDate,
  RATE_REQUIRED_MSG,
  computeTotals,
  todayRate,
  todayRateOr409,
  amountToUsd,
  PAYMENT_LABELS,
  ORDER_STATUS,
};
