import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';
import { api, downloadExcel, usd, bs, statusMeta, ORDER_STATUS, dayOnly, rateLabel } from '../api';
import { Badge, ErrorBox, PageHeader, useAsync } from '../components/ui';
import OrderCard from '../components/OrderCard';
import { useAuth } from '../auth';

const VIEW_KEY = 'tecnofix_orders_view';

export default function Orders() {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'cards');
  const { data, error, setError, loading, reload } = useAsync(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    return api(`/orders?${p}`);
  }, [status, q]);

  useEffect(() => {
    const fromUrl = searchParams.get('q') || '';
    setQ(fromUrl);
  }, [searchParams]);

  function changeView(next) {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  async function remove(id) {
    if (!confirm('¿Eliminar la orden y devolver el stock? El cobro en caja, si existiera, se conserva.')) return;
    try {
      await api(`/orders/${id}`, { method: 'DELETE' });
      setError('');
      reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Órdenes de trabajo"
        subtitle="La orden se crea al cobrar en caja. Puede verlas en tarjetas o en tabla."
        actions={
          <>
            <div className="flex overflow-hidden rounded-full border border-violet-100 bg-white">
              <button
                type="button"
                className={`px-3 py-2 ${view === 'cards' ? 'bg-brand-500 text-white' : 'text-slate-500'}`}
                onClick={() => changeView('cards')}
                title="Vista tarjetas"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={`px-3 py-2 ${view === 'table' ? 'bg-brand-500 text-white' : 'text-slate-500'}`}
                onClick={() => changeView('table')}
                title="Vista tabla"
              >
                <List size={16} />
              </button>
            </div>
            <button className="btn-ghost" onClick={() => downloadExcel('ordenes')}>Exportar Excel</button>
            {can('quotes.manage') && <Link className="btn-primary" to="/cotizaciones/nueva">Nueva cotización</Link>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="max-w-xs" placeholder="Buscar número, cliente, serial…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="max-w-[220px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {ORDER_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <ErrorBox error={error} />

      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">Cargando órdenes…</div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(data || []).map((o) => (
            <OrderCard key={o.id} order={o} canDelete={can('orders.delete')} onRemove={remove} />
          ))}
          {(data || []).length === 0 && (
            <div className="card col-span-full p-8 text-center text-sm text-slate-500">
              No hay órdenes con ese filtro.
            </div>
          )}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Número</th><th>Cliente</th><th>Equipo</th><th>Estado</th>
                <th>Técnico</th><th>Cajero</th><th>Fecha cobro</th><th>Fecha entrega</th><th>Tasa BCV</th><th>Total USD</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((o) => {
                const m = statusMeta(o.status);
                return (
                  <tr key={o.id}>
                    <td className="font-semibold"><Link className="text-brand-500" to={`/ordenes/${o.id}`}>{o.number}</Link></td>
                    <td>{o.client_name || '—'}</td>
                    <td>{[o.device_brand, o.device_model].filter(Boolean).join(' ') || '—'}</td>
                    <td><Badge className={m.color}>{m.label}</Badge></td>
                    <td>{o.technician_name || '—'}</td>
                    <td>{o.cashier_name || '—'}</td>
                    <td className="whitespace-nowrap">{dayOnly(o.received_at) || '—'}</td>
                    <td className="whitespace-nowrap">{dayOnly(o.delivered_at) || '—'}</td>
                    <td className="whitespace-nowrap text-xs">
                      {rateLabel(o.rate_type)} {bs(o.rate_value)}
                    </td>
                    <td>{usd(o.total)}</td>
                    <td className="space-x-2 text-right">
                      <Link className="btn-ghost" to={`/ordenes/${o.id}/imprimir`}>Imprimir</Link>
                      {can('orders.delete') && (
                        <button type="button" className="btn-ghost" onClick={() => remove(o.id)}>Eliminar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
