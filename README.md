# Tecno Fix — Software para talleres

Aplicación híbrida de gestión para talleres (local, sin nube obligatoria):

- **Backend local:** Node.js + Express en `127.0.0.1:3847`
- **Base de datos:** SQLite nativo de Node.js (`node:sqlite`, WAL, transacciones ACID) en `data/tecnofix.db`
- **Frontend:** PWA con Vite + React + Tailwind CSS
- **Escritorio Windows:** contenedor **Electron 36+** (Node 22 embebido con `node:sqlite`) y auto-update vía **GitHub Releases**

Los precios maestros están en **USD**. BCV, Dólar € y USDT se registran en **Bolívares** y se usan para mostrar equivalentes y para cobros en Bs.

---

## 1. Estructura del proyecto

```
app Taller/
├── client/                 # PWA (Vite + React + Tailwind)
│   ├── public/logo.svg
│   └── src/
│       ├── api.js          # Cliente HTTP + JWT
│       ├── auth.jsx        # Sesión y permisos (RBAC)
│       ├── components/     # Layout, modales, ítems de catálogo
│       └── pages/          # Módulos de la interfaz
├── server/                 # API Express + SQLite
│   ├── db/schema.sql       # Modelo de datos
│   ├── db/database.js      # Conexión WAL (node:sqlite, Node 22 / Electron 36+)
│   ├── db/migrate.js       # Permisos y columnas en bases ya creadas
│   ├── db/seed.js          # Admin, roles y ajustes (sin datos de negocio)
│   ├── middleware/auth.js  # JWT + requirePermission()
│   ├── routes/             # Un archivo por módulo
│   ├── services/           # Inventario, alertas
│   └── utils/payroll.js    # Nómina quincenal (1-15 / 16-último)
├── electron/               # Contenedor nativo + actualizador
│   ├── main.js
│   ├── preload.js
│   └── updater.js          # electron-updater → GitHub Releases
├── data/                   # Base SQLite (se crea al arrancar)
├── package.json            # Backend + Electron + electron-builder
└── README.md
```

---

## 2. Requisitos

- **Node.js 22+** en desarrollo (`fetch` y `node:sqlite` van incluidos)
- Windows 10/11 x64
- El `.exe` de escritorio lleva **Electron 36.9.5** (Node 22.19). No use Electron 34: embebe Node 20 y al abrir falla con `No such built-in module: node:sqlite`. No hace falta compilar addons nativos de SQLite.

---

## 3. Arranque en desarrollo (PWA + API local)

```bash
cd "app Taller"
npm install
npm run dev
```

- Interfaz: http://127.0.0.1:5173  
- API: http://127.0.0.1:3847/api/health  

