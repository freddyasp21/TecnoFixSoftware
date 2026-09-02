import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadExcel, usd, bs, statusMeta, ORDER_STATUS, dayOnly, rateLabel } from '../api';
import { Badge, ErrorBox, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

export default function Orders() {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [q, setQ] = useState('');
  const { data, error, setError, reload } = useAsync(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    return api(`/orders?${p}`);
  }, [status, q]);

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
        subtitle="La orden se crea al cobrar en caja. Aquí se ve el técnico, el cajero, la tasa BCV del cobro y las fechas."
        actions={
          <>
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
                  <td className="font-semibold"><Link className="text-brand-600" to={`/ordenes/${o.id}`}>{o.number}</Link></td>
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
    </div>
  );
}
