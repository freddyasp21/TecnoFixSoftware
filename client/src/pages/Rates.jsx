import { useState } from 'react';
import { api, rateLabel, localDate } from '../api';
import { ErrorBox, Field, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

export default function Rates() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrador';
  const { data, error, reload } = useAsync(() => api('/rates'));
  const today = localDate();
  const [form, setForm] = useState({ rate_date: today, bcv: '', euro: '', usdt: '' });
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/rates', { method: 'POST', body: form });
      reload();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <PageHeader title="Tasas de cambio" subtitle="Registro diario en Bolívares: BCV, Dólar € y USDT Binance" />
      <ErrorBox error={error} />
      {data && !data.today && (
        <div className="mb-6 rounded-2xl border-2 border-rose-400 bg-rose-100 p-5">
          <h2 className="font-semibold text-rose-950">Tasa del día pendiente</h2>
          <p className="mt-1 text-sm text-rose-900">
            Sin tasas de hoy no se puede abrir caja ni cotizar. La orden se crea al cobrar la cotización.
          </p>
        </div>
      )}
      {data?.today && (
        <div className="mb-6 rounded-2xl border-2 border-emerald-400 bg-emerald-100 p-5">
          <h2 className="font-semibold text-emerald-950">Tasa del día actualizada</h2>
          <p className="mt-1 text-sm text-emerald-900">
            BCV {Number(data.today.bcv).toLocaleString('es-VE')} · Euro {Number(data.today.euro).toLocaleString('es-VE')} · USDT {Number(data.today.usdt).toLocaleString('es-VE')}
          </p>
        </div>
      )}
      {isAdmin && (
        <form onSubmit={save} className="card mb-6 grid gap-3 p-5 md:grid-cols-5">
          <Field label="Fecha"><input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></Field>
          <Field label="BCV (Bs / USD)"><input type="number" step="0.01" value={form.bcv} onChange={(e) => setForm({ ...form, bcv: e.target.value })} required /></Field>
          <Field label="Dólar € (Bs / EUR)"><input type="number" step="0.01" value={form.euro} onChange={(e) => setForm({ ...form, euro: e.target.value })} required /></Field>
          <Field label="USDT (Bs / USDT)"><input type="number" step="0.01" value={form.usdt} onChange={(e) => setForm({ ...form, usdt: e.target.value })} required /></Field>
          <div className="flex items-end"><button className="btn-primary w-full">Guardar tasas</button></div>
          {msg && <div className="md:col-span-5"><ErrorBox error={msg} /></div>}
        </form>
      )}
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Fecha</th><th>BCV</th><th>Dólar €</th><th>USDT</th><th>Registró</th></tr>
          </thead>
          <tbody>
            {(data?.history || []).map((r) => (
              <tr key={r.id}>
                <td>{r.rate_date}</td>
                <td>{Number(r.bcv).toLocaleString('es-VE')}</td>
                <td>{Number(r.euro).toLocaleString('es-VE')}</td>
                <td>{Number(r.usdt).toLocaleString('es-VE')}</td>
                <td>{r.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Las cotizaciones y cobros toman un snapshot de la tasa {rateLabel('bcv')} / Euro / USDT seleccionada al momento de guardar.
      </p>
    </div>
  );
}
