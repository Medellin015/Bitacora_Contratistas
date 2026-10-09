/* ============================================================================
   15) app.jsx — raíz: sesión, carga de datos, contexto global, rutas y montaje
   Estructura:
     1. Rutas (hash) y guardia por rol
     2. Pantallas de carga / error
     3. App: estado global, sesión, datos, vista de contratista, tema, toasts, confirmaciones
     4. Montaje
   ============================================================================ */

/* ===== 1. Rutas ===== */
const parsearRuta = () => {
  const hash = window.location.hash || '#/';
  const [camino, consulta] = hash.split('?');
  const partes = camino.replace(/^#\/?/, '').split('/').filter(Boolean);
  const query = {};
  new URLSearchParams(consulta || '').forEach((v, k) => { query[k] = v; });
  return { hash: camino, nombre: partes[0] || 'inicio', params: partes.slice(1), query };
};
const Enrutador = () => {
  const app = useApp();
  const { nombre, params } = app.ruta;
  const rol = app.rol;
  const esRevision = rol === 'revisor' || rol === 'coordinador' || rol === 'admin';
  const sinAcceso = <Vacio icono="candado" titulo="Sin acceso" texto="Tu rol no tiene permiso para esta pantalla." accion={<Boton onClick={() => app.navegar('#/')}>Ir al inicio</Boton>} />;
  switch (nombre) {
    case 'inicio': case '': return rol === 'contratista' ? <PaginaInicioContratista /> : rol === 'admin' ? <PaginaAdminInicio /> : <PaginaRevision />;
    case 'envios': return <PaginaEnvios />;
    case 'solicitudes': return <PaginaSolicitudes />;
    case 'contrato': return <PaginaContrato />;
    case 'contratos': return rol === 'admin' ? <PaginaAdminContratos /> : esRevision ? <PaginaContratos /> : sinAcceso;
    case 'formulario': return rol === 'contratista' || rol === 'admin' ? <PaginaFormulario /> : sinAcceso;
    case 'revision': return esRevision ? <PaginaRevision /> : sinAcceso;
    case 'reportes': return esRevision ? <PaginaReportes /> : sinAcceso;
    case 'perfil': return <PaginaPerfil />;
    case 'admin': {
      if (rol !== 'admin') return sinAcceso;
      switch (params[0]) {
        case undefined: return <PaginaAdminInicio />;
        case 'contratos': return <PaginaAdminContratos />;
        case 'usuarios': return <PaginaAdminUsuarios />;
        case 'ventanas': return <PaginaAdminVentanas />;
        case 'formularios': return <PaginaAdminFormularios />;
        case 'catalogos': return <PaginaAdminCatalogos />;
        case 'parametros': return <PaginaAdminParametros />;
        default: return sinAcceso;
      }
    }
    default: return <Vacio icono="buscar" titulo="Página no encontrada" accion={<Boton onClick={() => app.navegar('#/')}>Ir al inicio</Boton>} />;
  }
};

/* ===== 2. Carga y errores ===== */
const PantallaCarga = ({ texto }) => (
  <div className="min-h-[100dvh] grid place-items-center p-6" style={{ background: 'var(--fondo)' }}>
    <div className="text-center entrar">
      <div className="marca-logo mx-auto mb-3" style={{ width: 44, height: 44 }}><Icono nombre="contrato" tam={22} /></div>
      <div className="flex items-center gap-2 justify-center texto-2 text-sm" role="status"><Icono nombre="cargando" className="girando" /> {texto || 'Cargando…'}</div>
    </div>
  </div>
);
class LimiteErrores extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Error de interfaz:', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[100dvh] grid place-items-center p-6" style={{ background: 'var(--fondo)' }}>
        <div className="tarjeta max-w-lg w-full"><div className="tarjeta-cuerpo grid gap-3">
          <h1>Algo salió mal</h1>
          <p className="text-sm texto-2">La pantalla no pudo dibujarse. Recarga la página; si persiste, copia este mensaje para el administrador.</p>
          <pre className="text-xs p-3 rounded-md overflow-auto" style={{ background: 'var(--superficie-2)' }}>{String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}</pre>
          <div className="flex gap-2"><Boton variante="primario" icono="refrescar" onClick={() => window.location.reload()}>Recargar</Boton><Boton onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>Ir al inicio</Boton></div>
        </div></div>
      </div>
    );
  }
}

