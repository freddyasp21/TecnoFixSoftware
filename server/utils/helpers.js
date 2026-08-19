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

function computeTotals(items, ivaEnabled, ivaRate) {
  const subtotal = round2(items.reduce((s, it) => s + Number(it.line_total || 0), 0));
  const iva_amount = ivaEnabled ? round2(subtotal * (Number(ivaRate) || 16) / 100) : 0;
  return { subtotal, iva_amount, total: round2(subtotal + iva_amount) };
}

function todayRate(db) {
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT * FROM exchange_rates
    WHERE rate_date = ? OR rate_date <= ?
    ORDER BY rate_date DESC LIMIT 1
  `).get(today, today) || null;
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
  computeTotals,
  todayRate,
  amountToUsd,
  PAYMENT_LABELS,
  ORDER_STATUS,
};
