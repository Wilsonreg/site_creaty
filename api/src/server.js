import express from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { config } from './config.js';
import * as db from './db.js';
import { validateContact, INTERESES } from './validate.js';
import { sendContactNotification, smtpPing } from './mail.js';
import { verifyToken as verifyRecaptcha } from './recaptcha.js';

const app = express();
const ESTADOS = new Set(['nuevo', 'leido', 'respondido', 'archivado']);

// Detras de Cloudflare Tunnel, la IP real llega en CF-Connecting-IP.
// 'trust proxy' hace que req.ip use esa cabecera en vez de 127.0.0.1.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false, // la API no sirve HTML
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Limite de tamano: 16 KB es suficiente para un formulario y corta body bombs.
app.use(express.json({ limit: '16kb', strict: true }));

// --- CORS restringido a los origenes autorizados -------------------------
// Ademas de las cabeceras CORS, RECHAZA las peticiones con un Origin no
// autorizado. CORS por si solo no es control de acceso: el navegador bloquea la
// lectura de la respuesta, pero la peticion ya llego al servidor y el bot
// guardaria el mensaje. Sin cabecera Origin (curl, scripts) se permite.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originPermitido = !origin || config.allowedOrigins.includes(origin);

  if (origin && originPermitido) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.set('Access-Control-Max-Age', '86400');
  }

  if (!originPermitido) {
    console.log(`[cors] bloqueado: ${req.method} ${req.originalUrl} desde ${origin}`);
    return res.status(403).json({ ok: false, error: 'origen no permitido' });
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/** IP real del visitante, priorizando la cabecera que inyecta Cloudflare. */
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  const ip = (Array.isArray(cf) ? cf[0] : cf) || req.ip || '0.0.0.0';
  return String(ip).slice(0, 45);
}

/** Comparacion en tiempo constante para el token de administracion. */
function tokenMatches(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization ?? '';
  const sent = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!config.adminToken || !tokenMatches(sent, config.adminToken)) {
    return res.status(401).json({ ok: false, error: 'no autorizado' });
  }
  next();
}

// --- Health ---------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    const dbOk = await db.ping();
    const smtp = await smtpPing();
    const status = dbOk && smtp.ok ? 200 : 503;
    res.status(status).json({
      ok: dbOk && smtp.ok,
      db: dbOk ? 'conectada' : 'sin respuesta',
      smtp: smtp.ok ? 'ok' : `error: ${smtp.reason}`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[health]', err.message);
    res.status(503).json({ ok: false, db: 'error' });
  }
});

// --- Recibir mensaje ------------------------------------------------------
app.post('/api/contact', async (req, res) => {
  const ip = clientIp(req);

  // Honeypot: si el campo oculto viene relleno, es un bot. Respondemos 200
  // para no darle pistas, pero no guardamos nada.
  if (String(req.body?.[config.honeypotField] ?? '') !== '') {
    console.log(`[contact] honeypot activado desde ${ip}`);
    return res.status(200).json({ ok: true, id: null });
  }

  // Rate limit por IP, respaldado en MySQL (sirve con varias instancias).
  try {
    const total = await db.recordAttempt(ip, 'contact', config.rateLimit.windowMs);
    if (total > config.rateLimit.max) {
      const retryMin = Math.ceil(config.rateLimit.windowMs / 60000);
      res.set('Retry-After', String(config.rateLimit.windowMs / 1000));
      return res.status(429).json({
        ok: false,
        error: `demasiados intentos, reintenta en ~${retryMin} min`,
      });
    }
  } catch (err) {
    // Si el rate limit falla, no dejamos pasar la peticion a ciegas.
    console.error('[rate-limit]', err.message);
    return res.status(503).json({ ok: false, error: 'servicio no disponible' });
  }

  // reCAPTCHA v3: Google confirma que el envio viene de una interaccion humana.
  // Verificamos antes de validar campos, asi un fallo de captcha no gasta
  // mensajes de error de los inputs. Fail-open si Google no responde.
  const captcha = await verifyRecaptcha(
    String(req.body?.captchaToken ?? ''),
    ip,
    'contact',
  );
  if (!captcha.ok) {
    const codes = captcha.errors ?? [];
    console.warn(`[contact] captcha rechazado de ${ip}: ${codes.join(',')} (score=${captcha.score ?? '?'})`);
    return res.status(422).json({
      ok: false,
      error: 'captcha inválido, vuelve a verificarlo',
      errors: { captcha: 'Verificación de seguridad falló. Recarga e inténtalo de nuevo.' },
    });
  }

  const { ok, data, errors } = validateContact(req.body);
  if (!ok) {
    return res.status(422).json({ ok: false, error: 'datos inválidos', errors });
  }

  try {
    const id = await db.insertMessage({
      ...data,
      // Guardamos el Origin (el sitio que hizo el envio), no el Host: el Host
      // siempre sera la direccion de la propia API y no aporta informacion.
      origen: String(req.headers.origin ?? req.headers.referer ?? '')
        .slice(0, 40) || null,
      ip,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 255) || null,
    });
    console.log(`[contact] #${id} de ${ip} · ${data.interes}`);

    // Notificacion por correo: fire-and-forget. Si Gmail falla, el POST ya
    // devolvio 201 al cliente y el mensaje quedo guardado en MySQL. Loggeamos
    // el error para detectar problemas sin impactar al visitante.
    const appOrigin = `${req.protocol}://${req.get('host') ?? ''}`;
    sendContactNotification(
      { id, ...data, origen: String(req.headers.origin ?? req.headers.referer ?? '').slice(0, 40) || null, ip },
      appOrigin,
    )
      .then((info) => {
        console.log(`[contact] mail #${id} enviado (messageId=${info?.messageId ?? '?'})`);
      })
      .catch((err) => {
        console.error(`[contact] mail #${id} fallo: ${err.message}`);
      });

    return res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('[contact]', err.message);
    return res.status(500).json({ ok: false, error: 'no se pudo guardar' });
  }
});

