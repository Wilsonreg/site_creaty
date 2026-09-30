/**
 * Verificacion de tokens de reCAPTCHA contra el endpoint oficial de Google.
 * https://developers.google.com/recaptcha/docs/v3#siteverify
 *
 * Las claves son **v3** (score-based, invisible). Ademas del exito booleano,
 * verificamos:
 *   - que el `action` devuelto por Google coincida con el esperado
 *     (asi un token generado en otra pagina no se reutiliza aqui).
 *   - que el `score` este por encima de un umbral configurable. Por defecto
 *     0.5 (Google recomienda 0.5 como limite razonable entre humano y bot).
 *
 * Si RECAPTCHA_SECRET no esta configurado, la verificacion devuelve {ok:true}
 * para no bloquear el envio (modo degradado). Loggeamos una sola vez al
 * arranque para que quede claro que reCAPTCHA esta deshabilitado.
 */

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE_DEFAULT = 0.5;

let warnedDisabled = false;

function disabled() {
  if (!warnedDisabled) {
    console.warn('[recaptcha] RECAPTCHA_SECRET no configurado: las submissions no se verifican');
    warnedDisabled = true;
  }
  return { ok: true, degraded: true };
}

/**
 * Verifica un token v3.
 *
 * @param {string} token
 * @param {string} remoteIp
 * @param {string} expectedAction - debe coincidir con el action enviado al cliente
 * @returns {{ok: boolean, score?: number, action?: string, errors?: string[], reason?: string, degraded?: boolean, raw?: any}}
 */
export async function verifyToken(token, remoteIp, expectedAction) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return disabled();
  if (!token || typeof token !== 'string') {
    return { ok: false, errors: ['missing-input-response'] };
  }

  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);
  if (remoteIp) params.set('remoteip', remoteIp);

  let data;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: params,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      console.error(`[recaptcha] siteverify HTTP ${res.status}`);
      // Fail-open: si Google esta caido no bloqueamos al visitante.
      return { ok: true, degraded: true, reason: `http-${res.status}` };
    }
    data = await res.json();
  } catch (err) {
    console.error(`[recaptcha] error de red: ${err.message}`);
    return { ok: true, degraded: true, reason: err.message };
  }

  if (!data.success) {
    console.warn(`[recaptcha] rechazado: ${(data['error-codes'] ?? []).join(',')}`);
    return { ok: false, errors: data['error-codes'] ?? [], raw: data };
  }

  // v3 especifico: el action debe coincidir. Asi evitamos que alguien
  // envie un token generado en otra parte del sitio (o en otra app).
  if (expectedAction && data.action !== expectedAction) {
    console.warn(
      `[recaptcha] action mismatch: esperaba '${expectedAction}', recibio '${data.action}'`,
    );
    return { ok: false, errors: ['action-mismatch'], score: data.score, raw: data };
  }

  // v3 especifico: score >= umbral configurable.
  const minScore = Number.parseFloat(process.env.RECAPTCHA_MIN_SCORE ?? String(MIN_SCORE_DEFAULT));
  if (typeof data.score === 'number' && data.score < minScore) {
    console.warn(
      `[recaptcha] score bajo: ${data.score} < ${minScore} (action=${data.action}, host=${data.hostname})`,
    );
    return { ok: false, errors: ['low-score'], score: data.score, raw: data };
  }

  return {
    ok: true,
    score: data.score,
    action: data.action,
    host: data.hostname,
    raw: data,
  };
}