const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { getSetting, nextNumber, computeTotals, todayRate, amountToUsd } = require('../utils/helpers');
const { convertQuoteToOrder } = require('../services/quoteToOrder');

const METHODS = ['usd_cash', 'bs_cash', 'bs_mobile', 'usdt'];
const router = express.Router();
router.use(authRequired);

function currentSession(db) {
  return db.prepare(`
    SELECT s.*, u.full_name AS opened_by_name
    FROM cash_sessions s LEFT JOIN users u ON u.id = s.opened_by
    WHERE s.status = 'open' ORDER BY s.id DESC LIMIT 1
  `).get();
}

function breakdown(db, sessionId) {
  const rows = db.prepare(`
    SELECT type, payment_method,
           SUM(amount) AS amount,
           SUM(amount_usd) AS amount_usd
    FROM cash_transactions WHERE session_id = ?
    GROUP BY type, payment_method
  `).all(sessionId);
  const empty = () => Object.fromEntries(METHODS.map((m) => [m, { amount: 0, amount_usd: 0 }]));
  const result = { income: empty(), expense: empty() };
  for (const r of rows) {
    if (result[r.type] && result[r.type][r.payment_method]) {
      result[r.type][r.payment_method] = { amount: r.amount, amount_usd: r.amount_usd };
    }
  }
  return result;
}

router.get('/current', requirePermission('cash.view'), (_req, res) => {
  const db = getDb();
  const pendingQuotes = db.prepare(`
    SELECT q.*, c.name AS client_name
    FROM quotes q
    LEFT JOIN clients c ON c.id = q.client_id
    WHERE q.status = 'aprobada'
    ORDER BY q.updated_at DESC
  `).all();
  const session = currentSession(db);
  if (!session) return res.json({ session: null, breakdown: null, movements: [], pendingQuotes });
  const movements = db.prepare(`
    SELECT t.*, c.name AS client_name, wo.number AS order_number, u.full_name AS created_by_name
    FROM cash_transactions t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN work_orders wo ON wo.id = t.work_order_id
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.session_id = ?
    ORDER BY t.created_at DESC
  `).all(session.id);
  res.json({ session, breakdown: breakdown(db, session.id), movements, pendingQuotes });
});

router.get('/sessions', requirePermission('cash.view'), (_req, res) => {
  const rows = getDb().prepare(`
    SELECT s.*, o.full_name AS opened_by_name, c.full_name AS closed_by_name
    FROM cash_sessions s
    LEFT JOIN users o ON o.id = s.opened_by
    LEFT JOIN users c ON c.id = s.closed_by
    ORDER BY s.opened_at DESC LIMIT 60
  `).all();
  res.json(rows);
});

router.post('/open', requirePermission('cash.manage'), (req, res) => {
  const db = getDb();
  if (currentSession(db)) {
    return res.status(400).json({ error: 'Ya existe una caja abierta' });
  }
  const b = req.body || {};
  const info = db.prepare(`
    INSERT INTO cash_sessions (opened_by, open_usd, open_bs, open_usdt, notes, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(req.user.id, Number(b.open_usd) || 0, Number(b.open_bs) || 0, Number(b.open_usdt) || 0, b.notes || '');
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/close', requirePermission('cash.manage'), (req, res) => {
  const db = getDb();
  const session = currentSession(db);
  if (!session) return res.status(400).json({ error: 'No hay caja abierta' });
  const b = req.body || {};
  db.prepare(`
    UPDATE cash_sessions SET
      status = 'closed', closed_at = datetime('now','localtime'), closed_by = ?,
      close_usd = ?, close_bs = ?, close_usdt = ?, notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    req.user.id,
    Number(b.close_usd) || 0, Number(b.close_bs) || 0, Number(b.close_usdt) || 0,
    b.notes ?? null, session.id
  );
  res.json({ ok: true, breakdown: breakdown(db, session.id) });
});

