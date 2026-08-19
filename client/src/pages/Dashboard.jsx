import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, usd, rateLabel, statusMeta } from '../api';
import { Badge, PageHeader } from '../components/ui';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [rates, setRates] = useState(null);

  useEffect(() => {
    if (can('dashboard.view')) {
      api('/dashboard').then(setData).catch(() => {});
    }
    if (can('rates.view')) api('/rates/today').then(setRates).catch(() => {});
  }, []);

  const k = data?.kpis || {};

  const cards = [
    { label: 'Órdenes hoy', value: k.orders ?? '—', to: '/ordenes' },
    { label: 'Pendientes', value: k.pending ?? '—', to: '/ordenes' },
    { label: 'Entregas hoy', value: k.delivered ?? '—', to: '/ordenes' },
    { label: 'Stock bajo', value: k.low_stock ?? '—', to: '/inventario' },
    { label: 'Ingresos USD', value: usd(k.income_usd), to: can('finance.view') || can('cash.view') ? '/finanzas' : '/caja' },
    { label: 'Egresos USD', value: usd(k.expense_usd), to: can('finance.view') || can('cash.view') ? '/finanzas' : '/caja' },
  ];
  if (can('finance.view') || can('cash.view')) {
    cards.push({ label: 'Gestión financiera', value: '40 / 30 / 20', to: '/finanzas' });
  }
  if (can('workers.view') || can('cash.view')) {
    cards.push({ label: 'Trabajadores / nómina', value: 'Quincena', to: '/trabajadores' });
  }

  return (
    <div>
      <PageHeader
        title="Panel operativo"
        subtitle="Resumen del día en el taller"
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card p-5 hover:border-sky-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</div>
            <div className="mt-2 text-2xl font-bold text-ink-900">{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-ink-900">Tasas del día (Bs)</h2>
          {rates ? (
            <div className="grid grid-cols-3 gap-3">
              {['bcv', 'euro', 'usdt'].map((k2) => (
                <div key={k2} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs uppercase text-slate-500">{rateLabel(k2)}</div>
                  <div className="mt-1 text-lg font-bold text-ink-900">{Number(rates[k2]).toLocaleString('es-VE')}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aún no hay tasas registradas. Cárguelas en el módulo Tasas.</p>
          )}
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
    </div>
  );
}
