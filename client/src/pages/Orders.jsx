import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadExcel, usd, statusMeta, ORDER_STATUS } from '../api';
import { Badge, ErrorBox, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

export default function Orders() {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [q, setQ] = useState('');
  const { data, error, reload } = useAsync(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    return api(`/orders?${p}`);
  }, [status, q]);

  async function remove(id) {
    if (!confirm('¿Eliminar la orden y devolver el stock?')) return;
    await api(`/orders/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div>
      <PageHeader
        title="Órdenes de trabajo"
        subtitle="Numeración correlativa, estados y asignación de técnico"
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('ordenes')}>Exportar Excel</button>
            {can('orders.manage') && <Link className="btn-primary" to="/ordenes/nueva">Nueva orden</Link>}
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
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Número</th><th>Cotización</th><th>Cliente</th><th>Equipo</th><th>Estado</th><th>Técnico</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {(data || []).map((o) => {
              const m = statusMeta(o.status);
              return (
                <tr key={o.id}>
                  <td className="font-semibold"><Link className="text-brand-600" to={`/ordenes/${o.id}`}>{o.number}</Link></td>
                  <td>{o.quote_number || '—'}</td>
                  <td>{o.client_name || '—'}</td>
                  <td>{[o.device_brand, o.device_model].filter(Boolean).join(' ') || '—'}</td>
                  <td><Badge className={m.color}>{m.label}</Badge></td>
                  <td>{o.technician_name || '—'}</td>
                  <td>{usd(o.total)}</td>
                  <td className="space-x-2 text-right">
                    <Link className="btn-ghost" to={`/ordenes/${o.id}/imprimir`}>Imprimir</Link>
                    {can('orders.delete') && <button className="btn-ghost" onClick={() => remove(o.id)}>Eliminar</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
