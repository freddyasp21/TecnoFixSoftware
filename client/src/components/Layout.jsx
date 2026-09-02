import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Wrench, CalendarDays, Boxes, Package,
  Users, HardHat, Wallet, Banknote, Bell, BadgeDollarSign, BarChart3, Settings, UserCog, LogOut, Upload,
  Search,
} from 'lucide-react';
import { useAuth } from '../auth';
import { api, initials } from '../api';
import { useAsync } from './ui';
import OpsBanner from './OpsBanner';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/alertas', label: 'Alertas', icon: Bell, anyOf: ['alerts.view', 'dashboard.view'] },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, perm: 'quotes.view' },
  { to: '/ordenes', label: 'Órdenes', icon: Wrench, perm: 'orders.view' },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, perm: 'calendar.view' },
  { to: '/catalogo', label: 'Catálogo', icon: Package, perm: 'catalog.view' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, perm: 'inventory.view' },
  { to: '/clientes', label: 'Clientes', icon: Users, perm: 'clients.view' },
  { to: '/trabajadores', label: 'Trabajadores', icon: HardHat, perm: 'workers.view' },
  { to: '/caja', label: 'Caja', icon: Wallet, perm: 'cash.view' },
  { to: '/finanzas', label: 'Finanzas', icon: Banknote, perm: 'finance.view' },
  { to: '/tasas', label: 'Tasas', icon: BadgeDollarSign, everyone: true },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, perm: 'reports.view' },
  { to: '/importar', label: 'Importar', icon: Upload, admin: true },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog, perm: 'users.manage' },
  { to: '/configuracion', label: 'Ajustes', icon: Settings, perm: 'settings.manage' },
];

export default function Layout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
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
  const bcv = ratesQ.data?.bcv;

  function search(e) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/ordenes?q=${encodeURIComponent(term)}` : '/ordenes');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="no-print flex h-full w-[250px] shrink-0 flex-col border-r border-violet-100 bg-white">
        <div className="flex items-center gap-3 px-5 py-6">
          <img src="/logo.svg" alt="Tecno Fix" className="h-10 w-10 rounded-2xl shadow-card" />
          <div>
            <div className="text-lg font-extrabold leading-tight text-slate-800">Tecno Fix</div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-500">Taller</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
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
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-card'
                    : 'text-slate-500 hover:bg-violet-50 hover:text-brand-500'
                }`
              }
            >
              <item.icon size={18} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/alertas' && alertCount > 0 && (
                <span className="rounded-full bg-[#5255F9] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
              {item.to === '/tasas' && ratesMissing && (
                <span className="h-2.5 w-2.5 rounded-full bg-[#5255F9]" title="Tasa del día pendiente" />
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-violet-100 p-4">
          <button
            className="btn-ghost w-full !justify-start"
            onClick={() => { logout(); navigate('/login'); }}
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-violet-100 bg-white/80 px-5 py-3 backdrop-blur lg:px-8">
          <form onSubmit={search} className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="!rounded-full bg-violet-50/80 pl-9"
              placeholder="Buscar órdenes, cliente, serial…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <button
            type="button"
            className="hidden shrink-0 items-center gap-2 rounded-full bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-card sm:flex"
            onClick={() => navigate('/tasas')}
            title="Tasa BCV del día"
          >
            <BadgeDollarSign size={16} />
            {bcv ? `BCV ${Number(bcv).toLocaleString('es-VE')}` : 'Tasa pendiente'}
          </button>
          <button
            type="button"
            className="relative grid h-10 w-10 place-items-center rounded-full border border-violet-100 bg-white text-slate-500 hover:text-brand-500"
            onClick={() => navigate('/alertas')}
            title="Alertas"
          >
            <Bell size={18} />
            {alertCount > 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#5255F9]" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-[#5255F9] text-xs font-bold text-white">
              {initials(user.full_name)}
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-bold text-slate-800">{user.full_name}</div>
              <div className="text-[11px] text-slate-400">{user.role}</div>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-5 lg:p-8">
          <OpsBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
