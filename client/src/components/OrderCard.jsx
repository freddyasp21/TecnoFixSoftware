import { Link } from 'react-router-dom';
import { MoreVertical, Smartphone } from 'lucide-react';
import { usd, bs, statusMeta, dayOnly, initials, orderArt } from '../api';
import { Badge } from './ui';

export default function OrderCard({ order, onRemove, canDelete }) {
  const m = statusMeta(order.status);
  const device = [order.device_brand, order.device_model].filter(Boolean).join(' ') || 'Equipo';
  const tech = order.technician_name || 'Sin asignar';

  return (
    <article className="card p-3">
      <div className={`relative h-40 overflow-hidden rounded-2xl bg-gradient-to-br ${orderArt(order.number)}`}>
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white, transparent 40%)' }} />
        <Smartphone className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-white/80" />
        <div className="absolute left-3 top-3">
          <Badge className={`${m.color} shadow-sm`}>{m.label}</Badge>
        </div>
        <div className="absolute right-3 top-3">
          <Link
            to={`/ordenes/${order.id}`}
            className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:text-brand-500"
            title="Más"
          >
            <MoreVertical size={16} />
          </Link>
        </div>
        <div className="absolute bottom-4 left-4 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-brand-500 text-[11px] font-bold text-white shadow-sm">
          {initials(tech)}
        </div>
      </div>

      <div className="px-2 pb-2 pt-3">
        <p className="text-xs text-slate-400">
          Técnico: <span className="font-semibold text-brand-500">{tech}</span>
        </p>
        <Link to={`/ordenes/${order.id}`} className="mt-1 block text-lg font-bold leading-tight text-slate-800 hover:text-brand-500">
          {order.number}
        </Link>
        <p className="truncate text-sm text-slate-500">{order.client_name || 'Sin cliente'} · {device}</p>

        <div className="mt-3 grid grid-cols-2 divide-x divide-violet-100 overflow-hidden rounded-2xl border border-violet-100">
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Total USD</div>
            <div className="text-sm font-bold text-slate-800">{usd(order.total)}</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Total Bs (cobro)</div>
            <div className="text-sm font-bold text-slate-800">{bs(Number(order.total || 0) * Number(order.rate_value || 0))}</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Cobro {dayOnly(order.received_at) || '—'}
          {order.delivered_at ? ` · Entrega ${dayOnly(order.delivered_at)}` : ''}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Link className="btn-primary !px-4 !py-1.5 text-xs" to={`/ordenes/${order.id}`}>Ver orden</Link>
          <Link className="text-xs font-semibold text-brand-500 underline underline-offset-2" to={`/ordenes/${order.id}/imprimir`}>
            Imprimir
          </Link>
        </div>
        {canDelete && (
          <button type="button" className="mt-2 text-[11px] text-rose-500 hover:underline" onClick={() => onRemove?.(order.id)}>
            Eliminar
          </button>
        )}
      </div>
    </article>
  );
}
