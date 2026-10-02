'use strict';
/* ============================================================================
   informe-docx.js — Generador del "Informe mensual" en Word (formato ITM – SIF)
   Réplica del modelo "INFORME DE GESTION ITMSIF - <nombre> - No. N <Mes> <Año>.docx"
   usando docx.js 9.x (navegador: <script src="https://cdn.jsdelivr.net/npm/docx@9.8.1/dist/index.iife.js">
   expone window.docx; Node: require('docx')).

   Estructura del archivo:
     1. Constantes del formato (medidas tomadas del .docx modelo)
     2. Utilidades de texto y fechas (es-CO)
     3. Bloques reutilizables (celdas, párrafos, hipervínculos)
     4. Encabezado y pie de página (imágenes flotantes)
     5. Tablas del informe (datos, actividades, dificultades, observaciones,
        firmas, anexos)
     6. API pública (window.InformeDocx): construirInformeDocx(), nombreArchivoInforme(),
        fechaLarga(), textoPeriodo(), encabezadoPie(), bloques(), FORMATO_DEFAULT
   ============================================================================ */
(function (raiz) {

  /* ===== 1. Constantes del formato ===== */
  // Unidades: dxa/twips (1/20 pt) para tablas y márgenes; EMU para imágenes
  // flotantes (914400 EMU = 1 pulgada). docx.js recibe el tamaño de imagen en
  // píxeles a 96 ppp (1 px = 9525 EMU), por eso se convierte.
  const FORMATO_DEFAULT = {
    fuente: 'Arial Narrow',
    tamEtiqueta: 23,            // medios puntos → 11,5 pt (etiquetas en negrilla)
    tamValor: 22,               // 11 pt (valores y textos)
    pagina: { ancho: 12240, alto: 15840 },             // Carta
    margenes: { top: 1702, right: 1701, bottom: 1134, left: 1701, header: 708, footer: 708 },
    tablaPrincipal: { ancho: 10532, sangria: -431, columnas: [3409, 1241, 5882], margenCelda: 70 },
    tablaUnaColumna: { ancho: 9782, sangria: -431 },
    tablaDosColumnas: { ancho: 9209, columnas: [3964, 5245] },
    colorHipervinculo: '0563C1',
    encabezado: { anchoEmu: 7740638, altoEmu: 775992, offsetXEmu: -1264920, offsetYEmu: -282575 },
    pie: { anchoEmu: 7808997, altoEmu: 1317404, offsetYEmu: 477429,
      espaciadorAnchoEmu: 45719, espaciadorAltoEmu: 914375, tabDerecha: 8646, sangriaFrancesa: 1350 },
    firma: { anchoMaxEmu: 2152950, altoMaxEmu: 371527 },
    textoNoEjecutada: 'Actividad no ejecutada durante el período reportado',
    textoVacio: 'NINGUNA',
  };
  const EMU_POR_PX = 9525;
  // PNG 1×1 transparente. El modelo trae en el pie una imagen invisible de
  // 0,05" × 1" en línea: es lo que hace alto el pie y sube el borde inferior
  // del cuerpo para que el texto no se monte sobre la franja ITM/Alcaldía.
  const PNG_TRANSPARENTE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4//8/AwAI/AL+eMSysAAAAABJRU5ErkJggg==';
  const bytesDeBase64 = (b64) => {
    if (typeof atob === 'function') return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /* ===== 2. Utilidades de texto y fechas ===== */
  // Fechas ISO 'AAAA-MM-DD' → partes numéricas sin pasar por Date (evita el
  // desfase de zona horaria UTC-5 que corre el día).
  const partesFecha = (iso) => {
    const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return { a, m, d };
  };
  const fechaLarga = (iso) => {
    const { a, m, d } = partesFecha(iso);
    return `${d} de ${MESES[m - 1]} de ${a}`;
  };
  // "Del 1 de septiembre al 30 de septiembre de 2026"; si cruza de año, ambos años.
  const textoPeriodo = (desdeIso, hastaIso) => {
    const x = partesFecha(desdeIso), y = partesFecha(hastaIso);
    const ini = x.a === y.a ? `${x.d} de ${MESES[x.m - 1]}` : fechaLarga(desdeIso);
    return `Del ${ini} al ${fechaLarga(hastaIso)}`;
  };
  const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Sin redondear: docx.js hace Math.round(px × 9525), así el XML conserva
  // exactamente los EMU del modelo (redondear a px entero los corre unos EMU).
  const pxDeEmu = (emu) => emu / EMU_POR_PX;
  const REGEX_URL = /(https?:\/\/[^\s<>"«»]+)/g;

  /* ===== 3. Bloques reutilizables ===== */
  function crearBloques(D, F) {
    const { Paragraph, TextRun, TableCell, ExternalHyperlink, AlignmentType,
      VerticalAlign, BorderStyle, ShadingType } = D;

    const borde = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const bordes = { top: borde, bottom: borde, left: borde, right: borde };
    const bordesTabla = { ...bordes, insideHorizontal: borde, insideVertical: borde };

    const run = (text, o = {}) => new TextRun({
      text, font: F.fuente, size: o.size || F.tamValor, bold: !!o.bold,
    });

    // Una línea de texto → runs; las URL se vuelven hipervínculos azules subrayados.
    const runsConEnlaces = (linea, o = {}) => {
      const partes = String(linea).split(REGEX_URL).filter((p) => p !== '');
      return partes.map((p) => (/^https?:\/\//.test(p)
        ? new ExternalHyperlink({
          link: p,
          children: [new TextRun({ text: p, font: F.fuente, size: o.size || F.tamValor,
            color: F.colorHipervinculo, underline: {} })],
        })
        : run(p, o)));
    };

    // Texto multilínea → un párrafo por línea (así está en el modelo). Las
    // líneas que son solo una URL van sin justificar, como en el modelo.
    const parrafos = (texto, o = {}) => {
      const lineas = String(texto || '').split(/\r?\n/).filter((l) => l.trim() !== '');
      if (!lineas.length) lineas.push('');
      return lineas.map((l) => new Paragraph({
        alignment: /^\s*https?:\/\/\S+\s*$/.test(l) ? AlignmentType.LEFT : (o.alignment || AlignmentType.LEFT),
        indent: o.indent,
        children: runsConEnlaces(l.trim(), o),
      }));
    };

    const celda = (children, o = {}) => new TableCell({
      children,
      columnSpan: o.columnSpan,
      width: o.width ? { size: o.width, type: D.WidthType.DXA } : undefined,
      verticalAlign: o.verticalAlign === undefined ? VerticalAlign.CENTER : o.verticalAlign,
      borders: bordes,
      shading: o.blanco ? { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' } : undefined,
    });

    return { borde, bordes, bordesTabla, run, runsConEnlaces, parrafos, celda };
  }

  /* ===== 4. Encabezado y pie de página ===== */
  function crearEncabezadoPie(D, F, imagenes) {
    const { Header, Footer, Paragraph, ImageRun, TextRun, HorizontalPositionRelativeFrom,
      VerticalPositionRelativeFrom, HorizontalPositionAlign, TextWrappingType, TabStopType } = D;
    const enc = F.encabezado, pie = F.pie;

    const header = new Header({
      children: [new Paragraph({
        indent: { firstLine: 708 },
        children: imagenes.encabezado ? [new ImageRun({
          type: imagenes.tipoEncabezado || 'jpg',
          data: imagenes.encabezado,
          transformation: { width: pxDeEmu(enc.anchoEmu), height: pxDeEmu(enc.altoEmu) },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, offset: enc.offsetXEmu },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: enc.offsetYEmu },
            allowOverlap: true, behindDocument: false,
            wrap: { type: TextWrappingType.NONE },
          },
        })] : [],
      })],
    });

    // Pie = misma estructura del modelo: imagen flotante detrás del texto,
    // alineada a la derecha de la página y anclada 1,33 cm bajo el párrafo,
    // más un espaciador transparente en línea de 1" de alto (ver PNG_TRANSPARENTE_B64).
    const footer = new Footer({
      children: [
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: pie.tabDerecha }],
          indent: { hanging: pie.sangriaFrancesa },
          children: [
            ...(imagenes.pie ? [new ImageRun({
              type: imagenes.tipoPie || 'jpg',
              data: imagenes.pie,
              transformation: { width: pxDeEmu(pie.anchoEmu), height: pxDeEmu(pie.altoEmu) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.RIGHT },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: pie.offsetYEmu },
                allowOverlap: true, behindDocument: true,
                wrap: { type: TextWrappingType.NONE },
              },
            })] : []),
            new ImageRun({
              type: 'png',
              data: bytesDeBase64(PNG_TRANSPARENTE_B64),
              transformation: { width: pxDeEmu(pie.espaciadorAnchoEmu), height: pxDeEmu(pie.espaciadorAltoEmu) },
            }),
            new TextRun({ children: [new D.Tab(), new D.Tab()] }),
          ],
        }),
        new Paragraph({ children: [] }),
      ],
    });
    return { header, footer };
  }

  /* ===== 5. Tablas del informe ===== */
  function crearTablas(D, F, B, d, imagenes) {
    const { Table, TableRow, Paragraph, ImageRun, WidthType, AlignmentType,
      TableLayoutType, HeightRule } = D;
    const TP = F.tablaPrincipal;
    const [c0, c1, c2] = TP.columnas;
    const fila = (cells, alto) => new TableRow({
      children: cells,
      height: alto ? { value: alto, rule: HeightRule.ATLEAST } : undefined,
    });
    const etiqueta = (t, o = {}) => new Paragraph({ alignment: o.alignment, indent: o.indent,
      children: [B.run(t, { bold: true, size: F.tamEtiqueta })] });

    // 5.1 Tabla principal: título + datos del contrato + actividades
    const filaDato = (lbl, valor, o = {}) => fila([
      B.celda([etiqueta(lbl)], { columnSpan: 2, width: c0 + c1 }),
      B.celda(o.negrilla
        ? [new Paragraph({ alignment: o.alignment, children: [B.run(valor, { bold: true })] })]
        : B.parrafos(valor, { alignment: o.alignment }), { width: c2 }),
    ], o.alto || 355);

    const filasActividades = (d.actividades || []).map((a) => {
      const pct = Number(a.porcentaje) || 0;
      const descripcion = pct === 0 && !String(a.descripcion || '').trim() ? F.textoNoEjecutada : a.descripcion;
      return fila([
        B.celda([new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [
          B.run(`Actividad ${a.numero}. `, { bold: true }), ...B.runsConEnlaces(a.obligacion || ''),
        ] })], { width: c0 }),
        B.celda([new Paragraph({ alignment: AlignmentType.CENTER, children: [B.run(`${pct}%`)] })], { width: c1 }),
        B.celda(B.parrafos(descripcion, { alignment: AlignmentType.JUSTIFIED }), { width: c2 }),
      ], 281);
    });

    const tablaPrincipal = new Table({
      width: { size: TP.ancho, type: WidthType.DXA },
      columnWidths: TP.columnas,
      indent: { size: TP.sangria, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      margins: { left: TP.margenCelda, right: TP.margenCelda },
      borders: B.bordesTabla,
      rows: [
        fila([B.celda([etiqueta(`INFORME MENSUAL No. ${d.numeroInforme}`, { alignment: AlignmentType.CENTER })],
          { columnSpan: 3, width: TP.ancho })], 183),
        filaDato('Fecha de elaboración del informe', fechaLarga(d.fechaElaboracion), { alto: 332 }),
        // Alturas mínimas copiadas del modelo (50 = "lo que pida el texto").
        filaDato('Nombres y apellidos', String(d.contratista.nombreCompleto).toUpperCase(), { negrilla: true, alto: 50 }),
        filaDato('Número del Contrato', d.contrato.numero, { alto: 50 }),
        filaDato('Objeto de contrato', d.contrato.objeto, { alignment: AlignmentType.JUSTIFIED, alto: 558 }),
        filaDato('Componente del proyecto al que pertenece', d.contrato.componente, { alignment: AlignmentType.JUSTIFIED, alto: 277 }),
        filaDato('Equipo o Unidad al que pertenece', d.contrato.equipo),
        filaDato('Período de reporte', textoPeriodo(d.periodo.desde, d.periodo.hasta)),
        filaDato('Supervisor ITM', d.contrato.supervisor),
        fila([
          B.celda([etiqueta('ACTIVIDADES PROGRAMADAS/CONTRACTUALES', { alignment: AlignmentType.CENTER })], { width: c0, blanco: true }),
          B.celda([etiqueta('% EJECUCION', { alignment: AlignmentType.CENTER })], { width: c1, blanco: true }),
          B.celda([etiqueta('DESCRIPCIÓN DE ACTIVIDADES REALIZADAS', { alignment: AlignmentType.CENTER })], { width: c2, blanco: true }),
        ], 300),
        ...filasActividades,
      ],
    });

    // 5.2 Tablas de una columna (dificultades / observaciones)
    const TU = F.tablaUnaColumna;
    const tablaTexto = (titulo, texto) => new Table({
      width: { size: TU.ancho, type: WidthType.DXA },
      columnWidths: [TU.ancho],
      indent: { size: TU.sangria, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: B.bordesTabla,
      rows: [
        fila([B.celda([etiqueta(titulo, { alignment: AlignmentType.CENTER })], { width: TU.ancho, blanco: true, verticalAlign: null })]),
        fila([B.celda(B.parrafos(String(texto || '').trim() || F.textoVacio), { width: TU.ancho, verticalAlign: null })]),
      ],
    });

    // 5.3 Tabla de firmas
    // Mejora frente al modelo: el bloque de firmas no se parte entre páginas
    // (keepNext en cada párrafo + filas que no se dividen).
    const T2 = F.tablaDosColumnas;
    const [k0, k1] = T2.columnas;
    const sangria = { left: -80 };
    const filaFirma = (lbl, contenido, alto) => new TableRow({
      cantSplit: true,
      height: { value: alto, rule: HeightRule.ATLEAST },
      children: [
        B.celda([new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: sangria, keepNext: true,
          children: [B.run(lbl, { bold: true, size: F.tamEtiqueta })] })], { width: k0 }),
        B.celda(contenido, { width: k1 }),
      ],
    });
    const firmaImg = (() => {
      if (!imagenes.firma) return [new Paragraph({ indent: sangria, keepNext: true, children: [] })];
      // Mantiene la proporción dentro del recuadro máximo del modelo.
      const { anchoMaxEmu, altoMaxEmu } = F.firma;
      const ratio = imagenes.firmaAncho && imagenes.firmaAlto ? imagenes.firmaAncho / imagenes.firmaAlto : anchoMaxEmu / altoMaxEmu;
      let w = anchoMaxEmu, h = w / ratio;
      if (h > altoMaxEmu) { h = altoMaxEmu; w = h * ratio; }
      return [new Paragraph({ indent: sangria, keepNext: true, children: [new ImageRun({
        type: imagenes.tipoFirma || 'png', data: imagenes.firma,
        transformation: { width: pxDeEmu(w), height: pxDeEmu(h) },
      })] })];
    })();
    const tablaFirmas = new Table({
      width: { size: T2.ancho, type: WidthType.DXA },
      columnWidths: T2.columnas,
      alignment: AlignmentType.CENTER,
      layout: TableLayoutType.FIXED,
      borders: B.bordesTabla,
      rows: [
        filaFirma('Nombres y apellidos Contratista', [new Paragraph({ indent: sangria, keepNext: true, children: [B.run(String(d.contratista.nombreCompleto).toUpperCase())] })], 351),
        filaFirma('Rol en el proceso', [new Paragraph({ indent: sangria, keepNext: true, alignment: AlignmentType.JUSTIFIED, children: [B.run(d.contratista.rol || '')] })], 408),
        filaFirma('Firma del contratista', firmaImg, 408),
        filaFirma('Nombre y Apellidos del validador', [new Paragraph({ indent: sangria, keepNext: true, children: [B.run(d.contrato.validador || '', { bold: true, size: F.tamEtiqueta })] })], 408),
        // En el modelo la etiqueta Vo.Bo. va entre dos párrafos vacíos: deja
        // la fila alta para la firma manuscrita del validador.
        new TableRow({
          cantSplit: true,
          height: { value: 460, rule: HeightRule.ATLEAST },
          children: [
            B.celda([
              new Paragraph({ indent: sangria, children: [B.run('', { size: F.tamEtiqueta })] }),
              etiqueta('Vo.Bo. VALIDADOR', { alignment: AlignmentType.JUSTIFIED, indent: sangria }),
              new Paragraph({ indent: sangria, children: [B.run('', { size: F.tamEtiqueta })] }),
            ], { width: k0 }),
            B.celda([new Paragraph({ children: d.voBoTexto ? [B.run(d.voBoTexto)] : [] })], { width: k1 }),
          ],
        }),
      ],
    });

    // 5.4 Tabla de anexos
    const filasAnexos = (d.anexos || []).map((x, i) => fila([
      B.celda([new Paragraph({ indent: sangria, children: [B.run(`${i + 1}. ${x.nombre}`)] })], { width: k0 }),
      B.celda([
        new Paragraph({ indent: sangria, children: [B.run(x.ruta || '')] }),
        ...(x.url ? [new Paragraph({ indent: sangria, children: B.runsConEnlaces(x.url) })] : []),
      ], { width: k1 }),
    ], 408));
    const tablaAnexos = new Table({
      width: { size: T2.ancho, type: WidthType.DXA },
      columnWidths: T2.columnas,
      alignment: AlignmentType.CENTER,
      layout: TableLayoutType.FIXED,
      borders: B.bordesTabla,
      rows: [
        fila([
          B.celda([new Paragraph({ indent: sangria, children: [B.run('Anexo', { bold: true })] })], { width: k0 }),
          B.celda([new Paragraph({ indent: sangria, children: [B.run('Ruta', { bold: true })] })], { width: k1 }),
        ], 408),
        ...filasAnexos,
      ],
    });

    return { tablaPrincipal, tablaTexto, tablaFirmas, tablaAnexos };
  }

  /* ===== 6. API pública ===== */
  /**
   * Construye el Document de docx.js con el formato del modelo.
   * @param {object} d  Datos: { numeroInforme, fechaElaboracion:'AAAA-MM-DD',
   *   periodo:{desde,hasta}, contratista:{nombreCompleto, rol},
   *   contrato:{numero, objeto, componente, equipo, supervisor, validador},
   *   actividades:[{numero, obligacion, porcentaje, descripcion}],
   *   dificultades, observaciones, anexos:[{nombre, ruta, url}], voBoTexto? }
   * @param {object} imagenes { encabezado, pie, firma: Uint8Array|ArrayBuffer,
   *   firmaAncho, firmaAlto (px reales de la firma, para conservar proporción) }
   * @param {object} D  Librería docx (window.docx o require('docx'))
   * @param {object} formato  Sobrescrituras opcionales de FORMATO_DEFAULT
   */
  function construirInformeDocx(d, imagenes = {}, D = raiz.docx, formato = {}) {
    if (!D) throw new Error('No se cargó la librería docx.js');
    const F = { ...FORMATO_DEFAULT, ...formato };
    const B = crearBloques(D, F);
    const { header, footer } = crearEncabezadoPie(D, F, imagenes);
    const T = crearTablas(D, F, B, d, imagenes);
    const { Document, Paragraph } = D;
    const espacio = () => new Paragraph({ children: [B.run('', { size: F.tamEtiqueta })] });

    return new Document({
      creator: d.contratista.nombreCompleto,
      title: `Informe mensual No. ${d.numeroInforme}`,
      description: `Informe de ejecución mensual — ${textoPeriodo(d.periodo.desde, d.periodo.hasta)}`,
      styles: {
        default: {
          document: {
            run: { font: F.fuente, size: F.tamValor },
            // lineRule AUTO explícito: sin él LibreOffice lo toma como "exacto"
            // (12 pt fijos) y las líneas quedan más apretadas que en el modelo.
            paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: D.LineRuleType.AUTO } },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            size: { width: F.pagina.ancho, height: F.pagina.alto },
            margin: F.margenes,
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: [
          T.tablaPrincipal,
          espacio(),
          T.tablaTexto('PRINCIPALES DIFICULTADES ENCONTRADAS', d.dificultades),
          espacio(), espacio(),
          T.tablaTexto('PRINCIPALES OBSERVACIONES ENCONTRADAS', d.observaciones),
          espacio(),
          T.tablaFirmas,
          espacio(),
          new Paragraph({ keepNext: true, children: [B.run('Anexos del Informe:', { bold: true })] }),
          T.tablaAnexos,
          new Paragraph({ children: [] }),
        ],
      }],
    });
  }

  // "INFORME DE GESTION ITMSIF - Nombre Apellido - No. 3 Septiembre 2026.docx"
  // mes: número 1–12 (no el nombre). Acepta `sigla` o `siglaArchivo` (nombre en parametros/app).
  const nombreArchivoInforme = ({ sigla, siglaArchivo, nombreCorto, numeroInforme, mes, anio }) => {
    const m = Number(mes);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`Mes inválido para el nombre del archivo: ${mes}`);
    const s = sigla || siglaArchivo || 'ITMSIF';
    return `INFORME DE GESTION ${s} - ${nombreCorto} - No. ${numeroInforme} ${capitalizar(MESES[m - 1])} ${anio}.docx`
      .replace(/[\\/:*?"<>|]/g, '');
  };

  // Piezas reutilizables para otras descargas (cuenta de cobro, genérica) con
  // el mismo encabezado, pie y estilos, sin duplicar medidas.
  const encabezadoPie = (imagenes = {}, D = raiz.docx, formato = {}) =>
    crearEncabezadoPie(D, { ...FORMATO_DEFAULT, ...formato }, imagenes);
  const bloques = (D = raiz.docx, formato = {}) => crearBloques(D, { ...FORMATO_DEFAULT, ...formato });

  const api = { construirInformeDocx, nombreArchivoInforme, fechaLarga, textoPeriodo,
    encabezadoPie, bloques, FORMATO_DEFAULT };
  raiz.InformeDocx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
