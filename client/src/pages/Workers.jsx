import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadExcel, usd, bs, PAYMENT_METHODS } from '../api';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const empty = {
  full_name: '', document: '', phone: '', position: '', share_weight: 1,
  hired_at: '', base_salary_usd: 0, notes: '', active: 1,
};

function currentHalf() {
  return new Date().getDate() <= 15 ? 1 : 2;
}

function weekday(iso) {
  return new Date(`${iso}T12:00:00`).getDay();
}

function remainingOf(w, kind) {
  return kind === 'salary' ? Number(w.salary_remaining_usd) || 0 : Number(w.remaining_usd) || 0;
}

export default function Workers() {
  const { can } = useAuth();
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

  function openPay(w, kind) {
    const remaining = remainingOf(w, kind);
    const method = 'usd_cash';
    setPay({
      worker: w,
      kind,
      payment_method: method,
      rate_type: 'bcv',
      amount: remaining,
    });
    setMsg('');
  }

  function suggestedPay(p) {
    if (!p) return '';
    const remaining = remainingOf(p.worker, p.kind);
    if (p.payment_method.startsWith('bs')) {
      const rate = Number(rates.data?.[p.rate_type] || 1);
      return Math.round(remaining * rate * 100) / 100;
    }
    return remaining;
  }

  async function doPay(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api(`/workers/${pay.worker.id}/pay`, {
        method: 'POST',
        body: {
          year, month, half,
          kind: pay.kind,
          payment_method: pay.payment_method,
          rate_type: pay.rate_type,
          amount: pay.amount === '' ? suggestedPay(pay) : pay.amount,
        },
      });
      setPay(null);
      payrollQ.reload();
    } catch (err) { setMsg(err.message); }
  }

  const payLabel = pay?.kind === 'salary' ? 'Salario' : 'Comisión';
  const payRemaining = pay ? remainingOf(pay.worker, pay.kind) : 0;

  return (
    <div>
      <PageHeader
        title="Trabajadores"
        subtitle="Comisiones por días laborados (sobre de ingresos) y salario fijo con incremento por antigüedad. El pago se hace en caja."
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('trabajadores')}>Exportar plantilla</button>
            <button className="btn-ghost" onClick={() => downloadExcel('nomina')}>Exportar nómina</button>
            {can('finance.view') && <Link className="btn-ghost" to="/finanzas">Finanzas</Link>}
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

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Ingresos de la quincena</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{usd(data?.income_usd)}</div>
        </div>
        <div className="card border-sky-100 bg-sky-50 p-4">
          <div className="text-xs font-semibold uppercase text-sky-800">Comisiones ({data?.payroll_pct ?? 40}%)</div>
          <div className="mt-1 text-2xl font-bold text-sky-800">{usd(data?.pool_usd)}</div>
          <div className="mt-1 text-xs text-sky-800/80">Pendiente {usd(data?.remaining_usd)}</div>
        </div>
        <div className="card border-indigo-100 bg-indigo-50 p-4">
          <div className="text-xs font-semibold uppercase text-indigo-800">Salario fijo</div>
          <div className="mt-1 text-2xl font-bold text-indigo-800">{usd(data?.salary_pool_usd)}</div>
          <div className="mt-1 text-xs text-indigo-800/80">
            Pendiente {usd(data?.salary_remaining_usd)} · +{data?.salary_increment_pct ?? 5}% / año
          </div>
        </div>
      </div>

      {!data?.cash_open && can('workers.manage') && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No hay caja abierta. Ábrala en <Link className="font-semibold underline" to="/caja">Caja</Link> para pagar comisión o salario.
        </div>
      )}

      <div className="card mb-6 table-wrap">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-ink-900">Días laborados</h2>
          <p className="text-xs text-slate-500">
            Pulse un día para marcarlo. La comisión se reparte solo según los días que cada uno laboró. Total de jornadas: {totals.days}.
          </p>
        </div>
        {workers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Registre la plantilla para marcar asistencia y calcular comisiones.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50">Trabajador</th>
                {days.map((d) => {
                  const wk = weekday(d);
                  const isOps = d === data?.ops?.current_date;
                  return (
                    <th key={d} className={`text-center ${isOps ? 'bg-sky-100 text-sky-800' : wk === 0 || wk === 6 ? 'text-slate-400' : ''}`}>
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
                    const ops = data?.ops || {};
                    const allowed = ops.start_date && ops.current_date && d >= ops.start_date && d <= ops.current_date;
                    const isOps = d === ops.current_date;
                    return (
                      <td key={d} className={`text-center ${isOps ? 'bg-sky-50' : ''}`}>
                        <button
                          type="button"
                          disabled={!can('workers.manage') || !allowed}
                          title={!allowed ? 'Fuera del día operativo' : on ? 'Laboró' : 'No laboró'}
                          onClick={() => toggleDay(w.id, d, !on)}
                          className={`h-7 w-7 rounded-md text-xs font-bold ${
                            on ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          } disabled:opacity-40`}
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
          <h2 className="font-semibold text-ink-900">Comisiones de la quincena</h2>
          <p className="text-xs text-slate-500">Se reparte el {data?.payroll_pct ?? 40}% de los ingresos de caja según los días laborados. El egreso entra al sobre Comisiones.</p>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Trabajador</th><th>Cargo</th><th>Días</th>
              <th>Asignado</th><th>Pagado</th><th>Pendiente</th><th></th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td className="font-medium">{w.full_name}</td>
                <td>{w.position || '—'}</td>
                <td>{w.days_worked}</td>
                <td>{usd(w.allocated_usd)}</td>
                <td className="text-rose-700">{usd(w.paid_usd)}</td>
                <td className="font-semibold">{usd(w.remaining_usd)}</td>
                <td className="text-right">
                  {can('cash.manage') && can('workers.manage') && w.remaining_usd > 0 && (
                    <button className="btn-amber" onClick={() => openPay(w, 'commission')}>Pagar comisión</button>
                  )}
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-500">Sin trabajadores activos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card mb-6 table-wrap">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-ink-900">Salario de la quincena</h2>
          <p className="text-xs text-slate-500">
            Monto fijo que asigna admin o gerente. Cada año de antigüedad suma {data?.salary_increment_pct ?? 5}% sobre el sueldo base.
            En la quincena se paga la parte proporcional (días del período / 30).
          </p>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Trabajador</th><th>Sueldo base</th><th>Antigüedad</th><th>Sueldo vigente</th>
              <th>Asignado</th><th>Pagado</th><th>Pendiente</th><th></th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td className="font-medium">{w.full_name}</td>
                <td>{usd(w.base_salary_usd)}</td>
                <td>{w.years_service || 0} año{(w.years_service || 0) === 1 ? '' : 's'}</td>
                <td>{usd(w.monthly_salary_usd)}</td>
                <td>{usd(w.salary_allocated_usd)}</td>
                <td className="text-rose-700">{usd(w.salary_paid_usd)}</td>
                <td className="font-semibold">{usd(w.salary_remaining_usd)}</td>
                <td className="text-right">
                  {can('cash.manage') && can('workers.manage') && w.salary_remaining_usd > 0 && (
                    <button className="btn-amber" onClick={() => openPay(w, 'salary')}>Pagar salario</button>
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
            <tr>
              <th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Cargo</th>
              <th>Ingreso</th><th>Sueldo base</th><th>Antigüedad</th><th>Sueldo vigente</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(roster.data || []).map((w) => (
              <tr key={w.id}>
                <td className="font-medium">{w.full_name}</td>
                <td>{w.document || '—'}</td>
                <td>{w.phone || '—'}</td>
                <td>{w.position || '—'}</td>
                <td>{w.hired_at ? String(w.hired_at).slice(0, 10) : '—'}</td>
                <td>{usd(w.base_salary_usd)}</td>
                <td>{w.years_service || 0} año{(w.years_service || 0) === 1 ? '' : 's'}</td>
                <td>{usd(w.monthly_salary_usd)}</td>
                <td>{w.active ? 'Activo' : 'Inactivo'}</td>
                <td className="text-right">
                  {can('workers.manage') && (
                    <button className="btn-ghost" onClick={() => {
                      setForm({
                        ...empty,
                        ...w,
                        hired_at: w.hired_at ? String(w.hired_at).slice(0, 10) : '',
                        base_salary_usd: w.base_salary_usd ?? 0,
                      });
                      setMsg('');
                    }}>Editar</button>
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
            <Field label="Fecha de ingreso">
              <input type="date" value={form.hired_at || ''} onChange={(e) => setForm({ ...form, hired_at: e.target.value })} />
            </Field>
            <Field label="Sueldo base USD / mes">
              <input type="number" min="0" step="0.01" value={form.base_salary_usd} onChange={(e) => setForm({ ...form, base_salary_usd: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 text-xs text-slate-500">
              Solo admin o gerente asignan el sueldo. El vigente sube {roster.data?.[0]?.salary_increment_pct ?? data?.salary_increment_pct ?? 5}% por cada año de antigüedad.
              La comisión no usa este monto: se calcula por los días laborados.
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
        <Modal title={`Pagar ${payLabel.toLowerCase()} a ${pay.worker.full_name}`} onClose={() => setPay(null)}>
          <form className="space-y-3" onSubmit={doPay}>
            <p className="text-sm text-slate-600">
              {data?.period?.label} · {payLabel} pendiente {usd(payRemaining)}
              {pay.kind === 'commission' ? ` · ${pay.worker.days_worked} días` : ''}
            </p>
            {!data?.cash_open && (
              <ErrorBox error={`Abra caja antes de pagar. El movimiento se registra como egreso del sobre ${payLabel}.`} />
            )}
            <Field label="Método">
              <select
                value={pay.payment_method}
                onChange={(e) => {
                  const payment_method = e.target.value;
                  const next = { ...pay, payment_method };
                  next.amount = payment_method.startsWith('bs')
                    ? Math.round(payRemaining * Number(rates.data?.[pay.rate_type] || 1) * 100) / 100
                    : payRemaining;
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
