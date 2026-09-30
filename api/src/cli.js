#!/usr/bin/env node
/**
 * CLI para consultar los mensajes del formulario de contacto.
 *
 *   node api/src/cli.js listar [--estado nuevo] [--limite 20]
 *   node api/src/cli.js ver <id>
 *   node api/src/cli.js marcar <id> <leido|respondido|archivado|nuevo>
 *   node api/src/cli.js resumen
 *   node api/src/cli.js borrar-pruebas     # solo filas de ejemplo
 */
import 'dotenv/config';
import { config } from './config.js';
import * as db from './db.js';

const [, , comando, ...resto] = process.argv;

const ETIQUETA = {
  nuevo: 'NUEVO',
  leido: 'LEÍDO',
  respondido: 'RESPONDIDO',
  archivado: 'ARCHIVADO',
};

const color = (c, s) => `[${c}m${s}[0m`;
const p = (s) => process.stdout.write(`${s}\n`);

function arg(nombre, porDefecto) {
  const i = resto.indexOf(`--${nombre}`);
  return i >= 0 ? resto[i + 1] : porDefecto;
}

async function listar() {
  const limite = Number.parseInt(arg('limite', '20'), 10);
  const offset = Number.parseInt(arg('offset', '0'), 10);
  const estado = arg('estado', null);
  const mensajes = await db.listMessages({ limit: limite, offset, estado });

  if (!mensajes.length) return p(color('33', 'No hay mensajes que coincidan.'));

  p(color('1', `\n  ${mensajes.length} mensaje(s)\n`));
  for (const m of mensajes) {
    const et = color(
      m.estado === 'nuevo' ? '93' : m.estado === 'respondido' ? '32' : '90',
      (ETIQUETA[m.estado] ?? m.estado).padEnd(11),
    );
    p(`  ${color('90', `#${m.id}`)} ${et} ${color('1', m.nombre)} ${color('90', `<${m.email}>`)}`);
    p(`             ${color('36', m.interes)}${m.telefono ? color('90', ` · ${m.telefono}`) : ''}`);
    p(`             ${color('90', m.mensaje.slice(0, 78).replace(/\s+/g, ' '))}`);
    p(`             ${color('90', m.creado_en)} · ip ${m.ip ?? '—'}${m.origen ? ` · ${m.origen}` : ''}\n`);
  }
}

async function ver(id) {
  const m = await db.getMessageById(Number(id));
  if (!m) return p(color('31', `No existe el mensaje #${id}.`));
  p('');
  p(`  ${color('1', m.nombre)}  ${color('90', `<${m.email}>`)}`);
  p(`  Telefono:   ${m.telefono ?? '—'}`);
  p(`  Interes:    ${color('36', m.interes)}`);
  p(`  Estado:     ${ETIQUETA[m.estado] ?? m.estado}`);
  p(`  Origen:     ${m.origen ?? '—'}`);
  p(`  IP:         ${m.ip ?? '—'}`);
  p(`  Recibido:   ${m.creado_en}`);
  p(`  Respondido: ${m.respondido_en ?? '—'}`);
  p(`\n  ${color('1', 'Mensaje:')}`);
  p(`  ${m.mensaje}\n`);
}

/** Normaliza "leído" -> "leido" para no obligar a teclear sin acentos. */
function sinAcentos(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function marcar(id, estado) {
  estado = sinAcentos(estado);
  if (!Object.keys(ETIQUETA).includes(estado)) {
    p(color('31', `Estado inválido. Usa: ${Object.keys(ETIQUETA).join(', ')}`));
    process.exitCode = 1;
    return;
  }
  const affected = await db.updateEstado(Number(id), estado);
  p(
    affected
      ? color('32', `Mensaje #${id} marcado como ${estado}.`)
      : color('31', `No existe el mensaje #${id}.`),
  );
}

async function resumen() {
  const r = await db.countByEstado();
  p('');
  p(color('1', '  Mensajes por estado\n'));
  for (const [k, v] of Object.entries(ETIQUETA)) {
    p(`  ${k.padEnd(12)} ${String(r[k] ?? 0).padStart(4)}  ${'█'.repeat(Math.min(r[k] ?? 0, 40))}`);
  }
  const total = Object.values(r).reduce((a, b) => a + b, 0);
  p(`\n  ${color('1', 'Total:')} ${total}\n`);
}

/** Borra solo lo que parece una fila de prueba, nunca mensajes reales. */
async function borrarPruebas() {
  const mensajes = await db.listMessages({ limit: 500 });
  const patron = /^(Prueba \d+|Carlos Ramirez|Laura Gomez|Bot Malicioso|Atacante Mal)$/i;
  const aBorrar = mensajes.filter((m) => patron.test(m.nombre.trim()));
  if (!aBorrar.length) return p('No hay filas de prueba que borrar.');

  // El usuario de la API no tiene DELETE a proposito: por eso este script usa
  // credenciales de administracion definidas en ADMIN_DB_*.
  const admin = await import('node:child_process');
  const list = aBorrar.map((m) => m.id).join(',');
  const cmd = [
    'mysql', '-h', config.db.host, '-P', String(config.db.port),
    '-u', process.env.ADMIN_DB_USER ?? 'root',
    `-p${process.env.ADMIN_DB_PASSWORD ?? ''}`,
    '-e', `DELETE FROM creaty_site.contact_messages WHERE id IN (${list});`,
  ];
  try {
    admin.execFileSync(cmd[0], cmd.slice(1), { stdio: 'ignore' });
    p(color('32', `${aBorrar.length} fila(s) de prueba borrada(s).`));
  } catch (e) {
    p(color('31', 'No se pudieron borrar. Define ADMIN_DB_USER y ADMIN_DB_PASSWORD.'));
  }
}

try {
  if (comando === 'listar') await listar();
  else if (comando === 'ver') await ver(resto[0]);
  else if (comando === 'marcar') await marcar(resto[0], resto[1]);
  else if (comando === 'resumen') await resumen();
  else if (comando === 'borrar-pruebas') await borrarPruebas();
  else {
    p('Uso: node api/src/cli.js <listar|ver|marcar|resumen|borrar-pruebas>');
    process.exitCode = 1;
  }
} catch (err) {
  p(color('31', `Error: ${err.message}`));
  process.exitCode = 1;
} finally {
  await db.pool.end();
}
