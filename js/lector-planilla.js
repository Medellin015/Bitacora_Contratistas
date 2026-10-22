'use strict';
/* ============================================================================
   7b) lector-planilla.js — lee la planilla de seguridad social (PDF) con Python
       en el navegador: Pyodide (CPython compilado a WebAssembly) y pypdf dentro
       de un Web Worker, con el código de py/leer_planilla.py. El PDF no sale
       del equipo de la persona: no hay servidor de por medio.
   Estructura:
     1. Configuración: versiones fijas (Pyodide 0.29.5 · pypdf 6.19.0 con sha256 ·
        PDF.js 6.4.299 · Tesseract.js 7.0.0 con el idioma español)
     2. Worker: se crea en el primer uso, se reutiliza y se reinicia si se cuelga
     3. OCR de planillas escaneadas: PDF.js dibuja la página, el worker la limpia,
        Tesseract.js reconoce el texto y Python comprueba los valores
     4. API: LectorPlanilla.leer(archivo, pistas, alAvanzar, senal) · precargar() · estado()
   Plan B: si la red bloquea cdn.jsdelivr.net o files.pythonhosted.org (o el
   navegador no tiene Web Workers / WebAssembly), leer() rechaza con un mensaje
   claro y la persona escribe los valores a mano, como siempre.
   ============================================================================ */
