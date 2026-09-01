import { useState } from 'react';
import { api, downloadExcel } from '../api';
import { ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

export default function Users() {
  const { can, user } = useAuth();
  const { data: users, error, reload } = useAsync(() => api('/users'));
  const rolesQ = useAsync(() => api('/users/roles'));
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role_id: '' });
  const [reset, setReset] = useState({ id: null, password: '' });
  const [msg, setMsg] = useState('');

  const roles = rolesQ.data?.roles || [];
  const permissions = rolesQ.data?.permissions || [];
  const isAdmin = user?.role === 'Administrador';

  async function saveUser(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/users', { method: 'POST', body: form });
      setModal(null);
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function toggle(u) {
    await api(`/users/${u.id}`, { method: 'PUT', body: { active: u.active ? 0 : 1 } });
    reload();
  }

  async function removeUser(u) {
    if (!confirm(`¿Eliminar al usuario ${u.username}? Esta acción no se puede deshacer.`)) return;
    setMsg('');
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function resetPassword(e) {
    e.preventDefault();
    await api(`/users/${reset.id}/reset-password`, { method: 'POST', body: { new_password: reset.password } });
    setReset({ id: null, password: '' });
  }

  async function saveRolePerms(role) {
    await api(`/users/roles/${role.id}/permissions`, {
      method: 'PUT',
      body: { permission_ids: role.permission_ids },
    });
    rolesQ.reload();
  }

  return (
    <div>
      <PageHeader
        title="Usuarios y roles"
        subtitle="Cuentas, RBAC y restablecimiento de contraseñas"
        actions={
          <>
            <button className="btn-ghost" onClick={() => downloadExcel('usuarios')}>Exportar Excel</button>
            <button className="btn-primary" onClick={() => { setForm({ username: '', password: '', full_name: '', role_id: roles[0]?.id }); setModal('user'); }}>
              Nuevo usuario
            </button>
          </>
        }
      />
      <ErrorBox error={error || msg} />
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.username}</td>
                <td>{u.full_name}</td>
                <td>{u.role}</td>
                <td>{u.active ? 'Activo' : 'Inactivo'}</td>
                <td className="space-x-2 text-right">
                  <button className="btn-ghost" onClick={() => toggle(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                  <button className="btn-ghost" onClick={() => setReset({ id: u.id, password: '' })}>Reset clave</button>
                  {isAdmin && u.id !== user.id && (
                    <button className="btn-danger" onClick={() => removeUser(u)}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Permisos por rol</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {roles.map((role) => (
          <div key={role.id} className="card p-4">
            <h3 className="mb-3 font-semibold">{role.name}</h3>
            <div className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {permissions.map((p) => (
                <label key={p.id} className="flex items-center gap-2 !normal-case !tracking-normal !text-slate-700">
                  <input
                    type="checkbox"
                    className="w-auto"
                    checked={role.permission_ids.includes(p.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...role.permission_ids, p.id]
                        : role.permission_ids.filter((id) => id !== p.id);
                      role.permission_ids = next;
                      rolesQ.setData({ ...rolesQ.data, roles: roles.map((r) => r.id === role.id ? { ...r, permission_ids: next } : r) });
                    }}
                  />
                  {p.description}
                </label>
              ))}
            </div>
            {can('users.manage') && (
              <button className="btn-primary mt-3 w-full" onClick={() => saveRolePerms(role)}>Guardar permisos</button>
            )}
          </div>
        ))}
      </div>

      {modal === 'user' && (
        <Modal title="Nuevo usuario" onClose={() => setModal(null)}>
          <form className="space-y-3" onSubmit={saveUser}>
            <Field label="Usuario"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
            <Field label="Nombre completo"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
            <Field label="Contraseña"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} /></Field>
            <Field label="Rol">
              <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <ErrorBox error={msg} />
            <button className="btn-primary w-full">Crear</button>
          </form>
        </Modal>
      )}

      {reset.id && (
        <Modal title="Restablecer contraseña" onClose={() => setReset({ id: null, password: '' })}>
          <form className="space-y-3" onSubmit={resetPassword}>
            <Field label="Nueva contraseña">
              <input type="password" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} minLength={6} required />
            </Field>
            <button className="btn-primary w-full">Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
