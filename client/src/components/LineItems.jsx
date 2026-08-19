import { useEffect, useRef, useState } from 'react';
import { api, usd } from '../api';

export default function LineItems({ items, setItems }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const box = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      api(`/catalog/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function add(hit) {
    setItems([
      ...items,
      {
        catalog_item_id: hit.id,
        type: hit.type,
        description: hit.name,
        qty: 1,
        unit_price: hit.price_usd,
      },
    ]);
    setQ('');
    setHits([]);
  }

  function update(i, patch) {
    setItems(items.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      next.line_total = (Number(next.qty) || 0) * (Number(next.unit_price) || 0);
      return next;
    }));
  }

  return (
    <div>
      <label>Agregar del catálogo</label>
      <div className="relative" ref={box}>
        <input placeholder="Buscar producto o servicio…" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {hits.map((h) => (
              <button type="button" key={h.id} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sky-50" onClick={() => add(h)}>
                <span><span className="font-mono text-xs text-slate-400">{h.code}</span> {h.name}</span>
                <span className="text-slate-500">{usd(h.price_usd)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 table-wrap rounded-xl border border-slate-200">
        <table className="data">
          <thead>
            <tr><th>Descripción</th><th>Cant.</th><th>P. unit. USD</th><th>Total</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="text-slate-400">Sin ítems. Busque en el catálogo.</td></tr>}
            {items.map((it, i) => (
              <tr key={i}>
                <td><input value={it.description} onChange={(e) => update(i, { description: e.target.value })} /></td>
                <td className="w-24"><input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => update(i, { qty: e.target.value })} /></td>
                <td className="w-32"><input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} /></td>
                <td>{usd((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</td>
                <td><button type="button" className="btn-ghost" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
