/* ============================================================================
   12) contratista.jsx — pantallas del contratista (y páginas compartidas)
   Estructura:
     1. Utilidades de página: info del contrato → respuestas, completitud, correcciones vigentes
     2. Tablero del período (inicio del contratista)
     3. Mis envíos (+ detalle del envío, descarga, vista previa, solicitar corrección)
     4. Solicitudes del contratista (solicitudes + correcciones pendientes)
     5. Informe de gestión y cuenta de cobro (el del período y los anteriores)
     6. Contrato (información, envíos del contrato, cambios; edición con el motor)
     7. Formulario (nuevo · corrección · ver)
     8. Perfil y firma
   ============================================================================ */

/* ===== 1. Utilidades de página ===== */
const formularioInfo = (app) => app.formularios.find((f) => f.tipo === 'INFO_CONTRATO') || SEMILLAS.formularios.find((f) => f.tipo === 'INFO_CONTRATO');
// contratos/{id}.info.{capitulo}.{pregunta} ↔ respuestas planas del motor.
const infoARespuestas = (formulario, info) => {
  const R = {};
  (formulario.capitulos || []).forEach((cap) => (cap.preguntas || []).forEach((q) => {
    const v = info && info[cap.id] ? info[cap.id][q.id] : undefined;
    if (v !== undefined) R[q.id] = v;
  }));
  return R;
};
const respuestasAInfo = (formulario, respuestas) => {
  const info = {};
  (formulario.capitulos || []).forEach((cap) => {
    info[cap.id] = {};
    (cap.preguntas || []).forEach((q) => { if (q.tipo !== 'SEPARADOR' && respuestas[q.id] !== undefined) info[cap.id][q.id] = respuestas[q.id]; });
  });
  return info;
};
const completitudInfo = (formulario, contrato) => {
  const R = infoARespuestas(formulario, contrato && contrato.info);
  const obligatorias = [];
  (formulario.capitulos || []).forEach((cap) => (cap.preguntas || []).forEach((q) => { if (q.obligatoria && q.tipo !== 'CALCULADA' && q.tipo !== 'SEPARADOR') obligatorias.push(q); }));
  const faltan = obligatorias.filter((q) => sinLlenar(R[q.id]));
  return { total: obligatorias.length, faltan: faltan.map((q) => q.etiqueta), porcentaje: obligatorias.length ? Math.round(((obligatorias.length - faltan.length) / obligatorias.length) * 100) : 100 };
};
// En corrección no se exige lo que no estaba en la plantilla con que se hizo el envío: los envíos
// guardan sus campos (camposPlantilla); en los anteriores se deduce de las respuestas guardadas. Lo
// que no estaba sigue visible, pero opcional (si es una compuesta, también sus subpreguntas).
// Devuelve { plantilla, relajados } y se guarda por plantilla y envío (el motor no recibe una
// plantilla nueva en cada render).
const plantillasDeCorreccion = new WeakMap();
const sinExigirLoNuevo = (formulario, envio) => {
  let porEnvio = plantillasDeCorreccion.get(formulario);
  if (!porEnvio) { porEnvio = new WeakMap(); plantillasDeCorreccion.set(formulario, porEnvio); }
  if (porEnvio.has(envio)) return porEnvio.get(envio);
  const lista = Array.isArray(envio.camposPlantilla) ? new Set(envio.camposPlantilla) : null;
  const R = envio.respuestas || {};
  const estaba = (q, sub) => {
    if (lista) return lista.has(sub ? `${q.id}.${sub.id}` : q.id);
    if (!(q.id in R)) return false;
    // Las filas que arma el motor traen todas sus subpreguntas: si a alguna le falta, no estaba (o
    // quedó vacía al reenviar una corrección anterior, ver sinNuevosVacios). Sin filas no se sabe.
    const filas = Array.isArray(R[q.id]) ? R[q.id] : [];
    return !sub || filas.every((f) => f && sub.id in f);
  };
  const relajados = [];
  const plantilla = U.clonar(formulario);
  (plantilla.capitulos || []).forEach((c) => (c.preguntas || []).forEach((q) => {
    const nueva = !estaba(q);
    if (nueva && q.obligatoria) { q.obligatoria = false; relajados.push(q.id); }
    (q.subpreguntas || []).forEach((sub) => { if (sub.obligatoria && (nueva || !estaba(q, sub))) { sub.obligatoria = false; relajados.push(`${q.id}.${sub.id}`); } });
  }));
  const r = { plantilla: relajados.length ? plantilla : formulario, relajados };
  porEnvio.set(envio, r);
  return r;
};
// Al reenviar la corrección de un envío sin camposPlantilla, lo nuevo que quedó vacío no se guarda:
// así la próxima corrección vuelve a deducir que no estaba (y no lo exige).
const sinNuevosVacios = (respuestas, relajados) => {
  if (!relajados.length) return respuestas;
  const R = { ...respuestas };
  const filaVacia = (f) => !f || Object.keys(f).every((k) => k.startsWith('_') || sinLlenar(f[k]));
  relajados.forEach((ruta) => {
    const [qid, sid] = ruta.split('.');
    if (!sid) { if (sinLlenar(R[qid]) || (Array.isArray(R[qid]) && R[qid].every(filaVacia))) delete R[qid]; return; }
    if (Array.isArray(R[qid])) R[qid] = R[qid].map((f) => { if (!f || !(sid in f) || !sinLlenar(f[sid])) return f; const c = { ...f }; delete c[sid]; return c; });
  });
  return R;
};
const correccionVigente = (envio, ahora = new Date()) => !!(envio && envio.enCorreccion && U.esFecha(envio.fechaLimiteCorreccion) && envio.fechaLimiteCorreccion >= ahora);
const nombreFormulario = (app, id) => { const f = app.formularios.find((x) => x.id === id); return f ? f.nombre : id; };
const limiteDe = (formulario) => (formulario.config && formulario.config.limiteMensual != null ? Number(formulario.config.limiteMensual) : null);
const requiereVentana = (formulario) => !!(formulario.config && formulario.config.requiereVentana);
/* ----- Firma en línea (informe: el contratista al enviar, el validador al aprobar) ----- */
// Formularios cuyo Word lleva la firma del contratista y el Vo.Bo. del validador.
const admiteFirmaEnLinea = (formulario) => !!formulario && formulario.plantillaDescarga === 'informe_itm_sif';
// Una firma en línea vale para el envío tal como está si se hizo después del último paso que la pide
// (enviar o reenviar, la del contratista; aprobar, la del validador): la app guarda la firma justo
// después de ese paso, con la hora del mismo navegador. Así, si la nueva no se pudo guardar, la
// anterior no pasa por la de ahora.
const firmaVigente = (firma, envio, estados) => {
  if (!firma || !firma.firmadoEn) return null;
  const pasos = (envio.historial || []).filter((h) => estados.includes(h.estado)).map((h) => new Date(h.fecha).getTime()).filter((t) => !isNaN(t));
  return !pasos.length || new Date(firma.firmadoEn).getTime() >= Math.max(...pasos) ? firma : null;
};
// Por qué no se guardó una firma en línea: sin permiso, lo más probable es que falte publicar las reglas.
const motivoFirma = (e) => (e && e.code === 'permission-denied' ? 'el servidor no la aceptó; si la app se acaba de actualizar, el administrador debe publicar las reglas de Firestore' : DB.traducirError(e));
// Imagen (PNG, JPG o WebP) → { pngBase64, ancho, alto } que cabe en 150 KB (se reduce en canvas).
const firmaDeImagen = async (archivo) => {
  const invalida = (mensaje) => { const e = new Error(mensaje); e.code = 'firma-invalida'; return e; };
  if (!archivo || !/image\/(png|jpeg|jpg|webp)/.test(archivo.type)) throw invalida('Usa una imagen PNG (fondo transparente) o JPG');
  const dataUrl = await U.leerArchivoDataURL(archivo);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(invalida('No se pudo leer la imagen')); i.src = dataUrl; });
  let ancho = Math.min(img.width, 900), alto = Math.round(img.height * (ancho / img.width));
  let base64 = '';
  for (let intento = 0; intento < 6; intento++) {
    const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
    c.getContext('2d').drawImage(img, 0, 0, ancho, alto);
    base64 = c.toDataURL('image/png').split(',')[1];
    if (base64.length * 0.75 <= 150 * 1024) break;
    ancho = Math.round(ancho * 0.8); alto = Math.round(alto * 0.8);
  }
  if (base64.length * 0.75 > 150 * 1024) throw invalida('La firma sigue pesando más de 150 KB; recórtala o usa menos resolución');
  return { pngBase64: base64, ancho, alto };
};
// Pide la firma para un documento: la guardada en «Mi perfil», o una dibujada o subida en el momento
// (que puede quedar guardada). onListo({ pngBase64, ancho, alto }) con la firma, u onListo(null).
const ModalFirmar = ({ titulo, mensaje, textoOk, onListo }) => {
  const app = useApp();
  const uid = app.usuario.id;
  const { datos: guardada, cargando } = useCarga(() => DB.obtenerFirma(uid).catch(() => null), [uid]);
  const tieneGuardada = !!(guardada && guardada.pngBase64);
  const [eleccion, setEleccion] = useState(null);   // 'guardada' | 'otra' (sin elegir: la guardada, si hay)
  const modo = eleccion || (tieneGuardada ? 'guardada' : 'otra');
  const [vacio, setVacio] = useState(true);
  const [subida, setSubida] = useState(null);       // firma tomada de una imagen
  const [guardar, setGuardar] = useState(null);     // sin tocar: guardarla si no hay una guardada
  const guardarEf = guardar === null ? !tieneGuardada : guardar;
  const [ocupado, setOcupado] = useState(false);
  const pad = useRef(null);
  const subir = async (archivo) => {
    try { setSubida(await firmaDeImagen(archivo)); }
    catch (e) { app.avisar(e.code === 'firma-invalida' ? 'alerta' : 'error', e.message); }
  };
  const firmar = async () => {
    const firma = modo === 'guardada' ? { pngBase64: guardada.pngBase64, ancho: guardada.ancho, alto: guardada.alto } : (subida || (pad.current && pad.current.exportar()));
    if (!firma) { app.avisar('alerta', 'Firma dentro del recuadro o sube una imagen de tu firma'); return; }
    setOcupado(true);
    // Guardarla en el perfil es un extra: si falla, igual se firma.
    if (modo === 'otra' && guardarEf) { try { await DB.guardarFirma(uid, firma); } catch (e) { console.warn('No se guardó la firma en el perfil', e); } }
    onListo(firma);
  };
  const listaParaFirmar = modo === 'guardada' || !!subida || !vacio;
  return (
    <Modal titulo={titulo} ancho="ancho" onCerrar={() => onListo(null)} pie={<><Boton onClick={() => onListo(null)}>Cancelar</Boton><Boton variante="primario" icono="firma" cargando={ocupado} disabled={cargando || !listaParaFirmar} onClick={firmar}>{textoOk}</Boton></>}>
      <div className="grid gap-3">
        {mensaje ? <p className="text-sm">{mensaje}</p> : null}
        {cargando ? <Esqueleto filas={2} /> : modo === 'guardada' ? (
          <div className="grid gap-2">
            <div className="etiqueta">Tu firma</div>
            <img className="firma-vista" alt="Tu firma guardada" src={`data:image/png;base64,${guardada.pngBase64}`} />
            <button type="button" className="underline text-sm justify-self-start" onClick={() => setEleccion('otra')}>Firmar de otra forma</button>
          </div>
        ) : (
          <div className="grid gap-2">
            {subida ? (
              <div className="flex items-center gap-3 flex-wrap"><img className="firma-vista" alt="Firma subida" src={`data:image/png;base64,${subida.pngBase64}`} /><Boton tam="xs" variante="fantasma" icono="basura" onClick={() => setSubida(null)}>Quitar</Boton></div>
            ) : <PadFirma padRef={pad} onCambio={setVacio} etiqueta="Recuadro para firmar el documento" />}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <label className="underline cursor-pointer">O sube una imagen de tu firma<input type="file" className="sr-solo" accept="image/png,image/jpeg,image/webp" onChange={(e) => { subir(e.target.files[0]); e.target.value = ''; }} /></label>
              {tieneGuardada ? <button type="button" className="underline" onClick={() => { setEleccion('guardada'); setSubida(null); }}>Usar mi firma guardada</button> : null}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="caja" checked={guardarEf} onChange={(e) => setGuardar(e.target.checked)} />{tieneGuardada ? 'Reemplazar mi firma guardada por esta' : 'Guardar esta firma en mi perfil para la próxima vez'}</label>
          </div>
        )}
        <p className="text-xs texto-2">Tu firma, tu nombre, la fecha y la hora quedan en el Word del informe.</p>
      </div>
    </Modal>
  );
};

