import { useState } from 'react';
import { api, downloadExcel, usd } from '../api';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const empty = { type: 'product', code: '', name: '', description: '', price_usd: '', stock: 0, min_stock: 0, estimated_minutes: 0 };

export default function Catalog() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const { data, error, reload } = useAsync(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (type) p.set('type', type);
    return api(`/catalog?${p}`);
  }, [q, type]);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');

  function openNew() { setForm(empty); setEdit('new'); setMsg(''); }
  function openEdit(item) { setForm({ ...item }); setEdit(item.id); setMsg(''); }

  async function save(e) {
    e.preventDefault();
    try {
      if (edit === 'new') await api('/catalog', { method: 'POST', body: form });
      else await api(`/catalog/${edit}`, { method: 'PUT', body: form });
      setEdit(null);
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function remove(item) {
    const tipo = item.type === 'product' ? 'producto' : 'servicio';
    if (!confirm(`¿Eliminar el ${tipo} "${item.name}" del catálogo? Dejará de ofrecerse. Las cotizaciones y órdenes ya emitidas conservan la descripción.`)) return;
    try {
      await api(`/catalog/${item.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Catálogo de servicios y productos"
        subtitle="Base maestra que alimenta cotizaciones, órdenes y caja"
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('catalogo')}>Exportar Excel</button>
            {can('catalog.manage') && <button className="btn-primary" onClick={openNew}>Nuevo ítem</button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="max-w-xs" placeholder="Buscar código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="max-w-[180px]" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos</option>
          <option value="product">Productos</option>
          <option value="service">Servicios</option>
        </select>
      </div>
      <ErrorBox error={error} />
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Nombre</th><th>Precio USD</th><th>Stock</th><th>Tiempo</th><th></th></tr>
          </thead>
          <tbody>
            {(data || []).map((it) => (
              <tr key={it.id} className={!it.active ? 'opacity-50' : ''}>
                <td className="font-mono text-xs">{it.code}</td>
                <td>{it.type === 'product' ? 'Producto' : 'Servicio'}</td>
                <td>{it.name}</td>
                <td>{usd(it.price_usd)}</td>
                <td>{it.type === 'product' ? it.stock : '—'}</td>
                <td>{it.estimated_minutes ? `${it.estimated_minutes} min` : '—'}</td>
                <td className="space-x-2 text-right">
                  {can('catalog.manage') && (
                    <>
                      <button className="btn-ghost" onClick={() => openEdit(it)}>Editar</button>
                      <button className="btn-ghost !text-rose-600 hover:!bg-rose-50" onClick={() => remove(it)}>Eliminar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit === 'new' ? 'Nuevo ítem' : 'Editar ítem'} onClose={() => setEdit(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
            <Field label="Tipo">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="product">Producto</option>
                <option value="service">Servicio</option>
              </select>
            </Field>
            <Field label="Código"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></Field>
            <div className="sm:col-span-2"><Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field></div>
            <div className="sm:col-span-2"><Field label="Descripción"><textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
            <Field label="Precio base USD"><input type="number" step="0.01" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: e.target.value })} /></Field>
            {form.type === 'product' ? (
              <>
                <Field label="Stock">{edit === 'new' ? <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /> : <input value={form.stock} disabled />}</Field>
                <Field label="Stock mínimo"><input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></Field>
              </>
            ) : (
              <Field label="Tiempo estimado (min)"><input type="number" value={form.estimated_minutes} onChange={(e) => setForm({ ...form, estimated_minutes: e.target.value })} /></Field>
            )}
            {edit !== 'new' && (
              <Field label="Estado">
                <select value={form.active ? 1 : 0} onChange={(e) => setForm({ ...form, active: Number(e.target.value) })}>
                  <option value={1}>Activo</option>
                  <option value={0}>Inactivo</option>
                </select>
              </Field>
            )}
            <div className="sm:col-span-2"><ErrorBox error={msg} /></div>
            <div className="sm:col-span-2"><button className="btn-primary w-full">Guardar</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
