'use strict';
/* ============================================================================
   2) util.js — utilidades compartidas (window.U)
   Estructura:
     1. Constantes (meses, zona horaria, estados, roles)
     2. Fechas: Bogotá, ISO 'AAAA-MM-DD', períodos, plazos, prorrateo
     3. Números y moneda es-CO · numeroALetras
     4. Texto: sanear HTML, escapar, correos, nombres de archivo, slugs
     5. Archivos y descargas
     6. Objetos: clonar, comparar, rutas, diferencias
     7. Varios: debounce, tiempo relativo, cuenta regresiva, ventanas
   ============================================================================ */
(function (raiz) {

  /* ===== 1. Constantes ===== */
  const ZONA = 'America/Bogota';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ESTADOS = {
    enviado:          { etiqueta: 'Enviado',              chip: 'info' },
    en_revision:      { etiqueta: 'En revisión',          chip: 'primario' },
    aprobado_revisor: { etiqueta: 'Aprobado por revisor', chip: 'exito' },
    aprobado:         { etiqueta: 'Aprobado',             chip: 'exito' },
    en_correccion:    { etiqueta: 'En corrección',        chip: 'alerta' },
    reenviado:        { etiqueta: 'Reenviado',            chip: 'info' },
  };
  const ESTADOS_SOLICITUD = {
    pendiente:  { etiqueta: 'Pendiente',  chip: 'alerta' },
    aprobada:   { etiqueta: 'Aprobada',   chip: 'exito' },
    rechazada:  { etiqueta: 'Rechazada',  chip: 'error' },
    finalizada: { etiqueta: 'Finalizada', chip: 'neutro' },
  };
  const ROLES = { contratista: 'Contratista', revisor: 'Revisor', coordinador: 'Coordinador', admin: 'Administrador' };
  const TIPOS_SOLICITUD = { correccion: 'Corrección de envío', actualizacion_info: 'Actualización de información del contrato' };
  const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  // instanceof falla entre contextos (p. ej. pruebas en Node); se compara por etiqueta.
  const esFecha = (x) => x instanceof Date || Object.prototype.toString.call(x) === '[object Date]';

  /* ===== 2. Fechas ===== */
  // Partes de un Date en hora de Bogotá, sin depender de la zona del dispositivo.
  const partesBogota = (fecha) => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(fecha);
    const o = {};
    f.forEach((p) => { o[p.type] = p.value; });
    return { a: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second };
  };
  const dosDigitos = (n) => String(n).padStart(2, '0');
  const partesISO = (iso) => {
    const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
    return { a, m, d };
  };
  const esISO = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const isoDePartes = (a, m, d) => `${a}-${dosDigitos(m)}-${dosDigitos(d)}`;
  const isoDeDate = (fecha) => { const p = partesBogota(fecha); return isoDePartes(p.a, p.m, p.d); };
  const hoyISO = () => isoDeDate(new Date());
  // Nunca new Date('AAAA-MM-DD'): en UTC-5 corre el día.
  const dateLocal = (iso) => { const { a, m, d } = partesISO(iso); return new Date(a, m - 1, d); };
  const diasDelMes = (a, m) => new Date(a, m, 0).getDate();
  const sumarDias = (iso, n) => {
    const { a, m, d } = partesISO(iso);
    const f = new Date(a, m - 1, d + n);
    return isoDePartes(f.getFullYear(), f.getMonth() + 1, f.getDate());
  };
  const diasEntre = (desde, hasta) => Math.round((dateLocal(hasta) - dateLocal(desde)) / 86400000) + 1;
  const fechaCorta = (x) => {
    if (!x) return '';
    if (esFecha(x)) { const p = partesBogota(x); return `${dosDigitos(p.d)}/${dosDigitos(p.m)}/${p.a}`; }
    if (esISO(x)) { const { a, m, d } = partesISO(x); return `${dosDigitos(d)}/${dosDigitos(m)}/${a}`; }
    return String(x);
  };
  const hora = (fecha) => { const p = partesBogota(fecha); return `${dosDigitos(p.h)}:${dosDigitos(p.mi)}`; };
  const fechaHora = (fecha) => (esFecha(fecha) && !isNaN(fecha) ? `${fechaCorta(fecha)} ${hora(fecha)}` : '');
  const fechaLarga = (iso) => { const { a, m, d } = partesISO(iso); return `${d} de ${MESES[m - 1]} de ${a}`; };
  const fechaHoraLarga = (fecha) => { const p = partesBogota(fecha); return `${p.d} de ${MESES[p.m - 1]} de ${p.a} a las ${dosDigitos(p.h)}:${dosDigitos(p.mi)}`; };
  const textoPeriodo = (desde, hasta) => {
    const x = partesISO(desde), y = partesISO(hasta);
    const ini = x.a === y.a ? `${x.d} de ${MESES[x.m - 1]}` : fechaLarga(desde);
    return `Del ${ini} al ${fechaLarga(hasta)}`;
  };

  // Períodos 'AAAA-MM'
  const periodoDe = (iso) => String(iso).slice(0, 7);
  const periodoActual = () => periodoDe(hoyISO());
  const desplazarPeriodo = (p, n) => {
    const [a, m] = p.split('-').map(Number);
    const f = new Date(a, m - 1 + n, 1);
    return `${f.getFullYear()}-${dosDigitos(f.getMonth() + 1)}`;
  };
  const periodoAnterior = (p) => desplazarPeriodo(p, -1);
  const periodoSiguiente = (p) => desplazarPeriodo(p, 1);
  const nombrePeriodo = (p) => { if (!p) return ''; const [a, m] = p.split('-').map(Number); return `${capitalizar(MESES[m - 1])} ${a}`; };
  const rangoPeriodo = (p) => { const [a, m] = p.split('-').map(Number); return { desde: isoDePartes(a, m, 1), hasta: isoDePartes(a, m, diasDelMes(a, m)) }; };
  const listaPeriodos = (desdeP, hastaP) => { const r = []; let p = desdeP; while (p <= hastaP) { r.push(p); p = periodoSiguiente(p); } return r; };

  // Fecha fin efectiva: la del contrato o la mayor de las ampliaciones.
  const fechaFinContrato = (contrato) => {
    const info = (contrato && contrato.info) || {};
    let fin = (info.contrato && info.contrato.fechaFin) || '';
    ((info.modificaciones && info.modificaciones.ampliaciones) || []).forEach((x) => {
      if (x && esISO(x.nuevaFechaFin) && x.nuevaFechaFin > fin) fin = x.nuevaFechaFin;
    });
    return esISO(fin) ? fin : '';
  };
  const fechaInicioContrato = (contrato) => {
    const v = contrato && contrato.info && contrato.info.contrato && contrato.info.contrato.fechaInicio;
    return esISO(v) ? v : '';
  };
  // Mes calendario recortado a las fechas del contrato. null si no se cruzan.
  const recortarPeriodo = (p, contrato) => {
    const r = rangoPeriodo(p);
    const ini = fechaInicioContrato(contrato), fin = fechaFinContrato(contrato);
    let desde = r.desde, hasta = r.hasta;
    if (ini && ini > desde) desde = ini;
    if (fin && fin < hasta) hasta = fin;
    if (desde > hasta) return null;
    return { desde, hasta, parcial: desde !== r.desde || hasta !== r.hasta };
  };
  // Plazos: el día elegido termina a las 23:59:59 de Bogotá (04:59:59 UTC del día siguiente).
  const finDeDiaBogota = (iso) => { const { a, m, d } = partesISO(iso); return new Date(Date.UTC(a, m - 1, d, 23 + 5, 59, 59)); };
  const inicioDeDiaBogota = (iso) => { const { a, m, d } = partesISO(iso); return new Date(Date.UTC(a, m - 1, d, 5, 0, 0)); };
  // <input type="datetime-local"> interpretado en hora de Bogotá, y viceversa.
  const dateDeLocal = (valor) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(valor || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 5, +m[5], 0));
  };
  const localDeDate = (fecha) => {
    if (!esFecha(fecha) || isNaN(fecha)) return '';
    const p = partesBogota(fecha);
    return `${p.a}-${dosDigitos(p.m)}-${dosDigitos(p.d)}T${dosDigitos(p.h)}:${dosDigitos(p.mi)}`;
  };
  // Días con convención comercial (mes = 30): mes completo 30 (incluido febrero),
  // mes de inicio 30 − día + 1, mes final = día de fin (máx. 30).
  const diasComercial30 = (desde, hasta) => {
    if (!esISO(desde) || !esISO(hasta) || desde > hasta) return 0;
    let total = 0;
    let p = periodoDe(desde);
    const pFin = periodoDe(hasta);
    while (p <= pFin) {
      const [a, m] = p.split('-').map(Number);
      const ultimo = diasDelMes(a, m);
      const d1 = p === periodoDe(desde) ? partesISO(desde).d : 1;
      const dHasta = p === pFin ? partesISO(hasta).d : ultimo;
      const d2 = dHasta === ultimo ? 30 : Math.min(dHasta, 30);
      total += Math.max(0, d2 - Math.min(d1, 30) + 1);
      p = periodoSiguiente(p);
    }
    return total;
  };
  const prorratear = (honorarios, desde, hasta, convencion = 'comercial30') => {
    const h = Number(honorarios) || 0;
    if (convencion === 'calendario') {
      // Proporción por mes calendario real (días del período / días del mes).
      let valor = 0, dias = 0;
      let p = periodoDe(desde);
      while (p <= periodoDe(hasta)) {
        const r = rangoPeriodo(p);
        const a = desde > r.desde ? desde : r.desde, b = hasta < r.hasta ? hasta : r.hasta;
        const n = diasEntre(a, b);
        dias += n;
        valor += h * n / diasEntre(r.desde, r.hasta);
        p = periodoSiguiente(p);
      }
      return { dias, valor: Math.round(valor) };
    }
    const dias = diasComercial30(desde, hasta);
    return { dias, valor: Math.round(h * dias / 30) };
  };

  /* ===== 3. Números y moneda ===== */
  const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const formatoCOP = (n) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '' : fmtCOP.format(Number(n)));
  const formatoNumero = (n, dec = 0) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? ''
    : new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(n)));
  const formatoPorcentaje = (n, dec = 1) => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? ''
    : `${new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(Number(n))} %`);
  // Acepta "1.234.567,89" (es-CO) y "1234567.89"; devuelve número o null.
  const parseNumero = (texto) => {
    if (typeof texto === 'number') return isNaN(texto) ? null : texto;
    let s = String(texto == null ? '' : texto).trim().replace(/[$\s]/g, '');
    if (s === '' || s === '-') return null;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');      // 2.000.000 · 1.234,5 (es-CO)
    else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');                          // 1234,5
    else if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    const n = Number(s);
    return isNaN(n) ? null : n;
  };
  const redondear = (x, n = 0) => { const f = Math.pow(10, n); return Math.round((Number(x) + Number.EPSILON) * f) / f; };

  // Número entero → letras (es-CO), MAYÚSCULAS + "PESOS M/CTE".
  const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE',
    'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS',
    'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const menorQueMil = (n) => {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100), r = n % 100;
    let s = CENTENAS[c];
    if (r > 0) {
      if (r < 30) s += (s ? ' ' : '') + UNIDADES[r];
      else { const d = Math.floor(r / 10), u = r % 10; s += (s ? ' ' : '') + DECENAS[d] + (u ? ' Y ' + UNIDADES[u] : ''); }
    }
    return s;
  };
  const enteroALetras = (n) => {
    if (n === 0) return 'CERO';
    const millones = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000;
    const partes = [];
    if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${enteroALetras(millones)} MILLONES`);
    if (miles) partes.push(miles === 1 ? 'MIL' : `${menorQueMil(miles)} MIL`);
    if (resto) partes.push(menorQueMil(resto));
    return partes.join(' ');
  };
  const numeroALetras = (valor) => {
    const n = Math.floor(Math.abs(Number(valor) || 0));
    if (n === 0) return 'CERO PESOS M/CTE';
    let letras = enteroALetras(n);
    // "UN MILLÓN DE PESOS" / "DOS MILLONES DE PESOS" cuando es múltiplo exacto de millón.
    if (n % 1000000 === 0) letras += ' DE';
    const moneda = n === 1 ? 'PESO' : 'PESOS';
    return `${letras} ${moneda} M/CTE`;
  };

  /* ===== 4. Texto ===== */
  const escaparHTML = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ETIQUETAS_PERMITIDAS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'H3', 'H4', 'SMALL']);
  // Lista blanca: los avisos y plantillas los escribe el admin, pero igual se limpian.
  const sanitizarHTML = (html) => {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const limpiar = (nodo) => {
      Array.from(nodo.childNodes).forEach((hijo) => {
        if (hijo.nodeType === 3) return;
        if (hijo.nodeType !== 1) { hijo.remove(); return; }
        if (!ETIQUETAS_PERMITIDAS.has(hijo.tagName)) {
          // Se conserva el texto interior; la etiqueta desaparece.
          limpiar(hijo);
          while (hijo.firstChild) nodo.insertBefore(hijo.firstChild, hijo);
          hijo.remove();
          return;
        }
        Array.from(hijo.attributes).forEach((at) => {
          const ok = hijo.tagName === 'A' && at.name === 'href' && /^(https?:|mailto:)/i.test(at.value.trim());
          if (!ok) hijo.removeAttribute(at.name);
        });
        if (hijo.tagName === 'A') { hijo.setAttribute('target', '_blank'); hijo.setAttribute('rel', 'noopener noreferrer'); }
        limpiar(hijo);
      });
    };
    const raizDoc = doc.body.firstChild;
    limpiar(raizDoc);
    return raizDoc.innerHTML;
  };
  const normalizarCorreo = (c) => String(c || '').trim().toLowerCase();
  const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
  const sanearNombreArchivo = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();
  const esURL = (s) => /^https?:\/\/[^\s]+$/i.test(String(s || '').trim());
  const esCorreo = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  const esTelefono = (s) => /^[\d\s()+-]{7,20}$/.test(String(s || '').trim());
  // Quita tildes y diéresis: NFD separa la marca diacrítica (U+0300–U+036F) y se elimina.
  const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // IDs de documento: sin '_' (separa las partes de los IDs de envíos) ni espacios.
  const slug = (s) => sinTildes(s).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
  const limitar = (s, n) => { s = String(s || ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const nombreCorto = (nombres, apellidos) => `${String(nombres || '').trim().split(/\s+/)[0] || ''} ${String(apellidos || '').trim().split(/\s+/)[0] || ''}`.trim();
  const iniciales = (nombre) => String(nombre || '').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
  const plural = (n, uno, varios) => (Number(n) === 1 ? uno : varios);
  const reemplazarVariables = (plantilla, variables) => String(plantilla || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (variables[k] != null ? String(variables[k]) : ''));

  /* ===== 5. Archivos y descargas ===== */
  const descargarBlob = (blob, nombre) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  };
  // Con BOM (U+FEFF) para que Excel abra el CSV como UTF-8 y respete las tildes.
  const descargarTexto = (texto, nombre, tipo = 'text/plain;charset=utf-8') => descargarBlob(new Blob(['\uFEFF' + texto], { type: tipo }), nombre);
  const leerArchivoDataURL = (archivo) => new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error || new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(archivo);
  });
  const leerArchivoBase64 = async (archivo) => (await leerArchivoDataURL(archivo)).split(',')[1] || '';
  const leerArchivoArrayBuffer = (archivo) => new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error || new Error('No se pudo leer el archivo'));
    lector.readAsArrayBuffer(archivo);
  });
  const uint8DeBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const base64DeArrayBuffer = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const tamanoLegible = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  };
  const extension = (nombre) => { const m = /\.([a-z0-9]+)$/i.exec(String(nombre || '')); return m ? `.${m[1].toLowerCase()}` : ''; };

  /* ===== 6. Objetos ===== */
  const clonar = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const igualProfundo = (a, b) => {
    if (a === b) return true;
    if (esFecha(a) && esFecha(b)) return a.getTime() === b.getTime();
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => igualProfundo(a[k], b[k]));
  };
  const obtenerRuta = (obj, ruta) => String(ruta || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const ponerRuta = (obj, ruta, valor) => {
    const partes = String(ruta).split('.');
    let o = obj;
    partes.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    o[partes[partes.length - 1]] = valor;
    return obj;
  };
  // {a:{b:1}} → {'a.b': 1}; los arreglos se dejan completos (se comparan como un valor).
  const aplanar = (obj, prefijo = '', salida = {}) => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || esFecha(obj)) { salida[prefijo] = obj; return salida; }
    Object.keys(obj).forEach((k) => aplanar(obj[k], prefijo ? `${prefijo}.${k}` : k, salida));
    return salida;
  };
  const diferencias = (antes, despues) => {
    const a = aplanar(antes || {}), b = aplanar(despues || {});
    const campos = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => {
      if (!igualProfundo(a[k] === undefined ? null : a[k], b[k] === undefined ? null : b[k])) campos[k] = { antes: a[k] === undefined ? null : a[k], despues: b[k] === undefined ? null : b[k] };
    });
    return campos;
  };
  const sinIndefinidos = (obj) => {
    if (Array.isArray(obj)) return obj.map(sinIndefinidos);
    if (obj && typeof obj === 'object' && !esFecha(obj)) {
      const r = {};
      Object.keys(obj).forEach((k) => { if (obj[k] !== undefined) r[k] = sinIndefinidos(obj[k]); });
      return r;
    }
    return obj;
  };
  const ordenarPor = (arr, fn, dir = 'asc') => [...arr].sort((x, y) => {
    const a = fn(x), b = fn(y);
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return (a < b ? -1 : 1) * (dir === 'desc' ? -1 : 1);
  });
  const agrupar = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); (acc[k] = acc[k] || []).push(x); return acc; }, {});
  const unicos = (arr) => Array.from(new Set(arr));

  /* ===== 7. Varios ===== */
  const debounce = (fn, ms) => { let t; const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; d.cancelar = () => clearTimeout(t); return d; };
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const idAleatorio = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36));
  const tiempoRelativo = (fecha) => {
    if (!esFecha(fecha) || isNaN(fecha)) return '';
    const s = Math.max(0, Math.round((Date.now() - fecha.getTime()) / 1000));
    if (s < 60) return `hace ${s} s`;
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    return `hace ${Math.floor(s / 86400)} d`;
  };
  const cuentaRegresiva = (ms) => {
    const t = Math.max(0, ms);
    const d = Math.floor(t / 86400000), h = Math.floor((t % 86400000) / 3600000), mi = Math.floor((t % 3600000) / 60000);
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${mi} min`;
    return `${mi} min`;
  };
  // Estado de la ventana para un formulario en un instante dado.
  const estadoVentana = (ventana, formularioId, ahora = new Date()) => {
    if (!ventana || !esFecha(ventana.desde) || !esFecha(ventana.hasta)) return { estado: 'sin_ventana' };
    const incluye = !formularioId || (ventana.formularios || []).includes(formularioId);
    if (!incluye) return { estado: 'no_incluido' };
    if (ahora < ventana.desde) return { estado: 'por_abrir', faltan: ventana.desde - ahora };
    if (ahora > ventana.hasta) return { estado: 'cerrada', hace: ahora - ventana.hasta };
    return { estado: 'abierta', faltan: ventana.hasta - ahora };
  };
  const textoVentana = (v) => (v && esFecha(v.desde) && esFecha(v.hasta)
    ? `desde el ${fechaHoraLarga(v.desde)} hasta el ${fechaHoraLarga(v.hasta)}` : '');
  const esMovil = () => window.matchMedia('(max-width: 767px)').matches;
  const valorLegible = (valor) => {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (esFecha(valor)) return fechaHora(valor);
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (Array.isArray(valor)) return valor.map(valorLegible).join(', ');
    if (typeof valor === 'object') return JSON.stringify(valor);
    if (esISO(valor)) return fechaCorta(valor);
    return String(valor);
  };

  raiz.U = {
    ZONA, MESES, ESTADOS, ESTADOS_SOLICITUD, ROLES, TIPOS_SOLICITUD, capitalizar, esFecha,
    partesBogota, partesISO, esISO, isoDePartes, isoDeDate, hoyISO, dateLocal, diasDelMes, sumarDias, diasEntre,
    fechaCorta, hora, fechaHora, fechaLarga, fechaHoraLarga, textoPeriodo,
    periodoDe, periodoActual, desplazarPeriodo, periodoAnterior, periodoSiguiente, nombrePeriodo, rangoPeriodo, listaPeriodos,
    fechaFinContrato, fechaInicioContrato, recortarPeriodo, finDeDiaBogota, inicioDeDiaBogota, dateDeLocal, localDeDate,
    diasComercial30, prorratear,
    formatoCOP, formatoNumero, formatoPorcentaje, parseNumero, redondear, numeroALetras,
    escaparHTML, sanitizarHTML, normalizarCorreo, soloDigitos, sanearNombreArchivo, esURL, esCorreo, esTelefono, sinTildes, slug, limitar,
    nombreCorto, iniciales, plural, reemplazarVariables,
    descargarBlob, descargarTexto, leerArchivoDataURL, leerArchivoBase64, leerArchivoArrayBuffer, uint8DeBase64, base64DeArrayBuffer, tamanoLegible, extension,
    clonar, igualProfundo, obtenerRuta, ponerRuta, aplanar, diferencias, sinIndefinidos, ordenarPor, agrupar, unicos,
    debounce, esperar, idAleatorio, tiempoRelativo, cuentaRegresiva, estadoVentana, textoVentana, esMovil, valorLegible,
  };
})(window);
