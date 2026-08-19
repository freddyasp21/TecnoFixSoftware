/**
 * Auto-actualización desatendida vía GitHub Releases (electron-updater).
 * Requiere que electron-builder.publish apunte al repo correcto y que
 * exista un release con el artefacto NSIS + latest.yml.
 */
const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

function send(win, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('update-status', payload);
}

function setupAutoUpdater(win) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send(win, { status: 'checking', message: 'Buscando actualizaciones…' }));
  autoUpdater.on('update-available', (info) => send(win, {
    status: 'available', version: info.version, message: `Nueva versión ${info.version} disponible`,
  }));
  autoUpdater.on('update-not-available', () => send(win, { status: 'none', message: 'Ya tiene la última versión' }));
  autoUpdater.on('download-progress', (p) => send(win, {
    status: 'downloading', percent: p.percent, message: `Descargando… ${p.percent.toFixed(0)}%`,
  }));
  autoUpdater.on('update-downloaded', (info) => send(win, {
    status: 'ready', version: info.version, message: 'Actualización lista. Se instalará al reiniciar.',
  }));
  autoUpdater.on('error', (err) => send(win, { status: 'error', message: err.message }));

  ipcMain.handle('updates:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('updates:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updates:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

module.exports = { setupAutoUpdater };
