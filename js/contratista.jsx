/* ============================================================================
   12) contratista.jsx — pantallas del contratista (y páginas compartidas)
   Estructura:
     1. Utilidades de página: info del contrato → respuestas, completitud, correcciones vigentes
     2. Tablero del período (inicio del contratista)
     3. Mis envíos (+ detalle del envío, descarga, vista previa, solicitar corrección)
     4. Solicitudes del contratista (solicitudes + correcciones pendientes)
     5. Contrato (información, envíos del contrato, cambios; edición con el motor)
     6. Formulario (nuevo · corrección · ver)
     7. Perfil y firma
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
// En corrección no se exige lo que la plantilla base agregó después del envío: una pregunta o
// subpregunta con desdeVersion mayor que la versión base del envío (p. ej. la evidencia por
// actividad, desde la v2, en un informe hecho con la v1) sigue visible, pero opcional; si es una
// compuesta, también sus subpreguntas. Los envíos anteriores a formularioVersionBase cuentan como v1.
// Una copia por plantilla y versión, para que el motor no reciba una plantilla nueva en cada render.
const plantillasDeCorreccion = new WeakMap();
const sinExigirLoNuevo = (formulario, envio) => {
  const base = Number(envio && envio.formularioVersionBase) || 1;
  const nueva = (x) => Number(x.desdeVersion) > base;
  if (!(formulario.capitulos || []).some((c) => (c.preguntas || []).some((q) => nueva(q) || (q.subpreguntas || []).some(nueva)))) return formulario;
  let porVersion = plantillasDeCorreccion.get(formulario);
  if (!porVersion) { porVersion = new Map(); plantillasDeCorreccion.set(formulario, porVersion); }
  if (!porVersion.has(base)) {
    const f = U.clonar(formulario);
    (f.capitulos || []).forEach((c) => (c.preguntas || []).forEach((q) => {
      const todaNueva = nueva(q);
      if (todaNueva) q.obligatoria = false;
      (q.subpreguntas || []).forEach((sub) => { if (todaNueva || nueva(sub)) sub.obligatoria = false; });
    }));
    porVersion.set(base, f);
  }
  return porVersion.get(base);
};
const correccionVigente = (envio, ahora = new Date()) => !!(envio && envio.enCorreccion && U.esFecha(envio.fechaLimiteCorreccion) && envio.fechaLimiteCorreccion >= ahora);
const nombreFormulario = (app, id) => { const f = app.formularios.find((x) => x.id === id); return f ? f.nombre : id; };
const limiteDe = (formulario) => (formulario.config && formulario.config.limiteMensual != null ? Number(formulario.config.limiteMensual) : null);
const requiereVentana = (formulario) => !!(formulario.config && formulario.config.requiereVentana);
// Botones de descarga / vista previa reutilizados en varias pantallas.
const AccionesEnvio = ({ envio, compacto }) => {
  const app = useApp();
  const [previa, setPrevia] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const formulario = app.formularios.find((f) => f.id === envio.formularioId);
  if (!formulario) return null;
  const contexto = async () => {
    const contrato = app.contratos.find((c) => c.id === envio.contratoId) || await DB.obtenerContrato(envio.contratoId);
    const usuario = envio.contratistaUid === app.usuario.id ? app.usuario : (await DB.obtenerPerfil(envio.contratistaUid)) || { nombreCompleto: '', nombreCorto: '' };
    let firma;
    try { firma = await DB.obtenerFirma(envio.contratistaUid); } catch (e) { firma = null; }
    return { envio, formulario, contrato, usuario, parametros: app.parametros, firma };
  };
  const generar = async () => Descargas.generarDocx(await contexto());
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
        {v ? <p className="text-sm mt-0.5">Ventana {U.textoVentana(v)}.</p> : <p className="text-sm mt-0.5">No hay ventana configurada para este período. Puedes consultar y descargar; las correcciones van por Solicitudes.</p>}
        {aviso ? <div className="prosa text-sm mt-1" dangerouslySetInnerHTML={{ __html: aviso }} /> : null}
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
  const formulariosVentana = app.formularios.filter((f) => f.activo && f.tipo !== 'INFO_CONTRATO');
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
      if (ultimo && correccionVigente(ultimo, ahora)) accion = <Boton tam="sm" variante="acento" icono="editar" onClick={() => app.navegar(`#/formulario/${f.id}?modo=correccion&envio=${encodeURIComponent(ultimo.id)}`)}>Corregir</Boton>;
      else if (ultimo && !puedeMas) accion = <AccionesEnvio envio={ultimo} compacto />;
      else if (abierta) accion = <Boton tam="sm" variante="primario" icono={borradores[f.id] ? 'editar' : 'mas'} onClick={() => app.navegar(`#/formulario/${f.id}?modo=nuevo`)}>{borradores[f.id] ? 'Continuar' : 'Diligenciar'}</Boton>;
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

/* ===== 5. Contrato ===== */
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

