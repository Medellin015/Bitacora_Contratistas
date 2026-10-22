'use strict';
/* ============================================================================
   lector-planilla-worker.js — Web Worker del lector de planillas (no va en
   index.html: lo crea js/lector-planilla.js con new Worker)
   Estructura:
     1. Carga (una sola vez): Pyodide, pypdf verificado con sha256 y el código
        de py/leer_planilla.py como módulo de Python
     2. Imagen para el OCR (JavaScript, sin Python): fondo parejo, página derecha
        y sin las líneas de las tablas, en PGM para Tesseract
     3. Mensajes: «cargar», «leer», «imagen» y «ocr». Si la planilla viene cifrada
        con AES, carga pycryptodome (del mismo CDN de Pyodide) y vuelve a leer.
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

/* ===== 2. Imagen para el OCR ===== */
// Tesseract lee mal una foto con sombra, una página torcida o las celdas de una tabla con bordes. La página
// dibujada (RGBA) se pasa a gris dividiendo cada píxel por el brillo del papel a su alrededor, se endereza
// y se le borran las líneas largas; sale en PGM (gris de 8 bits), que Tesseract lee sin más.
const BLOQUE = 16;
const aGris = (rgba, n) => {
  const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return g;
};
// Brillo del papel: el máximo de cada bloque de 16 px, extendido y suavizado con sus vecinos, en bilineal.
const fondoParejo = (g, ancho, alto) => {
  const W = Math.ceil(ancho / BLOQUE), H = Math.ceil(alto / BLOQUE);
  let b = new Float32Array(W * H);
  for (let y = 0; y < alto; y++) {
    const fila = ((y / BLOQUE) | 0) * W;
    for (let x = 0; x < ancho; x++) {
      const k = fila + ((x / BLOQUE) | 0);
      if (g[y * ancho + x] > b[k]) b[k] = g[y * ancho + x];
    }
  }
  const vecinos = (o, maximo) => {
    const d = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let a = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const v = o[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))];
            a = maximo ? Math.max(a, v) : a + v;
          }
        }
        d[y * W + x] = maximo ? a : a / 9;
      }
    }
    return d;
  };
  b = vecinos(vecinos(b, true), false);
  const salida = new Uint8ClampedArray(ancho * alto);
  for (let y = 0; y < alto; y++) {
    const fy = Math.min(H - 1, Math.max(0, (y + 0.5) / BLOQUE - 0.5)), y0 = fy | 0, y1 = Math.min(H - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < ancho; x++) {
      const fx = Math.min(W - 1, Math.max(0, (x + 0.5) / BLOQUE - 0.5)), x0 = fx | 0, x1 = Math.min(W - 1, x0 + 1), tx = fx - x0;
      const papel = (b[y0 * W + x0] * (1 - tx) + b[y0 * W + x1] * tx) * (1 - ty) + (b[y1 * W + x0] * (1 - tx) + b[y1 * W + x1] * tx) * ty;
      salida[y * ancho + x] = g[y * ancho + x] * 255 / Math.max(papel, 1);
    }
  }
  return salida;
};
const otsu = (g) => {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let suma = 0;
  for (let t = 0; t < 256; t++) suma += t * hist[t];
  let wb = 0, sb = 0, mejor = 0, umbral = 0;
  for (let t = 0; t < 256; t++) {
    wb += hist[t];
    if (!wb || wb === g.length) continue;
    sb += t * hist[t];
    const mb = sb / wb, mf = (suma - sb) / (g.length - wb), v = wb * (g.length - wb) * (mb - mf) ** 2;
    if (v > mejor) { mejor = v; umbral = t; }
  }
  return umbral;
};
// Inclinación (−6° a 6°): el ángulo con el que las filas de tinta se apilan mejor (proyección más marcada).
const inclinacion = (g, ancho, alto, umbral) => {
  const xs = [], ys = [];
  for (let y = 0; y < alto; y += 4) for (let x = 0; x < ancho; x += 4) if (g[y * ancho + x] <= umbral) { xs.push(x / 4); ys.push(y / 4); }
  if (xs.length < 50) return 0;
  const borde = Math.ceil(Math.hypot(ancho, alto) / 4) + 2;
  const hist = new Float64Array(2 * borde + 1);
  let mejor = -1, grados = 0;
  for (let d = -60; d <= 60; d++) {
    const t = (d / 10) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) hist[(ys[i] * c + xs[i] * s + borde) | 0]++;
    let puntaje = 0;
    for (let k = 0; k < hist.length; k++) puntaje += hist[k] * hist[k];
    if (puntaje > mejor) { mejor = puntaje; grados = d / 10; }
  }
  return grados;
};
// Gira la página en el sentido de las agujas del reloj (bilineal; lo que queda fuera, blanco).
const enderezar = (g, ancho, alto, grados) => {
  const t = grados * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const W = Math.ceil(Math.abs(ancho * c) + Math.abs(alto * s)), H = Math.ceil(Math.abs(ancho * s) + Math.abs(alto * c));
  const salida = new Uint8ClampedArray(W * H);
  const px = (x, y) => (x < 0 || y < 0 || x >= ancho || y >= alto ? 255 : g[y * ancho + x]);
  for (let Y = 0; Y < H; Y++) {
    const dy = Y + 0.5 - H / 2;
    for (let X = 0; X < W; X++) {
      const dx = X + 0.5 - W / 2;
      const sx = dx * c + dy * s + ancho / 2 - 0.5, sy = -dx * s + dy * c + alto / 2 - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
      salida[Y * W + X] = (px(x0, y0) * (1 - tx) + px(x0 + 1, y0) * tx) * (1 - ty) + (px(x0, y0 + 1) * (1 - tx) + px(x0 + 1, y0 + 1) * tx) * ty;
    }
  }
  return { g: salida, ancho: W, alto: H };
};
// Tramos de tinta de al menos `largo` píxeles seguidos (horizontales y verticales), con un píxel de margen.
const borrarLineas = (g, ancho, alto, umbral, largo) => {
  const linea = new Uint8Array(ancho * alto);
  for (let y = 0; y < alto; y++) {
    let ini = -1;
    for (let x = 0; x <= ancho; x++) {
      const tinta = x < ancho && g[y * ancho + x] <= umbral;
      if (tinta && ini < 0) ini = x;
      else if (!tinta && ini >= 0) { if (x - ini >= largo) linea.fill(1, y * ancho + ini, y * ancho + x); ini = -1; }
    }
  }
  for (let x = 0; x < ancho; x++) {
    let ini = -1;
    for (let y = 0; y <= alto; y++) {
      const tinta = y < alto && g[y * ancho + x] <= umbral;
      if (tinta && ini < 0) ini = y;
      else if (!tinta && ini >= 0) { if (y - ini >= largo) for (let k = ini; k < y; k++) linea[k * ancho + x] = 1; ini = -1; }
    }
  }
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      if (linea[i] || (x > 0 && linea[i - 1]) || (x + 1 < ancho && linea[i + 1]) || (y > 0 && linea[i - ancho]) || (y + 1 < alto && linea[i + ancho])) g[i] = 255;
    }
  }
};
const prepararImagen = ({ rgba, ancho, alto, dpi }) => {
  let g = fondoParejo(aGris(new Uint8ClampedArray(rgba), ancho * alto), ancho, alto);
  const grados = inclinacion(g, ancho, alto, otsu(g));
  if (Math.abs(grados) >= 0.1) ({ g, ancho, alto } = enderezar(g, ancho, alto, grados));
  borrarLineas(g, ancho, alto, otsu(g), Math.round(dpi * 0.4));
  const cabecera = new TextEncoder().encode(`P5\n${ancho} ${alto}\n255\n`);
  const pgm = new Uint8Array(cabecera.length + g.length);
  pgm.set(cabecera);
  pgm.set(g, cabecera.length);
  return { pgm: pgm.buffer, grados };
};

/* ===== 3. Mensajes ===== */
self.onmessage = async (e) => {
  const { id, tipo, config, datos, pistas } = e.data || {};
  try {
    if (tipo === 'cargar') { await preparar(config); self.postMessage({ id, ok: true }); return; }
    if (tipo === 'imagen') { const resultado = prepararImagen(e.data); self.postMessage({ id, ok: true, resultado }, [resultado.pgm]); return; }
    if (!listo) throw Object.assign(new Error('El lector de planillas no está cargado'), { codigo: 'carga' });
    const { py, modulo } = await listo;
    if (tipo === 'ocr') {
      self.postMessage({ id, ok: true, resultado: JSON.parse(modulo.leer_ocr_json(JSON.stringify(e.data.paginas || []), JSON.stringify(pistas || {}))) });
      return;
    }
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
