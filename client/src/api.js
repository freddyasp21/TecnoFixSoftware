/**
 * Cliente HTTP hacia el backend local Express (/api).
 * El token JWT se guarda en localStorage y se envía en cada petición.
 */
const TOKEN_KEY = 'tecnofix_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth/login')) window.location.href = '/login';
  }

  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Error de servidor', res.status);
  return data;
}

export async function downloadExcel(moduleName) {
  const res = await api(`/export/${moduleName}`, { raw: true });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'No se pudo exportar', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tecnofix-${moduleName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export const bs = (n) =>
  `${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(Number(n) || 0)} Bs`;

export const PAYMENT_METHODS = [
  { id: 'usd_cash', label: 'USD efectivo' },
  { id: 'bs_cash', label: 'Bs efectivo' },
  { id: 'bs_mobile', label: 'Pago móvil Bs' },
  { id: 'usdt', label: 'USDT Binance' },
];

export const ORDER_STATUS = [
  { id: 'recibido', label: 'Recibido', color: 'bg-slate-100 text-slate-700' },
  { id: 'diagnostico', label: 'En diagnóstico', color: 'bg-sky-100 text-sky-800' },
  { id: 'esperando_repuesto', label: 'Esperando repuesto', color: 'bg-amber-100 text-amber-800' },
  { id: 'reparacion', label: 'En reparación', color: 'bg-indigo-100 text-indigo-800' },
  { id: 'listo', label: 'Listo', color: 'bg-emerald-100 text-emerald-800' },
  { id: 'entregado', label: 'Entregado', color: 'bg-teal-100 text-teal-800' },
  { id: 'cancelado', label: 'Cancelado', color: 'bg-rose-100 text-rose-800' },
];

export function statusMeta(id) {
  return ORDER_STATUS.find((s) => s.id === id) || { id, label: id, color: 'bg-slate-100 text-slate-700' };
}

export function rateLabel(type) {
  return { bcv: 'BCV', euro: 'Dólar €', usdt: 'USDT' }[type] || type;
}
