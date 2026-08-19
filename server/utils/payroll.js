/**
 * Nómina quincenal: 40% de los ingresos de caja, repartido por días laborados.
 */
const { getSetting, round2 } = require('./helpers');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function lastDayOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function quincena(year, month, half) {
  const y = Number(year);
  const m = Number(month);
  const h = Number(half) === 2 ? 2 : 1;
  if (!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12)) {
    throw Object.assign(new Error('Año o mes no válido'), { status: 400 });
  }
  const mm = pad(m);
  if (h === 1) {
    return {
      year: y, month: m, half: 1, kind: 'q1',
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-15`,
      label: `1 al 15 de ${MONTHS[m - 1]} ${y}`,
    };
  }
  const last = lastDayOfMonth(y, m);
  return {
    year: y, month: m, half: 2, kind: 'q2',
    from: `${y}-${mm}-16`,
    to: `${y}-${mm}-${pad(last)}`,
    label: `16 al ${last} de ${MONTHS[m - 1]} ${y}`,
  };
}

function daysInPeriod(from, to) {
  const list = [];
  let cur = from;
  while (cur <= to) {
    list.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    cur = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  }
  return list;
}

function buildPayroll(db, period) {
  const income = round2(db.prepare(`
    SELECT COALESCE(SUM(amount_usd), 0) AS n FROM cash_transactions
    WHERE type = 'income' AND date(created_at) BETWEEN date(?) AND date(?)
  `).get(period.from, period.to).n);
  const pct = Number(getSetting(db, 'finance_pct_payroll', '40')) || 0;
  const pool = round2(income * pct / 100);

  const workers = db.prepare(`
    SELECT * FROM workers WHERE active = 1 ORDER BY full_name COLLATE NOCASE
  `).all();
  const daysStmt = db.prepare(`
    SELECT COUNT(*) AS n FROM worker_attendance
    WHERE worker_id = ? AND worked = 1 AND day BETWEEN ? AND ?
  `);
  const paidStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_usd), 0) AS n FROM payroll_payments
    WHERE worker_id = ? AND period_from = ? AND period_to = ?
  `);
  const attRows = db.prepare(`
    SELECT worker_id, day FROM worker_attendance
    WHERE worked = 1 AND day BETWEEN ? AND ?
  `).all(period.from, period.to);
  const daysByWorker = {};
  for (const a of attRows) {
    (daysByWorker[a.worker_id] ||= []).push(a.day);
  }

  const rows = workers.map((w) => {
    const days = daysStmt.get(w.id, period.from, period.to).n;
    const weight = round2((Number(w.share_weight) || 1) * days);
    return { worker: w, days, weight };
  });
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);

  const list = rows.map((r) => {
    const allocated = totalWeight > 0 ? round2(pool * (r.weight / totalWeight)) : 0;
    const paid = round2(paidStmt.get(r.worker.id, period.from, period.to).n);
    return {
      id: r.worker.id,
      full_name: r.worker.full_name,
      document: r.worker.document,
      phone: r.worker.phone,
      position: r.worker.position,
      share_weight: r.worker.share_weight,
      days_worked: r.days,
      worked_days: daysByWorker[r.worker.id] || [],
      weight: r.weight,
      allocated_usd: allocated,
      paid_usd: paid,
      remaining_usd: round2(allocated - paid),
    };
  });

  const paidTotal = round2(list.reduce((s, w) => s + w.paid_usd, 0));
  return {
    period,
    days: daysInPeriod(period.from, period.to),
    income_usd: income,
    payroll_pct: pct,
    pool_usd: pool,
    paid_usd: paidTotal,
    remaining_usd: round2(pool - paidTotal),
    workers: list,
  };
}

module.exports = { quincena, buildPayroll, daysInPeriod, lastDayOfMonth };