// Lo que necesita el Word de un envío ya hecho (descarga, vista previa y correo al validador).
const contextoWord = async (app, envio, formulario) => {
  const contrato = app.contratos.find((c) => c.id === envio.contratoId) || await DB.obtenerContrato(envio.contratoId);
  const usuario = envio.contratistaUid === app.usuario.id ? app.usuario : (await DB.obtenerPerfil(envio.contratistaUid)) || { nombreCompleto: '', nombreCorto: '' };
  const [perfil, firmas] = await Promise.all([
    DB.obtenerFirma(envio.contratistaUid).catch(() => null),
    admiteFirmaEnLinea(formulario) ? DB.obtenerFirmasEnvio(envio.id) : { contratista: null, validador: null },
  ]);
  // La firma en línea del envío manda; sin ella (envíos de antes), la del perfil, como siempre. El
  // Vo.Bo. del validador solo sale mientras el envío esté aprobado (si se reabre, deja de valer).
  const contratista = firmaVigente(firmas.contratista, envio, ['enviado', 'reenviado']);
  const validador = envio.estado === 'aprobado' ? firmaVigente(firmas.validador, envio, ['aprobado']) : null;
  return { envio, formulario, contrato, usuario, parametros: app.parametros, firma: contratista || perfil, firmas: { contratista, validador } };
};
// El informe enviado, en Word y con sus firmas, al correo del validador del contrato (flujo
// «enviarInforme»; el flujo toma el correo del contrato). Avisa cómo le fue; true si salió.
const correoValidadorDe = (contrato) => String((((contrato || {}).info || {}).supervision || {}).correoValidador || '').trim();
const puedeEnviarAlValidador = (app, formulario) => admiteFirmaEnLinea(formulario) && (MODO_DEMO || Flujos.disponible('enviarInforme'));
const enviarAlValidador = async (app, envio, formulario) => {
  const contrato = app.contratos.find((c) => c.id === envio.contratoId) || await DB.obtenerContrato(envio.contratoId).catch(() => null);
  const correo = correoValidadorDe(contrato);
  if (!puedeEnviarAlValidador(app, formulario)) {
    if (correo) app.avisar('alerta', 'No se envió al correo del validador: falta configurar el flujo «enviarInforme» en Parámetros (avísale al administrador).');
    return false;
  }
  if (!correo) { app.avisar('alerta', 'No se envió al correo del validador: el contrato no tiene su correo (Información del contrato → Supervisión y validación).'); return false; }
  try {
    const { blob, nombre } = await Descargas.generarDocx(await contextoWord(app, envio, formulario));
    const r = await Flujos.enviarInforme({ envioId: envio.id, nombre, blob });
    app.avisar('exito', `Informe enviado al correo del validador (${(r && r.para) || correo})${r && r.simulado ? ' · demostración' : ''}`);
    return true;
  } catch (e) {
    console.error(e);
    app.avisar('alerta', `No se pudo enviar al correo del validador: ${e.message}`);
    return false;
  }
};

// Botones de descarga / vista previa reutilizados en varias pantallas.
const AccionesEnvio = ({ envio, compacto }) => {
  const app = useApp();
  const [previa, setPrevia] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const formulario = app.formularios.find((f) => f.id === envio.formularioId);
  if (!formulario) return null;
  const generar = async () => Descargas.generarDocx(await contextoWord(app, envio, formulario));
  const descargar = async () => {
    setDescargando(true);
    try { const { blob, nombre } = await generar(); U.descargarBlob(blob, nombre); }
    catch (e) { console.error(e); app.avisar('error', `No se pudo generar el Word: ${e.message}`); }
    finally { setDescargando(false); }
  };
  return (
    <>
      <Boton tam={compacto ? 'xs' : 'sm'} icono="word" cargando={descargando} onClick={descargar} titulo="Descargar Word">{compacto ? 'Word' : 'Descargar Word'}</Boton>
      <Boton tam={compacto ? 'xs' : 'sm'} variante="fantasma" icono="ojo" onClick={() => setPrevia(true)} titulo="Vista previa">{compacto ? null : 'Vista previa'}</Boton>
      {previa ? <VistaPreviaDocx titulo={`${formulario.nombre} · ${U.nombrePeriodo(envio.periodo)}`} generar={generar} onCerrar={() => setPrevia(false)} /> : null}
    </>
  );
};
// Respuestas enviadas (foto) de un capítulo: etiqueta/valor y, aparte, las compuestas como tabla ancha.
const FotoCapitulo = ({ cap }) => {
  const simples = (cap.preguntas || []).filter((p) => p.tipo !== 'COMPUESTA');
  const compuestas = (cap.preguntas || []).filter((p) => p.tipo === 'COMPUESTA');
  return (
    <div className="panel-suave p-3">
      <h3 className="mb-2">{cap.capitulo}</h3>
      {simples.length ? <ListaDatos items={simples.map((p) => ({ etiqueta: p.etiqueta, valor: p.tipo === 'ARCHIVO' && p.archivos && p.archivos.length ? p.archivos.map((a, i) => <div key={i}>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : a.nombre}</div>) : p.valorLegible }))} /> : null}
      {compuestas.map((p) => (
        <div key={p.id} className="mt-3">
          <div className="etiqueta">{p.etiqueta} <span className="texto-3 font-normal">· {p.valorLegible}</span></div>
          {p.filas && p.filas.length ? <div className="tabla-envoltura"><table className="tabla tabla-foto"><thead><tr>{p.columnas.map((c) => <th key={c.id}>{c.etiqueta}</th>)}</tr></thead><tbody>{p.filas.map((f, i) => <tr key={i}>{p.columnas.map((c) => <td key={c.id}>{f[c.id]}</td>)}</tr>)}</tbody></table></div> : <span className="texto-3 text-sm">Sin filas</span>}
        </div>
      ))}
    </div>
  );
};
const BannerVentana = () => {
  const app = useApp();
  const v = app.ventana;
  const e = U.estadoVentana(v, null, new Date());
  const aviso = v && v.aviso ? U.sanitizarHTML(v.aviso) : '';
  const tipo = e.estado === 'abierta' ? 'exito' : e.estado === 'por_abrir' ? 'info' : 'alerta';
  return (
    <div className={`alerta-caja alerta-${tipo} mb-4`} role="status">
      <Icono nombre={e.estado === 'abierta' ? 'reloj' : 'candado'} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2"><strong>{U.nombrePeriodo(app.periodo)}</strong><span className="md:hidden"><ChipVentana enBanner /></span></div>
        {v ? <p className="text-sm mt-0.5">Ventana {U.textoVentana(v)}.</p> : <p className="text-sm mt-0.5">No hay ventana configurada para este período. Puedes consultar y descargar; para corregir algo ya enviado, usa «Solicitar corrección».</p>}
        {aviso ? <div className="prosa text-sm mt-1" dangerouslySetInnerHTML={{ __html: aviso }} /> : null}
        {/* Un administrador en su vista de contratista abre las ventanas desde aquí («Abrir varios meses»). */}
        {e.estado !== 'abierta' && app.vista === 'contratista' && app.rolCuenta === 'admin' ? <div className="mt-2"><Boton tam="sm" icono="calendario" onClick={() => app.cambiarVista('', '#/admin/ventanas?abrir=varios')}>Abrir ventanas (administrador)</Boton></div> : null}
      </div>
    </div>
  );
};

