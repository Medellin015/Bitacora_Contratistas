/* ============================================================================
   11) motor.jsx — motor de formularios (interfaz): capítulos, tipos de pregunta,
       condiciones, calculadas, compuestas, archivos, validación, precarga,
       autoguardado, riel de progreso y barra fija
   Estructura:
     1. Valores por defecto (tokens de porDefecto) y respuestas iniciales
     2. Validación por pregunta y por capítulo
     3. Controles por tipo (texto, número, moneda, porcentaje, fecha, selección,
        sí/no, calculada, archivo, url/teléfono/correo)
     4. Compuesta (tabla en escritorio, tarjetas en móvil)
     5. Pregunta (envoltura con etiqueta, ayuda, error, «Traer del mes anterior»)
     6. MotorFormulario (estado, riel, navegación, autoguardado, enviar)
   ============================================================================ */

/* ===== 1. Valores por defecto ===== */
const resolverPorDefecto = (token, ctx) => {
  if (token === undefined || token === null) return undefined;
  if (typeof token !== 'string') return token;
  const t = token;
  if (t === 'hoy') return U.hoyISO();
  if (t === 'inicioPeriodo') return ctx.periodo ? ctx.periodo.desde : '';
  if (t === 'finPeriodo') return ctx.periodo ? ctx.periodo.hasta : '';
  if (t === 'consecutivo') return ctx.consecutivo != null ? ctx.consecutivo : '';
  if (t.startsWith('usuario.')) { const v = U.obtenerRuta(ctx.usuario || {}, t.slice(8)); return v == null ? '' : v; }
  if (t.startsWith('contrato.')) { const v = U.obtenerRuta(ctx.contrato || {}, t.slice(9)); return v == null ? '' : v; }
  if (t.startsWith('fila.')) { const v = ctx.fila ? ctx.fila[t.slice(5)] : undefined; return v == null ? '' : v; }
  if (t.startsWith('param.')) {
    let v = U.obtenerRuta(ctx.parametros || {}, t.slice(6));
    if (typeof v === 'string') v = v.replace(/<CEDULA>/g, (ctx.usuario && ctx.usuario.cedula) || '');
    return v == null ? '' : v;
  }
  return t; // literal
};
const valorVacioDe = (q) => (q.tipo === 'SELECCION_MULTIPLE' || q.tipo === 'ARCHIVO' ? [] : '');
const filaNueva = (q, ctx, origen) => {
  const fila = {};
  (q.subpreguntas || []).forEach((s) => {
    if (s.tipo === 'CALCULADA' || s.tipo === 'SEPARADOR') return;
    const v = s.porDefecto !== undefined ? resolverPorDefecto(s.porDefecto, { ...ctx, fila: origen || {} }) : undefined;
    fila[s.id] = v !== undefined && v !== null ? v : valorVacioDe(s);
  });
  return fila;
};
// Mezcla respuestas existentes con valores por defecto; filas desde origenFilas se
// reconstruyen (conservando lo editable por número de fila o por posición).
const armarRespuestasIniciales = (formulario, ctx, existentes) => {
  const R = existentes ? U.clonar(existentes) : {};
  (formulario.capitulos || []).forEach((cap) => (cap.preguntas || []).forEach((q) => {
    if (q.tipo === 'SEPARADOR' || q.tipo === 'CALCULADA') return;
    if (q.tipo === 'COMPUESTA') {
      const previas = Array.isArray(R[q.id]) ? R[q.id] : null;
      if (q.origenFilas) {
        const origen = resolverPorDefecto(q.origenFilas, ctx);
        const lista = Array.isArray(origen) ? origen : [];
        R[q.id] = lista.map((o, i) => {
          const base = filaNueva(q, ctx, o);
          const previa = previas ? (o && o.numero != null ? previas.find((f) => String(f.numero) === String(o.numero)) : null) || previas[i] : null;
          if (previa) (q.subpreguntas || []).forEach((s) => { if (!s.soloLectura && s.tipo !== 'CALCULADA' && previa[s.id] !== undefined) base[s.id] = previa[s.id]; });
          return base;
        });
      } else if (!previas) {
        R[q.id] = Array.from({ length: q.minFilas || 0 }).map(() => filaNueva(q, ctx));
      } else {
        // Completa claves faltantes en filas previas (p. ej. subpregunta nueva).
        R[q.id] = previas.map((f) => ({ ...filaNueva(q, ctx), ...f }));
      }
      return;
    }
    const vacio = R[q.id] === undefined || R[q.id] === null || R[q.id] === '';
    if (q.soloLectura && q.porDefecto !== undefined) { R[q.id] = resolverPorDefecto(q.porDefecto, ctx); return; }
    if (vacio) {
      const v = q.porDefecto !== undefined ? resolverPorDefecto(q.porDefecto, ctx) : undefined;
      R[q.id] = v !== undefined && v !== null && v !== '' ? v : valorVacioDe(q);
    }
  }));
  return R;
};

