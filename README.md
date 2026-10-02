# Creaty Site

[![Sitio en producción](https://img.shields.io/badge/Sitio-site.creaty.fun-0A0A0A?style=for-the-badge&logo=google-chrome&logoColor=white)](https://site.creaty.fun/)
[![Estado](https://img.shields.io/website?url=https%3A%2F%2Fsite.creaty.fun&style=for-the-badge&label=Estado)](https://site.creaty.fun/)

Sitio web oficial de **Creaty Site**, agencia de desarrollo web, infraestructura y
ciberseguridad ubicada en Copacabana, Antioquia.

🌐 **Producción:** [https://site.creaty.fun](https://site.creaty.fun)

Sitio estático servido por **Apache**, con una **API en Node + MySQL** detrás que
atiende el formulario de contacto. Todo detrás de **Cloudflare** con SSL Full (strict).

**Producción:** <https://site.creaty.fun>

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | [Astro 7](https://astro.build) — salida estática, hidratación selectiva |
| Estilos | CSS vanilla con custom properties (~15 KB, sin framework de UI) |
| Backend | Node 22 + Express 5 + mysql2 + nodemailer |
| Base de datos | MySQL 8 (contenedor `mysql-publico`, puerto 3308) |
| Servidor web | Apache con reverse proxy a la API |
| TLS | Let's Encrypt (ECDSA) + Cloudflare SSL Full (strict) |
| Seguridad | reCAPTCHA v3, WAF, rate limit en BD, usuario MySQL de mínimo privilegio |
| SEO | @astrojs/sitemap, meta por página, CSP con hashes SHA-256 |

## Estructura

```
.
├── src/                      # Sitio Astro
│   ├── components/           # Header, Footer, Icon
│   ├── content/blog/         # Artículos en Markdown (content collection)
│   ├── layouts/              # BaseLayout (SEO, CSP, header, footer)
│   ├── pages/                # /, /quienes-somos, /que-hacemos, /blog, /contactanos
│   ├── styles/global.css     # Sistema de diseño (tokens, componentes)
│   └── content.config.ts     # Esquema del content collection del blog
│
├── api/                      # Backend del formulario
│   ├── src/
│   │   ├── server.js         # Express: endpoints, CORS, rate limit
│   │   ├── config.js         # Configuración desde variables de entorno
│   │   ├── db.js             # Pool mysql2, consultas parametrizadas
│   │   ├── mail.js           # Notificación SMTP con nodemailer
│   │   ├── recaptcha.js      # Verificación de tokens v3 (acción + score)
│   │   ├── validate.js       # Validación de entrada y antispam
│   │   ├── gateway.js        # Gateway local: /api/* → API, /* → sitio
│   │   └── cli.js            # Gestión de mensajes por terminal
│   ├── sql/schema.sql        # Esquema de la base
│   ├── .env.example          # Plantilla de variables (sin secretos)
│   └── package.json
│
├── deploy/                   # Archivos de despliegue en el servidor
│   ├── creaty-site.conf      # Vhost de Apache (:80 y :443)
│   ├── creaty-api.service    # Unidad systemd de la API
│   └── install.sh            # Instalador con backup y rollback
│
├── scripts/
│   ├── stack.sh              # Sitio + API + gateway + tunnel
│   └── preview-tunnel.sh     # Preview público con Cloudflare Tunnel
│
├── public/                   # Assets estáticos (logo, favicon, OG image)
└── astro.config.mjs
```

## Puesta en marcha (local)

```bash
# 1. Dependencias
npm install
cd api && npm install && cd ..

# 2. Configurar la API
cp api/.env.example api/.env
$EDITOR api/.env          # rellena las variables (ver abajo)

# 3. Base de datos (si no usas una existente)
mysql -h 127.0.0.1 -P 3306 -u root -p < api/sql/schema.sql

# 4. Sitio
npm run dev               # http://localhost:4321

# 5. API (en otra terminal)
cd api && npm start       # http://127.0.0.1:8787
curl http://127.0.0.1:8787/api/health
```

El formulario necesita ambos procesos. Si quieres el stack completo con un
tunnel público de preview:

```bash
./scripts/stack.sh start    # sitio + API + gateway + tunnel
./scripts/stack.sh status
./scripts/stack.sh stop
```

## Variables de entorno

Todas viven en `api/.env`, que está en `.gitignore`. La plantilla
`api/.env.example` **sí** se versiona. Genera tokens y contraseñas con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

| Variable | Para qué | ¿Secreto? |
|---|---|---|
| `DB_USER` / `DB_PASSWORD` | Conexión a MySQL | **Sí** |
| `ADMIN_TOKEN` | Autorización de `GET`/`PATCH /api/contact` | **Sí** |
| `SMTP_PASS` | Contraseña de aplicación de Gmail | **Sí** |
| `RECAPTCHA_SECRET` | Verificación server-side de reCAPTCHA v3 | **Sí** |
| `ALLOWED_ORIGINS` | Orígenes permitidos por CORS | No |
| `RATE_MAX` / `RATE_WINDOW_MS` | Límite de envíos por IP | No |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` | Configuración del servidor de correo | No |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | Servidor y base de datos | No |
| `RECAPTCHA_MIN_SCORE` | Umbral de score de reCAPTCHA (0.0–1.0) | No |
| `PORT` / `HOST` | Puerto y bind del servidor de la API | No |

La **site key** de reCAPTCHA (`6LcjINgtAAAAAFf587_EcXsvW3mb4BBVpXNKBn1K`) sí es
pública por diseño: va en el HTML y en el JS del navegador. Solo el *secret* es
privado. Está en `src/layouts/BaseLayout.astro` y `src/pages/contactanos.astro`.

## Arquitectura de producción

```
navegador
   │  POST https://site.creaty.fun/api/contact
   ▼
Cloudflare (TLS strict, WAF, rate limit, cache)
   ▼
Apache 443  (creaty-site.conf)
   ├── /api/*  ──►  API  127.0.0.1:8787  ──►  MySQL 3308
   │                  │
   │                  └──► SMTP smtp.gmail.com (notificación)
   └── /*      ──►  /home/wilsonricardoeg/creaty-site/dist (archivos estáticos)
```

El gateway (`api/src/gateway.js`) solo se usa en desarrollo con el tunnel de
preview. En producción Apache hace el reverse proxy directamente.

## API del formulario

El formulario **no abre el cliente de correo**: valida en el servidor y guarda
en MySQL, y además notifica por correo.

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | — | Estado de la API, la BD y el SMTP |
| `POST` | `/api/contact` | — | Recibe un mensaje (público, con rate limit) |
| `GET` | `/api/contact` | Bearer | Lista mensajes, con filtro y resumen |
| `PATCH` | `/api/contact/:id/estado` | Bearer | Cambia el estado del mensaje |

Estados: `nuevo`, `leido`, `respondido`, `archivado`.

### Base de datos

Base aislada `creaty_site` con tablas `contact_messages` y `rate_events`.
El usuario de la aplicación tiene **mínimo privilegio**: solo `SELECT`, `INSERT`
y `UPDATE` sobre esa base. No puede borrar, no puede ejecutar `DROP` y no ve
ninguna otra base del servidor.

```sql
GRANT SELECT, INSERT, UPDATE ON `creaty_site`.* TO 'creaty_api'@'localhost';
```

Esquema en `api/sql/schema.sql`.

### Seguridad aplicada

- **reCAPTCHA v3** con verificación server-side de acción (`contact`) y score
  (≥ `RECAPTCHA_MIN_SCORE`). *Fail-open* si Google no responde, para no perder
  clientes legítimos durante un outage.
- **Honeypot** (`website`): los bots lo rellenan y el mensaje se descarta en silencio.
- **Rate limit por IP respaldado en MySQL** (5 envíos / 15 min por defecto).
  Sobrevive reinicios y sirve con varias instancias.
- **CORS estricto** que además *rechaza* (403) cualquier `Origin` no autorizado,
  no solo omite las cabeceras.
- **Consultas parametrizadas** en todos los accesos; nunca se concatena entrada
  del usuario en SQL.
- **Límite de cuerpo** de 16 KB, cabeceras con `helmet`, `x-powered-by` deshabilitado.
- **Token de administración** comparado en tiempo constante (`timingSafeEqual`).
- **IP real** tomada de `CF-Connecting-IP`, no de la cabecera que declare el cliente.
- **CSP en dos capas**: la cabecera HTTP lleva las directivas que solo funcionan
  ahí (`frame-ancestors`, `upgrade-insecure-requests`), y Astro emite una `<meta>`
  por página con hashes SHA-256 de los scripts inline, sin `unsafe-inline` en scripts.

### Gestión de mensajes

```bash
cd api
node src/cli.js listar                      # últimos 20
node src/cli.js listar --estado nuevo
node src/cli.js ver 12
node src/cli.js marcar 12 leído
node src/cli.js resumen
```

## Contenido (blog)

Para agregar un artículo, crea `src/content/blog/mi-post.md`:

```markdown
---
title: "Mi nuevo artículo"
description: "Resumen corto para SEO y Open Graph."
pubDate: 2026-10-01
author: "Wilson Ricardo E."
tag: "Cloudflare"
---

Contenido en Markdown.
```

## Despliegue en el servidor

El instalador configura el vhost de Apache, activa la API como servicio systemd
y verifica el certificado. **Hace backup de lo que toca y revierte solo si
`apache2ctl configtest` falla.**

```bash
# En el servidor de producción
cd ~/creaty-site
sudo ./deploy/install.sh
```

Respalda en `/root/creaty-backup-<fecha>/`. Para revertir:

```bash
sudo cp -a /root/creaty-backup-<fecha>/creaty.info-le-ssl.conf \
  /etc/apache2/sites-available/
sudo a2dissite creaty-site && sudo systemctl reload apache2
```

### Actualizar el sitio tras un cambio

```bash
npm run build                 # regenera dist/
sudo systemctl reload apache2 # Apache sirve dist/ directamente
```

La API no necesita reiniciarse para cambios en el sitio, y viceversa.

### Operaciones

```bash
systemctl status creaty-api           # estado de la API
journalctl -u creaty-api -f           # logs en vivo
sudo apache2ctl configtest            # validar config antes de recargar
certbot renew --dry-run               # comprobar renovación del certificado
```

## Requisitos

- Node.js ≥ 22.12
- MySQL 8 o MariaDB 10.6+
- Apache 2.4 con `mod_proxy`, `mod_headers` y `mod_rewrite`
- certbot con el plugin de Apache
- cloudflared (solo para el tunnel de preview)

## Licencia

© 2026 Creaty Site. Todos los derechos reservados.
