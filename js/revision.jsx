/* ============================================================================
   13) revision.jsx — revisor y coordinador: bandeja de revisión, solicitudes,
       contratos asignados y reportes (los reportes también los usa el admin)
   Estructura:
     1. Reglas del flujo de estados (paso propio, paso final, transiciones)
     2. Bandeja (lista + detalle) con Aprobar / Devolver / Reabrir / Tomar en revisión
     3. Solicitudes (aprobar con fecha límite, rechazar con motivo)
     4. Contratos asignados
     5. Reportes y Excel (envíos, cumplimiento, solicitudes, recordatorios)
   ============================================================================ */

/* ===== 1. Flujo de estados ===== */
const flujoDe = (formulario) => (formulario && formulario.config && Array.isArray(formulario.config.flujoEstados) ? formulario.config.flujoEstados : []);
const pasoFinalDe = (formulario) => { const f = flujoDe(formulario); return f.length ? f[f.length - 1] : 'ninguno'; };
const primerPasoDe = (formulario) => { const f = flujoDe(formulario); return f.length > 1 ? f[1] : 'ninguno'; };
// ¿El usuario tiene el paso actual del envío? (admin siempre)
const tieneElPaso = (envio, rol, uid) => {
  if (rol === 'admin') return envio.estado !== 'aprobado';
  if (envio.pasoActual !== rol) return false;
  return rol === 'revisor' ? (envio.revisores || []).includes(uid) : (envio.coordinadores || []).includes(uid);
};
const pendienteDeMi = (envio, rol, uid) => tieneElPaso(envio, rol, uid) && !envio.enCorreccion && envio.estado !== 'aprobado';
const nombreContratistaDe = (envio, contratos) => {
  const c = (contratos || []).find((x) => x.id === envio.contratoId);
  const h = (envio.historial || [])[0];
  return (c && c.info && c.info.contratista && c.info.contratista.nombreCompleto) || (h && h.porNombre) || envio.contratistaUid;
};