/* ===== 2. Validación ===== */
const estaVacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const validarValor = (q, v) => {
  if (q.tipo === 'CALCULADA' || q.tipo === 'SEPARADOR') return '';
  if (estaVacio(v)) return q.obligatoria ? 'Este campo es obligatorio' : '';
  switch (q.tipo) {
    case 'NUMERO': case 'MONEDA': case 'PORCENTAJE': {
      const n = Number(v);
      if (isNaN(n)) return 'Debe ser un número';
      if (q.min != null && n < q.min) return `El mínimo es ${U.formatoNumero(q.min)}`;
      if (q.max != null && n > q.max) return `El máximo es ${U.formatoNumero(q.max)}`;
      const dec = q.decimales != null ? q.decimales : (q.tipo === 'MONEDA' ? 0 : 2);
      if (dec === 0 && !Number.isInteger(n)) return 'Debe ser un número entero';
      if (dec > 0 && String(n).includes('.') && String(n).split('.')[1].length > dec) return `Máximo ${dec} ${U.plural(dec, 'decimal', 'decimales')}`;
      return '';
    }
    case 'FECHA': return U.esISO(v) ? '' : 'Fecha no válida';
    case 'URL': return U.esURL(v) ? '' : 'Debe empezar por http:// o https://';
    case 'CORREO': return U.esCorreo(v) ? '' : 'Correo no válido';
    case 'TELEFONO': return U.esTelefono(v) ? '' : 'Teléfono no válido';
    case 'SI_NO': return v === 'SI' || v === 'NO' ? '' : 'Elige Sí o No';
    case 'ARCHIVO': {
      const lista = Array.isArray(v) ? v : [];
      if (q.maxArchivos && lista.length > q.maxArchivos) return `Máximo ${q.maxArchivos} ${U.plural(q.maxArchivos, 'archivo', 'archivos')}`;
      return '';
    }
    default: return '';
  }
};

