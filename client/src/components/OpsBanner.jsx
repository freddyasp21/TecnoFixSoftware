import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from './ui';
import { useAuth } from '../auth';

export default function OpsBanner() {
  const { can } = useAuth();
  const location = useLocation();
  const { data } = useAsync(() => api('/ops').catch(() => null), [location.pathname]);
  if (location.pathname === '/calendario') return null;
  if (!data || data.configured) return null;
  const manage = can('ops.manage');
  return (
    <div className="mb-6 rounded-[22px] border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-card">
      {manage
        ? <>Fije la fecha de inicio de operaciones en el <Link className="font-semibold text-brand-500 underline" to="/calendario">calendario</Link> para que el software cuente órdenes, caja y días laborados.</>
        : <>El administrador o gerente debe fijar la fecha de inicio en el calendario antes de abrir caja, cotizar o marcar asistencia.</>}
    </div>
  );
}
