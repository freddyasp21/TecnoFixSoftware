/**
 * Órdenes importadas no pasan por caja en vivo. Se registra un ingreso
 * histórico (sesión cerrada) con la fecha de cobro y el total USD de la OT.
 */
const { getSetting, setSetting, round2 } = require('../utils/helpers');

const SESSION_SETTING = 'import_cash_session_id';
const SESSION_NOTES = 'Importación histórica de órdenes';

function importCashSessionId(db, userId) {
  const saved = Number(getSetting(db, SESSION_SETTING, '0')) || 0;
  if (saved) {
    const row = db.prepare('SELECT id FROM cash_sessions WHERE id = ?').get(saved);
    if (row) return row.id;
  }
  const info = db.prepare(`
    INSERT INTO cash_sessions (
      opened_at, closed_at, opened_by, closed_by, notes, status
    ) VALUES (datetime('now','localtime'), datetime('now','localtime'), ?, ?, ?, 'closed')
  `).run(userId || null, userId || null, SESSION_NOTES);
  const id = Number(info.lastInsertRowid);
  setSetting(db, SESSION_SETTING, id);
  return id;
}

function syncImportedOrderIncome(db, order, userId) {
  if (!order?.id) return;
  const total = round2(order.total);
  const existing = db.prepare(`
    SELECT id, session_id FROM cash_transactions
    WHERE work_order_id = ? AND type = 'income'
    ORDER BY id ASC LIMIT 1
  `).get(order.id);
  const importSid = Number(getSetting(db, SESSION_SETTING, '0')) || 0;
  const isImportTx = existing && importSid && Number(existing.session_id) === importSid;

  if (order.status === 'cancelado' || !(total > 0)) {
    if (isImportTx) {
      db.prepare('DELETE FROM cash_transactions WHERE id = ?').run(existing.id);
    }
    return;
  }
  if (existing && !isImportTx) return;

  const receivedAt = order.received_at || `${new Date().toISOString().slice(0, 10)} 00:00:00`;
  const rateType = order.rate_type || 'bcv';
  const rateValue = Number(order.rate_value) || 1;
  const createdBy = order.cashier_id || order.created_by || userId || null;
  const description = 'Cobro importado';

  if (isImportTx) {
    db.prepare(`
      UPDATE cash_transactions SET
        amount = ?, amount_usd = ?, rate_type = ?, rate_value = ?,
        client_id = ?, description = ?, created_by = ?, created_at = ?
      WHERE id = ?
    `).run(
      total, total, rateType, rateValue,
      order.client_id || null, description, createdBy, receivedAt, existing.id
    );
    return;
  }

  const sessionId = importCashSessionId(db, createdBy);
  db.prepare(`
    INSERT INTO cash_transactions (
      session_id, type, payment_method, amount, amount_usd, rate_type, rate_value,
      client_id, work_order_id, quote_id, description, created_by, created_at
    ) VALUES (?, 'income', 'usd_cash', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    sessionId, total, total, rateType, rateValue,
    order.client_id || null, order.id, description, createdBy, receivedAt
  );
}

function backfillImportedOrderIncome(db) {
  const orders = db.prepare(`
    SELECT id, number, total, received_at, client_id, rate_type, rate_value,
           cashier_id, created_by, status
    FROM work_orders
    WHERE status != 'cancelado'
      AND total > 0
      AND NOT EXISTS (
        SELECT 1 FROM cash_transactions t
        WHERE t.work_order_id = work_orders.id AND t.type = 'income'
      )
  `).all();
  for (const order of orders) syncImportedOrderIncome(db, order, order.cashier_id || order.created_by);
  const sid = Number(getSetting(db, SESSION_SETTING, '0')) || 0;
  if (sid) {
    db.prepare(`
      UPDATE cash_transactions SET description = 'Cobro importado'
      WHERE session_id = ? AND type = 'income'
    `).run(sid);
  }
}

/** Ingresos de caja huérfanos (p. ej. cobro de cotización tras borrar/reimportar la OT) no deben sumarse otra vez. */
function cashInPeriodSql(alias = 't') {
  return `
    date(${alias}.created_at) BETWEEN date(?) AND date(?)
    AND NOT (
      ${alias}.work_order_id IS NULL
      AND ${alias}.type = 'income'
      AND EXISTS (
        SELECT 1 FROM cash_transactions imp
        JOIN work_orders wo2 ON wo2.id = imp.work_order_id
        WHERE imp.session_id = ?
          AND imp.type = 'income'
          AND instr(COALESCE(${alias}.description, ''), wo2.number) > 0
      )
    )
  `;
}

function importCashSessionSetting(db) {
  return Number(getSetting(db, SESSION_SETTING, '0')) || 0;
}

module.exports = {
  syncImportedOrderIncome,
  backfillImportedOrderIncome,
  cashInPeriodSql,
  importCashSessionSetting,
};
