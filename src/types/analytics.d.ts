// Tipos globales de Google Analytics 4.
//
// El snippet de gtag.js se escribe dentro de un <script> en BaseLayout.astro,
// que Astro type-checkea. Sin esta declaracion, `window.dataLayer` da error
// TS2339 ("Property 'dataLayer' does not exist on type Window").
//
// No se declara aqui la funcion gtag: se define en el propio snippet y usa
// argumentos rest, de modo que no hace falta ambientarla.

declare interface Window {
  dataLayer: unknown[];
}
