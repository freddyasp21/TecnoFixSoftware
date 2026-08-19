# Tecno Fix — Software para talleres

Aplicación híbrida de gestión para talleres (local, sin nube obligatoria):

- **Backend local:** Node.js + Express en `127.0.0.1:3847`
- **Base de datos:** SQLite nativo de Node.js (`node:sqlite`, WAL, transacciones ACID) en `data/tecnofix.db`
- **Frontend:** PWA con Vite + React + Tailwind CSS
- **Escritorio Windows:** contenedor Electron con acceso directo y auto-update vía **GitHub Releases**

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
│   ├── db/database.js      # Conexión WAL
│   ├── db/seed.js          # Admin, roles y catálogo inicial
│   ├── middleware/auth.js  # JWT + requirePermission()
│   ├── routes/             # Un archivo por módulo
│   └── services/inventory.js
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

- **Node.js 20+** (se recomienda 22 u 24; incluye `fetch` y `node:sqlite`)
- Windows 10/11 x64
- Para el instalador Electron: el propio `electron-builder` (no hace falta compilar addons nativos de SQLite)

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

Cambie esa clave en **Ajustes** o desde **Usuarios**.

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
| **Técnico** | Órdenes, catálogo, calendario, clientes. Sin caja ni borrar órdenes |
| **Cajero** | Caja, cotizaciones, clientes, reportes. **Sin** editar inventario ni eliminar órdenes |

Los permisos se editan en **Usuarios → Permisos por rol**. Las contraseñas se guardan con **bcrypt**. El JWT dura 14 horas (jornada de taller).

---

## 5. Módulos

1. **Login / usuarios / RBAC** — altas, activar/desactivar, reset de clave  
2. **Tasas** — BCV, Dólar € y USDT (Bs), snapshot en cada documento  
3. **Catálogo** — productos (stock) y servicios; autocompletado en cotizaciones/caja  
4. **Cotizaciones** — IVA opcional, conversión a orden en un clic  
5. **Órdenes** — correlativo `OT-0001`, estados, técnico, comprobante de impresión  
6. **Calendario** — vistas día / semana / mes, días laborados  
7. **Inventario** — kardex; salida automática al usar un producto en orden o venta  
8. **Clientes** — ficha + historial de equipos y servicios  
9. **Caja** — apertura/cierre, IVA 16% (switch), **solo 4 métodos de pago:** USD efectivo, Bs efectivo, pago móvil Bs, USDT Binance  
10. **Reportes** — rango de fechas + botones **Exportar Excel (.xlsx)**  
11. **Ajustes** — datos del taller, IVA, botón **Buscar actualizaciones**

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

En el PC del taller, la base de datos se guarda en la carpeta de usuario de Electron (`userData/data/tecnofix.db`), no junto al `.exe`, para que Windows permita escritura y las actualizaciones no borren los datos.

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
| `/api/cash` | Caja, movimientos, venta directa |
| `/api/reports` | Analítica |
| `/api/export/:modulo` | Excel: `clientes`, `catalogo`, `inventario`, `cotizaciones`, `ordenes`, `caja`, `usuarios` |
| `/api/settings` | Ajustes, IVA, `GET /updates` |

---

Tecno Fix está pensado para correr **en la PC del taller**, con datos propios, IVA conmutable y cuadre de caja discriminado por las cuatro formas de cobro exigidas.
