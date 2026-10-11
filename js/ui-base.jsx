/* ============================================================================
   8) ui-base.jsx — componentes base de React
   Estructura:
     1. Hooks de React, contexto de la app (useApp) y hooks utilitarios
     2. Iconos de línea (SVG)
     3. Botones, chips, insignias
     4. Campos de formulario (entrada, área, selector, conmutador, combobox)
     5. Modales, confirmación, toasts
     6. Tablas responsivas, listas de datos, línea de tiempo, pestañas, estados vacíos
     7. Vista previa de Word (modal)
   ============================================================================ */
const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext } = React;

/* ===== 1. Contexto y hooks ===== */
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

// Carga asíncrona con estado; recargar() vuelve a ejecutar fn.
const useCarga = (fn, deps) => {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });
  const version = useRef(0);
  const recargar = useCallback(async (silencioso) => {
    const v = ++version.current;
    if (!silencioso) setEstado((s) => ({ ...s, cargando: true, error: null }));
    try { const datos = await fn(); if (v === version.current) setEstado({ datos, cargando: false, error: null }); }
    catch (e) { console.error(e); if (v === version.current) setEstado({ datos: null, cargando: false, error: e }); }
  }, deps); // eslint-disable-line
  useEffect(() => { recargar(); }, [recargar]);
  return { ...estado, recargar };
};
// Reloj de 30 s para cuentas regresivas y «guardado hace X s».
const useReloj = (ms = 30000) => {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return ahora;
};
const useMedia = (consulta) => {
  const [coincide, setCoincide] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => { const m = window.matchMedia(consulta); const f = () => setCoincide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [consulta]);
  return coincide;
};
const useClicFuera = (ref, cb, activo = true) => {
  useEffect(() => {
    if (!activo) return undefined;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) cb(); };
    document.addEventListener('mousedown', f); document.addEventListener('touchstart', f);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('touchstart', f); };
  }, [ref, cb, activo]);
};