router.post('/transactions', requirePermission('cash.manage'), (req, res) => {
  const db = getDb();
  const session = currentSession(db);
  if (!session) return res.status(400).json({ error: 'Debe abrir caja antes de registrar movimientos' });
  const b = req.body || {};
  if (!METHODS.includes(b.payment_method)) {
    return res.status(400).json({ error: 'Método de pago no permitido. Use USD efectivo, Bs efectivo, pago móvil Bs o USDT.' });
  }
  if (!['income', 'expense'].includes(b.type) || !(Number(b.amount) > 0)) {
    return res.status(400).json({ error: 'Tipo y monto válidos son obligatorios' });
  }
  const FINANCE_BUCKETS = ['payroll', 'supplies', 'savings', 'operation'];
  if (b.type === 'expense' && b.finance_bucket && !FINANCE_BUCKETS.includes(b.finance_bucket)) {
    return res.status(400).json({ error: 'Clasificación financiera no válida' });
  }
  const rate = todayRate(db);
  const rateType = b.rate_type || 'bcv';
  const rateValue = Number(b.rate_value) || (rate ? rate[rateType] : 1);
  const amountUsd = amountToUsd(b.amount, b.payment_method, rateType, rateValue);
  const bucket = b.type === 'expense' ? (b.finance_bucket || null) : null;
  const info = db.prepare(`
    INSERT INTO cash_transactions (
      session_id, type, payment_method, amount, amount_usd, rate_type, rate_value,
      client_id, work_order_id, quote_id, description, created_by, finance_bucket
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id, b.type, b.payment_method, Number(b.amount), amountUsd,
    rateType, rateValue, b.client_id || null, b.work_order_id || null,
    b.quote_id || null, b.description || '', req.user.id, bucket
  );
  res.status(201).json({ id: info.lastInsertRowid, amount_usd: amountUsd });
});

/** Venta directa de mostrador: descuenta inventario + ingreso de caja. */
router.post('/sale', requirePermission('cash.manage'), (req, res) => {
  const db = getDb();
  const session = currentSession(db);
  if (!session) return res.status(400).json({ error: 'Debe abrir caja antes de vender' });
  const b = req.body || {};
  if (!METHODS.includes(b.payment_method)) {
    return res.status(400).json({ error: 'Método de pago no permitido' });
  }
  const ivaEnabled = getSetting(db, 'iva_enabled') === '1';
  const ivaRate = Number(getSetting(db, 'iva_rate', '16'));
  const rate = todayRate(db);
  const rateType = b.rate_type || 'bcv';
  const rateValue = Number(b.rate_value) || (rate ? rate[rateType] : 1);

  try {
    const result = db.transaction(() => {
      const items = (b.items || []).map((it) => {
        const qty = Number(it.qty) || 1;
        const unit_price = Number(it.unit_price) || 0;
        return { ...it, qty, unit_price, line_total: Math.round(qty * unit_price * 100) / 100, type: it.type || 'product' };
      });
      const totals = computeTotals(items, ivaEnabled, ivaRate);
      const number = nextNumber(db, 'sale_seq', 'VTA');
      const sale = db.prepare(`
        INSERT INTO sales (number, client_id, session_id, payment_method, subtotal, iva_amount, total, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(number, b.client_id || null, session.id, b.payment_method, totals.subtotal, totals.iva_amount, totals.total, req.user.id);
      const ins = db.prepare(`
        INSERT INTO sale_items (sale_id, catalog_item_id, description, qty, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const it of items) {
        ins.run(sale.lastInsertRowid, it.catalog_item_id || null, it.description, it.qty, it.unit_price, it.line_total);
      }
      deductProducts(items, `Venta ${number}`, 'sale', sale.lastInsertRowid, req.user.id);

      const payAmount = (b.amount !== undefined && b.amount !== null && b.amount !== '')
        ? Number(b.amount) : totals.total;
      const amountUsd = amountToUsd(payAmount, b.payment_method, rateType, rateValue);
      db.prepare(`
        INSERT INTO cash_transactions (
          session_id, type, payment_method, amount, amount_usd, rate_type, rate_value,
          client_id, description, created_by
        ) VALUES (?, 'income', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(session.id, b.payment_method, payAmount, amountUsd, rateType, rateValue, b.client_id || null, `Venta ${number}`, req.user.id);
      return { id: sale.lastInsertRowid, number, ...totals };
    })();
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Cobra una cotización aprobada: registra el ingreso y, si el cobro es exitoso, crea la orden. */
router.post('/collect-quote', requirePermission('cash.manage'), (req, res) => {
  const db = getDb();
  const session = currentSession(db);
  if (!session) return res.status(400).json({ error: 'Debe abrir caja antes de cobrar una cotización' });
  const b = req.body || {};
  if (!METHODS.includes(b.payment_method)) {
    return res.status(400).json({ error: 'Método de pago no permitido. Use USD efectivo, Bs efectivo, pago móvil Bs o USDT.' });
  }
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(b.quote_id);
  if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' });
  quote.items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(quote.id);

  const rate = todayRate(db);
  const rateType = b.rate_type || quote.rate_type || 'bcv';
  const rateValue = Number(b.rate_value) || (rate ? rate[rateType] : quote.rate_value) || 1;
  const payAmount = (b.amount !== undefined && b.amount !== null && b.amount !== '')
    ? Number(b.amount)
    : (b.payment_method.startsWith('bs') ? quote.total * rateValue : quote.total);
  if (!(payAmount > 0)) return res.status(400).json({ error: 'El monto cobrado debe ser mayor a cero' });

  try {
    const result = db.transaction(() => {
      const order = convertQuoteToOrder(db, quote, b, req.user.id);
      const amountUsd = amountToUsd(payAmount, b.payment_method, rateType, rateValue);
      db.prepare(`
        INSERT INTO cash_transactions (
          session_id, type, payment_method, amount, amount_usd, rate_type, rate_value,
          client_id, work_order_id, quote_id, description, created_by
        ) VALUES (?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id, b.payment_method, payAmount, amountUsd, rateType, rateValue,
        quote.client_id, order.id, quote.id,
        `Cobro ${quote.number} → ${order.number}`, req.user.id
      );
      return { order, amount: payAmount, amount_usd: amountUsd };
    })();
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
