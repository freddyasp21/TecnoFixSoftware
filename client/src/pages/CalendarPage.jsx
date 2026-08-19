import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, statusMeta } from '../api';
import { Badge, PageHeader, useAsync, ErrorBox } from '../components/ui';
import { useAuth } from '../auth';

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const { can } = useAuth();
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());

  const range = useMemo(() => {
    if (view === 'day') {
      const d = fmt(cursor);
      return { from: d, to: d };
    }
    if (view === 'week') {
      const s = startOfWeek(cursor);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      return { from: fmt(s), to: fmt(e) };
    }
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }, [view, cursor]);

  const { data, error, reload } = useAsync(
    () => api(`/calendar?from=${range.from}&to=${range.to}`),
    [range.from, range.to]
  );

  const byDay = useMemo(() => {
    const map = {};
    for (const o of data?.orders || []) {
      const rec = o.received_at?.slice(0, 10);
      if (rec) (map[rec] ||= []).push({ kind: 'in', o });
      if (o.ready_at) (map[o.ready_at.slice(0, 10)] ||= []).push({ kind: 'ready', o });
      if (o.delivered_at) (map[o.delivered_at.slice(0, 10)] ||= []).push({ kind: 'out', o });
    }
    return map;
  }, [data]);

  const workSet = new Set((data?.workDays || []).filter((d) => d.worked).map((d) => d.day));

  const days = useMemo(() => {
    const list = [];
    if (view === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const start = startOfWeek(first);
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        list.push(d);
      }
    } else if (view === 'week') {
      const s = startOfWeek(cursor);
      for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); list.push(d); }
    } else {
      list.push(new Date(cursor));
    }
    return list;
  }, [view, cursor]);

  function shift(dir) {
    const n = new Date(cursor);
    if (view === 'month') n.setMonth(n.getMonth() + dir);
    else n.setDate(n.getDate() + dir * (view === 'week' ? 7 : 1));
    setCursor(n);
  }

  async function toggleWorked(day) {
    if (!can('calendar.manage')) return;
    const worked = !workSet.has(day);
    await api('/calendar/work-days', { method: 'POST', body: { day, worked } });
    reload();
  }

  const s = data?.stats || {};

  return (
    <div>
      <PageHeader
        title="Calendario de trabajo"
        subtitle="Actividad operativa: ingresos, finalizados, entregas y días laborados"
        actions={
          <div className="flex gap-2">
            {['day', 'week', 'month'].map((v) => (
              <button key={v} className={view === v ? 'btn-dark' : 'btn-ghost'} onClick={() => setView(v)}>
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
            <button className="btn-ghost" onClick={() => shift(-1)}>←</button>
            <button className="btn-ghost" onClick={() => setCursor(new Date())}>Hoy</button>
            <button className="btn-ghost" onClick={() => shift(1)}>→</button>
          </div>
        }
      />
      <ErrorBox error={error} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Ingresadas', s.ingresadas],
          ['Finalizadas', s.finalizadas],
          ['Entregadas', s.entregadas],
          ['Pendientes', s.pendientes],
        ].map(([l, v]) => (
          <div key={l} className="card p-4">
            <div className="text-xs uppercase text-slate-500">{l}</div>
            <div className="text-xl font-bold">{v ?? 0}</div>
          </div>
        ))}
      </div>
      <div className={`grid gap-2 ${view === 'month' ? 'grid-cols-7' : view === 'week' ? 'grid-cols-7' : 'grid-cols-1'}`}>
        {view !== 'day' && ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="px-1 text-xs font-semibold uppercase text-slate-400">{d}</div>
        ))}
        {days.map((d) => {
          const key = fmt(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const events = byDay[key] || [];
          const worked = workSet.has(key);
          return (
            <button
              type="button"
              key={key}
              onClick={() => toggleWorked(key)}
              className={`min-h-[110px] rounded-xl border p-2 text-left ${worked ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'} ${!inMonth && view === 'month' ? 'opacity-40' : ''}`}
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">{d.getDate()}</span>
                {worked && <span className="text-emerald-700">Laborado</span>}
              </div>
              <div className="space-y-1">
                {events.slice(0, view === 'day' ? 20 : 3).map((ev, i) => {
                  const m = statusMeta(ev.o.status);
                  const tag = ev.kind === 'in' ? 'Ingreso' : ev.kind === 'ready' ? 'Listo' : 'Entrega';
                  return (
                    <Link key={i} to={`/ordenes/${ev.o.id}`} className="block truncate text-[11px]" onClick={(e) => e.stopPropagation()}>
                      <Badge className={m.color}>{tag}</Badge> {ev.o.number}
                    </Link>
                  );
                })}
                {events.length > 3 && view !== 'day' && <div className="text-[11px] text-slate-400">+{events.length - 3} más</div>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Clic en un día para marcarlo como laborado (si tiene permiso).</p>
    </div>
  );
}