/* ===== 2. Bandeja ===== */
const ModalDevolver = ({ titulo, onCerrar, onConfirmar, textoOk = 'Devolver' }) => {
  const [observacion, setObservacion] = useState('');
  const [fecha, setFecha] = useState(U.sumarDias(U.hoyISO(), 3));
  const [cargando, setCargando] = useState(false);
  const confirmar = async () => {
    if (observacion.trim().length < 5) return;
    if (!U.esISO(fecha) || fecha < U.hoyISO()) return;
    setCargando(true);
    try { await onConfirmar({ observacion: observacion.trim(), fechaLimite: U.finDeDiaBogota(fecha) }); } finally { setCargando(false); }
  };
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="acento" icono="editar" cargando={cargando} disabled={observacion.trim().length < 5 || !U.esISO(fecha) || fecha < U.hoyISO()} onClick={confirmar}>{textoOk}</Boton></>}>
      <div className="grid gap-4">
        <Campo etiqueta="Observación para el contratista" obligatoria ayuda="Qué debe corregir. Se envía por correo."><Area autoFocus value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={4} /></Campo>
        <Campo etiqueta="Fecha límite" obligatoria ayuda="El plazo vence ese día a las 23:59 (hora de Bogotá)."><Entrada type="date" className="mono" min={U.hoyISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
    </Modal>
  );
};
const DetalleRevision = ({ envio, onCambio }) => {
  const app = useApp();
  const formulario = app.formularios.find((f) => f.id === envio.formularioId);
  const contrato = app.contratos.find((c) => c.id === envio.contratoId);
  const [modal, setModal] = useState(null); // 'devolver' | 'reabrir' | 'diferencias'
  const [diferencias, setDiferencias] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [pestana, setPestana] = useState('respuestas');
  const esPaso = tieneElPaso(envio, app.rol, app.usuario.id);
  const esFinal = envio.pasoActual === pasoFinalDe(formulario) || app.rol === 'admin';
  const ahora = new Date();

  // El revisor regenera datosDescarga desde respuestas + contrato; si difiere, solo puede devolver.
  const verificarDescarga = async () => {
    if (!formulario || !['informe_itm_sif', 'cuenta_cobro_provisional'].includes(formulario.plantillaDescarga)) return {};
    const contratoVivo = contrato || await DB.obtenerContrato(envio.contratoId);
    const usuario = (await DB.obtenerPerfil(envio.contratistaUid)) || { nombreCompleto: nombreContratistaDe(envio, app.contratos), cedula: '' };
    const regenerado = Descargas.armarDatosDescarga({ formulario, respuestas: envio.respuestas, contrato: contratoVivo, usuario, parametros: app.parametros, catalogos: app.catalogos, voBoTexto: (envio.datosDescarga && envio.datosDescarga.voBoTexto) || '' });
    // Se comparan solo los campos que salen de las respuestas y del contrato; los que vienen de
    // parametros/app (ciudad, NIT, texto de la declaración) pueden cambiar después sin invalidar el envío.
    const ignorar = new Set(['voBoTexto', 'ciudad', 'entidad', 'nit', 'textoDeclaracion', 'formato']);
    const dif = U.diferencias(envio.datosDescarga || {}, regenerado);
    Object.keys(dif).forEach((k) => { if (ignorar.has(k.split('.')[0])) delete dif[k]; });
    return dif;
  };
  const transicion = async (parcial, entrada, evento) => {
    setOcupado(true);
    try {
      await DB.actualizarEnvio(envio.id, { ...parcial, historial: [...(envio.historial || []), { por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha: new Date(), observacion: '', ...entrada, estado: parcial.estado }] });
      if (evento) await Flujos.notificar({ evento, coleccion: 'envios', docId: envio.id, por: app.usuario.id });
      app.avisar('exito', `Envío ${U.ESTADOS[parcial.estado].etiqueta.toLowerCase()}`);
      onCambio();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setOcupado(false); }
  };
  const tomar = () => transicion({ estado: 'en_revision' }, {}, null);
  const aprobar = async () => {
    setOcupado(true);
    try {
      const dif = await verificarDescarga();
      if (Object.keys(dif).length) { setDiferencias(dif); setModal('diferencias'); setOcupado(false); return; }
    } catch (e) { app.avisar('error', `No se pudo verificar la descarga: ${e.message}`); setOcupado(false); return; }
    const final = esFinal;
    const texto = final ? `¿Aprobar definitivamente ${formulario.nombre} de ${U.nombrePeriodo(envio.periodo)}? Quedará de solo lectura.` : '¿Aprobar y pasar al coordinador?';
    if (!(await app.confirmar({ titulo: 'Aprobar envío', mensaje: texto, textoOk: 'Aprobar' }))) { setOcupado(false); return; }
    const parcial = final ? { estado: 'aprobado', pasoActual: 'ninguno' } : { estado: 'aprobado_revisor', pasoActual: 'coordinador' };
    if (final && app.parametros.voBoDigitalEnWord) parcial['datosDescarga.voBoTexto'] = `Aprobado en la plataforma por ${app.usuario.nombreCompleto} el ${U.fechaCorta(new Date())}`;
    await transicion(parcial, {}, final ? 'aprobacion' : null);
  };
  const devolver = async ({ observacion, fechaLimite }) => {
    setOcupado(true);
    try {
      const reabrir = envio.estado === 'aprobado';
      const parcial = reabrir ? { estado: 'en_correccion', enCorreccion: true, fechaLimiteCorreccion: fechaLimite, pasoActual: primerPasoDe(formulario) } : { estado: 'en_correccion', enCorreccion: true, fechaLimiteCorreccion: fechaLimite };
      await DB.actualizarEnvio(envio.id, { ...parcial, historial: [...(envio.historial || []), { estado: 'en_correccion', por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha: new Date(), observacion }] });
      // La devolución directa queda registrada como solicitud ya aprobada con origen «revisor».
      try {
        await DB.crearSolicitud({ contratoId: envio.contratoId, contratistaUid: envio.contratistaUid, revisores: envio.revisores || [], coordinadores: envio.coordinadores || [], tipo: 'correccion', origen: 'revisor', envioIds: [envio.id], formularios: [envio.formularioId], observacion, fechaLimite, estado: 'aprobada', revisorUid: app.usuario.id, motivoRechazo: null });
      } catch (e) { console.warn('No se pudo registrar la solicitud de devolución', e); }
      await Flujos.notificar({ evento: 'devolucion', coleccion: 'envios', docId: envio.id, por: app.usuario.id });
      app.avisar('exito', 'Envío devuelto para corrección');
      setModal(null);
      onCambio();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setOcupado(false); }
  };
  const foto = envio.foto || [];
  return (
    <div className="tarjeta">
      <div className="tarjeta-cabecera flex-wrap">
        <div className="min-w-0">
          <h2>{formulario ? formulario.nombre : envio.formularioId} · {U.nombrePeriodo(envio.periodo)}</h2>
          <div className="text-sm texto-2">{nombreContratistaDe(envio, app.contratos)} · {contrato ? contrato.numero : envio.contratoId} · <span className="mono">No. {envio.consecutivo}</span></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><ChipEstado estado={envio.estado} />{envio.enCorreccion ? <Chip tipo="alerta" icono="reloj">plazo {U.fechaHora(envio.fechaLimiteCorreccion)}</Chip> : null}{envio.pasoActual !== 'ninguno' ? <Chip tipo="neutro">Paso: {U.ROLES[envio.pasoActual] || envio.pasoActual}</Chip> : null}</div>
      </div>
      <div className="tarjeta-cuerpo">
        <div className="flex gap-2 flex-wrap mb-4">
          <AccionesEnvio envio={envio} />
          {esPaso && !envio.enCorreccion && ['enviado', 'reenviado'].includes(envio.estado) ? <Boton tam="sm" icono="ojo" cargando={ocupado} onClick={tomar}>Tomar en revisión</Boton> : null}
          {esPaso && !envio.enCorreccion && envio.estado !== 'aprobado' ? <Boton tam="sm" variante="primario" icono="check" cargando={ocupado} onClick={aprobar}>{esFinal ? 'Aprobar' : 'Aprobar y pasar al coordinador'}</Boton> : null}
          {esPaso && !envio.enCorreccion && envio.estado !== 'aprobado' ? <Boton tam="sm" variante="acento" icono="editar" disabled={ocupado} onClick={() => setModal('devolver')}>Devolver</Boton> : null}
          {envio.estado === 'aprobado' && ((app.rol === 'revisor' && (envio.revisores || []).includes(app.usuario.id)) || (app.rol === 'coordinador' && (envio.coordinadores || []).includes(app.usuario.id)) || app.rol === 'admin') ? <Boton tam="sm" icono="refrescar" disabled={ocupado} onClick={() => setModal('reabrir')}>Reabrir para corrección</Boton> : null}
          {envio.enCorreccion ? <span className="text-sm texto-2 self-center">{correccionVigente(envio, ahora) ? 'En manos del contratista hasta la fecha límite.' : 'El plazo de corrección venció sin reenvío.'}</span> : null}
        </div>
        <Pestanas activa={pestana} onCambio={setPestana} lista={[{ id: 'respuestas', etiqueta: 'Respuestas', icono: 'formulario' }, { id: 'historial', etiqueta: 'Historial', icono: 'reloj', contador: (envio.historial || []).length }, { id: 'anexos', etiqueta: 'Archivos', icono: 'archivo', contador: (envio.anexos || []).length }]} />
        <div className="mt-4">
          {pestana === 'respuestas' ? (
            <div className="grid gap-3">
              {envio.totales && Object.keys(envio.totales).length ? <div className="grid gap-2 grid-cols-2 md:grid-cols-4">{Object.keys(envio.totales).map((k) => <Indicador key={k} titulo={{ valorCobrado: 'Valor cobrado', ibc: 'IBC', salud: 'Salud', pension: 'Pensión', arl: 'ARL', totalObligatorio: 'Obligatorio', totalRealizado: 'Pagado', saldo: 'Saldo', actividades: 'Actividades', promedioEjecucion: 'Ejecución prom.', anexos: 'Anexos' }[k] || k} valor={['actividades', 'anexos'].includes(k) ? envio.totales[k] : k === 'promedioEjecucion' ? `${envio.totales[k]} %` : U.formatoCOP(envio.totales[k])} tipo={k === 'saldo' && envio.totales[k] < -(app.parametros.toleranciaSaldo || 0) ? 'error' : undefined} />)}</div> : null}
              {foto.map((cap) => <FotoCapitulo key={cap.id} cap={cap} />)}
            </div>
          ) : null}
          {pestana === 'historial' ? <LineaTiempo entradas={envio.historial || []} /> : null}
          {pestana === 'anexos' ? ((envio.anexos || []).length ? <ul className="grid gap-1 text-sm">{envio.anexos.map((a, i) => <li key={i} className="flex items-center gap-2"><Icono nombre="archivo" className="texto-3" />{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : a.nombre}<span className="mono text-xs texto-3">{U.tamanoLegible(a.tamano)}</span></li>)}</ul> : <Vacio icono="archivo" titulo="Sin archivos adjuntos" />) : null}
        </div>
      </div>
      {modal === 'devolver' ? <ModalDevolver titulo="Devolver para corrección" onCerrar={() => setModal(null)} onConfirmar={devolver} /> : null}
      {modal === 'reabrir' ? <ModalDevolver titulo="Reabrir envío aprobado" textoOk="Reabrir" onCerrar={() => setModal(null)} onConfirmar={devolver} /> : null}
      {modal === 'diferencias' ? (
        <Modal titulo="La descarga no coincide con las respuestas" ancho="ancho" onCerrar={() => setModal(null)} pie={<><Boton onClick={() => setModal(null)}>Cerrar</Boton><Boton variante="acento" icono="editar" onClick={() => setModal('devolver')}>Devolver para corrección</Boton></>}>
          <Alerta tipo="alerta" className="mb-3">El Word guardado por el contratista difiere de lo que se genera hoy con sus respuestas y la información del contrato. Por seguridad solo puedes devolverlo; al reenviar se regenera.</Alerta>
          <div className="tabla-envoltura"><table className="tabla diff-tabla"><thead><tr><th>Campo</th><th>Guardado</th><th>Regenerado</th></tr></thead><tbody>{Object.keys(diferencias || {}).map((k) => <tr key={k}><td>{k}</td><td className="diff-antes">{U.limitar(U.valorLegible(diferencias[k].antes), 120)}</td><td className="diff-despues">{U.limitar(U.valorLegible(diferencias[k].despues), 120)}</td></tr>)}</tbody></table></div>
        </Modal>
      ) : null}
    </div>
  );
};
const PaginaRevision = () => {
  const app = useApp();
  const [filtro, setFiltro] = useState('mios');
  const [texto, setTexto] = useState('');
  const [seleccion, setSeleccion] = useState(null);
  const { datos, cargando, recargar } = useCarga(() => DB.listarEnvios({ rol: app.rol, uid: app.usuario.id }), [app.usuario.id, app.rol]);
  const envios = datos || [];
  const lista = useMemo(() => envios.filter((e) => {
    if (filtro === 'mios' && !pendienteDeMi(e, app.rol, app.usuario.id)) return false;
    if (filtro === 'correccion' && !e.enCorreccion) return false;
    if (filtro === 'aprobados' && e.estado !== 'aprobado') return false;
    if (filtro === 'periodo' && e.periodo !== app.periodo) return false;
    if (texto) { const t = U.sinTildes(texto).toLowerCase(); const c = app.contratos.find((x) => x.id === e.contratoId); if (!U.sinTildes(`${nombreContratistaDe(e, app.contratos)} ${c ? c.numero : e.contratoId} ${nombreFormulario(app, e.formularioId)} ${e.periodo}`).toLowerCase().includes(t)) return false; }
    return true;
  }), [envios, filtro, texto, app.contratos, app.periodo]);
  const actual = seleccion ? envios.find((e) => e.id === seleccion) : null;
  const alCambiar = () => { recargar(true); app.recargarContadores(); };
  return (
    <div>
      <Encabezado titulo="Revisión" subtitulo={`${envios.filter((e) => pendienteDeMi(e, app.rol, app.usuario.id)).length} ${U.plural(envios.filter((e) => pendienteDeMi(e, app.rol, app.usuario.id)).length, 'envío pendiente', 'envíos pendientes')} de tu paso`} acciones={<Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton>} />
      <div className="bandeja">
        <div className="tarjeta bandeja-lista">
          <div className="p-3 grid gap-2 border-b" style={{ borderColor: 'var(--borde)' }}>
            <Segmentado etiqueta="Filtro" valor={filtro} onCambio={setFiltro} opciones={[{ valor: 'mios', etiqueta: 'Mi paso' }, { valor: 'periodo', etiqueta: U.nombrePeriodo(app.periodo) }, { valor: 'correccion', etiqueta: 'En corrección' }, { valor: 'aprobados', etiqueta: 'Aprobados' }, { valor: 'todos', etiqueta: 'Todos' }]} />
            <div className="relative"><Entrada placeholder="Buscar por contratista, contrato o formulario" value={texto} onChange={(e) => setTexto(e.target.value)} className="campo-con-icono" aria-label="Buscar" /><Icono nombre="buscar" className="absolute left-3 top-1/2 -translate-y-1/2 texto-3" /></div>
          </div>
          {cargando ? <div className="p-4"><Esqueleto filas={5} alto={34} /></div> : (lista.length ? lista.map((e) => (
            <button type="button" key={e.id} className={`bandeja-item ${seleccion === e.id ? 'activo' : ''}`} onClick={() => setSeleccion(e.id)}>
              <div className="flex justify-between gap-2 items-start"><strong className="text-sm truncate">{nombreContratistaDe(e, app.contratos)}</strong><ChipEstado estado={e.estado} /></div>
              <div className="text-xs texto-2 mt-0.5">{nombreFormulario(app, e.formularioId)} · <span className="mono">{U.nombrePeriodo(e.periodo)}</span> · No. {e.consecutivo}</div>
              <div className="text-xs texto-3 mono mt-0.5">{U.fechaHora(e.enviadoEn)}{e.enCorreccion ? ` · plazo ${U.fechaCorta(e.fechaLimiteCorreccion)}` : ''}</div>
            </button>
          )) : <Vacio icono="revision" titulo="Nada por aquí" texto={filtro === 'mios' ? 'No tienes envíos pendientes en tu paso.' : 'Sin envíos con ese filtro.'} />)}
        </div>
        <div>{actual ? <DetalleRevision key={actual.id + actual.estado + (actual.historial || []).length} envio={actual} onCambio={alCambiar} /> : <div className="tarjeta"><Vacio icono="revision" titulo="Elige un envío" texto="Selecciona un envío de la lista para revisarlo, aprobarlo o devolverlo." /></div>}</div>
      </div>
    </div>
  );
};

