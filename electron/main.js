/**
 * Proceso principal de Electron.
 * 1) Arranca el backend Express en 127.0.0.1
 * 2) Abre una ventana nativa contra la PWA
 * 3) Delega actualizaciones a GitHub Releases (electron-updater)
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { startServer } = require('../server');
const { setupAutoUpdater } = require('./updater');

const isDev = process.argv.includes('--dev') || process.env.TECNOFIX_DEV === '1';
const PORT = Number(process.env.TECNOFIX_PORT || 3847);

process.env.TECNOFIX_USER_DATA = app.getPath('userData');

let mainWindow;
let serverHandle;

async function createWindow() {
  const started = await startServer(PORT, '127.0.0.1');
  serverHandle = started;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Tecno Fix - Software para talleres',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const url = isDev ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${started.port}`;
  await mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });

  if (!isDev) setupAutoUpdater(mainWindow);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverHandle?.server) serverHandle.server.close();
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:is-electron', () => true);
