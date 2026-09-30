/**
 * Validacion del formulario de contacto.
 * Devuelve { ok, data, errors } — nunca lanza.
 */

// Dominios de correo aceptados. Lista conservadora a proposito:
// cubre lo habitual (Gmail, Hotmail, Outlook, iCloud, corporativos) sin
// intentar ser un RFC 5322-compliant.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EMAIL_DOMAIN_BLOCKLIST = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
]);

export const INTERESES = new Set([
  'sitio-web',
  'ecommerce',
  'vps-infra',
  'cloudflare',
  'hardening',
  'otro',
]);

/** Quita acentos, baja a minusculas y colapsa espacios. */
function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
/** Detecta si un texto repite el mismo caracter (patron tipico de bot). */
function looksLikeBot(s) {
  const t = norm(s);

  // Solo nos interesan letras y simbolos: los digitos y espacios se descartan
  // porque los telefonos legitimos (300 000 0000) repiten digitos y NO son spam.
  const sinDigitos = t.replace(/[\d\s]/g, '');
  if (/(.)\1{7,}/.test(sinDigitos)) return true;

  // Un texto que es practicamente un solo caracter.
  if (sinDigitos.length >= 20 && new Set(sinDigitos).size <= 2) return true;

  if (/\b(viagra|casino|crypto\s*giveaway|seo\s*backlinks)\b/.test(t)) return true;
  return false;
}

export function validateContact(body) {
  const errors = {};
  const data = {};

  // --- nombre ---
  const nombre = String(body?.nombre ?? '').trim();
  if (nombre.length < 2) errors.nombre = 'Ingresa tu nombre (mínimo 2 caracteres).';
  else if (nombre.length > 120) errors.nombre = 'El nombre es demasiado largo (máx. 120).';
  else if (looksLikeBot(nombre)) errors.nombre = 'Entrada no válida.';
  else data.nombre = nombre;

  // --- email ---
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email) errors.email = 'El correo es obligatorio.';
  else if (email.length > 190) errors.email = 'El correo es demasiado largo.';
  else if (!EMAIL_RE.test(email)) errors.email = 'El correo no tiene un formato válido.';
  else if (EMAIL_DOMAIN_BLOCKLIST.has(email.split('@')[1] ?? ''))
    errors.email = 'Usa un correo real (los dominios de prueba no se aceptan).';
  else data.email = email;

  // --- telefono (opcional) ---
  const telefonoRaw = String(body?.telefono ?? '').trim();
  if (telefonoRaw) {
    const soloDigitos = telefonoRaw.replace(/[^\d]/g, '');
    if (soloDigitos.length < 7) errors.telefono = 'El teléfono debe tener al menos 7 dígitos.';
    else if (soloDigitos.length > 15) errors.telefono = 'El teléfono es demasiado largo.';
    else data.telefono = telefonoRaw.slice(0, 40);
  } else {
    data.telefono = null;
  }

  // --- interes ---
  const interes = String(body?.interes ?? '').trim().toLowerCase();
  if (!interes) errors.interes = 'Elige una opción.';
  else if (!INTERESES.has(interes)) errors.interes = 'La opción seleccionada no es válida.';
  else data.interes = interes;

  // --- mensaje ---
  const mensaje = String(body?.mensaje ?? '').trim();
  if (mensaje.length < 20) errors.mensaje = 'Cuéntanos un poco más (mínimo 20 caracteres).';
  else if (mensaje.length > 4000) errors.mensaje = 'El mensaje es demasiado largo (máx. 4000).';
  else if (looksLikeBot(mensaje)) errors.mensaje = 'El mensaje fue bloqueado por filtro antispam.';
  else data.mensaje = mensaje;

  const ok = Object.keys(errors).length === 0;
  return { ok, data: ok ? data : {}, errors };
}