/* ===== 2. Tablero del período ===== */
const PaginaInicioContratista = () => {
  const app = useApp();
  const contrato = app.contrato;
  const fInfo = formularioInfo(app);
  const ahora = useReloj(60000);
  const { datos, cargando, recargar } = useCarga(async () => {
    if (!contrato) return null;
    const [envios, solicitudes] = await Promise.all([
      DB.listarEnvios({ rol: app.rol, uid: app.usuario.id, contratoId: contrato.id }),
      DB.listarSolicitudes({ rol: app.rol, uid: app.usuario.id, contratoId: contrato.id }),
    ]);
    const borradores = {};
    for (const f of app.formularios.filter((x) => x.activo && x.tipo !== 'INFO_CONTRATO')) {
      try { const b = await DB.obtenerBorrador(DB.idBorrador(app.usuario.id, contrato.id, f.id, app.periodo)); if (b) borradores[f.id] = b; } catch (e) { /* sin borrador */ }
    }
    return { envios, solicitudes, borradores };
  }, [contrato && contrato.id, app.periodo, app.usuario.id]);
  if (!contrato) return <Vacio icono="contrato" titulo="Sin contratos vinculados" texto="Cuando el administrador cree tu contrato aparecerá aquí. Si no lo ves, escribe al administrador." />;
  const envios = (datos && datos.envios) || [];
  const solicitudes = (datos && datos.solicitudes) || [];
  const borradores = (datos && datos.borradores) || {};
  const delPeriodo = envios.filter((e) => e.periodo === app.periodo);
  const correcciones = envios.filter((e) => correccionVigente(e, ahora));
  const completitud = completitudInfo(fInfo, contrato);
  const formulariosVentana = app.formularios.filter((f) => f.activo && f.tipo !== 'INFO_CONTRATO' && procesoHabilitado(app, f.tipo));
  const pasos = [
    {
      titulo: 'Información del contrato', estado: completitud.porcentaje === 100 ? 'exito' : 'alerta', icono: 'contrato',
      detalle: completitud.porcentaje === 100 ? 'Completa' : `${completitud.porcentaje} % · faltan: ${completitud.faltan.slice(0, 3).join(', ')}${completitud.faltan.length > 3 ? '…' : ''}`,
      accion: <Boton tam="sm" icono="ojo" onClick={() => app.navegar('#/contrato')}>{contrato.permitirActualizar ? 'Ver / actualizar' : 'Ver'}</Boton>,
    },
    ...formulariosVentana.map((f) => {
      const env = delPeriodo.filter((e) => e.formularioId === f.id);
      const ultimo = env[0];
      const abierta = !requiereVentana(f) || U.estadoVentana(app.ventana, f.id, ahora).estado === 'abierta';
      const limite = limiteDe(f);
      const puedeMas = limite == null || env.length < limite;
      let detalle, accion, estado = 'pendiente';
      if (ultimo) { detalle = <span className="flex items-center gap-2 flex-wrap"><ChipEstado estado={ultimo.estado} /><span className="mono text-xs">No. {ultimo.consecutivo}</span>{correccionVigente(ultimo, ahora) ? <span className="text-xs" style={{ color: 'var(--alerta)' }}>plazo {U.fechaHora(ultimo.fechaLimiteCorreccion)}</span> : null}</span>; estado = ultimo.estado === 'aprobado' ? 'exito' : (ultimo.enCorreccion ? 'alerta' : 'primario'); }
      else if (borradores[f.id]) { detalle = `Borrador guardado ${U.tiempoRelativo(borradores[f.id].actualizadoEn)}`; estado = 'alerta'; }
      else detalle = abierta ? 'Pendiente de diligenciar' : 'Fuera de ventana';
      // El informe y la cuenta de cobro se diligencian y se corrigen en su página del menú.
      const proceso = navDe(app.rol).find((n) => n.proceso === f.tipo);
      if (ultimo && correccionVigente(ultimo, ahora)) accion = <Boton tam="sm" variante="acento" icono="editar" onClick={() => app.navegar(proceso ? proceso.ruta : `#/formulario/${f.id}?modo=correccion&envio=${encodeURIComponent(ultimo.id)}`)}>Corregir</Boton>;
      else if (ultimo && !puedeMas) accion = <AccionesEnvio envio={ultimo} compacto />;
      else if (abierta) accion = <Boton tam="sm" variante="primario" icono={borradores[f.id] ? 'editar' : 'mas'} onClick={() => app.navegar(proceso && !ultimo ? proceso.ruta : `#/formulario/${f.id}?modo=nuevo`)}>{borradores[f.id] ? 'Continuar' : 'Diligenciar'}</Boton>;
      else accion = <Boton tam="sm" disabled icono="candado">Ventana cerrada</Boton>;
      return { titulo: f.nombre, estado, icono: f.tipo === 'CUENTA_COBRO' ? 'envios' : 'formulario', detalle, accion };
    }),
    {
      titulo: 'Correcciones', icono: 'editar', estado: correcciones.length ? 'alerta' : 'exito',
      detalle: correcciones.length ? `${correcciones.length} ${U.plural(correcciones.length, 'envío por corregir', 'envíos por corregir')}` : 'Sin correcciones pendientes',
      accion: correcciones.length ? <Boton tam="sm" icono="derecha" onClick={() => app.navegar('#/solicitudes?pestana=correcciones')}>Ver</Boton> : null,
    },
  ];
  const pendientesRev = envios.filter((e) => ['enviado', 'en_revision', 'reenviado', 'aprobado_revisor'].includes(e.estado)).length;
  return (
    <div>
      <Encabezado titulo={`Hola, ${app.usuario.nombres || app.usuario.nombreCorto}`} subtitulo={`${contrato.numero}${contrato.etiqueta ? ` · ${contrato.etiqueta}` : ''} · tablero de ${U.nombrePeriodo(app.periodo)}`} acciones={<Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()} titulo="Actualizar">Actualizar</Boton>} />
      <BannerVentana />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="grid gap-4">
          <div className="tarjeta">
            <div className="tarjeta-cabecera"><h2>Lista de verificación del período</h2>{cargando ? <Icono nombre="cargando" className="girando texto-3" /> : null}</div>
            <div className="tarjeta-cuerpo">
              <ol className="linea-tiempo">
                {pasos.map((p, i) => (
                  <li key={i}>
                    <span className={`punto ${p.estado === 'pendiente' ? '' : p.estado}`}><Icono nombre={p.estado === 'exito' ? 'check' : p.icono} /></span>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><strong className="text-sm">{p.titulo}</strong><div className="text-sm texto-2 mt-0.5">{p.detalle}</div></div>
                      <div className="flex gap-1 flex-wrap">{p.accion}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="tarjeta">
            <div className="tarjeta-cabecera"><h2>Últimos envíos</h2><Boton tam="xs" variante="fantasma" onClick={() => app.navegar('#/envios')}>Ver todos</Boton></div>
            <Tabla cargando={cargando} filas={envios.slice(0, 5)} vacio={<Vacio icono="envios" titulo="Todavía no hay envíos" texto="Cuando envíes un formulario aparecerá aquí con su estado." />}
              columnas={[
                { titulo: 'Período', render: (e) => <span className="mono">{U.nombrePeriodo(e.periodo)}</span> },
                { titulo: 'Formulario', render: (e) => nombreFormulario(app, e.formularioId) },
                { titulo: 'No.', render: (e) => <span className="mono">{e.consecutivo}</span> },
                { titulo: 'Estado', render: (e) => <ChipEstado estado={e.estado} /> },
                { titulo: 'Enviado', render: (e) => <span className="mono text-xs">{U.fechaHora(e.enviadoEn)}</span> },
              ]} acciones={(e) => <AccionesEnvio envio={e} compacto />} />
          </div>
        </div>
        <div className="grid gap-3 grid-cols-3 lg:grid-cols-1">
          <Indicador titulo="Enviados" valor={envios.length} pie="en este contrato" />
          <Indicador titulo="Aprobados" valor={envios.filter((e) => e.estado === 'aprobado').length} tipo="exito" />
          <Indicador titulo="Pendientes" valor={pendientesRev + correcciones.length} tipo={pendientesRev + correcciones.length ? 'alerta' : undefined} pie={`${pendientesRev} en revisión · ${correcciones.length} por corregir`} />
          <div className="col-span-3 lg:col-span-1 indicador">
            <div className="titulo">Solicitudes</div>
            <div className="text-sm mt-1">{solicitudes.filter((s) => s.estado === 'pendiente').length} pendientes · {solicitudes.length} en total</div>
            <Boton tam="xs" variante="fantasma" className="mt-2" onClick={() => app.navegar('#/solicitudes')}>Ir a solicitudes</Boton>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===== 3. Mis envíos ===== */
const DetalleEnvio = ({ envio, onCerrar }) => {
  const app = useApp();
  const ahora = new Date();
  const formulario = app.formularios.find((f) => f.id === envio.formularioId);
  const contrato = app.contratos.find((c) => c.id === envio.contratoId);
  const [verFoto, setVerFoto] = useState(false);
  return (
    <Modal titulo={`${formulario ? formulario.nombre : envio.formularioId} · ${U.nombrePeriodo(envio.periodo)}`} descripcion={`${contrato ? contrato.numero : envio.contratoId} · consecutivo ${envio.consecutivo}`} ancho="ancho" onCerrar={onCerrar}
      pie={<><Boton onClick={onCerrar}>Cerrar</Boton><AccionesEnvio envio={envio} />{app.rol === 'contratista' && correccionVigente(envio, ahora) ? <Boton variante="acento" icono="editar" onClick={() => app.navegar(`#/formulario/${envio.formularioId}?modo=correccion&envio=${encodeURIComponent(envio.id)}`)}>Corregir</Boton> : null}</>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2">Estado</h3>
          <ListaDatos items={[
            { etiqueta: 'Estado', valor: <ChipEstado estado={envio.estado} /> },
            { etiqueta: 'Paso actual', valor: envio.pasoActual === 'ninguno' ? 'Flujo terminado' : U.ROLES[envio.pasoActual] || envio.pasoActual },
            { etiqueta: 'Enviado', valor: U.fechaHora(envio.enviadoEn), mono: true },
            envio.enCorreccion ? { etiqueta: 'Plazo de corrección', valor: U.fechaHora(envio.fechaLimiteCorreccion), mono: true } : null,
            envio.totales && envio.totales.valorCobrado != null ? { etiqueta: 'Valor cobrado', valor: U.formatoCOP(envio.totales.valorCobrado), mono: true } : null,
            envio.totales && envio.totales.saldo != null ? { etiqueta: 'Saldo seguridad social', valor: U.formatoCOP(envio.totales.saldo), mono: true } : null,
            envio.totales && envio.totales.promedioEjecucion != null ? { etiqueta: 'Ejecución promedio', valor: `${envio.totales.promedioEjecucion} %`, mono: true } : null,
          ]} />
          {envio.anexos && envio.anexos.length ? <><h3 className="mt-4 mb-2">Archivos</h3><ul className="grid gap-1 text-sm">{envio.anexos.map((a, i) => <li key={i} className="flex items-center gap-2"><Icono nombre="archivo" className="texto-3" />{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : a.nombre}</li>)}</ul></> : null}
        </div>
        <div>
          <h3 className="mb-2">Historial</h3>
          <LineaTiempo entradas={envio.historial || []} />
        </div>
      </div>
      <div className="mt-4">
        <button type="button" className="text-sm underline" onClick={() => setVerFoto(!verFoto)}>{verFoto ? 'Ocultar respuestas' : 'Ver respuestas enviadas'}</button>
        {verFoto ? <div className="mt-2 grid gap-3">{(envio.foto || []).map((cap) => <FotoCapitulo key={cap.id} cap={cap} />)}</div> : null}
      </div>
    </Modal>
  );
};
const PaginaEnvios = () => {
  const app = useApp();
  const q = app.ruta.query || {};
  const [filtros, setFiltros] = useState({ formularioId: '', contratoId: app.rol === 'contratista' ? '' : (app.contratoId || ''), periodo: q.periodo || '', estado: '' });
  const [detalle, setDetalle] = useState(null);
  const [solicitar, setSolicitar] = useState(null);
  const [limite, setLimite] = useState(10);
  const { datos, cargando, recargar } = useCarga(() => DB.listarEnvios({ rol: app.rol, uid: app.usuario.id }), [app.usuario.id, app.rol]);
  const lista = useMemo(() => (datos || []).filter((e) => (!filtros.formularioId || e.formularioId === filtros.formularioId) && (!filtros.contratoId || e.contratoId === filtros.contratoId) && (!filtros.periodo || e.periodo === filtros.periodo) && (!filtros.estado || e.estado === filtros.estado)), [datos, filtros]);
  const periodos = U.unicos((datos || []).map((e) => e.periodo)).sort().reverse();
  return (
    <div>
      <Encabezado titulo="Mis envíos" subtitulo="Historial de formularios enviados, con descarga y vista previa." acciones={<Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton>} />
      <div className="grupo-filtros mb-4">
        <Campo etiqueta="Formulario"><Selector vacio="Todos" opciones={app.formularios.filter((f) => f.tipo !== 'INFO_CONTRATO').map((f) => ({ valor: f.id, etiqueta: f.nombre }))} value={filtros.formularioId} onChange={(e) => setFiltros({ ...filtros, formularioId: e.target.value })} /></Campo>
        <Campo etiqueta="Contrato"><Selector vacio="Todos" opciones={app.contratos.map((c) => ({ valor: c.id, etiqueta: c.numero }))} value={filtros.contratoId} onChange={(e) => setFiltros({ ...filtros, contratoId: e.target.value })} /></Campo>
        <Campo etiqueta="Período"><Selector vacio="Todos" opciones={periodos.map((p) => ({ valor: p, etiqueta: U.nombrePeriodo(p) }))} value={filtros.periodo} onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value })} /></Campo>
        <Campo etiqueta="Estado"><Selector vacio="Todos" opciones={Object.keys(U.ESTADOS).map((k) => ({ valor: k, etiqueta: U.ESTADOS[k].etiqueta }))} value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} /></Campo>
      </div>
      <Tabla cargando={cargando} filas={lista.slice(0, limite)} vacio={<Vacio icono="envios" titulo="Sin envíos" texto="No hay envíos con esos filtros." />}
        columnas={[
          { titulo: 'Período', render: (e) => <span className="mono">{U.nombrePeriodo(e.periodo)}</span> },
          { titulo: 'Formulario', render: (e) => nombreFormulario(app, e.formularioId) },
          { titulo: 'Contrato', render: (e) => { const c = app.contratos.find((x) => x.id === e.contratoId); return c ? c.numero : e.contratoId; } },
          { titulo: 'No.', render: (e) => <span className="mono">{e.consecutivo}</span> },
          { titulo: 'Estado', render: (e) => <span className="flex items-center gap-1 flex-wrap"><ChipEstado estado={e.estado} />{correccionVigente(e) ? <Chip tipo="alerta" icono="reloj">hasta {U.fechaCorta(e.fechaLimiteCorreccion)}</Chip> : null}</span> },
          { titulo: 'Enviado', render: (e) => <span className="mono text-xs">{U.fechaHora(e.enviadoEn)}</span> },
        ]}
        acciones={(e) => <>
          <AccionesEnvio envio={e} compacto />
          <Boton tam="xs" variante="fantasma" icono="lista" onClick={() => setDetalle(e)}>Detalle</Boton>
          {app.rol === 'contratista' && correccionVigente(e) ? <Boton tam="xs" variante="acento" icono="editar" onClick={() => app.navegar(`#/formulario/${e.formularioId}?modo=correccion&envio=${encodeURIComponent(e.id)}`)}>Corregir</Boton> : null}
          {app.rol === 'contratista' && !e.enCorreccion ? <Boton tam="xs" variante="fantasma" icono="chat" onClick={() => setSolicitar(e)}>Solicitar corrección</Boton> : null}
        </>} />
      {lista.length > limite ? <div className="flex justify-center mt-3"><Boton tam="sm" icono="abajo" onClick={() => setLimite(limite + 10)}>Mostrar más ({lista.length - limite} restantes)</Boton></div> : null}
      {detalle ? <DetalleEnvio envio={detalle} onCerrar={() => setDetalle(null)} /> : null}
      {solicitar ? <ModalNuevaSolicitud envioInicial={solicitar} onCerrar={() => setSolicitar(null)} onCreada={() => { setSolicitar(null); app.recargarContadores(); }} /> : null}
    </div>
  );
};

/* ===== 4. Solicitudes del contratista ===== */
const ModalNuevaSolicitud = ({ envioInicial, onCerrar, onCreada }) => {
  const app = useApp();
  const contrato = envioInicial ? app.contratos.find((c) => c.id === envioInicial.contratoId) : app.contrato;
  const [tipo, setTipo] = useState('correccion');
  const [envioIds, setEnvioIds] = useState(envioInicial ? [envioInicial.id] : []);
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { datos: envios } = useCarga(() => (contrato ? DB.listarEnvios({ rol: app.rol, uid: app.usuario.id, contratoId: contrato.id }) : Promise.resolve([])), [contrato && contrato.id]);
  const crear = async () => {
    if (!contrato) return;
    if (tipo === 'correccion' && !envioIds.length) { app.avisar('alerta', 'Elige al menos un envío a corregir'); return; }
    if (observacion.trim().length < 10) { app.avisar('alerta', 'Describe qué necesitas corregir o actualizar (mínimo 10 caracteres)'); return; }
    setGuardando(true);
    try {
      const seleccionados = (envios || []).filter((e) => envioIds.includes(e.id));
      const id = await DB.crearSolicitud({
        contratoId: contrato.id, contratistaUid: contrato.contratistaUid, revisores: contrato.revisores || [], coordinadores: contrato.coordinadores || [],
        tipo, origen: 'contratista', envioIds: tipo === 'correccion' ? envioIds : [], formularios: tipo === 'correccion' ? U.unicos(seleccionados.map((e) => e.formularioId)) : ['info_contrato'],
        observacion: observacion.trim(), fechaLimite: null, estado: 'pendiente', revisorUid: null, motivoRechazo: null,
      });
      await Flujos.notificar({ evento: 'solicitud', coleccion: 'solicitudes', docId: id, por: app.usuario.id });
      app.avisar('exito', 'Solicitud enviada al revisor');
      onCreada();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo="Nueva solicitud" descripcion={contrato ? contrato.numero : ''} onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" icono="enviar" cargando={guardando} onClick={crear}>Enviar solicitud</Boton></>}>
      <div className="grid gap-4">
        <Campo etiqueta="Tipo"><Segmentado etiqueta="Tipo de solicitud" valor={tipo} opciones={[{ valor: 'correccion', etiqueta: 'Corregir un envío' }, { valor: 'actualizacion_info', etiqueta: 'Actualizar información del contrato' }]} onCambio={setTipo} /></Campo>
        {tipo === 'correccion' ? (
          <Campo etiqueta="Envíos a corregir" obligatoria>
            {!envios ? <Esqueleto filas={2} /> : (
              <div className="grid gap-1 max-h-60 overflow-auto">
                {envios.filter((e) => !e.enCorreccion).map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm p-2 rounded-md" style={{ border: '1px solid var(--borde)' }}>
                    <input type="checkbox" className="caja" checked={envioIds.includes(e.id)} onChange={(ev) => setEnvioIds(ev.target.checked ? [...envioIds, e.id] : envioIds.filter((x) => x !== e.id))} />
                    <span className="flex-1">{nombreFormulario(app, e.formularioId)} · <span className="mono">{U.nombrePeriodo(e.periodo)}</span> · No. {e.consecutivo}</span><ChipEstado estado={e.estado} />
                  </label>
                ))}
                {!envios.length ? <span className="texto-3 text-sm">No hay envíos en este contrato.</span> : null}
              </div>
            )}
          </Campo>
        ) : <Alerta tipo="info">El revisor habilitará la edición de tus datos (capítulo «Datos del contratista»). Los datos del contrato los actualiza el revisor con tu observación.</Alerta>}
        <Campo etiqueta="Observación" obligatoria ayuda="Explica qué debe corregirse y por qué."><Area value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={4} /></Campo>
      </div>
    </Modal>
  );
};
const SolicitudesContratista = () => {
  const app = useApp();
  const [pestana, setPestana] = useState((app.ruta.query && app.ruta.query.pestana) || 'solicitudes');
  const [nueva, setNueva] = useState(false);
  const [pagina, setPagina] = useState(0);
  const ahora = useReloj(60000);
  const { datos, cargando, recargar } = useCarga(async () => {
    const [solicitudes, envios] = await Promise.all([DB.listarSolicitudes({ rol: app.rol, uid: app.usuario.id }), DB.listarEnvios({ rol: app.rol, uid: app.usuario.id })]);
    return { solicitudes, envios };
  }, [app.usuario.id]);
  const solicitudes = (datos && datos.solicitudes) || [];
  const correcciones = ((datos && datos.envios) || []).filter((e) => correccionVigente(e, ahora));
  const vencidas = ((datos && datos.envios) || []).filter((e) => e.enCorreccion && !correccionVigente(e, ahora));
  const porPagina = 5;
  const paginaSol = solicitudes.slice(pagina * porPagina, (pagina + 1) * porPagina);
  return (
    <div>
      <Encabezado titulo="Solicitudes" subtitulo="Correcciones y actualizaciones que pides al revisor; aquí también aparecen los envíos reabiertos." acciones={<><Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton><Boton tam="sm" variante="primario" icono="mas" onClick={() => setNueva(true)} disabled={!app.contrato}>Nueva solicitud</Boton></>} />
      <Pestanas activa={pestana} onCambio={setPestana} lista={[{ id: 'solicitudes', etiqueta: 'Solicitudes', icono: 'solicitudes', contador: solicitudes.filter((s) => s.estado === 'pendiente').length }, { id: 'correcciones', etiqueta: 'Correcciones pendientes', icono: 'editar', contador: correcciones.length }]} />
      <div className="mt-4">
        {pestana === 'solicitudes' ? (
          <>
            <Tabla cargando={cargando} filas={paginaSol} vacio={<Vacio icono="solicitudes" titulo="Sin solicitudes" texto="Crea una solicitud para corregir un envío o actualizar tu información." />}
              columnas={[
                { titulo: 'Fecha', render: (s) => <span className="mono text-xs">{U.fechaHora(s.creadoEn)}</span> },
                { titulo: 'Tipo', render: (s) => U.TIPOS_SOLICITUD[s.tipo] || s.tipo },
                { titulo: 'Formularios', render: (s) => (s.formularios || []).map((f) => nombreFormulario(app, f)).join(', ') || '—' },
                { titulo: 'Origen', render: (s) => (s.origen === 'revisor' ? 'Revisor' : 'Contratista') },
                { titulo: 'Fecha límite', render: (s) => <span className="mono text-xs">{s.fechaLimite ? U.fechaHora(s.fechaLimite) : '—'}</span> },
                { titulo: 'Estado', render: (s) => <span className="flex flex-col gap-1"><ChipSolicitud estado={s.estado} />{s.motivoRechazo ? <span className="text-xs texto-2">{s.motivoRechazo}</span> : null}</span> },
                { titulo: 'Observación', render: (s) => <span className="text-sm whitespace-pre-wrap">{s.observacion}</span> },
              ]} />
            {solicitudes.length > porPagina ? <div className="flex justify-between items-center mt-3 text-sm"><Boton tam="sm" icono="izquierda" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anteriores</Boton><span className="texto-2">Página {pagina + 1} de {Math.ceil(solicitudes.length / porPagina)}</span><Boton tam="sm" icono="derecha" disabled={(pagina + 1) * porPagina >= solicitudes.length} onClick={() => setPagina(pagina + 1)}>Siguientes</Boton></div> : null}
          </>
        ) : (
          <>
            <Tabla cargando={cargando} filas={correcciones} vacio={<Vacio icono="check" titulo="Sin correcciones pendientes" texto="Cuando el revisor devuelva un envío aparecerá aquí con su fecha límite." />}
              columnas={[
                { titulo: 'Fecha', render: (e) => <span className="mono text-xs">{U.fechaHora((e.historial || []).slice(-1)[0] ? e.historial.slice(-1)[0].fecha : e.actualizadoEn)}</span> },
                { titulo: 'Contrato', render: (e) => { const c = app.contratos.find((x) => x.id === e.contratoId); return c ? c.numero : e.contratoId; } },
                { titulo: 'Proceso', render: (e) => `${nombreFormulario(app, e.formularioId)} · ${U.nombrePeriodo(e.periodo)}` },
                { titulo: 'Observación', render: (e) => <span className="text-sm whitespace-pre-wrap">{(e.historial || []).slice(-1)[0] ? e.historial.slice(-1)[0].observacion : ''}</span> },
                { titulo: 'Plazo', render: (e) => <Chip tipo="alerta" icono="reloj">{U.fechaHora(e.fechaLimiteCorreccion)}</Chip> },
              ]} acciones={(e) => <Boton tam="xs" variante="acento" icono="editar" onClick={() => app.navegar(`#/formulario/${e.formularioId}?modo=correccion&envio=${encodeURIComponent(e.id)}`)}>Corregir</Boton>} />
            {vencidas.length ? <Alerta tipo="alerta" className="mt-3">{vencidas.length} {U.plural(vencidas.length, 'corrección venció', 'correcciones vencieron')} sin reenviar. Pide al revisor un nuevo plazo mediante una solicitud.</Alerta> : null}
          </>
        )}
      </div>
      {nueva ? <ModalNuevaSolicitud onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); recargar(); app.recargarContadores(); }} /> : null}
    </div>
  );
};
const PaginaSolicitudes = () => { const app = useApp(); return app.rol === 'contratista' ? <SolicitudesContratista /> : <SolicitudesRevision />; };

