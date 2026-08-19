import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Rates from './pages/Rates';
import Catalog from './pages/Catalog';
import Quotes from './pages/Quotes';
import QuoteForm from './pages/QuoteForm';
import Orders from './pages/Orders';
import OrderForm from './pages/OrderForm';
import OrderPrint from './pages/OrderPrint';
import CalendarPage from './pages/CalendarPage';
import Inventory from './pages/Inventory';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Cash from './pages/Cash';
import Finance from './pages/Finance';
import Workers from './pages/Workers';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function Guard({ children }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-900 text-sky-100">
        Cargando Tecno Fix…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/ordenes/:id/imprimir" element={<Guard><OrderPrint /></Guard>} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="usuarios" element={<Users />} />
        <Route path="tasas" element={<Rates />} />
        <Route path="catalogo" element={<Catalog />} />
        <Route path="cotizaciones" element={<Quotes />} />
        <Route path="cotizaciones/nueva" element={<QuoteForm />} />
        <Route path="cotizaciones/:id" element={<QuoteForm />} />
        <Route path="ordenes" element={<Orders />} />
        <Route path="ordenes/nueva" element={<OrderForm />} />
        <Route path="ordenes/:id" element={<OrderForm />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="inventario" element={<Inventory />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="caja" element={<Cash />} />
        <Route path="finanzas" element={<Finance />} />
        <Route path="trabajadores" element={<Workers />} />
        <Route path="reportes" element={<Reports />} />
        <Route path="configuracion" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