/* ===== 3. Solicitudes (revisor, coordinador, admin) ===== */
const SolicitudesRevision = () => {
  const app = useApp();
  const [filtro, setFiltro] = useState('pendiente');
  const [modal, setModal] = useState(null); // { tipo: 'aprobar'|'rechazar', solicitud }
  const { datos, cargando, recargar } = useCarga(() => DB.listarSolicitudes({ rol: app.rol, uid: app.usuario.id }), [app.usuario.id, app.rol]);
  const lista = (datos || []).filter((s) => filtro === 'todas' || s.estado === filtro);
  const contratoDe = (s) => app.contratos.find((c) => c.id === s.contratoId);
  const aprobar = async (s, { fechaLimite, observacion }) => {
    try {
      if (s.tipo === 'correccion') {
        for (const envioId of (s.envioIds || [])) {
          const envio = await DB.obtenerEnvio(envioId);
          if (!envio) continue;
          const formulario = app.formularios.find((f) => f.id === envio.formularioId);
          const parcial = envio.estado === 'aprobado' ? { estado: 'en_correccion', enCorreccion: true, fechaLimiteCorreccion: fechaLimite, pasoActual: primerPasoDe(formulario) } : { estado: 'en_correccion', enCorreccion: true, fechaLimiteCorreccion: fechaLimite };
          await DB.actualizarEnvio(envioId, { ...parcial, historial: [...(envio.historial || []), { estado: 'en_correccion', por: app.usuario.id, porNombre: app.usuario.nombreCompleto, rol: app.rol, fecha: new Date(), observacion: observacion || `Solicitud aprobada: ${s.observacion}` }] });
          await Flujos.notificar({ evento: 'devolucion', coleccion: 'envios', docId: envioId, por: app.usuario.id });
        }
      } else {
        await DB.actualizarContrato(s.contratoId, { permitirActualizar: true });
      }
      await DB.actualizarSolicitud(s.id, { estado: 'aprobada', revisorUid: app.usuario.id, fechaLimite });
      await Flujos.notificar({ evento: 'solicitud', coleccion: 'solicitudes', docId: s.id, por: app.usuario.id });
      app.avisar('exito', 'Solicitud aprobada');
      setModal(null); recargar(true); app.recargarContadores();
    } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  const rechazar = async (s, motivo) => {
    try {
      await DB.actualizarSolicitud(s.id, { estado: 'rechazada', revisorUid: app.usuario.id, motivoRechazo: motivo });
      await Flujos.notificar({ evento: 'solicitud', coleccion: 'solicitudes', docId: s.id, por: app.usuario.id });
      app.avisar('exito', 'Solicitud rechazada');
      setModal(null); recargar(true); app.recargarContadores();
    } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  return (
    <div>
      <Encabezado titulo="Solicitudes" subtitulo="Correcciones y actualizaciones pedidas por los contratistas de tus contratos." acciones={<Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton>} />
      <div className="mb-4"><Segmentado etiqueta="Estado" valor={filtro} onCambio={setFiltro} opciones={[{ valor: 'pendiente', etiqueta: 'Pendientes' }, { valor: 'aprobada', etiqueta: 'Aprobadas' }, { valor: 'rechazada', etiqueta: 'Rechazadas' }, { valor: 'finalizada', etiqueta: 'Finalizadas' }, { valor: 'todas', etiqueta: 'Todas' }]} /></div>
      <Tabla cargando={cargando} filas={lista} vacio={<Vacio icono="solicitudes" titulo="Sin solicitudes" />}
        columnas={[
          { titulo: 'Fecha', render: (s) => <span className="mono text-xs">{U.fechaHora(s.creadoEn)}</span> },
          { titulo: 'Contratista', render: (s) => { const c = contratoDe(s); return c && c.info && c.info.contratista ? c.info.contratista.nombreCompleto : s.contratistaUid; } },
          { titulo: 'Contrato', render: (s) => { const c = contratoDe(s); return c ? c.numero : s.contratoId; } },
          { titulo: 'Tipo', render: (s) => `${U.TIPOS_SOLICITUD[s.tipo] || s.tipo}${s.origen === 'revisor' ? ' (devolución)' : ''}` },
          { titulo: 'Formularios', render: (s) => (s.formularios || []).map((f) => nombreFormulario(app, f)).join(', ') },
          { titulo: 'Observación', render: (s) => <span className="text-sm whitespace-pre-wrap">{s.observacion}</span> },
          { titulo: 'Estado', render: (s) => <span className="flex flex-col gap-1"><ChipSolicitud estado={s.estado} />{s.fechaLimite ? <span className="text-xs mono">{U.fechaHora(s.fechaLimite)}</span> : null}{s.motivoRechazo ? <span className="text-xs texto-2">{s.motivoRechazo}</span> : null}</span> },
        ]}
        acciones={(s) => (s.estado === 'pendiente' ? <><Boton tam="xs" variante="primario" icono="check" onClick={() => setModal({ tipo: 'aprobar', solicitud: s })}>Aprobar</Boton><Boton tam="xs" variante="fantasma" icono="x" onClick={() => setModal({ tipo: 'rechazar', solicitud: s })}>Rechazar</Boton></> : null)} />
      {modal && modal.tipo === 'aprobar' ? (modal.solicitud.tipo === 'correccion'
        ? <ModalDevolver titulo="Aprobar corrección" textoOk="Aprobar y reabrir" onCerrar={() => setModal(null)} onConfirmar={(d) => aprobar(modal.solicitud, d)} />
        : <ModalConfirmarTexto titulo="Aprobar actualización" texto="Se habilitará la edición de «Datos del contratista» para este contrato. Cuando termine, vuelve a cerrarla desde la página del contrato." textoOk="Aprobar" onCerrar={() => setModal(null)} onConfirmar={() => aprobar(modal.solicitud, { fechaLimite: null })} />) : null}
      {modal && modal.tipo === 'rechazar' ? <ModalMotivo titulo="Rechazar solicitud" etiqueta="Motivo del rechazo" textoOk="Rechazar" onCerrar={() => setModal(null)} onConfirmar={(m) => rechazar(modal.solicitud, m)} /> : null}
    </div>
  );
};
const ModalMotivo = ({ titulo, etiqueta, textoOk, onCerrar, onConfirmar }) => {
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="peligro" cargando={cargando} disabled={texto.trim().length < 5} onClick={async () => { setCargando(true); try { await onConfirmar(texto.trim()); } finally { setCargando(false); } }}>{textoOk}</Boton></>}>
      <Campo etiqueta={etiqueta} obligatoria><Area autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} /></Campo>
    </Modal>
  );
};
const ModalConfirmarTexto = ({ titulo, texto, textoOk, onCerrar, onConfirmar }) => {
  const [cargando, setCargando] = useState(false);
  return <Modal titulo={titulo} onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" cargando={cargando} onClick={async () => { setCargando(true); try { await onConfirmar(); } finally { setCargando(false); } }}>{textoOk}</Boton></>}><p className="text-sm">{texto}</p></Modal>;
};

