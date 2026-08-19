import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Wrench, CalendarDays, Boxes, Package,
  Users, Wallet, BadgeDollarSign, BarChart3, Settings, UserCog, LogOut,
} from 'lucide-react';
import { useAuth } from '../auth';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, perm: 'quotes.view' },
  { to: '/ordenes', label: 'Órdenes', icon: Wrench, perm: 'orders.view' },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, perm: 'calendar.view' },
  { to: '/catalogo', label: 'Catálogo', icon: Package, perm: 'catalog.view' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, perm: 'inventory.view' },
  { to: '/clientes', label: 'Clientes', icon: Users, perm: 'clients.view' },
  { to: '/caja', label: 'Caja', icon: Wallet, perm: 'cash.view' },
  { to: '/tasas', label: 'Tasas', icon: BadgeDollarSign, perm: 'rates.view' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, perm: 'reports.view' },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog, perm: 'users.manage' },
  { to: '/configuracion', label: 'Ajustes', icon: Settings, perm: 'settings.manage' },
];

export default function Layout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="no-print flex w-64 shrink-0 flex-col bg-ink-900 text-slate-300">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.svg" alt="Tecno Fix" className="h-10 w-10 rounded-xl" />
          <div>
            <div className="text-base font-bold text-white leading-tight">Tecno Fix</div>
            <div className="text-[11px] uppercase tracking-wider text-sky-300/80">Software para talleres</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pb-4">
          {NAV.filter((item) => can(item.perm)).map((item) => (
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
              {item.label}
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
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
