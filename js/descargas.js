'use strict';
/* ============================================================================
   7) descargas.js — Word, Excel y vista previa (window.Descargas)
   Estructura:
     1. Imágenes del formato (encabezado, pie, firma del contratista)
     2. Opciones, valores legibles y «foto» del envío
     3. Informe mensual: datosDescarga (§9.3) + generación con InformeDocx
     4. Cuenta de cobro — FORMATO PROVISIONAL (aislado para reemplazarlo)
     5. Descarga genérica (una tabla por capítulo)
     6. Totales del envío (para reportes) y despachador por plantilla
     7. Vista previa (docx-preview) y PDF (flujo opcional)
     8. Excel (xlsx-js-style) con plan B en CSV
   ============================================================================ */
(function (raiz) {
  const U = raiz.U;
  const Formulas = raiz.Formulas;

  /* ===== 1. Imágenes ===== */
  let cacheImagenes = null;
  const imagenesBase = () => {
    if (!cacheImagenes) {
      cacheImagenes = {
        encabezado: U.uint8DeBase64(raiz.IMAGENES_B64.encabezado), tipoEncabezado: 'jpg',
        pie: U.uint8DeBase64(raiz.IMAGENES_B64.pie), tipoPie: 'jpg',
      };
    }
    return cacheImagenes;
  };
  // firma: { pngBase64, ancho, alto } (usuarios/{uid}/privado/firma) o null.
  const imagenesCon = (firma) => {
    const base = imagenesBase();
    if (!firma || !firma.pngBase64) return { ...base };
    try { return { ...base, firma: U.uint8DeBase64(firma.pngBase64), tipoFirma: 'png', firmaAncho: Number(firma.ancho) || 0, firmaAlto: Number(firma.alto) || 0 }; }
    catch (e) { console.warn('Firma inválida, se omite', e); return { ...base }; }
  };

  /* ===== 2. Opciones, valores legibles y foto ===== */
  const opcionesDe = (pregunta, catalogos) => {
    if (Array.isArray(pregunta.opciones)) return pregunta.opciones;
    if (pregunta.origenOpciones) {
      const id = String(pregunta.origenOpciones).replace(/^catalogos\//, '');
      const cat = (catalogos || []).find((c) => c.id === id);
      return cat ? (cat.opciones || []) : [];
    }
    return [];
  };
  const etiquetaOpcion = (pregunta, valor, catalogos) => {
    const op = opcionesDe(pregunta, catalogos).find((o) => String(o.valor) === String(valor));
    return op ? op.etiqueta : (valor == null ? '' : String(valor));
  };
  const formatearCalculada = (q, v) => {
    if (q.formato === 'moneda') return U.formatoCOP(v);
    if (q.formato === 'porcentaje') return U.formatoPorcentaje(v, 2);
    if (typeof v === 'number') return U.formatoNumero(v, Number.isInteger(v) ? 0 : 2);
    return v == null ? '' : String(v);
  };
  const valorLegible = (q, v, catalogos) => {
    if (v === null || v === undefined || v === '') return '';
    switch (q.tipo) {
      case 'MONEDA': return U.formatoCOP(v);
      case 'PORCENTAJE': return U.formatoPorcentaje(v, 2);
      case 'NUMERO': return U.formatoNumero(v, q.decimales || 0);
      case 'FECHA': return U.fechaCorta(v);
      case 'SELECCION_UNICA': return etiquetaOpcion(q, v, catalogos);
      case 'SELECCION_MULTIPLE': return (Array.isArray(v) ? v : [v]).map((x) => etiquetaOpcion(q, x, catalogos)).join(', ');
      case 'SI_NO': return v === 'SI' ? 'Sí' : (v === 'NO' ? 'No' : String(v));
      case 'CALCULADA': return formatearCalculada(q, v);
      case 'ARCHIVO': return (Array.isArray(v) ? v : [v]).map((a) => (a && a.nombre) || '').filter(Boolean).join(', ');
      default: return Array.isArray(v) ? v.join(', ') : String(v);
    }
  };
  const visible = (q, obtener) => (q.condicion ? Formulas.evaluarCondicion(q.condicion, obtener) : true);
  // Foto del envío: etiquetas y valores legibles tal como estaban (§7).
  const armarFoto = (formulario, respuestas, { catalogos, parametros } = {}) => {
    const ev = Formulas.crearEvaluador({ formulario, respuestas, parametros });
    const R = respuestas || {};
    return (formulario.capitulos || []).map((cap) => ({
      id: cap.id,
      capitulo: cap.nombre,
      preguntas: (cap.preguntas || []).filter((q) => q.tipo !== 'SEPARADOR').map((q) => {
        const oculta = !visible(q, (n) => ev.valor(n));
        if (oculta && q.valorSiOculta === undefined) return null;
        const base = { id: q.id, etiqueta: q.etiqueta, tipo: q.tipo, visibleEnDescarga: q.visibleEnDescarga !== false };
        if (q.tipo === 'COMPUESTA') {
          const subs = (q.subpreguntas || []).filter((s) => s.tipo !== 'SEPARADOR');
          const filas = (Array.isArray(R[q.id]) ? R[q.id] : []).map((fila, i) => {
            const obtenerFila = (n) => (n.startsWith('fila.') ? ev.valorFila(q.id, i, n.slice(5)) : ev.valor(n));
            const celdas = {};
            subs.forEach((s) => {
              const ocultaS = !visible(s, obtenerFila);
              const v = ocultaS ? (s.valorSiOculta !== undefined ? s.valorSiOculta : '') : ev.valorFila(q.id, i, s.id);
              celdas[s.id] = valorLegible(s, v, catalogos);
            });
            return celdas;
          });
          return { ...base, columnas: subs.map((s) => ({ id: s.id, etiqueta: s.etiqueta, tipo: s.tipo, visibleEnDescarga: s.visibleEnDescarga !== false })), filas, valorLegible: `${filas.length} ${U.plural(filas.length, 'fila', 'filas')}` };
        }
        const v = oculta ? q.valorSiOculta : ev.valor(q.id);
        const entrada = { ...base, valorLegible: valorLegible(q, v, catalogos) };
        if (q.tipo === 'ARCHIVO') entrada.archivos = (Array.isArray(v) ? v : []).map((a) => ({ nombre: a.nombre || '', url: a.url || '' }));
        return entrada;
      }).filter(Boolean),
    }));
  };
  // Anexos (archivos subidos) de todo el envío → [{ preguntaId, nombre, url, tamano }].
  const recolectarAnexos = (formulario, respuestas) => {
    const lista = [];
    const R = respuestas || {};
    (formulario.capitulos || []).forEach((cap) => (cap.preguntas || []).forEach((q) => {
      if (q.tipo === 'ARCHIVO') (Array.isArray(R[q.id]) ? R[q.id] : []).forEach((a) => lista.push({ preguntaId: q.id, nombre: a.nombre || '', url: a.url || '', tamano: a.tamano || 0 }));
      if (q.tipo === 'COMPUESTA') (q.subpreguntas || []).filter((s) => s.tipo === 'ARCHIVO').forEach((s) => {
        (Array.isArray(R[q.id]) ? R[q.id] : []).forEach((fila, i) => (Array.isArray(fila[s.id]) ? fila[s.id] : []).forEach((a) => lista.push({ preguntaId: `${q.id}[${i}].${s.id}`, nombre: a.nombre || '', url: a.url || '', tamano: a.tamano || 0 })));
      });
    }));
    return lista;
  };

  /* ===== 3. Informe mensual ===== */
  const info = (contrato, cap, campo) => { const v = contrato && contrato.info && contrato.info[cap] && contrato.info[cap][campo]; return v == null ? '' : v; };
  const preguntaInfo = (catalogos, origen) => ({ origenOpciones: origen });
  // Anexos del Word: primero la evidencia de cada actividad ejecutada («Actividad N: …», con la
  // ruta NAS y el enlace o archivo), luego los anexos adicionales. Envíos sin evidencia por
  // actividad (plantilla anterior) dan lo mismo que antes.
  const anexosInforme = (R, rutaNas) => {
    const urlArchivo = (lista) => (Array.isArray(lista) && lista[0] && lista[0].url) || '';
    const nombreArchivo = (lista) => (Array.isArray(lista) && lista[0] && lista[0].nombre) || '';
    const evidencias = (Array.isArray(R.actividades) ? R.actividades : [])
      .map((a, i) => {
        const url = [urlArchivo(a.evidenciaArchivo), String(a.evidenciaUrl || '').trim()].filter(Boolean).join(' ');
        // Sin texto (p. ej. solo espacios) pero con archivo o enlace, la fila no se pierde.
        const texto = String(a.evidencia || '').trim() || (url ? nombreArchivo(a.evidenciaArchivo) || 'Evidencia' : '');
        return { a, texto, url, numero: a.numero != null && a.numero !== '' ? Number(a.numero) : i + 1 };
      })
      .filter(({ a, texto }) => Number(a.porcentaje) !== 0 && texto)
      .map(({ texto, url, numero }) => ({ nombre: `Actividad ${numero}: ${texto}`, ruta: rutaNas, url }));
    return evidencias.concat((Array.isArray(R.anexos) ? R.anexos : []).map((x) => ({
      nombre: x.nombre || '', ruta: x.ruta || rutaNas,
      url: x.url || urlArchivo(x.archivo),
    })));
  };
  // Correspondencia exacta de §9.3. Lo arma el cliente al enviar; el revisor lo regenera y compara.
  const armarDatosInforme = ({ respuestas, contrato, usuario, catalogos, parametros, voBoTexto = '' }) => {
    const R = respuestas || {};
    const rutaNas = info(contrato, 'contratista', 'rutaNas') || String((parametros && parametros.rutaNasPlantilla) || '').replace('<CEDULA>', (usuario && usuario.cedula) || '');
    return {
      numeroInforme: Number(R.numeroInforme) || 0,
      fechaElaboracion: R.fechaElaboracion || U.hoyISO(),
      periodo: { desde: R.periodoDesde || '', hasta: R.periodoHasta || '' },
      contratista: { nombreCompleto: (usuario && usuario.nombreCompleto) || info(contrato, 'contratista', 'nombreCompleto'), rol: info(contrato, 'contratista', 'rolProceso') },
      contrato: {
        numero: info(contrato, 'contrato', 'numero') || (contrato && contrato.numero) || '',
        objeto: info(contrato, 'contrato', 'objeto'),
        componente: etiquetaOpcion(preguntaInfo(catalogos, 'catalogos/componentes'), info(contrato, 'contrato', 'componente'), catalogos),
        equipo: etiquetaOpcion(preguntaInfo(catalogos, 'catalogos/equipos'), info(contrato, 'contrato', 'equipo'), catalogos),
        supervisor: info(contrato, 'supervision', 'supervisor'),
        validador: info(contrato, 'supervision', 'validador'),
      },
      actividades: (Array.isArray(R.actividades) ? R.actividades : []).map((a, i) => ({
        numero: a.numero != null && a.numero !== '' ? Number(a.numero) : i + 1,
        obligacion: a.obligacion || '',
        porcentaje: Number(a.porcentaje) || 0,
        descripcion: Number(a.porcentaje) === 0 && !String(a.descripcion || '').trim() ? '' : String(a.descripcion || ''),
      })),
      dificultades: String(R.dificultades || ''),
      observaciones: String(R.observaciones || ''),
      anexos: anexosInforme(R, rutaNas),
      voBoTexto: voBoTexto || '',
    };
  };
  const nombreInforme = (datos, { usuario, parametros }) => {
    const { a, m } = U.partesISO(datos.periodo.hasta || datos.fechaElaboracion || U.hoyISO());
    return raiz.InformeDocx.nombreArchivoInforme({ sigla: (parametros && parametros.siglaArchivo) || 'ITMSIF', nombreCorto: (usuario && usuario.nombreCorto) || 'Contratista', numeroInforme: datos.numeroInforme, mes: m, anio: a });
  };
  const generarInforme = async (datos, { usuario, parametros, firma }) => {
    const D = raiz.docx;
    const doc = raiz.InformeDocx.construirInformeDocx(datos, imagenesCon(firma), D);
    const blob = await D.Packer.toBlob(doc);
    return { blob, nombre: nombreInforme(datos, { usuario, parametros }) };
  };

  /* ===== 4. Cuenta de cobro — FORMATO PROVISIONAL ===== */
  // No hay modelo oficial todavía: mismo encabezado/pie y estilos del informe.
  // Cuando llegue el modelo, reemplazar SOLO esta sección (armarDatosCuentaCobro + generarCuentaCobro).
  const armarDatosCuentaCobro = ({ respuestas, formulario, contrato, usuario, parametros, catalogos }) => {
    const R = respuestas || {};
    const ev = Formulas.crearEvaluador({ formulario, respuestas: R, parametros });
    const planillas = (Array.isArray(R.planillas) ? R.planillas : []).map((p, i) => ({
      tipoPago: p.tipoPago || '', mes: Number(p.mes) || 0, anio: Number(p.anio) || 0, base: Number(p.base) || 0,
      ibc: U.redondear(ev.valorFila('planillas', i, 'ibc'), 0), salud: U.redondear(ev.valorFila('planillas', i, 'salud'), 0),
      pension: U.redondear(ev.valorFila('planillas', i, 'pension'), 0), arl: U.redondear(ev.valorFila('planillas', i, 'arl'), 0),
      total: U.redondear(ev.valorFila('planillas', i, 'total'), 0),
    }));
    const pagos = (Array.isArray(R.pagos) ? R.pagos : []).map((p) => ({
      numeroPlanilla: p.numeroPlanilla || '', fechaPago: p.fechaPago || '', salud: Number(p.salud) || 0, pension: Number(p.pension) || 0, arl: Number(p.arl) || 0,
      total: (Number(p.salud) || 0) + (Number(p.pension) || 0) + (Number(p.arl) || 0),
    }));
    return {
      formato: 'cuenta_cobro_provisional',
      numero: Number(R.numeroCuenta) || 0,
      fecha: R.fechaCobro || U.hoyISO(),
      ciudad: (parametros && parametros.ciudad) || 'Medellín',
      entidad: (parametros && parametros.nombreEntidad) || 'INSTITUCIÓN UNIVERSITARIA ITM',
      nit: (parametros && parametros.nitEntidad) || '<PENDIENTE>',
      contratista: { nombreCompleto: (usuario && usuario.nombreCompleto) || info(contrato, 'contratista', 'nombreCompleto'), cedula: (usuario && usuario.cedula) || info(contrato, 'contratista', 'cedula'), expedidaEn: info(contrato, 'contratista', 'cedulaExpedidaEn') },
      valor: Number(R.valorCobrar) || 0,
      valorLetras: U.numeroALetras(Number(R.valorCobrar) || 0),
      tipoCuenta: R.tipoCuenta || '',
      periodo: { desde: R.periodoDesde || '', hasta: R.periodoHasta || '' },
      contrato: { numero: info(contrato, 'contrato', 'numero') || (contrato && contrato.numero) || '', objeto: info(contrato, 'contrato', 'objeto') },
      esPensionado: R.esPensionado || 'NO',
      claseRiesgoARL: R.claseRiesgoARL || '',
      planillas, pagos,
      totalObligatorio: U.redondear(ev.valor('totalObligatorio'), 0),
      totalRealizado: U.redondear(ev.valor('totalRealizado'), 0),
      saldo: U.redondear(ev.valor('saldo'), 0),
      declaracion: R.declaraDeducciones || '',
      textoDeclaracion: (parametros && parametros.textoDeclaracion) || '',
      voBoTexto: '',
    };
  };
  const generarCuentaCobro = async (d, { usuario, firma }) => {
    const D = raiz.docx;
    const I = raiz.InformeDocx;
    const F = I.FORMATO_DEFAULT;
    const B = I.bloques(D);
    const { header, footer } = I.encabezadoPie(imagenesCon(firma), D);
    const { Document, Paragraph, Table, TableRow, ImageRun, AlignmentType, WidthType, TableLayoutType, HeightRule } = D;
    const P = (texto, o = {}) => new Paragraph({ alignment: o.alignment || AlignmentType.LEFT, spacing: { after: o.despues || 0 }, children: [B.run(texto, o)] });
    const vacio = () => new Paragraph({ children: [B.run('')] });
    const etiquetaValor = (lbl, valor) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: [B.run(`${lbl} `, { bold: true, size: F.tamEtiqueta }), ...B.runsConEnlaces(valor || '')] });
    const anchos = [1500, 1300, 1200, 1200, 1100, 1300, 1182, 1000];
    const celdaT = (texto, o = {}) => B.celda([new Paragraph({ alignment: o.alignment || AlignmentType.CENTER, children: [B.run(texto, { bold: !!o.bold, size: o.bold ? 20 : 19 })] })], { width: o.width });
    const encabezadoTabla = new TableRow({ tableHeader: true, children: ['Planilla', 'IBC', 'Salud', 'Pensión', 'ARL', 'Total', 'No. planilla', 'Fecha de pago'].map((t, i) => celdaT(t, { bold: true, width: anchos[i] })) });
    const filasT = d.planillas.map((p, i) => {
      const pago = d.pagos[i] || {};
      return new TableRow({ height: { value: 300, rule: HeightRule.ATLEAST }, children: [
        celdaT(`${p.tipoPago === 'VENCIDO' ? 'Mes vencido' : 'Mes actual'} ${String(p.mes).padStart(2, '0')}/${p.anio}`, { width: anchos[0], alignment: AlignmentType.LEFT }),
        celdaT(U.formatoCOP(p.ibc), { width: anchos[1] }), celdaT(U.formatoCOP(p.salud), { width: anchos[2] }), celdaT(U.formatoCOP(p.pension), { width: anchos[3] }),
        celdaT(U.formatoCOP(p.arl), { width: anchos[4] }), celdaT(U.formatoCOP(p.total), { width: anchos[5] }),
        celdaT(pago.numeroPlanilla || '', { width: anchos[6] }), celdaT(pago.fechaPago ? U.fechaCorta(pago.fechaPago) : '', { width: anchos[7] }),
      ] });
    });
    const tablaAportes = new Table({
      width: { size: 9782, type: WidthType.DXA }, columnWidths: anchos, indent: { size: F.tablaUnaColumna.sangria, type: WidthType.DXA },
      layout: TableLayoutType.FIXED, margins: { left: 57, right: 57 }, borders: B.bordesTabla, rows: [encabezadoTabla, ...filasT],
    });
    const img = imagenesCon(firma);
    const firmaParrafo = img.firma ? (() => {
      const ratio = img.firmaAncho && img.firmaAlto ? img.firmaAncho / img.firmaAlto : F.firma.anchoMaxEmu / F.firma.altoMaxEmu;
      let w = F.firma.anchoMaxEmu, h = w / ratio;
      if (h > F.firma.altoMaxEmu) { h = F.firma.altoMaxEmu; w = h * ratio; }
      return new Paragraph({ children: [new ImageRun({ type: 'png', data: img.firma, transformation: { width: w / 9525, height: h / 9525 } })] });
    })() : vacio();
    const doc = new Document({
      creator: raiz.InformeDocx.textoXml(d.contratista.nombreCompleto), title: `Cuenta de cobro No. ${d.numero}`,
      styles: { default: { document: { run: { font: F.fuente, size: F.tamValor }, paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: D.LineRuleType.AUTO } } } } },
      sections: [{
        properties: { page: { size: { width: F.pagina.ancho, height: F.pagina.alto }, margin: F.margenes } },
        headers: { default: header }, footers: { default: footer },
        children: [
          // FORMATO PROVISIONAL
          P(`CUENTA DE COBRO No. ${d.numero}`, { bold: true, size: 26, alignment: AlignmentType.CENTER, despues: 240 }),
          P(`${d.ciudad}, ${U.fechaLarga(d.fecha)}`, { alignment: AlignmentType.RIGHT, despues: 240 }),
          P(d.entidad, { bold: true, size: F.tamEtiqueta }),
          P(`NIT ${d.nit}`, { despues: 120 }),
          P('DEBE A:', { bold: true, size: F.tamEtiqueta }),
          P(String(d.contratista.nombreCompleto || '').toUpperCase(), { bold: true }),
          P(`C.C. ${d.contratista.cedula || ''}${d.contratista.expedidaEn ? ` expedida en ${d.contratista.expedidaEn}` : ''}`, { despues: 160 }),
          etiquetaValor('LA SUMA DE:', `${d.valorLetras} (${U.formatoCOP(d.valor)})`),
          etiquetaValor('POR CONCEPTO DE:', `Honorarios del período ${U.textoPeriodo(d.periodo.desde, d.periodo.hasta).toLowerCase()} del contrato No. ${d.contrato.numero}, cuyo objeto es: ${d.contrato.objeto}`),
          vacio(),
          P('APORTES A SEGURIDAD SOCIAL ACREDITADOS', { bold: true, size: F.tamEtiqueta, despues: 80 }),
          tablaAportes,
          new Paragraph({ spacing: { before: 80 }, children: [B.run('Total obligatorio: ', { bold: true }), B.run(U.formatoCOP(d.totalObligatorio)), B.run('   Total pagado: ', { bold: true }), B.run(U.formatoCOP(d.totalRealizado)), B.run('   Saldo: ', { bold: true }), B.run(U.formatoCOP(d.saldo))] }),
          P(`Pensionado: ${d.esPensionado === 'SI' ? 'Sí' : 'No'} · Clase de riesgo ARL: ${d.claseRiesgoARL || '—'}`, { despues: 200 }),
          ...(d.declaracion === 'SI' ? [P('DECLARACIÓN JURAMENTADA', { bold: true, size: F.tamEtiqueta, despues: 60 }), ...B.parrafos(d.textoDeclaracion || '', { alignment: AlignmentType.JUSTIFIED }), vacio()] : []),
          vacio(), vacio(),
          firmaParrafo,
          P('_______________________________________'),
          P(String(d.contratista.nombreCompleto || '').toUpperCase(), { bold: true }),
          P(`C.C. ${d.contratista.cedula || ''}`),
          ...(d.voBoTexto ? [vacio(), P(d.voBoTexto)] : []),
        ],
      }],
    });
    const blob = await D.Packer.toBlob(doc);
    const { a, m } = U.partesISO(d.periodo.hasta || d.fecha);
    const nombre = U.sanearNombreArchivo(`CUENTA DE COBRO No. ${d.numero} - ${(usuario && usuario.nombreCorto) || 'Contratista'} - ${U.capitalizar(U.MESES[m - 1])} ${a}.docx`);
    return { blob, nombre };
  };

  /* ===== 5. Descarga genérica ===== */
  const generarGenerica = async ({ foto, titulo, subtitulo, firma, nombreArchivo }) => {
    const D = raiz.docx;
    const I = raiz.InformeDocx;
    const F = I.FORMATO_DEFAULT;
    const B = I.bloques(D);
    const { header, footer } = I.encabezadoPie(imagenesCon(firma), D);
    const { Document, Paragraph, Table, TableRow, AlignmentType, WidthType, TableLayoutType } = D;
    const ANCHO = 9782, SANGRIA = F.tablaUnaColumna.sangria;
    const filaDoble = (a, b, negrita) => new TableRow({ children: [
      B.celda([new Paragraph({ children: [B.run(a, { bold: true, size: F.tamEtiqueta })] })], { width: 3400 }),
      B.celda(negrita ? [new Paragraph({ children: [B.run(b, { bold: true })] })] : B.parrafos(b, { alignment: AlignmentType.JUSTIFIED }), { width: ANCHO - 3400 }),
    ] });
    const tabla = (filas, anchos) => new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, indent: { size: SANGRIA, type: WidthType.DXA }, layout: TableLayoutType.FIXED, margins: { left: F.tablaUnaColumna.margenCelda, right: F.tablaUnaColumna.margenCelda }, borders: B.bordesTabla, rows: filas });
    const hijos = [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [B.run(titulo, { bold: true, size: 26 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [B.run(subtitulo || '')] }),
    ];
    (foto || []).forEach((cap) => {
      const preguntas = (cap.preguntas || []).filter((q) => q.visibleEnDescarga !== false);
      if (!preguntas.length) return;
      hijos.push(new Paragraph({ keepNext: true, spacing: { before: 200, after: 80 }, children: [B.run(cap.capitulo, { bold: true, size: F.tamEtiqueta })] }));
      const filas = [];
      preguntas.forEach((q) => {
        if (q.tipo === 'COMPUESTA') {
          const cols = (q.columnas || []).filter((c) => c.visibleEnDescarga !== false);
          filas.push(filaDoble(q.etiqueta, q.valorLegible, false));
          if (cols.length && (q.filas || []).length) {
            hijos.push(tabla(filas.splice(0), [3400, ANCHO - 3400]));
            const n = cols.length, anchoCol = Math.floor(ANCHO / n);
            const anchos = cols.map((_, i) => (i === n - 1 ? ANCHO - anchoCol * (n - 1) : anchoCol));
            const filasComp = [new TableRow({ tableHeader: true, children: cols.map((c, i) => B.celda([new Paragraph({ children: [B.run(c.etiqueta, { bold: true, size: 19 })] })], { width: anchos[i], blanco: true })) })];
            q.filas.forEach((f) => filasComp.push(new TableRow({ children: cols.map((c, i) => B.celda(B.parrafos(f[c.id] || '', { alignment: AlignmentType.LEFT }), { width: anchos[i] })) })));
            hijos.push(tabla(filasComp, anchos));
          }
        } else if (q.tipo === 'ARCHIVO') {
          const texto = (q.archivos || []).map((a) => (a.url ? `${a.nombre}\n${a.url}` : a.nombre)).join('\n') || q.valorLegible || '—';
          filas.push(filaDoble(q.etiqueta, texto, false));
        } else filas.push(filaDoble(q.etiqueta, q.valorLegible || '—', false));
      });
      if (filas.length) hijos.push(tabla(filas, [3400, ANCHO - 3400]));
    });
    const doc = new Document({
      title: I.textoXml(titulo),
      styles: { default: { document: { run: { font: F.fuente, size: F.tamValor }, paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: D.LineRuleType.AUTO } } } } },
      sections: [{ properties: { page: { size: { width: F.pagina.ancho, height: F.pagina.alto }, margin: F.margenes } }, headers: { default: header }, footers: { default: footer }, children: hijos }],
    });
    return { blob: await D.Packer.toBlob(doc), nombre: U.sanearNombreArchivo(nombreArchivo || `${titulo}.docx`) };
  };

  /* ===== 6. Totales y despachador ===== */
  const armarTotales = (formulario, respuestas, { parametros } = {}) => {
    const ev = Formulas.crearEvaluador({ formulario, respuestas, parametros });
    const R = respuestas || {};
    if (formulario.tipo === 'CUENTA_COBRO') {
      const n = (Array.isArray(R.planillas) ? R.planillas : []).length;
      const sumar = (campo) => U.redondear(Array.from({ length: n }).reduce((s, _, i) => s + (Number(ev.valorFila('planillas', i, campo)) || 0), 0), 0);
      return { valorCobrado: Number(R.valorCobrar) || 0, ibc: sumar('ibc'), salud: sumar('salud'), pension: sumar('pension'), arl: sumar('arl'),
        totalObligatorio: U.redondear(ev.valor('totalObligatorio'), 0), totalRealizado: U.redondear(ev.valor('totalRealizado'), 0), saldo: U.redondear(ev.valor('saldo'), 0) };
    }
    if (formulario.tipo === 'INFORME_MENSUAL') {
      const acts = Array.isArray(R.actividades) ? R.actividades : [];
      const prom = acts.length ? acts.reduce((s, a) => s + (Number(a.porcentaje) || 0), 0) / acts.length : 0;
      return { actividades: acts.length, promedioEjecucion: U.redondear(prom, 1), anexos: anexosInforme(R, '').length };
    }
    return {};
  };
  // datosDescarga según la plantilla del formulario (se guarda en el envío al enviar/reenviar).
  const armarDatosDescarga = ({ formulario, respuestas, contrato, usuario, parametros, catalogos, voBoTexto }) => {
    if (formulario.plantillaDescarga === 'informe_itm_sif') return armarDatosInforme({ respuestas, contrato, usuario, catalogos, parametros, voBoTexto });
    if (formulario.plantillaDescarga === 'cuenta_cobro_provisional') return armarDatosCuentaCobro({ respuestas, formulario, contrato, usuario, parametros, catalogos });
    return { formato: 'generica', voBoTexto: voBoTexto || '' };
  };
  const generarDocx = async ({ envio, formulario, contrato, usuario, parametros, firma }) => {
    const plantilla = formulario.plantillaDescarga;
    if (plantilla === 'informe_itm_sif' && envio.datosDescarga && envio.datosDescarga.periodo) return generarInforme(envio.datosDescarga, { usuario, parametros, firma });
    if (plantilla === 'cuenta_cobro_provisional' && envio.datosDescarga && envio.datosDescarga.formato) return generarCuentaCobro(envio.datosDescarga, { usuario, firma });
    const estado = (U.ESTADOS[envio.estado] || {}).etiqueta || envio.estado || '';
    return generarGenerica({
      foto: envio.foto, firma,
      titulo: formulario.nombre,
      subtitulo: `${(contrato && contrato.numero) || envio.contratoId} · ${U.nombrePeriodo(envio.periodo)} · ${estado}${envio.consecutivo ? ` · No. ${envio.consecutivo}` : ''}`,
      nombreArchivo: `${formulario.nombre} - ${(usuario && usuario.nombreCorto) || ''} - ${U.nombrePeriodo(envio.periodo)}.docx`,
    });
  };

  /* ===== 7. Vista previa y PDF ===== */
  const vistaPrevia = async (blob, contenedor) => {
    const DP = raiz.docxPreview;
    if (!DP || typeof DP.renderAsync !== 'function') throw new Error('La vista previa no está disponible (no cargó docx-preview)');
    contenedor.innerHTML = '';
    await DP.renderAsync(blob, contenedor, null, { className: 'docx', inWrapper: true, breakPages: true, renderHeaders: true, renderFooters: true, ignoreWidth: false, ignoreHeight: false, useBase64URL: true });
  };
  const descargarPDF = async ({ blob, nombre }) => {
    const pdf = await raiz.Flujos.docxAPdf({ nombre, blob });
    U.descargarBlob(pdf, nombre.replace(/\.docx$/i, '.pdf'));
  };

  /* ===== 8. Excel ===== */
  // hojas: [{ nombre, columnas: [{ titulo, clave, ancho, formato: 'cop'|'fecha'|'numero'|'porcentaje' }], filas: [objeto] }]
  const exportarExcel = ({ hojas, nombreArchivo }) => {
    const X = raiz.XLSX;
    const nombre = U.sanearNombreArchivo(nombreArchivo || 'exportacion.xlsx');
    if (!X || !X.utils) {
      // Plan B: CSV de la primera hoja.
      const h = hojas[0];
      const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const lineas = [h.columnas.map((c) => esc(c.titulo)).join(';')];
      h.filas.forEach((f) => lineas.push(h.columnas.map((c) => esc(c.formato === 'fecha' ? U.fechaCorta(f[c.clave]) : f[c.clave])).join(';')));
      U.descargarTexto(lineas.join('\n'), nombre.replace(/\.xlsx$/i, '.csv'), 'text/csv;charset=utf-8');
      return 'csv';
    }
    const libro = X.utils.book_new();
    const borde = { style: 'thin', color: { rgb: 'CFC7B8' } };
    hojas.forEach((h) => {
      const aoa = [h.columnas.map((c) => c.titulo)];
      h.filas.forEach((f) => aoa.push(h.columnas.map((c) => {
        const v = f[c.clave];
        if (c.formato === 'fecha') return U.esFecha(v) ? U.fechaHora(v) : (U.esISO(v) ? U.fechaCorta(v) : (v == null ? '' : v));
        if (c.formato === 'cop' || c.formato === 'numero' || c.formato === 'porcentaje') return v == null || v === '' ? '' : Number(v);
        return v == null ? '' : (Array.isArray(v) ? v.join(', ') : v);
      })));
      const hoja = X.utils.aoa_to_sheet(aoa);
      hoja['!cols'] = h.columnas.map((c) => ({ wch: c.ancho || 18 }));
      hoja['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 1), c: h.columnas.length - 1 } }) };
      h.columnas.forEach((c, j) => {
        const cab = hoja[X.utils.encode_cell({ r: 0, c: j })];
        if (cab) cab.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial', sz: 10 }, fill: { patternType: 'solid', fgColor: { rgb: '0E5E6F' } }, alignment: { vertical: 'center', horizontal: 'center', wrapText: true }, border: { top: borde, bottom: borde, left: borde, right: borde } };
        for (let r = 1; r < aoa.length; r++) {
          const celda = hoja[X.utils.encode_cell({ r, c: j })];
          if (!celda) continue;
          celda.s = { font: { name: 'Arial', sz: 10 }, border: { top: borde, bottom: borde, left: borde, right: borde }, alignment: { vertical: 'top', wrapText: c.ajustar !== false && !c.formato } };
          if (c.formato === 'cop') { celda.t = 'n'; celda.z = '"$"#,##0'; }
          if (c.formato === 'numero') { celda.t = 'n'; celda.z = '#,##0.##'; }
          if (c.formato === 'porcentaje') { celda.t = 'n'; celda.z = '0.0" %"'; }
        }
      });
      hoja['!rows'] = [{ hpt: 28 }];
      X.utils.book_append_sheet(libro, hoja, String(h.nombre || 'Hoja').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    });
    X.writeFile(libro, nombre);
    return 'xlsx';
  };
  // Lectura de un Excel (importador): devuelve filas como objetos por nombre de columna.
  const leerExcel = async (archivo) => {
    const X = raiz.XLSX;
    if (!X || !X.read) throw new Error('No cargó la librería de Excel; intenta de nuevo con conexión');
    const buf = await U.leerArchivoArrayBuffer(archivo);
    const libro = X.read(buf, { type: 'array', cellDates: true });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = X.utils.sheet_to_json(hoja, { defval: '', raw: true });
    return { hojas: libro.SheetNames, filas };
  };

  raiz.Descargas = { imagenesBase, imagenesCon, opcionesDe, etiquetaOpcion, valorLegible, formatearCalculada, armarFoto, recolectarAnexos,
    armarDatosInforme, nombreInforme, generarInforme, armarDatosCuentaCobro, generarCuentaCobro, generarGenerica,
    armarTotales, armarDatosDescarga, generarDocx, vistaPrevia, descargarPDF, exportarExcel, leerExcel };
})(window);