/* ===== 4. Contratos asignados ===== */
const PaginaContratos = () => {
  const app = useApp();
  const [texto, setTexto] = useState('');
  const lista = app.contratos.filter((c) => !texto || U.sinTildes(`${c.numero} ${c.etiqueta || ''} ${(c.info && c.info.contratista && c.info.contratista.nombreCompleto) || ''}`).toLowerCase().includes(U.sinTildes(texto).toLowerCase()));
  return (
    <div>
      <Encabezado titulo="Contratos asignados" subtitulo={`${app.contratos.length} ${U.plural(app.contratos.length, 'contrato', 'contratos')} donde eres ${app.rol === 'coordinador' ? 'coordinador' : 'revisor'}`} />
      <div className="relative mb-4 max-w-md"><Entrada placeholder="Buscar por número, etiqueta o contratista" value={texto} onChange={(e) => setTexto(e.target.value)} className="campo-con-icono" aria-label="Buscar contrato" /><Icono nombre="buscar" className="absolute left-3 top-1/2 -translate-y-1/2 texto-3" /></div>
      <Tabla filas={lista} vacio={<Vacio icono="contrato" titulo="Sin contratos asignados" texto="El administrador te asigna contratos desde Contratistas y contratos." />}
        columnas={[
          { titulo: 'Contrato', render: (c) => <span className="mono">{c.numero}</span> },
          { titulo: 'Etiqueta', clave: 'etiqueta' },
          { titulo: 'Contratista', render: (c) => (c.info && c.info.contratista && c.info.contratista.nombreCompleto) || '—' },
          { titulo: 'Cuenta', render: (c) => (c.contratistaUid ? <Chip tipo="exito" icono="check">Vinculada</Chip> : <Chip tipo="alerta" icono="reloj">Sin cuenta</Chip>) },
          { titulo: 'Estado', render: (c) => <Chip tipo={c.estado === 'terminado' ? 'neutro' : 'primario'}>{c.estado === 'terminado' ? 'Terminado' : 'Activo'}</Chip> },
          { titulo: 'Edición del contratista', render: (c) => (c.permitirActualizar ? 'Habilitada' : 'Cerrada') },
        ]} acciones={(c) => <Boton tam="xs" icono="derecha" onClick={() => { app.elegirContrato(c.id); app.navegar('#/contrato'); }}>Abrir</Boton>} />
    </div>
  );
};