**Usuario inicial**

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin` | `Admin123!` | Administrador (acceso total) |

Cambie esa clave en **Ajustes** o desde **Usuarios**. El catálogo, clientes, caja y órdenes arrancan vacíos: el taller carga su propia información.

Escritorio en caliente (Vite + Electron):

```bash
npm run dev:electron
```

Solo API (sirve también `client/dist` si ya compiló):

```bash
npm start
```

---

## 4. Roles y permisos (RBAC)

| Rol | Alcance típico |
|-----|----------------|
| **Administrador** | Todo, incluida configuración de permisos |
| **Técnico** | Órdenes, catálogo, calendario, clientes, alertas. Sin caja ni borrar órdenes |
| **Cajero** | Caja, cotizaciones, clientes, finanzas, trabajadores, reportes. **Sin** editar inventario ni eliminar órdenes |

Los permisos se editan en **Usuarios → Permisos por rol**. Las contraseñas se guardan con **bcrypt**. El JWT dura 14 horas (jornada de taller).

---

## 5. Módulos

1. **Login / usuarios / RBAC** — altas, activar/desactivar, reset de clave  
2. **Alertas** — tablero en vivo (sin copiar datos): stock bajo, nómina pendiente de la quincena, piezas de órdenes en «esperando repuesto» y órdenes listas para entregar  
3. **Tasas** — BCV, Dólar € y USDT (Bs), snapshot en cada documento  
4. **Catálogo** — productos (stock) y servicios; autocompletado en cotizaciones/caja  
5. **Cotizaciones** — IVA opcional. Si el cliente aprueba, pasa a Caja; la orden se crea **solo al cobrar**  
6. **Órdenes** — correlativo `OT-0001`, estados, técnico, comprobante de impresión  
7. **Calendario** — vistas día / semana / mes, días laborados del taller  
8. **Inventario** — kardex; salida automática al usar un producto en orden o venta  
9. **Clientes** — ficha + historial de equipos y servicios  
10. **Trabajadores** — plantilla, días laborados y salario quincenal (1-15 / 16-último) a partir del **40%** de los ingresos de caja; el pago se hace **desde Caja**  
11. **Caja** — apertura/cierre, IVA 16% (switch), **solo 4 métodos de pago:** USD efectivo, Bs efectivo, pago móvil Bs, USDT Binance  
12. **Gestión financiera** — cada ingreso se reparte en sobres: **40%** trabajadores, **30%** insumos/piezas/herramientas, **20%** ahorro e inversión, **10%** utilidad/operación; los egresos de caja (incluida la nómina) descuentan del sobre correspondiente  
13. **Reportes** — rango de fechas + botones **Exportar Excel (.xlsx)**  
14. **Ajustes** — datos del taller, IVA, botón **Buscar actualizaciones**

---

## 6. Empaquetar como ejecutable de Windows

1. El repositorio de actualizaciones ya está configurado:

```json
"publish": {
  "provider": "github",
  "owner": "freddyasp21",
  "repo": "TecnoFixSoftware"
}
```

   El mismo owner/repo se configura en **Ajustes** de la app.

2. Compile instalador NSIS (acceso directo en escritorio y menú inicio):

```bash
npm install
npm run dist
```

El instalador queda en `release/TecnoFix-Setup-1.0.0.exe`.

Si ya tenía una instalación hecha con Electron 34, desinstálela o instale encima con este setup nuevo. Los datos del taller **no se pierden**: la base vive en `%APPDATA%\tecno-fix\data\`, no junto al `.exe`.

En el PC del taller, la base de datos se guarda en la carpeta de usuario de Electron (`userData/data/tecnofix.db`) para que Windows permita escritura y las actualizaciones no borren los datos.

---

## 7. Publicación automática y actualizaciones (GitHub Releases)

### Primera vez

1. El código vive en https://github.com/freddyasp21/TecnoFixSoftware
2. Cree un **Personal Access Token** (classic) con permiso `repo` si publica desde su PC, o use `GITHUB_TOKEN` en Actions.
3. Suba un tag de versión **igual** a `package.json` (`version`):

```bash
npm version patch
git push --follow-tags
```

El workflow `.github/workflows/release.yml` genera el instalador en un runner Windows y adjunta:

- `TecnoFix-Setup-x.y.z.exe`
- `latest.yml` (lo necesita `electron-updater`)

### Desde el taller

En **Ajustes → Buscar actualizaciones**:

- **Electron:** consulta GitHub, descarga el delta/instalador y ofrece **Reiniciar e instalar**.
- **PWA / navegador:** muestra si hay release nuevo y enlaces de descarga.

Requisitos para que el botón funcione:

- El tag debe ser `v1.0.1` (o `1.0.1`) y **mayor** que la versión instalada.
- El release debe incluir `latest.yml` (electron-builder lo sube con `--publish always`).

Publicación manual desde su máquina:

```bash
set GH_TOKEN=ghp_xxxxxxxx
npm run dist:publish
```

---

## 8. Instalar como PWA (sin Electron)

1. `npm run build:client && npm start`
2. Abra http://127.0.0.1:3847 en Chrome/Edge
3. Menú → **Instalar Tecno Fix** (acceso directo; el API debe seguir corriendo, por ejemplo con Tarea programada de Windows que ejecute `npm start`)

---

## 9. Copia de seguridad

Cierre la app y copie `tecnofix.db` (y si existen `tecnofix.db-wal` / `tecnofix.db-shm`):

- Desarrollo: carpeta `data/`
- Electron: `%APPDATA%\tecno-fix\data\` (el nombre exacto depende de `appId`)

---

## 10. API local (resumen)

Todas las rutas JSON van bajo `/api` y, salvo `/auth/login` y `/health`, requieren `Authorization: Bearer <token>`.

| Prefijo | Función |
|---------|---------|
| `/api/auth` | Login, perfil, cambio de clave |
| `/api/users` | Usuarios, roles, permisos, reset |
| `/api/rates` | Tasas BCV / Euro / USDT |
| `/api/catalog` | Productos y servicios |
| `/api/quotes` | Cotizaciones + `POST /:id/convert` |
| `/api/orders` | Órdenes de trabajo |
| `/api/calendar` | Calendario y días laborados |
| `/api/inventory` | Stock y kardex |
| `/api/clients` | Clientes e historial |
| `/api/workers` | Plantilla, asistencia y pago de nómina quincenal |
| `/api/cash` | Caja, movimientos, venta directa, cobro de cotización |
| `/api/finance` | Sobres financieros y clasificación de egresos |
| `/api/alerts` | Alertas agregadas (`GET /` y `GET /summary`) |
| `/api/reports` | Analítica |
| `/api/export/:modulo` | Excel: `clientes`, `catalogo`, `inventario`, `cotizaciones`, `ordenes`, `caja`, `finanzas`, `trabajadores`, `nomina`, `usuarios` |
| `/api/settings` | Ajustes, IVA, `GET /updates` |

---

Tecno Fix está pensado para correr **en la PC del taller**, con datos propios, IVA conmutable, cuadre de caja por las cuatro formas de cobro, nómina quincenal y alertas ligadas a los módulos de origen.
