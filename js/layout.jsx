/* ============================================================================
   10) layout.jsx — estructura de la app: barra superior (selector global de
       contrato, período, chip de ventana, tema, usuario), barra lateral de
       escritorio, navegación inferior móvil y hoja «Más»
   Estructura:
     1. Menús por rol
     2. Selectores globales (contrato y período) y chip de ventana
     3. Barra superior y menú de usuario
     4. Barra lateral y navegación inferior
     5. Shell
   ============================================================================ */

/* ===== 1. Menús por rol ===== */
const NAV_POR_ROL = {
  contratista: [
    { id: 'inicio', etiqueta: 'Inicio', icono: 'inicio', ruta: '#/inicio' },
    { id: 'envios', etiqueta: 'Mis envíos', icono: 'envios', ruta: '#/envios' },
    { id: 'solicitudes', etiqueta: 'Solicitudes', icono: 'solicitudes', ruta: '#/solicitudes', contador: 'solicitudes' },
    { id: 'contrato', etiqueta: 'Contrato', icono: 'contrato', ruta: '#/contrato' },
  ],
  revisor: [
    { id: 'revision', etiqueta: 'Revisión', icono: 'revision', ruta: '#/revision', contador: 'revision' },
    { id: 'solicitudes', etiqueta: 'Solicitudes', icono: 'solicitudes', ruta: '#/solicitudes', contador: 'solicitudes' },
    { id: 'contratos', etiqueta: 'Contratos', icono: 'contrato', ruta: '#/contratos' },
    { id: 'reportes', etiqueta: 'Reportes', icono: 'reportes', ruta: '#/reportes' },
  ],
  admin: [
    { id: 'inicio', etiqueta: 'Inicio', icono: 'inicio', ruta: '#/admin' },
    { id: 'revision', etiqueta: 'Revisión', icono: 'revision', ruta: '#/revision', contador: 'revision' },
    { id: 'solicitudes', etiqueta: 'Solicitudes', icono: 'solicitudes', ruta: '#/solicitudes', contador: 'solicitudes' },
    { id: 'reportes', etiqueta: 'Reportes', icono: 'reportes', ruta: '#/reportes' },
    { seccion: 'Administración' },
    { id: 'admin-contratos', etiqueta: 'Contratistas y contratos', icono: 'contrato', ruta: '#/admin/contratos' },
    { id: 'admin-usuarios', etiqueta: 'Usuarios', icono: 'usuarios', ruta: '#/admin/usuarios' },
    { id: 'admin-ventanas', etiqueta: 'Ventanas', icono: 'ventana', ruta: '#/admin/ventanas' },
    { id: 'admin-formularios', etiqueta: 'Formularios', icono: 'formulario', ruta: '#/admin/formularios' },
    { id: 'admin-catalogos', etiqueta: 'Catálogos', icono: 'catalogo', ruta: '#/admin/catalogos' },
    { id: 'admin-parametros', etiqueta: 'Parámetros', icono: 'parametros', ruta: '#/admin/parametros' },
  ],
};
NAV_POR_ROL.coordinador = NAV_POR_ROL.revisor;
const navDe = (rol) => NAV_POR_ROL[rol] || NAV_POR_ROL.contratista;
const idActivo = (ruta) => {
  const r = ruta.hash || '';
  if (r.startsWith('#/admin/contratos')) return 'admin-contratos';
  if (r.startsWith('#/admin/usuarios')) return 'admin-usuarios';
  if (r.startsWith('#/admin/ventanas')) return 'admin-ventanas';
  if (r.startsWith('#/admin/formularios')) return 'admin-formularios';
  if (r.startsWith('#/admin/catalogos')) return 'admin-catalogos';
  if (r.startsWith('#/admin/parametros')) return 'admin-parametros';
  if (r.startsWith('#/admin')) return 'inicio';
  if (r.startsWith('#/inicio') || r === '#/' || r === '' || r === '#') return 'inicio';
  if (r.startsWith('#/envios')) return 'envios';
  if (r.startsWith('#/solicitudes')) return 'solicitudes';
  if (r.startsWith('#/contratos')) return 'contratos';
  if (r.startsWith('#/contrato')) return 'contrato';
  if (r.startsWith('#/revision')) return 'revision';
  if (r.startsWith('#/reportes')) return 'reportes';
  if (r.startsWith('#/formulario')) return 'inicio';
  return '';
};