/* ===== 3. App ===== */
const App = () => {
  const [sesion, setSesion] = useState(undefined);        // undefined = aún no se sabe
  const [estado, setEstado] = useState('cargando');       // cargando · anonimo · sin-verificar · sin-perfil · inactivo · listo · error
  const [errorCarga, setErrorCarga] = useState('');
  const [usuario, setUsuario] = useState(null);
  // Rol con el que se ve la app: el del perfil o «contratista» cuando una cuenta con otro rol
  // (admin, revisor, coordinador) abre su vista de contratista para sus propios contratos.
  const [rol, setRol] = useState(null);
  const [propios, setPropios] = useState([]);
  const vistaRef = useRef((() => { try { return localStorage.getItem('bitacora.vista') || ''; } catch (e) { return ''; } })());
  const [parametros, setParametros] = useState(SEMILLAS.parametrosDefault);
  const [formularios, setFormularios] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [ventanas, setVentanas] = useState([]);
  const [contratoId, setContratoId] = useState(() => { try { return localStorage.getItem('bitacora.contrato') || ''; } catch (e) { return ''; } });
  const [periodo, setPeriodo] = useState(() => U.periodoAnterior(U.periodoActual()));
  const [contadores, setContadores] = useState({ solicitudes: 0, revision: 0 });
  const [tema, setTema] = useState(() => document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'oscuro' : 'claro');
  const [toasts, setToasts] = useState([]);
  const [confirmacion, setConfirmacion] = useState(null);
  const [ruta, setRuta] = useState(parsearRuta);
  const [demoListo, setDemoListo] = useState(!MODO_DEMO);

  // Toasts y confirmaciones. Una confirmación nueva cancela la que estuviera abierta (nadie queda esperando).
  const avisar = useCallback((tipo, mensaje) => {
    const id = U.idAleatorio();
    setToasts((t) => [...t.slice(-4), { id, tipo, mensaje }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'error' ? 9000 : 5000);
  }, []);
  const confirmar = useCallback((opciones) => new Promise((resolver) => setConfirmacion((previa) => { if (previa) previa.resolver(false); return { ...opciones, resolver, clave: U.idAleatorio() }; })), []);
  const cerrarConfirmacion = (valor) => { if (confirmacion) confirmacion.resolver(valor); setConfirmacion(null); };

  // Guarda de salida: una pantalla con algo que se perdería (p. ej. un archivo subiendo) la fija con
  // fijarGuardaSalida(() => null | { titulo, mensaje }). Navegar, Atrás, cambiar de contrato o de
  // período, cerrar sesión y cerrar o recargar la pestaña piden confirmación mientras tanto.
  const guardaSalida = useRef(null);
  const fijarGuardaSalida = useCallback((fn) => { guardaSalida.current = fn || null; }, []);
  const motivoSalida = () => { try { return guardaSalida.current ? guardaSalida.current() : null; } catch (e) { return null; } };
  const pedirSalida = useCallback(async () => {
    const m = motivoSalida();
    return !m || confirmar({ titulo: m.titulo, mensaje: m.mensaje, textoOk: 'Salir' });
  }, [confirmar]);
  useEffect(() => {
    const avisarAlCerrar = (e) => { if (motivoSalida()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', avisarAlCerrar);
    return () => window.removeEventListener('beforeunload', avisarAlCerrar);
  }, []);

  // Rutas. Un cambio de hash que no hizo la app (Atrás, un enlace) pasa por la guarda: mientras la
  // persona decide se vuelve a la ruta actual.
  const ultimoHash = useRef(window.location.hash);
  const cambioPropio = useRef(false);
  useEffect(() => {
    const f = async () => {
      const nuevo = window.location.hash;
      if (!cambioPropio.current && motivoSalida()) {
        cambioPropio.current = true;
        window.location.hash = ultimoHash.current;
        if (!(await pedirSalida())) return;
        cambioPropio.current = true;
        window.location.hash = nuevo;
        return;
      }
      cambioPropio.current = false;
      if (nuevo === ultimoHash.current) return;
      ultimoHash.current = nuevo;
      setRuta(parsearRuta()); window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, [pedirSalida]);
  const navegar = useCallback(async (hash) => {
    if (!(await pedirSalida())) return;
    if (window.location.hash === hash) { setRuta(parsearRuta()); return; }
    cambioPropio.current = true;
    window.location.hash = hash;
  }, [pedirSalida]);

  // Tema
  const alternarTema = useCallback(() => {
    setTema((t) => { const n = t === 'oscuro' ? 'claro' : 'oscuro'; document.documentElement.setAttribute('data-tema', n); try { localStorage.setItem('bitacora.tema', n); } catch (e) { /* nada */ } return n; });
  }, []);

  // Semillas del modo demostración (necesitan window.Descargas ya cargado)
  useEffect(() => { if (MODO_DEMO) DB.iniciar().then(() => setDemoListo(true)).catch((e) => { console.error(e); setErrorCarga(`No se pudo preparar la demostración: ${e.message}`); setEstado('error'); }); }, []);

  // Sesión
  useEffect(() => {
    if (!demoListo) return undefined;
    const parar = Auth.alCambiar((u) => setSesion(u));
    return () => { if (typeof parar === 'function') parar(); };
  }, [demoListo]);

  // Carga de datos de la sesión
  const cargarTodo = useCallback(async (silencioso) => {
    const u = Auth.actual();
    if (!u) { setEstado('anonimo'); return; }
    if (!u.emailVerified) { setEstado('sin-verificar'); return; }
    if (!silencioso) setEstado('cargando');
    try {
      let perfil = await DB.obtenerPerfil(u.uid);
      if (!perfil) { setEstado('sin-perfil'); return; }
      if (perfil.activo === false) { setUsuario(perfil); setRol(perfil.rol); setEstado('inactivo'); return; }
      const [p, fs, cs, todos, vs] = await Promise.all([DB.obtenerParametros(), DB.listarFormularios(), DB.listarCatalogos(), DB.listarContratos({ rol: perfil.rol, uid: u.uid }), DB.listarVentanas().catch(() => [])]);
      // Contratos creados antes de vincular la cuenta al crearlos: los que llevan el correo
      // del propio admin quedan vinculados a su cuenta (sin crear cuentas ni enviar correos).
      if (perfil.rol === 'admin') {
        const pendientes = todos.filter((c) => !c.contratistaUid && U.normalizarCorreo(c.correoContratista) === u.email);
        for (const c of pendientes) {
          try {
            await vincularCuentaContratista({ contratoId: c.id, cedula: U.soloDigitos(c.cedulaContratista), correo: u.email, revisores: c.revisores || [], coordinadores: c.coordinadores || [], perfil });
            c.contratistaUid = u.uid;
          } catch (e) { console.warn(`No se vinculó ${c.id} a la cuenta del admin:`, e); }
        }
        if (pendientes.some((c) => c.contratistaUid)) perfil = (await DB.obtenerPerfil(u.uid)) || perfil;
      }
      // Contratos donde esta cuenta es la contratista (también si su rol es otro).
      const mios = perfil.rol === 'contratista' ? todos
        : perfil.rol === 'admin' ? todos.filter((c) => c.contratistaUid === u.uid)
          : await DB.listarContratos({ rol: 'contratista', uid: u.uid }).catch(() => []);
      const rolVista = perfil.rol !== 'contratista' && vistaRef.current === 'contratista' && mios.length ? 'contratista' : perfil.rol;
      const lista = rolVista === perfil.rol ? todos : mios;
      Flujos.configurar(p);
      setUsuario(perfil); setRol(rolVista); setPropios(perfil.rol === 'contratista' ? [] : mios);
      setParametros(p); setFormularios(fs); setCatalogos(cs); setContratos(lista); setVentanas(vs);
      setContratoId((actual) => (lista.some((c) => c.id === actual) ? actual : (lista[0] ? lista[0].id : '')));
      // Período por defecto: el de la ventana abierta; si no hay, el mes anterior.
      const ahora = new Date();
      const abierta = vs.find((v) => U.esFecha(v.desde) && U.esFecha(v.hasta) && ahora >= v.desde && ahora <= v.hasta);
      if (!silencioso) setPeriodo(abierta ? abierta.periodo : U.periodoAnterior(U.periodoActual()));
      setEstado('listo');
    } catch (e) {
      console.error(e);
      setErrorCarga(DB.traducirError(e));
      setEstado('error');
    }
  }, []);
  useEffect(() => { if (sesion === undefined) return; cargarTodo(); }, [sesion, cargarTodo]);

  // Contadores de la navegación (pendientes)
  const recargarContadores = useCallback(async () => {
    const u = Auth.actual();
    if (!u || !usuario || !rol) return;
    try {
      const [envios, solicitudes] = await Promise.all([DB.listarEnvios({ rol, uid: u.uid }), DB.listarSolicitudes({ rol, uid: u.uid })]);
      const ahora = new Date();
      if (rol === 'contratista') setContadores({ solicitudes: solicitudes.filter((s) => s.estado === 'pendiente').length + envios.filter((e) => correccionVigente(e, ahora)).length, revision: 0 });
      else setContadores({ solicitudes: solicitudes.filter((s) => s.estado === 'pendiente').length, revision: envios.filter((e) => pendienteDeMi(e, rol, u.uid)).length });
    } catch (e) { console.warn('Contadores:', e); }
  }, [usuario, rol]);
  useEffect(() => { if (estado === 'listo') recargarContadores(); }, [estado, recargarContadores]);

  const elegirContrato = useCallback(async (id) => { if (!(await pedirSalida())) return; setContratoId(id); try { localStorage.setItem('bitacora.contrato', id); } catch (e) { /* nada */ } }, [pedirSalida]);
  const elegirPeriodo = useCallback(async (p) => { if (await pedirSalida()) setPeriodo(p); }, [pedirSalida]);
  // Vista de contratista ('contratista') o la del rol de la cuenta (''): recarga todo desde el inicio.
  const cambiarVista = useCallback(async (vista) => {
    if (!(await pedirSalida())) return;
    guardaSalida.current = null;
    vistaRef.current = vista;
    try { if (vista) localStorage.setItem('bitacora.vista', vista); else localStorage.removeItem('bitacora.vista'); } catch (e) { /* nada */ }
    window.location.hash = '#/';
    cargarTodo();
  }, [cargarTodo, pedirSalida]);
  const cerrarSesion = useCallback(async () => {
    if (!(await pedirSalida())) return;
    guardaSalida.current = null;
    await Auth.cerrarSesion();
    vistaRef.current = '';
    try { localStorage.removeItem('bitacora.vista'); } catch (e) { /* nada */ }
    setUsuario(null); setRol(null); setPropios([]); setContratos([]); setEstado('anonimo'); window.location.hash = '#/';
  }, [pedirSalida]);

  const contrato = contratos.find((c) => c.id === contratoId) || null;
  const ventana = ventanas.find((v) => v.periodo === periodo) || null;
  const ctx = {
    sesion, usuario: usuario ? { ...usuario, id: usuario.id || (sesion && sesion.uid) } : null,
    rol: usuario ? rol || usuario.rol : null, rolCuenta: usuario ? usuario.rol : null, propios,
    vista: usuario && rol === 'contratista' && usuario.rol !== 'contratista' ? 'contratista' : '',
    parametros, formularios, catalogos, contratos, contrato, contratoId, periodo, ventana, ventanas, contadores, tema, ruta,
    navegar, avisar, confirmar, fijarGuardaSalida, alternarTema, elegirContrato, elegirPeriodo, cerrarSesion, cambiarVista, recargarTodo: () => cargarTodo(true), recargarContadores,
  };

  let contenido;
  if (estado === 'cargando' || sesion === undefined) contenido = <PantallaCarga texto={MODO_DEMO && !demoListo ? 'Preparando datos de demostración…' : 'Cargando…'} />;
  else if (estado === 'error') contenido = <div className="min-h-[100dvh] grid place-items-center p-6"><div className="tarjeta max-w-md w-full"><div className="tarjeta-cuerpo grid gap-3"><h1>No se pudieron cargar los datos</h1><Alerta tipo="error">{errorCarga}</Alerta><div className="flex gap-2"><Boton variante="primario" icono="refrescar" onClick={() => cargarTodo()}>Reintentar</Boton><Boton icono="salir" onClick={cerrarSesion}>Cerrar sesión</Boton></div></div></div></div>;
  else if (estado === 'anonimo') contenido = <PantallaAcceso />;
  else if (estado === 'sin-verificar') contenido = <PantallaVerificar sesion={sesion} alVerificar={(u) => { setSesion(u); }} />;
  else if (estado === 'sin-perfil') contenido = <PantallaCompletarActivacion sesion={sesion} alTerminar={() => cargarTodo()} />;
  else if (estado === 'inactivo') contenido = <MarcoAcceso titulo="Cuenta inactiva" subtitulo="Tu cuenta está desactivada. Escribe al administrador de la plataforma."><Boton icono="salir" onClick={cerrarSesion}>Cerrar sesión</Boton></MarcoAcceso>;
  else contenido = <Shell><Enrutador /></Shell>;

  return (
    <Ctx.Provider value={ctx}>
      {contenido}
      <Toasts lista={toasts} onCerrar={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      {confirmacion ? (
        <Modal key={confirmacion.clave} titulo={confirmacion.titulo || 'Confirmar'} onCerrar={() => cerrarConfirmacion(false)} pie={<><Boton onClick={() => cerrarConfirmacion(false)}>{confirmacion.textoCancelar || 'Cancelar'}</Boton><Boton variante={confirmacion.peligro ? 'peligro' : 'primario'} onClick={() => cerrarConfirmacion(true)}>{confirmacion.textoOk || 'Aceptar'}</Boton></>}>
          <p className="text-sm whitespace-pre-wrap">{confirmacion.mensaje}</p>
        </Modal>
      ) : null}
    </Ctx.Provider>
  );
};

/* ===== 4. Montaje ===== */
ReactDOM.createRoot(document.getElementById('root')).render(<LimiteErrores><App /></LimiteErrores>);
