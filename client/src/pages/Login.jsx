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
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="absolute inset-0 hero-gradient opacity-20" />
      <form onSubmit={onSubmit} className="relative w-full max-w-md rounded-[28px] border border-white bg-white p-8 shadow-card">
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-12 w-12 rounded-2xl shadow-card" />
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Tecno Fix</h1>
            <p className="text-sm font-medium text-brand-500">Software para talleres</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label>Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <ErrorBox error={error} />
          <button className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Usuario inicial: <span className="font-semibold text-slate-600">admin</span> / <span className="font-semibold text-slate-600">Admin123!</span>
          </p>
        </div>
      </form>
    </div>
  );
}
