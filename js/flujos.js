'use strict';
/* ============================================================================
   5) flujos.js — Power Automate (window.Flujos): subirArchivo · notificar · docxAPdf
   Convención: POST con Content-Type text/plain (UTF-8) y cuerpo JSON (sin preflight CORS).
   Las URL viven en parametros/app.flujos; si una está vacía la app avisa y no falla.
   El flujo lee Firestore con el idToken de la persona (Authorization: Bearer), así las
   reglas validan la sesión y el permiso: nunca confía en lo que diga el cliente (docs/flujos.md).
   Estructura:
     1. Configuración y llamada genérica
     2. subirArchivo (un POST por archivo, máx. 15 MB)
     3. notificar (correos; cada intento queda en `notificaciones`)
     4. docxAPdf (opcional)
   ============================================================================ */
(function (raiz) {
  const U = raiz.U;

  /* ===== 1. Configuración ===== */
  let parametros = {};
  const configurar = (p) => { parametros = p || {}; };
  const urlDe = (nombre) => String(((parametros.flujos || {})[nombre]) || '').trim();
  const disponible = (nombre) => /^https:\/\//i.test(urlDe(nombre));

  const llamar = async (nombre, cuerpo, { tiempoMs = 120000 } = {}) => {
    const url = urlDe(nombre);
    if (!disponible(nombre)) { const e = new Error(`El flujo «${nombre}» no está configurado en Parámetros`); e.code = 'flujo-sin-url'; throw e; }
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), tiempoMs);
    try {
      // Vigente al menos 5 min: la subida de un archivo grande puede tardar (la app espera hasta 3 min).
      const idToken = await raiz.Auth.idToken(300000);
      let respuesta, texto;
      try {
        // charset explícito: Power Automate guarda text/plain en bruto y así no daña las tildes.
        respuesta = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ idToken, ...cuerpo }), signal: control.signal });
        texto = await respuesta.text();
      } catch (e) {
        // fetch rechaza con TypeError si no hay red o si la respuesta no trae Access-Control-Allow-Origin
        // (también los errores de la propia plataforma: tiempo agotado, flujo apagado). Ver docs/flujos.md.
        if (e instanceof TypeError) { const t = new Error(`No se pudo conectar con el flujo «${nombre}». Intenta de nuevo; si sigue, avisa al administrador`); t.code = 'flujo-red'; throw t; }
        throw e;
      }
      let json;
      try { json = texto ? JSON.parse(texto) : {}; } catch (e) { json = { ok: respuesta.ok, mensaje: texto }; }
      if (!respuesta.ok || json.ok === false) {
        const e = new Error(json.mensaje || json.error || `El flujo «${nombre}» respondió ${respuesta.status}`);
        e.code = `flujo-${respuesta.status}`;
        throw e;
      }
      return json;
    } catch (e) {
      if (e.name === 'AbortError') { const t = new Error(`El flujo «${nombre}» no respondió a tiempo`); t.code = 'flujo-tiempo'; throw t; }
      throw e;
    } finally { clearTimeout(temporizador); }
  };

  /* ===== 2. subirArchivo ===== */
  // origen: 'borrador' | 'envio'; docId: ID del borrador o envío (la app guarda el
  // borrador ANTES de subir, para que el flujo lea uid/contrato/formulario/período).
  const subirArchivo = async ({ origen, docId, preguntaId, archivo, maxMB = 15 }) => {
    if (archivo.size > maxMB * 1048576) { const e = new Error(`El archivo supera ${maxMB} MB`); e.code = 'archivo-grande'; throw e; }
    const nombre = U.sanearNombreArchivo(archivo.name) || 'archivo';
    if (raiz.MODO_DEMO) {
      // Demostración: no hay SharePoint; se simula la respuesta del flujo.
      await U.esperar(300);
      return { ok: true, url: `https://demo.local/Contratistas/${encodeURIComponent(nombre)}`, id: U.idAleatorio(), nombre, tamano: archivo.size, simulado: true };
    }
    const base64 = await U.leerArchivoBase64(archivo);
    const r = await llamar('subirArchivo', { origen, docId, preguntaId, nombre, tipo: archivo.type || 'application/octet-stream', base64 }, { tiempoMs: 180000 });
    // Sin enlace no hay archivo que adjuntar (p. ej. un 202 vacío de un flujo sin acción «Respuesta»).
    if (r.ok !== true || !r.url) { const e = new Error('El flujo no devolvió el enlace del archivo; no se adjuntó'); e.code = 'flujo-sin-enlace'; throw e; }
    // Se muestra el nombre original: en OneDrive el archivo lleva un prefijo único (ver docs/flujos.md).
    return { ok: true, url: r.url, id: r.id || '', nombre, tamano: archivo.size };
  };

  /* ===== 3. notificar ===== */
  // La app solo indica evento y documento; destinatarios y HTML los arma el flujo.
  const notificar = async ({ evento, coleccion, docId, por }) => {
    let estado = 'enviado', error = null;
    try {
      if (raiz.MODO_DEMO) estado = 'simulado';
      else if (!disponible('notificar')) { estado = 'omitido'; error = 'Flujo «notificar» sin configurar'; }
      else await llamar('notificar', { evento, coleccion, docId });
    } catch (e) { estado = 'fallido'; error = e.message; }
    try { await raiz.DB.registrarNotificacion({ evento, coleccion, docId, por: por || null, estado, error }); }
    catch (e) { console.warn('No se pudo registrar la notificación:', e); }
    return { estado, error };
  };

  /* ===== 4. docxAPdf ===== */
  const docxAPdf = async ({ nombre, blob }) => {
    if (blob.size > 10 * 1048576) { const e = new Error('El Word supera 10 MB; no se puede convertir a PDF'); e.code = 'archivo-grande'; throw e; }
    const base64 = U.base64DeArrayBuffer(await blob.arrayBuffer());
    const r = await llamar('docxAPdf', { nombre, base64 }, { tiempoMs: 180000 });
    if (!r.base64Pdf) throw new Error('El flujo no devolvió el PDF');
    return new Blob([U.uint8DeBase64(r.base64Pdf)], { type: 'application/pdf' });
  };

  raiz.Flujos = { configurar, disponible, urlDe, llamar, subirArchivo, notificar, docxAPdf };
})(window);
