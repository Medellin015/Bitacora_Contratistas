'use strict';
/* ============================================================================
   1) firebase-config.js — Firebase y modo demostración
   Estructura:
     1. firebaseConfig (apps internas: la seguridad real vive en firestore.rules)
     2. Detección del modo demostración (sin proyecto Firebase, forzado o sin SDK)
     3. Inicialización: window.db, window.auth, window.authReady
   Las imágenes del encabezado y pie del Word están en imagenes-formato.js.
   ============================================================================ */

/* ===== 1. firebaseConfig ===== */
// Configuración web del proyecto «bitacora-contratistas» (Consola → Configuración
// del proyecto → Tus apps). Es pública por diseño: la seguridad vive en
// firestore.rules. Si se vuelve a dejar en <PENDIENTE>, la app abre en modo
// demostración con datos ficticios guardados en el navegador.
window.firebaseConfig = {
  apiKey: 'AIzaSyAxNFFygqoVBabOkNHlP5RFgRajo74QetE',
  authDomain: 'bitacora-contratistas.firebaseapp.com',
  projectId: 'bitacora-contratistas',
  storageBucket: 'bitacora-contratistas.firebasestorage.app',
  messagingSenderId: '450161614641',
  appId: '1:450161614641:web:72f4c82728d6fcfe9e9a10',
};
window.VERSION_APP = '1.0.0';

/* ===== 2. Modo demostración ===== */
// ?demo=1 fuerza el modo demostración aunque exista configuración (para probar
// la interfaz sin tocar datos reales); ?demo=0 lo apaga en ese navegador.
(function () {
  const parametros = new URLSearchParams(window.location.search);
  try {
    if (parametros.get('demo') === '1') localStorage.setItem('bitacora.demo', '1');
    if (parametros.get('demo') === '0') localStorage.removeItem('bitacora.demo');
  } catch (e) { /* sin localStorage */ }
  let forzado;
  try { forzado = localStorage.getItem('bitacora.demo') === '1'; } catch (e) { forzado = false; }
  const incompleta = Object.values(window.firebaseConfig).some((v) => String(v).includes('<PENDIENTE>'));
  // Si el SDK no cargó (red institucional que bloquea gstatic.com) no hay forma de conectar:
  // en vez de romper con «firebase is not defined», se avisa y se abre la demostración.
  const sinSDK = typeof firebase === 'undefined';
  if (sinSDK && !incompleta) console.warn('No cargó el SDK de Firebase: la app abre en modo demostración.');
  window.MODO_DEMO = incompleta || forzado || sinSDK;
  window.MOTIVO_DEMO = incompleta ? 'sin-config' : (forzado ? 'forzado' : (sinSDK ? 'sin-sdk' : ''));
})();

/* ===== 3. Inicialización de Firebase ===== */
if (!window.MODO_DEMO) {
  firebase.initializeApp(window.firebaseConfig);
  window.auth = firebase.auth();
  window.auth.languageCode = 'es';          // correos de verificación y recuperación en español
  window.db = firebase.firestore();
  // Redes institucionales (proxies que cortan WebChannel): detectar long-polling.
  window.db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
  // Caché offline: la app sigue leyendo (y encola escrituras) sin red.
  window.db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => console.warn('Persistencia offline no disponible:', err && err.code));
  // Se resuelve con el primer estado de sesión conocido (usuario o null).
  window.authReady = new Promise((resolver) => {
    const parar = window.auth.onAuthStateChanged((u) => { parar(); resolver(u); });
  });
} else {
  window.auth = null;
  window.db = null;
  window.authReady = Promise.resolve(null);
}