/* ===== 5. Reportes ===== */
const PaginaReportes = () => {
  const app = useApp();
  const [periodo, setPeriodo] = useState(app.periodo);
  const [formularioId, setFormularioId] = useState('');
  const [pestana, setPestana] = useState('envios');
  const [recordando, setRecordando] = useState(false);
  const { datos, cargando, recargar } = useCarga(async () => {
    const [envios, solicitudes, ventana] = await Promise.all([DB.listarEnvios({ rol: app.rol, uid: app.usuario.id, periodo }), DB.listarSolicitudes({ rol: app.rol, uid: app.usuario.id }), DB.obtenerVentana(periodo).catch(() => null)]);
    return { envios, solicitudes, ventana };
  }, [periodo, app.usuario.id, app.rol]);
  const envios = ((datos && datos.envios) || []).filter((e) => !formularioId || e.formularioId === formularioId);
  const solicitudes = (datos && datos.solicitudes) || [];
  const formulariosPeriodo = app.formularios.filter((f) => f.activo && f.tipo !== 'INFO_CONTRATO' && (!formularioId || f.id === formularioId) && (!(datos && datos.ventana) || (datos.ventana.formularios || []).includes(f.id) || !requiereVentana(f)));
  const cumplimiento = useMemo(() => {
    const filas = [];
    app.contratos.filter((c) => c.estado !== 'terminado' && U.recortarPeriodo(periodo, c)).forEach((c) => formulariosPeriodo.forEach((f) => {
      const env = ((datos && datos.envios) || []).filter((e) => e.contratoId === c.id && e.formularioId === f.id);
      filas.push({ id: `${c.id}-${f.id}`, contratoId: c.id, contrato: c.numero, contratista: (c.info && c.info.contratista && c.info.contratista.nombreCompleto) || '—', correo: c.correoContratista || '', formulario: f.nombre, estado: env[0] ? (U.ESTADOS[env[0].estado] || {}).etiqueta || env[0].estado : 'Sin enviar', enviado: env[0] ? env[0].enviadoEn : null, pendiente: !env[0] });
    }));
    return filas;
  }, [app.contratos, formulariosPeriodo, datos, periodo]);
  const filasEnvios = envios.map((e) => { const c = app.contratos.find((x) => x.id === e.contratoId); const t = e.totales || {}; return {
    id: e.id, contratista: nombreContratistaDe(e, app.contratos), contrato: c ? c.numero : e.contratoId, formulario: nombreFormulario(app, e.formularioId), periodo: e.periodo, estado: (U.ESTADOS[e.estado] || {}).etiqueta || e.estado,
    enviadoEn: e.enviadoEn, consecutivo: e.consecutivo, valorCobrado: t.valorCobrado, ibc: t.ibc, salud: t.salud, pension: t.pension, arl: t.arl, totalObligatorio: t.totalObligatorio, totalRealizado: t.totalRealizado, saldo: t.saldo, promedioEjecucion: t.promedioEjecucion, ultimaFecha: (e.historial || []).slice(-1)[0] ? e.historial.slice(-1)[0].fecha : null,
  }; });
  const filasSolicitudes = solicitudes.map((s) => { const c = app.contratos.find((x) => x.id === s.contratoId); return { id: s.id, fecha: s.creadoEn, contratista: c && c.info && c.info.contratista ? c.info.contratista.nombreCompleto : s.contratistaUid, contrato: c ? c.numero : s.contratoId, tipo: U.TIPOS_SOLICITUD[s.tipo] || s.tipo, origen: s.origen, formularios: (s.formularios || []).map((f) => nombreFormulario(app, f)), observacion: s.observacion, estado: (U.ESTADOS_SOLICITUD[s.estado] || {}).etiqueta || s.estado, fechaLimite: s.fechaLimite, motivoRechazo: s.motivoRechazo || '' }; });
  const exportar = () => {
    try {
      const r = Descargas.exportarExcel({ nombreArchivo: `Reporte ${U.nombrePeriodo(periodo)} - ${app.parametros.siglaArchivo || 'ITMSIF'}.xlsx`, hojas: [
        { nombre: 'Envíos', filas: filasEnvios, columnas: [
          { titulo: 'Contratista', clave: 'contratista', ancho: 30 }, { titulo: 'Contrato', clave: 'contrato', ancho: 18 }, { titulo: 'Formulario', clave: 'formulario', ancho: 30 }, { titulo: 'Período', clave: 'periodo', ancho: 10 },
          { titulo: 'Estado', clave: 'estado', ancho: 18 }, { titulo: 'Enviado', clave: 'enviadoEn', formato: 'fecha', ancho: 18 }, { titulo: 'Última novedad', clave: 'ultimaFecha', formato: 'fecha', ancho: 18 }, { titulo: 'Consecutivo', clave: 'consecutivo', formato: 'numero', ancho: 12 },
          { titulo: 'Valor cobrado', clave: 'valorCobrado', formato: 'cop', ancho: 16 }, { titulo: 'IBC', clave: 'ibc', formato: 'cop', ancho: 16 }, { titulo: 'Salud', clave: 'salud', formato: 'cop', ancho: 14 }, { titulo: 'Pensión', clave: 'pension', formato: 'cop', ancho: 14 }, { titulo: 'ARL', clave: 'arl', formato: 'cop', ancho: 14 },
          { titulo: 'Total obligatorio', clave: 'totalObligatorio', formato: 'cop', ancho: 16 }, { titulo: 'Total pagado', clave: 'totalRealizado', formato: 'cop', ancho: 16 }, { titulo: 'Saldo', clave: 'saldo', formato: 'cop', ancho: 14 }, { titulo: 'Ejecución promedio', clave: 'promedioEjecucion', formato: 'porcentaje', ancho: 14 },
        ] },
        { nombre: 'Cumplimiento', filas: cumplimiento, columnas: [{ titulo: 'Contratista', clave: 'contratista', ancho: 30 }, { titulo: 'Correo', clave: 'correo', ancho: 28 }, { titulo: 'Contrato', clave: 'contrato', ancho: 18 }, { titulo: 'Formulario', clave: 'formulario', ancho: 30 }, { titulo: 'Estado', clave: 'estado', ancho: 18 }, { titulo: 'Enviado', clave: 'enviado', formato: 'fecha', ancho: 18 }] },
        { nombre: 'Solicitudes', filas: filasSolicitudes, columnas: [{ titulo: 'Fecha', clave: 'fecha', formato: 'fecha', ancho: 18 }, { titulo: 'Contratista', clave: 'contratista', ancho: 30 }, { titulo: 'Contrato', clave: 'contrato', ancho: 18 }, { titulo: 'Tipo', clave: 'tipo', ancho: 28 }, { titulo: 'Origen', clave: 'origen', ancho: 12 }, { titulo: 'Formularios', clave: 'formularios', ancho: 30 }, { titulo: 'Observación', clave: 'observacion', ancho: 50 }, { titulo: 'Estado', clave: 'estado', ancho: 14 }, { titulo: 'Fecha límite', clave: 'fechaLimite', formato: 'fecha', ancho: 18 }, { titulo: 'Motivo de rechazo', clave: 'motivoRechazo', ancho: 30 }] },
      ] });
      app.avisar('exito', r === 'csv' ? 'No cargó la librería de Excel: se exportó CSV de la primera hoja' : 'Excel generado');
    } catch (e) { console.error(e); app.avisar('error', `No se pudo exportar: ${e.message}`); }
  };
  const recordar = async () => {
    const pendientes = cumplimiento.filter((f) => f.pendiente);
    if (!pendientes.length) { app.avisar('info', 'No hay pendientes'); return; }
    if (!(await app.confirmar({ titulo: 'Enviar recordatorio', mensaje: `Se notificará a ${U.unicos(pendientes.map((p) => p.contratoId)).length} ${U.plural(U.unicos(pendientes.map((p) => p.contratoId)).length, 'contratista', 'contratistas')} que no han enviado en ${U.nombrePeriodo(periodo)}.`, textoOk: 'Enviar' }))) return;
    setRecordando(true);
    let ok = 0;
    for (const id of U.unicos(pendientes.map((p) => p.contratoId))) { const r = await Flujos.notificar({ evento: 'recordatorio', coleccion: 'contratos', docId: id, por: app.usuario.id }); if (r.estado === 'enviado' || r.estado === 'simulado') ok++; }
    setRecordando(false);
    app.avisar(ok ? 'exito' : 'alerta', ok ? `${ok} ${U.plural(ok, 'recordatorio enviado', 'recordatorios enviados')}` : 'No se enviaron recordatorios (revisa el flujo «notificar» en Parámetros)');
  };
  return (
    <div>
      <Encabezado titulo="Reportes" subtitulo="Envíos, cumplimiento y solicitudes del período, con exportación a Excel." acciones={<><Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton><Boton tam="sm" variante="primario" icono="excel" onClick={exportar} disabled={cargando}>Exportar Excel</Boton></>} />
      <div className="grupo-filtros mb-4">
        <Campo etiqueta="Período"><Selector vacio={null} opciones={U.listaPeriodos(U.desplazarPeriodo(U.periodoActual(), -18), U.desplazarPeriodo(U.periodoActual(), 2)).reverse().map((p) => ({ valor: p, etiqueta: U.nombrePeriodo(p) }))} value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></Campo>
        <Campo etiqueta="Formulario"><Selector vacio="Todos" opciones={app.formularios.filter((f) => f.tipo !== 'INFO_CONTRATO').map((f) => ({ valor: f.id, etiqueta: f.nombre }))} value={formularioId} onChange={(e) => setFormularioId(e.target.value)} /></Campo>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-4">
        <Indicador titulo="Envíos" valor={envios.length} />
        <Indicador titulo="Aprobados" valor={envios.filter((e) => e.estado === 'aprobado').length} tipo="exito" />
        <Indicador titulo="En corrección" valor={envios.filter((e) => e.enCorreccion).length} tipo="alerta" />
        <Indicador titulo="Sin enviar" valor={cumplimiento.filter((f) => f.pendiente).length} tipo={cumplimiento.filter((f) => f.pendiente).length ? 'error' : undefined} />
      </div>
      <Pestanas activa={pestana} onCambio={setPestana} lista={[{ id: 'envios', etiqueta: 'Envíos', icono: 'envios', contador: envios.length }, { id: 'cumplimiento', etiqueta: 'Cumplimiento', icono: 'bandera', contador: cumplimiento.filter((f) => f.pendiente).length }, { id: 'solicitudes', etiqueta: 'Solicitudes', icono: 'solicitudes', contador: solicitudes.filter((s) => s.estado === 'pendiente').length }]} />
      <div className="mt-4">
        {pestana === 'envios' ? <Tabla cargando={cargando} filas={filasEnvios} vacio={<Vacio icono="envios" titulo="Sin envíos en el período" />} columnas={[
          { titulo: 'Contratista', clave: 'contratista' }, { titulo: 'Contrato', clave: 'contrato', mono: true }, { titulo: 'Formulario', clave: 'formulario' }, { titulo: 'No.', clave: 'consecutivo', mono: true },
          { titulo: 'Estado', clave: 'estado' }, { titulo: 'Enviado', render: (f) => <span className="mono text-xs">{U.fechaHora(f.enviadoEn)}</span> },
          { titulo: 'Valor cobrado', render: (f) => <span className="mono">{U.formatoCOP(f.valorCobrado)}</span> }, { titulo: 'Saldo SS', render: (f) => <span className="mono" style={f.saldo < 0 ? { color: 'var(--error)' } : undefined}>{U.formatoCOP(f.saldo)}</span> },
        ]} /> : null}
        {pestana === 'cumplimiento' ? <>
          {app.rol !== 'coordinador' ? <div className="mb-3"><Boton tam="sm" icono="correo" cargando={recordando} onClick={recordar} disabled={!cumplimiento.some((f) => f.pendiente)}>Recordar a los pendientes</Boton></div> : null}
          <Tabla cargando={cargando} filas={cumplimiento} vacio={<Vacio icono="bandera" titulo="Nada que verificar" texto="No hay contratos activos en este período o no hay formularios habilitados." />} columnas={[
            { titulo: 'Contratista', clave: 'contratista' }, { titulo: 'Contrato', clave: 'contrato', mono: true }, { titulo: 'Formulario', clave: 'formulario' },
            { titulo: 'Estado', render: (f) => (f.pendiente ? <Chip tipo="error" icono="alerta">Sin enviar</Chip> : <Chip tipo="exito" icono="check">{f.estado}</Chip>) }, { titulo: 'Enviado', render: (f) => <span className="mono text-xs">{f.enviado ? U.fechaHora(f.enviado) : '—'}</span> },
          ]} /></> : null}
        {pestana === 'solicitudes' ? <Tabla cargando={cargando} filas={filasSolicitudes} vacio={<Vacio icono="solicitudes" titulo="Sin solicitudes" />} columnas={[
          { titulo: 'Fecha', render: (f) => <span className="mono text-xs">{U.fechaHora(f.fecha)}</span> }, { titulo: 'Contratista', clave: 'contratista' }, { titulo: 'Contrato', clave: 'contrato', mono: true }, { titulo: 'Tipo', clave: 'tipo' }, { titulo: 'Estado', clave: 'estado' }, { titulo: 'Observación', clave: 'observacion' },
        ]} /> : null}
      </div>
    </div>
  );
};
