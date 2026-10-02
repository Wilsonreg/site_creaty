// Google Analytics 4 — inicialización.
// Vive en /js/gtag.js y se carga desde BaseLayout.astro con <script src>.
// Asi evitamos el problema de CSP + type="module": un script externo
// desde el mismo origen lo permite la directiva 'self' sin necesidad
// de calcular hashes para cada build.
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', 'G-BWCF8832TM');
