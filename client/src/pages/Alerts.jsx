import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, usd, statusMeta } from '../api';
import { Badge, ErrorBox, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'stock', label: 'Stock bajo' },
  { id: 'payroll', label: 'Pagos de nómina' },
  { id: 'parts', label: 'Piezas pedidas' },
  { id: 'ready', label: 'Órdenes listas' },
];

function itemsForOrder(items, orderId) {
  return (items || []).filter((it) => it.work_order_id === orderId);
}

export default function Alerts() {
  const { can } = useAuth();
  const { data, error, reload } = useAsync(() => api('/alerts'));
  const [tab, setTab] = useState('all');
  const c = data?.counts || { stock: 0, payroll: 0, parts: 0, ready: 0, total: 0 };

  const show = useMemo(() => ({
    stock: tab === 'all' || tab === 'stock',
    payroll: tab === 'all' || tab === 'payroll',
    parts: tab === 'all' || tab === 'parts',
    ready: tab === 'all' || tab === 'ready',
  }), [tab]);

  return (
    <div>
      <PageHeader
        title="Alertas"
        subtitle="Pendientes reales de inventario, nómina y órdenes. No se duplican datos: se leen de cada módulo."
        actions={<button className="btn-ghost" onClick={reload}>Actualizar</button>}
      />
      <ErrorBox error={error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" className="card p-4 text-left hover:border-amber-200" onClick={() => setTab('stock')}>
          <div className="text-xs font-semibold uppercase text-slate-500">Stock bajo</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{c.stock}</div>
        </button>
        <button type="button" className="card p-4 text-left hover:border-sky-200" onClick={() => setTab('payroll')}>
          <div className="text-xs font-semibold uppercase text-slate-500">Pagos a trabajadores</div>
          <div className="mt-1 text-2xl font-bold text-sky-700">{c.payroll}</div>
        </button>
        <button type="button" className="card p-4 text-left hover:border-amber-200" onClick={() => setTab('parts')}>
          <div className="text-xs font-semibold uppercase text-slate-500">Piezas para órdenes</div>
          <div className="mt-1 text-2xl font-bold text-amber-800">{c.parts}</div>
        </button>
        <button type="button" className="card p-4 text-left hover:border-emerald-200" onClick={() => setTab('ready')}>
          <div className="text-xs font-semibold uppercase text-slate-500">Órdenes listas</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{c.ready}</div>
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'btn-dark' : 'btn-ghost'} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id !== 'all' && c[t.id] ? ` (${c[t.id]})` : t.id === 'all' && c.total ? ` (${c.total})` : ''}
          </button>
        ))}
      </div>

      {c.total === 0 && !error && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No hay alertas ahora. El inventario, la nómina y las órdenes están al día.
        </div>
      )}

      {show.stock && (can('inventory.view') || can('catalog.view')) && (
        <div className="card mb-6 table-wrap">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-semibold text-ink-900">Productos en stock mínimo o por debajo</h2>
              <p className="text-xs text-slate-500">Mismo criterio que Inventario: stock ≤ mínimo del catálogo.</p>
            </div>
            {can('inventory.view') && <Link className="btn-ghost" to="/inventario">Ir a inventario</Link>}
          </div>
          {(data?.stock || []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Ningún producto está bajo el mínimo.</p>
          ) : (
            <table className="data">
              <thead><tr><th>Código</th><th>Producto</th><th>Stock</th><th>Mínimo</th><th></th></tr></thead>
              <tbody>
                {data.stock.map((it) => (
                  <tr key={it.id} className="bg-amber-50/60">
                    <td className="font-medium">{it.code}</td>
                    <td>{it.name}</td>
                    <td className="font-semibold text-amber-800">{it.stock}</td>
                    <td>{it.min_stock}</td>
                    <td className="text-right"><Link className="btn-ghost" to="/inventario">Reponer</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {show.payroll && (can('workers.view') || can('cash.view')) && (
        <div className="card mb-6 table-wrap">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-semibold text-ink-900">Nómina pendiente de pagar</h2>
              <p className="text-xs text-slate-500">
                {data?.payroll?.period?.label || 'Quincena actual'} · sobre {data?.payroll?.payroll_pct ?? 40}% de ingresos.
                Pendiente {usd(data?.payroll?.remaining_usd)}.
              </p>
            </div>
            <Link className="btn-ghost" to="/trabajadores">Ir a trabajadores</Link>
          </div>
          {(data?.payroll?.workers || []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Nadie tiene saldo pendiente en esta quincena.</p>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Trabajador</th><th>Cargo</th><th>Días</th><th>Asignado</th><th>Pagado</th><th>Pendiente</th><th></th></tr>
              </thead>
              <tbody>
                {data.payroll.workers.map((w) => (
                  <tr key={w.id}>
                    <td className="font-medium">{w.full_name}</td>
                    <td>{w.position || '—'}</td>
                    <td>{w.days_worked}</td>
                    <td>{usd(w.allocated_usd)}</td>
                    <td>{usd(w.paid_usd)}</td>
                    <td className="font-semibold text-sky-800">{usd(w.remaining_usd)}</td>
                    <td className="text-right"><Link className="btn-amber" to="/trabajadores">Pagar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {show.parts && can('orders.view') && (
        <div className="card mb-6 table-wrap">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-semibold text-ink-900">Piezas pedidas para completar órdenes</h2>
              <p className="text-xs text-slate-500">Órdenes en estado «Esperando repuesto» y sus productos del catálogo.</p>
            </div>
            <Link className="btn-ghost" to="/ordenes?status=esperando_repuesto">Ver órdenes</Link>
          </div>
          {(data?.parts_orders || []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No hay órdenes esperando piezas.</p>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Orden</th><th>Cliente</th><th>Equipo</th><th>Piezas</th><th>Técnico</th><th></th></tr>
              </thead>
              <tbody>
                {data.parts_orders.map((o) => {
                  const items = itemsForOrder(data.parts_items, o.id);
                  return (
                    <tr key={o.id}>
                      <td className="font-semibold">
                        <Link className="text-brand-600" to={`/ordenes/${o.id}`}>{o.number}</Link>
                      </td>
                      <td>{o.client_name || '—'}</td>
                      <td>{[o.device_brand, o.device_model].filter(Boolean).join(' ') || '—'}</td>
                      <td>
                        {items.length === 0 ? (
                          <span className="text-xs text-slate-500">{o.fault_description || 'Sin ítems de producto en la orden'}</span>
                        ) : (
                          <ul className="space-y-1 text-sm">
                            {items.map((it) => (
                              <li key={it.id}>
                                {it.description} × {it.qty}
                                {it.stock != null && (
                                  <span className={Number(it.stock) <= 0 ? 'ml-1 text-rose-700' : 'ml-1 text-slate-500'}>
                                    (stock {it.stock})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{o.technician_name || '—'}</td>
                      <td className="text-right"><Link className="btn-ghost" to={`/ordenes/${o.id}`}>Abrir</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {show.ready && can('orders.view') && (
        <div className="card mb-6 table-wrap">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="font-semibold text-ink-900">Órdenes listas para entregar</h2>
              <p className="text-xs text-slate-500">Mismo estado «Listo» del módulo Órdenes. Salen de aquí al marcar entregado.</p>
            </div>
            <Link className="btn-ghost" to="/ordenes?status=listo">Ver órdenes</Link>
          </div>
          {(data?.ready || []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No hay equipos listos pendientes de entrega.</p>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Equipo</th><th>Listo</th><th>Técnico</th><th>Total</th><th></th></tr>
              </thead>
              <tbody>
                {data.ready.map((o) => (
                  <tr key={o.id}>
                    <td className="font-semibold">
                      <Link className="text-brand-600" to={`/ordenes/${o.id}`}>{o.number}</Link>
                      {' '}<Badge className={statusMeta('listo').color}>Listo</Badge>
                    </td>
                    <td>{o.client_name || '—'}</td>
                    <td>{o.client_phone || '—'}</td>
                    <td>{[o.device_brand, o.device_model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="whitespace-nowrap">{(o.ready_at || o.updated_at || '').slice(0, 16)}</td>
                    <td>{o.technician_name || '—'}</td>
                    <td>{usd(o.total)}</td>
                    <td className="text-right"><Link className="btn-ghost" to={`/ordenes/${o.id}`}>Entregar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
