import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, usd, bs, rateLabel } from '../api';
import LineItems from '../components/LineItems';
import { ErrorBox, Field, PageHeader, Switch } from '../components/ui';
import { useAuth } from '../auth';

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState(null);
  const [rates, setRates] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    client_id: '', status: 'borrador', rate_type: 'bcv', rate_value: 1,
    iva_enabled: false, iva_rate: 16, notes: '', items: [],
  });

  useEffect(() => {
    api('/clients').then(setClients).catch(() => {});
    api('/settings').then((s) => {
      setSettings(s);
      if (!id) setForm((f) => ({ ...f, iva_enabled: s.iva_enabled === '1', iva_rate: Number(s.iva_rate) || 16 }));
    }).catch(() => {});
    api('/rates/today').then((r) => {
      setRates(r);
      if (r && !id) setForm((f) => ({ ...f, rate_value: r[f.rate_type] || 1 }));
    }).catch(() => {});
    if (id) {
      api(`/quotes/${id}`).then((q) => {
        if (q.status === 'convertida' && q.order?.id) {
          navigate(`/ordenes/${q.order.id}`, { replace: true });
          return;
        }
        setForm({
          client_id: q.client_id || '', status: q.status, rate_type: q.rate_type,
          rate_value: q.rate_value, iva_enabled: !!q.iva_enabled, iva_rate: q.iva_rate,
          notes: q.notes || '', items: q.items || [],
        });
      }).catch((e) => setError(e.message));
    }
  }, [id]);

  useEffect(() => {
    if (rates && !id) setForm((f) => ({ ...f, rate_value: rates[f.rate_type] || f.rate_value }));
  }, [form.rate_type, rates]);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
    const iva = form.iva_enabled ? subtotal * (Number(form.iva_rate) || 16) / 100 : 0;
    return { subtotal, iva, total: subtotal + iva };
  }, [form.items, form.iva_enabled, form.iva_rate]);

  async function persist(status) {
    const body = { ...form, status, client_id: form.client_id || null };
    return id
      ? api(`/quotes/${id}`, { method: 'PUT', body })
      : api('/quotes', { method: 'POST', body });
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const saved = await persist(form.status);
      if (saved.status === 'aprobada') navigate('/caja');
      else navigate(`/cotizaciones/${saved.id}`);
    } catch (err) { setError(err.message); }
  }

  async function approve() {
    setError('');
    try {
      await persist('aprobada');
      navigate('/caja');
    } catch (err) { setError(err.message); }
  }

  const locked = form.status === 'convertida';
  const pendingPay = form.status === 'aprobada';

  return (
    <form onSubmit={save}>
      <PageHeader
        title={id ? `Cotización` : 'Nueva cotización'}
        subtitle="Si el cliente aprueba, la cotización pasa a Caja. La orden se crea solo al cobrar."
        actions={
          <>
            {pendingPay && can('cash.view') && (
              <button type="button" className="btn-amber" onClick={() => navigate('/caja')}>Ir a caja a cobrar</button>
            )}
            {id && !pendingPay && !locked && form.status !== 'rechazada' && can('quotes.manage') && (
              <button type="button" className="btn-amber" onClick={approve}>Cliente aprobó</button>
            )}
            {!locked && can('quotes.manage') && <button type="submit" className="btn-primary">Guardar</button>}
          </>
        }
      />
      <ErrorBox error={error} />
      {pendingPay && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aprobada por el cliente. Pendiente de cobro en caja. Hasta que se cobre, no se crea la orden de trabajo.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 p-5 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} disabled={locked || pendingPay}>
                <option value="">— Sin cliente —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={locked}>
                <option value="borrador">Borrador</option>
                <option value="enviada">Enviada al cliente</option>
                <option value="aprobada">Aprobada (pendiente de cobro)</option>
                <option value="rechazada">Rechazada</option>
              </select>
            </Field>
          </div>
          <LineItems items={form.items} setItems={(items) => setForm({ ...form, items })} />
          <Field label="Notas"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={locked} /></Field>
        </div>
        <div className="card space-y-4 p-5">
          <Field label="Tasa de referencia">
            <select value={form.rate_type} onChange={(e) => setForm({ ...form, rate_type: e.target.value })} disabled={locked}>
              <option value="bcv">BCV</option>
              <option value="euro">Dólar €</option>
              <option value="usdt">USDT</option>
            </select>
          </Field>
          <Field label={`Valor ${rateLabel(form.rate_type)} (Bs)`}>
            <input type="number" step="0.01" value={form.rate_value} onChange={(e) => setForm({ ...form, rate_value: e.target.value })} disabled={locked} />
          </Field>
          <Switch
            checked={form.iva_enabled}
            onChange={(v) => setForm({ ...form, iva_enabled: v })}
            label={`IVA ${form.iva_rate}% ${form.iva_enabled ? 'aplicado' : 'desactivado'}`}
          />
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><b>{usd(totals.subtotal)}</b></div>
            <div className="flex justify-between"><span>IVA</span><b>{usd(totals.iva)}</b></div>
            <div className="mt-2 flex justify-between text-base"><span>Total USD</span><b>{usd(totals.total)}</b></div>
            <div className="mt-1 flex justify-between text-slate-500"><span>Total Bs</span><span>{bs(totals.total * Number(form.rate_value || 0))}</span></div>
          </div>
          {settings && <p className="text-xs text-slate-400">Taller: {settings.shop_name}</p>}
        </div>
      </div>
    </form>
  );
}
