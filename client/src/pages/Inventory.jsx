import { useState } from 'react';
import { api, downloadExcel, usd } from '../api';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

export default function Inventory() {
  const { can } = useAuth();
  const { data, error, reload } = useAsync(() => api('/inventory'));
  const mov = useAsync(() => api('/inventory/movements?limit=40'));
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ catalog_item_id: '', qty: '', stock: '', reason: '' });
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (modal === 'in') await api('/inventory/in', { method: 'POST', body: form });
      else await api('/inventory/adjust', { method: 'POST', body: form });
      setModal(null);
      reload();
      mov.reload();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <PageHeader
        title="Inventario del taller"
        subtitle="Kardex de repuestos. El stock baja al usarse en una orden o venta directa"
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('inventario')}>Exportar Excel</button>
            {can('inventory.manage') && (
              <>
                <button className="btn-ghost" onClick={() => { setForm({ catalog_item_id: data?.[0]?.id, qty: 1, reason: 'Compra / entrada' }); setModal('in'); }}>Entrada</button>
                <button className="btn-primary" onClick={() => { setForm({ catalog_item_id: data?.[0]?.id, stock: 0, reason: 'Ajuste' }); setModal('adj'); }}>Ajuste</button>
              </>
            )}
          </>
        }
      />
      <ErrorBox error={error} />
      <div className="card mb-6 table-wrap">
        <table className="data">
          <thead>
            <tr><th>Código</th><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Precio</th></tr>
          </thead>
          <tbody>
            {(data || []).map((it) => (
              <tr key={it.id} className={it.stock <= it.min_stock ? 'bg-amber-50' : ''}>
                <td className="font-mono text-xs">{it.code}</td>
                <td>{it.name}</td>
                <td className="font-semibold">{it.stock}</td>
                <td>{it.min_stock}</td>
                <td>{usd(it.price_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mb-3 font-semibold">Movimientos recientes</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Motivo</th></tr>
          </thead>
          <tbody>
            {(mov.data || []).map((m) => (
              <tr key={m.id}>
                <td>{m.created_at}</td>
                <td>{m.name}</td>
                <td>{m.type === 'out' ? 'Salida' : m.type === 'in' ? 'Entrada' : 'Ajuste'}</td>
                <td>{m.qty}</td>
                <td>{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'in' ? 'Entrada de stock' : 'Ajuste de stock'} onClose={() => setModal(null)}>
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Producto">
              <select value={form.catalog_item_id} onChange={(e) => setForm({ ...form, catalog_item_id: e.target.value })}>
                {(data || []).map((it) => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
              </select>
            </Field>
            {modal === 'in'
              ? <Field label="Cantidad a ingresar"><input type="number" min="0.01" step="0.01" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} required /></Field>
              : <Field label="Nuevo stock"><input type="number" min="0" step="0.01" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required /></Field>}
            <Field label="Motivo"><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            <ErrorBox error={msg} />
            <button className="btn-primary w-full">Confirmar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
