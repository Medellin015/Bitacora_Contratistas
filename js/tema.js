'use strict';
/* ============================================================================
   0) tema.js — se carga SÍNCRONO en <head>, antes del primer pintado
   Estructura:
     1. Tema claro/oscuro guardado (evita el destello claro→oscuro)
     2. Configuración de Tailwind (lee los colores desde los tokens CSS)
   ============================================================================ */
/* ===== 1. Tema ===== */
// Tema antes del primer pintado (evita el destello claro→oscuro).
(function () {
  try {
    var guardado = localStorage.getItem('bitacora.tema');
    var oscuro = guardado ? guardado === 'oscuro' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-tema', oscuro ? 'oscuro' : 'claro');
  } catch (e) { /* sin localStorage: queda el tema claro */ }
})();
// Tailwind lee los colores desde los tokens CSS: así el tema oscuro cambia
// todas las utilidades sin variantes dark:. Si el CDN no cargó (red
// institucional), la app sigue funcionando con el CSS propio.
if (window.tailwind) tailwind.config = {
  corePlugins: { preflight: true },
  theme: {
    extend: {
      colors: {
        fondo: 'var(--fondo)', superficie: 'var(--superficie)', superficie2: 'var(--superficie-2)',
        borde: 'var(--borde)', texto: 'var(--texto)', texto2: 'var(--texto-2)',
        primario: 'var(--primario)', primario2: 'var(--primario-hover)', acento: 'var(--acento)',
        exito: 'var(--exito)', alerta: 'var(--alerta)', error: 'var(--error)', info: 'var(--info)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      borderRadius: { md: '8px', lg: '10px', xl: '14px' },
    },
  },
};
