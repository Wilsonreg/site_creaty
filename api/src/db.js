import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  // Evita que un string se interprete como numero/fecha al insertar.
  decimalNumbers: false,
});

/** Verifica que la base responde. Se usa en /api/health. */
export async function ping() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export async function insertMessage(m) {
  const [result] = await pool.execute(
    `INSERT INTO contact_messages (nombre, email, telefono, interes, mensaje, origen, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.nombre, m.email, m.telefono, m.interes, m.mensaje, m.origen, m.ip, m.userAgent],
  );
  return result.insertId;
}

export async function listMessages({ limit = 50, offset = 0, estado = null }) {
  const params = [];
  let where = '';
  if (estado) {
    where = 'WHERE estado = ?';
    params.push(estado);
  }
  params.push(limit, offset);
  const [rows] = await pool.query(
    `SELECT id, nombre, email, telefono, interes, mensaje, estado, origen, ip, creado_en, respondido_en
     FROM contact_messages ${where}
     ORDER BY creado_en DESC, id DESC
     LIMIT ? OFFSET ?`,
    params,
  );
  return rows;
}

export async function getMessageById(id) {
  const [rows] = await pool.execute(
    `SELECT id, nombre, email, telefono, interes, mensaje, estado, origen, ip, user_agent, creado_en, respondido_en
     FROM contact_messages WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function countByEstado() {
  const [rows] = await pool.query(
    'SELECT estado, COUNT(*) AS total FROM contact_messages GROUP BY estado',
  );
  return Object.fromEntries(rows.map((r) => [r.estado, Number(r.total)]));
}

export async function updateEstado(id, estado) {
  const [result] = await pool.execute(
    `UPDATE contact_messages
     SET estado = ?,
         respondido_en = CASE WHEN ? IN ('respondido','archivado') THEN NOW() ELSE NULL END
     WHERE id = ?`,
    [estado, estado, id],
  );
  return result.affectedRows;
}

/** Registra un intento y cuenta quantos hay en la ventana actual. */
export async function recordAttempt(ip, ruta, windowMs) {
  // MySQL no acepta placeholder dentro de INTERVAL con prepared statements,
  // asi que se inyecta un entero ya validado en config (nunca viene del usuario).
  const secs = Math.max(1, Math.ceil(windowMs / 1000));
  await pool.execute('INSERT INTO rate_events (ip, ruta) VALUES (?, ?)', [ip, ruta]);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM rate_events
     WHERE ip = ? AND ruta = ? AND creado_en > (NOW() - INTERVAL ${secs} SECOND)`,
    [ip, ruta],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Limpieza periodica: la tabla rate_events no debe crecer sin limite. */
export async function purgeRateEvents(windowMs) {
  const secs = Math.max(1, Math.ceil((windowMs * 4) / 1000));
  const [result] = await pool.query(
    `DELETE FROM rate_events WHERE creado_en < (NOW() - INTERVAL ${secs} SECOND)`,
  );
  return result.affectedRows;
}