/* ===== 5. Informe de gestión y cuenta de cobro ===== */
// Una página por proceso del menú del contratista, con el formulario del período en la página misma
// (empieza en las actividades): sin enviar, se diligencia (se guarda solo y se descarga en Word); con una
// corrección abierta, se corrige; enviado, se ve tal como quedó, debajo de su estado y su Word. Al final,
// los de períodos anteriores del contrato.
const PROCESOS = {
  INFORME_MENSUAL: { titulo: 'Generación de informe de gestión', icono: 'formulario', cual: 'el informe', lo: 'lo', anteriores: 'Informes anteriores', ninguno: 'Todavía no has enviado informes en este contrato.', ayuda: 'Llena cada actividad; se guarda solo. Cuando esté listo, descarga el Word o envíalo al revisor.' },
  CUENTA_COBRO: { titulo: 'Cuenta de cobro', icono: 'envios', cual: 'la cuenta de cobro', lo: 'la', anteriores: 'Cuentas de cobro anteriores', ninguno: 'Todavía no has enviado cuentas de cobro en este contrato.', ayuda: 'Llena cada paso; se guarda sola. Cuando esté lista, descarga el Word o envíala al revisor.' },
};
const PaginaProceso = ({ tipo }) => {
  const app = useApp();
  const p = PROCESOS[tipo];
  const contrato = app.contrato;
  const formulario = app.formularios.find((f) => f.activo && f.tipo === tipo);
  const habilitado = procesoHabilitado(app, tipo);
  const ahora = useReloj(60000);
  const [detalle, setDetalle] = useState(null);
  const [solicitar, setSolicitar] = useState(null);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const { datos, cargando, error, recargar } = useCarga(async () => {
    if (!contrato || !formulario || !habilitado) return null;
    return { contratoId: contrato.id, formularioId: formulario.id, envios: await DB.listarEnvios({ rol: app.rol, uid: app.usuario.id, contratoId: contrato.id, formularioId: formulario.id }) };
  }, [contrato && contrato.id, formulario && formulario.id, app.periodo, app.usuario.id, habilitado]);
  if (!habilitado) return <Vacio icono="candado" titulo={`${p.titulo}: deshabilitada por ahora`} texto="Cuando el administrador la habilite, podrás diligenciarla desde aquí." accion={<Boton onClick={() => app.navegar('#/inicio')}>Ir al inicio</Boton>} />;
  if (!contrato) return <Vacio icono="contrato" titulo="Sin contratos vinculados" texto="Cuando el administrador cree tu contrato aparecerá aquí. Si no lo ves, escribe al administrador." />;
  if (!formulario) return <Vacio icono={p.icono} titulo={p.titulo} texto="El administrador aún no ha publicado este formulario." />;
  // Al cambiar de contrato en la barra, mientras carga quedan los envíos del anterior: no cuentan.
  const vigentes = datos && datos.contratoId === contrato.id && datos.formularioId === formulario.id ? datos : null;
  const envios = (vigentes && vigentes.envios) || [];
  const delPeriodo = envios.filter((e) => e.periodo === app.periodo);
  const ultimo = delPeriodo[0];
  const abierta = !requiereVentana(formulario) || U.estadoVentana(app.ventana, formulario.id, ahora).estado === 'abierta';
  const limite = limiteDe(formulario);
  const puedeMas = limite == null || delPeriodo.length < limite;
  const enContrato = !!U.recortarPeriodo(app.periodo, contrato);
  const porCorregir = envios.filter((e) => correccionVigente(e, ahora));
  const vencidas = envios.filter((e) => e.enCorreccion && !correccionVigente(e, ahora));
  const diligenciar = () => app.navegar(`#/formulario/${formulario.id}?modo=nuevo`);
  // El formulario del período en la página: nuevo (sin enviar, dentro del contrato y con la ventana
  // abierta), la corrección abierta o, enviado, para verlo.
  const enPagina = !vigentes ? null
    : !ultimo ? (enContrato && abierta ? { modo: 'nuevo' } : null)
      : { modo: correccionVigente(ultimo, ahora) ? 'correccion' : 'ver', envioId: ultimo.id };
  const corregir = (e) => {
    const abajo = enPagina && enPagina.modo === 'correccion' && enPagina.envioId === e.id && document.getElementById('formulario-del-periodo');
    if (abajo) abajo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else app.navegar(`#/formulario/${e.formularioId}?modo=correccion&envio=${encodeURIComponent(e.id)}`);
  };
  const acciones = (e, compacto) => {
    const tam = compacto ? 'xs' : 'sm';
    return <>
      <AccionesEnvio envio={e} compacto={compacto} />
      <Boton tam={tam} variante="fantasma" icono="lista" onClick={() => setDetalle(e)}>Detalle</Boton>
      {correccionVigente(e, ahora) ? <Boton tam={tam} variante="acento" icono="editar" onClick={() => corregir(e)}>Corregir</Boton> : null}
      {!e.enCorreccion ? <Boton tam={tam} variante="fantasma" icono="chat" onClick={() => setSolicitar(e)}>Solicitar corrección</Boton> : null}
    </>;
  };
  let delMes;
  if (ultimo) {
    delMes = (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChipEstado estado={ultimo.estado} /><span className="mono text-sm">No. {ultimo.consecutivo}</span><span className="text-sm texto-2">enviado {U.fechaHora(ultimo.enviadoEn)}</span>
          {correccionVigente(ultimo, ahora) ? <Chip tipo="alerta" icono="reloj">corregir hasta {U.fechaHora(ultimo.fechaLimiteCorreccion)}</Chip> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {acciones(ultimo, false)}
          {/* Por si el correo automático no salió o el validador lo necesita otra vez. */}
          {puedeEnviarAlValidador(app, formulario) ? <Boton tam="sm" variante="fantasma" icono="correo" cargando={enviandoCorreo} onClick={async () => { setEnviandoCorreo(true); try { await enviarAlValidador(app, ultimo, formulario); } finally { setEnviandoCorreo(false); } }}>Enviar al validador</Boton> : null}
          {puedeMas && abierta && enContrato ? <Boton tam="sm" variante="primario" icono="mas" onClick={diligenciar}>Diligenciar otro</Boton> : null}
        </div>
      </div>
    );
  } else if (!enContrato) {
    delMes = <Alerta tipo="info">{U.nombrePeriodo(app.periodo)} está fuera de las fechas del contrato. Elige otro período en la barra superior.</Alerta>;
  } else if (!abierta) {
    delMes = <Alerta tipo="alerta"><strong>La ventana de {U.nombrePeriodo(app.periodo)} no está abierta.</strong> Fuera de la ventana solo se consulta.</Alerta>;
  }
  const textoEnPagina = !enPagina ? null
    : enPagina.modo === 'nuevo' ? { titulo: `${formulario.nombre} · ${U.nombrePeriodo(app.periodo)}`, ayuda: p.ayuda }
      : enPagina.modo === 'correccion' ? { titulo: `Corrige ${p.cual}`, ayuda: `Cambia lo que pidió el revisor y reenvía${p.lo} antes del ${U.fechaHora(ultimo.fechaLimiteCorreccion)}. Los cambios se guardan al reenviar${p.lo}; también puedes descargar el Word.` }
        : { titulo: 'Lo que enviaste', ayuda: ultimo.enCorreccion ? `El plazo para corregir${p.lo} venció: pide uno nuevo en Solicitudes.` : `Para cambiar${p.lo}, usa «Solicitar corrección»; cuando el revisor la apruebe, ${p.lo} corriges aquí mismo.` };
  return (
    <div>
      <Encabezado titulo={p.titulo} subtitulo={`${contrato.numero}${contrato.etiqueta ? ` · ${contrato.etiqueta}` : ''} · ${U.nombrePeriodo(app.periodo)}`} acciones={<Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()} titulo="Actualizar">Actualizar</Boton>} />
      <BannerVentana />
      {porCorregir.length ? <Alerta tipo="alerta" className="mb-4"><strong>{porCorregir.length === 1 ? `Tienes ${p.cual} de ${U.nombrePeriodo(porCorregir[0].periodo)} por corregir` : `Tienes ${porCorregir.length} por corregir`}</strong> (botón «Corregir»), antes del plazo que fijó el revisor.</Alerta> : null}
      {vencidas.length ? <Alerta tipo="alerta" className="mb-4">{vencidas.length} {U.plural(vencidas.length, 'corrección venció', 'correcciones vencieron')} sin reenviar. Pide al revisor un nuevo plazo en <button type="button" className="underline" onClick={() => app.navegar('#/solicitudes?pestana=correcciones')}>Solicitudes</button>.</Alerta> : null}
      <div className="grid gap-4">
        {enPagina && enPagina.modo === 'nuevo' ? null : (
          <div className="tarjeta">
            <div className="tarjeta-cabecera"><h2>{formulario.nombre} · {U.nombrePeriodo(app.periodo)}</h2>{cargando ? <Icono nombre="cargando" className="girando texto-3" /> : null}</div>
            <div className="tarjeta-cuerpo">{vigentes ? delMes : error ? <Alerta tipo="error"><strong>No se pudieron cargar tus envíos.</strong> Revisa la conexión y vuelve a intentarlo. <div className="mt-2"><Boton tam="sm" icono="refrescar" onClick={() => recargar()}>Reintentar</Boton></div></Alerta> : <Esqueleto filas={2} />}</div>
          </div>
        )}
        {enPagina ? (
          <section id="formulario-del-periodo" className="grid gap-3 scroll-mt-20" aria-label={`${formulario.nombre} de ${U.nombrePeriodo(app.periodo)}`}>
            <div><h2>{textoEnPagina.titulo}</h2><p className="text-sm texto-2 mt-0.5">{textoEnPagina.ayuda}</p></div>
            <FormularioEnvio key={`${contrato.id}-${app.periodo}-${enPagina.modo}-${enPagina.envioId || ''}`} formularioId={formulario.id} modo={enPagina.modo} envioId={enPagina.envioId || ''} incrustado alEnviar={recargar} />
          </section>
        ) : null}
        <div className="tarjeta">
          <div className="tarjeta-cabecera"><h2>{p.anteriores}</h2></div>
          <Tabla cargando={cargando} filas={envios} vacio={<Vacio icono={p.icono} titulo="Sin envíos" texto={p.ninguno} />}
            columnas={[
              { titulo: 'Período', render: (e) => <span className="mono">{U.nombrePeriodo(e.periodo)}</span> },
              { titulo: 'No.', render: (e) => <span className="mono">{e.consecutivo}</span> },
              { titulo: 'Estado', render: (e) => <span className="flex items-center gap-1 flex-wrap"><ChipEstado estado={e.estado} />{correccionVigente(e, ahora) ? <Chip tipo="alerta" icono="reloj">hasta {U.fechaCorta(e.fechaLimiteCorreccion)}</Chip> : null}</span> },
              { titulo: 'Enviado', render: (e) => <span className="mono text-xs">{U.fechaHora(e.enviadoEn)}</span> },
            ]} acciones={(e) => acciones(e, true)} />
        </div>
      </div>
      {detalle ? <DetalleEnvio envio={detalle} onCerrar={() => setDetalle(null)} /> : null}
      {solicitar ? <ModalNuevaSolicitud envioInicial={solicitar} onCerrar={() => setSolicitar(null)} onCreada={() => { setSolicitar(null); recargar(); app.recargarContadores(); }} /> : null}
    </div>
  );
};

