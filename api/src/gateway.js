/**
 * Gateway local: un solo origen publico para el sitio y su API.
 *
 *   /api/*  ->  API   (127.0.0.1:8787)
 *   /*      ->  Sitio (127.0.0.1:4321)
 *
 * Ventajas frente a usar dos hostnames:
 *   - el navegador ve un solo origen, asi que no hace falta CORS ni connect-src
 *   - el tunnel expone un unico hostname y el certificado TLS es uno solo
 *   - el CSP del sitio puede quedarse en 'self'
 */
import http from 'node:http';
import httpProxy from 'http-proxy';
import { config } from './config.js';

const PORT = Number.parseInt(process.env.GATEWAY_PORT ?? '8780', 10);
const HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';
const SITE_TARGET = process.env.SITE_TARGET ?? 'http://127.0.0.1:4321';
const API_TARGET = process.env.API_TARGET ?? `http://127.0.0.1:${config.port}`;

const proxy = httpProxy.createProxyServer({
  // No reescribimos Host: la API valida el Origin, no el Host.
  changeOrigin: false,
  xfwd: true,
});

proxy.on('error', (err, req, res) => {
  console.error(`[gateway] error hacia ${req.url}: ${err.message}`);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'servicio no disponible' }));
  }
});

const server = http.createServer((req, res) => {
  const target = req.url?.startsWith('/api') ? API_TARGET : SITE_TARGET;
  proxy.web(req, res, { target });
});

server.listen(PORT, HOST, () => {
  console.log(`[gateway] escuchando en http://${HOST}:${PORT}`);
  console.log(`[gateway]   /api/* -> ${API_TARGET}`);
  console.log(`[gateway]   /*     -> ${SITE_TARGET}`);
});

function shutdown(signal) {
  console.log(`[gateway] ${signal}, cerrando…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
