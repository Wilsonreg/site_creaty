import nodemailer from 'nodemailer';

/**
 * Notificacion de nuevos mensajes del formulario de contacto.
 *
 * El envio es **fire-and-forget**: se invoca con .catch() en el caller y
 * los errores solo se loggean. Si Gmail falla, el POST sigue devolviendo
 * 201 al visitante porque el mensaje ya esta en MySQL.
 */

let cachedTransporter = null;

function transporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number.parseInt(process.env.SMTP_PORT ?? '465', 10),
    secure: (process.env.SMTP_PORT ?? '465') === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Limite duro: si Gmail se cuelga, que no bloquee el proceso del API.
    connectionTimeout: 8_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return cachedTransporter;
}

const INTERES_LABEL = {
  'sitio-web': 'Sitio web / landing',
  ecommerce: 'Tienda online / e-commerce',
  'vps-infra': 'VPS e infraestructura',
  cloudflare: 'Cloudflare',
  hardening: 'Hardening y ciberseguridad',
  otro: 'Otro',
};

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildContactEmail(m, appOrigin) {
  const interes = INTERES_LABEL[m.interes] ?? m.interes;
  const when = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const replyUrl = `mailto:${escape(m.email)}?subject=${encodeURIComponent(
    `Re: ${interes} — Creaty Site`,
  )}`;
  const messageUrl = `${escape(appOrigin)}/api/contact/${m.id}/estado`; // opcional

  const subject = `[Creaty Site] ${interes} — ${m.nombre}`;

  const text = [
    `Nuevo mensaje desde el sitio (${appOrigin}).`,
    '',
    `Nombre:    ${m.nombre}`,
    `Correo:    ${m.email}`,
    `Telefono:  ${m.telefono ?? '—'}`,
    `Interes:   ${interes}`,
    '',
    'Mensaje:',
    m.mensaje,
    '',
    '—',
    `Recibido:  ${when}`,
    `Origen:    ${m.origen ?? '—'}`,
    `IP:        ${m.ip ?? '—'}`,
    `ID:        #${m.id}`,
    '',
    `Responder: ${replyUrl}`,
  ].join('\n');

  const html = `
  <!doctype html>
  <html lang="es">
    <body style="margin:0;padding:0;background:#0d0f1a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#eef0f7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0f1a;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#12141f;border:1px solid rgba(255,255,255,0.09);border-radius:14px;overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#6ee7ff,#a78bfa,#ff8a65);padding:18px 24px;">
                  <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0a0a14;font-weight:700;">Creaty Site</div>
                  <div style="font-size:22px;font-weight:700;color:#0a0a14;margin-top:2px;">Nuevo mensaje de contacto</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 24px 8px 24px;">
                  <p style="margin:0 0 14px;color:#a4a9bd;font-size:14px;">
                    Recibiste un mensaje a traves de <strong style="color:#eef0f7;">${escape(appOrigin)}</strong>.
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                    <tr><td style="padding:6px 0;color:#6f7591;width:110px;">Nombre</td><td style="padding:6px 0;color:#eef0f7;font-weight:600;">${escape(m.nombre)}</td></tr>
                    <tr><td style="padding:6px 0;color:#6f7591;">Correo</td><td style="padding:6px 0;"><a href="mailto:${escape(m.email)}" style="color:#6ee7ff;">${escape(m.email)}</a></td></tr>
                    <tr><td style="padding:6px 0;color:#6f7591;">Teléfono</td><td style="padding:6px 0;color:#eef0f7;">${escape(m.telefono ?? '—')}</td></tr>
                    <tr><td style="padding:6px 0;color:#6f7591;">Interés</td><td style="padding:6px 0;color:#eef0f7;">${escape(interes)}</td></tr>
                  </table>
                  <div style="margin-top:20px;padding:14px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;color:#eef0f7;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escape(m.mensaje)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 24px 14px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#6f7591;">
                    <tr><td>Recibido</td><td style="text-align:right;">${escape(when)} (Bogotá)</td></tr>
                    <tr><td>ID</td><td style="text-align:right;">#${m.id}</td></tr>
                    <tr><td>Origen</td><td style="text-align:right;">${escape(m.origen ?? '—')}</td></tr>
                    <tr><td>IP</td><td style="text-align:right;">${escape(m.ip ?? '—')}</td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 24px 22px 24px;text-align:center;">
                  <a href="${replyUrl}" style="display:inline-block;background:linear-gradient(135deg,#6ee7ff,#a78bfa);color:#0a0a14;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:999px;">Responder a ${escape(m.nombre)}</a>
                </td>
              </tr>
            </table>
            <p style="color:#6f7591;font-size:11px;margin-top:14px;">
              Mensaje #${m.id} guardado en <code>creaty_site.contact_messages</code>.
            </p>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return { subject, text, html };
}

/** Envia la notificacion. No lanza: los errores se devuelven para que el caller los loggee. */
export async function sendContactNotification(m, appOrigin) {
  const from = process.env.MAIL_FROM ?? process.env.SMTP_USER;
  const to = process.env.MAIL_TO ?? process.env.SMTP_USER;
  const { subject, text, html } = buildContactEmail(m, appOrigin);

  const info = await transporter().sendMail({
    from: `"Creaty Site" <${from}>`,
    to,
    replyTo: m.email,
    subject,
    text,
    html,
    headers: {
      'X-Creaty-Source': appOrigin,
      'X-Creaty-Message-Id': String(m.id),
    },
  });
  return info;
}

/** Verifica que las credenciales SMTP funcionan. Util en /api/health. */
export async function smtpPing() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return { ok: false, reason: 'no-creds' };
  try {
    await transporter().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}