/* ===== 6. Contrato ===== */
const VistaInfoContrato = ({ contrato }) => {
  const app = useApp();
  const f = formularioInfo(app);
  const R = infoARespuestas(f, contrato.info);
  const ev = Formulas.crearEvaluador({ formulario: f, respuestas: R, parametros: app.parametros });
  return (
    <div className="grid gap-4">
      {(f.capitulos || []).map((cap) => (
        <div key={cap.id} className="tarjeta">
          <div className="tarjeta-cabecera"><h3>{cap.nombre}</h3>{cap.id === 'contratista' && contrato.contratistaUid ? <Chip tipo="exito" icono="check">Cuenta vinculada</Chip> : null}{cap.id === 'contratista' && !contrato.contratistaUid ? <Chip tipo="alerta" icono="reloj">Sin cuenta</Chip> : null}</div>
          <div className="tarjeta-cuerpo">
            <ListaDatos items={(cap.preguntas || []).filter((q) => q.tipo !== 'SEPARADOR').map((q) => {
              if (q.tipo === 'COMPUESTA') {
                const filas = Array.isArray(R[q.id]) ? R[q.id] : [];
                const subs = (q.subpreguntas || []).filter((s) => s.tipo !== 'SEPARADOR');
                return { etiqueta: q.etiqueta, valor: filas.length ? <div className="tabla-envoltura"><table className="tabla"><thead><tr>{subs.map((s) => <th key={s.id}>{s.etiqueta}</th>)}</tr></thead><tbody>{filas.map((fila, i) => <tr key={i}>{subs.map((s) => <td key={s.id} className="whitespace-pre-wrap">{s.tipo === 'CALCULADA' ? Descargas.formatearCalculada(s, ev.valorFila(q.id, i, s.id)) : Descargas.valorLegible(s, fila[s.id], app.catalogos)}</td>)}</tr>)}</tbody></table></div> : '' };
              }
              const v = q.tipo === 'CALCULADA' ? Descargas.formatearCalculada(q, ev.valor(q.id)) : Descargas.valorLegible(q, R[q.id], app.catalogos);
              return { etiqueta: q.etiqueta, valor: v, mono: ['MONEDA', 'FECHA', 'NUMERO', 'TELEFONO'].includes(q.tipo) };
            })} />
          </div>
        </div>
      ))}
    </div>
  );
};
const EditorInfoContrato = ({ contrato, onCerrar, onGuardado }) => {
  const app = useApp();
  const f = formularioInfo(app);
  const esRevision = app.rol !== 'contratista';
  const [guardando, setGuardando] = useState(false);
  const ctx = useMemo(() => ({ usuario: contrato.contratistaUid === app.usuario.id ? app.usuario : { nombreCompleto: (contrato.info && contrato.info.contratista && contrato.info.contratista.nombreCompleto) || '', cedula: contrato.cedulaContratista || '' }, contrato, parametros: app.parametros, catalogos: app.catalogos, periodo: U.recortarPeriodo(app.periodo, contrato) || U.rangoPeriodo(app.periodo) }), [contrato, app.usuario, app.parametros, app.catalogos, app.periodo]);
  const puedeEditar = (q, cap) => (esRevision ? true : cap.id === 'contratista' && !q.soloRevisor);
  const guardar = async (respuestas) => {
    setGuardando(true);
    try {
      // Se guarda con _manual (al reabrir se respeta lo vaciado a mano), pero la comparación y
      // «Cambios» van sin claves internas: así no se registran cambios que no existen.
      const nuevaInfo = respuestasAInfo(f, sinIdsDeFila(respuestas));
      const limpia = (info) => Object.fromEntries(Object.entries(info || {}).map(([c, v]) => [c, v && typeof v === 'object' && !Array.isArray(v) ? sinClavesInternas(v) : v]));
      const anterior = limpia(contrato.info), nueva = limpia(nuevaInfo);
      const parcial = {};
      const capitulos = esRevision ? (f.capitulos || []).map((c) => c.id) : ['contratista'];
      capitulos.forEach((capId) => { if (!U.igualProfundo(anterior[capId] || {}, nueva[capId] || {})) parcial[`info.${capId}`] = nuevaInfo[capId]; });
      const cambios = U.diferencias(Object.fromEntries(capitulos.map((c) => [c, anterior[c] || {}])), Object.fromEntries(capitulos.map((c) => [c, nueva[c] || {}])));
      if (!Object.keys(parcial).length) { app.avisar('info', 'No hay cambios por guardar'); onCerrar(); return; }
      await DB.actualizarContrato(contrato.id, parcial, { por: app.usuario.id, cambios });
      app.avisar('exito', 'Información del contrato guardada');
      onGuardado();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  return (
    <div>
      <Encabezado titulo={`Editar · ${contrato.numero}`} subtitulo={esRevision ? 'Como revisor puedes editar todos los capítulos.' : 'Puedes actualizar tus datos (capítulo «Datos del contratista»). El resto lo edita el revisor.'} migas={[{ texto: 'Contrato', onClick: onCerrar }, { texto: 'Editar' }]} />
      <MotorFormulario formulario={f} ctx={ctx} respuestasIniciales={infoARespuestas(f, contrato.info)} puedeEditar={puedeEditar} onEnviar={guardar} textoEnviar={guardando ? 'Guardando…' : 'Guardar cambios'} acciones={<Boton onClick={onCerrar}>Cancelar</Boton>} />
    </div>
  );
};
const PaginaContrato = () => {
  const app = useApp();
  const contrato = app.contrato;
  const [pestana, setPestana] = useState('info');
  const [editando, setEditando] = useState(false);
  const [solicitar, setSolicitar] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const { datos, cargando, recargar } = useCarga(async () => {
    if (!contrato) return null;
    const [envios, cambios] = await Promise.all([DB.listarEnvios({ rol: app.rol, uid: app.usuario.id, contratoId: contrato.id }), DB.listarCambios(contrato.id).catch(() => [])]);
    return { envios, cambios };
  }, [contrato && contrato.id]);
  if (!contrato) return <Vacio icono="contrato" titulo="Sin contrato seleccionado" texto="Elige un contrato en la barra superior." />;
  if (editando) return <EditorInfoContrato contrato={contrato} onCerrar={() => setEditando(false)} onGuardado={() => { setEditando(false); app.recargarTodo(); recargar(); }} />;
  const puedeEditar = app.rol !== 'contratista' || contrato.permitirActualizar;
  const alternarPermiso = async () => {
    try { await DB.actualizarContrato(contrato.id, { permitirActualizar: !contrato.permitirActualizar }); app.avisar('exito', contrato.permitirActualizar ? 'Edición del contratista cerrada' : 'Edición del contratista habilitada'); app.recargarTodo(); }
    catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  return (
    <div>
      <Encabezado titulo={contrato.numero} subtitulo={`${contrato.etiqueta ? `${contrato.etiqueta} · ` : ''}${contrato.estado === 'terminado' ? 'Terminado' : 'Activo'}${contrato.info && contrato.info.contratista && contrato.info.contratista.nombreCompleto ? ` · ${contrato.info.contratista.nombreCompleto}` : ''}`}
        acciones={<>
          {app.rol !== 'contratista' ? <Conmutador activo={!!contrato.permitirActualizar} onCambio={alternarPermiso} etiqueta="Permitir que el contratista actualice sus datos" id="perm-actualizar" /> : null}
          {puedeEditar ? <Boton tam="sm" variante="primario" icono="editar" onClick={() => setEditando(true)}>Editar</Boton> : <Boton tam="sm" icono="chat" onClick={() => setSolicitar(true)}>Solicitar actualización</Boton>}
        </>} />
      {app.rol === 'contratista' && !contrato.permitirActualizar ? <Alerta tipo="info" className="mb-4">La edición de tus datos está cerrada. Si algo cambió, crea una solicitud de actualización y el revisor la habilitará.</Alerta> : null}
      <Pestanas activa={pestana} onCambio={setPestana} lista={[{ id: 'info', etiqueta: 'Información del contrato', icono: 'contrato' }, { id: 'envios', etiqueta: 'Envíos del contrato', icono: 'envios', contador: 0 }, { id: 'cambios', etiqueta: 'Cambios', icono: 'reloj' }]} />
      <div className="mt-4">
        {pestana === 'info' && app.rol === 'admin' && contrato.contratistaUid === app.usuario.id ? (
          <div className="alerta-caja alerta-info mb-4 items-center flex-wrap"><Icono nombre="usuario" /><div className="flex-1 min-w-0 text-sm"><strong>Este contrato es tuyo.</strong> Tu informe y tu cuenta de cobro se diligencian desde tu vista de contratista.</div><Boton tam="xs" variante="primario" icono="contrato" onClick={() => app.cambiarVista('contratista')}>Ir a mi vista de contratista</Boton></div>
        ) : pestana === 'info' && app.rol === 'admin' && contrato.contratistaUid ? (
          <div className="alerta-caja alerta-info mb-4 items-center flex-wrap"><Icono nombre="escudo" /><div className="flex-1 min-w-0 text-sm"><strong>Diligenciar en nombre del contratista</strong> ({U.nombrePeriodo(app.periodo)}): queda auditado con tu usuario en el historial.</div><div className="flex gap-2 flex-wrap">{app.formularios.filter((f) => f.activo && f.tipo !== 'INFO_CONTRATO').map((f) => <Boton key={f.id} tam="xs" icono="editar" onClick={() => app.navegar(`#/formulario/${f.id}?modo=nuevo`)}>{f.nombre}</Boton>)}</div></div>
        ) : null}
        {pestana === 'info' ? <VistaInfoContrato contrato={contrato} /> : null}
        {pestana === 'envios' ? (
          <Tabla cargando={cargando} filas={(datos && datos.envios) || []} vacio={<Vacio icono="envios" titulo="Sin envíos en este contrato" />}
            columnas={[
              { titulo: 'Fecha y hora', render: (e) => <span className="mono text-xs">{U.fechaHora(e.enviadoEn)}</span> },
              { titulo: 'Período', render: (e) => <span className="mono">{U.nombrePeriodo(e.periodo)}</span> },
              { titulo: 'Proceso', render: (e) => nombreFormulario(app, e.formularioId) },
              { titulo: 'No.', render: (e) => <span className="mono">{e.consecutivo}</span> },
              { titulo: 'Revisor', render: (e) => { const h = (e.historial || []).filter((x) => x.rol === 'revisor' || x.rol === 'coordinador').slice(-1)[0]; return h ? h.porNombre : '—'; } },
              { titulo: 'Estado', render: (e) => <ChipEstado estado={e.estado} /> },
            ]} acciones={(e) => <><AccionesEnvio envio={e} compacto /><Boton tam="xs" variante="fantasma" icono="lista" onClick={() => setDetalle(e)}>Detalle</Boton></>} />
        ) : null}
        {pestana === 'cambios' ? (
          <Tabla cargando={cargando} filas={(datos && datos.cambios) || []} vacio={<Vacio icono="reloj" titulo="Sin cambios registrados" />}
            columnas={[
              { titulo: 'Fecha', render: (c) => <span className="mono text-xs">{U.fechaHora(c.fecha)}</span> },
              { titulo: 'Por', render: (c) => (c.por === app.usuario.id ? 'Tú' : c.por) },
              { titulo: 'Campos', render: (c) => <table className="diff-tabla text-xs"><tbody>{Object.keys(c.campos || {}).slice(0, 12).map((k) => <tr key={k}><td className="pr-2">{k}</td><td className="diff-antes pr-2">{U.limitar(U.valorLegible(c.campos[k].antes), 40)}</td><td className="diff-despues">{U.limitar(U.valorLegible(c.campos[k].despues), 40)}</td></tr>)}{Object.keys(c.campos || {}).length > 12 ? <tr><td colSpan={3} className="texto-3">… y {Object.keys(c.campos).length - 12} más</td></tr> : null}</tbody></table> },
            ]} />
        ) : null}
      </div>
      {detalle ? <DetalleEnvio envio={detalle} onCerrar={() => setDetalle(null)} /> : null}
      {solicitar ? <ModalNuevaSolicitud onCerrar={() => setSolicitar(false)} onCreada={() => { setSolicitar(false); app.recargarContadores(); }} /> : null}
    </div>
  );
};

/* ===== 7. Formulario ===== */
// Capítulo de las actividades (la compuesta que sale de las obligaciones del contrato): por ahí empieza
// el informe en la página «Generación de informe de gestión».
const capituloDeActividades = (formulario) => {
  const c = (formulario.capitulos || []).find((cap) => (cap.preguntas || []).some((q) => q.tipo === 'COMPUESTA' && q.origenFilas));
  return c ? c.id : undefined;
};
const PaginaFormulario = () => {
  const app = useApp();
  const q = app.ruta.query || {};
  return <FormularioEnvio formularioId={app.ruta.params[0]} modo={q.modo || 'nuevo'} envioId={q.envio ? decodeURIComponent(q.envio) : ''} />;
};
// El formulario de un envío (nuevo · corrección · ver), en su propia pantalla (#/formulario/…) o
// «incrustado» en la página de su proceso: allí empieza en las actividades, uno nuevo sigue el borrador
// sin preguntar y, al enviar o reenviar, avisa a la página (alEnviar) en vez de cambiar de pantalla.
const FormularioEnvio = ({ formularioId, modo = 'nuevo', envioId = '', incrustado = false, alEnviar }) => {
  const app = useApp();
  const sigueBorrador = incrustado && modo === 'nuevo';
  const formulario = app.formularios.find((f) => f.id === formularioId);
  const contratoBarra = app.contrato;
  const [previa, setPrevia] = useState(null);
  const [firmando, setFirmando] = useState(null);   // { titulo, mensaje, textoOk, resolver }: modal de firma en línea
  const [estadoGuardado, setEstadoGuardado] = useState({ fecha: null, guardando: false, error: null });
  // Decisión sobre el borrador ('continuar' | 'nuevo') de ESTOS datos: al cambiar de contrato o de
  // período se vuelve a preguntar por el borrador del contexto nuevo.
  const [decision, setDecision] = useState({ para: null, valor: null });
  const ultimoGuardado = useRef(null);
  const respuestasActuales = useRef(null);   // lo que hay en pantalla (MotorFormulario.onCambioRespuestas)
  const capituloActual = useRef(null);       // el capítulo en pantalla, para el borrador que se guarda al subir
  const hayCambios = useRef(false);          // se editó algo desde que se abrió
  const subiendo = useRef(0);                // archivos subiendo (MotorFormulario.onCambioSubidas)
  const montado = useRef(true);
  const control = useRef(null);              // del motor: { pendiente(), vaciar() } del autoguardado
  useEffect(() => () => { montado.current = false; }, []);
  // Salir con un archivo subiendo, o de una corrección con cambios (no tiene borrador), se confirma:
  // con «Salir», los menús, Atrás, el contrato, el período o al cerrar la pestaña. Cerrar o recargar
  // la pestaña con un autoguardado pendiente también avisa (y ese guardado se hace ya). Incrustado,
  // cambiar el período o el contrato de la barra también quita la corrección de la página.
  useEffect(() => {
    const vaciar = () => (control.current ? control.current.vaciar() : null);
    app.fijarGuardaSalida((tipo) => {
      // Una corrección o consulta usa el contrato y el período del envío: la barra no la cambia.
      if (envioId && !incrustado && (tipo === 'contrato' || tipo === 'periodo')) return null;
      const archivo = subiendo.current > 0;
      const cambios = modo === 'correccion' && hayCambios.current;
      if (archivo && cambios) return { titulo: 'Salir sin reenviar', mensaje: 'Hay un archivo subiendo que no quedará adjunto y, en una corrección, los cambios solo se guardan al reenviarla. Si sales ahora, se pierden.' };
      if (archivo) return { titulo: 'Hay un archivo subiendo', mensaje: 'Si sales ahora, el archivo que se está subiendo no quedará adjunto.' };
      if (cambios) return { titulo: 'Salir sin reenviar', mensaje: 'En una corrección los cambios solo se guardan al reenviarla. Si sales ahora, se pierden.' };
      if (tipo === 'cerrar' && control.current && control.current.pendiente()) { vaciar(); return { titulo: 'Cambios sin guardar', mensaje: 'Los últimos cambios se están guardando.' }; }
      return null;
    }, vaciar);
    // Al ocultar o cerrar la página, lo pendiente se guarda ya (en el celular la pestaña puede cerrarse sola).
    const alOcultar = () => { if (document.visibilityState === 'hidden') vaciar(); };
    window.addEventListener('pagehide', vaciar);
    document.addEventListener('visibilitychange', alOcultar);
    return () => { app.fijarGuardaSalida(null); window.removeEventListener('pagehide', vaciar); document.removeEventListener('visibilitychange', alOcultar); };
  }, [modo, envioId]); // eslint-disable-line
  const { datos, cargando, error } = useCarga(async () => {
    if (!formulario) return null;
    const uid = app.usuario.id;
    // Con las reglas, leer un documento que no existe (o ajeno) da «permiso denegado»: se trata como que falta.
    const sinPermisoEsNulo = (e) => { if (e && e.code === 'permission-denied') return null; throw e; };
    const envio = envioId ? await DB.obtenerEnvio(envioId).catch(sinPermisoEsNulo) : null;
    if (envioId && !envio) return { falta: 'envio' };
    // Corrección o consulta: el contrato es el del envío, no el elegido en la barra.
    const contrato = envio ? (app.contratos.find((c) => c.id === envio.contratoId) || await DB.obtenerContrato(envio.contratoId).catch(sinPermisoEsNulo)) : contratoBarra;
    if (!contrato) return envio ? { falta: 'contrato' } : null;
    const periodo = envio ? envio.periodo : app.periodo;
    // El admin diligencia en nombre del contratista: los datos del Word salen del perfil del contratista, no del suyo.
    let usuarioFormulario = app.usuario;
    if (app.rol !== 'contratista') {
      const perfil = contrato.contratistaUid ? await DB.obtenerPerfil(contrato.contratistaUid).catch(() => null) : null;
      const ic = (contrato.info && contrato.info.contratista) || {};
      usuarioFormulario = perfil || { id: contrato.contratistaUid, nombreCompleto: ic.nombreCompleto || '', nombreCorto: U.nombreCorto(...String(ic.nombreCompleto || '').split(/\s+(.*)/)), cedula: contrato.cedulaContratista || ic.cedula || '', correo: contrato.correoContratista || '' };
    }
    const idBorrador = DB.idBorrador(uid, contrato.id, formulario.id, periodo);
    const [borrador, contador, lista] = await Promise.all([
      modo === 'nuevo' ? DB.obtenerBorrador(idBorrador).catch(() => undefined) : Promise.resolve(null),   // undefined: no se pudo leer
      DB.obtenerContador(contrato.id, formulario.id).catch(() => null),
      DB.listarEnvios({ rol: app.rol, uid, contratoId: contrato.id, formularioId: formulario.id }),
    ]);
    const enviosPeriodo = lista.filter((e) => e.periodo === periodo);
    // Último envío distinto del que se corrige: fuente de «Traer del mes anterior».
    const ultimo = lista.find((e) => e.id !== envioId) || null;
    let local;
    try { local = JSON.parse(localStorage.getItem(`bitacora.borrador.${idBorrador}`) || 'null'); } catch (e) { local = null; }
    if (local && local.respuestas) local = { ...local, actualizadoEn: new Date(local.actualizadoEn || Date.now()) };
    else local = null;
    // Una copia ya confirmada que el servidor no tiene: el borrador se descartó o se envió en otro lado.
    if (local && borrador === null && local.pendiente === false) { try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ } local = null; }
    // La copia local gana si no llegó al servidor (p. ej. se cerró la pestaña o la sesión antes) y es más nueva.
    const fechaServidor = borrador && borrador.actualizadoEn ? new Date(borrador.actualizadoEn).getTime() : 0;
    const usarLocal = local && (!borrador || (local.pendiente && local.actualizadoEn.getTime() > fechaServidor));
    return { envio, contrato, periodo, idBorrador, contratoId: contrato.id, formularioIdBorrador: formulario.id, borrador: usarLocal ? { ...local, soloLocal: true } : (borrador || null), contador, enviosPeriodo, ultimo, usuarioFormulario };
  }, [formularioId, envioId ? '' : contratoBarra && contratoBarra.id, modo, envioId, envioId ? '' : app.periodo]);
  // Incrustado, el borrador se sigue sin preguntar; si solo estaba en este dispositivo (no llegó al
  // servidor), se sube ya, como al elegir «Continuar borrador».
  const borradorSubido = useRef(null);
  useEffect(() => {
    const b = datos && datos.borrador;
    if (!sigueBorrador || !b || !b.soloLocal || borradorSubido.current === datos) return;
    borradorSubido.current = datos;
    DB.guardarBorrador(datos.idBorrador, { uid: app.usuario.id, contratoId: datos.contratoId, formularioId: datos.formularioIdBorrador, periodo: datos.periodo, respuestas: b.respuestas, capituloActual: b.capituloActual || null }).catch(() => {});
  }, [datos]); // eslint-disable-line

  if (!formulario) return <Vacio icono="formulario" titulo="Formulario no encontrado" accion={<Boton onClick={() => app.navegar('#/inicio')}>Volver al inicio</Boton>} />;
  if (!contratoBarra && !envioId) return <Vacio icono="contrato" titulo="Elige un contrato" texto="Selecciona el contrato en la barra superior." />;
  if (cargando) return <Cargando texto="Preparando el formulario…" />;
  if (error) return <Alerta tipo="error">{DB.traducirError(error)}</Alerta>;
  if (!datos) return <Vacio icono="contrato" titulo="Elige un contrato" texto="Selecciona el contrato en la barra superior." />;
  if (datos.falta === 'envio') return <Alerta tipo="error">El envío no existe o ya no tienes acceso a él.</Alerta>;
  if (datos.falta === 'contrato') return <Alerta tipo="error">El contrato de este envío ya no existe o ya no tienes acceso a él, así que no se puede abrir aquí. Si necesitas corregirlo, habla con el administrador.</Alerta>;
  const { envio, periodo, idBorrador, contratoId, formularioIdBorrador, borrador, contador, enviosPeriodo, ultimo, usuarioFormulario } = datos;
  // El contrato al día (p. ej. tras «Actualizar datos»), del mismo id que el cargado.
  const contrato = app.contratos.find((c) => c.id === contratoId) || datos.contrato;
  const decisionBorrador = decision.para === datos ? decision.valor : (sigueBorrador && borrador ? 'continuar' : null);
  const setDecisionBorrador = (valor) => setDecision({ para: datos, valor });
  const enNombreDeOtro = app.rol !== 'contratista';
  const ahora = new Date();
  const rango = U.recortarPeriodo(periodo, contrato);
  const esCorreccion = modo === 'correccion';
  const correccion = esCorreccion && envio ? sinExigirLoNuevo(formulario, envio) : null;
  const esLectura = modo === 'ver';
  const ventanaOk = !requiereVentana(formulario) || U.estadoVentana(app.ventana, formulario.id, ahora).estado === 'abierta';
  const limite = limiteDe(formulario);

  const guardarBorrador = async (respuestas, capituloActual) => {
    if (esLectura) return;
    // Con el contrato y el formulario del id del borrador (no los de pantalla, que pueden haber cambiado).
    const doc = { uid: app.usuario.id, contratoId, formularioId: formularioIdBorrador, periodo, respuestas, capituloActual: capituloActual || null };
    ultimoGuardado.current = doc;
    setEstadoGuardado((s) => ({ ...s, guardando: true }));
    // Copia local marcada como pendiente hasta que el servidor confirme (ver usarLocal al cargar).
    const clave = `bitacora.borrador.${idBorrador}`;
    const local = { ...doc, actualizadoEn: new Date().toISOString(), pendiente: true };
    try { localStorage.setItem(clave, JSON.stringify(local)); } catch (e) { /* sin espacio */ }
    try {
      await DB.guardarBorrador(idBorrador, doc);
      try { if ((JSON.parse(localStorage.getItem(clave) || 'null') || {}).actualizadoEn === local.actualizadoEn) localStorage.setItem(clave, JSON.stringify({ ...local, pendiente: false })); } catch (e) { /* nada */ }
      if (montado.current) setEstadoGuardado({ fecha: new Date(), guardando: false, error: null });
    } catch (e) { if (montado.current) setEstadoGuardado({ fecha: null, guardando: false, error: 'no se guardó en el servidor (queda copia local)' }); }
  };
  // Bloqueos previos (también se validan en las reglas).
  if (esCorreccion && (!envio || !correccionVigente(envio, ahora))) return <Alerta tipo="alerta">Este envío no está en corrección o el plazo venció. Pide un nuevo plazo en <button type="button" className="underline" onClick={() => app.navegar('#/solicitudes?pestana=correcciones')}>Solicitudes</button>.</Alerta>;
  if (esLectura && !envio) return <Alerta tipo="error">El envío no existe.</Alerta>;
  if (!esCorreccion && !esLectura) {
    if (!enNombreDeOtro && !procesoHabilitado(app, formulario.tipo)) return <Vacio icono="candado" titulo={`${formulario.nombre}: deshabilitada por ahora`} texto="Cuando el administrador la habilite, podrás diligenciarla." accion={<Boton onClick={() => app.navegar('#/inicio')}>Ir al inicio</Boton>} />;
    if (!ventanaOk) return <Alerta tipo="alerta"><strong>La ventana de {U.nombrePeriodo(periodo)} no está abierta</strong> para {formulario.nombre}. Fuera de ventana solo se consulta; para corregir algo ya enviado, usa «Solicitar corrección».</Alerta>;
    if (limite != null && enviosPeriodo.length >= limite) {
      const proceso = !enNombreDeOtro && navDe(app.rol).find((n) => n.proceso === formulario.tipo);
      return <Alerta tipo="info"><strong>Ya enviaste {formulario.nombre} de {U.nombrePeriodo(periodo)}.</strong> {proceso ? <>Puedes verlo y descargarlo en «{proceso.etiqueta}»; si necesitas cambiarlo, allí mismo puedes solicitar una corrección. <div className="mt-2 flex gap-2"><Boton tam="sm" onClick={() => app.navegar(proceso.ruta)}>{proceso.etiqueta}</Boton></div></> : <>Puedes verlo en Mis envíos; si necesitas cambiarlo, crea una solicitud de corrección. <div className="mt-2 flex gap-2"><Boton tam="sm" onClick={() => app.navegar('#/envios')}>Mis envíos</Boton><Boton tam="sm" onClick={() => app.navegar('#/solicitudes')}>Solicitudes</Boton></div></>}</Alerta>;
    }
    if (!rango) return <Alerta tipo="alerta">El período {U.nombrePeriodo(periodo)} está fuera de las fechas del contrato.</Alerta>;
    if (borrador && decisionBorrador === null) {
      return (
        <Modal titulo="Tienes un borrador guardado" descripcion={`Guardado ${U.tiempoRelativo(borrador.actualizadoEn)}${borrador.soloLocal ? ' (solo en este dispositivo)' : ''}`} onCerrar={() => app.navegar('#/inicio')}
          pie={<><Boton icono="basura" onClick={async () => { try { await DB.eliminarBorrador(idBorrador); } catch (e) { /* no existía */ } try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ } setDecisionBorrador('nuevo'); }}>Empezar de nuevo</Boton><Boton variante="primario" icono="editar" onClick={() => { if (borrador.soloLocal) guardarBorrador(borrador.respuestas, borrador.capituloActual); setDecisionBorrador('continuar'); }}>Continuar borrador</Boton></>}>
          <p className="text-sm texto-2">Puedes continuar donde ibas o descartar el borrador y empezar con los valores por defecto.</p>
        </Modal>
      );
    }
  }
  const consecutivoSugerido = (contador ? Number(contador.ultimo) || 0 : 0) + 1;
  const ctx = { usuario: usuarioFormulario, contrato, parametros: app.parametros, catalogos: app.catalogos, periodo: rango || U.rangoPeriodo(periodo), consecutivo: consecutivoSugerido };
  const respuestasIniciales = esCorreccion || esLectura ? envio.respuestas : (decisionBorrador === 'continuar' && borrador ? borrador.respuestas : null);
  const puedeEditar = (qx) => {
    if (esLectura) return false;
    if (qx.soloRevisor) return false;
    if (esCorreccion && qx.editableEnCorreccion === false) return false;
    // El consecutivo solo se edita antes del primer envío del contrato (regla: nunca ≤ al último).
    if (qx.porDefecto === 'consecutivo' && contador) return false;
    return true;
  };
  const subir = async (archivo, pregunta) => {
    // El flujo lee el borrador (dueño, contrato, formulario y período) para ubicar el archivo: se
    // guarda antes de subir con lo que hay en pantalla, aunque todavía no se haya autoguardado. En
    // corrección lee el envío. Sin flujo configurado no hace falta (subirArchivo avisa de una vez).
    // Sin red, Firestore no confirma la escritura: a los 15 s se avisa en vez de dejar la subida girando.
    if (!esCorreccion && respuestasActuales.current && (window.MODO_DEMO || Flujos.disponible('subirArchivo'))) {
      const doc = { uid: app.usuario.id, contratoId, formularioId: formularioIdBorrador, periodo, respuestas: respuestasActuales.current, capituloActual: capituloActual.current || null };
      ultimoGuardado.current = doc;
      const guardado = await Promise.race([DB.guardarBorrador(idBorrador, doc).then(() => true, (e) => e || new Error('Error desconocido')), U.esperar(15000).then(() => null)]);
      if (guardado === null) { const e = new Error('Sin conexión: no se pudo guardar el borrador antes de subir. Revisa la red e inténtalo de nuevo'); e.code = 'sin-red'; throw e; }
      if (guardado !== true) {
        console.warn('No se pudo guardar el borrador antes de subir:', guardado);
        const e = new Error(`No se pudo guardar el borrador antes de subir: ${DB.traducirError(guardado)}`); e.code = 'borrador-sin-guardar'; throw e;
      }
      if (!montado.current) { const e = new Error('Saliste del formulario antes de que empezara la subida; no se subió'); e.code = 'cancelado'; throw e; }
    }
    return Flujos.subirArchivo({ origen: esCorreccion ? 'envio' : 'borrador', docId: esCorreccion ? envio.id : idBorrador, preguntaId: pregunta.id, archivo, maxMB: pregunta.maxMB || 15 });
  };
  const armarDocumentos = async (respuestas, voBoTexto) => {
    const foto = Descargas.armarFoto(formulario, respuestas, { catalogos: app.catalogos, parametros: app.parametros });
    const datosDescarga = Descargas.armarDatosDescarga({ formulario, respuestas, contrato, usuario: usuarioFormulario, parametros: app.parametros, catalogos: app.catalogos, voBoTexto });
    const anexos = Descargas.recolectarAnexos(formulario, respuestas);
    const totales = Descargas.armarTotales(formulario, respuestas, { parametros: app.parametros });
    return { foto, datosDescarga, anexos, totales };
  };
  // El Word de lo que va diligenciado (sin enviar): para la vista previa y para «Descargar Word».
  const wordDe = async (respuestas) => {
    const docs = await armarDocumentos(respuestas, '');
    let firma = null;
    try { firma = usuarioFormulario.id ? await DB.obtenerFirma(usuarioFormulario.id) : null; } catch (e) { firma = null; }
    const envioTemporal = { ...docs, formularioId: formulario.id, contratoId: contrato.id, periodo, estado: 'borrador', consecutivo: respuestas.numeroInforme || respuestas.numeroCuenta || consecutivoSugerido, respuestas };
    return () => Descargas.generarDocx({ envio: envioTemporal, formulario, contrato, usuario: usuarioFormulario, parametros: app.parametros, firma });
  };
  const vistaPrevia = async (respuestas) => { setPrevia({ generar: await wordDe(respuestas) }); };
  const descargarWord = async (respuestas) => {
    try { const { blob, nombre } = await (await wordDe(respuestas))(); U.descargarBlob(blob, nombre); }
    catch (e) { console.error(e); app.avisar('error', `No se pudo generar el Word: ${e.message}`); }
  };
  // Después de enviar: la página del proceso (el informe o la cuenta de cobro) o, si no tiene, Mis envíos.
  const procesoMenu = !enNombreDeOtro && navDe(app.rol).find((n) => n.proceso === formulario.tipo);
  const trasEnviar = () => { if (alEnviar) alEnviar(); else app.navegar(procesoMenu ? procesoMenu.ruta : '#/envios'); };
  const empezarDeNuevo = async () => {
    if (!(await app.confirmar({ titulo: 'Empezar de nuevo', mensaje: `Se borra lo que llevas de ${formulario.nombre} de ${U.nombrePeriodo(periodo)} y el formulario vuelve a sus valores iniciales.`, textoOk: 'Borrar y empezar' }))) return;
    // El autoguardado pendiente (o en curso) termina antes de borrar: si no, al desmontarse el
    // formulario lo guardaría de nuevo y lo descartado volvería.
    if (control.current) await control.current.vaciar();
    try { await DB.eliminarBorrador(idBorrador); } catch (e) { /* no existía */ }
    try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ }
    setEstadoGuardado({ fecha: null, guardando: false, error: null });
    setDecisionBorrador('nuevo');
  };
  const enviar = async (respuestasMotor) => {
    // Corrección de un envío sin camposPlantilla: lo nuevo que quedó vacío no se guarda (sinNuevosVacios).
    const respuestas = correccion && !Array.isArray(envio.camposPlantilla) ? sinNuevosVacios(respuestasMotor, correccion.relajados) : respuestasMotor;
    const texto = esCorreccion ? '¿Reenviar el envío corregido? Volverá al revisor en el mismo paso.' : `¿Enviar ${formulario.nombre} de ${U.nombrePeriodo(periodo)}? ${limite != null ? 'Después de enviar solo podrás cambiarlo con una solicitud de corrección.' : ''}`;
    // El informe se firma en línea al enviarlo (quien diligencia en nombre del contratista no firma por él).
    let firma = null;
    if (admiteFirmaEnLinea(formulario) && !enNombreDeOtro) {
      const textoOk = esCorreccion ? 'Firmar y reenviar' : 'Firmar y enviar';
      firma = await new Promise((resolver) => setFirmando({ titulo: textoOk, mensaje: texto, textoOk, resolver }));
      if (!firma) return;
    } else if (!(await app.confirmar({ titulo: esCorreccion ? 'Reenviar corrección' : 'Enviar formulario', mensaje: texto, textoOk: esCorreccion ? 'Reenviar' : 'Enviar' }))) return;
    // El informe va al correo del validador después de mostrarse enviado (no hace esperar a nadie); si
    // falla, el aviso lo dice y queda el botón «Enviar al validador».
    const alValidador = (envioId) => {
      if (!admiteFirmaEnLinea(formulario)) return;
      DB.obtenerEnvio(envioId).then((e) => (e ? enviarAlValidador(app, e, formulario) : null)).catch((err) => console.error(err));
    };
    // La firma va aparte del envío (envios/{id}/firmas): si no se guarda, el envío vale igual y el Word
    // usa la firma del perfil.
    const firmarElEnvio = async (envioId) => {
      if (!firma) return;
      try { await DB.firmarEnvio(envioId, 'contratista', { ...firma, uid: app.usuario.id, nombre: app.usuario.nombreCompleto, rol: app.rol }); }
      catch (e) { console.error(e); app.avisar('alerta', `Se envió, pero la firma en línea no se guardó (${motivoFirma(e)}). El Word usa la firma de tu perfil.`); }
    };
    try {
      const docs = await armarDocumentos(respuestas, '');
      const fecha = new Date();
      if (esCorreccion) {
        const entrada = { estado: 'reenviado', por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha, observacion: '' };
        await DB.actualizarEnvio(envio.id, { respuestas, ...docs, estado: 'reenviado', enCorreccion: false, historial: [...(envio.historial || []), entrada] });
        await firmarElEnvio(envio.id);
        // Las solicitudes aprobadas que incluían este envío pasan a finalizada.
        try {
          const aprobadas = await DB.listarSolicitudes({ rol: app.rol, uid: app.usuario.id, contratoId: contrato.id, estado: 'aprobada' });
          for (const s of aprobadas.filter((x) => (x.envioIds || []).includes(envio.id))) await DB.actualizarSolicitud(s.id, { estado: 'finalizada' });
        } catch (e) { console.warn('No se pudo finalizar la solicitud', e); }
        await Flujos.notificar({ evento: 'envio', coleccion: 'envios', docId: envio.id, por: app.usuario.id });
        try { await DB.eliminarBorrador(idBorrador); } catch (e) { /* nada */ }
        try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ }
        app.avisar('exito', 'Corrección reenviada');
        app.recargarContadores();
        hayCambios.current = false;
        trasEnviar();
        alValidador(envio.id);
        return true;
      }
      const flujo = (formulario.config && formulario.config.flujoEstados) || [];
      const consecutivo = Number(respuestas.numeroInforme || respuestas.numeroCuenta) || consecutivoSugerido;
      if (contador && consecutivo <= Number(contador.ultimo)) { app.avisar('error', `El consecutivo debe ser mayor que ${contador.ultimo}`); return; }
      const envioNuevo = {
        contratoId: contrato.id, formularioId: formulario.id, formularioVersion: Number(formulario.version) || 1,
        camposPlantilla: U.camposDePlantilla(formulario), periodo, n: enviosPeriodo.length + 1,
        contratistaUid: contrato.contratistaUid, revisores: contrato.revisores || [], coordinadores: contrato.coordinadores || [],
        estado: 'enviado', pasoActual: flujo.length > 1 ? flujo[1] : 'ninguno', enCorreccion: false, fechaLimiteCorreccion: null,
        respuestas, ...docs,
        historial: [{ estado: 'enviado', por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha, observacion: '' }],
      };
      const { id } = await DB.crearEnvio(envioNuevo, consecutivo);
      await firmarElEnvio(id);
      try { await DB.eliminarBorrador(idBorrador); } catch (e) { /* nada */ }
      try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ }
      await Flujos.notificar({ evento: 'envio', coleccion: 'envios', docId: id, por: app.usuario.id });
      app.avisar('exito', `${formulario.nombre} enviado · No. ${consecutivo}`);
      app.recargarContadores();
      trasEnviar();
      alValidador(id);
      return true;
    } catch (e) {
      console.error(e);
      app.avisar('error', e.code === 'permission-denied' ? 'No se pudo enviar: ya existe un envío para este período, la ventana cerró o no tienes permiso.' : DB.traducirError(e));
    }
  };
  const titulo = `${esCorreccion ? 'Corregir' : esLectura ? 'Ver' : 'Diligenciar'} · ${formulario.nombre}`;
  return (
    <div>
      {incrustado ? null : <Encabezado titulo={titulo} subtitulo={`${contrato.numero} · ${U.nombrePeriodo(periodo)}${rango ? ` · ${U.textoPeriodo(rango.desde, rango.hasta)}` : ''}${esCorreccion ? ` · plazo ${U.fechaHora(envio.fechaLimiteCorreccion)}` : ''}`} migas={[{ texto: 'Inicio', onClick: () => app.navegar('#/inicio') }, { texto: formulario.nombre }]} />}
      {esCorreccion && envio.historial && envio.historial.length ? <Alerta tipo="alerta" className="mb-4"><strong>Observación del revisor:</strong> {envio.historial.slice(-1)[0].observacion || '—'}</Alerta> : null}
      {enNombreDeOtro ? <Alerta tipo="info" className="mb-4">Estás diligenciando <strong>en nombre de {usuarioFormulario.nombreCompleto || 'el contratista'}</strong>. El envío quedará registrado con tu usuario y rol en el historial (auditoría); el Word sale a nombre del contratista.</Alerta> : null}
      {sigueBorrador && decisionBorrador === 'continuar' && borrador ? (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-sm texto-2">Sigues con lo que dejaste guardado.</span>
          <Boton tam="sm" variante="fantasma" icono="basura" onClick={empezarDeNuevo}>Empezar de nuevo</Boton>
        </div>
      ) : null}
      {/* La clave cambia con el contrato, el período o el envío: el motor se monta de nuevo (lo
          pendiente del anterior se guarda en su propio borrador, no en el del contexto nuevo).
          Una corrección o consulta solo depende de su envío. */}
      <MotorFormulario key={envio ? `envio-${envio.id}` : `${idBorrador}-${decisionBorrador}`} formulario={correccion ? correccion.plantilla : formulario} ctx={ctx} respuestasIniciales={respuestasIniciales} puedeEditar={puedeEditar} ultimoEnvio={ultimo}
        subir={subir} onGuardar={esLectura || esCorreccion ? null : guardarBorrador} estadoGuardado={esCorreccion ? { nota: 'En una corrección los cambios se guardan al reenviarla' } : estadoGuardado} onEnviar={esLectura ? null : enviar} onVistaPrevia={formulario.config && formulario.config.vistaPrevia ? vistaPrevia : null}
        onDescargar={formulario.config && formulario.config.vistaPrevia ? descargarWord : null}
        textoEnviar={esCorreccion ? 'Reenviar corrección' : 'Finalizar y enviar'} soloLectura={esLectura} capituloInicial={decisionBorrador === 'continuar' && borrador ? borrador.capituloActual : (incrustado ? capituloDeActividades(formulario) : undefined)}
        acciones={incrustado ? null : <Boton variante="fantasma" onClick={() => app.navegar('#/inicio')}>Salir</Boton>} controlRef={control}
        onCambioRespuestas={(r, c, cambiado) => { respuestasActuales.current = r; capituloActual.current = c; hayCambios.current = cambiado; }}
        onCambioSubidas={(n) => { subiendo.current = n; }} />
      {previa ? <VistaPreviaDocx titulo={`Vista previa · ${formulario.nombre}`} generar={previa.generar} onCerrar={() => setPrevia(null)} /> : null}
      {firmando ? <ModalFirmar titulo={firmando.titulo} mensaje={firmando.mensaje} textoOk={firmando.textoOk} onListo={(f) => { const { resolver } = firmando; setFirmando(null); resolver(f); }} /> : null}
    </div>
  );
};

