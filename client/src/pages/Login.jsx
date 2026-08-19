import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorBox } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink-900 p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.18),_transparent_55%)]" />
      <form onSubmit={onSubmit} className="relative w-full max-w-md rounded-3xl border border-white/10 bg-ink-800 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-12 w-12 rounded-2xl" />
          <div>
            <h1 className="text-xl font-bold text-white">Tecno Fix</h1>
            <p className="text-sm text-sky-300">Software para talleres</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="!text-slate-400">Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="!text-slate-400">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <ErrorBox error={error} />
          <button className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
          <p className="text-center text-xs text-slate-500">
            Usuario inicial: <span className="text-slate-300">admin</span> / <span className="text-slate-300">Admin123!</span>
          </p>
        </div>
      </form>
    </div>
  );
}
