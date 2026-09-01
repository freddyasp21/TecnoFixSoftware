import { Link, useNavigate } from 'react-router-dom';
import { api, downloadExcel, usd } from '../api';
import RateGate from '../components/RateGate';
import { PageHeader, useAsync, ErrorBox } from '../components/ui';
import { useAuth } from '../auth';

const ST = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada · por cobrar',
  rechazada: 'Rechazada',
};

export default function Quotes() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(() => api('/quotes'));
  const ratesQ = useAsync(() => api('/rates/today').catch(() => null));
  const ratesMissing = !ratesQ.loading && !ratesQ.data;

  async function remove(id) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    await api(`/quotes/${id}`, { method: 'DELETE' });
    reload();
  }

  async function approve(q) {
    try {
      await api(`/quotes/${q.id}`, { method: 'PUT', body: { status: 'aprobada' } });
      navigate('/caja');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle="El cliente aprueba → Caja cobra → se crea la orden de trabajo"
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('cotizaciones')}>Exportar Excel</button>
            {can('quotes.manage') && !ratesMissing && <Link className="btn-primary" to="/cotizaciones/nueva">Nueva cotización</Link>}
            {can('quotes.manage') && ratesMissing && <Link className="btn-primary" to="/tasas">Actualizar tasa</Link>}
          </>
        }
      />
      <ErrorBox error={error} />
      {ratesMissing && <RateGate action="crear una cotización" />}
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Número</th><th>Cliente</th><th>Estado</th><th>Total USD</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {(data || []).map((q) => (
              <tr key={q.id}>
                <td className="font-semibold"><Link className="text-brand-600" to={`/cotizaciones/${q.id}`}>{q.number}</Link></td>
                <td>{q.client_name || '—'}</td>
                <td>{ST[q.status] || q.status}</td>
                <td>{usd(q.total)}</td>
                <td>{q.created_at?.slice(0, 16)}</td>
                <td className="space-x-2 text-right">
                  {can('quotes.manage') && q.status !== 'rechazada' && q.status !== 'aprobada' && (
                    <button className="btn-amber" onClick={() => approve(q)}>Cliente aprobó</button>
                  )}
                  {q.status === 'aprobada' && can('cash.view') && (
                    <button className="btn-amber" onClick={() => navigate('/caja')}>Cobrar en caja</button>
                  )}
                  {can('quotes.delete') && q.status !== 'aprobada' && (
                    <button className="btn-ghost" onClick={() => remove(q.id)}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