/* ===== 2. Selectores globales ===== */
const SelectorContrato = () => {
  const app = useApp();
  const opciones = app.contratos.map((c) => ({ valor: c.id, etiqueta: `${c.numero || c.id}${c.etiqueta ? ` · ${c.etiqueta}` : ''}`, detalle: `${c.estado === 'terminado' ? 'Terminado' : 'Activo'}${c.info && c.info.contratista && c.info.contratista.nombreCompleto && app.rol !== 'contratista' ? ` · ${c.info.contratista.nombreCompleto}` : ''}` }));
  if (!opciones.length) return <span className="selector-global texto-3 text-xs"><Icono nombre="contrato" /> <span className="valor">Sin contratos</span></span>;
  return <div className="combo-contrato" style={{ width: 'min(46vw, 340px)' }}><Combobox id="sel-contrato" opciones={opciones} valor={app.contratoId} onCambio={(v) => app.elegirContrato(v)} placeholder="Buscar contrato…" detalleDe={(o) => o.detalle} permitirVacio={false} /></div>;
};
const SelectorPeriodo = () => {
  const app = useApp();
  const opciones = useMemo(() => {
    const actual = U.periodoActual();
    const lista = U.listaPeriodos(U.desplazarPeriodo(actual, -18), U.desplazarPeriodo(actual, 2)).reverse();
    if (app.periodo && !lista.includes(app.periodo)) lista.unshift(app.periodo);
    return lista.map((p) => ({ valor: p, etiqueta: U.nombrePeriodo(p) }));
  }, [app.periodo]);
  return <Selector aria-label="Período" className="selector-global" style={{ width: 'auto', minHeight: 38 }} vacio={null} opciones={opciones} value={app.periodo} onChange={(e) => app.elegirPeriodo(e.target.value)} />;
};
const ChipVentana = ({ enBanner }) => {
  const app = useApp();
  const ahora = useReloj(30000);
  const v = app.ventana;
  const e = U.estadoVentana(v, null, ahora);
  let texto, tipo, icono = 'reloj';
  if (e.estado === 'abierta') { texto = `Ventana abierta · cierra en ${U.cuentaRegresiva(e.faltan)}`; tipo = 'exito'; }
  else if (e.estado === 'por_abrir') { texto = `Ventana abre en ${U.cuentaRegresiva(e.faltan)}`; tipo = 'info'; icono = 'calendario'; }
  else if (e.estado === 'cerrada') { texto = `Ventana cerrada · ${U.fechaCorta(v.hasta)}`; tipo = 'alerta'; icono = 'candado'; }
  else { texto = `Sin ventana para ${U.nombrePeriodo(app.periodo)}`; tipo = 'neutro'; icono = 'candado'; }
  const estilo = { background: `var(--${tipo === 'neutro' ? 'superficie-2' : `${tipo}-suave`})`, color: `var(--${tipo === 'neutro' ? 'texto-2' : tipo})`, borderColor: `color-mix(in srgb, var(--${tipo === 'neutro' ? 'borde' : tipo}) 40%, transparent)` };
  return <span className={enBanner ? 'chip' : 'chip-ventana'} style={estilo} title={v ? U.textoVentana(v) : ''}><Icono nombre={icono} /> {texto}</span>;
};

/* ===== 3. Barra superior ===== */
const MenuUsuario = () => {
  const app = useApp();
  const [abierto, setAbierto] = useState(false);
  const u = app.usuario;
  return (
    <div className="relative">
      <button type="button" className="flex items-center gap-2 rounded-full p-1 pr-2" style={{ border: '1px solid var(--borde)' }} aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto(!abierto)} title={u.nombreCompleto}>
        <span className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold" style={{ background: 'var(--primario)', color: 'var(--primario-texto)' }}>{U.iniciales(u.nombreCompleto)}</span>
        <span className="hidden md:inline text-sm font-medium max-w-[140px] truncate">{u.nombreCorto || u.nombreCompleto}</span>
        <Icono nombre="abajo" tam={14} className="texto-3 hidden md:inline" />
      </button>
      <MenuFlotante abierto={abierto} onCerrar={() => setAbierto(false)}>
        <div className="px-3 py-2 text-xs texto-2 border-b mb-1" style={{ borderColor: 'var(--borde)' }}><div className="font-semibold" style={{ color: 'var(--texto)' }}>{u.nombreCompleto}</div><div>{U.ROLES[app.rol]} · {u.correo}</div></div>
        <button type="button" role="menuitem" onClick={() => { setAbierto(false); app.navegar('#/perfil'); }}><Icono nombre="usuario" /> Mi perfil y firma</button>
        <button type="button" role="menuitem" onClick={() => { setAbierto(false); app.alternarTema(); }}><Icono nombre={app.tema === 'oscuro' ? 'sol' : 'luna'} /> Tema {app.tema === 'oscuro' ? 'claro' : 'oscuro'}</button>
        <button type="button" role="menuitem" onClick={() => { setAbierto(false); app.recargarTodo(); }}><Icono nombre="refrescar" /> Actualizar datos</button>
        {MODO_DEMO ? <button type="button" role="menuitem" onClick={async () => { setAbierto(false); if (await app.confirmar({ titulo: 'Reiniciar la demostración', mensaje: 'Se borran los datos de prueba de este navegador y se vuelven a crear.', textoOk: 'Reiniciar', peligro: true })) { await DB.reiniciarDemo(); window.location.reload(); } }}><Icono nombre="refrescar" /> Reiniciar datos demo</button> : null}
        <button type="button" role="menuitem" onClick={() => { setAbierto(false); app.cerrarSesion(); }}><Icono nombre="salir" /> Cerrar sesión</button>
      </MenuFlotante>
    </div>
  );
};
const BarraSuperior = () => {
  const app = useApp();
  const logo = app.parametros.marca && app.parametros.marca.logoUrl;
  return (
    <header className="barra-superior">
      <a href="#/inicio" className="marca" aria-label="Inicio" onClick={(e) => { e.preventDefault(); app.navegar(app.rol === 'admin' ? '#/admin' : app.rol === 'contratista' ? '#/inicio' : '#/revision'); }}>
        <span className="marca-logo">{logo ? <img src={logo} alt="" /> : <Icono nombre="contrato" tam={18} />}</span>
        <span className="hidden lg:inline">{app.parametros.nombreApp}</span>
      </a>
      <div className="barra-centro">
        <SelectorContrato />
        <SelectorPeriodo />
        <ChipVentana />
      </div>
      <div className="barra-derecha">
        <button type="button" className="btn btn-fantasma btn-icono btn-sm" aria-label="Cambiar tema" onClick={app.alternarTema}><Icono nombre={app.tema === 'oscuro' ? 'sol' : 'luna'} /></button>
        <MenuUsuario />
      </div>
    </header>
  );
};

