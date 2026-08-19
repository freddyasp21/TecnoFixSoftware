/**
 * Punto de entrada del backend local.
 * En escritorio lo arranca Electron; en modo web se ejecuta con `npm start`.
 */
const { createApp } = require('./app');

const PORT = Number(process.env.TECNOFIX_PORT || 3847);
const HOST = process.env.TECNOFIX_HOST || '127.0.0.1';

function startServer(port = PORT, host = HOST) {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const msg = `Tecno Fix API en http://${host}:${port}\n`;
      try { require('fs').writeSync(1, msg); } catch { console.log(msg.trim()); }
      resolve({ server, port, host });
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startServer };
