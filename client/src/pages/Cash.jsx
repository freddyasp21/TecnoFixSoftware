import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadExcel, usd, bs, PAYMENT_METHODS } from '../api';
import LineItems from '../components/LineItems';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

export default function Cash() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(() => api('/cash/current'));
  const [openForm, setOpenForm] = useState(null);
  const [move, setMove] = useState({ type: 'income', payment_method: 'usd_cash', amount: '', description: '', rate_type: 'bcv' });
  const [sale, setSale] = useState(null);
  const [closeF, setCloseF] = useState(null);
  const [collect, setCollect] = useState(null);
  const [techs, setTechs] = useState([]);
  const [msg, setMsg] = useState('');
  const rates = useAsync(() => api('/rates/today'));

  const session = data?.session;
  const bd = data?.breakdown;

  async function openCash(e) {
    e.preventDefault();
    try {
      await api('/cash/open', { method: 'POST', body: openForm });
      setOpenForm(null); reload();
    } catch (err) { setMsg(err.message); }
  }
  async function addMove(e) {
    e.preventDefault();
    try {
      await api('/cash/transactions', { method: 'POST', body: move });
      setMove({ ...move, amount: '', description: '' });
      reload();
    } catch (err) { setMsg(err.message); }
  }
  async function closeCash(e) {
    e.preventDefault();
    try {
      await api('/cash/close', { method: 'POST', body: closeF });
      setCloseF(null); reload();
    } catch (err) { setMsg(err.message); }
  }
  async function doSale(e) {
    e.preventDefault();
    try {
      await api('/cash/sale', { method: 'POST', body: sale });
      setSale(null); reload();
    } catch (err) { setMsg(err.message); }
  }

  function openCollect(q) {
    if (!session) {
      setMsg('Abra caja primero para cobrar la cotización.');
      return;
    }
    api('/orders/lookups/technicians').then(setTechs).catch(() => {});
    const method = 'usd_cash';
    setCollect({
      quote: q,
      payment_method: method,
      rate_type: q.rate_type || 'bcv',
      amount: q.total,
      technician_id: '',
      device_brand: '',
      device_model: '',
      serial_number: '',
      device_password: '',
      fault_description: '',
    });
    setMsg('');
  }

  function suggestedAmount(c) {
    if (!c) return '';
    if (c.payment_method.startsWith('bs')) {
      const rate = Number(rates.data?.[c.rate_type] || c.quote.rate_value || 1);
      return Math.round(Number(c.quote.total) * rate * 100) / 100;
    }
    return c.quote.total;
  }

  async function doCollect(e) {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api('/cash/collect-quote', {
        method: 'POST',
        body: {
          quote_id: collect.quote.id,
          payment_method: collect.payment_method,
          rate_type: collect.rate_type,
          amount: collect.amount === '' ? suggestedAmount(collect) : collect.amount,
          technician_id: collect.technician_id || null,
          device_brand: collect.device_brand,
          device_model: collect.device_model,
          serial_number: collect.serial_number,
          device_password: collect.device_password,
          fault_description: collect.fault_description,
        },
      });
      setCollect(null);
      reload();
      navigate(`/ordenes/${r.order.id}`);
    } catch (err) { setMsg(err.message); }
  }

  const totalsUsd = useMemo(() => {
    if (!bd) return { income: 0, expense: 0 };
    const sum = (side) => PAYMENT_METHODS.reduce((s, m) => s + Number(bd[side]?.[m.id]?.amount_usd || 0), 0);
    return { income: sum('income'), expense: sum('expense') };
  }, [bd]);

  return (
    <div>
      <PageHeader
        title="Control de caja"
        subtitle="Cotización aprobada se cobra aquí. Si el cobro es exitoso, se crea la orden de trabajo."
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('caja')}>Exportar Excel</button>
            {can('cash.manage') && !session && <button className="btn-primary" onClick={() => { setOpenForm({ open_usd: 0, open_bs: 0, open_usdt: 0, notes: '' }); setMsg(''); }}>Abrir caja</button>}
            {can('cash.manage') && session && (
              <>
                <button className="btn-ghost" onClick={() => setSale({ items: [], payment_method: 'usd_cash', rate_type: 'bcv', amount: '' })}>Venta directa</button>
                <button className="btn-amber" onClick={() => setCloseF({ close_usd: 0, close_bs: 0, close_usdt: 0, notes: '' })}>Cerrar caja</button>
              </>
            )}
          </>
        }
      />
      <ErrorBox error={error || msg} />

      {(data?.pendingQuotes || []).length > 0 && (
        <div className="card mb-6 table-wrap">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-ink-900">Cotizaciones por cobrar</h2>
            <p className="text-xs text-slate-500">Aprobadas por el cliente. Al cobrar se genera la orden de servicio.</p>
          </div>
          <table className="data">
            <thead>
              <tr><th>Número</th><th>Cliente</th><th>Total USD</th><th></th></tr>
            </thead>
            <tbody>
              {data.pendingQuotes.map((q) => (
                <tr key={q.id}>
                  <td className="font-semibold">{q.number}</td>
                  <td>{q.client_name || '—'}</td>
                  <td>{usd(q.total)}</td>
                  <td className="text-right">
                    {can('cash.manage') && (
                      <button className="btn-amber" onClick={() => openCollect(q)}>Cobrar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!session && <p className="mb-4 text-sm text-slate-500">No hay caja abierta. Ábrala para registrar el cobro y crear la orden.</p>}
      {session && (
        <>
          <p className="mb-4 text-sm text-slate-500">Abierta {session.opened_at} por {session.opened_by_name}</p>
          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {PAYMENT_METHODS.map((m) => {
              const inc = bd?.income?.[m.id] || { amount: 0, amount_usd: 0 };
              const exp = bd?.expense?.[m.id] || { amount: 0, amount_usd: 0 };
              return (
                <div key={m.id} className="card p-4">
                  <div className="text-xs font-semibold uppercase text-slate-500">{m.label}</div>
                  <div className="mt-1 text-lg font-bold">{m.id.startsWith('bs') ? bs(inc.amount - exp.amount) : usd(inc.amount - exp.amount)}</div>
                  <div className="text-xs text-slate-400">Equiv. {usd(inc.amount_usd - exp.amount_usd)}</div>
                </div>
              );
            })}
          </div>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="card p-4"><div className="text-xs uppercase text-slate-500">Ingresos USD</div><div className="text-xl font-bold text-emerald-700">{usd(totalsUsd.income)}</div></div>
            <div className="card p-4"><div className="text-xs uppercase text-slate-500">Egresos USD</div><div className="text-xl font-bold text-rose-700">{usd(totalsUsd.expense)}</div></div>
            <div className="card p-4"><div className="text-xs uppercase text-slate-500">Neto USD</div><div className="text-xl font-bold">{usd(totalsUsd.income - totalsUsd.expense)}</div></div>
          </div>

          {can('cash.manage') && (
            <form className="card mb-6 grid gap-3 p-5 md:grid-cols-6" onSubmit={addMove}>
              <Field label="Tipo">
                <select value={move.type} onChange={(e) => setMove({ ...move, type: e.target.value })}>
                  <option value="income">Ingreso</option>
                  <option value="expense">Egreso</option>
                </select>
              </Field>
              <Field label="Método">
                <select value={move.payment_method} onChange={(e) => setMove({ ...move, payment_method: e.target.value })}>
                  {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Tasa (para Bs)">
                <select value={move.rate_type} onChange={(e) => setMove({ ...move, rate_type: e.target.value })}>
                  <option value="bcv">BCV {rates.data?.bcv || ''}</option>
                  <option value="euro">Euro {rates.data?.euro || ''}</option>
                  <option value="usdt">USDT {rates.data?.usdt || ''}</option>
                </select>
              </Field>
              <Field label="Monto"><input type="number" step="0.01" min="0.01" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} required /></Field>
              <Field label="Descripción"><input value={move.description} onChange={(e) => setMove({ ...move, description: e.target.value })} /></Field>
              <div className="flex items-end"><button className="btn-primary w-full">Registrar</button></div>
            </form>
          )}

          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr><th>Hora</th><th>Tipo</th><th>Método</th><th>Monto</th><th>USD</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {(data.movements || []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.created_at?.slice(11, 19)}</td>
                    <td>{t.type === 'income' ? 'Ingreso' : 'Egreso'}</td>
                    <td>{PAYMENT_METHODS.find((m) => m.id === t.payment_method)?.label}</td>
                    <td>{t.payment_method.startsWith('bs') ? bs(t.amount) : usd(t.amount)}</td>
                    <td>{usd(t.amount_usd)}</td>
                    <td>{t.description} {t.order_number || ''} {t.client_name || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openForm && (
        <Modal title="Apertura de caja" onClose={() => setOpenForm(null)}>
          <form className="space-y-3" onSubmit={openCash}>
            <Field label="Fondo USD"><input type="number" step="0.01" value={openForm.open_usd} onChange={(e) => setOpenForm({ ...openForm, open_usd: e.target.value })} /></Field>
            <Field label="Fondo Bs"><input type="number" step="0.01" value={openForm.open_bs} onChange={(e) => setOpenForm({ ...openForm, open_bs: e.target.value })} /></Field>
            <Field label="Fondo USDT"><input type="number" step="0.01" value={openForm.open_usdt} onChange={(e) => setOpenForm({ ...openForm, open_usdt: e.target.value })} /></Field>
            <Field label="Notas"><input value={openForm.notes} onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })} /></Field>
            <button className="btn-primary w-full">Abrir</button>
          </form>
        </Modal>
      )}
      {closeF && (
        <Modal title="Cierre y cuadre de caja" onClose={() => setCloseF(null)}>
          <form className="space-y-3" onSubmit={closeCash}>
            <p className="text-sm text-slate-500">Ingrese el conteo físico al cierre.</p>
            <Field label="Conteo USD"><input type="number" step="0.01" value={closeF.close_usd} onChange={(e) => setCloseF({ ...closeF, close_usd: e.target.value })} /></Field>
            <Field label="Conteo Bs"><input type="number" step="0.01" value={closeF.close_bs} onChange={(e) => setCloseF({ ...closeF, close_bs: e.target.value })} /></Field>
            <Field label="Conteo USDT"><input type="number" step="0.01" value={closeF.close_usdt} onChange={(e) => setCloseF({ ...closeF, close_usdt: e.target.value })} /></Field>
            <Field label="Notas"><input value={closeF.notes} onChange={(e) => setCloseF({ ...closeF, notes: e.target.value })} /></Field>
            <button className="btn-amber w-full">Cerrar caja</button>
          </form>
        </Modal>
      )}
      {sale && (
        <Modal title="Venta directa de mostrador" wide onClose={() => setSale(null)}>
          <form className="space-y-3" onSubmit={doSale}>
            <LineItems items={sale.items} setItems={(items) => setSale({ ...sale, items })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Método de pago">
                <select value={sale.payment_method} onChange={(e) => setSale({ ...sale, payment_method: e.target.value })}>
                  {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Tasa">
                <select value={sale.rate_type} onChange={(e) => setSale({ ...sale, rate_type: e.target.value })}>
                  <option value="bcv">BCV</option>
                  <option value="euro">Dólar €</option>
                  <option value="usdt">USDT</option>
                </select>
              </Field>
              <Field label="Monto cobrado (opcional, vacío = total USD)">
                <input type="number" step="0.01" value={sale.amount} onChange={(e) => setSale({ ...sale, amount: e.target.value })} />
              </Field>
            </div>
            <ErrorBox error={msg} />
            <button className="btn-primary w-full">Cobrar y descontar stock</button>
          </form>
        </Modal>
      )}
      {collect && (
        <Modal title={`Cobrar ${collect.quote.number}`} wide onClose={() => setCollect(null)}>
          <form className="space-y-3" onSubmit={doCollect}>
            <p className="text-sm text-slate-600">
              Cliente: <b>{collect.quote.client_name || '—'}</b> · Total {usd(collect.quote.total)}
              {collect.quote.iva_enabled ? ` (IVA ${collect.quote.iva_rate}%)` : ''}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Método de pago">
                <select
                  value={collect.payment_method}
                  onChange={(e) => {
                    const payment_method = e.target.value;
                    const next = { ...collect, payment_method };
                    next.amount = payment_method.startsWith('bs')
                      ? Math.round(Number(collect.quote.total) * Number(rates.data?.[collect.rate_type] || collect.quote.rate_value || 1) * 100) / 100
                      : collect.quote.total;
                    setCollect(next);
                  }}
                >
                  {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Tasa (si cobra en Bs)">
                <select value={collect.rate_type} onChange={(e) => setCollect({ ...collect, rate_type: e.target.value })}>
                  <option value="bcv">BCV</option>
                  <option value="euro">Dólar €</option>
                  <option value="usdt">USDT</option>
                </select>
              </Field>
              <Field label="Monto a cobrar">
                <input type="number" step="0.01" min="0.01" value={collect.amount} onChange={(e) => setCollect({ ...collect, amount: e.target.value })} required />
              </Field>
            </div>
            <Field label="Técnico">
              <select value={collect.technician_id} onChange={(e) => setCollect({ ...collect, technician_id: e.target.value })}>
                <option value="">— Sin asignar —</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marca"><input value={collect.device_brand} onChange={(e) => setCollect({ ...collect, device_brand: e.target.value })} /></Field>
              <Field label="Modelo"><input value={collect.device_model} onChange={(e) => setCollect({ ...collect, device_model: e.target.value })} /></Field>
            </div>
            <Field label="Serial"><input value={collect.serial_number} onChange={(e) => setCollect({ ...collect, serial_number: e.target.value })} /></Field>
            <Field label="Contraseña / PIN"><input value={collect.device_password} onChange={(e) => setCollect({ ...collect, device_password: e.target.value })} /></Field>
            <Field label="Falla"><textarea rows={2} value={collect.fault_description} onChange={(e) => setCollect({ ...collect, fault_description: e.target.value })} /></Field>
            <ErrorBox error={msg} />
            <button type="submit" className="btn-amber w-full">Confirmar cobro y crear orden</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
