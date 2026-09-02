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
  if (!res.ok) {
    const err = new ApiError(data.error || 'Error de servidor', res.status);
    if (Array.isArray(data.errors)) err.errors = data.errors;
    throw err;
  }
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

export async function downloadImportTemplate(moduleName) {
  const res = await api(`/import/template/${moduleName}`, { raw: true });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'No se pudo descargar la plantilla', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tecnofix-plantilla-${moduleName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseImportFile(file, moduleHint) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  headers['Content-Type'] = 'application/octet-stream';
  headers['X-Filename'] = encodeURIComponent(file.name);
  if (moduleHint) headers['X-Module'] = moduleHint;
  const res = await fetch('/api/import/parse', { method: 'POST', headers, body: file });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'No se pudo leer el archivo', res.status);
  return data;
}

export const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export const bs = (n) =>
  `${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(Number(n) || 0)} Bs`;

export const FINANCE_BUCKETS = [
  { id: 'payroll', label: 'Comisiones' },
  { id: 'salary', label: 'Salario' },
  { id: 'supplies', label: 'Insumos, piezas y herramientas' },
  { id: 'savings', label: 'Ahorros e inversión' },
  { id: 'operation', label: 'Utilidad / operación' },
];

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

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const ART = [
  'from-indigo-600 via-fuchsia-500 to-pink-400',
  'from-violet-700 via-purple-500 to-cyan-400',
  'from-blue-700 via-indigo-500 to-fuchsia-400',
  'from-fuchsia-600 via-rose-500 to-amber-300',
  'from-slate-800 via-violet-600 to-sky-400',
];

export function orderArt(seed) {
  const s = String(seed || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n += s.charCodeAt(i);
  return ART[n % ART.length];
}

export function rateLabel(type) {
  return { bcv: 'BCV', euro: 'Dólar €', usdt: 'USDT' }[type] || type;
}

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayOnly(s) {
  if (!s) return '';
  return String(s).slice(0, 10);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** IVA incluido: el total USD es la suma de ítems; el IVA se descuenta de ese equivalente. */
export function computeTotals(items, ivaEnabled, ivaRate) {
  const gross = round2((items || []).reduce((s, it) => {
    const qty = Number(it.qty) || 0;
    const price = Number(it.unit_price) || 0;
    const line = it.line_total != null && it.line_total !== ''
      ? Number(it.line_total)
      : qty * price;
    return s + (Number.isFinite(line) ? line : 0);
  }, 0));
  if (!ivaEnabled) {
    return { subtotal: gross, iva: 0, iva_amount: 0, total: gross };
  }
  const rate = Number(ivaRate) || 16;
  const iva_amount = round2(gross * rate / (100 + rate));
  const subtotal = round2(gross - iva_amount);
  return { subtotal, iva: iva_amount, iva_amount, total: gross };
}
