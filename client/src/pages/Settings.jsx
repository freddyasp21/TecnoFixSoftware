import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorBox, Field, PageHeader, Switch, useAsync } from '../components/ui';
import { useAuth } from '../auth';

const desktop = typeof window !== 'undefined' ? window.tecnoFixDesktop : null;

export default function Settings() {
  const { user } = useAuth();
  const { data, error, reload } = useAsync(() => api('/settings'));
  const [form, setForm] = useState(null);
  const [pwd, setPwd] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState('');
  const [update, setUpdate] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => { if (data) setForm({ ...data, iva_enabled: data.iva_enabled === '1' }); }, [data]);

  useEffect(() => {
    if (!desktop?.onUpdateStatus) return;
    return desktop.onUpdateStatus((payload) => {
      setStatus(payload.message || payload.status);
      setUpdate((u) => ({ ...u, ...payload }));
    });
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    await api('/settings', {
      method: 'PUT',
      body: { ...form, iva_enabled: form.iva_enabled ? '1' : '0' },
    });
    setMsg('Ajustes guardados');
    reload();
  }

  async function changePwd(e) {
    e.preventDefault();
    try {
      await api('/auth/password', { method: 'PUT', body: pwd });
      setPwd({ current_password: '', new_password: '' });
      setMsg('Contraseña actualizada');
    } catch (err) { setMsg(err.message); }
  }

  async function checkUpdates() {
    setStatus('Buscando actualizaciones…');
    if (desktop?.checkUpdates) {
      const r = await desktop.checkUpdates();
      if (!r.ok) setStatus(r.error || 'No se pudo consultar el actualizador de Electron');
      return;
    }
    try {
      const r = await api('/settings/updates');
      setUpdate(r);
      setStatus(r.message || (r.available ? `Nueva versión ${r.latest}` : 'Ya está en la última versión'));
    } catch (err) {
      setStatus(err.message);
    }
  }

  if (!form) return <ErrorBox error={error} />;

  return (
    <div>
      <PageHeader title="Configuración" subtitle={`Versión instalada ${form.app_version}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-3 p-5" onSubmit={save}>
          <h2 className="font-semibold">Datos del taller</h2>
          <Field label="Nombre"><input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></Field>
          <Field label="Eslogan"><input value={form.shop_subtitle} onChange={(e) => setForm({ ...form, shop_subtitle: e.target.value })} /></Field>
          <Field label="Teléfono"><input value={form.shop_phone} onChange={(e) => setForm({ ...form, shop_phone: e.target.value })} /></Field>
          <Field label="RIF"><input value={form.shop_rif} onChange={(e) => setForm({ ...form, shop_rif: e.target.value })} /></Field>
          <Field label="Dirección"><input value={form.shop_address} onChange={(e) => setForm({ ...form, shop_address: e.target.value })} /></Field>
          <div className="rounded-xl border border-slate-200 p-4">
            <Switch
              checked={!!form.iva_enabled}
              onChange={(v) => setForm({ ...form, iva_enabled: v })}
              label="Aplicar IVA 16% en cotizaciones y cobros"
            />
            <p className="mt-2 text-xs text-slate-500">Al activarlo, las nuevas cotizaciones, órdenes y ventas calculan IVA sobre el subtotal en USD.</p>
          </div>
          <h2 className="pt-2 font-semibold">GitHub Releases</h2>
          <Field label="Owner"><input value={form.github_owner} onChange={(e) => setForm({ ...form, github_owner: e.target.value })} /></Field>
          <Field label="Repositorio"><input value={form.github_repo} onChange={(e) => setForm({ ...form, github_repo: e.target.value })} /></Field>
          <button className="btn-primary">Guardar ajustes</button>
        </form>

        <div className="space-y-4">
          <div className="card space-y-3 p-5">
            <h2 className="font-semibold">Actualizaciones</h2>
            <p className="text-sm text-slate-500">Versión actual: <b>{form.app_version}</b></p>
            <button className="btn-dark" type="button" onClick={checkUpdates}>Buscar actualizaciones</button>
            {status && <p className="text-sm text-slate-600">{status}</p>}
            {update?.status === 'downloading' && (
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-brand-500" style={{ width: `${update.percent || 0}%` }} />
              </div>
            )}
            {desktop && update?.status === 'available' && (
              <button className="btn-primary" type="button" onClick={() => desktop.downloadUpdate()}>Descargar ahora</button>
            )}
            {desktop && update?.status === 'ready' && (
              <button className="btn-amber" type="button" onClick={() => desktop.installUpdate()}>Reiniciar e instalar</button>
            )}
            {update?.html_url && (
              <a className="text-sm text-brand-600" href={update.html_url} target="_blank" rel="noreferrer">Ver release en GitHub</a>
            )}
            {update?.available && update.assets?.length > 0 && !desktop && (
              <ul className="text-sm">
                {update.assets.map((a) => (
                  <li key={a.name}><a className="text-brand-600" href={a.url}>{a.name}</a></li>
                ))}
              </ul>
            )}
          </div>

          <form className="card space-y-3 p-5" onSubmit={changePwd}>
            <h2 className="font-semibold">Cambiar mi contraseña</h2>
            <p className="text-xs text-slate-500">Sesión: {user.username}</p>
            <Field label="Contraseña actual"><input type="password" value={pwd.current_password} onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })} required /></Field>
            <Field label="Nueva contraseña"><input type="password" value={pwd.new_password} onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} minLength={6} required /></Field>
            <button className="btn-ghost">Actualizar contraseña</button>
          </form>
        </div>
      </div>
      {msg && <p className="mt-4 text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
