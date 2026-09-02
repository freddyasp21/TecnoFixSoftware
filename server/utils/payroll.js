/**
 * Nómina quincenal: comisiones (sobre % de caja, por días laborados)
 * y salario fijo con incremento por años de antigüedad.
 */
const { getSetting, round2, localDate } = require('./helpers');
const { opsStartDate } = require('./opsDay');

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

function yearsOfService(hiredAt, asOf = localDate()) {
  if (!hiredAt) return 0;
  const a = new Date(`${String(hiredAt).slice(0, 10)}T12:00:00`);
  const b = new Date(`${String(asOf).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  let years = b.getFullYear() - a.getFullYear();
  const monthDiff = b.getMonth() - a.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && b.getDate() < a.getDate())) years -= 1;
  return Math.max(0, years);
}

function salaryIncrementPct(db) {
  const n = Number(getSetting(db, 'salary_increment_pct_per_year', '5'));
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

function effectiveMonthlySalary(worker, incrementPct, asOf) {
  const base = Number(worker.base_salary_usd) || 0;
  const years = yearsOfService(worker.hired_at, asOf);
  return round2(base * (1 + years * (Number(incrementPct) || 0) / 100));
}

function salaryDueInRange(monthly, from, to) {
  const days = daysInPeriod(from, to).length;
  return round2((Number(monthly) || 0) * days / 30);
}

function paidInPeriod(db, workerId, from, to, kind) {
  return round2(db.prepare(`
    SELECT COALESCE(SUM(amount_usd), 0) AS n FROM payroll_payments
    WHERE worker_id = ? AND period_from = ? AND period_to = ?
      AND COALESCE(kind, 'commission') = ?
  `).get(workerId, from, to, kind).n);
}

function buildPayroll(db, period) {
  const start = opsStartDate(db);
  const from = start && period.from < start ? start : period.from;
  const to = period.to;
  const income = round2(db.prepare(`
    SELECT COALESCE(SUM(amount_usd), 0) AS n FROM cash_transactions
    WHERE type = 'income' AND date(created_at) BETWEEN date(?) AND date(?)
  `).get(from, to).n);
  const pct = Number(getSetting(db, 'finance_pct_payroll', '40')) || 0;
  const pool = round2(income * pct / 100);
  const incrementPct = salaryIncrementPct(db);
  const asOf = period.to;

  const workers = db.prepare(`
    SELECT * FROM workers WHERE active = 1 ORDER BY full_name COLLATE NOCASE
  `).all();
  const daysStmt = db.prepare(`
    SELECT COUNT(*) AS n FROM worker_attendance
    WHERE worker_id = ? AND worked = 1 AND day BETWEEN ? AND ?
  `);
  const attRows = db.prepare(`
    SELECT worker_id, day FROM worker_attendance
    WHERE worked = 1 AND day BETWEEN ? AND ?
  `).all(from, to);
  const daysByWorker = {};
  for (const a of attRows) {
    (daysByWorker[a.worker_id] ||= []).push(a.day);
  }

  const rows = workers.map((w) => {
    const days = daysStmt.get(w.id, from, to).n;
    return { worker: w, days };
  });
  const totalDays = rows.reduce((s, r) => s + r.days, 0);

  const list = rows.map((r) => {
    const commissionAllocated = totalDays > 0 ? round2(pool * (r.days / totalDays)) : 0;
    const commissionPaid = paidInPeriod(db, r.worker.id, period.from, period.to, 'commission');
    const monthly = effectiveMonthlySalary(r.worker, incrementPct, asOf);
    const salaryAllocated = salaryDueInRange(monthly, period.from, period.to);
    const salaryPaid = paidInPeriod(db, r.worker.id, period.from, period.to, 'salary');
    const years = yearsOfService(r.worker.hired_at, asOf);
    return {
      id: r.worker.id,
      full_name: r.worker.full_name,
      document: r.worker.document,
      phone: r.worker.phone,
      position: r.worker.position,
      hired_at: r.worker.hired_at || '',
      base_salary_usd: Number(r.worker.base_salary_usd) || 0,
      years_service: years,
      monthly_salary_usd: monthly,
      days_worked: r.days,
      worked_days: daysByWorker[r.worker.id] || [],
      allocated_usd: commissionAllocated,
      paid_usd: commissionPaid,
      remaining_usd: round2(commissionAllocated - commissionPaid),
      salary_allocated_usd: salaryAllocated,
      salary_paid_usd: salaryPaid,
      salary_remaining_usd: round2(salaryAllocated - salaryPaid),
    };
  });

  const commissionPaidTotal = round2(list.reduce((s, w) => s + w.paid_usd, 0));
  const salaryPool = round2(list.reduce((s, w) => s + w.salary_allocated_usd, 0));
  const salaryPaidTotal = round2(list.reduce((s, w) => s + w.salary_paid_usd, 0));
  return {
    period,
    days: daysInPeriod(period.from, period.to),
    income_usd: income,
    payroll_pct: pct,
    pool_usd: pool,
    paid_usd: commissionPaidTotal,
    remaining_usd: round2(pool - commissionPaidTotal),
    salary_increment_pct: incrementPct,
    salary_pool_usd: salaryPool,
    salary_paid_usd: salaryPaidTotal,
    salary_remaining_usd: round2(salaryPool - salaryPaidTotal),
    workers: list,
  };
}

function salaryEnvelope(db, from, to) {
  const incrementPct = salaryIncrementPct(db);
  const workers = db.prepare(`SELECT * FROM workers WHERE active = 1`).all();
  const allocated = round2(workers.reduce((s, w) => {
    const monthly = effectiveMonthlySalary(w, incrementPct, to);
    return s + salaryDueInRange(monthly, from, to);
  }, 0));
  const spent = round2(db.prepare(`
    SELECT COALESCE(SUM(amount_usd), 0) AS n FROM cash_transactions
    WHERE type = 'expense' AND finance_bucket = 'salary'
      AND date(created_at) BETWEEN date(?) AND date(?)
  `).get(from, to).n);
  return {
    id: 'salary',
    label: 'Salario',
    hint: `Sueldo fijo. Cada año de antigüedad suma ${incrementPct}% sobre el sueldo base. Lo asigna admin o gerente.`,
    pct: incrementPct,
    pctLabel: `${incrementPct}%/año`,
    allocated,
    spent,
    remaining: round2(allocated - spent),
  };
}

module.exports = {
  quincena,
  buildPayroll,
  daysInPeriod,
  lastDayOfMonth,
  yearsOfService,
  effectiveMonthlySalary,
  salaryIncrementPct,
  salaryDueInRange,
  salaryEnvelope,
};
