import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, usd, bs, ORDER_STATUS, computeTotals } from '../api';
import LineItems from '../components/LineItems';
import RateGate from '../components/RateGate';
import { ErrorBox, Field, PageHeader, Switch } from '../components/ui';
import { useAuth } from '../auth';

export default function OrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [clients, setClients] = useState([]);
  const [techs, setTechs] = useState([]);
  const [rates, setRates] = useState(null);
  const [ratesReady, setRatesReady] = useState(false);
  const [error, setError] = useState('');
  const [number, setNumber] = useState('');
  const [form, setForm] = useState({
    client_id: '', technician_id: '', status: 'recibido',
    device_brand: '', device_model: '', serial_number: '', device_password: '',
    fault_description: '', physical_notes: '',
    rate_type: 'bcv', rate_value: 1, iva_enabled: false, iva_rate: 16, items: [],
  });

  useEffect(() => {
    api('/clients').then(setClients).catch(() => {});
    api('/orders/lookups/technicians').then(setTechs).catch(() => {});
    api('/settings').then((s) => {
      if (!id) setForm((f) => ({ ...f, iva_enabled: s.iva_enabled === '1', iva_rate: Number(s.iva_rate) || 16 }));
    }).catch(() => {});
    api('/rates/today').then((r) => {
      setRates(r);
      if (r && !id) setForm((f) => ({ ...f, rate_value: r[f.rate_type] || 1 }));
    }).catch(() => {}).finally(() => setRatesReady(true));
    if (id) {
      api(`/orders/${id}`).then((o) => {
        setNumber(o.number);
        setForm({
          client_id: o.client_id || '', technician_id: o.technician_id || '', status: o.status,
          device_brand: o.device_brand || '', device_model: o.device_model || '',
          serial_number: o.serial_number || '', device_password: o.device_password || '',
          fault_description: o.fault_description || '', physical_notes: o.physical_notes || '',
          rate_type: o.rate_type, rate_value: o.rate_value, iva_enabled: !!o.iva_enabled,
          iva_rate: o.iva_rate, items: o.items || [],
        });
      }).catch((e) => setError(e.message));
    }
  }, [id]);

  useEffect(() => {
    if (rates && !id) setForm((f) => ({ ...f, rate_value: rates[f.rate_type] || f.rate_value }));
  }, [form.rate_type, rates]);

  const totals = useMemo(
    () => computeTotals(form.items, form.iva_enabled, form.iva_rate),
    [form.items, form.iva_enabled, form.iva_rate],
  );

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form, client_id: form.client_id || null, technician_id: form.technician_id || null };
      const saved = id
        ? await api(`/orders/${id}`, { method: 'PUT', body })
        : await api('/orders', { method: 'POST', body });
      navigate(`/ordenes/${saved.id}`);
    } catch (err) { setError(err.message); }
  }

  const blockedNew = !id && ratesReady && !rates;
  if (blockedNew) {
    return (
      <div>
        <PageHeader title="Nueva orden de trabajo" subtitle="Al guardar productos se descuenta el inventario automáticamente" />
        <RateGate action="crear una orden" />
      </div>
    );
  }

  return (
    <form onSubmit={save}>
      <PageHeader
        title={number || 'Nueva orden de trabajo'}
        subtitle="Al guardar productos se descuenta el inventario automáticamente"
        actions={
          <>
            {id && <Link className="btn-ghost" to={`/ordenes/${id}/imprimir`}>Imprimir comprobante</Link>}
            {can('orders.manage') && <button className="btn-primary">Guardar</button>}
          </>
        }
      />
      <ErrorBox error={error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 p-5 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">—</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Técnico responsable">
              <select value={form.technician_id} onChange={(e) => setForm({ ...form, technician_id: e.target.value })}>
                <option value="">— Sin asignar —</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {ORDER_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Marca"><input value={form.device_brand} onChange={(e) => setForm({ ...form, device_brand: e.target.value })} /></Field>
            <Field label="Modelo"><input value={form.device_model} onChange={(e) => setForm({ ...form, device_model: e.target.value })} /></Field>
            <Field label="Número de serie"><input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></Field>
            <Field label="Contraseña / PIN del equipo"><input value={form.device_password} onChange={(e) => setForm({ ...form, device_password: e.target.value })} /></Field>
          </div>
          <Field label="Descripción de la falla"><textarea rows={2} value={form.fault_description} onChange={(e) => setForm({ ...form, fault_description: e.target.value })} /></Field>
          <Field label="Observaciones físicas"><textarea rows={2} value={form.physical_notes} onChange={(e) => setForm({ ...form, physical_notes: e.target.value })} /></Field>
          <LineItems items={form.items} setItems={(items) => setForm({ ...form, items })} />
        </div>
        <div className="card space-y-4 p-5">
          <Field label="Tasa">
            <select value={form.rate_type} onChange={(e) => setForm({ ...form, rate_type: e.target.value })}>
              <option value="bcv">BCV</option>
              <option value="euro">Dólar €</option>
              <option value="usdt">USDT</option>
            </select>
          </Field>
          <Field label="Valor de la tasa (Bs)"><input type="number" step="0.01" value={form.rate_value} onChange={(e) => setForm({ ...form, rate_value: e.target.value })} /></Field>
          <Switch
            checked={form.iva_enabled}
            onChange={(v) => setForm({ ...form, iva_enabled: v })}
            label={`IVA ${form.iva_rate}% ${form.iva_enabled ? 'incluido en el total' : 'desactivado'}`}
          />
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between"><span>{form.iva_enabled ? 'Base (sin IVA)' : 'Subtotal'}</span><b>{usd(totals.subtotal)}</b></div>
            {form.iva_enabled && (
              <div className="flex justify-between"><span>IVA {form.iva_rate}% incluido</span><b>{usd(totals.iva)}</b></div>
            )}
            <div className="mt-2 flex justify-between text-base"><span>Total USD</span><b>{usd(totals.total)}</b></div>
            <div className="flex justify-between text-slate-500"><span>Total Bs</span><span>{bs(totals.total * Number(form.rate_value || 0))}</span></div>
          </div>
        </div>
      </div>
    </form>
  );
}