/* ===== 8. Perfil y firma ===== */
// La firma del perfil dibujada en pantalla.
const ModalDibujarFirma = ({ onCerrar, onGuardar }) => {
  const pad = useRef(null);
  const [vacio, setVacio] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    const firma = pad.current && pad.current.exportar();
    if (!firma) return;
    setOcupado(true);
    try { await onGuardar(firma); } finally { setOcupado(false); }
  };
  return (
    <Modal titulo="Dibujar mi firma" ancho="ancho" onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" icono="check" cargando={ocupado} disabled={vacio} onClick={guardar}>Guardar firma</Boton></>}>
      <PadFirma padRef={pad} onCambio={setVacio} etiqueta="Recuadro para dibujar tu firma" />
    </Modal>
  );
};
const PaginaPerfil = () => {
  const app = useApp();
  const u = app.usuario;
  const [telefono, setTelefono] = useState(u.telefono || '');
  const [guardando, setGuardando] = useState(false);
  const [dibujar, setDibujar] = useState(false);
  const [claves, setClaves] = useState({ a: '', b: '' });
  const { datos: firma, recargar } = useCarga(() => DB.obtenerFirma(u.id).catch(() => null), [u.id]);
  const guardarTelefono = async () => {
    setGuardando(true);
    try { await DB.actualizarPerfil(u.id, { telefono: telefono.trim() }); app.avisar('exito', 'Teléfono guardado'); app.recargarTodo(); }
    catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  const guardarFirma = async (firma) => { await DB.guardarFirma(u.id, firma); app.avisar('exito', 'Firma guardada'); recargar(); };
  // La imagen se reduce en canvas hasta caber en 150 KB (límite del documento privado).
  const cargarFirma = async (archivo) => {
    if (!archivo) return;
    try { await guardarFirma(await firmaDeImagen(archivo)); }
    catch (e) { app.avisar(e.code === 'firma-invalida' ? 'alerta' : 'error', e.code === 'firma-invalida' ? e.message : DB.traducirError(e)); }
  };
  const quitarFirma = async () => {
    if (!(await app.confirmar({ titulo: 'Quitar firma', mensaje: 'El Word saldrá sin firma hasta que subas otra.', textoOk: 'Quitar', peligro: true }))) return;
    try { await DB.guardarFirma(u.id, { pngBase64: '', ancho: 0, alto: 0 }); recargar(); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  const cambiarClave = async () => {
    if (claves.a.length < 6) { app.avisar('alerta', 'Mínimo 6 caracteres'); return; }
    if (claves.a !== claves.b) { app.avisar('alerta', 'Las contraseñas no coinciden'); return; }
    try { await Auth.cambiarClave(claves.a); app.avisar('exito', 'Contraseña actualizada'); setClaves({ a: '', b: '' }); } catch (e) { app.avisar('error', Auth.traducirError(e)); }
  };
  return (
    <div>
      <Encabezado titulo="Mi perfil" subtitulo="Datos de la cuenta, firma para el Word y preferencias." />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="tarjeta"><div className="tarjeta-cabecera"><h2>Datos</h2><Chip tipo="primario">{U.ROLES[app.rol]}</Chip></div><div className="tarjeta-cuerpo grid gap-4">
          <ListaDatos items={[{ etiqueta: 'Nombre', valor: u.nombreCompleto }, { etiqueta: 'Cédula', valor: u.cedula, mono: true }, { etiqueta: 'Correo', valor: u.correo }, app.rol === 'contratista' && app.contrato ? { etiqueta: 'Correos de revisores', valor: (app.contrato.correosRevisores || []).join(', ') } : null]} />
          <Campo etiqueta="Teléfono" id="perfil-tel"><div className="flex gap-2"><Entrada id="perfil-tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /><Boton variante="primario" cargando={guardando} onClick={guardarTelefono}>Guardar</Boton></div></Campo>
          <Campo etiqueta="Tema"><Segmentado etiqueta="Tema" valor={app.tema} opciones={[{ valor: 'claro', etiqueta: 'Claro' }, { valor: 'oscuro', etiqueta: 'Oscuro' }]} onCambio={(v) => { if (v !== app.tema) app.alternarTema(); }} /></Campo>
        </div></div>
        <div className="grid gap-4">
          <div className="tarjeta"><div className="tarjeta-cabecera"><h2>Firma para el Word</h2></div><div className="tarjeta-cuerpo grid gap-3">
            <p className="text-sm texto-2">Dibújala aquí o sube una imagen PNG con fondo transparente (máx. 150 KB). Es la que se propone al firmar en línea el informe y se escala al recuadro del formato (2,35″ × 0,41″) conservando la proporción.</p>
            {firma && firma.pngBase64 ? <div className="flex items-center gap-3 flex-wrap"><img className="firma-vista" alt="Firma actual" src={`data:image/png;base64,${firma.pngBase64}`} /><Boton tam="sm" variante="fantasma" icono="basura" onClick={quitarFirma}>Quitar</Boton></div> : <span className="texto-3 text-sm">Sin firma guardada: al firmar en línea la dibujas en el momento.</span>}
            <div className="grid sm:grid-cols-2 gap-2">
              <Boton icono="firma" onClick={() => setDibujar(true)}>Dibujar mi firma</Boton>
              <label className="zona-soltar block cursor-pointer" style={{ padding: '0.6rem' }}><input type="file" className="sr-solo" accept="image/png,image/jpeg,image/webp" onChange={(e) => { cargarFirma(e.target.files[0]); e.target.value = ''; }} /><div className="flex items-center justify-center gap-2 text-sm"><Icono nombre="subir" /> Subir imagen de la firma</div></label>
            </div>
            {dibujar ? <ModalDibujarFirma onCerrar={() => setDibujar(false)} onGuardar={async (f) => { try { await guardarFirma(f); setDibujar(false); } catch (e) { app.avisar('error', DB.traducirError(e)); } }} /> : null}
          </div></div>
          {!MODO_DEMO ? <div className="tarjeta"><div className="tarjeta-cabecera"><h2>Contraseña</h2></div><div className="tarjeta-cuerpo grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3"><Campo etiqueta="Nueva contraseña" id="clave-a"><Entrada id="clave-a" type="password" autoComplete="new-password" value={claves.a} onChange={(e) => setClaves({ ...claves, a: e.target.value })} /></Campo><Campo etiqueta="Repetir" id="clave-b"><Entrada id="clave-b" type="password" autoComplete="new-password" value={claves.b} onChange={(e) => setClaves({ ...claves, b: e.target.value })} /></Campo></div>
            <Boton icono="candado" onClick={cambiarClave} className="justify-self-start">Cambiar contraseña</Boton>
          </div></div> : null}
        </div>
      </div>
    </div>
  );
};
