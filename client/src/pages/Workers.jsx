import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadExcel, usd, bs, PAYMENT_METHODS } from '../api';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const empty = {
  full_name: '', document: '', phone: '', position: '', share_weight: 1, notes: '', active: 1,
};

function currentHalf() {
  return new Date().getDate() <= 15 ? 1 : 2;
}

function weekday(iso) {
  return new Date(`${iso}T12:00:00`).getDay();
}

export default function Workers() {
  const { can, user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState(currentHalf);
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const [msg, setMsg] = useState('');
  const rates = useAsync(() => api('/rates/today'));
  const roster = useAsync(() => api('/workers'));
  const payrollQ = useAsync(
    () => api(`/workers/payroll?year=${year}&month=${month}&half=${half}`),
    [year, month, half]
  );

  const data = payrollQ.data;
  const days = data?.days || [];
  const workers = data?.workers || [];

  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  const totals = useMemo(() => ({
    days: workers.reduce((s, w) => s + w.days_worked, 0),
  }), [workers]);

  async function saveWorker(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (form.id) await api(`/workers/${form.id}`, { method: 'PUT', body: form });
      else await api('/workers', { method: 'POST', body: form });
      setForm(null);
      roster.reload();
      payrollQ.reload();
    } catch (err) { setMsg(err.message); }
  }

  async function toggleDay(workerId, day, worked) {
    if (!can('workers.manage')) return;
    setMsg('');
    try {
      await api(`/workers/${workerId}/attendance`, { method: 'POST', body: { day, worked } });
      payrollQ.reload();
    } catch (err) { setMsg(err.message); }
  }

  function openPay(w) {
    const method = 'usd_cash';
    setPay({
      worker: w,
      payment_method: method,
      rate_type: 'bcv',
      amount: w.remaining_usd,
    });
    setMsg('');
  }

  function suggestedPay(p) {
    if (!p) return '';
    if (p.payment_method.startsWith('bs')) {
      const rate = Number(rates.data?.[p.rate_type] || 1);
      return Math.round(Number(p.worker.remaining_usd) * rate * 100) / 100;
    }
    return p.worker.remaining_usd;
  }

  async function doPay(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api(`/workers/${pay.worker.id}/pay`, {
        method: 'POST',
        body: {
          year, month, half,
          payment_method: pay.payment_method,
          rate_type: pay.rate_type,
          amount: pay.amount === '' ? suggestedPay(pay) : pay.amount,
        },
      });
      setPay(null);
      payrollQ.reload();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <PageHeader
        title="Trabajadores"
        subtitle="Días laborados y salario quincenal a partir del 40% de los ingresos de caja. El pago se hace en caja y queda en Finanzas."
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('trabajadores')}>Exportar plantilla</button>
            <button className="btn-ghost" onClick={() => downloadExcel('nomina')}>Exportar nómina</button>
            {user?.role === 'Administrador' && <Link className="btn-ghost" to="/finanzas">Finanzas</Link>}
            {can('cash.view') && <Link className="btn-ghost" to="/caja">Caja</Link>}
            {can('workers.manage') && (
              <button className="btn-primary" onClick={() => { setForm({ ...empty }); setMsg(''); }}>Nuevo trabajador</button>
            )}
          </>
        }
      />
      <ErrorBox error={roster.error || payrollQ.error || msg} />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-[200px]">
          <Field label="Mes">
            <input
              type="month"
              value={monthValue}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y); setMonth(m);
              }}
            />
          </Field>
        </div>
        <button className={half === 1 ? 'btn-dark' : 'btn-ghost'} onClick={() => setHalf(1)}>1 al 15</button>
        <button className={half === 2 ? 'btn-dark' : 'btn-ghost'} onClick={() => setHalf(2)}>16 al último</button>
      </div>

      <p className="mb-4 text-sm text-slate-600">{data?.period?.label}</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Ingresos de la quincena</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{usd(data?.income_usd)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Sobre trabajadores ({data?.payroll_pct ?? 40}%)</div>
          <div className="mt-1 text-2xl font-bold text-sky-700">{usd(data?.pool_usd)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Ya pagado en caja</div>
          <div className="mt-1 text-2xl font-bold text-rose-700">{usd(data?.paid_usd)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Pendiente de pagar</div>
          <div className="mt-1 text-2xl font-bold">{usd(data?.remaining_usd)}</div>
        </div>
      </div>

      {!data?.cash_open && can('workers.manage') && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No hay caja abierta. Ábrala en <Link className="font-semibold underline" to="/caja">Caja</Link> para pagar la quincena.
        </div>
      )}

      <div className="card mb-6 table-wrap">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-ink-900">Días laborados</h2>
          <p className="text-xs text-slate-500">
            Pulse un día para marcarlo. El salario se reparte según días × peso de nómina. Total de jornadas: {totals.days}.
          </p>
        </div>
        {workers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Registre la plantilla para marcar asistencia y calcular la nómina.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50">Trabajador</th>
                {days.map((d) => {
                  const wk = weekday(d);
                  return (
                    <th key={d} className={`text-center ${wk === 0 || wk === 6 ? 'text-slate-400' : ''}`}>
                      {d.slice(8)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td className="sticky left-0 z-10 bg-white font-medium">{w.full_name}</td>
                  {days.map((d) => {
                    const on = (w.worked_days || []).includes(d);
                    return (
                      <td key={d} className="text-center">
                        <button
                          type="button"
                          disabled={!can('workers.manage')}
                          title={on ? 'Laboró' : 'No laboró'}
                          onClick={() => toggleDay(w.id, d, !on)}
                          className={`h-7 w-7 rounded-md text-xs font-bold ${
                            on ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {on ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mb-6 table-wrap">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-ink-900">Nómina de la quincena</h2>
          <p className="text-xs text-slate-500">Pague desde caja. El egreso entra al sobre Trabajadores de Finanzas.</p>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Trabajador</th><th>Cargo</th><th>Días</th><th>Peso</th>
              <th>Asignado</th><th>Pagado</th><th>Pendiente</th><th></th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td className="font-medium">{w.full_name}</td>
                <td>{w.position || '—'}</td>
                <td>{w.days_worked}</td>
                <td>{w.share_weight}</td>
                <td>{usd(w.allocated_usd)}</td>
                <td className="text-rose-700">{usd(w.paid_usd)}</td>
                <td className="font-semibold">{usd(w.remaining_usd)}</td>
                <td className="text-right">
                  {can('cash.manage') && can('workers.manage') && w.remaining_usd > 0 && (
                    <button className="btn-amber" onClick={() => openPay(w)}>Pagar en caja</button>
                  )}
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-slate-500">Sin trabajadores activos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-ink-900">Plantilla</h2>
        </div>
        <table className="data">
          <thead>
            <tr><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Cargo</th><th>Peso</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {(roster.data || []).map((w) => (
              <tr key={w.id}>
                <td className="font-medium">{w.full_name}</td>
                <td>{w.document || '—'}</td>
                <td>{w.phone || '—'}</td>
                <td>{w.position || '—'}</td>
                <td>{w.share_weight}</td>
                <td>{w.active ? 'Activo' : 'Inactivo'}</td>
                <td className="text-right">
                  {can('workers.manage') && (
                    <button className="btn-ghost" onClick={() => { setForm({ ...empty, ...w }); setMsg(''); }}>Editar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar trabajador' : 'Nuevo trabajador'} onClose={() => setForm(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveWorker}>
            <div className="sm:col-span-2">
              <Field label="Nombre"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
            </div>
            <Field label="Cédula"><input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
            <Field label="Teléfono"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Cargo"><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Técnico, cajero…" /></Field>
            <Field label="Peso en nómina">
              <input type="number" min="0.1" step="0.1" value={form.share_weight} onChange={(e) => setForm({ ...form, share_weight: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 text-xs text-slate-500">
              Peso 1 = parte igual. Un peso 2 cobra el doble que un peso 1 si ambos trabajaron los mismos días.
            </div>
            <div className="sm:col-span-2">
              <Field label="Notas"><textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            {form.id && (
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} />
                Activo en la nómina
              </label>
            )}
            <div className="sm:col-span-2"><ErrorBox error={msg} /><button className="btn-primary w-full">Guardar</button></div>
          </form>
        </Modal>
      )}

      {pay && (
        <Modal title={`Pagar a ${pay.worker.full_name}`} onClose={() => setPay(null)}>
          <form className="space-y-3" onSubmit={doPay}>
            <p className="text-sm text-slate-600">
              {data?.period?.label} · Pendiente {usd(pay.worker.remaining_usd)} · {pay.worker.days_worked} días
            </p>
            {!data?.cash_open && (
              <ErrorBox error="Abra caja antes de pagar. El movimiento se registra como egreso del sobre Trabajadores." />
            )}
            <Field label="Método">
              <select
                value={pay.payment_method}
                onChange={(e) => {
                  const payment_method = e.target.value;
                  const next = { ...pay, payment_method };
                  next.amount = payment_method.startsWith('bs')
                    ? Math.round(Number(pay.worker.remaining_usd) * Number(rates.data?.[pay.rate_type] || 1) * 100) / 100
                    : pay.worker.remaining_usd;
                  setPay(next);
                }}
              >
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Tasa (si paga en Bs)">
              <select value={pay.rate_type} onChange={(e) => setPay({ ...pay, rate_type: e.target.value })}>
                <option value="bcv">BCV {rates.data?.bcv || ''}</option>
                <option value="euro">Euro {rates.data?.euro || ''}</option>
                <option value="usdt">USDT {rates.data?.usdt || ''}</option>
              </select>
            </Field>
            <Field label="Monto a pagar">
              <input type="number" step="0.01" min="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required />
            </Field>
            <p className="text-xs text-slate-500">
              Equiv. estimado: {pay.payment_method.startsWith('bs') ? bs(pay.amount) : usd(pay.amount)}
            </p>
            <ErrorBox error={msg} />
            <button type="submit" className="btn-amber w-full" disabled={!data?.cash_open}>Confirmar pago en caja</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
