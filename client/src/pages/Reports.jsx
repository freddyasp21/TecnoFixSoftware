import { useState } from 'react';
import { api, downloadExcel, usd, PAYMENT_METHODS, statusMeta } from '../api';
import { Badge, PageHeader, useAsync, ErrorBox } from '../components/ui';

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { data, error } = useAsync(() => api(`/reports/summary?from=${from}&to=${to}`), [from, to]);
  const k = data?.kpis || {};

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Analítica por rango de fechas y exportación a Excel"
        actions={
          <div className="flex flex-wrap gap-2">
            {['ordenes', 'cotizaciones', 'caja', 'finanzas', 'nomina', 'trabajadores', 'inventario', 'clientes', 'catalogo'].map((m) => (
              <button key={m} className="btn-ghost capitalize" onClick={() => downloadExcel(m)}>{m}</button>
            ))}
          </div>
        }
      />
      <div className="mb-4 flex gap-3">
        <input type="date" className="max-w-[180px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="max-w-[180px]" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <ErrorBox error={error} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><div className="text-xs uppercase text-slate-500">Órdenes</div><div className="text-2xl font-bold">{k.orders ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase text-slate-500">Pendientes</div><div className="text-2xl font-bold">{k.pending ?? 0}</div></div>
        <div className="card p-4"><div className="text-xs uppercase text-slate-500">Ingresos USD</div><div className="text-2xl font-bold">{usd(k.income_usd)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase text-slate-500">Egresos USD</div><div className="text-2xl font-bold">{usd(k.expense_usd)}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Órdenes por estado</h2>
          <div className="space-y-2">
            {(data?.orders || []).map((o) => {
              const m = statusMeta(o.status);
              return (
                <div key={o.status} className="flex items-center justify-between text-sm">
                  <Badge className={m.color}>{m.label}</Badge>
                  <span>{o.n} · {usd(o.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Caja por método</h2>
          {(data?.cash || []).map((c, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{c.type === 'income' ? 'Ing.' : 'Egr.'} {PAYMENT_METHODS.find((m) => m.id === c.payment_method)?.label}</span>
              <span>{usd(c.amount_usd)}</span>
            </div>
          ))}
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Ítems más usados en órdenes</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Descripción</th><th>Cant.</th><th>Total USD</th></tr></thead>
              <tbody>
                {(data?.topItems || []).map((t) => (
                  <tr key={t.description}><td>{t.description}</td><td>{t.qty}</td><td>{usd(t.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
