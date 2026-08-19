const express = require('express');
const { getDb } = require('../db/database');
const { authRequired, requirePermission } = require('../middleware/auth');
const { getSetting, setSetting } = require('../utils/helpers');

const router = express.Router();
router.use(authRequired);

const PUBLIC_KEYS = [
  'shop_name', 'shop_subtitle', 'shop_phone', 'shop_address', 'shop_rif',
  'iva_enabled', 'iva_rate', 'github_owner', 'github_repo', 'app_version',
];

router.get('/', (_req, res) => {
  const db = getDb();
  const map = {};
  for (const k of PUBLIC_KEYS) map[k] = getSetting(db, k, '');
  map.app_version = require('../../package.json').version;
  res.json(map);
});

router.put('/', requirePermission('settings.manage'), (req, res) => {
  const body = req.body || {};
  const db = getDb();
  for (const k of PUBLIC_KEYS) {
    if (k === 'app_version') continue;
    if (body[k] != null) setSetting(db, k, body[k]);
  }
  res.json({ ok: true });
});

/**
 * Consulta GitHub Releases (latest) y compara con la versión instalada.
 * Electron usa además electron-updater; este endpoint sirve a la PWA y al panel.
 */
router.get('/updates', requirePermission('settings.manage'), async (req, res) => {
  const db = getDb();
  const owner = getSetting(db, 'github_owner');
  const repo = getSetting(db, 'github_repo');
  const current = require('../../package.json').version;
  if (!owner || owner === 'TU_USUARIO_GITHUB') {
    return res.json({
      current, latest: current, available: false,
      message: 'Configure el repositorio de GitHub (owner/repo) para buscar actualizaciones.',
    });
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const gh = await fetch(url, {
      headers: { 'User-Agent': 'TecnoFix', Accept: 'application/vnd.github+json' },
    });
    if (gh.status === 404) {
      return res.json({ current, latest: current, available: false, message: 'Aún no hay releases publicados.' });
    }
    if (!gh.ok) {
      return res.status(502).json({ error: 'No se pudo contactar GitHub Releases' });
    }
    const data = await gh.json();
    const latest = String(data.tag_name || '').replace(/^v/i, '');
    const available = compareVersions(latest, current) > 0;
    res.json({
      current,
      latest,
      available,
      name: data.name,
      notes: data.body,
      html_url: data.html_url,
      published_at: data.published_at,
      assets: (data.assets || []).map((a) => ({
        name: a.name, size: a.size, url: a.browser_download_url,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: 'Error de red al consultar GitHub: ' + err.message });
  }
});

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

module.exports = router;
