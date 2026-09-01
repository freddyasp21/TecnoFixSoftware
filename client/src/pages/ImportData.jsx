import { useMemo, useRef, useState } from 'react';
import { api, parseImportFile, downloadImportTemplate } from '../api';
import { ErrorBox, PageHeader } from '../components/ui';
import { useAuth } from '../auth';

const HINTS = {
  clientes: 'Clientes',
  catalogo: 'Catálogo',
  trabajadores: 'Trabajadores',
  ordenes: 'Órdenes',
};

const ORDER_STATUS_OPTIONS = [
  ['recibido', 'Recibido'],
  ['diagnostico', 'En diagnóstico'],
  ['esperando_repuesto', 'Esperando repuesto'],
  ['reparacion', 'En reparación'],
  ['listo', 'Listo'],
  ['entregado', 'Entregado'],
  ['cancelado', 'Cancelado'],
];

function rowKey(i) {
  return `r-${i}-${Math.random().toString(36).slice(2, 8)}`;
}

function withKeys(datasets) {
  return (datasets || []).map((ds) => ({
    ...ds,
    rows: (ds.rows || []).map((row, i) => ({ ...row, _key: row._key || rowKey(i) })),
  }));
}

export default function ImportData() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Administrador';
  const fileRef = useRef(null);
  const [hint, setHint] = useState('');
  const [datasets, setDatasets] = useState([]);
  const [tab, setTab] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [errors, setErrors] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const current = datasets.find((d) => d.module === tab) || datasets[0];
  const specCols = useMemo(() => {
    if (!current) return [];
    if (current.module === 'clientes') {
      return [
        { key: 'name', header: 'Nombre' },
        { key: 'document', header: 'Cédula/RIF' },
        { key: 'phone', header: 'Teléfono' },
        { key: 'email', header: 'Correo' },
        { key: 'address', header: 'Dirección' },
        { key: 'notes', header: 'Notas' },
      ];
    }
    if (current.module === 'catalogo') {
      return [
        { key: 'code', header: 'Código' },
        { key: 'type', header: 'Tipo' },
        { key: 'name', header: 'Nombre' },
        { key: 'description', header: 'Descripción' },
        { key: 'price_usd', header: 'Precio USD' },
        { key: 'stock', header: 'Stock' },
        { key: 'min_stock', header: 'Mínimo' },
        { key: 'estimated_minutes', header: 'Minutos' },
        { key: 'active', header: 'Activo' },
      ];
    }
    if (current.module === 'trabajadores') {
      return [
        { key: 'full_name', header: 'Nombre' },
        { key: 'document', header: 'Cédula' },
        { key: 'phone', header: 'Teléfono' },
        { key: 'position', header: 'Cargo' },
        { key: 'share_weight', header: 'Peso nómina' },
        { key: 'active', header: 'Estado' },
        { key: 'notes', header: 'Notas' },
      ];
    }
    return [
      { key: 'number', header: 'Número' },
      { key: 'client_name', header: 'Cliente' },
      { key: 'document', header: 'Cédula/RIF' },
      { key: 'phone', header: 'Teléfono' },
      { key: 'status', header: 'Estado' },
      { key: 'device_brand', header: 'Marca' },
      { key: 'device_model', header: 'Modelo' },
      { key: 'serial_number', header: 'Serial' },
      { key: 'device_password', header: 'Contraseña' },
      { key: 'fault_description', header: 'Falla' },
      { key: 'service_name', header: 'Tipo de servicio' },
      { key: 'physical_notes', header: 'Observaciones' },
      { key: 'technician_name', header: 'Técnico' },
      { key: 'total', header: 'Total USD' },
      { key: 'received_at', header: 'Ingreso' },
      { key: 'delivered_at', header: 'Entrega' },
    ];
  }, [current]);

  function emptyFromSpec() {
    const row = { _key: rowKey(0) };
    specCols.forEach((c) => {
      row[c.key] = c.key === 'active' ? '1' : c.key === 'type' ? 'service' : c.key === 'status' ? 'recibido' : '';
    });
    return row;
  }

  function updateRow(key, field, value) {
    setDatasets((all) => all.map((ds) => {
      if (ds.module !== current.module) return ds;
      return { ...ds, rows: ds.rows.map((r) => (r._key === key ? { ...r, [field]: value } : r)) };
    }));
  }

  function removeRow(key) {
    setDatasets((all) => all.map((ds) => {
      if (ds.module !== current.module) return ds;
      return { ...ds, rows: ds.rows.filter((r) => r._key !== key) };
    }));
  }

  function addRow() {
    if (!current) return;
    setDatasets((all) => all.map((ds) => {
      if (ds.module !== current.module) return ds;
      return { ...ds, rows: [...ds.rows, emptyFromSpec()] };
    }));
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMsg('');
    setResult(null);
    try {
      const data = await parseImportFile(file, hint || undefined);
      const next = withKeys(data.datasets);
      setDatasets(next);
      setTab(next[0]?.module || '');
      setWarnings(data.warnings || []);
      setErrors(data.errors || []);
    } catch (err) {
      setDatasets([]);
      setWarnings([]);
      setErrors([]);
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!datasets.length) return;
    if (!confirm('¿Guardar estos datos en el taller? Clientes y trabajadores se actualizan si la cédula ya existe; el catálogo si el código ya existe; las órdenes si el número ya existe.')) return;
    setBusy(true);
    setMsg('');
    setResult(null);
    try {
      const payload = datasets.map((ds) => ({
        module: ds.module,
        rows: ds.rows.map(({ _key, ...row }) => row),
      }));
      const data = await api('/import/commit', { method: 'POST', body: { datasets: payload } });
      setResult(data.results || []);
      setErrors([]);
    } catch (err) {
      setMsg(err.message);
      if (err.message && Array.isArray(err.errors)) setErrors(err.errors);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="Importar"
        subtitle="Cargue un Excel (.xlsx) o JSON. Revise la tabla, edite o quite filas y luego guarde."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Leyendo…' : 'Elegir archivo'}
            </button>
            {datasets.length > 0 && (
              <button type="button" className="btn-primary" onClick={save} disabled={busy}>Guardar</button>
            )}
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xlsm,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onFile}
      />
      <ErrorBox error={msg} />

      <div className="card mb-6 space-y-4 p-5 text-sm text-slate-700">
        <h2 className="font-semibold text-ink-900">Cómo debe ir el documento</h2>
        <p>
          Primera fila = títulos, en este orden (de izquierda a derecha). Puede usar varias hojas en el mismo Excel
          si cada hoja se llama <b>Clientes</b>, <b>Catalogo</b>, <b>Trabajadores</b> o <b>Órdenes</b>. En JSON use esas mismas claves
          con una lista de objetos.
        </p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <b>Clientes</b> — Nombre*, Cédula/RIF, Teléfono, Correo, Dirección, Notas.
            Si la cédula ya existe, se actualiza el cliente; si no, se crea.
          </li>
          <li>
            <b>Catálogo</b> — Código*, Tipo* (<code>product</code> o <code>service</code>, también producto/servicio),
            Nombre*, Descripción, Precio USD, Stock, Mínimo, Minutos, Activo (1/0 o Sí/No).
            El código único actualiza el ítem existente.
          </li>
          <li>
            <b>Trabajadores</b> — Nombre*, Cédula, Teléfono, Cargo, Peso nómina, Estado, Notas.
            La cédula existente actualiza; si no hay cédula se crea uno nuevo.
          </li>
          <li>
            <b>Órdenes</b> — Número (si se deja vacío se asigna OT-0001…), Cliente*, Cédula/RIF, Teléfono,
            Estado (recibido, diagnóstico, esperando_repuesto, reparación, listo, entregado, cancelado),
            Marca, Modelo, Serial, Contraseña, Falla, Tipo de servicio (nombre o código del catálogo),
            Observaciones, Técnico (nombre de usuario), Total USD, Ingreso, Entrega.
            Si el número ya existe se actualiza; si no, se crea. El cliente se busca por cédula o nombre y se crea si no aparece.
            Sirve para cargar órdenes históricas; las nuevas del día a día siguen saliendo de cotización + cobro en caja.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          Los campos con * son obligatorios. No se importan cotizaciones ni caja: esos se generan en el taller.
          Si el archivo es una lista JSON sin claves, indique abajo el tipo de datos.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label>Tipo si el archivo no lo indica</label>
            <select className="max-w-xs" value={hint} onChange={(e) => setHint(e.target.value)}>
              <option value="">Detectar automáticamente</option>
              {Object.entries(HINTS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-ghost" onClick={() => downloadImportTemplate('clientes').catch((err) => setMsg(err.message))}>Plantilla clientes</button>
          <button type="button" className="btn-ghost" onClick={() => downloadImportTemplate('catalogo').catch((err) => setMsg(err.message))}>Plantilla catálogo</button>
          <button type="button" className="btn-ghost" onClick={() => downloadImportTemplate('trabajadores').catch((err) => setMsg(err.message))}>Plantilla trabajadores</button>
          <button type="button" className="btn-ghost" onClick={() => downloadImportTemplate('ordenes').catch((err) => setMsg(err.message))}>Plantilla órdenes</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}
      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errors.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}
      {result && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {result.map((r) => (
            <div key={r.module}>{r.label}: {r.inserted} nuevos, {r.updated} actualizados ({r.total} filas).</div>
          ))}
        </div>
      )}

      {datasets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Aún no hay datos cargados. Descargue una plantilla o suba su Excel / JSON.
        </div>
      ) : (
        <div className="card table-wrap">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {datasets.map((ds) => (
                <button
                  key={ds.module}
                  type="button"
                  className={tab === ds.module ? 'btn-dark' : 'btn-ghost'}
                  onClick={() => setTab(ds.module)}
                >
                  {ds.label} ({ds.rows.length})
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost" onClick={addRow}>Agregar fila</button>
          </div>
          {!current || current.rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No hay filas en esta hoja. Agregue una o elimine el archivo y vuelva a cargar.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  {specCols.map((c) => <th key={c.key}>{c.header}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {current.rows.map((row) => (
                  <tr key={row._key}>
                    {specCols.map((c) => (
                      <td key={c.key} className="min-w-[8rem] p-1">
                        {c.key === 'type' ? (
                          <select value={row.type || ''} onChange={(e) => updateRow(row._key, 'type', e.target.value)}>
                            <option value="service">servicio</option>
                            <option value="product">producto</option>
                          </select>
                        ) : c.key === 'active' ? (
                          <select value={String(row.active ?? '1')} onChange={(e) => updateRow(row._key, 'active', e.target.value)}>
                            <option value="1">Activo</option>
                            <option value="0">Inactivo</option>
                          </select>
                        ) : c.key === 'status' && current.module === 'ordenes' ? (
                          <select value={row.status || 'recibido'} onChange={(e) => updateRow(row._key, 'status', e.target.value)}>
                            {ORDER_STATUS_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={row[c.key] ?? ''}
                            onChange={(e) => updateRow(row._key, c.key, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                    <td className="text-right">
                      <button type="button" className="btn-ghost !text-rose-600" onClick={() => removeRow(row._key)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
