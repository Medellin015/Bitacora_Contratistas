/* ============================================================================
   9) auth.jsx — acceso: inicio de sesión, primera contraseña y recuperación,
      verificación de correo y activación de respaldo (perfil + contratos).
      Las cuentas las crea el admin (la del contratista, al crear su contrato):
      nadie se registra solo.
   Estructura:
     1. Marco visual de las pantallas de acceso
     2. Inicio de sesión (+ usuarios de demostración)
     3. Primera contraseña y recuperación (enlace por correo)
     4. Verificación de correo (cuentas creadas en la consola de Firebase)
     5. Activación de respaldo: preRegistro → usuarios/{uid} → reclamar contratos
   ============================================================================ */

/* ===== 1. Marco ===== */
const MOTIVOS_DEMO = {
  'sin-config': 'configura firebaseConfig para conectar el proyecto real',
  forzado: 'quita ?demo=1 (o abre ?demo=0) para usar Firebase',
  'sin-sdk': 'no cargó el SDK de Firebase (¿la red bloquea gstatic.com?); recarga cuando haya conexión',
};
const MarcoAcceso = ({ children, titulo, subtitulo }) => {
  const app = useApp();
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--fondo)' }}>
      {MODO_DEMO ? <div className="banner-demo"><strong>Modo demostración</strong> · datos ficticios guardados solo en este navegador · {MOTIVOS_DEMO[MOTIVO_DEMO] || MOTIVOS_DEMO.forzado}</div> : null}
      <div className="flex-1 grid lg:grid-cols-[1.1fr_1fr]">
        <aside className="hidden lg:flex flex-col justify-between p-12" style={{ background: 'var(--primario)', color: '#F6F4EF' }}>
          <div className="marca" style={{ color: '#F6F4EF' }}><span className="marca-logo" style={{ background: '#F6F4EF', color: 'var(--primario)' }}><Icono nombre="contrato" tam={20} /></span>{app.parametros.nombreApp}</div>
          <div className="max-w-md">
            <p className="text-xs uppercase tracking-[0.2em] opacity-80 mb-3">{app.parametros.nombreDependencia}</p>
            <h1 className="text-3xl font-semibold leading-tight mb-4" style={{ color: '#F6F4EF' }}>Informes de ejecución y cuentas de cobro, en un solo lugar.</h1>
            <p className="opacity-85 text-sm leading-relaxed">Diligencia el informe mensual y la cuenta de cobro dentro de la ventana del período, descarga el Word en el formato institucional y sigue las correcciones desde Solicitudes.</p>
          </div>
          <p className="text-xs opacity-70">v{VERSION_APP} · {app.parametros.nombreEntidad}</p>
        </aside>
        <main className="flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md entrar">
            <div className="marca mb-6 lg:hidden"><span className="marca-logo"><Icono nombre="contrato" tam={20} /></span>{app.parametros.nombreApp}</div>
            <div className="tarjeta">
              <div className="tarjeta-cuerpo">
                <h1 className="mb-1">{titulo}</h1>
                {subtitulo ? <p className="texto-2 text-sm mb-5">{subtitulo}</p> : <div className="mb-4" />}
                {children}
              </div>
            </div>
            <div className="flex justify-between items-center mt-4 text-xs texto-3">
              <span>Zona horaria: America/Bogota</span>
              <button type="button" className="underline" onClick={app.alternarTema}>Tema {app.tema === 'oscuro' ? 'claro' : 'oscuro'}</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