// --- Consultar mensajes (requiere token) ---------------------------------
app.get('/api/contact', requireAdmin, async (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit ?? '50', 10) || 50, 200);
  const offset = Math.max(Number.parseInt(req.query.offset ?? '0', 10) || 0, 0);
  const estado = req.query.estado ? String(req.query.estado) : null;
  if (estado && !ESTADOS.has(estado)) {
    return res.status(400).json({ ok: false, error: 'estado inválido' });
  }
  try {
    const [mensajes, resumen] = await Promise.all([
      db.listMessages({ limit, offset, estado }),
      db.countByEstado(),
    ]);
    return res.json({ ok: true, total: mensajes.length, resumen, mensajes });
  } catch (err) {
    console.error('[contact:list]', err.message);
    return res.status(500).json({ ok: false, error: 'no se pudo leer' });
  }
});

// --- Cambiar estado (requiere token) -------------------------------------
app.patch('/api/contact/:id/estado', requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const estado = String(req.body?.estado ?? '');
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, error: 'id inválido' });
  }
  if (!ESTADOS.has(estado)) {
    return res.status(400).json({ ok: false, error: 'estado inválido' });
  }
  try {
    const affected = await db.updateEstado(id, estado);
    if (!affected) return res.status(404).json({ ok: false, error: 'no encontrado' });
    return res.json({ ok: true, id, estado });
  } catch (err) {
    console.error('[contact:patch]', err.message);
    return res.status(500).json({ ok: false, error: 'no se pudo actualizar' });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: 'ruta no encontrada' }));

// eslint-disable-next-line no-unused-vars -- Express identifica el handler de error por aridad 4
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'payload demasiado grande' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'json inválido' });
  }
  console.error('[error]', err?.message);
  return res.status(500).json({ ok: false, error: 'error interno' });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[creaty-api] escuchando en http://${config.host}:${config.port}`);
  console.log(`[creaty-api] CORS permitido para: ${config.allowedOrigins.join(', ')}`);
  console.log(`[creaty-api] rate limit: ${config.rateLimit.max} envios / ${config.rateLimit.windowMs / 60000} min`);
});

// Limpieza periodica de rate_events.
const purge = setInterval(() => {
  db.purgeRateEvents(config.rateLimit.windowMs)
    .then((n) => n && console.log(`[purge] ${n} eventos de rate limit eliminados`))
    .catch((e) => console.error('[purge]', e.message));
}, 60 * 60 * 1000);
purge.unref();

async function shutdown(signal) {
  console.log(`[creaty-api] ${signal}, cerrando…`);
  clearInterval(purge);
  server.close(async () => {
    await db.pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, INTERESES };
