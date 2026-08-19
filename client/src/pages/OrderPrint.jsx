import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, usd, bs, statusMeta } from '../api';

export default function OrderPrint() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [shop, setShop] = useState({});

  useEffect(() => {
    api(`/orders/${id}`).then(setOrder);
    api('/settings').then(setShop);
  }, [id]);

  if (!order) return <div className="p-10">Cargando comprobante…</div>;
  const m = statusMeta(order.status);

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-slate-800">
      <div className="no-print mb-6 flex justify-end">
        <button className="btn-primary" onClick={() => window.print()}>Imprimir</button>
      </div>
      <header className="mb-8 flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">{shop.shop_name || 'Tecno Fix'}</h1>
          <p className="text-sm text-slate-500">{shop.shop_subtitle}</p>
          <p className="text-sm">{shop.shop_address}</p>
          <p className="text-sm">{shop.shop_phone} {shop.shop_rif}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">Orden {order.number}</div>
          <div className="text-sm">{m.label}</div>
          <div className="text-xs text-slate-500">{order.received_at}</div>
        </div>
      </header>
      <section className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <h2 className="font-semibold">Cliente</h2>
          <p>{order.client_name || '—'}</p>
          <p>{order.client_document}</p>
          <p>{order.client_phone}</p>
        </div>
        <div>
          <h2 className="font-semibold">Equipo</h2>
          <p>{order.device_brand} {order.device_model}</p>
          <p>S/N: {order.serial_number || '—'}</p>
          <p>Técnico: {order.technician_name || '—'}</p>
        </div>
      </section>
      <p className="mb-4 text-sm"><b>Falla:</b> {order.fault_description || '—'}</p>
      <p className="mb-6 text-sm"><b>Observaciones:</b> {order.physical_notes || '—'}</p>
      <table className="data mb-6">
        <thead>
          <tr><th>Descripción</th><th>Cant.</th><th>P. unit.</th><th>Total</th></tr>
        </thead>
        <tbody>
          {(order.items || []).map((it) => (
            <tr key={it.id}>
              <td>{it.description}</td>
              <td>{it.qty}</td>
              <td>{usd(it.unit_price)}</td>
              <td>{usd(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-64 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{usd(order.subtotal)}</span></div>
        <div className="flex justify-between"><span>IVA</span><span>{usd(order.iva_amount)}</span></div>
        <div className="flex justify-between font-bold"><span>Total USD</span><span>{usd(order.total)}</span></div>
        <div className="flex justify-between text-slate-500"><span>Total Bs ({order.rate_type})</span><span>{bs(order.total * order.rate_value)}</span></div>
      </div>
      <p className="mt-16 text-center text-xs text-slate-400">Comprobante generado por Tecno Fix — Software para talleres</p>
    </div>
  );
}
