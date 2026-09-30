---
title: "Cloudflare para PYMEs: 8 configuraciones que el 90% deja mal"
description: "DNS, cache, WAF, mTLS, Zero Trust... Cloudflare tiene docenas de productos. Aquí van las configuraciones que casi nadie ajusta y más impacto tienen."
pubDate: 2026-08-28
author: "Wilson Ricardo E."
tag: "Cloudflare"
---

Cloudflare es **maravilloso y peligroso** al mismo tiempo: lo activas en cinco
minutos, pero su configuración por defecto deja **decenas de optimizaciones y
endurecimientos** sobre la mesa. En Creaty Site lo vemos todos los días
auditorías de stacks que pagaban Cloudflare Pro y no aprovechaban ni el 30%.

Aquí va la lista corta que más impacto tiene en PYMEs.

## 1. Cache rules agresivas pero correctas

El cache automático de Cloudflare sirve estáticos, pero ignora HTML. Configurar
**Cache Rules** para cachear HTML durante 60–300 s en páginas de contenido
(incluso con cookie) reduce TTFB a 20–80 ms globalmente.

## 2. Tiered Cache en planes Business+

Con Tiered Cache, un miss en el edge más cercano se sirve desde otro edge con
objetos calientes en vez de ir al origen. Reduce carga del servidor entre 5×
y 20× en picos.

## 3. WAF con Managed Rules reales

Las Managed Rules de Cloudflare **no vienen activadas por defecto en modo
bloqueo**. Vienen en *simulate* o *disabled*. Activarlas sin ajustar falsos
positivos es una de las tareas más rentables que existen.

## 4. Rate Limiting por ruta

Un `/api/login` sin rate limiting es una invitación a credential stuffing.
Configura reglas de 5 requests/min por IP para endpoints sensibles.

## 5. mTLS para servicios internos

Si tienes microservicios hablando entre sí, **no los expongas por internet**.
Cloudflare Tunnel + mTLS permite que los servicios internos sean
inalcanzables desde fuera y aun así usar Workers/Pages como fachada.

## 6. Email Routing con SPF/DKIM/DMARC

`Email Routing` permite recibir correo en tu dominio y reenviarlo a Gmail/
Outlook sin pagar Google Workspace. Pero **sin SPF, DKIM y DMARC** tus
correos legítimos caerán en spam.

## 7. Logs a R2 (no a enterprise)

El plan Free lleva logs a un dashboard. Para análisis serios, **push a R2**
con Logpush y procesa con Workers + Vectorize. Cuesta centavos.

## 8. Turnstile en formularios

Cloudflare Turnstile reemplaza CAPTCHA con un widget **invisible** y gratis.
Mejora UX y reduce bots. Lo integramos en todos los formularios de contacto
que construimos.

---

## ¿Quieres que auditemos tu Cloudflare?

Te entregamos un reporte con hallazgos priorizados (impacto vs. esfuerzo) y
lo implementamos en una semana. [Solicita la auditoría](/contactanos).
