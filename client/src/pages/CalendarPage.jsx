import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, statusMeta, localDate } from '../api';
import { Badge, ErrorBox, Field, Modal, PageHeader, useAsync } from '../components/ui';
import { useAuth } from '../auth';

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d) {
  return localDate(d);
}

function parseDay(iso) {
  const [y, m, day] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, day);
}

export default function CalendarPage() {
  const { can } = useAuth();
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [startForm, setStartForm] = useState(null);
  const [closeForm, setCloseForm] = useState(null);
  const [msg, setMsg] = useState('');

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

  const ops = data?.ops || {};
  const closedSet = new Set(ops.closed_days || []);
  const todayKey = ops.current_date || ops.clock_date || localDate();

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

  function goToOpsToday() {
    setCursor(parseDay(todayKey));
  }

  function operable(key) {
    if (!ops.start_date || !ops.current_date) return false;
    return key >= ops.start_date && key <= ops.current_date;
  }

  async function toggleWorked(day) {
    if (!can('calendar.manage') || !operable(day)) return;
    setMsg('');
    try {
      const worked = !workSet.has(day);
      await api('/calendar/work-days', { method: 'POST', body: { day, worked } });
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function saveStart(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/ops/start', { method: 'PUT', body: { start_date: startForm } });
      setStartForm(null);
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function doClose(e) {
    e.preventDefault();
    setMsg('');
    try {
      await api('/ops/close', { method: 'POST', body: { notes: closeForm?.notes || '' } });
      setCloseForm(null);
      const next = await api('/ops');
      if (next.current_date) setCursor(parseDay(next.current_date));
      reload();
    } catch (err) { setMsg(err.message); }
  }

  const s = data?.stats || {};
  const canOps = can('ops.manage');

  return (
    <div>
      <PageHeader
        title="Calendario de trabajo"
        subtitle="El día actual es el operativo. Solo admin o gerente cierran el día para pasar al siguiente."
        actions={
          <div className="flex flex-wrap gap-2">
            {['day', 'week', 'month'].map((v) => (
              <button key={v} className={view === v ? 'btn-dark' : 'btn-ghost'} onClick={() => setView(v)}>
                {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
            <button className="btn-ghost" onClick={() => shift(-1)}>←</button>
            <button className="btn-ghost" onClick={goToOpsToday}>Hoy</button>
            <button className="btn-ghost" onClick={() => shift(1)}>→</button>
          </div>
        }
      />
      <ErrorBox error={error || msg} />

      <div className={`mb-6 rounded-2xl border-2 p-5 ${
        ops.configured ? 'border-sky-300 bg-sky-50' : 'border-amber-300 bg-amber-50'
      }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={`font-semibold ${ops.configured ? 'text-sky-950' : 'text-amber-950'}`}>
              {ops.configured ? `Día operativo ${ops.current_date}` : 'Fecha de inicio pendiente'}
            </h2>
            <p className={`mt-1 text-sm ${ops.configured ? 'text-sky-900' : 'text-amber-900'}`}>
              {ops.configured
                ? `Los cálculos (órdenes, caja, días laborados, finanzas) cuentan desde ${ops.start_date}. Cerrar el día lo deja registrado y abre el siguiente.`
                : 'Admin o gerente debe fijar desde qué fecha el software toma órdenes, caja, asistencia y cálculos.'}
            </p>
          </div>
          {canOps && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost"
                onClick={() => { setStartForm(ops.start_date || localDate()); setMsg(''); }}
              >
                {ops.configured ? 'Cambiar inicio' : 'Fijar fecha de inicio'}
              </button>
              {ops.configured && (
                <button
                  className="btn-amber"
                  onClick={() => { setCloseForm({ notes: '' }); setMsg(''); }}
                >
                  Cerrar el día
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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
          const isCurrent = key === todayKey;
          const closed = closedSet.has(key);
          const beforeStart = ops.start_date && key < ops.start_date;
          const afterCurrent = ops.current_date && key > ops.current_date;
          const muted = (!inMonth && view === 'month') || beforeStart || afterCurrent;
          let cell = 'border-slate-200 bg-white';
          if (worked && !isCurrent) cell = 'border-emerald-300 bg-emerald-50/60';
          if (closed && !isCurrent) cell = 'border-slate-300 bg-slate-100';
          if (isCurrent) cell = 'border-sky-500 bg-sky-100 ring-2 ring-sky-400';
          return (
            <button
              type="button"
              key={key}
              onClick={() => toggleWorked(key)}
              disabled={!can('calendar.manage') || !operable(key)}
              className={`min-h-[110px] rounded-xl border p-2 text-left ${cell} ${muted ? 'opacity-40' : ''} disabled:cursor-default`}
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={`font-semibold ${isCurrent ? 'text-sky-800' : ''}`}>{d.getDate()}</span>
                {isCurrent && <span className="font-bold text-sky-700">Hoy</span>}
                {!isCurrent && closed && <span className="text-slate-500">Cerrado</span>}
                {!isCurrent && !closed && worked && <span className="text-emerald-700">Laborado</span>}
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
      <p className="mt-3 text-xs text-slate-500">
        El día en azul es el operativo actual. Clic para marcarlo como laborado (si tiene permiso y está entre el inicio y hoy).
      </p>

      {startForm != null && (
        <Modal title={ops.configured ? 'Cambiar fecha de inicio' : 'Fecha de inicio de operaciones'} onClose={() => setStartForm(null)}>
          <form className="space-y-3" onSubmit={saveStart}>
            <p className="text-sm text-slate-600">
              A partir de esta fecha el software cuenta órdenes, caja, días laborados y finanzas.
              {ops.configured ? ' No puede ser posterior al día operativo actual.' : ' Si es anterior a hoy, el día actual sigue siendo hoy y los datos viejos no entran en los cálculos.'}
            </p>
            <Field label="Fecha de inicio">
              <input type="date" value={startForm} onChange={(e) => setStartForm(e.target.value)} required />
            </Field>
            <ErrorBox error={msg} />
            <button className="btn-primary w-full">Guardar fecha de inicio</button>
          </form>
        </Modal>
      )}

      {closeForm && (
        <Modal title={`Cerrar el día ${ops.current_date}`} onClose={() => setCloseForm(null)}>
          <form className="space-y-3" onSubmit={doClose}>
            <p className="text-sm text-slate-600">
              Solo admin o gerente. Debe estar la caja cerrada. Al confirmar se abre el día siguiente como día operativo.
            </p>
            {ops.cash_open && (
              <ErrorBox error="Cierre la caja antes de cerrar el día." />
            )}
            <Field label="Notas (opcional)">
              <textarea rows={2} value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} />
            </Field>
            <ErrorBox error={msg} />
            <button className="btn-amber w-full" disabled={!!ops.cash_open}>Cerrar día y comenzar el siguiente</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