/* ===== 2. Iconos ===== */
const RUTAS_ICONO = {
  inicio: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  envios: <><path d="M4 4h16v16H4z" /><path d="M4 9h16" /><path d="M9 20V9" /></>,
  enviar: <><path d="m3 11 18-7-7 18-2-8-9-3z" /></>,
  solicitudes: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  contrato: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /><path d="M9 13h6M9 17h6" /></>,
  revision: <><path d="M4 7h16v12H4z" /><path d="m4 7 8 6 8-6" /></>,
  admin: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  usuarios: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4a3.5 3.5 0 0 1 0 7" /><path d="M17.5 13.5A6.5 6.5 0 0 1 21.5 20" /></>,
  usuario: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <><path d="m5 12 5 5L20 7" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  alerta: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  descargar: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>,
  subir: <><path d="M12 20V9" /><path d="m7 14 5-5 5 5" /><path d="M4 4h16" /></>,
  ojo: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>,
  editar: <><path d="M4 20h4l10.5-10.5a2 2 0 0 0-4-4L4 16v4z" /><path d="m13 7 4 4" /></>,
  mas: <><path d="M12 5v14M5 12h14" /></>,
  menos: <><path d="M5 12h14" /></>,
  basura: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  abajo: <><path d="m6 9 6 6 6-6" /></>,
  arriba: <><path d="m6 15 6-6 6 6" /></>,
  derecha: <><path d="m9 6 6 6-6 6" /></>,
  izquierda: <><path d="m15 6-6 6 6 6" /></>,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  luna: <><path d="M21 13A8.5 8.5 0 1 1 11 3a7 7 0 0 0 10 10z" /></>,
  salir: <><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M8 12h10" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  refrescar: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  lista: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  tabla: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>,
  candado: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  correo: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  telefono: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></>,
  enlace: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  archivo: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></>,
  word: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /><path d="m8 12 1.5 6 1.5-4 1.5 4L14 12" /></>,
  excel: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /><path d="m9 12 4 6M13 12l-4 6" /></>,
  pdf: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /><path d="M9 17v-5h2a1.5 1.5 0 0 1 0 3H9" /></>,
  reportes: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  ventana: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 13h3" /></>,
  formulario: <><path d="M5 3h14v18H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  catalogo: <><path d="M4 5h16v4H4zM4 15h16v4H4z" /><path d="M8 7h.01M8 17h.01" /></>,
  parametros: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
  mover: <><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" /></>,
  advertencia: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  firma: <><path d="M3 17c3-4 5-6 7-6s2 4 4 4 3-6 5-6" /><path d="M3 21h18" /></>,
  copiar: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></>,
  bandera: <><path d="M5 21V4h12l-2 4 2 4H5" /></>,
  escudo: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" /></>,
  chat: <><path d="M4 5h16v11H8l-4 4V5z" /></>,
  cargando: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
  filtro: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></>,
  cedula: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5 17a3.5 3.5 0 0 1 7 0M14 10h4M14 14h4" /></>,
  flecha: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
};
const Icono = ({ nombre, className, tam, titulo }) => (
  <svg className={className} width={tam || 18} height={tam || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden={titulo ? undefined : 'true'} role={titulo ? 'img' : undefined}>
    {titulo ? <title>{titulo}</title> : null}
    {RUTAS_ICONO[nombre] || RUTAS_ICONO.info}
  </svg>
);

/* ===== 3. Botones, chips, insignias ===== */
// `disabled` se saca de props: si quedara dentro del {...props} final, un disabled={false} explícito
// pisaría a `cargando` y el botón seguiría activo mientras guarda (doble envío).
const Boton = ({ variante = 'secundario', tam, icono, cargando, children, className = '', tipo = 'button', soloIcono, titulo, disabled, ...props }) => (
  <button type={tipo} className={`btn btn-${variante} ${tam ? `btn-${tam}` : ''} ${soloIcono ? 'btn-icono' : ''} ${className}`} disabled={!!disabled || !!cargando} aria-label={soloIcono ? titulo : undefined} title={titulo} {...props}>
    {cargando ? <Icono nombre="cargando" className="girando" /> : (icono ? <Icono nombre={icono} /> : null)}
    {soloIcono ? null : children}
  </button>
);
const Chip = ({ tipo = 'neutro', icono, children, className = '' }) => <span className={`chip chip-${tipo} ${className}`}>{icono ? <Icono nombre={icono} /> : null}{children}</span>;
const ChipEstado = ({ estado }) => { const e = U.ESTADOS[estado] || { etiqueta: estado || '—', chip: 'neutro' }; return <Chip tipo={e.chip}>{e.etiqueta}</Chip>; };
const ChipSolicitud = ({ estado }) => { const e = U.ESTADOS_SOLICITUD[estado] || { etiqueta: estado || '—', chip: 'neutro' }; return <Chip tipo={e.chip}>{e.etiqueta}</Chip>; };
const Insignia = ({ n }) => (Number(n) > 0 ? <span className="insignia" aria-label={`${n} pendientes`}>{n > 99 ? '99+' : n}</span> : null);
const Cargando = ({ texto = 'Cargando…' }) => <div className="flex items-center gap-2 texto-2 py-6 justify-center" role="status" aria-live="polite"><Icono nombre="cargando" className="girando" /> {texto}</div>;
const Esqueleto = ({ filas = 3, alto = 16 }) => (
  <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
    {Array.from({ length: filas }).map((_, i) => <div key={i} className="esqueleto" style={{ height: alto, width: `${100 - (i % 3) * 12}%` }} />)}
  </div>
);
const Vacio = ({ icono = 'archivo', titulo, texto, accion }) => (
  <div className="vacio" role="status">
    <Icono nombre={icono} tam={56} />
    {titulo ? <h3 className="mb-1" style={{ color: 'var(--texto)' }}>{titulo}</h3> : null}
    {texto ? <p className="text-sm">{texto}</p> : null}
    {accion ? <div className="mt-4 flex justify-center">{accion}</div> : null}
  </div>
);
const Alerta = ({ tipo = 'info', icono, children, className = '' }) => (
  <div className={`alerta-caja alerta-${tipo} ${className}`} role={tipo === 'error' ? 'alert' : 'status'}>
    <Icono nombre={icono || (tipo === 'exito' ? 'check' : tipo === 'error' || tipo === 'alerta' ? 'alerta' : 'info')} />
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

/* ===== 4. Campos ===== */
const Campo = ({ etiqueta, ayuda, error, obligatoria, id, children, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    {etiqueta ? <label className="etiqueta" htmlFor={id}>{etiqueta}{obligatoria ? <span className="req" aria-hidden="true">*</span> : null}</label> : null}
    {children}
    {error ? <div className="error-campo" role="alert"><Icono nombre="alerta" tam={14} />{error}</div> : (ayuda ? <div className="ayuda">{ayuda}</div> : null)}
  </div>
);
const Entrada = ({ invalido, className = '', ...props }) => <input className={`campo ${invalido ? 'invalido' : ''} ${className}`} {...props} />;
const Area = ({ invalido, className = '', autoAlto = true, ...props }) => {
  const ref = useRef(null);
  useEffect(() => { if (autoAlto && ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${Math.min(ref.current.scrollHeight + 2, 600)}px`; } }, [props.value, autoAlto]);
  return <textarea ref={ref} className={`campo ${invalido ? 'invalido' : ''} ${className}`} {...props} />;
};
const Selector = ({ opciones, vacio = '— Seleccionar —', invalido, className = '', ...props }) => (
  <select className={`campo ${invalido ? 'invalido' : ''} ${className}`} {...props}>
    {vacio !== null ? <option value="">{vacio}</option> : null}
    {opciones.map((o) => <option key={String(o.valor)} value={o.valor}>{o.etiqueta}</option>)}
  </select>
);
const Conmutador = ({ activo, onCambio, etiqueta, id }) => (
  <div className="flex items-center gap-3">
    <button type="button" id={id} className="conmutador" role="switch" aria-checked={activo ? 'true' : 'false'} aria-label={etiqueta} onClick={() => onCambio(!activo)} />
    {etiqueta ? <label htmlFor={id} className="text-sm">{etiqueta}</label> : null}
  </div>
);
// Entrada de moneda: muestra separadores es-CO mientras se escribe; entrega número.
const EntradaMoneda = ({ valor, onCambio, invalido, ...props }) => {
  const [texto, setTexto] = useState(valor == null || valor === '' ? '' : U.formatoNumero(valor));
  useEffect(() => { const actual = U.parseNumero(texto); if ((valor == null || valor === '') && texto !== '') setTexto(''); else if (valor != null && valor !== '' && actual !== Number(valor)) setTexto(U.formatoNumero(valor)); }, [valor]); // eslint-disable-line
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 texto-3 text-sm" aria-hidden="true">$</span>
      <Entrada inputMode="numeric" className="mono campo-moneda" invalido={invalido} value={texto}
        onChange={(e) => { const t = e.target.value.replace(/[^\d.,-]/g, ''); const n = U.parseNumero(t.replace(/\./g, '')); setTexto(n == null ? t : U.formatoNumero(n)); onCambio(n); }}
        onBlur={() => { const n = U.parseNumero(texto); setTexto(n == null ? '' : U.formatoNumero(n)); }} {...props} />
    </div>
  );
};
// Combobox con búsqueda; en móvil se abre como hoja inferior.
const Combobox = ({ opciones, valor, onCambio, placeholder = 'Buscar…', etiquetaDe = (o) => o.etiqueta, detalleDe, id, invalido, disabled, hojaMovil = true, permitirVacio = true, className = '' }) => {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resaltada, setResaltada] = useState(0);
  const ref = useRef(null);
  const movil = useMedia('(max-width: 640px)');
  useClicFuera(ref, () => setAbierto(false), abierto && !(movil && hojaMovil));
  const seleccionada = opciones.find((o) => String(o.valor) === String(valor));
  const filtradas = useMemo(() => {
    const t = U.sinTildes(texto).toLowerCase().trim();
    if (!t) return opciones;
    return opciones.filter((o) => U.sinTildes(`${etiquetaDe(o)} ${detalleDe ? detalleDe(o) : ''} ${o.grupo || ''}`).toLowerCase().includes(t));
  }, [opciones, texto, etiquetaDe, detalleDe]);
  const elegir = (o) => { onCambio(o ? o.valor : ''); setAbierto(false); setTexto(''); };
  // Al abrir se resalta lo elegido (un Enter no repite una opción vieja).
  const abrir = () => { if (disabled || abierto) return; const k = filtradas.findIndex((o) => String(o.valor) === String(valor)); setResaltada(k >= 0 ? k : 0); setAbierto(true); };
  const teclado = (e) => {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) { abrir(); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { setResaltada((r) => Math.min(r + 1, filtradas.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setResaltada((r) => Math.max(r - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (filtradas[resaltada]) elegir(filtradas[resaltada]); e.preventDefault(); }
    else if (e.key === 'Escape') setAbierto(false);
  };
  const lista = (
    <div className={`combo-lista ${movil && hojaMovil ? 'hoja-movil' : ''}`} role="listbox" id={id ? `${id}-lista` : undefined}>
      {movil && hojaMovil ? <div className="flex gap-2 mb-2"><Entrada autoFocus placeholder={placeholder} value={texto} onChange={(e) => { setTexto(e.target.value); setResaltada(0); }} onKeyDown={teclado} /><Boton soloIcono icono="x" titulo="Cerrar" onClick={() => setAbierto(false)} /></div> : null}
      {permitirVacio ? <button type="button" className="combo-opcion texto-3" onClick={() => elegir(null)}>— Ninguno —</button> : null}
      {filtradas.length === 0 ? <div className="texto-3 text-sm p-3">Sin coincidencias</div> : filtradas.slice(0, 200).map((o, i) => (
        <button type="button" key={String(o.valor)} role="option" aria-selected={String(o.valor) === String(valor)} className={`combo-opcion ${i === resaltada ? 'resaltada' : ''} ${String(o.valor) === String(valor) ? 'seleccionada' : ''}`} onMouseEnter={() => setResaltada(i)} onClick={() => elegir(o)}>
          <span>{etiquetaDe(o)}</span>
          {detalleDe && detalleDe(o) ? <small>{detalleDe(o)}</small> : (o.grupo ? <small>{o.grupo}</small> : null)}
        </button>
      ))}
    </div>
  );
  return (
    <div className={`combo ${className}`} ref={ref}>
      {abierto && movil && hojaMovil ? <div className="combo-fondo" onClick={() => setAbierto(false)} /> : null}
      <div className="relative">
        <Entrada id={id} role="combobox" aria-expanded={abierto} aria-controls={id ? `${id}-lista` : undefined} aria-autocomplete="list" invalido={invalido} disabled={disabled} placeholder={placeholder}
          value={abierto && !(movil && hojaMovil) ? texto : (seleccionada ? etiquetaDe(seleccionada) : '')}
          onFocus={(e) => { if (!e.currentTarget.dataset.sinAbrir) abrir(); }} onClick={abrir}
          onChange={(e) => { setTexto(e.target.value); setResaltada(0); if (!abierto) setAbierto(true); }} onKeyDown={teclado} readOnly={movil && hojaMovil} />
        <Icono nombre="abajo" className="absolute right-3 top-1/2 -translate-y-1/2 texto-3 pointer-events-none" tam={16} />
      </div>
      {abierto ? lista : null}
    </div>
  );
};
const Segmentado = ({ opciones, valor, onCambio, etiqueta, id }) => (
  <div className="segmentado" role="group" aria-label={etiqueta} id={id}>
    {opciones.map((o) => <button type="button" key={String(o.valor)} className={String(o.valor) === String(valor) ? 'activo' : ''} aria-pressed={String(o.valor) === String(valor)} onClick={() => onCambio(o.valor)}>{o.etiqueta}</button>)}
  </div>
);

/* ===== 5. Modales, confirmación, toasts ===== */
const Modal = ({ titulo, onCerrar, children, pie, ancho, descripcion }) => {
  const ref = useRef(null);
  useEffect(() => {
    const anterior = document.activeElement;
    const primero = ref.current && ref.current.querySelector('input, select, textarea, button:not(.btn-cerrar)');
    if (primero) primero.focus(); else if (ref.current) ref.current.focus();
    const tecla = (e) => { if (e.key === 'Escape') onCerrar && onCerrar(); };
    document.addEventListener('keydown', tecla);
    const desb = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Devuelve el foco sin que un desplegable se abra solo (Combobox mira dataset.sinAbrir).
    return () => {
      document.removeEventListener('keydown', tecla); document.body.style.overflow = desb;
      if (anterior && anterior.focus) { if (anterior.dataset) anterior.dataset.sinAbrir = '1'; anterior.focus(); if (anterior.dataset) delete anterior.dataset.sinAbrir; }
    };
  }, []); // eslint-disable-line
  // No se cierra al soltar sobre el fondo tras seleccionar texto: solo con clic que empieza y termina en el fondo.
  const inicio = useRef(false);
  return (
    <div className="capa" onMouseDown={(e) => { inicio.current = e.target === e.currentTarget; }} onMouseUp={(e) => { if (inicio.current && e.target === e.currentTarget) onCerrar && onCerrar(); inicio.current = false; }}>
      <div className={`modal ${ancho === 'ancho' ? 'modal-ancho' : ''} ${ancho === 'xl' ? 'modal-xl' : ''}`} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <div className="modal-cabecera">
          <div className="min-w-0"><h2 className="truncate">{titulo}</h2>{descripcion ? <p className="text-xs texto-2">{descripcion}</p> : null}</div>
          {onCerrar ? <Boton variante="fantasma" soloIcono icono="x" titulo="Cerrar" className="btn-cerrar" tam="sm" onClick={onCerrar} /> : null}
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie ? <div className="modal-pie">{pie}</div> : null}
      </div>
    </div>
  );
};
const Toasts = ({ lista, onCerrar }) => (
  <div className="toasts" aria-live="polite" aria-relevant="additions">
    {lista.map((t) => (
      <div key={t.id} className={`toast toast-${t.tipo}`} role={t.tipo === 'error' ? 'alert' : 'status'}>
        <Icono nombre={t.tipo === 'exito' ? 'check' : t.tipo === 'error' ? 'alerta' : t.tipo === 'alerta' ? 'advertencia' : 'info'} />
        <div className="flex-1 min-w-0 whitespace-pre-wrap">{t.mensaje}</div>
        <button type="button" className="btn btn-fantasma btn-xs btn-icono" aria-label="Cerrar aviso" onClick={() => onCerrar(t.id)}><Icono nombre="x" tam={14} /></button>
      </div>
    ))}
  </div>
);
const MenuFlotante = ({ abierto, onCerrar, children }) => {
  const ref = useRef(null);
  useClicFuera(ref, onCerrar, abierto);
  if (!abierto) return null;
  return <div className="menu-flotante" ref={ref} role="menu">{children}</div>;
};

/* ===== 6. Tablas, listas, línea de tiempo, pestañas ===== */
// columnas: [{ titulo, clave?, render?(fila), ancho?, clase?, mono?, oculta? }]
const Tabla = ({ columnas, filas, claveFila = (f) => f.id, vacio, cargando, acciones }) => {
  if (cargando) return <div className="p-4"><Esqueleto filas={4} alto={18} /></div>;
  if (!filas || !filas.length) return vacio || <Vacio titulo="Sin registros" />;
  const cols = columnas.filter((c) => !c.oculta);
  return (
    <div className="tabla-envoltura">
      <table className="tabla tabla-movil">
        <thead><tr>{cols.map((c) => <th key={c.titulo} style={{ width: c.ancho }}>{c.titulo}</th>)}{acciones ? <th className="text-right">Acciones</th> : null}</tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={claveFila(f)}>
              {cols.map((c) => <td key={c.titulo} data-etiqueta={c.titulo} className={`${c.clase || ''} ${c.mono ? 'mono' : ''}`}>{c.render ? c.render(f) : U.valorLegible(f[c.clave])}</td>)}
              {acciones ? <td className="acciones sin-etiqueta text-right"><div className="inline-flex gap-1 flex-wrap justify-end">{acciones(f)}</div></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const ListaDatos = ({ items }) => (
  <dl className="lista-datos">
    {items.filter((i) => i).map((i, k) => <div key={k}><dt>{i.etiqueta}</dt><dd className={i.mono ? 'mono' : ''}>{i.valor === '' || i.valor == null ? <span className="texto-3">—</span> : i.valor}</dd></div>)}
  </dl>
);
const PUNTO_ESTADO = { enviado: 'primario', reenviado: 'primario', en_revision: 'primario', aprobado_revisor: 'exito', aprobado: 'exito', en_correccion: 'alerta', rechazada: 'error', pendiente: 'alerta', aprobada: 'exito', finalizada: 'exito' };
const LineaTiempo = ({ entradas }) => (
  <ol className="linea-tiempo">
    {entradas.map((h, i) => (
      <li key={i}>
        <span className={`punto ${PUNTO_ESTADO[h.estado] || ''}`}><Icono nombre={h.icono || (h.estado === 'en_correccion' ? 'editar' : h.estado && h.estado.startsWith('aprobado') ? 'check' : 'enviar')} /></span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <strong className="text-sm">{h.titulo || (U.ESTADOS[h.estado] || U.ESTADOS_SOLICITUD[h.estado] || { etiqueta: h.estado }).etiqueta}</strong>
          {h.fecha ? <span className="mono text-xs texto-3">{U.fechaHora(h.fecha)}</span> : null}
        </div>
        <div className="text-sm texto-2">{h.porNombre || ''}{h.rol ? ` · ${U.ROLES[h.rol] || h.rol}` : ''}</div>
        {h.observacion ? <div className="text-sm mt-1 whitespace-pre-wrap">{h.observacion}</div> : null}
        {h.extra ? <div className="mt-1">{h.extra}</div> : null}
      </li>
    ))}
  </ol>
);
const Pestanas = ({ lista, activa, onCambio }) => (
  <div className="pestanas" role="tablist">
    {lista.map((p) => <button type="button" key={p.id} role="tab" aria-selected={activa === p.id} className={activa === p.id ? 'activa' : ''} onClick={() => onCambio(p.id)}>{p.icono ? <Icono nombre={p.icono} tam={16} /> : null}{p.etiqueta}{p.contador ? <Insignia n={p.contador} /> : null}</button>)}
  </div>
);
const Indicador = ({ titulo, valor, pie, tipo }) => (
  <div className="indicador">
    <div className="titulo">{titulo}</div>
    <div className="valor" style={tipo ? { color: `var(--${tipo})` } : undefined}>{valor}</div>
    {pie ? <div className="text-xs texto-3 mt-1">{pie}</div> : null}
  </div>
);
const Encabezado = ({ titulo, subtitulo, acciones, migas }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
    <div className="min-w-0">
      {migas ? <div className="text-xs texto-3 mb-1 flex gap-1 flex-wrap">{migas.map((m, i) => <span key={i}>{i ? <span className="mx-1">/</span> : null}{m.onClick ? <button type="button" className="underline" onClick={m.onClick}>{m.texto}</button> : m.texto}</span>)}</div> : null}
      <h1>{titulo}</h1>
      {subtitulo ? <p className="texto-2 text-sm mt-0.5">{subtitulo}</p> : null}
    </div>
    {acciones ? <div className="flex gap-2 flex-wrap">{acciones}</div> : null}
  </div>
);
const VolverArriba = () => {
  const [ver, setVer] = useState(false);
  useEffect(() => { const f = () => setVer(window.scrollY > 600); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  if (!ver) return null;
  return <button type="button" className="volver-arriba" aria-label="Volver arriba" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Icono nombre="arriba" /></button>;
};

/* ===== 7. Vista previa de Word ===== */
// generar(): Promise<{ blob, nombre }>. Si la vista previa falla, ofrece la descarga.
const VistaPreviaDocx = ({ titulo, generar, onCerrar }) => {
  const app = useApp();
  const ref = useRef(null);
  const [estado, setEstado] = useState({ cargando: true, error: null, archivo: null });
  const [pdf, setPdf] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const archivo = await generar();
        if (!vivo) return;
        setEstado({ cargando: false, error: null, archivo });
        await Descargas.vistaPrevia(archivo.blob, ref.current);
      } catch (e) { console.error(e); if (vivo) setEstado((s) => ({ ...s, cargando: false, error: e.message || String(e) })); }
    })();
    return () => { vivo = false; };
  }, []); // eslint-disable-line
  const descargar = () => { if (estado.archivo) U.descargarBlob(estado.archivo.blob, estado.archivo.nombre); };
  const aPdf = async () => {
    setPdf(true);
    try { await Descargas.descargarPDF(estado.archivo); } catch (e) { app.avisar('error', `No se pudo generar el PDF: ${e.message}`); } finally { setPdf(false); }
  };
  return (
    <Modal titulo={titulo || 'Vista previa'} ancho="xl" onCerrar={onCerrar} descripcion={estado.archivo ? estado.archivo.nombre : ''} pie={<>
      <Boton onClick={onCerrar}>Cerrar</Boton>
      {Flujos.disponible('docxAPdf') && estado.archivo ? <Boton icono="pdf" cargando={pdf} onClick={aPdf}>PDF</Boton> : null}
      <Boton variante="primario" icono="word" disabled={!estado.archivo} onClick={descargar}>Descargar Word</Boton>
    </>}>
      {estado.cargando ? <Cargando texto="Generando el documento…" /> : null}
      {estado.error ? <Alerta tipo="alerta">No se pudo mostrar la vista previa ({estado.error}). {estado.archivo ? 'Puedes descargar el Word.' : ''}</Alerta> : null}
      <div className="docx-vista mt-2" ref={ref} style={{ display: estado.cargando || estado.error ? 'none' : 'block' }} />
    </Modal>
  );
};
