import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadExcel, usd, FINANCE_BUCKETS, PAYMENT_METHODS, localDate } from '../api';
import { ErrorBox, Field, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const ENVELOPE_STYLE = {
  payroll: { bar: 'bg-sky-500', wrap: 'bg-sky-50 border-sky-100', pct: 'text-sky-700' },
  salary: { bar: 'bg-indigo-500', wrap: 'bg-indigo-50 border-indigo-100', pct: 'text-indigo-700' },
  supplies: { bar: 'bg-amber-500', wrap: 'bg-amber-50 border-amber-100', pct: 'text-amber-800' },
  savings: { bar: 'bg-emerald-500', wrap: 'bg-emerald-50 border-emerald-100', pct: 'text-emerald-700' },
  operation: { bar: 'bg-slate-500', wrap: 'bg-slate-50 border-slate-200', pct: 'text-slate-700' },
  iva: { bar: 'bg-violet-500', wrap: 'bg-violet-50 border-violet-100', pct: 'text-violet-800' },
};

const ENVELOPE_ORDER = ['payroll', 'salary', 'supplies', 'savings', 'operation', 'iva'];

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return localDate();
}

export default function Finance() {
  const { can } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [rulesForm, setRulesForm] = useState({ payroll: 40, supplies: 30, savings: 20, salary_increment_pct: 5 });
  const [msg, setMsg] = useState('');
  const { data, error, reload } = useAsync(
    () => api(`/finance?from=${from}&to=${to}`),
    [from, to]
  );

  useEffect(() => {
    if (data?.rules) {
      setRulesForm({
        payroll: data.rules.payroll,
        supplies: data.rules.supplies,
        savings: data.rules.savings,
        salary_increment_pct: data.rules.salary_increment_pct ?? 5,
      });
    }
  }, [data]);

  const envelopes = data?.envelopes || [];
  const restPct = Math.max(0, 100 - Number(rulesForm.payroll || 0) - Number(rulesForm.supplies || 0) - Number(rulesForm.savings || 0));
  const envelopeCards = useMemo(() => {
    const ivaRate = Number(data?.iva_rate ?? 16);
    const cards = [
      ...envelopes,
      {
        id: 'iva',
        label: 'IVA',
        hint: `${ivaRate}% del total que ingresa en el período. Reserva fiscal, no se reparte en los otros sobres.`,
        pct: ivaRate,
        allocated: Number(data?.iva_usd) || 0,
        spent: null,
        remaining: null,
      },
    ];
    return ENVELOPE_ORDER
      .map((id) => cards.find((c) => c.id === id))
      .filter(Boolean)
      .concat(cards.filter((c) => !ENVELOPE_ORDER.includes(c.id)));
  }, [envelopes, data?.iva_rate, data?.iva_usd]);

  async function saveRules(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/finance/rules', { method: 'PUT', body: rulesForm });
      setMsg('Reglas guardadas. Los ingresos del período se recalcularon.');
      reload();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function classify(id, finance_bucket) {
    setMsg('');
    try {
      await api(`/finance/transactions/${id}`, {
        method: 'PUT',
        body: { finance_bucket: finance_bucket || null },
      });
      reload();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Gestión financiera"
        subtitle="Los cobros de órdenes (incluidas las importadas) alimentan comisiones, insumos, ahorro y operación. El salario es un monto fijo por trabajador."
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('finanzas')}>Exportar Excel</button>
            {can('cash.view') && <Link className="btn-ghost" to="/caja">Ir a caja</Link>}
            {can('workers.view') && <Link className="btn-ghost" to="/trabajadores">Trabajadores</Link>}
          </>
        }
      />
      {data?.from && (
        <p className="mb-4 text-sm text-slate-600">
          Período {data.from} → {data.to}
          {data?.ops?.current_date ? ` · día operativo ${data.ops.current_date}` : ''}
        </p>
      )}
      <ErrorBox error={error || (msg && !msg.startsWith('Reglas') ? msg : '')} />
      {msg.startsWith('Reglas') && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-[180px]"><Field label="Desde"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field></div>
        <div className="w-[180px]"><Field label="Hasta"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Ingresos</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{usd(data?.income_usd)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Egresos (caja)</div>
          <div className="mt-1 text-2xl font-bold text-rose-700">{usd(data?.expense_usd)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Neto</div>
          <div className="mt-1 text-2xl font-bold">{usd(data?.net_usd)}</div>
        </div>
        <div className="card border-violet-100 bg-violet-50 p-4">
          <div className="text-xs font-semibold uppercase text-violet-800">IVA {data?.iva_rate ?? 16}%</div>
          <div className="mt-1 text-2xl font-bold text-violet-950">{usd(data?.iva_usd)}</div>
          <div className="mt-1 text-xs text-violet-800/80">Del total que ingresa en el período</div>
        </div>
      </div>

      {!!data?.unclassified_expense_usd && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Hay {usd(data.unclassified_expense_usd)} en egresos sin sobre. Clasifíquelos abajo para que descuenten del presupuesto correcto.
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {envelopeCards.map((env) => {
          const style = ENVELOPE_STYLE[env.id] || ENVELOPE_STYLE.operation;
          const isIva = env.id === 'iva';
          const isSalary = env.id === 'salary';
          const over = !isIva && env.remaining < 0;
          const usedPct = env.allocated > 0
            ? Math.min(100, (env.spent / env.allocated) * 100)
            : (env.spent > 0 ? 100 : 0);
          const allocatedHint = isIva
            ? 'A reservar sobre ingresos de caja'
            : isSalary
              ? 'Sueldo fijo del período (no sale del % de ingresos)'
              : 'Asignado de los ingresos del período';
          return (
            <div key={env.id} className={`card border p-4 md:p-3 lg:p-5 ${style.wrap}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900">{env.label}</div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{env.hint}</p>
                </div>
                <div className={`shrink-0 text-lg font-bold ${style.pct}`}>{env.pctLabel || `${env.pct}%`}</div>
              </div>
              <div className="mt-3 text-xl font-bold text-ink-900 lg:mt-4 lg:text-2xl">{usd(env.allocated)}</div>
              <div className="text-xs text-slate-500">{allocatedHint}</div>
              {!isIva && (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
                    <div className={`h-full ${over ? 'bg-rose-500' : style.bar}`} style={{ width: `${usedPct}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs uppercase text-slate-500">Gastado</div>
                      <div className="font-semibold text-rose-700">{usd(env.spent)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-500">{over ? 'Excedido' : 'Disponible'}</div>
                      <div className={`font-semibold ${over ? 'text-rose-700' : 'text-emerald-700'}`}>{usd(env.remaining)}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {can('finance.manage') && (
        <form className="card mb-6 p-5" onSubmit={saveRules}>
          <h2 className="mb-1 font-semibold text-ink-900">Reglas de reparto</h2>
          <p className="mb-4 text-sm text-slate-500">
            Sobre cada dólar que entra a caja se reparte comisión, insumos y ahorro. El resto hasta 100% queda en utilidad / operación.
            El salario es un monto fijo por trabajador; el incremento anual lo define admin o gerente.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Comisiones %">
              <input type="number" min="0" max="100" step="1" value={rulesForm.payroll} onChange={(e) => setRulesForm({ ...rulesForm, payroll: e.target.value })} />
            </Field>
            <Field label="Insumos / piezas %">
              <input type="number" min="0" max="100" step="1" value={rulesForm.supplies} onChange={(e) => setRulesForm({ ...rulesForm, supplies: e.target.value })} />
            </Field>
            <Field label="Ahorro e inversión %">
              <input type="number" min="0" max="100" step="1" value={rulesForm.savings} onChange={(e) => setRulesForm({ ...rulesForm, savings: e.target.value })} />
            </Field>
            <Field label="Utilidad / operación %">
              <input value={restPct} disabled />
            </Field>
            <Field label="Incremento salario % / año">
              <input type="number" min="0" max="100" step="0.5" value={rulesForm.salary_increment_pct} onChange={(e) => setRulesForm({ ...rulesForm, salary_increment_pct: e.target.value })} />
            </Field>
          </div>
          <button className="btn-primary mt-4">Guardar reglas</button>
        </form>
      )}

      {(data?.payroll || []).length > 0 && (
        <div className="card mb-6 table-wrap">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-ink-900">Nómina registrada</h2>
            <p className="text-xs text-slate-500">Pagos desde caja: comisión (sobre de ingresos) o salario fijo.</p>
          </div>
          <table className="data">
            <thead>
              <tr><th>Fecha</th><th>Trabajador</th><th>Tipo</th><th>Quincena</th><th>Días</th><th>Pagado USD</th></tr>
            </thead>
            <tbody>
              {data.payroll.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{p.created_at}</td>
                  <td className="font-medium">{p.worker_name}</td>
                  <td>{p.kind === 'salary' ? 'Salario' : 'Comisión'}</td>
                  <td>{p.period_from} → {p.period_to}</td>
                  <td>{p.days_worked}</td>
                  <td className="text-rose-700">{usd(p.amount_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card table-wrap">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-ink-900">Movimientos del período</h2>
          <p className="text-xs text-slate-500">Incluye cobros de caja y de órdenes importadas. Clasifique cada egreso para descontarlo del sobre correcto.</p>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Método</th>
              <th>USD</th>
              <th>Detalle</th>
              <th>Sobre</th>
            </tr>
          </thead>
          <tbody>
            {(data?.movements || []).map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{t.created_at}</td>
                <td>{t.type === 'income' ? 'Ingreso' : 'Egreso'}</td>
                <td>{PAYMENT_METHODS.find((m) => m.id === t.payment_method)?.label}</td>
                <td className={t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}>{usd(t.amount_usd)}</td>
                <td>{[t.description, t.order_number, t.client_name, t.worker_name].filter(Boolean).join(' · ') || '—'}</td>
                <td>
                  {t.type === 'income' ? (
                    <span className="text-xs text-slate-500">Se reparte en sobres</span>
                  ) : can('finance.manage') ? (
                    <select
                      className="min-w-[200px]"
                      value={t.finance_bucket || ''}
                      onChange={(e) => classify(t.id, e.target.value)}
                    >
                      <option value="">Sin clasificar</option>
                      {FINANCE_BUCKETS.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  ) : (
                    FINANCE_BUCKETS.find((b) => b.id === t.finance_bucket)?.label || 'Sin clasificar'
                  )}
                </td>
              </tr>
            ))}
            {(data?.movements || []).length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">No hay movimientos en este rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
