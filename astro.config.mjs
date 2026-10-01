// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://site.creaty.fun',
  // 'always' para que las URLs del HTML, del sitemap y las que sirve Apache
  // coincidan. Con 'never', el canonical declaraba /blog pero Apache
  // respondia 301 hacia /blog/, de modo que la URL canonica era ella misma
  // un redirect y Google reportaba duplicados.
  trailingSlash: 'always',
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  integrations: [
    sitemap({
      changefreq: 'monthly',
      priority: 0.7,
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  // CSP por pagina. Astro calcula hashes SHA-256 de los <script> y <style>
  // inline que el sitio emite y los anade a la meta http-equiv que se
  // sirve en cada HTML. Combinado con la cabecera de Apache (frame-ancestors,
  // upgrade-insecure-requests), da una politica completa.
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        // reCAPTCHA carga imagenes desde gstatic; el icono del widget.
        // Google Analytics envia beacons y la imagen de pixel a
        // google-analytics.com, asi que tambien debe estar permitido en img-src.
        "img-src 'self' data: https://www.gstatic.com https://www.google-analytics.com",
        "font-src 'self'",
        // Cloudflare inyecta su beacon (Cloudflareinsights) que envia
        // metricas a cloudflareinsights.com. Si no, el navegador bloquea
        // el fetch y la consola llena de errores.
        // Google Analytics reporta por fetch a google-analytics.com y, desde
        // la UE, a region1.google-analytics.com (redireccion geografica).
        "connect-src 'self' https://cloudflareinsights.com https://www.google-analytics.com https://region1.google-analytics.com",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "manifest-src 'self'",
        "media-src 'self'",
        // reCAPTCHA inserta un <iframe> en la pagina.
        "frame-src https://www.google.com",
      ],
      scriptDirective: {
        // 'self' para los bundles de Astro, los origines de reCAPTCHA
        // (api.js + recursos del widget) y el script de Cloudflare.
        // Los hashes SHA-256 los calcula Astro para los scripts inline
        // que el propio framework emite (menu, formulario).
        // IMPORTANTE: los paths terminan en "/" para que CSP haga
        // matching de subpath. Sin la barra, "https://www.gstatic.com/recaptcha"
        // no matchea "https://www.gstatic.com/recaptcha/releases/.../foo.js".
        resources: [
          "'self'",
          "https://www.google.com/recaptcha/",
          "https://www.gstatic.com/recaptcha/",
          "https://static.cloudflareinsights.com",
          // Google Analytics: el tag gtag.js.
          "https://www.googletagmanager.com",
        ],
        strictDynamic: false,
      },
      styleDirective: {
        // Necesario porque varios componentes Astro usan atributos style="..."
        // inline (display:flex, margin, etc.). Refactorizar todos a clases
        // seria un cambio grande; aceptar 'unsafe-inline' solo para estilos.
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },
  vite: {
    // Necesario para exponer `astro preview` detrás de un Cloudflare Tunnel,
    // ya que el host entrante (trycloudflare.com) no es localhost.
    preview: {
      allowedHosts: true,
    },
  },
});