/* ===== 6. Formulario ===== */
const PaginaFormulario = () => {
  const app = useApp();
  const formularioId = app.ruta.params[0];
  const q = app.ruta.query || {};
  const modo = q.modo || 'nuevo';
  const envioId = q.envio ? decodeURIComponent(q.envio) : '';
  const formulario = app.formularios.find((f) => f.id === formularioId);
  const contrato = app.contrato;
  const [previa, setPrevia] = useState(null);
  const [estadoGuardado, setEstadoGuardado] = useState({ fecha: null, guardando: false, error: null });
  const [decisionBorrador, setDecisionBorrador] = useState(null); // null | 'continuar' | 'nuevo'
  const ultimoGuardado = useRef(null);
  const respuestasActuales = useRef(null);   // lo que hay en pantalla (MotorFormulario.onCambioRespuestas)
  const capituloActual = useRef(null);       // el capítulo en pantalla, para el borrador que se guarda al subir
  const hayCambios = useRef(false);          // se editó algo desde que se abrió
  const subiendo = useRef(0);                // archivos subiendo (MotorFormulario.onCambioSubidas)
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);
  // Salir con un archivo subiendo, o de una corrección con cambios (no tiene borrador), se confirma:
  // con «Salir», los menús, Atrás, el contrato, el período o al cerrar la pestaña.
  useEffect(() => {
    app.fijarGuardaSalida(() => {
      if (subiendo.current > 0) return { titulo: 'Hay un archivo subiendo', mensaje: 'Si sales ahora, el archivo que se está subiendo no quedará adjunto.' };
      if (modo === 'correccion' && hayCambios.current) return { titulo: 'Salir sin reenviar', mensaje: 'En una corrección los cambios solo se guardan al reenviarla. Si sales ahora, se pierden.' };
      return null;
    });
    return () => app.fijarGuardaSalida(null);
  }, [modo]); // eslint-disable-line
  const { datos, cargando, error } = useCarga(async () => {
    if (!formulario || !contrato) return null;
    const uid = app.usuario.id;
    const envio = envioId ? await DB.obtenerEnvio(envioId) : null;
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
      modo === 'nuevo' ? DB.obtenerBorrador(idBorrador).catch(() => null) : Promise.resolve(null),
      DB.obtenerContador(contrato.id, formulario.id).catch(() => null),
      DB.listarEnvios({ rol: app.rol, uid, contratoId: contrato.id, formularioId: formulario.id }),
    ]);
    const enviosPeriodo = lista.filter((e) => e.periodo === periodo);
    // Último envío distinto del que se corrige: fuente de «Traer del mes anterior».
    const ultimo = lista.find((e) => e.id !== envioId) || null;
    let local;
    try { local = JSON.parse(localStorage.getItem(`bitacora.borrador.${idBorrador}`) || 'null'); } catch (e) { local = null; }
    return { envio, periodo, idBorrador, contratoId: contrato.id, formularioIdBorrador: formulario.id, borrador: borrador || (local && local.respuestas ? { ...local, actualizadoEn: new Date(local.actualizadoEn || Date.now()), soloLocal: true } : null), contador, enviosPeriodo, ultimo, usuarioFormulario };
  }, [formularioId, contrato && contrato.id, modo, envioId, app.periodo]);

  if (!formulario) return <Vacio icono="formulario" titulo="Formulario no encontrado" accion={<Boton onClick={() => app.navegar('#/inicio')}>Volver al inicio</Boton>} />;
  if (!contrato) return <Vacio icono="contrato" titulo="Elige un contrato" texto="Selecciona el contrato en la barra superior." />;
  if (cargando) return <Cargando texto="Preparando el formulario…" />;
  if (error) return <Alerta tipo="error">{DB.traducirError(error)}</Alerta>;
  const { envio, periodo, idBorrador, contratoId, formularioIdBorrador, borrador, contador, enviosPeriodo, ultimo, usuarioFormulario } = datos;
  const enNombreDeOtro = app.rol !== 'contratista';
  const ahora = new Date();
  const rango = U.recortarPeriodo(periodo, contrato);
  const esCorreccion = modo === 'correccion';
  const esLectura = modo === 'ver';
  const ventanaOk = !requiereVentana(formulario) || U.estadoVentana(app.ventana, formulario.id, ahora).estado === 'abierta';
  const limite = limiteDe(formulario);

  // Bloqueos previos (también se validan en las reglas).
  if (esCorreccion && (!envio || !correccionVigente(envio, ahora))) return <Alerta tipo="alerta">Este envío no está en corrección o el plazo venció. Pide un nuevo plazo desde Solicitudes.</Alerta>;
  if (esLectura && !envio) return <Alerta tipo="error">El envío no existe.</Alerta>;
  if (!esCorreccion && !esLectura) {
    if (!ventanaOk) return <Alerta tipo="alerta"><strong>La ventana de {U.nombrePeriodo(periodo)} no está abierta</strong> para {formulario.nombre}. Fuera de ventana solo se consulta; las correcciones van por Solicitudes.</Alerta>;
    if (limite != null && enviosPeriodo.length >= limite) return <Alerta tipo="info"><strong>Ya enviaste {formulario.nombre} de {U.nombrePeriodo(periodo)}.</strong> Puedes verlo en Mis envíos; si necesitas cambiarlo, crea una solicitud de corrección. <div className="mt-2 flex gap-2"><Boton tam="sm" onClick={() => app.navegar('#/envios')}>Mis envíos</Boton><Boton tam="sm" onClick={() => app.navegar('#/solicitudes')}>Solicitudes</Boton></div></Alerta>;
    if (!rango) return <Alerta tipo="alerta">El período {U.nombrePeriodo(periodo)} está fuera de las fechas del contrato.</Alerta>;
    if (borrador && decisionBorrador === null) {
      return (
        <Modal titulo="Tienes un borrador guardado" descripcion={`Guardado ${U.tiempoRelativo(borrador.actualizadoEn)}${borrador.soloLocal ? ' (solo en este dispositivo)' : ''}`} onCerrar={() => app.navegar('#/inicio')}
          pie={<><Boton icono="basura" onClick={async () => { try { await DB.eliminarBorrador(idBorrador); } catch (e) { /* no existía */ } try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ } setDecisionBorrador('nuevo'); }}>Empezar de nuevo</Boton><Boton variante="primario" icono="editar" onClick={() => setDecisionBorrador('continuar')}>Continuar borrador</Boton></>}>
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
  const guardarBorrador = async (respuestas, capituloActual) => {
    if (esLectura) return;
    // Con el contrato y el formulario del id del borrador (no los de pantalla, que pueden haber cambiado).
    const doc = { uid: app.usuario.id, contratoId, formularioId: formularioIdBorrador, periodo, respuestas, capituloActual: capituloActual || null };
    ultimoGuardado.current = doc;
    setEstadoGuardado((s) => ({ ...s, guardando: true }));
    try { localStorage.setItem(`bitacora.borrador.${idBorrador}`, JSON.stringify({ ...doc, actualizadoEn: new Date().toISOString() })); } catch (e) { /* sin espacio */ }
    try { await DB.guardarBorrador(idBorrador, doc); setEstadoGuardado({ fecha: new Date(), guardando: false, error: null }); }
    catch (e) { setEstadoGuardado({ fecha: null, guardando: false, error: 'no se guardó en el servidor (queda copia local)' }); }
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
  const vistaPrevia = async (respuestas) => {
    const docs = await armarDocumentos(respuestas, '');
    let firma = null;
    try { firma = usuarioFormulario.id ? await DB.obtenerFirma(usuarioFormulario.id) : null; } catch (e) { firma = null; }
    const envioTemporal = { ...docs, formularioId: formulario.id, contratoId: contrato.id, periodo, estado: 'borrador', consecutivo: respuestas.numeroInforme || respuestas.numeroCuenta || consecutivoSugerido, respuestas };
    setPrevia({ generar: () => Descargas.generarDocx({ envio: envioTemporal, formulario, contrato, usuario: usuarioFormulario, parametros: app.parametros, firma }) });
  };
  const enviar = async (respuestas) => {
    const texto = esCorreccion ? '¿Reenviar el envío corregido? Volverá al revisor en el mismo paso.' : `¿Enviar ${formulario.nombre} de ${U.nombrePeriodo(periodo)}? ${limite != null ? 'Después de enviar solo podrás cambiarlo con una solicitud de corrección.' : ''}`;
    if (!(await app.confirmar({ titulo: esCorreccion ? 'Reenviar corrección' : 'Enviar formulario', mensaje: texto, textoOk: esCorreccion ? 'Reenviar' : 'Enviar' }))) return;
    try {
      const docs = await armarDocumentos(respuestas, '');
      const fecha = new Date();
      if (esCorreccion) {
        const entrada = { estado: 'reenviado', por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha, observacion: '' };
        await DB.actualizarEnvio(envio.id, { respuestas, ...docs, estado: 'reenviado', enCorreccion: false, historial: [...(envio.historial || []), entrada] });
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
        app.navegar('#/envios');
        return true;
      }
      const flujo = (formulario.config && formulario.config.flujoEstados) || [];
      const consecutivo = Number(respuestas.numeroInforme || respuestas.numeroCuenta) || consecutivoSugerido;
      if (contador && consecutivo <= Number(contador.ultimo)) { app.avisar('error', `El consecutivo debe ser mayor que ${contador.ultimo}`); return; }
      const envioNuevo = {
        contratoId: contrato.id, formularioId: formulario.id, formularioVersion: Number(formulario.version) || 1,
        formularioVersionBase: Number(formulario.versionBase || formulario.version) || 1, periodo, n: enviosPeriodo.length + 1,
        contratistaUid: contrato.contratistaUid, revisores: contrato.revisores || [], coordinadores: contrato.coordinadores || [],
        estado: 'enviado', pasoActual: flujo.length > 1 ? flujo[1] : 'ninguno', enCorreccion: false, fechaLimiteCorreccion: null,
        respuestas, ...docs,
        historial: [{ estado: 'enviado', por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha, observacion: '' }],
      };
      const { id } = await DB.crearEnvio(envioNuevo, consecutivo);
      try { await DB.eliminarBorrador(idBorrador); } catch (e) { /* nada */ }
      try { localStorage.removeItem(`bitacora.borrador.${idBorrador}`); } catch (e) { /* nada */ }
      await Flujos.notificar({ evento: 'envio', coleccion: 'envios', docId: id, por: app.usuario.id });
      app.avisar('exito', `${formulario.nombre} enviado · No. ${consecutivo}`);
      app.recargarContadores();
      app.navegar('#/envios');
      return true;
    } catch (e) {
      console.error(e);
      app.avisar('error', e.code === 'permission-denied' ? 'No se pudo enviar: ya existe un envío para este período, la ventana cerró o no tienes permiso.' : DB.traducirError(e));
    }
  };
  const titulo = `${esCorreccion ? 'Corregir' : esLectura ? 'Ver' : 'Diligenciar'} · ${formulario.nombre}`;
  return (
    <div>
      <Encabezado titulo={titulo} subtitulo={`${contrato.numero} · ${U.nombrePeriodo(periodo)}${rango ? ` · ${U.textoPeriodo(rango.desde, rango.hasta)}` : ''}${esCorreccion ? ` · plazo ${U.fechaHora(envio.fechaLimiteCorreccion)}` : ''}`} migas={[{ texto: 'Inicio', onClick: () => app.navegar('#/inicio') }, { texto: formulario.nombre }]} />
      {esCorreccion && envio.historial && envio.historial.length ? <Alerta tipo="alerta" className="mb-4"><strong>Observación del revisor:</strong> {envio.historial.slice(-1)[0].observacion || '—'}</Alerta> : null}
      {enNombreDeOtro ? <Alerta tipo="info" className="mb-4">Estás diligenciando <strong>en nombre de {usuarioFormulario.nombreCompleto || 'el contratista'}</strong>. El envío quedará registrado con tu usuario y rol en el historial (auditoría); el Word sale a nombre del contratista.</Alerta> : null}
      {/* La clave cambia con el contrato, el período o el envío: el motor se monta de nuevo (lo
          pendiente del anterior se guarda en su propio borrador, no en el del contexto nuevo). */}
      <MotorFormulario key={`${idBorrador}-${envio ? envio.id : ''}-${decisionBorrador}`} formulario={esCorreccion ? sinExigirLoNuevo(formulario, envio) : formulario} ctx={ctx} respuestasIniciales={respuestasIniciales} puedeEditar={puedeEditar} ultimoEnvio={ultimo}
        subir={subir} onGuardar={esLectura || esCorreccion ? null : guardarBorrador} estadoGuardado={esCorreccion ? { nota: 'En una corrección los cambios se guardan al reenviarla' } : estadoGuardado} onEnviar={esLectura ? null : enviar} onVistaPrevia={formulario.config && formulario.config.vistaPrevia ? vistaPrevia : null}
        textoEnviar={esCorreccion ? 'Reenviar corrección' : 'Finalizar y enviar'} soloLectura={esLectura} capituloInicial={decisionBorrador === 'continuar' && borrador ? borrador.capituloActual : undefined}
        acciones={<Boton variante="fantasma" onClick={() => app.navegar('#/inicio')}>Salir</Boton>}
        onCambioRespuestas={(r, c, cambiado) => { respuestasActuales.current = r; capituloActual.current = c; hayCambios.current = cambiado; }}
        onCambioSubidas={(n) => { subiendo.current = n; }} />
      {previa ? <VistaPreviaDocx titulo={`Vista previa · ${formulario.nombre}`} generar={previa.generar} onCerrar={() => setPrevia(null)} /> : null}
    </div>
  );
};

/* ===== 7. Perfil y firma ===== */
const PaginaPerfil = () => {
  const app = useApp();
  const u = app.usuario;
  const [telefono, setTelefono] = useState(u.telefono || '');
  const [guardando, setGuardando] = useState(false);
  const [claves, setClaves] = useState({ a: '', b: '' });
  const { datos: firma, recargar } = useCarga(() => DB.obtenerFirma(u.id).catch(() => null), [u.id]);
  const guardarTelefono = async () => {
    setGuardando(true);
    try { await DB.actualizarPerfil(u.id, { telefono: telefono.trim() }); app.avisar('exito', 'Teléfono guardado'); app.recargarTodo(); }
    catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  // La firma se reduce en canvas hasta caber en 150 KB (límite del documento privado).
  const cargarFirma = async (archivo) => {
    if (!archivo) return;
    if (!/image\/(png|jpeg|jpg|webp)/.test(archivo.type)) { app.avisar('alerta', 'Usa una imagen PNG (fondo transparente) o JPG'); return; }
    try {
      const dataUrl = await U.leerArchivoDataURL(archivo);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      let ancho = Math.min(img.width, 900), alto = Math.round(img.height * (ancho / img.width));
      let base64 = '';
      for (let intento = 0; intento < 6; intento++) {
        const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
        c.getContext('2d').drawImage(img, 0, 0, ancho, alto);
        base64 = c.toDataURL('image/png').split(',')[1];
        if (base64.length * 0.75 <= 150 * 1024) break;
        ancho = Math.round(ancho * 0.8); alto = Math.round(alto * 0.8);
      }
      if (base64.length * 0.75 > 150 * 1024) { app.avisar('error', 'La firma sigue pesando más de 150 KB; recórtala o usa menos resolución'); return; }
      await DB.guardarFirma(u.id, { pngBase64: base64, ancho, alto });
      app.avisar('exito', 'Firma guardada');
      recargar();
    } catch (e) { app.avisar('error', DB.traducirError(e)); }
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
            <p className="text-sm texto-2">Imagen PNG con fondo transparente (máx. 150 KB). Se escala al recuadro del formato (2,35″ × 0,41″) conservando la proporción.</p>
            {firma && firma.pngBase64 ? <div className="flex items-center gap-3 flex-wrap"><img className="firma-vista" alt="Firma actual" src={`data:image/png;base64,${firma.pngBase64}`} /><Boton tam="sm" variante="fantasma" icono="basura" onClick={quitarFirma}>Quitar</Boton></div> : <span className="texto-3 text-sm">Sin firma: el Word saldrá con el espacio en blanco.</span>}
            <label className="zona-soltar block cursor-pointer"><input type="file" className="sr-solo" accept="image/png,image/jpeg,image/webp" onChange={(e) => { cargarFirma(e.target.files[0]); e.target.value = ''; }} /><div className="flex items-center justify-center gap-2 text-sm"><Icono nombre="firma" /> Subir imagen de la firma</div></label>
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
