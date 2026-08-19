import { Link, useParams } from 'react-router-dom';
import { api, usd, statusMeta } from '../api';
import { Badge, ErrorBox, PageHeader, useAsync } from '../components/ui';

export default function ClientDetail() {
  const { id } = useParams();
  const { data, error } = useAsync(() => api(`/clients/${id}`), [id]);
  const c = data?.client;

  return (
    <div>
      <PageHeader title={c?.name || 'Cliente'} subtitle="Historial de equipos y servicios" />
      <ErrorBox error={error} />
      {c && (
        <div className="card mb-6 grid gap-2 p-5 text-sm sm:grid-cols-2">
          <div><b>Cédula/RIF:</b> {c.document || '—'}</div>
          <div><b>Teléfono:</b> {c.phone || '—'}</div>
          <div><b>Correo:</b> {c.email || '—'}</div>
          <div><b>Dirección:</b> {c.address || '—'}</div>
          <div className="sm:col-span-2"><b>Notas:</b> {c.notes || '—'}</div>
        </div>
      )}
      <h2 className="mb-2 font-semibold">Órdenes</h2>
      <div className="card mb-6 table-wrap">
        <table className="data">
          <thead><tr><th>Número</th><th>Equipo</th><th>Serial</th><th>Estado</th><th>Total</th></tr></thead>
          <tbody>
            {(data?.orders || []).map((o) => {
              const m = statusMeta(o.status);
              return (
                <tr key={o.id}>
                  <td><Link className="text-brand-600" to={`/ordenes/${o.id}`}>{o.number}</Link></td>
                  <td>{o.device_brand} {o.device_model}</td>
                  <td>{o.serial_number}</td>
                  <td><Badge className={m.color}>{m.label}</Badge></td>
                  <td>{usd(o.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="mb-2 font-semibold">Cotizaciones</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Número</th><th>Estado</th><th>Total</th><th>Fecha</th></tr></thead>
          <tbody>
            {(data?.quotes || []).map((q) => (
              <tr key={q.id}>
                <td><Link className="text-brand-600" to={`/cotizaciones/${q.id}`}>{q.number}</Link></td>
                <td>{q.status}</td>
                <td>{usd(q.total)}</td>
                <td>{q.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
