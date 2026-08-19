const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { getSetting, nextNumber, computeTotals, todayRate } = require('../utils/helpers');

const router = express.Router();
router.use(authRequired);

function hydrate(quote) {
  if (!quote) return null;
  quote.items = getDb().prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(quote.id);
  return quote;
}

router.get('/', requirePermission('quotes.view'), (req, res) => {
  const includeConverted = req.query.all === '1';
  const rows = getDb().prepare(`
    SELECT q.*, c.name AS client_name, u.full_name AS created_by_name
    FROM quotes q
    LEFT JOIN clients c ON c.id = q.client_id
    LEFT JOIN users u ON u.id = q.created_by
    WHERE ${includeConverted ? '1=1' : "q.status != 'convertida'"}
    ORDER BY q.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/:id', requirePermission('quotes.view'), (req, res) => {
  const db = getDb();
  const quote = db.prepare(`
    SELECT q.*, c.name AS client_name
    FROM quotes q LEFT JOIN clients c ON c.id = q.client_id
    WHERE q.id = ?
  `).get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' });
  const order = db.prepare('SELECT id, number FROM work_orders WHERE quote_id = ?').get(quote.id);
  res.json({ ...hydrate(quote), order: order || null });
});

function persistItems(db, quoteId, items, ivaEnabled, ivaRate) {
  db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(quoteId);
  const ins = db.prepare(`
    INSERT INTO quote_items (quote_id, catalog_item_id, type, description, qty, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const normalized = (items || []).map((it) => {
    const qty = Number(it.qty) || 1;
    const unit_price = Number(it.unit_price) || 0;
    return {
      ...it,
      qty,
      unit_price,
      line_total: Math.round(qty * unit_price * 100) / 100,
      type: it.type === 'service' ? 'service' : 'product',
    };
  });
  for (const it of normalized) {
    ins.run(quoteId, it.catalog_item_id || null, it.type, it.description, it.qty, it.unit_price, it.line_total);
  }
  const totals = computeTotals(normalized, ivaEnabled, ivaRate);
  db.prepare(`
    UPDATE quotes SET subtotal = ?, iva_amount = ?, total = ?,
      updated_at = datetime('now','localtime') WHERE id = ?
  `).run(totals.subtotal, totals.iva_amount, totals.total, quoteId);
  return totals;
}

router.post('/', requirePermission('quotes.manage'), (req, res) => {
  const b = req.body || {};
  const db = getDb();
  const rate = todayRate(db);
  const rateType = b.rate_type || 'bcv';
  const rateValue = Number(b.rate_value) || (rate ? rate[rateType] : 1);
  const ivaEnabled = b.iva_enabled != null ? (b.iva_enabled ? 1 : 0) : (getSetting(db, 'iva_enabled') === '1' ? 1 : 0);
  const ivaRate = Number(b.iva_rate) || Number(getSetting(db, 'iva_rate', '16'));

  const tx = db.transaction(() => {
    const number = nextNumber(db, 'quote_seq', 'COT');
    const info = db.prepare(`
      INSERT INTO quotes (number, client_id, status, rate_type, rate_value, iva_enabled, iva_rate, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      number, b.client_id || null, b.status || 'borrador',
      rateType, rateValue, ivaEnabled, ivaRate, b.notes || '', req.user.id
    );
    persistItems(db, info.lastInsertRowid, b.items || [], ivaEnabled, ivaRate);
    return info.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json(hydrate(db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)));
});

router.put('/:id', requirePermission('quotes.manage'), (req, res) => {
  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (quote.status === 'convertida') {
    return res.status(400).json({ error: 'No se puede editar una cotización ya convertida' });
  }
  const b = req.body || {};
  const ivaEnabled = b.iva_enabled != null ? (b.iva_enabled ? 1 : 0) : quote.iva_enabled;
  const ivaRate = b.iva_rate != null ? Number(b.iva_rate) : quote.iva_rate;
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE quotes SET
        client_id = COALESCE(?, client_id),
        status = COALESCE(?, status),
        rate_type = COALESCE(?, rate_type),
        rate_value = COALESCE(?, rate_value),
        iva_enabled = ?,
        iva_rate = ?,
        notes = COALESCE(?, notes),
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      b.client_id ?? null, b.status ?? null, b.rate_type ?? null,
      b.rate_value == null ? null : Number(b.rate_value),
      ivaEnabled, ivaRate, b.notes ?? null, quote.id
    );
    if (b.items) persistItems(db, quote.id, b.items, ivaEnabled, ivaRate);
  });
  tx();
  res.json(hydrate(db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote.id)));
});

router.delete('/:id', requirePermission('quotes.delete'), (req, res) => {
  const db = getDb();
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (quote.status === 'convertida') {
    return res.status(400).json({ error: 'No se puede eliminar una cotización convertida' });
  }
  db.prepare('DELETE FROM quotes WHERE id = ?').run(quote.id);
  res.json({ ok: true });
});

module.exports = router;
