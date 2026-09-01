import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, usd, rateLabel, statusMeta, localDate } from '../api';
import { Badge, ErrorBox, Field, PageHeader } from '../components/ui';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { can, user } = useAuth();
  const isAdmin = user?.role === 'Administrador';
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [rates, setRates] = useState(null);
  const [ratesReady, setRatesReady] = useState(false);
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
    loadRates();
  }, []);

  const k = data?.kpis || {};
  const pendingCollect = data?.pendingCollect || [];
  const collectCount = pendingCollect.length;
  const alertTotal = Number(alerts?.counts?.total) || 0;
  const ratesOk = Boolean(rates);

  const cards = [
    {
      label: 'Cobros pendientes',
      value: collectCount,
      to: can('cash.view') ? '/caja' : '/alertas',
      alert: collectCount > 0,
    },
    { label: 'Órdenes hoy', value: k.orders ?? '—', to: '/ordenes' },
    { label: 'Pendientes', value: k.pending ?? '—', to: '/ordenes' },
    { label: 'Entregas hoy', value: k.delivered ?? '—', to: '/ordenes' },
    { label: 'Stock bajo', value: k.low_stock ?? '—', to: '/inventario' },
  ];
  if (isAdmin) {
    cards.push(
      { label: 'Ingresos USD', value: usd(k.income_usd), to: '/finanzas' },
      { label: 'Egresos USD', value: usd(k.expense_usd), to: '/finanzas' },
      { label: 'Gestión financiera', value: '40 / 30 / 20', to: '/finanzas' },
      { label: 'Trabajadores / nómina', value: 'Quincena', to: '/trabajadores' },
    );
  }
  if (can('alerts.view') || can('dashboard.view')) {
    cards.push({ label: 'Alertas', value: alertTotal, to: '/alertas', alert: alertTotal > 0 });
  }

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

      {ratesReady && (
        <div className={`mb-6 rounded-2xl border-2 p-5 shadow-card ${
          ratesOk ? 'border-emerald-400 bg-emerald-100' : 'border-rose-400 bg-rose-100'
        }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={`font-semibold ${ratesOk ? 'text-emerald-950' : 'text-rose-950'}`}>
                {isAdmin ? 'Actualizar tasa' : 'Tasa del día'}
              </h2>
              {ratesOk ? (
                <p className="mt-1 text-sm text-emerald-900">
                  Tasas del día registradas. Ya puede abrir caja y cotizar. La orden se crea al cobrar.
                </p>
              ) : (
                <p className="mt-1 text-sm text-rose-900">
                  {isAdmin
                    ? 'Aún no hay tasas del día. Actualícelas para abrir caja y cotizar.'
                    : 'Aún no hay tasas del día. El administrador debe actualizarlas para abrir caja y cotizar.'}
                </p>
              )}
            </div>
            <Link to="/tasas" className={ratesOk ? 'btn-ghost' : 'btn-primary'}>
              {ratesOk ? 'Ver historial' : 'Ir a Tasas'}
            </Link>
          </div>

          {ratesOk ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {['bcv', 'euro', 'usdt'].map((key) => (
                <div key={key} className="rounded-xl bg-white/70 p-3">
                  <div className="text-xs uppercase text-emerald-800">{rateLabel(key)}</div>
                  <div className="mt-1 text-lg font-bold text-ink-900">{Number(rates[key]).toLocaleString('es-VE')}</div>
                </div>
              ))}
            </div>
          ) : isAdmin ? (
            <form onSubmit={saveRates} className="mt-4 grid gap-3 md:grid-cols-5">
              <Field label="Fecha"><input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></Field>
              <Field label="BCV (Bs / USD)"><input type="number" step="0.01" value={form.bcv} onChange={(e) => setForm({ ...form, bcv: e.target.value })} required /></Field>
              <Field label="Dólar € (Bs / EUR)"><input type="number" step="0.01" value={form.euro} onChange={(e) => setForm({ ...form, euro: e.target.value })} required /></Field>
              <Field label="USDT (Bs / USDT)"><input type="number" step="0.01" value={form.usdt} onChange={(e) => setForm({ ...form, usdt: e.target.value })} required /></Field>
              <div className="flex items-end"><button className="btn-primary w-full">Guardar tasas</button></div>
              {rateMsg && <div className="md:col-span-5"><ErrorBox error={rateMsg} /></div>}
            </form>
          ) : (
            <p className="mt-3 text-sm text-rose-900">Pida al administrador que cargue las tasas del día.</p>
          )}
        </div>
      )}

      {collectCount > 0 && (
        <div className="card mb-6 table-wrap border-2 border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between border-b border-amber-200 px-4 py-3">
            <div>
              <h2 className="font-semibold text-amber-950">Cobros pendientes</h2>
              <p className="text-xs text-amber-800">
                Cotizaciones aprobadas. Al cobrarlas en caja esta alerta desaparece.
              </p>
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
                    <Link className="text-brand-600" to={`/cotizaciones/${q.id}`}>{q.number}</Link>
                  </td>
                  <td>{q.client_name || '—'}</td>
                  <td className="font-semibold text-amber-900">{usd(q.total)}</td>
                  <td className="text-right">
                    {can('cash.view')
                      ? <Link className="btn-amber" to="/caja">Cobrar</Link>
                      : <Link className="btn-ghost" to={`/cotizaciones/${q.id}`}>Ver</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className={`card p-5 ${c.alert ? 'border-2 border-amber-300 bg-amber-50 hover:border-amber-400' : 'hover:border-sky-200'}`}
          >
            <div className={`text-xs font-semibold uppercase tracking-wide ${c.alert ? 'text-amber-800' : 'text-slate-500'}`}>{c.label}</div>
            <div className={`mt-2 text-2xl font-bold ${c.alert ? 'text-amber-900' : 'text-ink-900'}`}>{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-ink-900">Órdenes por estado (hoy)</h2>
        <div className="flex flex-wrap gap-2">
          {(data?.orders || []).length === 0 && <p className="text-sm text-slate-500">Sin movimientos hoy.</p>}
          {(data?.orders || []).map((o) => {
            const m = statusMeta(o.status);
            return <Badge key={o.status} className={m.color}>{m.label}: {o.n}</Badge>;
          })}
        </div>
      </div>
    </div>
  );
}