/* ===== 3. Controles por tipo ===== */
const CampoArchivo = ({ q, valor, onCambio, editable, subir, idCampo }) => {
  const app = useApp();
  const [subiendo, setSubiendo] = useState(false);
  const [arrastre, setArrastre] = useState(false);
  const lista = Array.isArray(valor) ? valor : [];
  const maxArchivos = q.maxArchivos || 1;
  const acepta = String(q.acepta || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const procesar = async (archivos) => {
    const nuevos = Array.from(archivos || []);
    if (!nuevos.length) return;
    if (lista.length + nuevos.length > maxArchivos) { app.avisar('alerta', `Máximo ${maxArchivos} ${U.plural(maxArchivos, 'archivo', 'archivos')} en «${q.etiqueta}»`); return; }
    for (const a of nuevos) {
      const ext = U.extension(a.name);
      if (acepta.length && !acepta.includes(ext)) { app.avisar('alerta', `«${a.name}»: extensión no permitida (${acepta.join(', ')})`); continue; }
      if (q.maxMB && a.size > q.maxMB * 1048576) { app.avisar('alerta', `«${a.name}» supera ${q.maxMB} MB`); continue; }
      setSubiendo(true);
      try {
        const r = await subir(a, q);
        onCambio([...(Array.isArray(valor) ? valor : []), { nombre: r.nombre || a.name, url: r.url || '', id: r.id || '', tamano: a.size }]);
        if (r.simulado) app.avisar('info', 'Archivo simulado (modo demostración): no se subió a SharePoint');
      } catch (e) { app.avisar(e.code === 'flujo-sin-url' ? 'alerta' : 'error', `No se pudo subir «${a.name}»: ${e.message}`); }
      finally { setSubiendo(false); }
    }
  };
  return (
    <div>
      {lista.length ? (
        <ul className="grid gap-1 mb-2">
          {lista.map((a, i) => (
            <li key={`${a.nombre}-${i}`} className="flex items-center gap-2 text-sm p-2 rounded-md" style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)' }}>
              <Icono nombre="archivo" className="texto-3" />
              <span className="flex-1 min-w-0 truncate">{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : a.nombre}</span>
              <span className="mono text-xs texto-3">{U.tamanoLegible(a.tamano)}</span>
              {editable ? <button type="button" className="btn btn-fantasma btn-xs btn-icono" aria-label={`Quitar ${a.nombre}`} onClick={() => onCambio(lista.filter((_, j) => j !== i))}><Icono nombre="x" tam={14} /></button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable && lista.length < maxArchivos ? (
        <label className={`zona-soltar block cursor-pointer ${arrastre ? 'activa' : ''}`} onDragOver={(e) => { e.preventDefault(); setArrastre(true); }} onDragLeave={() => setArrastre(false)} onDrop={(e) => { e.preventDefault(); setArrastre(false); procesar(e.dataTransfer.files); }}>
          <input id={idCampo} type="file" className="sr-solo" accept={q.acepta || undefined} multiple={maxArchivos > 1} disabled={subiendo} onChange={(e) => { procesar(e.target.files); e.target.value = ''; }} />
          <div className="flex items-center justify-center gap-2 text-sm">{subiendo ? <><Icono nombre="cargando" className="girando" /> Subiendo…</> : <><Icono nombre="subir" /> Elegir archivo{maxArchivos > 1 ? 's' : ''}</>}</div>
          <div className="text-xs texto-3 mt-1">{acepta.length ? acepta.join(', ') : 'Cualquier tipo'}{q.maxMB ? ` · máx. ${q.maxMB} MB` : ''}{maxArchivos > 1 ? ` · hasta ${maxArchivos}` : ''}</div>
        </label>
      ) : null}
      {!editable && !lista.length ? <span className="texto-3 text-sm">Sin archivos</span> : null}
    </div>
  );
};
const SeleccionMultiple = ({ q, valor, onCambio, editable, invalido, catalogos }) => {
  const opciones = Descargas.opcionesDe(q, catalogos);
  const sel = Array.isArray(valor) ? valor.map(String) : [];
  const [filtro, setFiltro] = useState('');
  const visibles = opciones.filter((o) => !filtro || U.sinTildes(`${o.etiqueta} ${o.grupo || ''}`).toLowerCase().includes(U.sinTildes(filtro).toLowerCase()));
  return (
    <div className="rounded-md p-2" style={{ border: `1px solid var(--${invalido ? 'error' : 'borde-fuerte'})`, background: 'var(--superficie)' }}>
      {opciones.length > 15 ? <Entrada placeholder="Filtrar opciones…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="mb-2" aria-label="Filtrar opciones" /> : null}
      <div className="grid sm:grid-cols-2 gap-1 max-h-72 overflow-auto">
        {visibles.map((o) => (
          <label key={String(o.valor)} className="flex items-start gap-2 text-sm p-1 rounded">
            <input type="checkbox" className="caja mt-0.5" disabled={!editable} checked={sel.includes(String(o.valor))} onChange={(e) => onCambio(e.target.checked ? [...sel, String(o.valor)] : sel.filter((x) => x !== String(o.valor)))} />
            <span>{o.etiqueta}{o.grupo ? <span className="texto-3 text-xs"> · {o.grupo}</span> : null}</span>
          </label>
        ))}
        {!visibles.length ? <span className="texto-3 text-sm p-1">Sin opciones</span> : null}
      </div>
      <div className="text-xs texto-3 mt-1">{sel.length} {U.plural(sel.length, 'seleccionada', 'seleccionadas')}</div>
    </div>
  );
};
const ControlPregunta = ({ q, valor, onCambio, editable, idCampo, invalido, ev, valorCalculado, alerta, catalogos, subir }) => {
  const comun = { id: idCampo, invalido, disabled: !editable, 'aria-invalid': invalido || undefined };
  switch (q.tipo) {
    case 'TEXTO': return <Entrada {...comun} type="text" value={valor == null ? '' : valor} placeholder={q.placeholder || ''} maxLength={q.max || undefined} onChange={(e) => onCambio(e.target.value)} />;
    case 'TEXTO_LARGO': return (
      <div>
        <Area {...comun} value={valor == null ? '' : valor} placeholder={q.placeholder || ''} rows={3} maxLength={q.max || undefined} onChange={(e) => onCambio(e.target.value)} />
        <div className="text-right text-xs texto-3 mono">{String(valor || '').length}{q.max ? ` / ${q.max}` : ''} caracteres</div>
      </div>
    );
    case 'NUMERO': return <Entrada {...comun} type="number" inputMode="decimal" className="mono" value={valor == null ? '' : valor} min={q.min} max={q.max} step={q.decimales ? Math.pow(10, -q.decimales) : 1} placeholder={q.placeholder || ''} onChange={(e) => onCambio(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'MONEDA': return <EntradaMoneda {...comun} valor={valor} onCambio={(n) => onCambio(n == null ? '' : n)} />;
    case 'PORCENTAJE': {
      const pasos = Array.isArray(q.pasos) ? q.pasos : null;
      if (!editable) return <Entrada {...comun} value={valor === '' || valor == null ? '' : `${valor} %`} readOnly />;
      if (!pasos) return <div className="relative"><Entrada {...comun} type="number" inputMode="decimal" className="mono campo-sufijo" value={valor == null ? '' : valor} min={q.min != null ? q.min : 0} max={q.max != null ? q.max : 100} step={q.decimales ? Math.pow(10, -q.decimales) : 1} onChange={(e) => onCambio(e.target.value === '' ? '' : Number(e.target.value))} /><span className="absolute right-3 top-1/2 -translate-y-1/2 texto-3 text-sm">%</span></div>;
      const esPaso = valor !== '' && valor != null && pasos.map(String).includes(String(valor));
      const otro = valor !== '' && valor != null && !esPaso;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado etiqueta={q.etiqueta} valor={esPaso ? valor : (otro ? '__otro' : '')} opciones={[...pasos.map((p) => ({ valor: p, etiqueta: `${p} %` })), { valor: '__otro', etiqueta: 'Otro' }]} onCambio={(v) => onCambio(v === '__otro' ? (esPaso || valor === '' ? 10 : valor) : v)} />
          {otro ? <div className="relative w-28"><Entrada {...comun} type="number" inputMode="decimal" className="mono campo-sufijo" value={valor} min={0} max={100} onChange={(e) => onCambio(e.target.value === '' ? '' : Number(e.target.value))} aria-label={`${q.etiqueta} (otro valor)`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 texto-3 text-sm">%</span></div> : null}
        </div>
      );
    }
    case 'FECHA': return <Entrada {...comun} type="date" className="mono" value={U.esISO(valor) ? valor : ''} min={q.min} max={q.max} onChange={(e) => onCambio(e.target.value)} />;
    case 'SELECCION_UNICA': {
      const opciones = Descargas.opcionesDe(q, catalogos);
      if (opciones.length > 15 || q.origenOpciones) return <Combobox id={idCampo} opciones={opciones} valor={valor} onCambio={onCambio} invalido={invalido} disabled={!editable} placeholder="Buscar…" />;
      return <Selector {...comun} opciones={opciones} value={valor == null ? '' : valor} onChange={(e) => onCambio(e.target.value)} />;
    }
    case 'SELECCION_MULTIPLE': return <SeleccionMultiple q={q} valor={valor} onCambio={onCambio} editable={editable} invalido={invalido} catalogos={catalogos} />;
    case 'SI_NO': return editable
      ? <Segmentado etiqueta={q.etiqueta} valor={valor} opciones={[{ valor: 'SI', etiqueta: 'Sí' }, { valor: 'NO', etiqueta: 'No' }]} onCambio={onCambio} />
      : <Entrada {...comun} value={valor === 'SI' ? 'Sí' : valor === 'NO' ? 'No' : ''} readOnly />;
    case 'CALCULADA': return (
      <div>
        <div className={`campo mono ${alerta ? 'invalido' : ''}`} style={{ background: 'var(--superficie-2)' }} aria-live="polite" id={idCampo}>{Descargas.formatearCalculada(q, valorCalculado) || <span className="texto-3">—</span>}</div>
        {alerta && q.mensajeAlerta ? <div className="error-campo"><Icono nombre="alerta" tam={14} />{q.mensajeAlerta}</div> : null}
      </div>
    );
    case 'ARCHIVO': return <CampoArchivo q={q} valor={valor} onCambio={onCambio} editable={editable} subir={subir} idCampo={idCampo} />;
    case 'URL': return <Entrada {...comun} type="url" inputMode="url" className="mono" value={valor == null ? '' : valor} placeholder={q.placeholder || 'https://'} onChange={(e) => onCambio(e.target.value.trim())} />;
    case 'TELEFONO': return <Entrada {...comun} type="tel" inputMode="tel" className="mono" value={valor == null ? '' : valor} placeholder={q.placeholder || ''} onChange={(e) => onCambio(e.target.value)} />;
    case 'CORREO': return <Entrada {...comun} type="email" inputMode="email" value={valor == null ? '' : valor} placeholder={q.placeholder || ''} onChange={(e) => onCambio(e.target.value.trim())} />;
    default: return <Entrada {...comun} value={valor == null ? '' : String(valor)} onChange={(e) => onCambio(e.target.value)} />;
  }
};

/* ===== 4. Compuesta ===== */
const Compuesta = ({ q, filas, onCambio, editable, ev, errores, idBase, catalogos, subir, ctx, traer }) => {
  const app = useApp();
  const movil = useMedia('(max-width: 767px)');
  const subs = (q.subpreguntas || []);
  const hayTextoLargo = subs.some((s) => s.tipo === 'TEXTO_LARGO' || s.tipo === 'ARCHIVO');
  const comoTabla = !movil && !hayTextoLargo && subs.length <= 9;
  const puedeAgregar = editable && q.permiteAgregarFilas !== false && !q.origenFilas && (!q.maxFilas || filas.length < q.maxFilas);
  const puedeQuitar = editable && q.permiteAgregarFilas !== false && !q.origenFilas && filas.length > (q.minFilas || 0);
  const obtenerFila = (i) => (n) => (n.startsWith('fila.') ? ev.valorFila(q.id, i, n.slice(5)) : ev.valor(n));
  const visibleSub = (s, i) => (s.condicion ? Formulas.evaluarCondicion(s.condicion, obtenerFila(i)) : true);
  const cambiarCelda = (i, subId, v) => onCambio(filas.map((f, j) => (j === i ? { ...f, [subId]: v } : f)));
  const agregar = () => onCambio([...filas, filaNueva(q, ctx)]);
  const quitar = async (i) => { if (await app.confirmar({ titulo: 'Quitar fila', mensaje: `¿Quitar la fila ${i + 1}?`, textoOk: 'Quitar', peligro: true })) onCambio(filas.filter((_, j) => j !== i)); };
  const mover = (i, d) => { const j = i + d; if (j < 0 || j >= filas.length) return; const copia = [...filas]; [copia[i], copia[j]] = [copia[j], copia[i]]; onCambio(copia); };
  const celdaEditable = (s) => editable && !s.soloLectura && s.tipo !== 'CALCULADA';
  const render = (s, i, compacto) => {
    const idCampo = `${idBase}-${i}-${s.id}`;
    const err = errores[`${q.id}.${i}.${s.id}`];
    if (!visibleSub(s, i)) return null;
    return (
      <Campo key={s.id} etiqueta={compacto ? null : s.etiqueta} obligatoria={!compacto && s.obligatoria} id={idCampo} error={err} ayuda={compacto ? null : s.ayuda}>
        <ControlPregunta q={s} valor={filas[i][s.id]} onCambio={(v) => cambiarCelda(i, s.id, v)} editable={celdaEditable(s)} idCampo={idCampo} invalido={!!err}
          ev={ev} valorCalculado={s.tipo === 'CALCULADA' ? ev.valorFila(q.id, i, s.id) : undefined} alerta={s.alertaSi ? ev.alertaFila(q.id, i, s.id) : false} catalogos={catalogos} subir={subir} />
        {traer && s.precargar === 'ultimoEnvio' && celdaEditable(s) ? <button type="button" className="text-xs underline texto-2 mt-1" onClick={() => traer(q.id, i, s.id)}>Traer del mes anterior</button> : null}
      </Campo>
    );
  };
  if (!filas.length) return <div className="panel-suave p-4 text-sm texto-2 flex items-center justify-between gap-2 flex-wrap"><span>{q.origenFilas ? 'No hay filas de origen (revisa la información del contrato).' : 'Sin filas.'}</span>{puedeAgregar ? <Boton tam="sm" icono="mas" onClick={agregar}>Agregar fila</Boton> : null}</div>;
  if (comoTabla) {
    return (
      <div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th style={{ width: 36 }}>#</th>{subs.filter((s) => s.tipo !== 'SEPARADOR').map((s) => <th key={s.id}>{s.etiqueta}{s.obligatoria ? <span className="req">*</span> : null}</th>)}{(puedeQuitar || q.ordenable) ? <th /> : null}</tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td className="mono texto-3">{i + 1}</td>
                  {subs.filter((s) => s.tipo !== 'SEPARADOR').map((s) => <td key={s.id} style={{ minWidth: 130, verticalAlign: 'top' }}>{render(s, i, true)}</td>)}
                  {(puedeQuitar || q.ordenable) ? <td className="text-right whitespace-nowrap">{q.ordenable && editable ? <><Boton variante="fantasma" tam="xs" soloIcono icono="arriba" titulo="Subir" onClick={() => mover(i, -1)} /><Boton variante="fantasma" tam="xs" soloIcono icono="abajo" titulo="Bajar" onClick={() => mover(i, 1)} /></> : null}{puedeQuitar ? <Boton variante="fantasma" tam="xs" soloIcono icono="basura" titulo="Quitar fila" onClick={() => quitar(i)} /> : null}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {puedeAgregar ? <Boton tam="sm" icono="mas" className="mt-2" onClick={agregar}>Agregar fila</Boton> : null}
      </div>
    );
  }
  // Tarjetas: lo de solo lectura va en la cabecera (colapsable si es largo).
  const cabecera = subs.filter((s) => s.soloLectura && s.tipo !== 'CALCULADA');
  const cuerpo = subs.filter((s) => !(s.soloLectura && s.tipo !== 'CALCULADA') && s.tipo !== 'SEPARADOR');
  return (
    <div className="grid gap-3">
      {filas.map((f, i) => <TarjetaFila key={i} indice={i} fila={f} cabecera={cabecera} cuerpo={cuerpo} render={render} q={q} puedeQuitar={puedeQuitar} quitar={quitar} ordenable={q.ordenable && editable} mover={mover} total={filas.length} tieneError={Object.keys(errores).some((k) => k.startsWith(`${q.id}.${i}.`))} />)}
      {puedeAgregar ? <Boton tam="sm" icono="mas" className="justify-self-start" onClick={agregar}>Agregar fila</Boton> : null}
    </div>
  );
};
const TarjetaFila = ({ indice, fila, cabecera, cuerpo, render, q, puedeQuitar, quitar, ordenable, mover, total, tieneError }) => {
  const [abierta, setAbierta] = useState(false);
  const numero = cabecera.find((s) => s.tipo === 'NUMERO');
  const textos = cabecera.filter((s) => s.tipo !== 'NUMERO');
  const titulo = numero ? `${q.id === 'actividades' ? 'Actividad' : 'Fila'} ${fila[numero.id]}` : `Fila ${indice + 1}`;
  return (
    <div className="tarjeta" style={tieneError ? { borderColor: 'var(--error)' } : undefined}>
      <div className="tarjeta-cabecera" style={{ padding: '0.7rem 1rem' }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><strong className="text-sm">{titulo}</strong>{tieneError ? <Chip tipo="error">Revisar</Chip> : null}</div>
          {textos.map((s) => {
            const texto = String(fila[s.id] || '');
            const largo = texto.length > 160;
            return <p key={s.id} className="text-sm texto-2 mt-1 whitespace-pre-wrap" style={!abierta && largo ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}>{texto}</p>;
          })}
          {textos.some((s) => String(fila[s.id] || '').length > 160) ? <button type="button" className="text-xs underline texto-2 mt-1" onClick={() => setAbierta(!abierta)}>{abierta ? 'Ver menos' : 'Ver completa'}</button> : null}
        </div>
        {(puedeQuitar || ordenable) ? <div className="flex gap-1">{ordenable ? <><Boton variante="fantasma" tam="xs" soloIcono icono="arriba" titulo="Subir" disabled={indice === 0} onClick={() => mover(indice, -1)} /><Boton variante="fantasma" tam="xs" soloIcono icono="abajo" titulo="Bajar" disabled={indice === total - 1} onClick={() => mover(indice, 1)} /></> : null}{puedeQuitar ? <Boton variante="fantasma" tam="xs" soloIcono icono="basura" titulo="Quitar fila" onClick={() => quitar(indice)} /> : null}</div> : null}
      </div>
      <div className="tarjeta-cuerpo grid gap-3 md:grid-cols-2">
        {cuerpo.map((s) => <div key={s.id} className={s.tipo === 'TEXTO_LARGO' || s.tipo === 'ARCHIVO' ? 'md:col-span-2' : ''}>{render(s, indice, false)}</div>)}
      </div>
    </div>
  );
};

/* ===== 5. Pregunta ===== */
const Pregunta = ({ q, valor, onCambio, editable, error, ev, catalogos, subir, ctx, traer, idBase, errores, prorratear }) => {
  const idCampo = `${idBase}-${q.id}`;
  if (q.tipo === 'SEPARADOR') return <div className="separador-pregunta" id={`preg-${q.id}`}><h3>{q.etiqueta}</h3>{q.ayuda ? <p className="text-sm texto-2 mt-1">{q.ayuda}</p> : null}</div>;
  const etiquetaSoloLectura = !editable && q.tipo !== 'CALCULADA' && q.tipo !== 'COMPUESTA' && q.tipo !== 'ARCHIVO';
  return (
    <div className="pregunta" id={`preg-${q.id}`}>
      <Campo etiqueta={q.etiqueta} obligatoria={q.obligatoria && editable} id={idCampo} error={error} ayuda={q.ayuda}>
        {q.tipo === 'COMPUESTA'
          ? <Compuesta q={q} filas={Array.isArray(valor) ? valor : []} onCambio={onCambio} editable={editable} ev={ev} errores={errores} idBase={idBase} catalogos={catalogos} subir={subir} ctx={ctx} traer={traer} />
          : <ControlPregunta q={q} valor={valor} onCambio={onCambio} editable={editable} idCampo={idCampo} invalido={!!error} ev={ev} valorCalculado={q.tipo === 'CALCULADA' ? ev.valor(q.id) : undefined} alerta={q.alertaSi ? ev.alerta(q.id) : false} catalogos={catalogos} subir={subir} />}
        {etiquetaSoloLectura && q.soloRevisor ? <div className="ayuda flex items-center gap-1"><Icono nombre="candado" tam={12} /> Lo diligencia el revisor</div> : null}
        {traer && q.precargar === 'ultimoEnvio' && editable && q.tipo !== 'COMPUESTA' ? <button type="button" className="text-xs underline texto-2 mt-1" onClick={() => traer(q.id)}>Traer del mes anterior</button> : null}
        {prorratear && q.prorrateo && editable ? <Boton tam="xs" icono="calendario" className="mt-2" onClick={() => prorratear(q)}>Prorratear por días del período</Boton> : null}
      </Campo>
    </div>
  );
};

/* ===== 6. MotorFormulario ===== */
/**
 * Props:
 *  formulario, ctx { usuario, contrato, parametros, periodo:{desde,hasta}, consecutivo, catalogos }
 *  respuestasIniciales (objeto o null), puedeEditar(q, capitulo) → bool
 *  ultimoEnvio (para «Traer del mes anterior») · subir(archivo, q) → { url, id, nombre }
 *  onGuardar(respuestas, capituloId) (autoguardado, 3 s) · estadoGuardado { fecha, guardando, error }
 *  onEnviar(respuestasFinales) · onVistaPrevia(respuestasFinales) · textoEnviar · soloLectura
 *  capituloInicial
 */
const MotorFormulario = ({ formulario, ctx, respuestasIniciales, puedeEditar, ultimoEnvio, subir, onGuardar, estadoGuardado, onEnviar, onVistaPrevia, textoEnviar = 'Finalizar y enviar', soloLectura, capituloInicial, acciones, onCambioRespuestas }) => {
  const app = useApp();
  const capitulos = useMemo(() => U.ordenarPor(formulario.capitulos || [], (c) => c.orden || 0), [formulario]);
  const [respuestas, setRespuestas] = useState(() => armarRespuestasIniciales(formulario, ctx, respuestasIniciales));
  const [capituloId, setCapituloId] = useState(capituloInicial || (capitulos[0] && capitulos[0].id));
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const ev = useMemo(() => Formulas.crearEvaluador({ formulario, respuestas, parametros: ctx.parametros }), [formulario, respuestas, ctx.parametros]);
  const obtener = useCallback((n) => ev.valor(n), [ev]);
  const visibleQ = (q) => (q.condicion ? Formulas.evaluarCondicion(q.condicion, obtener) : true);
  const capituloVisible = (c) => (c.condicion ? Formulas.evaluarCondicion(c.condicion, obtener) : true);
  const editable = (q, cap) => !soloLectura && q.tipo !== 'CALCULADA' && q.tipo !== 'SEPARADOR' && !q.soloLectura && (puedeEditar ? puedeEditar(q, cap) : true);
  const reloj = useReloj(10000);
  const idBase = `f-${formulario.id}`;

  // Autoguardado con retardo de 3 s (solo si hay algo editable).
  const guardarRef = useRef(onGuardar);
  guardarRef.current = onGuardar;
  const primera = useRef(true);
  useEffect(() => {
    if (onCambioRespuestas) onCambioRespuestas(respuestas);
    if (primera.current) { primera.current = false; return undefined; }
    if (!guardarRef.current || soloLectura) return undefined;
    const t = setTimeout(() => guardarRef.current(respuestas, capituloId), 3000);
    return () => clearTimeout(t);
  }, [respuestas]); // eslint-disable-line

  const cambiar = (id, v) => setRespuestas((r) => ({ ...r, [id]: v }));

  // Validación completa: { 'id' | 'comp.i.sub': mensaje } y conteo por capítulo.
  const errores = useMemo(() => {
    const e = {};
    capitulos.forEach((cap) => {
      if (!capituloVisible(cap)) return;
      (cap.preguntas || []).forEach((q) => {
        if (!visibleQ(q) || !editable(q, cap)) return;
        if (q.tipo === 'COMPUESTA') {
          const filas = Array.isArray(respuestas[q.id]) ? respuestas[q.id] : [];
          if (q.obligatoria && !filas.length) { e[q.id] = 'Agrega al menos una fila'; return; }
          if (q.minFilas && filas.length < q.minFilas) e[q.id] = `Mínimo ${q.minFilas} ${U.plural(q.minFilas, 'fila', 'filas')}`;
          if (q.maxFilas && filas.length > q.maxFilas) e[q.id] = `Máximo ${q.maxFilas} ${U.plural(q.maxFilas, 'fila', 'filas')}`;
          filas.forEach((f, i) => {
            const obtenerFila = (n) => (n.startsWith('fila.') ? ev.valorFila(q.id, i, n.slice(5)) : ev.valor(n));
            (q.subpreguntas || []).forEach((s) => {
              if (s.soloLectura || s.tipo === 'CALCULADA' || s.tipo === 'SEPARADOR') return;
              if (s.condicion && !Formulas.evaluarCondicion(s.condicion, obtenerFila)) return;
              const m = validarValor(s, f[s.id]);
              if (m) e[`${q.id}.${i}.${s.id}`] = m;
            });
          });
          return;
        }
        const m = validarValor(q, respuestas[q.id]);
        if (m) e[q.id] = m;
      });
    });
    return e;
  }, [respuestas, capitulos, ev]); // eslint-disable-line
  const erroresDe = (cap) => Object.keys(errores).filter((k) => (cap.preguntas || []).some((q) => k === q.id || k.startsWith(`${q.id}.`))).length;
  // Avance del capítulo: preguntas visibles (obligatorias o editables); en las
  // compuestas cuentan las subpreguntas obligatorias de cada fila.
  const progresoDe = (cap) => {
    let total = 0, llenas = 0;
    (cap.preguntas || []).filter((q) => visibleQ(q) && q.tipo !== 'SEPARADOR' && q.tipo !== 'CALCULADA' && (q.obligatoria || editable(q, cap))).forEach((q) => {
      if (q.tipo === 'COMPUESTA') {
        const filas = Array.isArray(respuestas[q.id]) ? respuestas[q.id] : [];
        const subs = (q.subpreguntas || []).filter((s) => s.obligatoria && !s.soloLectura && s.tipo !== 'CALCULADA' && s.tipo !== 'SEPARADOR');
        if (!filas.length || !subs.length) { total += 1; if (filas.length) llenas += 1; return; }
        filas.forEach((f, i) => {
          const obtenerFila = (n) => (n.startsWith('fila.') ? ev.valorFila(q.id, i, n.slice(5)) : ev.valor(n));
          subs.forEach((s) => { if (s.condicion && !Formulas.evaluarCondicion(s.condicion, obtenerFila)) return; total += 1; if (!estaVacio(f[s.id])) llenas += 1; });
        });
        return;
      }
      total += 1;
      if (!estaVacio(respuestas[q.id])) llenas += 1;
    });
    return total ? Math.round((llenas / total) * 100) : 100;
  };
  const mostrarErrores = intentoEnvio;

  // Respuestas finales: las ocultas toman valorSiOculta (p. ej. 0 % → «Actividad no ejecutada…»).
  const respuestasFinales = () => {
    const R = U.clonar(respuestas);
    capitulos.forEach((cap) => (cap.preguntas || []).forEach((q) => {
      if (q.tipo === 'SEPARADOR' || q.tipo === 'CALCULADA') return;
      if (!visibleQ(q)) { if (q.valorSiOculta !== undefined) R[q.id] = q.valorSiOculta; return; }
      if (q.tipo === 'COMPUESTA') {
        (Array.isArray(R[q.id]) ? R[q.id] : []).forEach((f, i) => {
          const obtenerFila = (n) => (n.startsWith('fila.') ? ev.valorFila(q.id, i, n.slice(5)) : ev.valor(n));
          (q.subpreguntas || []).forEach((s) => {
            if (s.tipo === 'CALCULADA') return;
            if (s.condicion && !Formulas.evaluarCondicion(s.condicion, obtenerFila) && s.valorSiOculta !== undefined) f[s.id] = s.valorSiOculta;
          });
        });
      }
    }));
    return R;
  };
  const irAPrimerError = () => {
    const primeraClave = Object.keys(errores)[0];
    if (!primeraClave) return;
    const preguntaId = primeraClave.split('.')[0];
    const cap = capitulos.find((c) => (c.preguntas || []).some((q) => q.id === preguntaId));
    if (cap) setCapituloId(cap.id);
    setTimeout(() => { const el = document.getElementById(`preg-${preguntaId}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const campo = el.querySelector('input, textarea, select, button'); if (campo && campo.focus) campo.focus({ preventScroll: true }); } }, 60);
  };
  const enviar = async () => {
    setIntentoEnvio(true);
    if (Object.keys(errores).length) { app.avisar('alerta', `Hay ${Object.keys(errores).length} ${U.plural(Object.keys(errores).length, 'campo por corregir', 'campos por corregir')}`); irAPrimerError(); return; }
    setEnviando(true);
    try { await onEnviar(respuestasFinales()); } finally { setEnviando(false); }
  };
  // «Traer del mes anterior» (solo preguntas marcadas y si el formulario lo permite).
  const traer = (formulario.config && formulario.config.precargarUltimoEnvio && ultimoEnvio && ultimoEnvio.respuestas) ? (id, indice, subId) => {
    const previas = ultimoEnvio.respuestas;
    if (indice === undefined) { if (previas[id] !== undefined) cambiar(id, previas[id]); else app.avisar('info', 'El envío anterior no tiene ese dato'); return; }
    const filasPrev = Array.isArray(previas[id]) ? previas[id] : [];
    const filaActual = (respuestas[id] || [])[indice] || {};
    const prev = (filaActual.numero != null ? filasPrev.find((f) => String(f.numero) === String(filaActual.numero)) : null) || filasPrev[indice];
    if (!prev || prev[subId] === undefined) { app.avisar('info', 'El envío anterior no tiene ese dato'); return; }
    cambiar(id, respuestas[id].map((f, j) => (j === indice ? { ...f, [subId]: prev[subId] } : f)));
  } : null;

  // «Prorratear»: honorarios × días / 30 (o calendario) entre las fechas indicadas en q.prorrateo.
  const prorratear = (q) => {
    const cfg = q.prorrateo || {};
    const honorarios = Formulas.aNumero(resolverPorDefecto(cfg.honorarios || 'contrato.info.contrato.valorMensual', ctx));
    const desde = respuestas[cfg.desde || 'periodoDesde'], hasta = respuestas[cfg.hasta || 'periodoHasta'];
    if (!honorarios) { app.avisar('alerta', 'No hay honorarios mensuales en la información del contrato'); return; }
    if (!U.esISO(desde) || !U.esISO(hasta) || desde > hasta) { app.avisar('alerta', 'Revisa las fechas del período cobrado'); return; }
    const r = U.prorratear(honorarios, desde, hasta, (ctx.parametros && ctx.parametros.convencionDias) || 'comercial30');
    cambiar(q.id, r.valor);
    app.avisar('info', `${r.dias} ${U.plural(r.dias, 'día', 'días')} → ${U.formatoCOP(r.valor)} (honorarios ${U.formatoCOP(honorarios)})`);
  };
  const capActual = capitulos.find((c) => c.id === capituloId) || capitulos[0];
  const indiceCap = capitulos.indexOf(capActual);
  const visiblesCap = capitulos.filter(capituloVisible);
  const textoGuardado = () => {
    if (!estadoGuardado) return '';
    if (estadoGuardado.guardando) return 'Guardando…';
    if (estadoGuardado.error) return `Sin guardar: ${estadoGuardado.error}`;
    if (estadoGuardado.fecha) return `Guardado ${U.tiempoRelativo(estadoGuardado.fecha)}`;
    return 'Sin cambios';
  };
  void reloj;
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr] items-start">
      <nav className="riel" aria-label="Capítulos">
        {visiblesCap.map((c, i) => {
          const errs = mostrarErrores ? erroresDe(c) : 0;
          const p = progresoDe(c);
          return (
            <button type="button" key={c.id} className={`riel-paso ${c.id === capActual.id ? 'activo' : ''} ${errs ? 'con-errores' : ''}`} aria-current={c.id === capActual.id ? 'step' : undefined} onClick={() => setCapituloId(c.id)}>
              <span className="anillo" style={{ '--p': p }}><span>{p === 100 && !errs ? <Icono nombre="check" tam={12} /> : i + 1}</span></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.nombre}</span><span className="block text-xs texto-3">{errs ? `${errs} ${U.plural(errs, 'error', 'errores')}` : `${p} % completo`}</span></span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0">
        <div className="tarjeta">
          <div className="tarjeta-cabecera"><div><div className="text-xs texto-3">Capítulo {indiceCap + 1} de {capitulos.length}</div><h2>{capActual.nombre}</h2></div>{capActual.ayuda ? <span className="text-xs texto-2">{capActual.ayuda}</span> : null}</div>
          <div className="tarjeta-cuerpo">
            {(capActual.preguntas || []).filter(visibleQ).map((q) => (
              <Pregunta key={q.id} q={q} valor={respuestas[q.id]} onCambio={(v) => cambiar(q.id, v)} editable={editable(q, capActual)} error={mostrarErrores ? errores[q.id] : ''} errores={mostrarErrores ? errores : {}}
                ev={ev} catalogos={ctx.catalogos} subir={subir} ctx={ctx} traer={traer} idBase={idBase} prorratear={prorratear} />
            ))}
            {!(capActual.preguntas || []).filter(visibleQ).length ? <p className="texto-3 text-sm">Este capítulo no tiene preguntas visibles.</p> : null}
          </div>
        </div>
        <div className="flex justify-between gap-2 mt-3">
          <Boton icono="izquierda" disabled={indiceCap <= 0} onClick={() => setCapituloId(capitulos[indiceCap - 1].id)}>Anterior</Boton>
          <Boton icono="derecha" disabled={indiceCap >= capitulos.length - 1} onClick={() => setCapituloId(capitulos[indiceCap + 1].id)}>Siguiente</Boton>
        </div>
        {!soloLectura ? (
          <div className="barra-fija">
            <div className="text-xs texto-2 flex items-center gap-2" aria-live="polite"><Icono nombre={estadoGuardado && estadoGuardado.error ? 'alerta' : 'check'} tam={14} /> {textoGuardado()}{mostrarErrores && Object.keys(errores).length ? <button type="button" className="underline" style={{ color: 'var(--error)' }} onClick={irAPrimerError}>{Object.keys(errores).length} {U.plural(Object.keys(errores).length, 'error', 'errores')}</button> : null}</div>
            <div className="flex gap-2 flex-wrap">
              {acciones}
              {onVistaPrevia ? <Boton icono="ojo" onClick={() => onVistaPrevia(respuestasFinales())}>Vista previa</Boton> : null}
              {onEnviar ? <Boton variante="primario" icono="enviar" cargando={enviando} onClick={enviar}>{textoEnviar}</Boton> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