/* ===== 2. Inicio de sesión ===== */
const PantallaAcceso = () => {
  const [vista, setVista] = useState('login');
  if (vista === 'primera' || vista === 'recuperar') return <PantallaRecuperar primeraVez={vista === 'primera'} volver={() => setVista('login')} />;
  return <PantallaLogin irA={setVista} />;
};
const PantallaLogin = ({ irA }) => {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const entrar = async (e) => {
    e.preventDefault();
    setError('');
    if (!U.esCorreo(correo)) { setError('Escribe un correo válido.'); return; }
    if (!MODO_DEMO && !clave) { setError('Escribe tu contraseña.'); return; }
    setCargando(true);
    try { await Auth.iniciarSesion(correo, clave); } catch (err) { setError(Auth.traducirError(err)); } finally { setCargando(false); }
  };
  const demo = MODO_DEMO ? Auth.usuariosDemo() : [];
  return (
    <MarcoAcceso titulo="Iniciar sesión" subtitulo="Usa el correo con el que te registraron.">
      {demo.length ? (
        <div className="mb-5">
          <p className="etiqueta">Entrar como usuario de demostración</p>
          <div className="grid gap-2">
            {demo.map((u) => (
              <button type="button" key={u.uid} className="btn btn-secundario justify-between" onClick={async () => { try { await Auth.entrarDemo(u.uid); } catch (err) { setError(err.message); } }}>
                <span className="flex items-center gap-2"><Icono nombre="usuario" /> {u.nombres} {u.apellidos}</span>
                <Chip tipo={u.rol === 'admin' ? 'acento' : u.rol === 'contratista' ? 'primario' : 'info'}>{U.ROLES[u.rol]}</Chip>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 my-4 text-xs texto-3"><span className="flex-1 border-t" style={{ borderColor: 'var(--borde)' }} />o con correo<span className="flex-1 border-t" style={{ borderColor: 'var(--borde)' }} /></div>
        </div>
      ) : null}
      <form onSubmit={entrar} className="grid gap-4" noValidate>
        <Campo etiqueta="Correo" id="login-correo"><Entrada id="login-correo" type="email" autoComplete="username" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required /></Campo>
        <Campo etiqueta="Contraseña" id="login-clave"><Entrada id="login-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required={!MODO_DEMO} /></Campo>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <Boton tipo="submit" variante="primario" cargando={cargando} icono="flecha">Entrar</Boton>
      </form>
      <div className="flex flex-col sm:flex-row gap-2 justify-between mt-5 text-sm">
        <button type="button" className="underline" onClick={() => irA('primera')}>Primera vez: crear mi contraseña</button>
        <button type="button" className="underline texto-2" onClick={() => irA('recuperar')}>Olvidé mi contraseña</button>
      </div>
    </MarcoAcceso>
  );
};

/* ===== 3. Primera contraseña y recuperación ===== */
// El mismo enlace sirve para crear la contraseña la primera vez (cuenta creada por el admin)
// y para recuperarla; al abrirlo, el correo queda verificado.
const PantallaRecuperar = ({ volver, primeraVez }) => {
  const [correo, setCorreo] = useState('');
  const [estado, setEstado] = useState({ cargando: false, listo: false, error: '' });
  const enviar = async (e) => {
    e.preventDefault();
    if (!U.esCorreo(correo)) { setEstado({ cargando: false, listo: false, error: 'Escribe un correo válido.' }); return; }
    setEstado({ cargando: true, listo: false, error: '' });
    try { await Auth.recuperarClave(correo); setEstado({ cargando: false, listo: true, error: '' }); }
    catch (err) { setEstado({ cargando: false, listo: false, error: Auth.traducirError(err) }); }
  };
  return (
    <MarcoAcceso titulo={primeraVez ? 'Crear mi contraseña' : 'Recuperar contraseña'} subtitulo={primeraVez ? 'Escribe el correo con el que la entidad creó tu cuenta y te enviamos el enlace para crear tu contraseña.' : 'Te enviamos un enlace para definir una contraseña nueva.'}>
      {estado.listo ? <Alerta tipo="exito">Si el correo tiene cuenta, recibirás el enlace en unos minutos (revisa también la carpeta de no deseados). Ábrelo, define tu contraseña y vuelve a iniciar sesión.</Alerta> : (
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <Campo etiqueta="Correo" id="rec-correo"><Entrada id="rec-correo" type="email" inputMode="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} /></Campo>
          {estado.error ? <Alerta tipo="error">{estado.error}</Alerta> : null}
          <Boton tipo="submit" variante="primario" cargando={estado.cargando} icono="correo">Enviar enlace</Boton>
        </form>
      )}
      <button type="button" className="underline text-sm texto-2 mt-5" onClick={volver}>Volver a iniciar sesión</button>
    </MarcoAcceso>
  );
};

/* ===== 4. Verificación de correo ===== */
const PantallaVerificar = ({ sesion, alVerificar }) => {
  const app = useApp();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const reenviar = async () => { setCargando(true); try { await Auth.enviarVerificacion(); setMensaje('Enlace enviado: revisa tu correo (también no deseados).'); } catch (e) { setMensaje(Auth.traducirError(e)); } finally { setCargando(false); } };
  const comprobar = async () => {
    setCargando(true);
    try { const u = await Auth.recargar(); if (u && u.emailVerified) alVerificar(u); else setMensaje('Todavía no aparece verificado. Abre el enlace del correo y vuelve a intentar.'); }
    catch (e) { setMensaje(Auth.traducirError(e)); } finally { setCargando(false); }
  };
  return (
    <MarcoAcceso titulo="Verifica tu correo" subtitulo={`${sesion.email} aún no está verificado. Pide el enlace, ábrelo desde tu correo y luego pulsa «Ya verifiqué».`}>
      <div className="grid gap-3">
        <Boton variante="primario" icono="check" cargando={cargando} onClick={comprobar}>Ya verifiqué</Boton>
        <Boton icono="correo" cargando={cargando} onClick={reenviar}>Enviar enlace de verificación</Boton>
        <Boton variante="fantasma" icono="salir" onClick={() => app.cerrarSesion()}>Cerrar sesión</Boton>
        {mensaje ? <Alerta tipo="info">{mensaje}</Alerta> : null}
      </div>
    </MarcoAcceso>
  );
};

/* ===== 5. Activación de respaldo ===== */
// Solo si la cuenta ya existía (sin perfil) cuando el admin creó el contrato: con el correo
// verificado se lee preRegistro (la regla solo lo permite si el correo coincide), se crea
// el perfil y DESPUÉS se reclaman los contratos uno por uno.
const PantallaCompletarActivacion = ({ sesion, alTerminar }) => {
  const app = useApp();
  const [f, setF] = useState({ cedula: '', nombres: '', apellidos: '', telefono: '' });
  const [estado, setEstado] = useState({ cargando: false, error: '', pasos: [] });
  const poner = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const paso = (t) => setEstado((s) => ({ ...s, pasos: [...s.pasos, t] }));
  const completar = async (e) => {
    e.preventDefault();
    const cedula = U.soloDigitos(f.cedula);
    if (cedula.length < 5 || !f.nombres.trim() || !f.apellidos.trim()) { setEstado({ cargando: false, error: 'Completa cédula, nombres y apellidos.', pasos: [] }); return; }
    setEstado({ cargando: true, error: '', pasos: [] });
    try {
      const pre = await DB.obtenerPreRegistro(cedula);
      if (!pre) throw new Error('Tu cédula no está precargada o el correo no coincide con el registrado por la entidad. Escribe al administrador.');
      if (U.normalizarCorreo(pre.correo) !== sesion.email) throw new Error('El correo de esta cuenta no coincide con el precargado para esa cédula.');
      if (pre.activado && pre.uid && pre.uid !== sesion.uid) throw new Error('Esa cédula ya fue activada con otra cuenta. Escribe al administrador.');
      paso('Precarga encontrada');
      const nombreCompleto = `${f.nombres.trim()} ${f.apellidos.trim()}`.replace(/\s+/g, ' ');
      await DB.crearPerfil(sesion.uid, {
        rol: 'contratista', nombres: f.nombres.trim(), apellidos: f.apellidos.trim(), nombreCompleto, nombreCorto: U.nombreCorto(f.nombres, f.apellidos),
        cedula, correo: sesion.email, telefono: f.telefono.trim(), activo: true, revisores: pre.revisores || [], coordinadores: pre.coordinadores || [],
      });
      paso('Perfil creado');
      let reclamados = 0;
      for (const id of (pre.contratos || [])) {
        try { await DB.reclamarContrato(id, sesion.uid); reclamados++; paso(`Contrato ${id} vinculado`); }
        catch (err) { console.warn('No se pudo reclamar', id, err); paso(`Contrato ${id}: ${DB.traducirError(err)}`); }
      }
      try { await DB.marcarActivado(cedula, sesion.uid); } catch (err) { console.warn('No se pudo marcar el preRegistro', err); }
      app.avisar('exito', `Cuenta activada${reclamados ? ` · ${reclamados} ${U.plural(reclamados, 'contrato vinculado', 'contratos vinculados')}` : ''}`);
      alTerminar();
    } catch (err) { setEstado((s) => ({ ...s, cargando: false, error: DB.traducirError(err) })); }
  };
  return (
    <MarcoAcceso titulo="Completar activación" subtitulo="Correo verificado. Confirma tu cédula para vincular tus contratos.">
      <form onSubmit={completar} className="grid gap-4" noValidate>
        <Campo etiqueta="Cédula" id="comp-cedula" obligatoria><Entrada id="comp-cedula" inputMode="numeric" className="mono" value={f.cedula} onChange={poner('cedula')} /></Campo>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Nombres" id="comp-nombres" obligatoria><Entrada id="comp-nombres" value={f.nombres} onChange={poner('nombres')} /></Campo>
          <Campo etiqueta="Apellidos" id="comp-apellidos" obligatoria><Entrada id="comp-apellidos" value={f.apellidos} onChange={poner('apellidos')} /></Campo>
        </div>
        <Campo etiqueta="Teléfono" id="comp-tel"><Entrada id="comp-tel" inputMode="tel" value={f.telefono} onChange={poner('telefono')} /></Campo>
        {estado.pasos.length ? <ul className="text-sm texto-2 grid gap-1">{estado.pasos.map((p, i) => <li key={i} className="flex gap-2 items-center"><Icono nombre="check" tam={14} />{p}</li>)}</ul> : null}
        {estado.error ? <Alerta tipo="error">{estado.error}</Alerta> : null}
        <Boton tipo="submit" variante="primario" cargando={estado.cargando} icono="check">Vincular mis contratos</Boton>
        <Boton variante="fantasma" icono="salir" onClick={() => app.cerrarSesion()}>Cerrar sesión</Boton>
      </form>
    </MarcoAcceso>
  );
};
