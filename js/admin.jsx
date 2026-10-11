/* ============================================================================
   14) admin.jsx — administración: inicio, contratistas y contratos (+ importador
       Excel), usuarios, ventanas, formularios (editor JSON + vista previa),
       catálogos y parámetros
   Estructura:
     1. Inicio del administrador
     2. Contratos: cuenta del contratista (se crea o vincula al crear el contrato), tabla,
        nuevo contrato, asignación de revisores/coordinadores, preRegistro
     3. Importador Excel (plantilla, validación previa, resumen, importación)
     4. Usuarios
     5. Ventanas
     6. Formularios (editor JSON + actualizar a la plantilla base)
     7. Catálogos
     8. Parámetros (+ bitácora de notificaciones)
   ============================================================================ */

/* ===== 1. Inicio ===== */
const PaginaAdminInicio = () => {
  const app = useApp();
  const { datos, cargando, recargar } = useCarga(async () => {
    const [envios, solicitudes] = await Promise.all([DB.listarEnvios({ rol: 'admin', uid: app.usuario.id, periodo: app.periodo }), DB.listarSolicitudes({ rol: 'admin', uid: app.usuario.id, estado: 'pendiente' })]);
    return { envios, solicitudes };
  }, [app.periodo]);
  const envios = (datos && datos.envios) || [];
  const porEstado = U.agrupar(envios, (e) => e.estado);
  const sinCuenta = app.contratos.filter((c) => !c.contratistaUid).length;
  const primerosPasos = [
    { ok: app.formularios.length > 0, texto: 'Formularios base cargados', accion: app.formularios.length ? null : <Boton tam="xs" onClick={async () => { await DB.sembrarBase(); app.avisar('exito', 'Formularios, catálogos y parámetros base creados'); app.recargarTodo(); }}>Sembrar</Boton> },
    { ok: app.parametros.nitEntidad && !String(app.parametros.nitEntidad).includes('<PENDIENTE>'), texto: 'Parámetros de la entidad (NIT, SMMLV, flujos)', accion: <Boton tam="xs" onClick={() => app.navegar('#/admin/parametros')}>Abrir</Boton> },
    { ok: app.contratos.length > 0, texto: 'Contratos (la cuenta de cada contratista queda lista al crearlo)', accion: <Boton tam="xs" onClick={() => app.navegar('#/admin/contratos')}>Importar</Boton> },
    { ok: !!app.ventana, texto: `Ventana de ${U.nombrePeriodo(app.periodo)}`, accion: <Boton tam="xs" onClick={() => app.navegar('#/admin/ventanas')}>Ventanas</Boton> },
  ];
  return (
    <div>
      <Encabezado titulo="Administración" subtitulo={`Resumen de ${U.nombrePeriodo(app.periodo)} · ${app.contratos.length} ${U.plural(app.contratos.length, 'contrato', 'contratos')}`} acciones={<Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton>} />
      <AvisosPlantillaBase className="mb-4" />
      {app.propios.length ? (
        <div className="alerta-caja alerta-info mb-4 items-center flex-wrap"><Icono nombre="usuario" /><div className="flex-1 min-w-0 text-sm"><strong>También eres contratista</strong> ({app.propios.map((c) => c.numero || c.id).join(', ')}): tu informe y tu cuenta de cobro se diligencian desde tu vista de contratista.</div><Boton tam="sm" variante="primario" icono="contrato" onClick={() => app.cambiarVista('contratista')}>Ir a mi vista de contratista</Boton></div>
      ) : null}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-4">
        <Indicador titulo="Envíos del período" valor={cargando ? '…' : envios.length} />
        <Indicador titulo="Aprobados" valor={cargando ? '…' : (porEstado.aprobado || []).length} tipo="exito" />
        <Indicador titulo="En revisión" valor={cargando ? '…' : envios.filter((e) => ['enviado', 'en_revision', 'reenviado', 'aprobado_revisor'].includes(e.estado)).length} tipo="info" />
        <Indicador titulo="Solicitudes pendientes" valor={cargando ? '…' : ((datos && datos.solicitudes) || []).length} tipo={datos && datos.solicitudes && datos.solicitudes.length ? 'alerta' : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="tarjeta"><div className="tarjeta-cabecera"><h2>Puesta en marcha</h2></div><div className="tarjeta-cuerpo">
          <ul className="grid gap-2">{primerosPasos.map((p, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className={`punto static inline-grid place-items-center w-6 h-6 rounded-full ${p.ok ? 'chip-exito' : 'chip-alerta'}`}><Icono nombre={p.ok ? 'check' : 'alerta'} tam={13} /></span><span className="flex-1">{p.texto}</span>{p.accion}</li>)}</ul>
          {sinCuenta ? <Alerta tipo="info" className="mt-3">{sinCuenta} {U.plural(sinCuenta, 'contrato', 'contratos')} sin cuenta vinculada: en Contratistas y contratos, pulsa «Vincular».</Alerta> : null}
        </div></div>
        <div className="tarjeta"><div className="tarjeta-cabecera"><h2>Estados del período</h2></div><div className="tarjeta-cuerpo">
          {cargando ? <Esqueleto filas={4} /> : (envios.length ? <ListaDatos items={Object.keys(U.ESTADOS).filter((k) => porEstado[k]).map((k) => ({ etiqueta: U.ESTADOS[k].etiqueta, valor: porEstado[k].length, mono: true }))} /> : <Vacio icono="envios" titulo="Sin envíos en el período" />)}
          <div className="flex gap-2 mt-3 flex-wrap"><Boton tam="sm" onClick={() => app.navegar('#/revision')}>Ir a revisión</Boton><Boton tam="sm" onClick={() => app.navegar('#/reportes')}>Reportes y Excel</Boton></div>
        </div></div>
      </div>
    </div>
  );
};

/* ===== 2. Contratos ===== */
const SelectorUsuarios = ({ usuarios, rol, valor, onCambio, etiqueta }) => {
  const lista = usuarios.filter((u) => u.rol === rol && u.activo !== false);
  const sel = valor || [];
  return (
    <Campo etiqueta={etiqueta} ayuda={`Usuarios con rol ${U.ROLES[rol].toLowerCase()}.`}>
      <div className="grid gap-1 max-h-48 overflow-auto p-2 rounded-md" style={{ border: '1px solid var(--borde-fuerte)' }}>
        {lista.map((u) => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="caja" checked={sel.includes(u.id)} onChange={(e) => onCambio(e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} />{u.nombreCompleto} <span className="texto-3 text-xs">{u.correo}</span></label>)}
        {!lista.length ? <span className="texto-3 text-sm">No hay usuarios con ese rol. Créalos en Usuarios.</span> : null}
      </div>
    </Campo>
  );
};
// Cuenta del contratista: el contrato queda listo al crearlo, sin activación. Si el correo
// ya tiene perfil (un contratista, o el admin u otro usuario que también es contratista)
// se vincula a ese; si no, se crea la cuenta y la persona recibe el enlace para definir su
// contraseña, que además deja su correo verificado. Devuelve { uid, creada, nombre, correoEnviado }.
const vincularCuentaContratista = async ({ contratoId, cedula, correo, nombres = '', apellidos = '', telefono = '', revisores = [], coordinadores = [], perfil }) => {
  const existente = perfil || (await DB.buscarUsuariosPorCorreo([correo]))[0];
  let cuenta;
  if (existente) {
    const suCedula = U.soloDigitos(existente.cedula);
    if (suCedula && suCedula !== cedula) throw new Error(`${correo} ya es la cuenta de ${existente.nombreCompleto || 'otra persona'} con otra cédula (${suCedula})`);
    await DB.actualizarPerfil(existente.id, { revisores, coordinadores, ...(suCedula ? {} : { cedula }) });
    cuenta = { uid: existente.id, creada: false, nombre: existente.nombreCompleto || correo, correoEnviado: false };
  } else {
    const { uid, correoEnviado } = await Auth.crearCuentaSecundaria(correo, `Tmp-${U.idAleatorio().slice(0, 10)}!`);
    const nombreCompleto = `${nombres} ${apellidos}`.replace(/\s+/g, ' ').trim();
    await DB.crearPerfil(uid, { rol: 'contratista', nombres, apellidos, nombreCompleto, nombreCorto: U.nombreCorto(nombres, apellidos), cedula, correo, telefono, activo: true, revisores, coordinadores });
    cuenta = { uid, creada: true, nombre: nombreCompleto, correoEnviado };
  }
  await DB.actualizarContrato(contratoId, { contratistaUid: cuenta.uid });
  try { await DB.marcarActivado(cedula, cuenta.uid); } catch (e) { /* sin precarga: nada que marcar */ }
  return cuenta;
};
// Contratos viejos sin nombres y apellidos separados: las dos últimas palabras son los apellidos.
const separarNombre = (completo) => {
  const p = String(completo || '').trim().split(/\s+/).filter(Boolean);
  return p.length >= 3 ? { nombres: p.slice(0, -2).join(' '), apellidos: p.slice(-2).join(' ') } : { nombres: p[0] || '', apellidos: p.slice(1).join(' ') };
};
const textoCuenta = (cuenta, correo, miUid) => {
  if (!cuenta.creada) return cuenta.uid === miUid ? 'Quedó vinculado a tu cuenta.' : `Quedó vinculado a la cuenta de ${cuenta.nombre}.`;
  return cuenta.correoEnviado
    ? `Se creó la cuenta de ${correo}: le llega un correo para definir su contraseña y con eso entra.`
    : `Se creó la cuenta de ${correo}, pero el correo no salió: al entrar, que use «Primera vez: crear mi contraseña».`;
};
const errorCuenta = (e) => (e && e.code === 'auth/email-already-in-use'
  ? 'ese correo ya tenía una cuenta sin perfil; el contrato se vincula cuando la persona entre con su contraseña'
  : DB.traducirError(e));
// Reasignar revisores/coordinadores: contrato + copias (perfil del contratista, envíos y solicitudes).
const reasignar = async (contrato, usuarios, revisores, coordinadores) => {
  const correos = (ids) => ids.map((id) => { const u = usuarios.find((x) => x.id === id); return u ? U.normalizarCorreo(u.correo) : ''; }).filter(Boolean);
  await DB.actualizarContrato(contrato.id, { revisores, coordinadores, correosRevisores: correos(revisores), correosCoordinadores: correos(coordinadores) });
  if (contrato.contratistaUid) await DB.actualizarPerfil(contrato.contratistaUid, { revisores, coordinadores }).catch(() => {});
  if (contrato.cedulaContratista) await DB.actualizarPreRegistro(contrato.cedulaContratista, { revisores, coordinadores }).catch(() => {});
  const envios = await DB.listarEnvios({ rol: 'admin', contratoId: contrato.id });
  for (const e of envios) await DB.actualizarEnvio(e.id, { revisores, coordinadores });
  const solicitudes = await DB.listarSolicitudes({ rol: 'admin', contratoId: contrato.id });
  for (const s of solicitudes) await DB.actualizarSolicitud(s.id, { revisores, coordinadores });
};
const ModalContrato = ({ contrato, usuarios, onCerrar, onGuardado }) => {
  const app = useApp();
  const [f, setF] = useState(() => (contrato ? { numero: contrato.numero, etiqueta: contrato.etiqueta || '', cedula: contrato.cedulaContratista || '', correo: contrato.correoContratista || '', nombreCompleto: (contrato.info && contrato.info.contratista && contrato.info.contratista.nombreCompleto) || '', revisores: contrato.revisores || [], coordinadores: contrato.coordinadores || [], estado: contrato.estado || 'activo' } : { numero: '', etiqueta: '', cedula: '', correo: '', nombres: '', apellidos: '', telefono: '', revisores: [], coordinadores: [], estado: 'activo' }));
  // El correo se corrige mientras el contrato no tenga cuenta vinculada.
  const correoEditable = !contrato || !contrato.contratistaUid;
  const [guardando, setGuardando] = useState(false);
  const poner = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = async () => {
    const cedula = U.soloDigitos(f.cedula), correo = U.normalizarCorreo(f.correo);
    if (!f.numero.trim()) { app.avisar('alerta', 'Escribe el número del contrato'); return; }
    if (!contrato && (cedula.length < 5 || !U.esCorreo(correo) || !f.nombres.trim() || !f.apellidos.trim())) { app.avisar('alerta', 'Cédula, correo, nombres y apellidos del contratista son obligatorios'); return; }
    if (contrato && correoEditable && !U.esCorreo(correo)) { app.avisar('alerta', 'Escribe un correo válido para el contratista'); return; }
    setGuardando(true);
    try {
      const id = contrato ? contrato.id : U.slug(f.numero);
      const correosDe = (ids) => ids.map((x) => { const u = usuarios.find((y) => y.id === x); return u ? U.normalizarCorreo(u.correo) : ''; }).filter(Boolean);
      if (contrato) {
        const cambiaCorreo = correoEditable && correo !== U.normalizarCorreo(contrato.correoContratista);
        await DB.actualizarContrato(id, { numero: f.numero.trim(), etiqueta: f.etiqueta.trim(), estado: f.estado, 'info.contratista.nombreCompleto': f.nombreCompleto.trim(), ...(cambiaCorreo ? { correoContratista: correo } : {}) });
        if (cambiaCorreo && contrato.cedulaContratista) await DB.actualizarPreRegistro(contrato.cedulaContratista, { correo }).catch(() => {});
        if (!U.igualProfundo(f.revisores, contrato.revisores || []) || !U.igualProfundo(f.coordinadores, contrato.coordinadores || [])) await reasignar(contrato, usuarios, f.revisores, f.coordinadores);
        app.avisar('exito', 'Contrato actualizado');
      } else {
        const nombres = f.nombres.trim(), apellidos = f.apellidos.trim(), telefono = f.telefono.trim();
        const nombreCompleto = `${nombres} ${apellidos}`.replace(/\s+/g, ' ');
        await DB.crearContrato(id, {
          numero: f.numero.trim(), etiqueta: f.etiqueta.trim(), contratistaUid: null, cedulaContratista: cedula, correoContratista: correo,
          revisores: f.revisores, coordinadores: f.coordinadores, correosRevisores: correosDe(f.revisores), correosCoordinadores: correosDe(f.coordinadores), estado: 'activo', permitirActualizar: false,
          info: { contratista: { nombreCompleto, cedula, telefono }, contrato: { numero: f.numero.trim() }, obligaciones: { lista: [] }, supervision: {}, modificaciones: {} },
        });
        const pre = await DB.obtenerPreRegistro(cedula);
        if (pre) await DB.actualizarPreRegistro(cedula, { correo, nombreCompleto, contratos: U.unicos([...(pre.contratos || []), id]), revisores: f.revisores, coordinadores: f.coordinadores });
        else await DB.guardarPreRegistro(cedula, { correo, nombreCompleto, contratos: [id], revisores: f.revisores, coordinadores: f.coordinadores });
        try {
          const cuenta = await vincularCuentaContratista({ contratoId: id, cedula, correo, nombres, apellidos, telefono, revisores: f.revisores, coordinadores: f.coordinadores });
          app.avisar('exito', `Contrato creado. ${textoCuenta(cuenta, correo, app.usuario.id)}`);
        } catch (e) { app.avisar('alerta', `Contrato creado, pero sin cuenta: ${errorCuenta(e)}. Puedes reintentar con «Vincular».`); }
      }
      onGuardado();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo={contrato ? `Editar ${contrato.numero}` : 'Nuevo contrato'} ancho="ancho" onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" icono="check" cargando={guardando} onClick={guardar}>Guardar</Boton></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo etiqueta="Número del contrato" obligatoria ayuda={contrato ? `ID: ${contrato.id}` : 'El ID se deriva del número (sin espacios ni guiones bajos).'}><Entrada value={f.numero} onChange={poner('numero')} placeholder="P-00000 DE 2026" /></Campo>
        <Campo etiqueta="Etiqueta" ayuda="Ayuda a distinguir varios contratos del mismo contratista."><Entrada value={f.etiqueta} onChange={poner('etiqueta')} placeholder="AGOSTO 4230" /></Campo>
        <Campo etiqueta="Cédula del contratista" obligatoria={!contrato}><Entrada className="mono" inputMode="numeric" value={f.cedula} onChange={poner('cedula')} disabled={!!contrato} /></Campo>
        <Campo etiqueta="Correo del contratista" obligatoria={correoEditable} ayuda={!contrato ? 'Si ya tiene cuenta se vincula a esa; si no, se le crea y le llega un correo para definir su contraseña.' : (correoEditable ? 'Aún sin cuenta: corrígelo si hace falta y luego usa «Vincular».' : 'Su cuenta ya está vinculada.')}><Entrada type="email" value={f.correo} onChange={poner('correo')} disabled={!correoEditable} /></Campo>
        {contrato ? <Campo etiqueta="Nombre completo" className="md:col-span-2"><Entrada value={f.nombreCompleto} onChange={poner('nombreCompleto')} /></Campo> : <>
          <Campo etiqueta="Nombres" obligatoria><Entrada value={f.nombres} onChange={poner('nombres')} autoComplete="off" /></Campo>
          <Campo etiqueta="Apellidos" obligatoria><Entrada value={f.apellidos} onChange={poner('apellidos')} autoComplete="off" /></Campo>
          <Campo etiqueta="Teléfono"><Entrada inputMode="tel" value={f.telefono} onChange={poner('telefono')} autoComplete="off" /></Campo>
        </>}
        {contrato ? <Campo etiqueta="Estado"><Selector vacio={null} opciones={[{ valor: 'activo', etiqueta: 'Activo' }, { valor: 'terminado', etiqueta: 'Terminado' }]} value={f.estado} onChange={poner('estado')} /></Campo> : null}
        <SelectorUsuarios usuarios={usuarios} rol="revisor" etiqueta="Revisores" valor={f.revisores} onCambio={(v) => setF({ ...f, revisores: v })} />
        <SelectorUsuarios usuarios={usuarios} rol="coordinador" etiqueta="Coordinadores" valor={f.coordinadores} onCambio={(v) => setF({ ...f, coordinadores: v })} />
      </div>
      {!contrato ? <Alerta tipo="info" className="mt-4">El contrato queda listo al guardarlo, con la cuenta del contratista vinculada. Después ábrelo para completar fechas, valores, objeto, obligaciones y supervisión (o usa el importador Excel).</Alerta> : null}
    </Modal>
  );
};
const PaginaAdminContratos = () => {
  const app = useApp();
  const [pestana, setPestana] = useState('contratos');
  const [texto, setTexto] = useState('');
  const [modal, setModal] = useState(null); // { contrato } | 'nuevo'
  const { datos, cargando, recargar } = useCarga(async () => { const [usuarios, pre] = await Promise.all([DB.listarUsuarios(), DB.listarPreRegistros()]); return { usuarios, pre }; }, []);
  const usuarios = (datos && datos.usuarios) || [];
  const nombreDe = (id) => { const u = usuarios.find((x) => x.id === id); return u ? u.nombreCorto || u.nombreCompleto : id; };
  const lista = app.contratos.filter((c) => !texto || U.sinTildes(`${c.numero} ${c.etiqueta || ''} ${c.cedulaContratista || ''} ${(c.info && c.info.contratista && c.info.contratista.nombreCompleto) || ''}`).toLowerCase().includes(U.sinTildes(texto).toLowerCase()));
  const eliminar = async (c) => {
    if (!(await app.confirmar({ titulo: 'Eliminar contrato', mensaje: `Se elimina ${c.numero}. Los envíos existentes quedan huérfanos; úsalo solo si se creó por error.`, textoOk: 'Eliminar', peligro: true }))) return;
    try { await DB.eliminarContrato(c.id); app.avisar('exito', 'Contrato eliminado'); app.recargarTodo(); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  // Contratos sin cuenta (creados antes de vincular al crear, o si la cuenta no se pudo crear).
  const vincular = async (c) => {
    const correo = U.normalizarCorreo(c.correoContratista), cedula = U.soloDigitos(c.cedulaContratista);
    if (!U.esCorreo(correo) || cedula.length < 5) { app.avisar('alerta', 'El contrato no tiene cédula y correo válidos del contratista: corrígelos en «Asignar / editar».'); return; }
    const dueno = usuarios.find((u) => U.normalizarCorreo(u.correo) === correo);
    const mensaje = dueno
      ? `Se vincula ${c.numero} a la cuenta existente de ${dueno.nombreCompleto} (${correo}).`
      : `Se crea la cuenta de ${correo} y se vincula ${c.numero}. Le llega un correo para definir su contraseña; con eso entra, sin activar nada.`;
    if (!(await app.confirmar({ titulo: 'Vincular cuenta', mensaje, textoOk: dueno ? 'Vincular' : 'Crear cuenta' }))) return;
    try {
      const ic = (c.info && c.info.contratista) || {};
      const cuenta = await vincularCuentaContratista({ contratoId: c.id, cedula, correo, ...separarNombre(ic.nombreCompleto), telefono: ic.telefono || '', revisores: c.revisores || [], coordinadores: c.coordinadores || [] });
      app.avisar('exito', textoCuenta(cuenta, correo, app.usuario.id));
      recargar(true); app.recargarTodo();
    } catch (e) { app.avisar('error', `No se pudo vincular: ${errorCuenta(e)}`); }
  };
  const eliminarPre = async (p) => {
    if (!(await app.confirmar({ titulo: 'Eliminar precarga', mensaje: `Se elimina la precarga de ${p.nombreCompleto} (${p.id}). Si ya activó su cuenta, el perfil no se toca.`, textoOk: 'Eliminar', peligro: true }))) return;
    try { await DB.adaptador.delete('preRegistro', p.id); app.avisar('exito', 'Precarga eliminada'); recargar(true); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  return (
    <div>
      <Encabezado titulo="Contratistas y contratos" subtitulo="Al crear o importar un contrato, la cuenta del contratista queda lista. Aquí también asignas revisores y coordinadores." acciones={<><Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => { recargar(); app.recargarTodo(); }}>Actualizar</Boton><Boton tam="sm" variante="primario" icono="mas" onClick={() => setModal('nuevo')}>Nuevo contrato</Boton></>} />
      <Pestanas activa={pestana} onCambio={setPestana} lista={[{ id: 'contratos', etiqueta: 'Contratos', icono: 'contrato', contador: app.contratos.length }, { id: 'pre', etiqueta: 'Precargados', icono: 'cedula', contador: ((datos && datos.pre) || []).filter((p) => !p.activado).length }, { id: 'importar', etiqueta: 'Importar Excel', icono: 'excel' }]} />
      <div className="mt-4">
        {pestana === 'contratos' ? <>
          <div className="relative mb-3 max-w-md"><Entrada placeholder="Buscar por número, etiqueta, cédula o nombre" value={texto} onChange={(e) => setTexto(e.target.value)} className="campo-con-icono" aria-label="Buscar" /><Icono nombre="buscar" className="absolute left-3 top-1/2 -translate-y-1/2 texto-3" /></div>
          <Tabla cargando={cargando} filas={lista} vacio={<Vacio icono="contrato" titulo="Sin contratos" texto="Crea uno o importa el Excel." />} columnas={[
            { titulo: 'Contrato', render: (c) => <span className="mono">{c.numero}</span> }, { titulo: 'Etiqueta', clave: 'etiqueta' },
            { titulo: 'Contratista', render: (c) => <span>{(c.info && c.info.contratista && c.info.contratista.nombreCompleto) || '—'}<div className="text-xs texto-3 mono">{c.cedulaContratista}</div></span> },
            { titulo: 'Cuenta', render: (c) => (c.contratistaUid ? <Chip tipo="exito" icono="check">{c.contratistaUid === app.usuario.id ? 'Tu cuenta' : 'Vinculada'}</Chip> : <Boton tam="xs" variante="acento" icono="enlace" titulo="Crear o vincular la cuenta del contratista" onClick={() => vincular(c)}>Vincular</Boton>) },
            { titulo: 'Revisores', render: (c) => (c.revisores || []).map(nombreDe).join(', ') || <span className="texto-3">Sin asignar</span> },
            { titulo: 'Coordinadores', render: (c) => (c.coordinadores || []).map(nombreDe).join(', ') || <span className="texto-3">Sin asignar</span> },
            { titulo: 'Estado', render: (c) => <Chip tipo={c.estado === 'terminado' ? 'neutro' : 'primario'}>{c.estado === 'terminado' ? 'Terminado' : 'Activo'}</Chip> },
          ]} acciones={(c) => <><Boton tam="xs" icono="derecha" onClick={() => { app.elegirContrato(c.id); app.navegar('#/contrato'); }}>Abrir</Boton><Boton tam="xs" variante="fantasma" icono="editar" onClick={() => setModal({ contrato: c })}>Asignar / editar</Boton><Boton tam="xs" variante="fantasma" icono="basura" soloIcono titulo="Eliminar" onClick={() => eliminar(c)} /></>} />
        </> : null}
        {pestana === 'pre' ? <Tabla cargando={cargando} filas={(datos && datos.pre) || []} vacio={<Vacio icono="cedula" titulo="Sin precargas" />} columnas={[
          { titulo: 'Cédula', render: (p) => <span className="mono">{p.id}</span> }, { titulo: 'Nombre', clave: 'nombreCompleto' }, { titulo: 'Correo', clave: 'correo' },
          { titulo: 'Contratos', render: (p) => (p.contratos || []).join(', ') }, { titulo: 'Cuenta', render: (p) => (p.activado ? <Chip tipo="exito" icono="check">Vinculada</Chip> : <Chip tipo="alerta">Pendiente</Chip>) },
        ]} acciones={(p) => <Boton tam="xs" variante="fantasma" icono="basura" soloIcono titulo="Eliminar" onClick={() => eliminarPre(p)} />} /> : null}
        {pestana === 'importar' ? <ImportadorExcel usuarios={usuarios} alTerminar={() => { recargar(true); app.recargarTodo(); }} /> : null}
      </div>
      {modal === 'nuevo' ? <ModalContrato usuarios={usuarios} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); app.recargarTodo(); recargar(true); }} /> : null}
      {modal && modal.contrato ? <ModalContrato contrato={modal.contrato} usuarios={usuarios} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); app.recargarTodo(); }} /> : null}
    </div>
  );
};

/* ===== 3. Importador Excel ===== */
const COLUMNAS_IMPORT = ['cedula', 'correo', 'nombres', 'apellidos', 'telefono', 'numeroContrato', 'etiqueta', 'fechaInicio', 'fechaFin', 'valorTotal', 'valorMensual', 'objeto', 'componente', 'equipo', 'supervisor', 'validador', 'rolProceso', 'cdp', 'rp', 'plazoDias', 'correosRevisores', 'correosCoordinadores', 'obligaciones'];
const aISOImport = (v) => {
  if (!v && v !== 0) return '';
  // SheetJS entrega las fechas a medianoche local; si vienen en UTC (otra zona) se usan los getters UTC.
  if (U.esFecha(v)) {
    const local = v.getHours() === 0 && v.getMinutes() === 0;
    return local ? U.isoDePartes(v.getFullYear(), v.getMonth() + 1, v.getDate()) : U.isoDePartes(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  const s = String(v).trim();
  if (U.esISO(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return U.isoDePartes(+m[3], +m[2], +m[1]);
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return aISOImport(d); }
  return s;
};
const ImportadorExcel = ({ usuarios, alTerminar }) => {
  const app = useApp();
  const [filas, setFilas] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const plantilla = () => {
    Descargas.exportarExcel({ nombreArchivo: 'Plantilla importacion contratistas.xlsx', hojas: [{ nombre: 'Contratos', columnas: COLUMNAS_IMPORT.map((c) => ({ titulo: c, clave: c, ancho: c === 'objeto' || c === 'obligaciones' ? 60 : 20 })), filas: [{
      cedula: '1000000000', correo: 'persona@ejemplo.com', nombres: 'Nombre', apellidos: 'Apellido Apellido', telefono: '3000000000', numeroContrato: 'P-00000 DE 2026', etiqueta: 'PRINCIPAL', fechaInicio: '2026-02-02', fechaFin: '2026-12-31', valorTotal: 45000000, valorMensual: 4500000,
      objeto: 'Objeto del contrato…', componente: '1. COMPONENTE <PENDIENTE>', equipo: 'Equipo <PENDIENTE>', supervisor: 'Nombre del supervisor ITM', validador: 'Nombre del validador', rolProceso: 'Rol en el proceso', cdp: '', rp: '', plazoDias: 300,
      correosRevisores: 'revisor@entidad.gov.co', correosCoordinadores: 'coordinador@entidad.gov.co', obligaciones: 'Obligación 1 | Obligación 2 | Obligación 3',
    }] }] });
  };
  const validar = (lista) => {
    const revisoresPorCorreo = {}; usuarios.forEach((u) => { revisoresPorCorreo[U.normalizarCorreo(u.correo)] = u; });
    return lista.map((f, i) => {
      const errores = [];
      const cedula = U.soloDigitos(f.cedula);
      const correo = U.normalizarCorreo(f.correo);
      if (cedula.length < 5) errores.push('cédula inválida');
      if (!U.esCorreo(correo)) errores.push('correo inválido');
      if (!String(f.nombres || '').trim() || !String(f.apellidos || '').trim()) errores.push('nombres y apellidos obligatorios');
      if (!String(f.numeroContrato || '').trim()) errores.push('numeroContrato obligatorio');
      const fechaInicio = aISOImport(f.fechaInicio), fechaFin = aISOImport(f.fechaFin);
      if (fechaInicio && !U.esISO(fechaInicio)) errores.push('fechaInicio inválida');
      if (fechaFin && !U.esISO(fechaFin)) errores.push('fechaFin inválida');
      const resolver = (campo, rol) => String(f[campo] || '').split(/[;,]/).map(U.normalizarCorreo).filter(Boolean).map((c) => { const u = revisoresPorCorreo[c]; if (!u || u.rol !== rol) { errores.push(`${campo}: ${c} no es un usuario ${rol}`); return null; } return u.id; }).filter(Boolean);
      const revisores = resolver('correosRevisores', 'revisor'), coordinadores = resolver('correosCoordinadores', 'coordinador');
      const obligaciones = String(f.obligaciones || '').split(/\s*\|\s*|\r?\n/).map((t) => t.trim()).filter(Boolean).map((texto, k) => ({ numero: k + 1, texto }));
      return { fila: i + 2, cedula, correo, nombres: String(f.nombres || '').trim(), apellidos: String(f.apellidos || '').trim(), telefono: String(f.telefono || '').trim(), numeroContrato: String(f.numeroContrato || '').trim(), id: U.slug(f.numeroContrato || ''), etiqueta: String(f.etiqueta || '').trim(), fechaInicio, fechaFin, valorTotal: U.parseNumero(f.valorTotal), valorMensual: U.parseNumero(f.valorMensual), objeto: String(f.objeto || '').trim(), componente: String(f.componente || '').trim(), equipo: String(f.equipo || '').trim(), supervisor: String(f.supervisor || '').trim(), validador: String(f.validador || '').trim(), rolProceso: String(f.rolProceso || '').trim(), cdp: String(f.cdp || '').trim(), rp: String(f.rp || '').trim(), plazoDias: U.parseNumero(f.plazoDias), revisores, coordinadores, obligaciones, errores };
    });
  };
  const leer = async (archivo) => {
    if (!archivo) return;
    try { const { filas: f } = await Descargas.leerExcel(archivo); if (!f.length) { app.avisar('alerta', 'El archivo no tiene filas'); return; } setFilas(validar(f)); setResultado(null); }
    catch (e) { app.avisar('error', `No se pudo leer el Excel: ${e.message}`); }
  };
  // Catálogos: busca por etiqueta o valor; si no existe, lo agrega (semilla).
  const opcionCatalogo = async (catalogos, id, nombre, texto) => {
    if (!texto) return '';
    let cat = catalogos.find((c) => c.id === id);
    if (!cat) { cat = { id, nombre, opciones: [] }; catalogos.push(cat); }
    const t = U.sinTildes(texto).toLowerCase();
    let op = (cat.opciones || []).find((o) => U.sinTildes(o.etiqueta).toLowerCase() === t || String(o.valor).toLowerCase() === t);
    if (!op) { op = { valor: U.slug(texto).slice(0, 40) || `OP-${(cat.opciones || []).length + 1}`, etiqueta: texto, grupo: '' }; cat.opciones = [...(cat.opciones || []), op]; cat.modificado = true; }
    return op.valor;
  };
  const importar = async () => {
    const validas = filas.filter((f) => !f.errores.length);
    if (!validas.length) return;
    if (!(await app.confirmar({ titulo: 'Importar', mensaje: `Se importarán ${validas.length} ${U.plural(validas.length, 'fila válida', 'filas válidas')}; las ${filas.length - validas.length} con errores se omiten.`, textoOk: 'Importar' }))) return;
    setImportando(true);
    const res = { contratosCreados: 0, contratosActualizados: 0, preNuevos: 0, preActualizados: 0, cuentasNuevas: 0, vinculados: 0, errores: [] };
    try {
      const catalogos = U.clonar(await DB.listarCatalogos());
      for (const f of validas) {
        setProgreso(`Fila ${f.fila}: ${f.numeroContrato}`);
        try {
          const componente = await opcionCatalogo(catalogos, 'componentes', 'Componentes del proyecto', f.componente);
          const equipo = await opcionCatalogo(catalogos, 'equipos', 'Equipos o unidades', f.equipo);
          const correosDe = (ids) => ids.map((x) => { const u = usuarios.find((y) => y.id === x); return u ? U.normalizarCorreo(u.correo) : ''; }).filter(Boolean);
          const nombreCompleto = `${f.nombres} ${f.apellidos}`.replace(/\s+/g, ' ');
          const infoContrato = U.sinIndefinidos({ numero: f.numeroContrato, objeto: f.objeto, componente, equipo, fechaInicio: f.fechaInicio, fechaFin: f.fechaFin, plazoDias: f.plazoDias == null ? '' : f.plazoDias, valorTotal: f.valorTotal == null ? '' : f.valorTotal, valorMensual: f.valorMensual == null ? '' : f.valorMensual, cdp: f.cdp, rp: f.rp });
          const existente = await DB.obtenerContrato(f.id);
          if (existente) {
            await DB.actualizarContrato(f.id, { numero: f.numeroContrato, etiqueta: f.etiqueta, ...(existente.contratistaUid ? {} : { correoContratista: f.correo }), 'info.contrato': { ...(existente.info && existente.info.contrato), ...infoContrato }, 'info.obligaciones': { lista: f.obligaciones.length ? f.obligaciones : ((existente.info && existente.info.obligaciones && existente.info.obligaciones.lista) || []) }, 'info.supervision': { supervisor: f.supervisor, validador: f.validador }, 'info.contratista.nombreCompleto': nombreCompleto, 'info.contratista.rolProceso': f.rolProceso, 'info.contratista.telefono': f.telefono }, { por: app.usuario.id, cambios: { importacion: { antes: null, despues: `Fila ${f.fila}` } } });
            if (!U.igualProfundo(f.revisores, existente.revisores || []) || !U.igualProfundo(f.coordinadores, existente.coordinadores || [])) await reasignar(existente, usuarios, f.revisores, f.coordinadores);
            res.contratosActualizados++;
          } else {
            await DB.crearContrato(f.id, {
              numero: f.numeroContrato, etiqueta: f.etiqueta, contratistaUid: null, cedulaContratista: f.cedula, correoContratista: f.correo,
              revisores: f.revisores, coordinadores: f.coordinadores, correosRevisores: correosDe(f.revisores), correosCoordinadores: correosDe(f.coordinadores), estado: 'activo', permitirActualizar: false,
              info: { contratista: { nombreCompleto, cedula: f.cedula, telefono: f.telefono, rolProceso: f.rolProceso, rutaNas: String(app.parametros.rutaNasPlantilla || '').replace(/<CEDULA>/g, f.cedula) }, contrato: infoContrato, obligaciones: { lista: f.obligaciones }, supervision: { supervisor: f.supervisor, validador: f.validador }, modificaciones: { adiciones: [], ampliaciones: [], suspensiones: [], garantias: [], pagos: [] } },
            });
            res.contratosCreados++;
          }
          const pre = await DB.obtenerPreRegistro(f.cedula);
          if (pre) { await DB.actualizarPreRegistro(f.cedula, { correo: f.correo, nombreCompleto, contratos: U.unicos([...(pre.contratos || []), f.id]), revisores: f.revisores, coordinadores: f.coordinadores }); res.preActualizados++; }
          else { await DB.guardarPreRegistro(f.cedula, { correo: f.correo, nombreCompleto, contratos: [f.id], revisores: f.revisores, coordinadores: f.coordinadores }); res.preNuevos++; }
          // La cuenta del contratista queda lista con la importación (también en contratos que aún no la tenían).
          if (!(existente && existente.contratistaUid)) {
            try {
              const cedula = (existente && U.soloDigitos(existente.cedulaContratista)) || f.cedula;
              const cuenta = await vincularCuentaContratista({ contratoId: f.id, cedula, correo: f.correo, nombres: f.nombres, apellidos: f.apellidos, telefono: f.telefono, revisores: f.revisores, coordinadores: f.coordinadores });
              if (cuenta.creada) res.cuentasNuevas++; else res.vinculados++;
              if (cuenta.creada && !cuenta.correoEnviado) res.errores.push(`Fila ${f.fila}: la cuenta se creó, pero el correo no salió (que use «Primera vez: crear mi contraseña»)`);
            } catch (e) { res.errores.push(`Fila ${f.fila}: contrato importado sin cuenta (${errorCuenta(e)})`); }
          }
        } catch (e) { res.errores.push(`Fila ${f.fila}: ${DB.traducirError(e)}`); }
      }
      for (const c of catalogos.filter((x) => x.modificado)) { const d = { ...c }; delete d.modificado; await DB.guardarCatalogo(c.id, d); }
      setResultado(res);
      app.avisar(res.errores.length ? 'alerta' : 'exito', `Importación terminada: ${res.contratosCreados} creados, ${res.contratosActualizados} actualizados, ${res.cuentasNuevas} ${U.plural(res.cuentasNuevas, 'cuenta nueva', 'cuentas nuevas')}${res.errores.length ? `, ${res.errores.length} con aviso` : ''}`);
      alTerminar();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setImportando(false); setProgreso(''); }
  };
  const conError = filas ? filas.filter((f) => f.errores.length).length : 0;
  return (
    <div className="grid gap-4">
      <div className="tarjeta"><div className="tarjeta-cuerpo grid gap-3">
        <p className="text-sm texto-2">Una fila por contrato. Columnas: <span className="mono text-xs">{COLUMNAS_IMPORT.join(', ')}</span>. Los correos de revisores y coordinadores deben existir ya como usuarios. Las obligaciones se separan con «|». La cuenta de cada contratista queda lista al importar: si su correo aún no tiene cuenta, se crea y le llega un correo para definir su contraseña.</p>
        <div className="flex gap-2 flex-wrap">
          <Boton tam="sm" icono="descargar" onClick={plantilla}>Descargar plantilla</Boton>
          <label className="btn btn-primario btn-sm cursor-pointer"><Icono nombre="subir" /> Elegir Excel<input type="file" className="sr-solo" accept=".xlsx,.xls,.csv" onChange={(e) => { leer(e.target.files[0]); e.target.value = ''; }} /></label>
        </div>
      </div></div>
      {filas ? (
        <div className="tarjeta">
          <div className="tarjeta-cabecera"><h2>Validación previa</h2><div className="flex gap-2 items-center"><Chip tipo="exito">{filas.length - conError} válidas</Chip>{conError ? <Chip tipo="error">{conError} con errores</Chip> : null}</div></div>
          <div className="tarjeta-cuerpo">
            <Tabla filas={filas} claveFila={(f) => f.fila} columnas={[
              { titulo: 'Fila', clave: 'fila', mono: true }, { titulo: 'Contrato', render: (f) => <span className="mono">{f.numeroContrato}</span> }, { titulo: 'Cédula', clave: 'cedula', mono: true }, { titulo: 'Contratista', render: (f) => `${f.nombres} ${f.apellidos}` }, { titulo: 'Correo', clave: 'correo' },
              { titulo: 'Obligaciones', render: (f) => f.obligaciones.length }, { titulo: 'Resultado', render: (f) => (f.errores.length ? <span className="text-xs" style={{ color: 'var(--error)' }}>{f.errores.join(' · ')}</span> : <Chip tipo="exito" icono="check">Lista</Chip>) },
            ]} />
            <div className="flex gap-2 mt-3 items-center flex-wrap"><Boton variante="primario" icono="check" cargando={importando} disabled={filas.length - conError === 0} onClick={importar}>Importar {filas.length - conError} {U.plural(filas.length - conError, 'fila', 'filas')}</Boton><Boton variante="fantasma" onClick={() => setFilas(null)}>Descartar</Boton>{progreso ? <span className="text-sm texto-2">{progreso}</span> : null}</div>
          </div>
        </div>
      ) : null}
      {resultado ? <Alerta tipo={resultado.errores.length ? 'alerta' : 'exito'}><div>Contratos creados: {resultado.contratosCreados} · actualizados: {resultado.contratosActualizados} · cuentas nuevas: {resultado.cuentasNuevas} · vinculados a cuentas existentes: {resultado.vinculados} · precargas nuevas: {resultado.preNuevos} · actualizadas: {resultado.preActualizados}</div>{resultado.errores.length ? <ul className="mt-1 text-xs">{resultado.errores.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}</Alerta> : null}
    </div>
  );
};

/* ===== 4. Usuarios ===== */
const ModalUsuario = ({ onCerrar, onGuardado }) => {
  const app = useApp();
  const [f, setF] = useState({ nombres: '', apellidos: '', correo: '', rol: 'revisor', cedula: '', telefono: '' });
  const [guardando, setGuardando] = useState(false);
  const poner = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = async () => {
    const correo = U.normalizarCorreo(f.correo);
    if (!f.nombres.trim() || !f.apellidos.trim() || !U.esCorreo(correo)) { app.avisar('alerta', 'Nombres, apellidos y correo válido son obligatorios'); return; }
    setGuardando(true);
    try {
      const claveTemporal = `Tmp-${U.idAleatorio().slice(0, 10)}!`;
      const { uid, correoEnviado } = await Auth.crearCuentaSecundaria(correo, claveTemporal);
      await DB.crearPerfil(uid, { rol: f.rol, nombres: f.nombres.trim(), apellidos: f.apellidos.trim(), nombreCompleto: `${f.nombres.trim()} ${f.apellidos.trim()}`, nombreCorto: U.nombreCorto(f.nombres, f.apellidos), cedula: U.soloDigitos(f.cedula), correo, telefono: f.telefono.trim(), activo: true, revisores: [], coordinadores: [] });
      if (MODO_DEMO) app.avisar('exito', 'Usuario creado (demostración)');
      else if (correoEnviado) app.avisar('exito', 'Usuario creado. Le llega un correo para definir su contraseña; con eso entra.');
      else app.avisar('alerta', 'Usuario creado, pero el correo no salió: al entrar, que use «Primera vez: crear mi contraseña».');
      onGuardado();
    } catch (e) { app.avisar('error', Auth.traducirError(e)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo="Nuevo usuario" onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" icono="check" cargando={guardando} onClick={guardar}>Crear</Boton></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombres" obligatoria><Entrada value={f.nombres} onChange={poner('nombres')} /></Campo>
        <Campo etiqueta="Apellidos" obligatoria><Entrada value={f.apellidos} onChange={poner('apellidos')} /></Campo>
        <Campo etiqueta="Correo" obligatoria className="sm:col-span-2"><Entrada type="email" value={f.correo} onChange={poner('correo')} /></Campo>
        <Campo etiqueta="Rol" obligatoria><Selector vacio={null} opciones={[{ valor: 'revisor', etiqueta: 'Revisor' }, { valor: 'coordinador', etiqueta: 'Coordinador' }, { valor: 'admin', etiqueta: 'Administrador' }]} value={f.rol} onChange={poner('rol')} /></Campo>
        <Campo etiqueta="Cédula"><Entrada className="mono" inputMode="numeric" value={f.cedula} onChange={poner('cedula')} /></Campo>
        <Campo etiqueta="Teléfono"><Entrada inputMode="tel" value={f.telefono} onChange={poner('telefono')} /></Campo>
      </div>
      <Alerta tipo="info" className="mt-4">Los contratistas no se crean aquí: su cuenta queda lista al crear o importar su contrato en Contratistas y contratos.</Alerta>
    </Modal>
  );
};
const PaginaAdminUsuarios = () => {
  const app = useApp();
  const [nuevo, setNuevo] = useState(false);
  const [texto, setTexto] = useState('');
  const { datos, cargando, recargar } = useCarga(() => DB.listarUsuarios(), []);
  const lista = (datos || []).filter((u) => !texto || U.sinTildes(`${u.nombreCompleto} ${u.correo} ${u.cedula || ''} ${U.ROLES[u.rol] || ''}`).toLowerCase().includes(U.sinTildes(texto).toLowerCase()));
  const cambiarRol = async (u, rol) => { try { await DB.actualizarPerfil(u.id, { rol }); app.avisar('exito', `Rol de ${u.nombreCorto || u.nombreCompleto}: ${U.ROLES[rol]}`); recargar(true); } catch (e) { app.avisar('error', DB.traducirError(e)); } };
  const alternarActivo = async (u) => {
    if (u.id === app.usuario.id) { app.avisar('alerta', 'No puedes desactivar tu propia cuenta'); return; }
    try { await DB.actualizarPerfil(u.id, { activo: !u.activo }); recargar(true); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  return (
    <div>
      <Encabezado titulo="Usuarios" subtitulo="Revisores, coordinadores y administradores. Los contratistas aparecen al crear o importar su contrato." acciones={<><Boton tam="sm" variante="fantasma" icono="refrescar" onClick={() => recargar()}>Actualizar</Boton><Boton tam="sm" variante="primario" icono="mas" onClick={() => setNuevo(true)}>Nuevo usuario</Boton></>} />
      <div className="relative mb-3 max-w-md"><Entrada placeholder="Buscar por nombre, correo, cédula o rol" value={texto} onChange={(e) => setTexto(e.target.value)} className="campo-con-icono" aria-label="Buscar" /><Icono nombre="buscar" className="absolute left-3 top-1/2 -translate-y-1/2 texto-3" /></div>
      <Tabla cargando={cargando} filas={lista} vacio={<Vacio icono="usuarios" titulo="Sin usuarios" />} columnas={[
        { titulo: 'Nombre', render: (u) => <span>{u.nombreCompleto}{u.id === app.usuario.id ? <Chip tipo="primario" className="ml-2">Tú</Chip> : null}</span> }, { titulo: 'Correo', clave: 'correo' }, { titulo: 'Cédula', clave: 'cedula', mono: true },
        { titulo: 'Rol', render: (u) => <Selector vacio={null} className="btn-sm" style={{ minHeight: 36, width: 'auto' }} opciones={Object.keys(U.ROLES).map((r) => ({ valor: r, etiqueta: U.ROLES[r] }))} value={u.rol} onChange={(e) => cambiarRol(u, e.target.value)} disabled={u.id === app.usuario.id} aria-label={`Rol de ${u.nombreCompleto}`} /> },
        { titulo: 'Estado', render: (u) => (u.activo === false ? <Chip tipo="error">Inactivo</Chip> : <Chip tipo="exito">Activo</Chip>) },
        { titulo: 'Asignaciones', render: (u) => (u.rol === 'contratista' ? `${(u.revisores || []).length} rev · ${(u.coordinadores || []).length} coord` : '—') },
      ]} acciones={(u) => <Boton tam="xs" variante={u.activo === false ? 'secundario' : 'fantasma'} icono={u.activo === false ? 'check' : 'x'} onClick={() => alternarActivo(u)}>{u.activo === false ? 'Activar' : 'Desactivar'}</Boton>} />
      {nuevo ? <ModalUsuario onCerrar={() => setNuevo(false)} onGuardado={() => { setNuevo(false); recargar(true); }} /> : null}
    </div>
  );
};

/* ===== 5. Ventanas ===== */
const ModalVentana = ({ ventana, onCerrar, onGuardado }) => {
  const app = useApp();
  const formularios = app.formularios.filter((f) => f.activo && requiereVentana(f));
  const [f, setF] = useState(() => {
    if (ventana) return { periodo: ventana.periodo, desde: U.localDeDate(ventana.desde), hasta: U.localDeDate(ventana.hasta), formularios: ventana.formularios || [], aviso: ventana.aviso || '' };
    const p = app.periodo; const r = U.rangoPeriodo(p);
    return { periodo: p, desde: `${r.desde}T08:00`, hasta: `${r.hasta}T22:00`, formularios: formularios.map((x) => x.id), aviso: '' };
  });
  const [guardando, setGuardando] = useState(false);
  const desde = U.dateDeLocal(f.desde), hasta = U.dateDeLocal(f.hasta);
  const generarAviso = () => {
    if (!desde || !hasta) return;
    const nombres = f.formularios.map((id) => nombreFormulario(app, id)).join(' e ');
    setF({ ...f, aviso: `Para el mes de <b>${U.nombrePeriodo(f.periodo).toUpperCase()}</b> la plataforma quedará habilitada para diligenciar ${nombres} ${U.textoVentana({ desde, hasta })}. Cualquier corrección, desde <b>Solicitudes</b>.` });
  };
  const guardar = async () => {
    if (!/^\d{4}-\d{2}$/.test(f.periodo)) { app.avisar('alerta', 'Período inválido (AAAA-MM)'); return; }
    if (!desde || !hasta || hasta <= desde) { app.avisar('alerta', 'Revisa las fechas: el cierre debe ser posterior a la apertura'); return; }
    if (!f.formularios.length) { app.avisar('alerta', 'Elige al menos un formulario'); return; }
    setGuardando(true);
    try { await DB.guardarVentana(f.periodo, { periodo: f.periodo, desde, hasta, formularios: f.formularios, aviso: U.sanitizarHTML(f.aviso) }); app.avisar('exito', 'Ventana guardada'); onGuardado(); }
    catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  return (
    <Modal titulo={ventana ? `Ventana ${U.nombrePeriodo(ventana.periodo)}` : 'Nueva ventana'} ancho="ancho" onCerrar={onCerrar} pie={<><Boton onClick={onCerrar}>Cancelar</Boton><Boton variante="primario" icono="check" cargando={guardando} onClick={guardar}>Guardar</Boton></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo etiqueta="Período" obligatoria ayuda="Un documento por período (AAAA-MM)."><Entrada type="month" className="mono" value={f.periodo} disabled={!!ventana} onChange={(e) => setF({ ...f, periodo: e.target.value })} /></Campo>
        <div />
        <Campo etiqueta="Abre (hora de Bogotá)" obligatoria><Entrada type="datetime-local" className="mono" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Cierra (hora de Bogotá)" obligatoria><Entrada type="datetime-local" className="mono" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
        <Campo etiqueta="Formularios habilitados" obligatoria className="md:col-span-2">
          <div className="grid gap-1">{formularios.map((x) => <label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="caja" checked={f.formularios.includes(x.id)} onChange={(e) => setF({ ...f, formularios: e.target.checked ? [...f.formularios, x.id] : f.formularios.filter((y) => y !== x.id) })} />{x.nombre}</label>)}</div>
        </Campo>
        <Campo etiqueta="Aviso del inicio" ayuda="Se muestra en el tablero del contratista. Se permiten b, i, u, br, p, ul, li y a." className="md:col-span-2">
          <Area value={f.aviso} onChange={(e) => setF({ ...f, aviso: e.target.value })} rows={4} />
          <div className="flex gap-2 mt-2 items-start flex-wrap"><Boton tam="xs" onClick={generarAviso}>Generar texto con las fechas</Boton></div>
          {f.aviso ? <div className="prosa text-sm mt-2 p-3 panel-suave" dangerouslySetInnerHTML={{ __html: U.sanitizarHTML(f.aviso) }} /> : null}
        </Campo>
      </div>
    </Modal>
  );
};
const PaginaAdminVentanas = () => {
  const app = useApp();
  const [modal, setModal] = useState(null);
  const ahora = useReloj(30000);
  const { datos, cargando, recargar } = useCarga(() => DB.listarVentanas(), []);
  const eliminar = async (v) => {
    if (!(await app.confirmar({ titulo: 'Eliminar ventana', mensaje: `Se elimina la ventana de ${U.nombrePeriodo(v.periodo)}. Los contratistas no podrán diligenciar ese período.`, textoOk: 'Eliminar', peligro: true }))) return;
    try { await DB.eliminarVentana(v.periodo); recargar(true); app.recargarTodo(); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  const chip = (v) => { const e = U.estadoVentana(v, null, ahora); return e.estado === 'abierta' ? <Chip tipo="exito" icono="reloj">Abierta · cierra en {U.cuentaRegresiva(e.faltan)}</Chip> : e.estado === 'por_abrir' ? <Chip tipo="info" icono="calendario">Abre en {U.cuentaRegresiva(e.faltan)}</Chip> : <Chip tipo="neutro" icono="candado">Cerrada</Chip>; };
  return (
    <div>
      <Encabezado titulo="Ventanas de diligenciamiento" subtitulo="Fechas en que los contratistas pueden enviar cada formulario (hora de Bogotá)." acciones={<Boton tam="sm" variante="primario" icono="mas" onClick={() => setModal('nueva')}>Nueva ventana</Boton>} />
      <Tabla cargando={cargando} filas={datos || []} claveFila={(v) => v.periodo} vacio={<Vacio icono="ventana" titulo="Sin ventanas" texto="Crea la ventana del período para habilitar los formularios." />} columnas={[
        { titulo: 'Período', render: (v) => <strong className="mono">{U.nombrePeriodo(v.periodo)}</strong> }, { titulo: 'Estado', render: chip },
        { titulo: 'Abre', render: (v) => <span className="mono text-xs">{U.fechaHora(v.desde)}</span> }, { titulo: 'Cierra', render: (v) => <span className="mono text-xs">{U.fechaHora(v.hasta)}</span> },
        { titulo: 'Formularios', render: (v) => (v.formularios || []).map((id) => nombreFormulario(app, id)).join(', ') },
      ]} acciones={(v) => <><Boton tam="xs" icono="editar" onClick={() => setModal(v)}>Editar</Boton><Boton tam="xs" variante="fantasma" icono="basura" soloIcono titulo="Eliminar" onClick={() => eliminar(v)} /></>} />
      {modal ? <ModalVentana ventana={modal === 'nueva' ? null : modal} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); recargar(true); app.recargarTodo(); }} /> : null}
    </div>
  );
};

/* ===== 6. Formularios ===== */
// Formularios sembrados cuya plantilla base ya tiene una versión más nueva. versionBase es la
// versión de la plantilla con la que se sembró o actualizó (publicar a mano no la cambia).
// Sin versionBase (documentos anteriores) se usa la versión publicada y, si ya la alcanzó por
// publicaciones a mano, se compara el contenido con la plantilla.
const versionBaseDe = (f) => Number(f.versionBase != null ? f.versionBase : f.version) || 1;
const formulariosDesactualizados = (formularios) => SEMILLAS.formularios
  .map((base) => ({ base, actual: formularios.find((f) => f.id === base.id) }))
  .filter(({ base, actual }) => actual && (Number(base.version) > versionBaseDe(actual)
    || (actual.versionBase == null && Number(base.version) > 1 && !U.igualProfundo(actual.capitulos || [], base.capitulos || []))));
// Publica la plantilla base como versión nueva. Las respuestas se guardan por id de
// pregunta, así que los envíos y borradores existentes siguen sirviendo.
const actualizarABase = async (app, { base, actual }) => {
  if (!(await app.confirmar({ titulo: `Actualizar «${actual.nombre}»`, mensaje: `Se reemplaza por la plantilla base, versión ${base.version}.${base.novedad ? `\n\n${base.novedad}` : ''}\n\nLos envíos ya hechos conservan su contenido y los borradores siguen funcionando. Si habías editado este formulario a mano, esos cambios se pierden.`, textoOk: 'Actualizar' }))) return;
  try {
    await DB.publicarVersion({ ...U.clonar(base), activo: actual.activo !== false, versionBase: Number(base.version) }, Math.max(Number(base.version), (Number(actual.version) || 0) + 1));
    app.avisar('exito', `«${base.nombre}» quedó con la plantilla base ${base.version}`);
    app.recargarTodo();
  } catch (e) { app.avisar('error', DB.traducirError(e)); }
};
// «Mantener mi versión»: el formulario queda como está y se marca al día con la plantilla base.
const mantenerVersion = async (app, { base, actual }) => {
  if (!(await app.confirmar({ titulo: `Mantener «${actual.nombre}»`, mensaje: `Tu formulario queda como está (no recibe los cambios de la plantilla base ${base.version}) y el aviso desaparece.`, textoOk: 'Mantener' }))) return;
  try { await DB.actualizarFormulario(actual.id, { versionBase: Number(base.version) }); app.recargarTodo(); } catch (e) { app.avisar('error', DB.traducirError(e)); }
};
const AvisosPlantillaBase = ({ className = 'mb-3' }) => {
  const app = useApp();
  return formulariosDesactualizados(app.formularios).map((d) => (
    <div key={d.base.id} className={`alerta-caja alerta-info items-center flex-wrap ${className}`}><Icono nombre="refrescar" /><div className="flex-1 min-w-0 text-sm"><strong>Hay una versión nueva de «{d.base.nombre}»</strong> ({d.actual.versionBase != null ? `plantilla base ${d.actual.versionBase}` : `tu versión ${d.actual.version || 1}`} → plantilla base {d.base.version}).{d.base.novedad ? ` ${d.base.novedad}` : ''}</div><div className="flex gap-2 flex-wrap"><Boton tam="sm" variante="fantasma" onClick={() => mantenerVersion(app, d)}>Mantener mi versión</Boton><Boton tam="sm" variante="primario" icono="refrescar" onClick={() => actualizarABase(app, d)}>Actualizar</Boton></div></div>
  ));
};
const TIPOS_PREGUNTA = ['TEXTO', 'TEXTO_LARGO', 'NUMERO', 'MONEDA', 'PORCENTAJE', 'FECHA', 'SELECCION_UNICA', 'SELECCION_MULTIPLE', 'SI_NO', 'CALCULADA', 'COMPUESTA', 'ARCHIVO', 'URL', 'TELEFONO', 'CORREO', 'SEPARADOR'];
const validarEsquema = (f) => {
  const p = [];
  if (!f || typeof f !== 'object') return ['El JSON debe ser un objeto'];
  if (!f.id || !/^[a-z0-9_]+$/.test(f.id)) p.push('id: obligatorio, solo minúsculas, números y guion bajo');
  if (!f.nombre) p.push('nombre: obligatorio');
  if (!['INFO_CONTRATO', 'INFORME_MENSUAL', 'CUENTA_COBRO', 'GENERICO'].includes(f.tipo)) p.push('tipo: INFO_CONTRATO | INFORME_MENSUAL | CUENTA_COBRO | GENERICO');
  if (!f.config || typeof f.config !== 'object') p.push('config: obligatorio');
  else if (!Array.isArray(f.config.flujoEstados)) p.push('config.flujoEstados: debe ser una lista (puede ser vacía)');
  if (!Array.isArray(f.capitulos) || !f.capitulos.length) p.push('capitulos: al menos uno');
  const ids = new Set();
  (f.capitulos || []).forEach((c, i) => {
    if (!c.id) p.push(`capítulo ${i + 1}: sin id`);
    if (!c.nombre) p.push(`capítulo ${c.id || i + 1}: sin nombre`);
    (c.preguntas || []).forEach((q, j) => {
      const ref = `${c.id}/${q.id || `#${j + 1}`}`;
      if (!q.id) p.push(`${ref}: sin id`);
      else if (ids.has(q.id)) p.push(`${ref}: id repetido`); else ids.add(q.id);
      if (q.id && String(q.id).startsWith('_')) p.push(`${ref}: los ids que empiezan por «_» están reservados`);
      if (!q.etiqueta && q.tipo !== 'SEPARADOR') p.push(`${ref}: sin etiqueta`);
      if (!TIPOS_PREGUNTA.includes(q.tipo)) p.push(`${ref}: tipo desconocido «${q.tipo}»`);
      if (q.tipo === 'COMPUESTA') {
        if (!Array.isArray(q.subpreguntas) || !q.subpreguntas.length) p.push(`${ref}: COMPUESTA sin subpreguntas`);
        const sids = new Set();
        (q.subpreguntas || []).forEach((s) => { if (!s.id) p.push(`${ref}: subpregunta sin id`); else if (sids.has(s.id)) p.push(`${ref}.${s.id}: id repetido`); else sids.add(s.id); if (s.id && String(s.id).startsWith('_')) p.push(`${ref}.${s.id}: los ids que empiezan por «_» están reservados (_fila, _manual)`); if (!TIPOS_PREGUNTA.includes(s.tipo)) p.push(`${ref}.${s.id}: tipo desconocido`); });
      }
      if ((q.tipo === 'SELECCION_UNICA' || q.tipo === 'SELECCION_MULTIPLE') && !Array.isArray(q.opciones) && !q.origenOpciones) p.push(`${ref}: faltan opciones u origenOpciones`);
    });
  });
  // Compuestas enlazadas: filasDe y precargarDe deben apuntar a una compuesta (y campo) que exista.
  const compuestas = {}, primerNivel = {};
  (f.capitulos || []).forEach((c) => (c.preguntas || []).forEach((q) => { primerNivel[q.id] = q; if (q.tipo === 'COMPUESTA') compuestas[q.id] = q; }));
  const ORIGEN_NO_SIMPLE = ['ARCHIVO', 'SELECCION_MULTIPLE', 'COMPUESTA', 'SEPARADOR'];
  Object.values(compuestas).forEach((q) => {
    if (q.filasDe && (!compuestas[q.filasDe] || q.filasDe === q.id)) p.push(`${q.id}: filasDe «${q.filasDe}» no es otra pregunta compuesta`);
    // Ciclo de filasDe (A → B → A): ninguna tendría filas. Se avisa una vez por ciclo.
    const cadena = [q.id];
    let sig = q.filasDe;
    while (sig && compuestas[sig] && !cadena.includes(sig)) { cadena.push(sig); sig = compuestas[sig].filasDe; }
    if (sig === q.id && cadena.length > 1 && q.id === [...cadena].sort()[0]) p.push(`${q.id}: filasDe forma un ciclo (${[...cadena, q.id].join(' → ')})`);
    if (q.ordenable && (q.filasDe || q.origenFilas)) p.push(`${q.id}: «ordenable» no aplica con ${q.filasDe ? 'filasDe' : 'origenFilas'} (las filas siguen el orden de su origen)`);
    (q.subpreguntas || []).filter((s) => s.precargarDe).forEach((s) => {
      const [origen, campo] = String(s.precargarDe).split('.');
      const fuente = campo === undefined ? primerNivel[origen] : compuestas[origen] && (compuestas[origen].subpreguntas || []).find((x) => x.id === campo);
      if (!fuente || (campo === undefined && compuestas[origen])) p.push(`${q.id}.${s.id}: precargarDe «${s.precargarDe}» debe ser una pregunta de primer nivel o compuesta.campo existente`);
      else if (ORIGEN_NO_SIMPLE.includes(fuente.tipo)) p.push(`${q.id}.${s.id}: precargarDe no puede tomar valores de una pregunta ${fuente.tipo}`);
      if (TIPOS_SIN_PRECARGA.includes(s.tipo)) p.push(`${q.id}.${s.id}: precargarDe no aplica a preguntas ${s.tipo}`);
    });
  });
  return p.concat(Formulas.validarFormulario(f));
};
const EditorFormulario = ({ formulario, onCerrar, onGuardado }) => {
  const app = useApp();
  const [texto, setTexto] = useState(() => JSON.stringify(formulario, null, 2));
  const [guardando, setGuardando] = useState(false);
  const [verPrevia, setVerPrevia] = useState(true);
  const analisis = useMemo(() => { try { const f = JSON.parse(texto); return { f, problemas: validarEsquema(f) }; } catch (e) { return { f: null, problemas: [`JSON inválido: ${e.message}`] }; } }, [texto]);
  const ctxPrevia = useMemo(() => ({ usuario: app.usuario, contrato: app.contrato || { info: {} }, parametros: app.parametros, catalogos: app.catalogos, periodo: U.rangoPeriodo(app.periodo), consecutivo: 1 }), [app.usuario, app.contrato, app.parametros, app.catalogos, app.periodo]);
  const guardar = async (publicar) => {
    if (!analisis.f || analisis.problemas.length) { app.avisar('alerta', 'Corrige los problemas antes de guardar'); return; }
    if (analisis.f.id !== formulario.id && app.formularios.some((x) => x.id === analisis.f.id)) { app.avisar('alerta', 'Ya existe un formulario con ese id'); return; }
    setGuardando(true);
    try {
      // La versión publicada nunca retrocede (no se pisa una copia de versiones/N) y la
      // plantilla base se conserva aunque el JSON no la traiga.
      const conBase = { ...analisis.f, versionBase: analisis.f.versionBase != null ? analisis.f.versionBase : formulario.versionBase };
      if (conBase.versionBase == null) delete conBase.versionBase;
      if (publicar) { const v = await DB.publicarVersion(conBase, Math.max(Number(analisis.f.version) || 0, Number(formulario.version) || 0) + 1); app.avisar('exito', `Versión ${v} publicada`); }
      else { await DB.guardarFormulario({ ...conBase, version: formulario.version || analisis.f.version || 1 }); app.avisar('exito', 'Formulario guardado'); }
      onGuardado();
    } catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  return (
    <div>
      <Encabezado titulo={`Editar · ${formulario.nombre}`} subtitulo={`id ${formulario.id} · versión ${formulario.version || 1}`} migas={[{ texto: 'Formularios', onClick: onCerrar }, { texto: 'Editar' }]}
        acciones={<><Boton onClick={onCerrar}>Volver</Boton><Boton icono="check" cargando={guardando} onClick={() => guardar(false)} disabled={analisis.problemas.length > 0}>Guardar</Boton><Boton variante="primario" icono="subir" cargando={guardando} onClick={() => guardar(true)} disabled={analisis.problemas.length > 0}>Publicar versión</Boton></>} />
      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <div className="grid gap-3">
          <Area className="editor-json" autoAlto={false} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} aria-label="JSON del formulario" />
          {analisis.problemas.length ? <Alerta tipo="error"><strong>{analisis.problemas.length} {U.plural(analisis.problemas.length, 'problema', 'problemas')}</strong><ul className="text-xs mt-1 grid gap-0.5">{analisis.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul></Alerta> : <Alerta tipo="exito">Esquema y fórmulas válidos.</Alerta>}
          <div className="flex gap-2 flex-wrap"><Boton tam="xs" onClick={() => { try { setTexto(JSON.stringify(JSON.parse(texto), null, 2)); } catch (e) { app.avisar('error', 'JSON inválido'); } }}>Formatear</Boton><Boton tam="xs" onClick={() => { const s = SEMILLAS.formularios.find((x) => x.id === formulario.id); if (s) setTexto(JSON.stringify({ ...s, version: formulario.version || s.version, versionBase: s.version }, null, 2)); else app.avisar('info', 'Este formulario no tiene semilla'); }}>Restaurar semilla</Boton><Boton tam="xs" onClick={() => U.descargarTexto(texto, `${formulario.id}.json`, 'application/json')}>Descargar JSON</Boton></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2"><h2>Vista previa en vivo</h2><Conmutador activo={verPrevia} onCambio={setVerPrevia} etiqueta="Mostrar" id="ver-previa" /></div>
          {verPrevia && analisis.f && !analisis.problemas.length ? <MotorFormulario key={texto.length} formulario={analisis.f} ctx={ctxPrevia} respuestasIniciales={null} puedeEditar={() => true} onEnviar={async (r) => { app.avisar('info', `Validación correcta · ${Object.keys(r).length} respuestas`); }} textoEnviar="Probar validación" /> : <div className="panel-suave p-6 text-sm texto-2">La vista previa aparece cuando el JSON es válido.</div>}
        </div>
      </div>
    </div>
  );
};
const PaginaAdminFormularios = () => {
  const app = useApp();
  const [editando, setEditando] = useState(null);
  const nuevo = () => setEditando({ id: 'nuevo_formulario', nombre: 'Nuevo formulario', tipo: 'GENERICO', version: 1, activo: true, plantillaDescarga: 'generica', config: { requiereVentana: true, limiteMensual: 1, flujoEstados: ['contratista', 'revisor'], vistaPrevia: true, precargarUltimoEnvio: false }, capitulos: [{ id: 'datos', nombre: 'Datos', orden: 1, preguntas: [{ id: 'fecha', etiqueta: 'Fecha', tipo: 'FECHA', obligatoria: true, porDefecto: 'hoy' }] }] });
  const alternar = async (f, campo) => { try { await DB.actualizarFormulario(f.id, { [campo]: !f[campo] }); app.recargarTodo(); } catch (e) { app.avisar('error', DB.traducirError(e)); } };
  const eliminar = async (f) => {
    if (!(await app.confirmar({ titulo: 'Eliminar formulario', mensaje: `Se elimina «${f.nombre}». Los envíos existentes conservan su foto, pero ya no podrán descargarse con la plantilla.`, textoOk: 'Eliminar', peligro: true }))) return;
    try { await DB.eliminarFormulario(f.id); app.recargarTodo(); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  if (editando) return <EditorFormulario formulario={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); app.recargarTodo(); }} />;
  return (
    <div>
      <Encabezado titulo="Formularios" subtitulo="Esquema JSON (§7): capítulos, preguntas, fórmulas y condiciones. Publicar guarda una copia inmutable de la versión." acciones={<><Boton tam="sm" onClick={async () => { await DB.sembrarBase(); app.avisar('exito', 'Semillas verificadas'); app.recargarTodo(); }}>Cargar semillas faltantes</Boton><Boton tam="sm" variante="primario" icono="mas" onClick={nuevo}>Nuevo</Boton></>} />
      <AvisosPlantillaBase />
      <Tabla filas={app.formularios} vacio={<Vacio icono="formulario" titulo="Sin formularios" accion={<Boton onClick={async () => { await DB.sembrarBase(); app.recargarTodo(); }}>Cargar semillas</Boton>} />} columnas={[
        { titulo: 'Nombre', render: (f) => <span><strong>{f.nombre}</strong><div className="text-xs texto-3 mono">{f.id}</div></span> }, { titulo: 'Tipo', clave: 'tipo', mono: true }, { titulo: 'Versión', clave: 'version', mono: true },
        { titulo: 'Plantilla', clave: 'plantillaDescarga', mono: true }, { titulo: 'Flujo', render: (f) => (flujoDe(f).length ? flujoDe(f).join(' → ') : 'sin flujo') },
        { titulo: 'Ventana / límite', render: (f) => `${requiereVentana(f) ? 'Con ventana' : 'Sin ventana'} · ${limiteDe(f) == null ? 'sin límite' : `${limiteDe(f)}/mes`}` },
        { titulo: 'Activo', render: (f) => <Conmutador activo={!!f.activo} onCambio={() => alternar(f, 'activo')} etiqueta="" id={`act-${f.id}`} /> },
      ]} acciones={(f) => <><Boton tam="xs" icono="editar" onClick={() => setEditando(f)}>Editar</Boton><Boton tam="xs" variante="fantasma" icono="basura" soloIcono titulo="Eliminar" onClick={() => eliminar(f)} /></>} />
    </div>
  );
};

/* ===== 7. Catálogos ===== */
const PaginaAdminCatalogos = () => {
  const app = useApp();
  const [actual, setActual] = useState(null);
  const [opciones, setOpciones] = useState([]);
  const [nombre, setNombre] = useState('');
  const [importar, setImportar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { datos, cargando, recargar } = useCarga(() => DB.listarCatalogos(), []);
  const abrir = (c) => { setActual(c); setOpciones(U.clonar(c.opciones || [])); setNombre(c.nombre || ''); setImportar(''); };
  // El id provisional se puede cambiar en el modal antes de guardar.
  const nuevo = () => abrir({ id: `catalogo_${U.idAleatorio().slice(0, 6)}`, nombre: 'Nuevo catálogo', opciones: [] });
  const guardar = async () => {
    const limpias = opciones.map((o) => ({ valor: String(o.valor || '').trim(), etiqueta: String(o.etiqueta || '').trim(), grupo: String(o.grupo || '').trim() })).filter((o) => o.valor && o.etiqueta);
    const repetidos = limpias.map((o) => o.valor).filter((v, i, a) => a.indexOf(v) !== i);
    if (repetidos.length) { app.avisar('alerta', `Valores repetidos: ${U.unicos(repetidos).join(', ')}`); return; }
    setGuardando(true);
    try { await DB.guardarCatalogo(actual.id, { nombre: nombre.trim() || actual.id, opciones: limpias }); app.avisar('exito', 'Catálogo guardado'); setActual(null); recargar(true); app.recargarTodo(); }
    catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  const agregarDesdeTexto = () => {
    const nuevas = importar.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [a, b, c] = l.split('|').map((x) => x.trim()); return b ? { valor: a, etiqueta: b, grupo: c || '' } : { valor: U.slug(a).slice(0, 40), etiqueta: a, grupo: '' }; });
    setOpciones([...opciones, ...nuevas]); setImportar('');
  };
  const eliminar = async (c) => {
    if (!(await app.confirmar({ titulo: 'Eliminar catálogo', mensaje: `Se elimina «${c.nombre}». Las preguntas que lo usan quedarán sin opciones.`, textoOk: 'Eliminar', peligro: true }))) return;
    try { await DB.eliminarCatalogo(c.id); recargar(true); app.recargarTodo(); } catch (e) { app.avisar('error', DB.traducirError(e)); }
  };
  return (
    <div>
      <Encabezado titulo="Catálogos" subtitulo="Listas de opciones (componentes, equipos, productos…) que usan las preguntas con origenOpciones." acciones={<Boton tam="sm" variante="primario" icono="mas" onClick={nuevo}>Nuevo catálogo</Boton>} />
      <Tabla cargando={cargando} filas={datos || []} vacio={<Vacio icono="catalogo" titulo="Sin catálogos" />} columnas={[
        { titulo: 'Nombre', render: (c) => <span><strong>{c.nombre}</strong><div className="text-xs texto-3 mono">catalogos/{c.id}</div></span> }, { titulo: 'Opciones', render: (c) => (c.opciones || []).length },
        { titulo: 'Grupos', render: (c) => U.unicos((c.opciones || []).map((o) => o.grupo).filter(Boolean)).join(', ') || '—' },
      ]} acciones={(c) => <><Boton tam="xs" icono="editar" onClick={() => abrir(c)}>Editar</Boton><Boton tam="xs" variante="fantasma" icono="basura" soloIcono titulo="Eliminar" onClick={() => eliminar(c)} /></>} />
      {actual ? (
        <Modal titulo={`Catálogo · ${actual.nombre}`} ancho="ancho" onCerrar={() => setActual(null)} pie={<><Boton onClick={() => setActual(null)}>Cancelar</Boton><Boton variante="primario" icono="check" cargando={guardando} onClick={guardar}>Guardar</Boton></>}>
          <div className="grid gap-4">
            <div className="grid sm:grid-cols-2 gap-3"><Campo etiqueta="Nombre"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo><Campo etiqueta="ID" ayuda="Se usa en origenOpciones: catalogos/ID"><Entrada className="mono" value={actual.id} onChange={(e) => setActual({ ...actual, id: U.sinTildes(e.target.value).toLowerCase().replace(/[^a-z0-9_]/g, '_') })} disabled={!!(datos || []).find((c) => c.id === actual.id)} /></Campo></div>
            <div className="tabla-envoltura"><table className="tabla"><thead><tr><th>Valor</th><th>Etiqueta</th><th>Grupo</th><th /></tr></thead><tbody>
              {opciones.map((o, i) => <tr key={i}><td><Entrada className="mono" value={o.valor} onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} aria-label="Valor" /></td><td><Entrada value={o.etiqueta} onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))} aria-label="Etiqueta" /></td><td><Entrada value={o.grupo || ''} onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? { ...x, grupo: e.target.value } : x)))} aria-label="Grupo" /></td><td><Boton tam="xs" variante="fantasma" soloIcono icono="basura" titulo="Quitar" onClick={() => setOpciones(opciones.filter((_, j) => j !== i))} /></td></tr>)}
            </tbody></table></div>
            <div className="flex gap-2 flex-wrap"><Boton tam="sm" icono="mas" onClick={() => setOpciones([...opciones, { valor: '', etiqueta: '', grupo: '' }])}>Agregar opción</Boton></div>
            <Campo etiqueta="Pegar varias (una por línea: valor | etiqueta | grupo, o solo la etiqueta)"><Area value={importar} onChange={(e) => setImportar(e.target.value)} rows={3} /><Boton tam="xs" className="mt-2" onClick={agregarDesdeTexto} disabled={!importar.trim()}>Agregar líneas</Boton></Campo>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

/* ===== 8. Parámetros ===== */
// Fuera del componente: si se definiera adentro, cada tecla remontaría la sección y el campo perdería el foco.
const SeccionParametros = ({ titulo, children, ayuda }) => <div className="tarjeta"><div className="tarjeta-cabecera"><div><h2>{titulo}</h2>{ayuda ? <p className="text-xs texto-2">{ayuda}</p> : null}</div></div><div className="tarjeta-cuerpo grid gap-4 md:grid-cols-2">{children}</div></div>;
const PaginaAdminParametros = () => {
  const app = useApp();
  const [p, setP] = useState(() => U.clonar(app.parametros));
  const [guardando, setGuardando] = useState(false);
  const [anioNuevo, setAnioNuevo] = useState({ anio: String(new Date().getFullYear() + 1), valor: '' });
  const { datos: notificaciones } = useCarga(() => DB.listarNotificaciones().catch(() => []), []);
  const poner = (ruta, valor) => setP((prev) => { const c = U.clonar(prev); U.ponerRuta(c, ruta, valor); return c; });
  const num = (ruta) => (e) => poner(ruta, e.target.value === '' ? '' : Number(String(e.target.value).replace(',', '.')));
  const txt = (ruta) => (e) => poner(ruta, e.target.value);
  const guardar = async () => {
    setGuardando(true);
    try { const d = U.clonar(p); delete d.id; await DB.guardarParametros(d); app.avisar('exito', 'Parámetros guardados'); app.recargarTodo(); }
    catch (e) { app.avisar('error', DB.traducirError(e)); } finally { setGuardando(false); }
  };
  const pct = (ruta, etiqueta, ayuda) => <Campo etiqueta={etiqueta} ayuda={ayuda}><Entrada type="number" step="0.00001" className="mono" value={U.obtenerRuta(p, ruta) == null ? '' : U.obtenerRuta(p, ruta)} onChange={num(ruta)} /></Campo>;
  return (
    <div>
      <Encabezado titulo="Parámetros" subtitulo="parametros/app · todo lo institucional y numérico vive aquí, no en el código." acciones={<Boton variante="primario" icono="check" cargando={guardando} onClick={guardar}>Guardar cambios</Boton>} />
      <div className="grid gap-4">
        <SeccionParametros titulo="Entidad y marca">
          <Campo etiqueta="Nombre de la app"><Entrada value={p.nombreApp || ''} onChange={txt('nombreApp')} /></Campo>
          <Campo etiqueta="Logo (URL) para la interfaz"><Entrada className="mono" value={(p.marca && p.marca.logoUrl) || ''} onChange={txt('marca.logoUrl')} placeholder="https://…/logo.png" /></Campo>
          <Campo etiqueta="Entidad"><Entrada value={p.nombreEntidad || ''} onChange={txt('nombreEntidad')} /></Campo>
          <Campo etiqueta="Dependencia"><Entrada value={p.nombreDependencia || ''} onChange={txt('nombreDependencia')} /></Campo>
          <Campo etiqueta="NIT de la entidad (cuenta de cobro)"><Entrada className="mono" value={p.nitEntidad || ''} onChange={txt('nitEntidad')} /></Campo>
          <Campo etiqueta="Ciudad"><Entrada value={p.ciudad || ''} onChange={txt('ciudad')} /></Campo>
          <Campo etiqueta="Sigla del archivo Word" ayuda="INFORME DE GESTION {sigla} - …"><Entrada className="mono" value={p.siglaArchivo || ''} onChange={txt('siglaArchivo')} /></Campo>
          <Campo etiqueta="Plantilla de ruta NAS" ayuda="<CEDULA> se reemplaza por la cédula."><Entrada className="mono" value={p.rutaNasPlantilla || ''} onChange={txt('rutaNasPlantilla')} /></Campo>
          <Campo etiqueta="Vo.Bo. digital en el Word" ayuda="Si está activo, al aprobar se escribe «Aprobado en la plataforma por … el …» en la celda Vo.Bo."><Conmutador activo={!!p.voBoDigitalEnWord} onCambio={(v) => poner('voBoDigitalEnWord', v)} etiqueta={p.voBoDigitalEnWord ? 'Activo' : 'Inactivo'} id="vobo" /></Campo>
        </SeccionParametros>
        <SeccionParametros titulo="Seguridad social" ayuda="Confirmar cada año con la entidad: SMMLV, porcentajes y tope.">
          <div className="md:col-span-2">
            <span className="etiqueta">SMMLV por año</span>
            <div className="flex flex-wrap gap-2 items-end">
              {Object.keys(p.smmlv || {}).sort().map((a) => <Campo key={a} etiqueta={a}><div className="flex gap-1"><Entrada type="number" className="mono" style={{ width: 150 }} value={p.smmlv[a]} onChange={num(`smmlv.${a}`)} /><Boton tam="sm" variante="fantasma" soloIcono icono="x" titulo={`Quitar ${a}`} onClick={() => setP((prev) => { const c = U.clonar(prev); delete c.smmlv[a]; return c; })} /></div></Campo>)}
              <Campo etiqueta="Nuevo año"><div className="flex gap-1"><Entrada type="number" className="mono" style={{ width: 90 }} value={anioNuevo.anio} onChange={(e) => setAnioNuevo({ ...anioNuevo, anio: e.target.value })} aria-label="Año" /><Entrada type="number" className="mono" style={{ width: 150 }} value={anioNuevo.valor} onChange={(e) => setAnioNuevo({ ...anioNuevo, valor: e.target.value })} aria-label="Valor" placeholder="SMMLV" /><Boton tam="sm" icono="mas" onClick={() => { if (/^\d{4}$/.test(anioNuevo.anio) && anioNuevo.valor) { poner(`smmlv.${anioNuevo.anio}`, Number(anioNuevo.valor)); setAnioNuevo({ anio: String(Number(anioNuevo.anio) + 1), valor: '' }); } }}>Agregar</Boton></div></Campo>
            </div>
          </div>
          {pct('porcentajeIBC', 'Porcentaje del IBC (0,4 = 40 %)')}
          {pct('topeIBCenSMMLV', 'Tope del IBC en SMMLV')}
          {pct('pctSalud', 'Salud (0,125 = 12,5 %)')}
          {pct('pctPension', 'Pensión (0,16 = 16 %)')}
          {pct('pctARL_I', 'ARL clase I')}{pct('pctARL_II', 'ARL clase II')}{pct('pctARL_III', 'ARL clase III')}{pct('pctARL_IV', 'ARL clase IV')}{pct('pctARL_V', 'ARL clase V')}
          {pct('toleranciaSaldo', 'Tolerancia del saldo (pesos)', 'Si saldo < −tolerancia, la cuenta de cobro muestra «Ajustar».')}
          <Campo etiqueta="Convención de días para prorratear"><Selector vacio={null} opciones={[{ valor: 'comercial30', etiqueta: 'Comercial (mes = 30 días)' }, { valor: 'calendario', etiqueta: 'Calendario (días reales)' }]} value={p.convencionDias || 'comercial30'} onChange={txt('convencionDias')} /></Campo>
          <Campo etiqueta="Texto de la declaración juramentada" className="md:col-span-2"><Area value={p.textoDeclaracion || ''} onChange={txt('textoDeclaracion')} rows={3} /></Campo>
          <Alerta tipo="alerta" className="md:col-span-2"><strong>Decisiones pendientes con la entidad (no las toma la app):</strong> Fondo de Solidaridad Pensional (IBC ≥ 4 SMMLV: la referencia no lo calcula), redondeo de la PILA (aquí los aportes se muestran con el cálculo exacto redondeado a pesos en el Word) y vigencia anual del SMMLV y de los porcentajes.</Alerta>
        </SeccionParametros>
        <SeccionParametros titulo="Flujos de Power Automate" ayuda="URL del disparador «Cuando se recibe una solicitud HTTP». Vacío = la función queda deshabilitada con aviso.">
          <Campo etiqueta="subirArchivo (OneDrive o SharePoint)" className="md:col-span-2"><Entrada className="mono" value={(p.flujos && p.flujos.subirArchivo) || ''} onChange={txt('flujos.subirArchivo')} placeholder="https://….environment.api.powerplatform.com/powerautomate/automations/direct/workflows/…" /></Campo>
          <Campo etiqueta="notificar (correos Outlook)" className="md:col-span-2"><Entrada className="mono" value={(p.flujos && p.flujos.notificar) || ''} onChange={txt('flujos.notificar')} /></Campo>
          <Campo etiqueta="docxAPdf (opcional)" className="md:col-span-2"><Entrada className="mono" value={(p.flujos && p.flujos.docxAPdf) || ''} onChange={txt('flujos.docxAPdf')} /></Campo>
        </SeccionParametros>
        <SeccionParametros titulo="Correo" ayuda="Variables: {{nombre}} {{contrato}} {{formulario}} {{periodo}} {{fechaLimite}} {{enlace}} {{tipo}}. El flujo arma el HTML y los destinatarios.">
          <Campo etiqueta="Remitente (buzón del flujo)" className="md:col-span-2"><Entrada value={(p.correo && p.correo.remitente) || ''} onChange={txt('correo.remitente')} placeholder="notificaciones@entidad.gov.co" /></Campo>
          {Object.keys((p.correo && p.correo.plantillas) || {}).map((k) => (
            <div key={k} className="md:col-span-2 panel-suave p-3 grid gap-2">
              <strong className="text-sm">{{ envio: 'Nuevo envío (a revisores)', aprobacion: 'Aprobación (al contratista)', devolucion: 'Devolución (al contratista)', solicitud: 'Solicitudes (creada, aprobada, rechazada)', recordatorio: 'Recordatorio antes del cierre' }[k] || k}</strong>
              <Campo etiqueta="Asunto"><Entrada value={p.correo.plantillas[k].asunto || ''} onChange={txt(`correo.plantillas.${k}.asunto`)} /></Campo>
              <Campo etiqueta="Cuerpo"><Area value={p.correo.plantillas[k].cuerpo || ''} onChange={txt(`correo.plantillas.${k}.cuerpo`)} rows={3} /></Campo>
            </div>
          ))}
        </SeccionParametros>
        <div className="tarjeta"><div className="tarjeta-cabecera"><h2>Bitácora de notificaciones</h2><span className="text-xs texto-3">últimas {(notificaciones || []).length}</span></div>
          <Tabla filas={(notificaciones || []).slice(0, 50)} vacio={<Vacio icono="correo" titulo="Sin notificaciones registradas" />} columnas={[
            { titulo: 'Fecha', render: (n) => <span className="mono text-xs">{U.fechaHora(n.fecha)}</span> }, { titulo: 'Evento', clave: 'evento', mono: true }, { titulo: 'Documento', render: (n) => <span className="mono text-xs">{n.coleccion}/{n.docId}</span> },
            { titulo: 'Estado', render: (n) => <Chip tipo={n.estado === 'enviado' ? 'exito' : n.estado === 'fallido' ? 'error' : 'neutro'}>{n.estado}</Chip> }, { titulo: 'Error', render: (n) => <span className="text-xs">{n.error || ''}</span> },
          ]} />
        </div>
        <div className="flex justify-end"><Boton variante="primario" icono="check" cargando={guardando} onClick={guardar}>Guardar cambios</Boton></div>
      </div>
    </div>
  );
};
