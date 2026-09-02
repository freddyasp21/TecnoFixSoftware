import { usd } from '../api';

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_ES[(m || 1) - 1]} ${y}`;
}

function niceMax(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(n));
  const scaled = n / exp;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * exp;
}

function shortName(name, max = 14) {
  const s = String(name || 'Servicio');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function curvePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function MonthSelect({ id, month, months, onChange }) {
  return (
    <select
      aria-label={id}
      className="w-auto min-w-[10.5rem] rounded-full border-violet-100 py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-600"
      value={month || ''}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {(months || (month ? [month] : [])).map((m) => (
        <option key={m} value={m}>{monthLabel(m)}</option>
      ))}
    </select>
  );
}

export function ServicesBarChart({ services, month, months, onMonthChange }) {
  const rows = services || [];
  const max = niceMax(Math.max(0, ...rows.flatMap((s) => [s.qty, s.orders])));
  const W = 640;
  const H = 280;
  const pad = { l: 36, r: 16, t: 16, b: 48 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = Math.max(rows.length, 1);
  const groupW = innerW / n;
  const barW = Math.min(10, groupW * 0.18);
  const ticks = 5;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">Servicios más pedidos</h2>
          <p className="text-xs text-slate-400">Cantidad de veces y órdenes que lo incluyen</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Pedidos
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full bg-[#5255F9]" /> Órdenes
          </span>
          <MonthSelect id="Mes de servicios" month={month} months={months} onChange={onMonthChange} />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">No hay servicios registrados en este mes.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" role="img" aria-label="Servicios más pedidos">
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const v = (max / ticks) * (ticks - i);
            const y = pad.t + (innerH * i) / ticks;
            return (
              <g key={i}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#EDE9FE" strokeWidth="1" />
                <text x={pad.l - 8} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="10">
                  {Math.round(v)}
                </text>
              </g>
            );
          })}
          {rows.map((s, i) => {
            const cx = pad.l + groupW * i + groupW / 2;
            const h1 = (s.qty / max) * innerH;
            const h2 = (s.orders / max) * innerH;
            const y1 = pad.t + innerH - h1;
            const y2 = pad.t + innerH - h2;
            return (
              <g key={s.name}>
                <rect x={cx - barW - 3} y={y1} width={barW} height={Math.max(h1, 2)} rx={barW / 2} fill="#5A2EE5">
                  <title>{`${s.name}: ${s.qty} pedidos`}</title>
                </rect>
                <rect x={cx + 3} y={y2} width={barW} height={Math.max(h2, 2)} rx={barW / 2} fill="#5255F9">
                  <title>{`${s.name}: ${s.orders} órdenes`}</title>
                </rect>
                <text x={cx} y={H - 16} textAnchor="middle" className="fill-slate-400" fontSize="10">
                  {shortName(s.name, groupW > 80 ? 12 : 8)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function IncomeAreaChart({ income, month, months, onMonthChange, total }) {
  const rows = income || [];
  const max = niceMax(Math.max(0, ...rows.map((r) => r.income_usd)));
  const W = 640;
  const H = 280;
  const pad = { l: 44, r: 16, t: 20, b: 36 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const last = Math.max(rows.length - 1, 1);
  const points = rows.map((r, i) => ({
    ...r,
    x: pad.l + (innerW * i) / last,
    y: pad.t + innerH - (r.income_usd / max) * innerH,
  }));
  const line = curvePath(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${pad.t + innerH} L ${points[0].x} ${pad.t + innerH} Z`
    : '';
  const labelEvery = rows.length > 16 ? 5 : rows.length > 10 ? 3 : 2;
  const ticks = 4;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">Ingresos por mes</h2>
          <p className="text-xs text-slate-400">Total del mes {usd(total)}</p>
        </div>
        <MonthSelect id="Mes de ingresos" month={month} months={months} onChange={onMonthChange} />
      </div>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">No hay ingresos en este mes.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" role="img" aria-label="Ingresos por mes">
          <defs>
            <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5255F9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5255F9" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const y = pad.t + (innerH * i) / ticks;
            return (
              <line key={i} x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#EDE9FE" strokeWidth="1" />
            );
          })}
          <path d={area} fill="url(#incomeFill)" />
          <path d={line} fill="none" stroke="#5255F9" strokeWidth="2.5" strokeLinejoin="round" />
          {points.map((p) => (
            <g key={p.day}>
              <circle cx={p.x} cy={p.y} r="4.5" fill="white" stroke="#5255F9" strokeWidth="2">
                <title>{`${p.day}: ${usd(p.income_usd)}`}</title>
              </circle>
            </g>
          ))}
          {points.map((p, i) => (
            (i === 0 || i === points.length - 1 || i % labelEvery === 0) ? (
              <text key={`l-${p.day}`} x={p.x} y={H - 12} textAnchor="middle" className="fill-slate-400" fontSize="10">
                {p.label}
              </text>
            ) : null
          ))}
        </svg>
      )}
    </div>
  );
}

export default function DashboardCharts({
  services, income, months,
  servicesMonth, incomeMonth,
  onServicesMonth, onIncomeMonth,
  incomeTotal,
}) {
  return (
    <div className="mb-6 grid gap-4 xl:grid-cols-2">
      <ServicesBarChart
        services={services}
        month={servicesMonth}
        months={months}
        onMonthChange={onServicesMonth}
      />
      <IncomeAreaChart
        income={income}
        month={incomeMonth}
        months={months}
        total={incomeTotal}
        onMonthChange={onIncomeMonth}
      />
    </div>
  );
}
