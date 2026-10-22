'use strict';
/* ============================================================================
   lector-planilla-worker.js — Web Worker del lector de planillas (no va en
   index.html: lo crea js/lector-planilla.js con new Worker)
   Estructura:
     1. Carga (una sola vez): Pyodide, pypdf verificado con sha256 y el código
        de py/leer_planilla.py como módulo de Python
     2. Mensajes: «cargar» y «leer». Si la planilla viene cifrada con AES, carga
        pycryptodome (del mismo CDN de Pyodide) y vuelve a leer.
   ============================================================================ */
/* global importScripts, loadPyodide */

/* ===== 1. Carga ===== */
let listo = null;
const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
// cache: 'force-cache' solo para lo que no cambia nunca en esa URL (pypdf, fijado con sha256); el código
// del lector se revalida para que una versión nueva de la app no siga usando el viejo.
const descargar = async (url, que, cache = 'no-cache') => {
  let r;
  try { r = await fetch(url, { cache }); } catch (e) { throw new Error(`No se pudo descargar ${que} (¿la red bloquea ${new URL(url).host}?)`, { cause: e }); }
  if (!r.ok) throw new Error(`No se pudo descargar ${que} (HTTP ${r.status})`);
  return r;
};
const preparar = (config) => {
  if (listo) return listo;
  listo = (async () => {
    try { importScripts(`${config.pyodide}pyodide.js`); } catch (e) { throw new Error(`No se pudo cargar Python (Pyodide) desde ${new URL(config.pyodide).host}`, { cause: e }); }
    const py = await loadPyodide({ indexURL: config.pyodide });
    // pypdf: un archivo fijo de PyPI; si lo que llega no es exactamente ese, no se instala.
    const rueda = new Uint8Array(await (await descargar(config.pypdf.url, 'pypdf', 'force-cache')).arrayBuffer());
    if (hex(await crypto.subtle.digest('SHA-256', rueda)) !== config.pypdf.sha256) throw new Error('El paquete pypdf descargado no coincide con el esperado');
    py.unpackArchive(rueda, 'wheel');
    const codigo = await (await descargar(config.codigo, 'el lector de planillas')).text();
    py.FS.mkdirTree('/home/pyodide/lector');
    py.FS.writeFile('/home/pyodide/lector/leer_planilla.py', codigo);
    py.runPython("import sys\nif '/home/pyodide/lector' not in sys.path:\n    sys.path.insert(0, '/home/pyodide/lector')");
    return { py, modulo: py.pyimport('leer_planilla') };
  })().catch((e) => { listo = null; throw e; });
  return listo;
};

/* ===== 2. Mensajes ===== */
self.onmessage = async (e) => {
  const { id, tipo, config, datos, pistas } = e.data || {};
  try {
    if (tipo === 'cargar') { await preparar(config); self.postMessage({ id, ok: true }); return; }
    if (!listo) throw Object.assign(new Error('El lector de planillas no está cargado'), { codigo: 'carga' });
    const { py, modulo } = await listo;
    const bytes = new Uint8Array(datos);
    const leerUnaVez = () => {
      const enPython = py.toPy(bytes);
      try { return JSON.parse(modulo.leer_planilla_json(enPython, JSON.stringify(pistas || {}))); }
      finally { if (enPython && enPython.destroy) enPython.destroy(); }
    };
    let resultado = leerUnaVez();
    if (!resultado.ok && resultado.error === 'cifrado') {
      await py.loadPackage('pycryptodome', { messageCallback: () => {} });
      resultado = leerUnaVez();
    }
    self.postMessage({ id, ok: true, resultado });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err), codigo: (err && err.codigo) || (tipo === 'cargar' ? 'carga' : 'lectura') });
  }
};
