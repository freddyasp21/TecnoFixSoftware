import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Wrench, CalendarDays, Boxes, Package,
  Users, HardHat, Wallet, Banknote, Bell, BadgeDollarSign, BarChart3, Settings, UserCog, LogOut,
} from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../api';
import { useAsync } from './ui';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/alertas', label: 'Alertas', icon: Bell, anyOf: ['alerts.view', 'dashboard.view'] },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, perm: 'quotes.view' },
  { to: '/ordenes', label: 'Órdenes', icon: Wrench, perm: 'orders.view' },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, perm: 'calendar.view' },
  { to: '/catalogo', label: 'Catálogo', icon: Package, perm: 'catalog.view' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, perm: 'inventory.view' },
  { to: '/clientes', label: 'Clientes', icon: Users, perm: 'clients.view' },
  { to: '/trabajadores', label: 'Trabajadores', icon: HardHat, admin: true },
  { to: '/caja', label: 'Caja', icon: Wallet, perm: 'cash.view' },
  { to: '/finanzas', label: 'Finanzas', icon: Banknote, admin: true },
  { to: '/tasas', label: 'Tasas', icon: BadgeDollarSign, everyone: true },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, perm: 'reports.view' },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog, perm: 'users.manage' },
  { to: '/configuracion', label: 'Ajustes', icon: Settings, perm: 'settings.manage' },
];

export default function Layout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const alertsQ = useAsync(async () => {
    try { return await api('/alerts/summary'); }
    catch { return { counts: { total: 0 } }; }
  }, [user?.id, location.pathname]);
  const alertCount = Number(alertsQ.data?.counts?.total) || 0;
  const ratesQ = useAsync(async () => {
    try { return await api('/rates/today'); }
    catch { return null; }
  }, [user?.id]);
  const ratesMissing = !ratesQ.loading && !ratesQ.data;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside className="no-print flex h-full w-64 shrink-0 flex-col bg-ink-900 text-slate-300">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.svg" alt="Tecno Fix" className="h-10 w-10 rounded-xl" />
          <div>
            <div className="text-base font-bold text-white leading-tight">Tecno Fix</div>
            <div className="text-[11px] uppercase tracking-wider text-sky-300/80">Software para talleres</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.filter((item) => {
            if (item.admin) return user?.role === 'Administrador';
            if (item.everyone) return true;
            return item.anyOf ? item.anyOf.some((p) => can(p)) : can(item.perm);
          }).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/alertas' && alertCount > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
              {item.to === '/tasas' && ratesMissing && (
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" title="Tasa del día pendiente" />
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 text-xs">
            <div className="font-semibold text-white">{user.full_name}</div>
            <div className="text-slate-400">{user.role}</div>
          </div>
          <button
            className="btn-ghost w-full !border-white/10 !bg-white/5 !text-slate-200 hover:!bg-white/10"
            onClick={() => { logout(); navigate('/login'); }}
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
