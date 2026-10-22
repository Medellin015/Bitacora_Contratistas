'use strict';
/* ============================================================================
   7b) lector-planilla.js — lee la planilla de seguridad social (PDF) con Python
       en el navegador: Pyodide (CPython compilado a WebAssembly) y pypdf dentro
       de un Web Worker, con el código de py/leer_planilla.py. El PDF no sale
       del equipo de la persona: no hay servidor de por medio.
   Estructura:
     1. Configuración: versiones fijas (Pyodide 0.29.5 · pypdf 6.19.0 con sha256)
     2. Worker: se crea en el primer uso, se reutiliza y se reinicia si se cuelga
     3. API: LectorPlanilla.leer(archivo, pistas) · precargar() · estado()
   Plan B: si la red bloquea cdn.jsdelivr.net o files.pythonhosted.org (o el
   navegador no tiene Web Workers / WebAssembly), leer() rechaza con un mensaje
   claro y la persona escribe los valores a mano, como siempre.
   ============================================================================ */
(function (raiz) {
  /* ===== 1. Configuración ===== */
  // window.LECTOR_PLANILLA_CONFIG puede cambiar las URL (p. ej. una copia local de Pyodide en una red cerrada).
  const CONFIG = Object.assign({
    pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/',
    pypdf: {
      url: 'https://files.pythonhosted.org/packages/3c/2c/c43c03eaf630435f023f1dc61ec4a4a78951ad5530a62c71cc89bde307b7/pypdf-6.19.0-py3-none-any.whl',
      sha256: '7e5d6e730e7dae87d560a2cee218b852f6498c8be61966f3cd02ead971e48d14',
    },
    codigo: 'py/leer_planilla.py',
    trabajador: 'js/lector-planilla-worker.js',
    tiempoCarga: 120000,     // la primera vez descarga ~10 MB (Pyodide + pypdf); luego queda en caché
    tiempoLectura: 45000,
    inactividad: 300000,     // Python ocupa ~100 MB: el worker se cierra tras 5 min sin uso (vuelve a abrir desde la caché)
  }, raiz.LECTOR_PLANILLA_CONFIG || {});
  // El worker resuelve las rutas relativas contra su propio archivo: se le mandan absolutas.
  const absoluta = (u) => new URL(u, document.baseURI).href;
  const error = (mensaje, code) => Object.assign(new Error(mensaje), { code });

  /* ===== 2. Worker ===== */
  let trabajador = null;
  let cargado = false;
  let cargando = null;
  let siguienteId = 1;
  let relojInactivo = null;
  const pendientes = new Map();
  const reiniciar = (motivo) => {
    clearTimeout(relojInactivo);
    if (trabajador) trabajador.terminate();
    trabajador = null; cargado = false; cargando = null;
    pendientes.forEach((p) => { clearTimeout(p.reloj); p.reject(motivo); });
    pendientes.clear();
  };
  const crear = () => {
    trabajador = new Worker(absoluta(CONFIG.trabajador));
    trabajador.onmessage = (e) => {
      const { id, ok, resultado, error: mensaje, codigo } = e.data || {};
      const p = pendientes.get(id);
      if (!p) return;
      pendientes.delete(id);
      clearTimeout(p.reloj);
      if (!pendientes.size) { clearTimeout(relojInactivo); relojInactivo = setTimeout(() => { if (!pendientes.size) reiniciar(error('Lector cerrado por inactividad', 'inactivo')); }, CONFIG.inactividad); }
      if (ok) p.resolve(resultado); else p.reject(error(mensaje || 'Error en el lector de planillas', codigo || 'lectura'));
    };
    trabajador.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); reiniciar(error('El lector de planillas no pudo iniciar', 'carga')); };
  };
  const pedir = (mensaje, ms, transferir) => new Promise((resolve, reject) => {
    clearTimeout(relojInactivo);
    if (!trabajador) crear();
    const id = siguienteId++;
    const reloj = setTimeout(() => {
      pendientes.delete(id);
      reiniciar(error('El lector de planillas tardó demasiado', 'tiempo'));
      reject(error('El lector de planillas tardó demasiado', 'tiempo'));
    }, ms);
    pendientes.set(id, { resolve, reject, reloj });
    trabajador.postMessage({ id, ...mensaje }, transferir || []);
  });
  const configWorker = () => ({ pyodide: absoluta(CONFIG.pyodide), pypdf: { url: absoluta(CONFIG.pypdf.url), sha256: CONFIG.pypdf.sha256 }, codigo: absoluta(CONFIG.codigo) });

  /* ===== 3. API ===== */
  const disponible = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
  // Carga Pyodide y pypdf sin leer nada: se llama al abrir el selector de archivos para ganar tiempo.
  const precargar = () => {
    if (!disponible()) return Promise.reject(error('Este navegador no puede leer la planilla', 'navegador'));
    if (cargado) return Promise.resolve();
    if (!cargando) {
      cargando = pedir({ tipo: 'cargar', config: configWorker() }, CONFIG.tiempoCarga)
        .then(() => { cargado = true; })
        .catch((e) => { cargando = null; throw e.code === 'tiempo' ? e : error(e.message, 'carga'); });
    }
    return cargando;
  };
  // pistas: { ibc, anio, mes } de la fila de la app (ayudan a escoger y a comparar). Devuelve el resultado
  // de py/leer_planilla.py: { ok, numeroPlanilla, fechaPago, salud, pension, arl, ..., avisos } o { ok: false, error }.
  const leer = async (archivo, pistas) => {
    await precargar();
    const datos = await archivo.arrayBuffer();
    return pedir({ tipo: 'leer', datos, pistas: pistas || {} }, CONFIG.tiempoLectura, [datos]);
  };
  const estado = () => (cargado ? 'listo' : cargando ? 'cargando' : 'sin-cargar');

  raiz.LectorPlanilla = { leer, precargar, estado, disponible, config: CONFIG };
})(window);
