import 'dotenv/config';

const required = ['DB_PASSWORD'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] Faltan variables de entorno: ${missing.join(', ')}`);
  process.exit(1);
}

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  port: int(process.env.PORT, 8787),
  host: process.env.HOST ?? '127.0.0.1',

  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: int(process.env.DB_PORT, 3308),
    user: process.env.DB_USER ?? 'creaty_api',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'creaty_site',
    connectionLimit: int(process.env.DB_POOL, 5),
  },

  // Origenes autorizados a llamar la API (CORS).
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'https://preview.creaty.fun,https://creaty.fun')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Token para consultar/gestionar los mensajes recibidos.
  adminToken: process.env.ADMIN_TOKEN ?? '',

  rateLimit: {
    windowMs: int(process.env.RATE_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_MAX, 5),
  },

  // Honeypot: si viene relleno, es un bot.
  honeypotField: 'website',
};