(function (raiz) {
  /* ===== 1. Configuración ===== */
  // window.LECTOR_PLANILLA_CONFIG puede cambiar las URL (p. ej. una copia local de Pyodide en una red cerrada)
  // y apagar el OCR con { ocr: false }.
  const PROPIA = raiz.LECTOR_PLANILLA_CONFIG || {};
  const OCR_DEFAULT = {
    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/',               // legacy/build (navegadores no tan nuevos), cmaps, fuentes y wasm
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/',      // tesseract.min.js (con su sha384) y worker.min.js
    integridad: 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM',
    nucleo: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/',
    idioma: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int',
    cache: 'lector-planilla-spa-1.0.0',    // nombre del idioma guardado en el navegador (IndexedDB)
    paginas: 2,                            // los datos de la planilla están en la primera; la segunda por si acaso
    dpi: 300,
    maxPixeles: 12e6,                      // una página enorme se dibuja más pequeña (memoria)
    tiempo: 240000,                        // la primera vez descarga ~8 MB (PDF.js, Tesseract y el español)
  };
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
  }, PROPIA);
  CONFIG.ocr = PROPIA.ocr === false ? false : Object.assign({}, OCR_DEFAULT, PROPIA.ocr || {});
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

  /* ===== 3. OCR de planillas escaneadas ===== */
  // Solo se descarga cuando llega un PDF sin texto: PDF.js (módulo) y Tesseract.js (script con su sha384, que
  // crea su propio worker con el núcleo en WebAssembly y el modelo del español).
  let pdfjs = null;
  let tesseract = null;
  let colaOcr = Promise.resolve();
  const cargarPdfjs = () => {
    if (!pdfjs) {
      const base = absoluta(CONFIG.ocr.pdfjs);
      pdfjs = import(`${base}legacy/build/pdf.min.mjs`)
        .then((m) => { m.GlobalWorkerOptions.workerSrc = `${base}legacy/build/pdf.worker.min.mjs`; return m; })
        .catch((e) => { pdfjs = null; throw error(`No se pudo cargar PDF.js: ${e.message}`, 'ocr-carga'); });
    }
    return pdfjs;
  };
  const cargarTesseract = () => {
    if (!tesseract) {
      tesseract = new Promise((resolve, reject) => {
        if (raiz.Tesseract) { resolve(raiz.Tesseract); return; }
        const s = document.createElement('script');
        s.src = absoluta(`${CONFIG.ocr.tesseract}tesseract.min.js`);
        if (CONFIG.ocr.integridad) { s.integrity = CONFIG.ocr.integridad; s.crossOrigin = 'anonymous'; }
        s.onload = () => (raiz.Tesseract ? resolve(raiz.Tesseract) : reject(new Error('el script no definió Tesseract')));
        s.onerror = () => { s.remove(); reject(new Error(`no se pudo descargar ${s.src}`)); };
        document.head.appendChild(s);
      }).catch((e) => { tesseract = null; throw error(`No se pudo cargar Tesseract.js: ${e.message}`, 'ocr-carga'); });
    }
    return tesseract;
  };
  // Dibuja la página a ~300 ppp (menos si es enorme) y devuelve sus píxeles RGBA.
  const dibujar = async (pagina) => {
    const v1 = pagina.getViewport({ scale: 1 });
    const escala = Math.min(CONFIG.ocr.dpi / 72, Math.sqrt(CONFIG.ocr.maxPixeles / (v1.width * v1.height)));
    const vista = pagina.getViewport({ scale: escala });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.floor(vista.width);
    lienzo.height = Math.floor(vista.height);
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    await pagina.render({ canvasContext: ctx, canvas: lienzo, viewport: vista, background: '#ffffff' }).promise;
    const { data } = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const imagen = { rgba: data.buffer, ancho: lienzo.width, alto: lienzo.height, dpi: escala * 72 };
    lienzo.width = 0;
    lienzo.height = 0;
    return imagen;
  };
  // El OCR a veces cambia o corta un dígito de un número largo (el de la planilla, un documento) sin dudarlo.
  // Cada uno se recorta y se vuelve a leer como una sola línea: si la segunda lectura no dice lo mismo, se
  // tacha («■■■■■■■■») y Python no lo usa. Los montos no hacen falta: se comprueban con las tarifas.
  const NUMERO_LARGO = /(^|[^\d$])(\d{6,12})(?!\d)/;   // sin «lookbehind»: Safari anterior a 16.4 no lo entiende
  const recortarPgm = (pgm, x, y, an, al) => {
    const c = new TextDecoder('latin1').decode(pgm.subarray(0, 32)).match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
    const W = Number(c[1]), H = Number(c[2]), inicio = c[0].length;
    x = Math.min(Math.max(0, Math.round(x)), W - 1); y = Math.min(Math.max(0, Math.round(y)), H - 1);
    an = Math.max(1, Math.min(Math.round(an), W - x)); al = Math.max(1, Math.min(Math.round(al), H - y));
    const cabecera = new TextEncoder().encode(`P5\n${an} ${al}\n255\n`);
    const salida = new Uint8Array(cabecera.length + an * al);
    salida.set(cabecera);
    for (let f = 0; f < al; f++) salida.set(pgm.subarray(inicio + (y + f) * W + x, inicio + (y + f) * W + x + an), cabecera.length + f * an);
    return salida;
  };
  const confirmarNumeros = async (ocrWorker, pgm, tsv, unaLinea) => {
    const filas = tsv.split('\n');
    let releidas = 0;
    for (let i = 0; i < filas.length; i++) {
      const c = filas[i].split('\t');
      const m = c[0] === '5' && c.length >= 12 ? c[11].match(NUMERO_LARGO) : null;
      if (!m) continue;
      const [x, y, an, al] = c.slice(6, 10).map(Number);
      let igual = false;
      if (releidas++ < 20) {   // si una página trae más números largos, los demás quedan sin confirmar (tachados)
        try {
          const { data } = await ocrWorker.recognize(recortarPgm(pgm, x - al, y - al / 2, an * 1.6 + 2 * al, al * 2), { tessedit_pageseg_mode: unaLinea }, { text: true });
          igual = new RegExp(`(^|\\D)${m[2]}(?!\\d)`).test((data && data.text) || '');
        } catch (e) { /* sin segunda lectura no hay confirmación */ }
      }
      if (!igual) {
        c[11] = c[11].replace(/\d/g, '■');
        filas[i] = c.join('\t');
      }
    }
    return filas.join('\n');
  };
  const ocr = async (archivo, pistas, alAvanzar, senal) => {
    const o = CONFIG.ocr;
    let tareaPdf = null;
    let ocrWorker = null;
    let cancelado = false;
    let reloj;
    const avisar = (x) => { if (!cancelado) alAvanzar(x); };
    // Tesseract (~100 MB) y el documento de PDF.js se cierran siempre, también si se crean después de un error.
    const cerrar = () => {
      if (ocrWorker) { ocrWorker.terminate().catch(() => {}); ocrWorker = null; }
      if (tareaPdf) { tareaPdf.destroy().catch(() => {}); tareaPdf = null; }
    };
    const trabajo = (async () => {
      avisar({ fase: 'ocr-carga' });
      const [pdf, T] = await Promise.all([cargarPdfjs(), cargarTesseract()]);
      if (cancelado) return null;
      // Tesseract.js 7 no rechaza createWorker si falla la descarga del idioma (se queda esperando): el modelo se
      // pide antes aquí (así queda en la caché del navegador para Tesseract) y cualquier error suyo corta la espera.
      const idioma = absoluta(o.idioma).replace(/\/$/, '');
      await fetch(`${idioma}/spa.traineddata.gz`, { cache: 'force-cache' })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .catch((e) => { throw error(`No se pudo descargar el modelo del español: ${e.message}`, 'ocr-carga'); });
      if (cancelado) return null;
      let pagina = 0;
      let paginas = 1;
      let releyendo = false;   // las relecturas de números no mueven la barra de avance
      let fallaTesseract;
      const falla = new Promise((resolve, reject) => { fallaTesseract = reject; });
      const creando = T.createWorker('spa', T.OEM.LSTM_ONLY, {
        workerPath: absoluta(`${o.tesseract}worker.min.js`), corePath: absoluta(o.nucleo), langPath: idioma, cachePath: o.cache,
        logger: (m) => { if (m && m.status === 'recognizing text' && pagina && !releyendo) avisar({ fase: 'ocr', pagina, paginas, progreso: m.progress }); },
        errorHandler: (e) => fallaTesseract(e),
      });
      creando.then((w) => { if (cancelado) w.terminate().catch(() => {}); }, () => {});   // si llega tarde, se cierra
      try {
        ocrWorker = await Promise.race([creando, falla]);
      } catch (e) {
        throw error(`No se pudo iniciar el reconocimiento de texto: ${(e && e.message) || e}`, 'ocr-carga');
      }
      if (cancelado) return null;
      // Texto disperso: una tabla con celdas, no párrafos (con las palabras y su posición Python arma las filas).
      // Los mensajes de diagnóstico de Tesseract («Estimating resolution…») no van a la consola.
      await ocrWorker.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT, debug_file: '/dev/null' });
      const base = absoluta(o.pdfjs);
      tareaPdf = pdf.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()), cMapUrl: `${base}cmaps/`, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`, iccUrl: `${base}iccs/`, isEvalSupported: false });
      const doc = await tareaPdf.promise;
      paginas = Math.min(doc.numPages, o.paginas);
      const leidas = [];
      for (let n = 1; n <= paginas && !cancelado; n++) {
        pagina = n;
        avisar({ fase: 'ocr', pagina, paginas, progreso: 0 });
        const imagen = await dibujar(await doc.getPage(n));
        const pgm = new Uint8Array((await pedir({ tipo: 'imagen', ...imagen }, 60000, [imagen.rgba])).pgm);
        // Sin rotateAuto: el worker ya enderezó la página, y las cajas deben ser las de esta imagen para releer.
        const { data } = await ocrWorker.recognize(pgm, {}, { text: false, tsv: true });
        releyendo = true;
        leidas.push({ tsv: await confirmarNumeros(ocrWorker, pgm, data.tsv || '', T.PSM.SINGLE_LINE) });
        releyendo = false;
      }
      if (cancelado) return null;
      cerrar();
      avisar({ fase: 'ocr-analisis' });
      await precargar();   // por si el worker de Python se cerró mientras tanto
      return pedir({ tipo: 'ocr', paginas: leidas, pistas: pistas || {} }, CONFIG.tiempoLectura);
    })();
    const limite = new Promise((resolve, reject) => { reloj = setTimeout(() => reject(error('El reconocimiento de texto tardó demasiado', 'ocr-tiempo')), o.tiempo); });
    const cancelada = new Promise((resolve, reject) => {
      const abortar = () => reject(error('Lectura cancelada', 'cancelada'));
      if (senal && senal.aborted) abortar();
      else if (senal) senal.addEventListener('abort', abortar, { once: true });
    });
    try {
      return await Promise.race([trabajo, limite, cancelada]);
    } catch (e) {
      throw e && typeof e.code === 'string' ? e : error(`No se pudo leer la planilla escaneada: ${(e && e.message) || e}`, 'ocr');
    } finally {
      cancelado = true;
      clearTimeout(reloj);
      cerrar();
      trabajo.then(cerrar, cerrar);   // lo que termine de crearse después del límite de tiempo también se cierra
    }
  };
  // Una planilla escaneada a la vez: cada OCR ocupa bastante memoria. La que se cancela mientras espera no corre.
  const leerConOcr = (archivo, pistas, alAvanzar, senal) => {
    const avisar = (x) => { try { if (alAvanzar) alAvanzar(x); } catch (e) { /* la interfaz no tumba la lectura */ } };
    const tarea = colaOcr.then(() => (senal && senal.aborted ? Promise.reject(error('Lectura cancelada', 'cancelada')) : ocr(archivo, pistas, avisar, senal)));
    colaOcr = tarea.catch(() => {});
    return tarea;
  };

  /* ===== 4. API ===== */
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
  // pistas: { ibc, anio, mes } de la fila de la app (ayudan a escoger y a comparar). alAvanzar (opcional) recibe
  // { fase: 'ocr-carga' | 'ocr' | 'ocr-analisis', pagina, paginas, progreso } si la planilla va por OCR, y
  // senal (opcional, un AbortSignal) cancela el OCR: leer() rechaza con el código 'cancelada'.
  // Devuelve el resultado de py/leer_planilla.py: { ok, numeroPlanilla, fechaPago, salud, pension, arl, ...,
  // avisos, ocr } o { ok: false, error }.
  const leer = async (archivo, pistas, alAvanzar, senal) => {
    await precargar();
    const datos = await archivo.arrayBuffer();
    const r = await pedir({ tipo: 'leer', datos, pistas: pistas || {} }, CONFIG.tiempoLectura, [datos]);
    // Sin texto (escaneada) o con una capa de texto que no sirve sobre una imagen: se lee con OCR.
    const escaneada = r && !r.ok && (r.error === 'sin-texto' || (r.error === 'sin-datos' && r.escaneada));
    return escaneada && CONFIG.ocr ? leerConOcr(archivo, pistas, alAvanzar, senal) : r;
  };
  const estado = () => (cargado ? 'listo' : cargando ? 'cargando' : 'sin-cargar');

  raiz.LectorPlanilla = { leer, precargar, estado, disponible, config: CONFIG };
})(window);
