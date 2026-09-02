import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Wallet, Wrench, TrendingUp } from 'lucide-react';
import { api, usd, rateLabel, statusMeta, localDate, ORDER_STATUS } from '../api';
import { Badge, ErrorBox, Field, PageHeader } from '../components/ui';
import OrderCard from '../components/OrderCard';
import DashboardCharts from '../components/DashboardCharts';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { can, user } = useAuth();
  const canRates = can('rates.manage');
  const canHistory = user?.role === 'Administrador' || user?.role === 'Gerente';
  const canFinance = can('finance.view');
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [rates, setRates] = useState(null);
  const [ratesReady, setRatesReady] = useState(false);
  const [recent, setRecent] = useState([]);
  const [servicesMonth, setServicesMonth] = useState('');
  const [incomeMonth, setIncomeMonth] = useState('');
  const [serviceCharts, setServiceCharts] = useState(null);
  const [incomeCharts, setIncomeCharts] = useState(null);
  const [form, setForm] = useState({ rate_date: localDate(), bcv: '', euro: '', usdt: '' });
  const [rateMsg, setRateMsg] = useState('');

  function loadRates() {
    api('/rates/today')
      .then((r) => setRates(r || null))
      .catch(() => setRates(null))
      .finally(() => setRatesReady(true));
  }

  useEffect(() => {
    if (can('dashboard.view')) {
      api('/dashboard').then(setData).catch(() => {});
    }
    if (can('alerts.view')) {
      api('/alerts/summary').then(setAlerts).catch(() => {});
    }
    if (can('orders.view')) {
      api('/orders').then((rows) => setRecent((rows || []).slice(0, 8))).catch(() => {});
    }
    api('/ops').then((ops) => {
      if (ops?.current_date) setForm((f) => ({ ...f, rate_date: f.rate_date || ops.current_date }));
    }).catch(() => {});
    loadRates();
  }, []);

  useEffect(() => {
    if (!can('dashboard.view')) return;
    const q = servicesMonth ? `?month=${servicesMonth}` : '';
    api(`/dashboard/charts${q}`).then((d) => {
      setServiceCharts(d);
      if (d?.month) setServicesMonth((m) => m || d.month);
    }).catch(() => setServiceCharts(null));
  }, [servicesMonth]);

  useEffect(() => {
    if (!can('dashboard.view')) return;
    const q = incomeMonth ? `?month=${incomeMonth}` : '';
    api(`/dashboard/charts${q}`).then((d) => {
      setIncomeCharts(d);
      if (d?.month) setIncomeMonth((m) => m || d.month);
    }).catch(() => setIncomeCharts(null));
  }, [incomeMonth]);

  const k = data?.kpis || {};
  const pendingCollect = data?.pendingCollect || [];
  const collectCount = pendingCollect.length;
  const alertTotal = Number(alerts?.counts?.total) || 0;
  const ratesOk = Boolean(rates);

  const statusRows = useMemo(() => {
    const map = Object.fromEntries((data?.orders || []).map((o) => [o.status, Number(o.n) || 0]));
    return ORDER_STATUS.map((s) => ({ ...s, n: map[s.id] || 0 }));
  }, [data]);
  const maxStatus = Math.max(1, ...statusRows.map((s) => s.n));
  const statusTotal = statusRows.reduce((s, r) => s + r.n, 0) || 1;
  const donut = [
    { label: 'Pendientes', n: Number(k.pending) || 0, color: '#5A2EE5' },
    { label: 'Entregas hoy', n: Number(k.delivered) || 0, color: '#5255F9' },
    { label: 'Órdenes hoy', n: Number(k.orders) || 0, color: '#FBBF24' },
  ];
  const donutSum = donut.reduce((s, d) => s + d.n, 0) || 1;
  let acc = 0;
  const donutStops = donut.map((d) => {
    const start = (acc / donutSum) * 100;
    acc += d.n;
    const end = (acc / donutSum) * 100;
    return `${d.color} ${start}% ${end}%`;
  }).join(', ');

  async function saveRates(e) {
    e.preventDefault();
    setRateMsg('');
    try {
      await api('/rates', { method: 'POST', body: form });
      loadRates();
    } catch (err) {
      setRateMsg(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Panel operativo"
        subtitle="Resumen del día en el taller"
      />

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <div className="hero-gradient relative overflow-hidden rounded-[28px] p-6 text-white shadow-card xl:col-span-2">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-0 right-10 h-28 w-28 rounded-full bg-[#5255F9]/40" />
          <p className="text-sm font-medium text-white/80">Día operativo</p>
          <h2 className="mt-1 text-3xl font-extrabold">{form.rate_date}</h2>
          <p className="mt-2 max-w-md text-sm text-white/80">
            {ratesOk
              ? 'Tasas listas. Puede abrir caja, cotizar y cobrar para crear órdenes.'
              : 'Falta la tasa del día. Sin ella no se abre caja ni se cotiza.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {can('cash.view') && <Link className="btn-primary" to="/caja"><Wallet size={16} /> Ir a caja</Link>}
            <Link className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25" to="/ordenes">
              Ver órdenes
            </Link>
          </div>
          {ratesOk && (
            <div className="mt-6 grid grid-cols-3 gap-3">
              {['bcv', 'euro', 'usdt'].map((key) => (
                <div key={key} className="rounded-2xl bg-white/15 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-white/70">{rateLabel(key)}</div>
                  <div className="text-lg font-bold">{Number(rates[key]).toLocaleString('es-VE')}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card flex flex-col justify-between p-5">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-brand-500">
              {ratesOk ? <TrendingUp size={22} /> : <Bell size={22} />}
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-800">
              {canRates ? 'Actualizar tasa' : 'Tasa del día'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {ratesOk
                ? 'BCV, Euro y USDT ya están cargados para hoy.'
                : (canRates ? 'Cargue las tres tasas para operar.' : 'Pida al administrador que las cargue.')}
            </p>
          </div>
          <Link to="/tasas" className={ratesOk ? 'btn-ghost mt-4' : 'btn-primary mt-4'}>
            {ratesOk ? (canHistory ? 'Ver historial' : 'Ver tasa') : 'Ir a Tasas'}
          </Link>
        </div>
      </div>

      {ratesReady && !ratesOk && canRates && (
        <form onSubmit={saveRates} className="card mb-6 grid gap-3 p-5 md:grid-cols-5">
          <Field label="Fecha"><input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></Field>
          <Field label="BCV (Bs / USD)"><input type="number" step="0.01" value={form.bcv} onChange={(e) => setForm({ ...form, bcv: e.target.value })} required /></Field>
          <Field label="Dólar € (Bs / EUR)"><input type="number" step="0.01" value={form.euro} onChange={(e) => setForm({ ...form, euro: e.target.value })} required /></Field>
          <Field label="USDT (Bs / USDT)"><input type="number" step="0.01" value={form.usdt} onChange={(e) => setForm({ ...form, usdt: e.target.value })} required /></Field>
          <div className="flex items-end"><button className="btn-primary w-full">Guardar tasas</button></div>
          {rateMsg && <div className="md:col-span-5"><ErrorBox error={rateMsg} /></div>}
        </form>
      )}

      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-bold text-slate-800">Crear orden desde caja</h3>
          <p className="text-sm text-slate-500">Cotice, cobre y la orden queda registrada con la tasa del día.</p>
        </div>
        {can('quotes.manage')
          ? <Link className="btn-dark" to="/cotizaciones/nueva">Nueva cotización</Link>
          : <Link className="btn-ghost" to="/ordenes">Ver órdenes</Link>}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Cobros pendientes', value: collectCount, to: can('cash.view') ? '/caja' : '/alertas', alert: collectCount > 0 },
          { label: 'Órdenes hoy', value: k.orders ?? '—', to: '/ordenes' },
          { label: 'Pendientes', value: k.pending ?? '—', to: '/ordenes' },
          { label: 'Entregas hoy', value: k.delivered ?? '—', to: '/ordenes' },
        ].map((c) => (
          <Link key={c.label} to={c.to} className={`card p-5 ${c.alert ? 'border-amber-200 bg-amber-50' : ''}`}>
            <div className={`text-xs font-semibold uppercase tracking-wide ${c.alert ? 'text-amber-800' : 'text-slate-400'}`}>{c.label}</div>
            <div className={`mt-2 text-3xl font-extrabold ${c.alert ? 'text-amber-900' : 'text-slate-800'}`}>{c.value}</div>
          </Link>
        ))}
      </div>

      {(canFinance || can('workers.view') || can('alerts.view')) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {canFinance && (
            <>
              <Link to="/finanzas" className="card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ingresos USD</div>
                <div className="mt-2 text-2xl font-extrabold text-slate-800">{usd(k.income_usd)}</div>
              </Link>
              <Link to="/finanzas" className="card p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Egresos USD</div>
                <div className="mt-2 text-2xl font-extrabold text-slate-800">{usd(k.expense_usd)}</div>
              </Link>
            </>
          )}
          {can('workers.view') && (
            <Link to="/trabajadores" className="card p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Trabajadores</div>
              <div className="mt-2 text-2xl font-extrabold text-slate-800">Nómina</div>
            </Link>
          )}
          {(can('alerts.view') || can('dashboard.view')) && (
            <Link to="/alertas" className={`card p-5 ${alertTotal > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Alertas</div>
              <div className="mt-2 text-2xl font-extrabold text-slate-800">{alertTotal}</div>
            </Link>
          )}
        </div>
      )}

      <DashboardCharts
        services={serviceCharts?.services}
        income={incomeCharts?.income}
        months={serviceCharts?.months || incomeCharts?.months}
        servicesMonth={servicesMonth || serviceCharts?.month}
        incomeMonth={incomeMonth || incomeCharts?.month}
        onServicesMonth={setServicesMonth}
        onIncomeMonth={setIncomeMonth}
        incomeTotal={incomeCharts?.income_total}
      />

      {recent.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Órdenes recientes</h2>
            <Link className="text-sm font-semibold text-brand-500" to="/ordenes">Ver todas</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.slice(0, 4).map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        </section>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-slate-800">Órdenes por estado (hoy)</h2>
          <div className="flex h-40 items-end gap-2">
            {statusRows.map((s) => (
              <div key={s.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-[#5255F9]"
                  style={{ height: `${Math.max(6, (s.n / maxStatus) * 100)}%` }}
                  title={`${s.label}: ${s.n}`}
                />
                <span className="truncate text-[10px] text-slate-400">{s.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-slate-800">Actividad</h2>
          <div className="flex items-center gap-6">
            <div
              className="h-36 w-36 shrink-0 rounded-full"
              style={{ background: `conic-gradient(${donutStops})`, mask: 'radial-gradient(farthest-side, transparent 58%, #000 59%)', WebkitMask: 'radial-gradient(farthest-side, transparent 58%, #000 59%)' }}
            />
            <ul className="space-y-2 text-sm">
              {donut.map((d) => (
                <li key={d.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-500">{d.label}</span>
                  <b className="ml-auto text-slate-800">{d.n}</b>
                </li>
              ))}
              <li className="text-xs text-slate-400">Hoy: {statusTotal} en estados de cobro</li>
            </ul>
          </div>
        </div>
      </div>

      {collectCount > 0 && (
        <div className="card table-wrap">
          <div className="flex items-center justify-between border-b border-violet-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-800">Cobros pendientes</h2>
              <p className="text-xs text-slate-400">Cotizaciones aprobadas. Al cobrarlas en caja esta alerta desaparece.</p>
            </div>
            {can('cash.view')
              ? <Link className="btn-amber" to="/caja">Ir a caja</Link>
              : <Link className="btn-ghost" to="/alertas">Ver alertas</Link>}
          </div>
          <table className="data">
            <thead>
              <tr><th>Número</th><th>Cliente</th><th>Total USD</th><th></th></tr>
            </thead>
            <tbody>
              {pendingCollect.map((q) => (
                <tr key={q.id}>
                  <td className="font-semibold">
                    <Link className="text-brand-500" to={`/cotizaciones/${q.id}`}>{q.number}</Link>
                  </td>
                  <td>{q.client_name || '—'}</td>
                  <td className="font-semibold">{usd(q.total)}</td>
                  <td className="text-right">
                    {can('cash.view')
                      ? <Link className="btn-primary !py-1.5" to="/caja">Cobrar</Link>
                      : <Link className="btn-ghost" to={`/cotizaciones/${q.id}`}>Ver</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {collectCount === 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold text-slate-800">Estados de hoy</h2>
          <div className="flex flex-wrap gap-2">
            {(data?.orders || []).length === 0 && <p className="text-sm text-slate-500">Sin movimientos hoy.</p>}
            {(data?.orders || []).map((o) => {
              const m = statusMeta(o.status);
              return <Badge key={o.status} className={m.color}>{m.label}: {o.n}</Badge>;
            })}
          </div>
          <div className="mt-4">
            <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-500" to="/ordenes">
              <Wrench size={16} /> Ir al módulo de órdenes
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
