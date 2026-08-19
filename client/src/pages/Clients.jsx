import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadExcel } from '../api';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const empty = { name: '', document: '', phone: '', email: '', address: '', notes: '' };

export default function Clients() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const { data, error, reload } = useAsync(() => api(`/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    try {
      if (form.id) await api(`/clients/${form.id}`, { method: 'PUT', body: form });
      else await api('/clients', { method: 'POST', body: form });
      setForm(null);
      reload();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Ficha, búsqueda rápida e historial de equipos"
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('clientes')}>Exportar Excel</button>
            {can('clients.manage') && <button className="btn-primary" onClick={() => { setForm({ ...empty }); setMsg(''); }}>Nuevo cliente</button>}
          </>
        }
      />
      <input className="mb-4 max-w-md" placeholder="Buscar por nombre, cédula, teléfono o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox error={error} />
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Nombre</th><th>Cédula / RIF</th><th>Teléfono</th><th>Correo</th><th></th></tr>
          </thead>
          <tbody>
            {(data || []).map((c) => (
              <tr key={c.id}>
                <td className="font-medium"><Link className="text-brand-600" to={`/clientes/${c.id}`}>{c.name}</Link></td>
                <td>{c.document}</td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td className="text-right">{can('clients.manage') && <button className="btn-ghost" onClick={() => { setForm({ ...c }); setMsg(''); }}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setForm(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
            <div className="sm:col-span-2"><Field label="Nombre"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field></div>
            <Field label="Cédula / RIF"><input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
            <Field label="Teléfono"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Correo"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Dirección"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Notas"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><ErrorBox error={msg} /><button className="btn-primary w-full">Guardar</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
