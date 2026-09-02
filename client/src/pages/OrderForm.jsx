import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, usd, bs, ORDER_STATUS, computeTotals, localDate, dayOnly, rateLabel } from '../api';
import LineItems from '../components/LineItems';
import { ErrorBox, Field, PageHeader, Switch } from '../components/ui';
import { useAuth } from '../auth';

export default function OrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [clients, setClients] = useState([]);
  const [techs, setTechs] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [error, setError] = useState('');
  const [number, setNumber] = useState('');
  const [form, setForm] = useState({
    client_id: '', technician_id: '', cashier_id: '', status: 'recibido',
    device_brand: '', device_model: '', serial_number: '', device_password: '',
    fault_description: '', physical_notes: '',
    received_at: '', delivered_at: '',
    rate_type: 'bcv', rate_value: 1, iva_enabled: true, iva_rate: 16, items: [],
  });

  const [todayRates, setTodayRates] = useState(null);

  useEffect(() => {
    if (!id) return;
    api('/clients').then(setClients).catch(() => {});
    api('/orders/lookups/technicians').then(setTechs).catch(() => {});
    api('/orders/lookups/cashiers').then(setCashiers).catch(() => {});
    api('/rates/today').then((r) => setTodayRates(r || null)).catch(() => setTodayRates(null));
    api(`/orders/${id}`).then((o) => {
      setNumber(o.number);
      setForm({
        client_id: o.client_id || '', technician_id: o.technician_id || '', cashier_id: o.cashier_id || '',
        status: o.status,
        device_brand: o.device_brand || '', device_model: o.device_model || '',
        serial_number: o.serial_number || '', device_password: o.device_password || '',
        fault_description: o.fault_description || '', physical_notes: o.physical_notes || '',
        received_at: dayOnly(o.received_at), delivered_at: dayOnly(o.delivered_at),
        rate_type: o.rate_type, rate_value: o.rate_value, iva_enabled: !!o.iva_enabled,
        iva_rate: o.iva_rate, items: o.items || [],
      });
    }).catch((e) => setError(e.message));
  }, [id]);

  const totals = useMemo(
    () => computeTotals(form.items, form.iva_enabled, form.iva_rate),
    [form.items, form.iva_enabled, form.iva_rate],
  );

  async function save(e) {
    e.preventDefault();
    if (!id) return;
    setError('');
    try {
      const body = {
        ...form,
        client_id: form.client_id || null,
        technician_id: form.technician_id || null,
        cashier_id: form.cashier_id || null,
        delivered_at: form.status === 'entregado' ? (form.delivered_at || localDate()) : '',
      };
      const saved = await api(`/orders/${id}`, { method: 'PUT', body });
      navigate(`/ordenes/${saved.id}`);
    } catch (err) { setError(err.message); }
  }

  if (!id) return <Navigate to="/cotizaciones/nueva" replace />;

  return (
    <form onSubmit={save}>
      <PageHeader
        title={number || 'Orden de trabajo'}
        subtitle="La orden nació del cobro en caja. El día de la orden es el mismo del cobro. Aquí se ve la tasa BCV de ese día, el técnico, el cajero y el estado."
        actions={
          <>
            <Link className="btn-ghost" to={`/ordenes/${id}/imprimir`}>Imprimir comprobante</Link>
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
            <Field label="Cajero (cobro)">
              <select value={form.cashier_id} onChange={(e) => setForm({ ...form, cashier_id: e.target.value })}>
                <option value="">— Sin asignar —</option>
                {cashiers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value;
                  const next = { ...form, status };
                  if (status === 'entregado' && !next.delivered_at) next.delivered_at = localDate();
                  if (status !== 'entregado') next.delivered_at = next.delivered_at;
                  setForm(next);
                }}
              >
                {ORDER_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Fecha de cobro / orden">
              <input type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
            </Field>
            <Field label="Fecha de entrega">
              <input
                type="date"
                value={form.delivered_at}
                onChange={(e) => setForm({ ...form, delivered_at: e.target.value })}
                disabled={form.status !== 'entregado'}
              />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">Tasa del cobro</div>
              <div className="mt-1 text-lg font-bold leading-tight text-sky-950">{bs(form.rate_value)} / USD</div>
              <p className="mt-1 text-[11px] leading-snug text-sky-800">
                {rateLabel(form.rate_type)} del {form.received_at || 'día de cobro'}. Fijada en la orden.
              </p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800">Tasa del día actual</div>
              {todayRates ? (
                <>
                  <div className="mt-1 text-lg font-bold leading-tight text-indigo-950">
                    {bs(todayRates[form.rate_type] || todayRates.bcv)} / USD
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-indigo-800">
                    {rateLabel(form.rate_type)} de hoy{todayRates.rate_date ? ` (${todayRates.rate_date})` : ''}. No modifica la orden.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[11px] leading-snug text-indigo-800">Aún no hay tasa registrada para el día de hoy.</p>
              )}
            </div>
          </div>
          <Field label="Tipo de tasa">
            <select value={form.rate_type} onChange={(e) => setForm({ ...form, rate_type: e.target.value })}>
              <option value="bcv">BCV</option>
              <option value="euro">Dólar €</option>
              <option value="usdt">USDT</option>
            </select>
          </Field>
          <Field label="Tasa de bolívares (Bs / USD)">
            <input type="number" step="0.01" value={form.rate_value} onChange={(e) => setForm({ ...form, rate_value: e.target.value })} />
          </Field>
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
            <div className="flex justify-between text-slate-500"><span>Total Bs (cobro)</span><span>{bs(totals.total * Number(form.rate_value || 0))}</span></div>
            {todayRates && (
              <div className="flex justify-between text-slate-400">
                <span>Total Bs (hoy)</span>
                <span>{bs(totals.total * Number(todayRates[form.rate_type] || todayRates.bcv || 0))}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