/* ===== 4. Barra lateral y navegación inferior ===== */
const BarraLateral = () => {
  const app = useApp();
  const activo = idActivo(app.ruta);
  return (
    <nav className="nav-lateral" aria-label="Principal">
      {navDe(app.rol).map((n, i) => (n.seccion ? <div key={`s${i}`} className="nav-seccion">{n.seccion}</div> : (
        <button type="button" key={n.id} className={`nav-enlace ${activo === n.id ? 'activo' : ''}`} aria-current={activo === n.id ? 'page' : undefined} onClick={() => app.navegar(n.ruta)}>
          <Icono nombre={n.icono} /> <span className="flex-1">{n.etiqueta}</span>{n.contador ? <Insignia n={app.contadores[n.contador]} /> : null}
        </button>
      )))}
      <div className="mt-auto pt-4 text-xs texto-3 px-3">v{VERSION_APP} · {DB.modo === 'demo' ? 'demostración' : 'Firestore'}</div>
    </nav>
  );
};
const NavInferior = () => {
  const app = useApp();
  const [mas, setMas] = useState(false);
  const activo = idActivo(app.ruta);
  const items = navDe(app.rol).filter((n) => !n.seccion);
  const principales = items.length > 4 ? items.slice(0, 3) : items;
  const resto = items.length > 4 ? items.slice(3) : [];
  return (
    <>
      <nav className="nav-inferior" aria-label="Principal">
        {principales.map((n) => <button type="button" key={n.id} className={activo === n.id ? 'activo' : ''} aria-current={activo === n.id ? 'page' : undefined} onClick={() => app.navegar(n.ruta)}><Icono nombre={n.icono} />{n.etiqueta}{n.contador ? <Insignia n={app.contadores[n.contador]} /> : null}</button>)}
        {resto.length ? <button type="button" className={resto.some((n) => n.id === activo) ? 'activo' : ''} onClick={() => setMas(true)}><Icono nombre="menu" />Más</button> : null}
      </nav>
      {mas ? (
        <Modal titulo="Más opciones" onCerrar={() => setMas(false)}>
          <div className="grid gap-1">
            {resto.map((n) => <button type="button" key={n.id} className={`nav-enlace ${activo === n.id ? 'activo' : ''}`} onClick={() => { setMas(false); app.navegar(n.ruta); }}><Icono nombre={n.icono} /> {n.etiqueta}</button>)}
            <button type="button" className="nav-enlace" onClick={() => { setMas(false); app.navegar('#/perfil'); }}><Icono nombre="usuario" /> Mi perfil y firma</button>
            <button type="button" className="nav-enlace" onClick={() => { setMas(false); app.alternarTema(); }}><Icono nombre={app.tema === 'oscuro' ? 'sol' : 'luna'} /> Tema {app.tema === 'oscuro' ? 'claro' : 'oscuro'}</button>
            <button type="button" className="nav-enlace" onClick={() => { setMas(false); app.cerrarSesion(); }}><Icono nombre="salir" /> Cerrar sesión</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
};

/* ===== 5. Shell ===== */
const Shell = ({ children }) => (
  <div className="app">
    {MODO_DEMO ? <div className="banner-demo"><strong>Modo demostración</strong> · datos ficticios en este navegador · los correos y archivos se simulan</div> : null}
    <BarraSuperior />
    <div className="app-cuerpo">
      <BarraLateral />
      <main className="contenido" id="contenido">{children}</main>
    </div>
    <NavInferior />
    <VolverArriba />
  </div>
);
