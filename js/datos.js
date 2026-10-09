'use strict';
/* ============================================================================
   4) datos.js — capa de datos: window.DB (única que habla con Firestore),
      window.Auth (sesión) y window.SEMILLAS (formularios, parámetros, catálogos)
   Estructura:
     1. Semillas (formularios del kit, parámetros por defecto, catálogos)
     2. Conversión de fechas (Timestamp ↔ Date; modo demo ↔ JSON)
     3. Adaptador Firestore (compat)
     4. Adaptador demostración (memoria + localStorage, mismas operaciones)
     5. Auth: Firebase y demostración; traducción de errores
     6. DB de alto nivel (parámetros, usuarios, preRegistro, contratos, formularios,
        catálogos, ventanas, borradores, envíos, solicitudes, contadores, notificaciones)
     7. Datos ficticios del modo demostración
   ============================================================================ */
(function (raiz) {
  const U = raiz.U;

  /* ===== 1. Semillas ===== */
  // Copia literal de referencia/formularios-semilla.json (la inserta el ensamblado).
  const KIT = {
    "_comentario": "Semillas de formularios para el motor dinámico (esquema en PROMPT.md §7). Fórmulas: {idPregunta}; {fila.idSub} dentro de COMPUESTA; {compuesta.campo} como lista para suma(); {valor} solo en alertaSi. Funciones: si (perezosa), max, min, redondear, suma, SMMLV, tasaARL, param, enLetras. Tokens de porDefecto: hoy, inicioPeriodo, finPeriodo, consecutivo, usuario.*, contrato.*, contrato.info.*, fila.*, param.*. config.precargarUltimoEnvio solo habilita las preguntas marcadas con precargar. COMPUESTA con filasDe: 'otraCompuesta' tiene una fila por cada fila de esa otra; subpregunta con precargarDe: 'compuesta.campo' (fila equivalente) o 'pregunta' (primer nivel) toma ese valor mientras la persona no lo cambie. INFO_CONTRATO se guarda en contratos/{id}.info.{capituloId}.{preguntaId} (p. ej. info.contrato.numero, info.obligaciones.lista, info.contratista.rutaNas). desdeVersion: N en una pregunta o subpregunta = apareció en la versión base N; al corregir un envío hecho con una versión base anterior no se exige. Sin datos personales: todo lo variable sale del contrato, del usuario o de parametros/app.",
    "formularios": [
      {
        "id": "info_contrato",
        "nombre": "Información del contrato",
        "tipo": "INFO_CONTRATO",
        "version": 1,
        "activo": true,
        "plantillaDescarga": "generica",
        "config": {
          "requiereVentana": false,
          "limiteMensual": null,
          "flujoEstados": [],
          "vistaPrevia": false,
          "precargarUltimoEnvio": false,
          "destino": "contratos/{contratoId}.info"
        },
        "capitulos": [
          {
            "id": "contratista",
            "nombre": "Datos del contratista",
            "orden": 1,
            "preguntas": [
              {
                "id": "nombreCompleto",
                "etiqueta": "Nombres y apellidos",
                "tipo": "TEXTO",
                "obligatoria": true,
                "porDefecto": "usuario.nombreCompleto",
                "soloLectura": true
              },
              {
                "id": "cedula",
                "etiqueta": "Cédula del contratista",
                "tipo": "TEXTO",
                "obligatoria": true,
                "porDefecto": "usuario.cedula",
                "soloLectura": true
              },
              {
                "id": "cedulaExpedidaEn",
                "etiqueta": "Cédula expedida en",
                "tipo": "TEXTO",
                "obligatoria": true
              },
              {
                "id": "direccion",
                "etiqueta": "Dirección del contratista",
                "tipo": "TEXTO_LARGO"
              },
              {
                "id": "telefono",
                "etiqueta": "Teléfono",
                "tipo": "TELEFONO"
              },
              {
                "id": "rolProceso",
                "etiqueta": "Rol en el proceso",
                "tipo": "TEXTO",
                "obligatoria": true,
                "ayuda": "Sale en la tabla de firmas del informe."
              },
              {
                "id": "rutaNas",
                "etiqueta": "Ruta NAS de evidencias",
                "tipo": "TEXTO",
                "ayuda": "Ruta por defecto de los anexos. Se precarga con parametros/app.rutaNasPlantilla reemplazando <CEDULA>.",
                "porDefecto": "param.rutaNasPlantilla"
              }
            ]
          },
          {
            "id": "contrato",
            "nombre": "Datos del contrato",
            "orden": 2,
            "preguntas": [
              {
                "id": "numero",
                "etiqueta": "Número del contrato",
                "tipo": "TEXTO",
                "obligatoria": true,
                "soloRevisor": true,
                "placeholder": "P-00000 DE 2026"
              },
              {
                "id": "objeto",
                "etiqueta": "Objeto del contrato",
                "tipo": "TEXTO_LARGO",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "componente",
                "etiqueta": "Componente del proyecto al que pertenece",
                "tipo": "SELECCION_UNICA",
                "origenOpciones": "catalogos/componentes",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "equipo",
                "etiqueta": "Equipo o Unidad al que pertenece",
                "tipo": "SELECCION_UNICA",
                "origenOpciones": "catalogos/equipos",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "fechaFirma",
                "etiqueta": "Fecha de firma",
                "tipo": "FECHA",
                "soloRevisor": true
              },
              {
                "id": "fechaInicio",
                "etiqueta": "Fecha de inicio",
                "tipo": "FECHA",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "fechaFin",
                "etiqueta": "Fecha de finalización",
                "tipo": "FECHA",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "plazoDias",
                "etiqueta": "Plazo (días)",
                "tipo": "NUMERO",
                "soloRevisor": true
              },
              {
                "id": "valorTotal",
                "etiqueta": "Valor del contrato",
                "tipo": "MONEDA",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "valorMensual",
                "etiqueta": "Honorarios mensuales",
                "tipo": "MONEDA",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "valorEnLetras",
                "etiqueta": "Valor del contrato en letras",
                "tipo": "CALCULADA",
                "formula": "enLetras({valorTotal})",
                "formato": "texto"
              },
              {
                "id": "cdp",
                "etiqueta": "Número de CDP",
                "tipo": "TEXTO",
                "soloRevisor": true
              },
              {
                "id": "rp",
                "etiqueta": "Número de RP",
                "tipo": "TEXTO",
                "soloRevisor": true
              }
            ]
          },
          {
            "id": "obligaciones",
            "nombre": "Obligaciones contractuales",
            "orden": 3,
            "preguntas": [
              {
                "id": "lista",
                "etiqueta": "Actividades programadas/contractuales",
                "tipo": "COMPUESTA",
                "soloRevisor": true,
                "permiteAgregarFilas": true,
                "minFilas": 1,
                "maxFilas": 40,
                "ayuda": "Son las 'Actividad N.' que el informe mensual reporta cada mes, en este orden.",
                "subpreguntas": [
                  {
                    "id": "numero",
                    "etiqueta": "No.",
                    "tipo": "NUMERO",
                    "obligatoria": true
                  },
                  {
                    "id": "texto",
                    "etiqueta": "Obligación / actividad",
                    "tipo": "TEXTO_LARGO",
                    "obligatoria": true
                  }
                ]
              }
            ]
          },
          {
            "id": "supervision",
            "nombre": "Supervisión y validación",
            "orden": 4,
            "preguntas": [
              {
                "id": "supervisor",
                "etiqueta": "Supervisor ITM",
                "tipo": "TEXTO",
                "obligatoria": true,
                "soloRevisor": true
              },
              {
                "id": "validador",
                "etiqueta": "Nombre y apellidos del validador",
                "tipo": "TEXTO",
                "obligatoria": true,
                "soloRevisor": true
              }
            ]
          },
          {
            "id": "modificaciones",
            "nombre": "Modificaciones, garantías y pagos",
            "orden": 5,
            "preguntas": [
              {
                "id": "adiciones",
                "etiqueta": "Adiciones",
                "tipo": "COMPUESTA",
                "soloRevisor": true,
                "permiteAgregarFilas": true,
                "subpreguntas": [
                  {
                    "id": "valor",
                    "etiqueta": "Valor",
                    "tipo": "MONEDA"
                  },
                  {
                    "id": "cdp",
                    "etiqueta": "CDP",
                    "tipo": "TEXTO"
                  },
                  {
                    "id": "rp",
                    "etiqueta": "RP",
                    "tipo": "TEXTO"
                  },
                  {
                    "id": "fecha",
                    "etiqueta": "Fecha",
                    "tipo": "FECHA"
                  }
                ]
              },
              {
                "id": "ampliaciones",
                "etiqueta": "Ampliaciones (prórrogas)",
                "tipo": "COMPUESTA",
                "soloRevisor": true,
                "permiteAgregarFilas": true,
                "subpreguntas": [
                  {
                    "id": "nuevaFechaFin",
                    "etiqueta": "Nueva fecha de finalización",
                    "tipo": "FECHA"
                  },
                  {
                    "id": "justificacion",
                    "etiqueta": "Justificación",
                    "tipo": "TEXTO_LARGO"
                  }
                ]
              },
              {
                "id": "suspensiones",
                "etiqueta": "Suspensiones",
                "tipo": "COMPUESTA",
                "soloRevisor": true,
                "permiteAgregarFilas": true,
                "subpreguntas": [
                  {
                    "id": "desde",
                    "etiqueta": "Desde",
                    "tipo": "FECHA"
                  },
                  {
                    "id": "hasta",
                    "etiqueta": "Hasta",
                    "tipo": "FECHA"
                  },
                  {
                    "id": "motivo",
                    "etiqueta": "Motivo",
                    "tipo": "TEXTO"
                  }
                ]
              },
              {
                "id": "garantias",
                "etiqueta": "Garantías / pólizas",
                "tipo": "COMPUESTA",
                "soloRevisor": true,
                "permiteAgregarFilas": true,
                "subpreguntas": [
                  {
                    "id": "amparo",
                    "etiqueta": "Amparo",
                    "tipo": "TEXTO"
                  },
                  {
                    "id": "desde",
                    "etiqueta": "Desde",
                    "tipo": "FECHA"
                  },
                  {
                    "id": "hasta",
                    "etiqueta": "Hasta",
                    "tipo": "FECHA"
                  },
                  {
                    "id": "valorAsegurado",
                    "etiqueta": "Valor asegurado",
                    "tipo": "MONEDA"
                  }
                ]
              },
              {
                "id": "pagos",
                "etiqueta": "Pagos / facturas",
                "tipo": "COMPUESTA",
                "soloRevisor": true,
                "permiteAgregarFilas": true,
                "subpreguntas": [
                  {
                    "id": "numero",
                    "etiqueta": "No. de factura / cuenta",
                    "tipo": "TEXTO"
                  },
                  {
                    "id": "valor",
                    "etiqueta": "Valor",
                    "tipo": "MONEDA"
                  },
                  {
                    "id": "fecha",
                    "etiqueta": "Fecha",
                    "tipo": "FECHA"
                  }
                ]
              },
              {
                "id": "ejecucionFinanciera",
                "etiqueta": "Ejecución financiera",
                "tipo": "CALCULADA",
                "formula": "suma({pagos.valor})",
                "formato": "moneda"
              },
              {
                "id": "presupuestoRestante",
                "etiqueta": "Presupuesto restante",
                "tipo": "CALCULADA",
                "formula": "{valorTotal} + suma({adiciones.valor}) - {ejecucionFinanciera}",
                "formato": "moneda"
              },
              {
                "id": "pctEjecucion",
                "etiqueta": "% de ejecución financiera",
                "tipo": "CALCULADA",
                "formula": "si({valorTotal} > 0, redondear({ejecucionFinanciera} / ({valorTotal} + suma({adiciones.valor})) * 100, 1), 0)",
                "formato": "porcentaje"
              }
            ]
          }
        ]
      },
      {
        "id": "informe_mensual",
        "nombre": "Informe de ejecución mensual",
        "tipo": "INFORME_MENSUAL",
        "version": 2,
        "novedad": "Cada actividad ejecutada (más de 0 %) pide el nombre de su evidencia (obligatorio) y, si se quiere, un enlace o un archivo; en el Word aparece un anexo por cada una.",
        "activo": true,
        "plantillaDescarga": "informe_itm_sif",
        "config": {
          "requiereVentana": true,
          "limiteMensual": 1,
          "flujoEstados": [
            "contratista",
            "revisor",
            "coordinador"
          ],
          "vistaPrevia": true,
          "precargarUltimoEnvio": true
        },
        "capitulos": [
          {
            "id": "datos",
            "nombre": "Datos del informe",
            "orden": 1,
            "preguntas": [
              {
                "id": "resumenContrato",
                "etiqueta": "Contrato, objeto, componente, equipo y supervisor",
                "tipo": "SEPARADOR",
                "ayuda": "Se toman de Información del contrato (solo lectura). Si algo está mal, se corrige allá o se pide por Solicitudes."
              },
              {
                "id": "numeroInforme",
                "etiqueta": "Número de informe",
                "tipo": "NUMERO",
                "obligatoria": true,
                "porDefecto": "consecutivo",
                "min": 1,
                "editableEnCorreccion": false
              },
              {
                "id": "periodoDesde",
                "etiqueta": "Período de reporte — desde",
                "tipo": "FECHA",
                "obligatoria": true,
                "porDefecto": "inicioPeriodo"
              },
              {
                "id": "periodoHasta",
                "etiqueta": "Período de reporte — hasta",
                "tipo": "FECHA",
                "obligatoria": true,
                "porDefecto": "finPeriodo"
              },
              {
                "id": "fechaElaboracion",
                "etiqueta": "Fecha de elaboración del informe",
                "tipo": "FECHA",
                "obligatoria": true,
                "porDefecto": "finPeriodo"
              }
            ]
          },
          {
            "id": "actividades",
            "nombre": "Actividades del período",
            "orden": 2,
            "preguntas": [
              {
                "id": "actividades",
                "etiqueta": "Actividades programadas/contractuales",
                "tipo": "COMPUESTA",
                "obligatoria": true,
                "origenFilas": "contrato.info.obligaciones.lista",
                "permiteAgregarFilas": false,
                "subpreguntas": [
                  {
                    "id": "numero",
                    "etiqueta": "Actividad",
                    "tipo": "NUMERO",
                    "soloLectura": true,
                    "porDefecto": "fila.numero"
                  },
                  {
                    "id": "obligacion",
                    "etiqueta": "Obligación contractual",
                    "tipo": "TEXTO_LARGO",
                    "soloLectura": true,
                    "porDefecto": "fila.texto"
                  },
                  {
                    "id": "porcentaje",
                    "etiqueta": "% de ejecución",
                    "tipo": "PORCENTAJE",
                    "obligatoria": true,
                    "min": 0,
                    "max": 100,
                    "pasos": [
                      0,
                      25,
                      50,
                      75,
                      100
                    ]
                  },
                  {
                    "id": "descripcion",
                    "etiqueta": "Descripción de actividades realizadas",
                    "tipo": "TEXTO_LARGO",
                    "obligatoria": true,
                    "condicion": {
                      "pregunta": "fila.porcentaje",
                      "operador": "distinto",
                      "valor": 0
                    },
                    "valorSiOculta": "Actividad no ejecutada durante el período reportado",
                    "precargar": "ultimoEnvio",
                    "ayuda": "Una idea por párrafo. Las URL se convierten en hipervínculos en el Word."
                  },
                  {
                    "id": "evidencia",
                    "etiqueta": "Evidencia (nombre del soporte)",
                    "tipo": "TEXTO",
                    "obligatoria": true,
                    "desdeVersion": 2,
                    "condicion": {
                      "pregunta": "fila.porcentaje",
                      "operador": "distinto",
                      "valor": 0
                    },
                    "valorSiOculta": "",
                    "ayuda": "El archivo o soporte que prueba la actividad (p. ej. «Acta de reunión 05/10/2026»). En el Word sale en «Anexos del Informe»."
                  },
                  {
                    "id": "evidenciaUrl",
                    "etiqueta": "Enlace de la evidencia (opcional)",
                    "tipo": "URL",
                    "desdeVersion": 2,
                    "condicion": {
                      "pregunta": "fila.porcentaje",
                      "operador": "distinto",
                      "valor": 0
                    },
                    "valorSiOculta": ""
                  },
                  {
                    "id": "evidenciaArchivo",
                    "etiqueta": "Archivo de la evidencia (opcional)",
                    "tipo": "ARCHIVO",
                    "desdeVersion": 2,
                    "acepta": ".pdf,.docx,.xlsx,.jpg,.jpeg,.png",
                    "maxArchivos": 1,
                    "maxMB": 15,
                    "visibleEnDescarga": false,
                    "condicion": {
                      "pregunta": "fila.porcentaje",
                      "operador": "distinto",
                      "valor": 0
                    },
                    "valorSiOculta": []
                  }
                ]
              }
            ]
          },
          {
            "id": "cierre",
            "nombre": "Dificultades, observaciones y anexos",
            "orden": 3,
            "preguntas": [
              {
                "id": "dificultades",
                "etiqueta": "Principales dificultades encontradas",
                "tipo": "TEXTO_LARGO",
                "porDefecto": "NINGUNA"
              },
              {
                "id": "observaciones",
                "etiqueta": "Principales observaciones encontradas",
                "tipo": "TEXTO_LARGO",
                "porDefecto": "NINGUNA"
              },
              {
                "id": "anexos",
                "etiqueta": "Otros anexos (opcional)",
                "ayuda": "Además de la evidencia de cada actividad ejecutada, que ya sale en «Anexos del Informe».",
                "tipo": "COMPUESTA",
                "permiteAgregarFilas": true,
                "minFilas": 0,
                "maxFilas": 60,
                "ordenable": true,
                "subpreguntas": [
                  {
                    "id": "nombre",
                    "etiqueta": "Anexo (nombre del archivo o evidencia)",
                    "tipo": "TEXTO",
                    "obligatoria": true
                  },
                  {
                    "id": "ruta",
                    "etiqueta": "Ruta",
                    "tipo": "TEXTO",
                    "porDefecto": "contrato.info.contratista.rutaNas"
                  },
                  {
                    "id": "url",
                    "etiqueta": "Enlace (opcional)",
                    "tipo": "URL"
                  },
                  {
                    "id": "archivo",
                    "etiqueta": "Archivo (opcional)",
                    "tipo": "ARCHIVO",
                    "acepta": ".pdf,.docx,.xlsx,.jpg,.jpeg,.png",
                    "maxArchivos": 1,
                    "maxMB": 15,
                    "visibleEnDescarga": false
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "cuenta_cobro",
        "nombre": "Cuenta de cobro y pago de seguridad social",
        "tipo": "CUENTA_COBRO",
        "version": 4,
        "novedad": "Seguridad social en un solo paso: la base de cotización se precarga con el valor a cobrar y el pago con lo obligatorio de cada planilla (si cambias el valor a cobrar, todo se recalcula).",
        "activo": true,
        "plantillaDescarga": "cuenta_cobro_provisional",
        "config": {
          "requiereVentana": true,
          "limiteMensual": 1,
          "flujoEstados": [
            "contratista",
            "revisor"
          ],
          "vistaPrevia": true,
          "precargarUltimoEnvio": true
        },
        "capitulos": [
          {
            "id": "cobro",
            "nombre": "Cuenta de cobro",
            "orden": 1,
            "preguntas": [
              {
                "id": "numeroCuenta",
                "etiqueta": "Número de cuenta de cobro",
                "tipo": "NUMERO",
                "obligatoria": true,
                "porDefecto": "consecutivo"
              },
              {
                "id": "fechaCobro",
                "etiqueta": "Fecha de cobro",
                "tipo": "FECHA",
                "obligatoria": true,
                "porDefecto": "hoy"
              },
              {
                "id": "periodoDesde",
                "etiqueta": "Período cobrado — desde",
                "tipo": "FECHA",
                "obligatoria": true,
                "porDefecto": "inicioPeriodo"
              },
              {
                "id": "periodoHasta",
                "etiqueta": "Período cobrado — hasta",
                "tipo": "FECHA",
                "obligatoria": true,
                "porDefecto": "finPeriodo"
              },
              {
                "id": "tipoCuenta",
                "etiqueta": "Tipo de cuenta de cobro",
                "tipo": "SELECCION_UNICA",
                "obligatoria": true,
                "opciones": [
                  {
                    "valor": "PRIMERA",
                    "etiqueta": "Primera"
                  },
                  {
                    "valor": "REGULAR",
                    "etiqueta": "Regular"
                  },
                  {
                    "valor": "FINAL",
                    "etiqueta": "Final"
                  }
                ]
              },
              {
                "id": "valorCobrar",
                "etiqueta": "Valor a cobrar",
                "tipo": "MONEDA",
                "obligatoria": true,
                "porDefecto": "contrato.info.contrato.valorMensual",
                "ayuda": "Si el período es parcial, usar 'Prorratear' (días/30 × honorarios).",
                "prorrateo": {
                  "honorarios": "contrato.info.contrato.valorMensual",
                  "desde": "periodoDesde",
                  "hasta": "periodoHasta"
                }
              },
              {
                "id": "valorEnLetras",
                "etiqueta": "Valor en letras",
                "tipo": "CALCULADA",
                "formula": "enLetras({valorCobrar})",
                "formato": "texto"
              }
            ]
          },
          {
            "id": "aportes",
            "nombre": "Seguridad social",
            "orden": 2,
            "ayuda": "Aportes obligatorios del período y la planilla que pagaste.",
            "preguntas": [
              {
                "id": "sepAportes",
                "etiqueta": "Aportes obligatorios",
                "tipo": "SEPARADOR",
                "ayuda": "Se calculan con el valor sobre el que cotizas y los porcentajes de Parámetros."
              },
              {
                "id": "esPensionado",
                "etiqueta": "¿Es pensionado?",
                "tipo": "SI_NO",
                "obligatoria": true,
                "precargar": "ultimoEnvio"
              },
              {
                "id": "claseRiesgoARL",
                "etiqueta": "Clase de riesgo ARL",
                "tipo": "SELECCION_UNICA",
                "obligatoria": true,
                "precargar": "ultimoEnvio",
                "opciones": [
                  {
                    "valor": "I",
                    "etiqueta": "I (0,522 %)"
                  },
                  {
                    "valor": "II",
                    "etiqueta": "II (1,044 %)"
                  },
                  {
                    "valor": "III",
                    "etiqueta": "III (2,436 %)"
                  },
                  {
                    "valor": "IV",
                    "etiqueta": "IV (4,350 %)"
                  },
                  {
                    "valor": "V",
                    "etiqueta": "V (6,960 %)"
                  }
                ]
              },
              {
                "id": "planillas",
                "etiqueta": "Planillas que se acreditan",
                "tipo": "COMPUESTA",
                "obligatoria": true,
                "ayuda": "El valor sobre el que cotiza se precarga con el valor a cobrar y lo sigue si lo cambias. Si lo escribes a mano, queda fijo; «Usar el valor a cobrar» lo vuelve a enlazar.",
                "permiteAgregarFilas": true,
                "minFilas": 1,
                "maxFilas": 3,
                "subpreguntas": [
                  {
                    "id": "tipoPago",
                    "etiqueta": "Tipo de pago",
                    "tipo": "SELECCION_UNICA",
                    "obligatoria": true,
                    "opciones": [
                      {
                        "valor": "VENCIDO",
                        "etiqueta": "Mes vencido"
                      },
                      {
                        "valor": "ACTUAL",
                        "etiqueta": "Mes actual"
                      }
                    ]
                  },
                  {
                    "id": "mes",
                    "etiqueta": "Mes de la planilla",
                    "tipo": "NUMERO",
                    "obligatoria": true,
                    "min": 1,
                    "max": 12
                  },
                  {
                    "id": "anio",
                    "etiqueta": "Año de la planilla",
                    "tipo": "NUMERO",
                    "obligatoria": true,
                    "min": 2020,
                    "max": 2100
                  },
                  {
                    "id": "base",
                    "etiqueta": "Valor sobre el que cotiza",
                    "tipo": "MONEDA",
                    "obligatoria": true,
                    "precargarDe": "valorCobrar",
                    "textoPrecarga": "Usar el valor a cobrar"
                  },
                  {
                    "id": "ibc",
                    "etiqueta": "IBC",
                    "tipo": "CALCULADA",
                    "formato": "moneda",
                    "formula": "min(max({fila.base} * param('porcentajeIBC'), SMMLV({fila.anio})), param('topeIBCenSMMLV') * SMMLV({fila.anio}))"
                  },
                  {
                    "id": "salud",
                    "etiqueta": "Salud obligatoria",
                    "tipo": "CALCULADA",
                    "formato": "moneda",
                    "formula": "{fila.ibc} * param('pctSalud')"
                  },
                  {
                    "id": "pension",
                    "etiqueta": "Pensión obligatoria",
                    "tipo": "CALCULADA",
                    "formato": "moneda",
                    "formula": "si({esPensionado} == 'SI', 0, {fila.ibc} * param('pctPension'))"
                  },
                  {
                    "id": "arl",
                    "etiqueta": "ARL obligatoria",
                    "tipo": "CALCULADA",
                    "formato": "moneda",
                    "formula": "{fila.ibc} * tasaARL({claseRiesgoARL})"
                  },
                  {
                    "id": "total",
                    "etiqueta": "Total obligatorio",
                    "tipo": "CALCULADA",
                    "formato": "moneda",
                    "formula": "{fila.salud} + {fila.pension} + {fila.arl}"
                  }
                ]
              },
              {
                "id": "totalObligatorio",
                "etiqueta": "Total pago obligatorio",
                "tipo": "CALCULADA",
                "formato": "moneda",
                "formula": "suma({planillas.total})"
              },
              {
                "id": "sepPago",
                "etiqueta": "Pago realizado",
                "tipo": "SEPARADOR",
                "ayuda": "Datos de la planilla que pagaste y su PDF."
              },
              {
                "id": "pagos",
                "etiqueta": "Planillas pagadas",
                "tipo": "COMPUESTA",
                "obligatoria": true,
                "ayuda": "Una por cada planilla de arriba. Salud, pensión y ARL se precargan con lo obligatorio y lo siguen; si tu planilla dice otro valor, escríbelo («Usar lo obligatorio» lo vuelve a enlazar).",
                "filasDe": "planillas",
                "etiquetaFila": "Planilla",
                "permiteAgregarFilas": false,
                "minFilas": 1,
                "maxFilas": 3,
                "subpreguntas": [
                  {
                    "id": "numeroPlanilla",
                    "etiqueta": "Número de planilla",
                    "tipo": "TEXTO",
                    "obligatoria": true
                  },
                  {
                    "id": "fechaPago",
                    "etiqueta": "Fecha de pago de la planilla",
                    "tipo": "FECHA",
                    "obligatoria": true
                  },
                  {
                    "id": "salud",
                    "etiqueta": "Pago de salud realizado",
                    "tipo": "MONEDA",
                    "obligatoria": true,
                    "precargarDe": "planillas.salud",
                    "textoPrecarga": "Usar lo obligatorio"
                  },
                  {
                    "id": "pension",
                    "etiqueta": "Pago de pensión realizado",
                    "tipo": "MONEDA",
                    "obligatoria": true,
                    "precargarDe": "planillas.pension",
                    "textoPrecarga": "Usar lo obligatorio"
                  },
                  {
                    "id": "arl",
                    "etiqueta": "Pago de ARL realizado",
                    "tipo": "MONEDA",
                    "obligatoria": true,
                    "precargarDe": "planillas.arl",
                    "textoPrecarga": "Usar lo obligatorio"
                  },
                  {
                    "id": "soporte",
                    "etiqueta": "Planilla (PDF)",
                    "tipo": "ARCHIVO",
                    "obligatoria": true,
                    "acepta": ".pdf",
                    "maxArchivos": 1,
                    "maxMB": 10
                  }
                ]
              },
              {
                "id": "totalRealizado",
                "etiqueta": "Total pago realizado",
                "tipo": "CALCULADA",
                "formato": "moneda",
                "formula": "suma({pagos.salud}) + suma({pagos.pension}) + suma({pagos.arl})"
              },
              {
                "id": "saldo",
                "etiqueta": "Saldo (ajustar si es negativo)",
                "tipo": "CALCULADA",
                "formato": "moneda",
                "formula": "{totalRealizado} - {totalObligatorio}",
                "alertaSi": "{valor} < -param('toleranciaSaldo')",
                "mensajeAlerta": "El pago realizado no cubre el obligatorio: ajustar la planilla."
              }
            ]
          },
          {
            "id": "declaracion",
            "nombre": "Declaración juramentada",
            "orden": 3,
            "preguntas": [
              {
                "id": "declaraDeducciones",
                "etiqueta": "Declaro bajo la gravedad de juramento que tomaré los costos o deducciones asociados a las rentas de trabajo (texto exacto configurable en parametros/app.textoDeclaracion)",
                "tipo": "SI_NO",
                "obligatoria": true
              }
            ]
          },
          {
            "id": "anexos",
            "nombre": "Anexos",
            "orden": 4,
            "preguntas": [
              {
                "id": "oficioDependientes",
                "etiqueta": "Oficio de dependientes (PDF)",
                "tipo": "ARCHIVO",
                "acepta": ".pdf",
                "maxArchivos": 1,
                "maxMB": 10
              },
              {
                "id": "certificadoContador",
                "etiqueta": "Certificado de contador (PDF)",
                "tipo": "ARCHIVO",
                "acepta": ".pdf",
                "maxArchivos": 1,
                "maxMB": 10
              },
              {
                "id": "adicionales",
                "etiqueta": "Anexos adicionales (PDF)",
                "tipo": "ARCHIVO",
                "acepta": ".pdf",
                "maxArchivos": 5,
                "maxMB": 10
              }
            ]
          }
        ]
      }
    ],
    "parametrosDefault": {
      "_comentario": "Va a parametros/app. Valores de la plataforma de referencia; confirmarlos con la entidad cada año.",
      "smmlv": {
        "2025": 1423500,
        "2026": 1750905
      },
      "porcentajeIBC": 0.4,
      "topeIBCenSMMLV": 25,
      "pctSalud": 0.125,
      "pctPension": 0.16,
      "pctARL_I": 0.00522,
      "pctARL_II": 0.01044,
      "pctARL_III": 0.02436,
      "pctARL_IV": 0.0435,
      "pctARL_V": 0.0696,
      "toleranciaSaldo": 1000,
      "siglaArchivo": "ITMSIF",
      "zonaHoraria": "America/Bogota",
      "rutaNasPlantilla": "<RUTA_NAS>\\<CEDULA>",
      "convencionDias": "comercial30"
    }
  };
  const FORMULARIOS_SEMILLA = KIT.formularios;
  const PARAMETROS_DEFAULT = {
    nombreApp: 'Bitácora Contratistas',
    nombreEntidad: 'INSTITUCIÓN UNIVERSITARIA ITM',
    nombreDependencia: 'Secretaría de Infraestructura Física',
    ciudad: 'Medellín',
    nitEntidad: '<PENDIENTE>',
    marca: { logoUrl: '' },
    ...KIT.parametrosDefault,
    textoDeclaracion: 'Declaro bajo la gravedad de juramento que <PENDIENTE: texto de la declaración sobre costos y deducciones asociados a las rentas de trabajo>.',
    voBoDigitalEnWord: false,
    flujos: { subirArchivo: '', notificar: '', docxAPdf: '' },
    correo: {
      remitente: '',
      plantillas: {
        envio:       { asunto: 'Nuevo envío: {{formulario}} · {{contrato}} · {{periodo}}', cuerpo: 'Hola {{nombre}},\n\nEl contratista envió {{formulario}} del contrato {{contrato}} para el período {{periodo}}.\n\nRevísalo en {{enlace}}' },
        aprobacion:  { asunto: 'Aprobado: {{formulario}} · {{contrato}} · {{periodo}}', cuerpo: 'Hola {{nombre}},\n\nTu {{formulario}} del contrato {{contrato}} ({{periodo}}) fue aprobado.\n\n{{enlace}}' },
        devolucion:  { asunto: 'Corrección solicitada: {{formulario}} · {{contrato}} · {{periodo}}', cuerpo: 'Hola {{nombre}},\n\nTu {{formulario}} del contrato {{contrato}} ({{periodo}}) fue devuelto para corrección. Plazo: {{fechaLimite}}.\n\nCorrígelo en {{enlace}}' },
        solicitud:   { asunto: 'Solicitud {{tipo}}: {{contrato}}', cuerpo: 'Hola {{nombre}},\n\nHay novedades en la solicitud del contrato {{contrato}}.\n\n{{enlace}}' },
        recordatorio:{ asunto: 'Recordatorio: la ventana de {{periodo}} cierra pronto', cuerpo: 'Hola {{nombre}},\n\nLa ventana para diligenciar {{formulario}} del período {{periodo}} cierra el {{fechaLimite}}.\n\n{{enlace}}' },
      },
    },
  };
  delete PARAMETROS_DEFAULT._comentario;
  const CATALOGOS_SEMILLA = {
    componentes: { nombre: 'Componentes del proyecto', opciones: [
      { valor: 'COMP-1', etiqueta: '1. COMPONENTE <PENDIENTE>', grupo: '' },
      { valor: 'COMP-2', etiqueta: '2. COMPONENTE <PENDIENTE>', grupo: '' },
    ] },
    equipos: { nombre: 'Equipos o unidades', opciones: [
      { valor: 'EQ-1', etiqueta: 'Equipo <PENDIENTE>', grupo: '' },
    ] },
  };

  /* ===== 2. Conversión de fechas ===== */
  const esTimestamp = (v) => v && typeof v === 'object' && typeof v.toDate === 'function' && typeof v.seconds === 'number';
  // Lectura desde Firestore: Timestamp → Date en todo el documento.
  const desdeFirestore = (v) => {
    if (esTimestamp(v)) return v.toDate();
    if (Array.isArray(v)) return v.map(desdeFirestore);
    if (v && typeof v === 'object' && !U.esFecha(v)) { const r = {}; Object.keys(v).forEach((k) => { r[k] = desdeFirestore(v[k]); }); return r; }
    return v;
  };
  // Modo demo: Date ↔ { __fecha: ISO } para sobrevivir a JSON.
  const aJSONDemo = (v) => {
    if (U.esFecha(v)) return { __fecha: v.toISOString() };
    if (Array.isArray(v)) return v.map(aJSONDemo);
    if (v && typeof v === 'object') { const r = {}; Object.keys(v).forEach((k) => { if (v[k] !== undefined) r[k] = aJSONDemo(v[k]); }); return r; }
    return v;
  };
  const deJSONDemo = (v) => {
    if (v && typeof v === 'object' && typeof v.__fecha === 'string' && Object.keys(v).length === 1) return new Date(v.__fecha);
    if (Array.isArray(v)) return v.map(deJSONDemo);
    if (v && typeof v === 'object') { const r = {}; Object.keys(v).forEach((k) => { r[k] = deJSONDemo(v[k]); }); return r; }
    return v;
  };
  const clonarConFechas = (v) => deJSONDemo(JSON.parse(JSON.stringify(aJSONDemo(v))));

  /* ===== 3. Adaptador Firestore ===== */
  const crearAdaptadorFirestore = (db) => {
    const ref = (col, id) => db.collection(col).doc(id);
    const refSub = (col, id, sub, subId) => (subId ? ref(col, id).collection(sub).doc(subId) : ref(col, id).collection(sub));
    const leerDoc = (snap) => (snap.exists ? { id: snap.id, ...desdeFirestore(snap.data()) } : null);
    const aplicarQuery = (q, { where = [], orderBy = null, limit = null } = {}) => {
      where.forEach(([c, op, v]) => { q = q.where(c, op, v); });
      if (orderBy) q = q.orderBy(orderBy[0], orderBy[1] || 'asc');
      if (limit) q = q.limit(limit);
      return q;
    };
    return {
      nombre: 'firestore',
      get: async (col, id) => leerDoc(await ref(col, id).get()),
      set: (col, id, datos) => ref(col, id).set(U.sinIndefinidos(datos)),
      // Crear = set; si el documento existe las reglas lo tratan como update y lo niegan.
      crear: (col, id, datos) => ref(col, id).set(U.sinIndefinidos(datos)),
      update: (col, id, parcial) => ref(col, id).update(U.sinIndefinidos(parcial)),
      add: async (col, datos) => (await db.collection(col).add(U.sinIndefinidos(datos))).id,
      delete: (col, id) => ref(col, id).delete(),
      query: async (col, opciones) => (await aplicarQuery(db.collection(col), opciones).get()).docs.map(leerDoc),
      subGet: async (col, id, sub, subId) => leerDoc(await refSub(col, id, sub, subId).get()),
      subSet: (col, id, sub, subId, datos) => refSub(col, id, sub, subId).set(U.sinIndefinidos(datos)),
      subAdd: async (col, id, sub, datos) => (await refSub(col, id, sub).add(U.sinIndefinidos(datos))).id,
      subQuery: async (col, id, sub, opciones) => (await aplicarQuery(refSub(col, id, sub), opciones).get()).docs.map(leerDoc),
      transaccion: (fn) => db.runTransaction((tx) => fn({
        get: async (col, id) => leerDoc(await tx.get(ref(col, id))),
        set: (col, id, datos) => tx.set(ref(col, id), U.sinIndefinidos(datos)),
        update: (col, id, datos) => tx.update(ref(col, id), U.sinIndefinidos(datos)),
      })),
    };
  };

  /* ===== 4. Adaptador demostración ===== */
  const CLAVE_DEMO = 'bitacora.demo.datos.v1';
  const crearAdaptadorDemo = () => {
    let datos = { colecciones: {}, sub: {} };
    const cargar = () => {
      try { const t = localStorage.getItem(CLAVE_DEMO); if (t) datos = deJSONDemo(JSON.parse(t)); } catch (e) { console.warn('Demo: no se pudo leer localStorage', e); }
    };
    const guardar = () => {
      try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(aJSONDemo(datos))); } catch (e) { console.warn('Demo: no se pudo guardar en localStorage', e); }
    };
    cargar();
    const col = (c) => (datos.colecciones[c] = datos.colecciones[c] || {});
    const subcol = (c, id, s) => { const k = `${c}/${id}/${s}`; return (datos.sub[k] = datos.sub[k] || {}); };
    const conId = (id, d) => (d ? { id, ...clonarConFechas(d) } : null);
    const errorDemo = (codigo, mensaje) => { const e = new Error(mensaje); e.code = codigo; return e; };
    const valorComparable = (v) => (U.esFecha(v) ? v.getTime() : v);
    const cumple = (doc, [campo, op, valor]) => {
      const v = U.obtenerRuta(doc, campo);
      switch (op) {
        case '==': return valorComparable(v) === valorComparable(valor);
        case '!=': return valorComparable(v) !== valorComparable(valor);
        case 'array-contains': return Array.isArray(v) && v.includes(valor);
        case 'array-contains-any': return Array.isArray(v) && v.some((x) => valor.includes(x));
        case 'in': return valor.includes(v);
        case '<': return valorComparable(v) < valorComparable(valor);
        case '<=': return valorComparable(v) <= valorComparable(valor);
        case '>': return valorComparable(v) > valorComparable(valor);
        case '>=': return valorComparable(v) >= valorComparable(valor);
        default: return true;
      }
    };
    const consultar = (mapa, { where = [], orderBy = null, limit = null } = {}) => {
      let r = Object.keys(mapa).map((id) => conId(id, mapa[id])).filter((d) => where.every((w) => cumple(d, w)));
      if (orderBy) r = U.ordenarPor(r, (d) => valorComparable(U.obtenerRuta(d, orderBy[0])), orderBy[1] || 'asc');
      if (limit) r = r.slice(0, limit);
      return r;
    };
    const aplicarParcial = (doc, parcial) => {
      Object.keys(parcial).forEach((k) => {
        if (k.includes('.')) U.ponerRuta(doc, k, clonarConFechas(parcial[k]));
        else doc[k] = clonarConFechas(parcial[k]);
      });
    };
    const sinId = (d) => { const r = { ...d }; delete r.id; return r; };
    const ad = {
      nombre: 'demo',
      get: async (c, id) => conId(id, col(c)[id]),
      set: async (c, id, d) => { col(c)[id] = clonarConFechas(sinId(d)); guardar(); },
      crear: async (c, id, d) => { if (col(c)[id]) throw errorDemo('permission-denied', 'Ya existe un registro con ese identificador'); col(c)[id] = clonarConFechas(sinId(d)); guardar(); },
      update: async (c, id, parcial) => { const doc = col(c)[id]; if (!doc) throw errorDemo('not-found', 'El registro no existe'); aplicarParcial(doc, parcial); guardar(); },
      add: async (c, d) => { const id = U.idAleatorio(); col(c)[id] = clonarConFechas(sinId(d)); guardar(); return id; },
      delete: async (c, id) => { delete col(c)[id]; guardar(); },
      query: async (c, opciones) => consultar(col(c), opciones),
      subGet: async (c, id, s, subId) => conId(subId, subcol(c, id, s)[subId]),
      subSet: async (c, id, s, subId, d) => { subcol(c, id, s)[subId] = clonarConFechas(sinId(d)); guardar(); },
      subAdd: async (c, id, s, d) => { const subId = U.idAleatorio(); subcol(c, id, s)[subId] = clonarConFechas(sinId(d)); guardar(); return subId; },
      subQuery: async (c, id, s, opciones) => consultar(subcol(c, id, s), opciones),
      // Transacción simple: trabaja sobre una copia y confirma al final.
      transaccion: async (fn) => {
        const respaldo = JSON.stringify(aJSONDemo(datos));
        try {
          const r = await fn({
            get: async (c, id) => conId(id, col(c)[id]),
            set: (c, id, d) => { col(c)[id] = clonarConFechas(sinId(d)); },
            update: (c, id, parcial) => { const doc = col(c)[id]; if (!doc) throw errorDemo('not-found', 'El registro no existe'); aplicarParcial(doc, parcial); },
          });
          guardar();
          return r;
        } catch (e) { datos = deJSONDemo(JSON.parse(respaldo)); throw e; }
      },
      vacio: () => Object.keys(datos.colecciones).length === 0,
      reiniciar: () => { datos = { colecciones: {}, sub: {} }; try { localStorage.removeItem(CLAVE_DEMO); } catch (e) { /* nada */ } },
      exportar: () => clonarConFechas(datos),
    };
    return ad;
  };

  /* ===== 5. Auth ===== */
  const MENSAJES_ERROR = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión o recupera la contraseña.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    'auth/network-request-failed': 'Sin conexión con el servidor de autenticación.',
    'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión para hacer este cambio.',
    'auth/user-disabled': 'La cuenta está deshabilitada.',
    'permission-denied': 'No tienes permiso para esta acción, o el registro ya existe.',
    'not-found': 'El registro no existe.',
    'unavailable': 'Sin conexión con la base de datos. Revisa la red e inténtalo de nuevo.',
    'failed-precondition': 'La consulta necesita un índice en Firestore (revisa la consola del navegador).',
    'deadline-exceeded': 'La operación tardó demasiado. Inténtalo de nuevo.',
  };
  const traducirError = (e) => {
    if (!e) return 'Error desconocido';
    const codigo = e.code || '';
    if (MENSAJES_ERROR[codigo]) return MENSAJES_ERROR[codigo];
    const m = String(e.message || e);
    if (/index/i.test(m) && /firestore/i.test(m)) return MENSAJES_ERROR['failed-precondition'];
    return m.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '');
  };
  const resumenUsuario = (u) => (u ? { uid: u.uid, email: U.normalizarCorreo(u.email), emailVerified: !!u.emailVerified } : null);

  // Enlace para definir (o recuperar) la contraseña; al abrirlo, el correo queda verificado.
  // Con url, la página de Firebase ofrece «Continuar» de vuelta a la app; si ese dominio no
  // está autorizado en Authentication, el correo sale igual, sin el botón.
  const enviarEnlaceClave = async (auth, correo) => {
    const url = `${raiz.location.origin}${raiz.location.pathname}`;
    try { await auth.sendPasswordResetEmail(U.normalizarCorreo(correo), { url }); }
    catch (e) {
      if (!/continue-uri|argument-error/.test(String(e && e.code))) throw e;
      await auth.sendPasswordResetEmail(U.normalizarCorreo(correo));
    }
  };

  const crearAuthFirebase = (auth) => ({
    modoDemo: false,
    alCambiar: (cb) => auth.onAuthStateChanged((u) => cb(resumenUsuario(u))),
    actual: () => resumenUsuario(auth.currentUser),
    iniciarSesion: async (correo, clave) => resumenUsuario((await auth.signInWithEmailAndPassword(U.normalizarCorreo(correo), clave)).user),
    enviarVerificacion: () => (auth.currentUser ? auth.currentUser.sendEmailVerification() : Promise.resolve()),
    // reload() actualiza el usuario en memoria, pero el token sigue diciendo email_verified: false
    // y las reglas de Firestore leen el token: sin renovarlo, tras verificar el correo todo se niega.
    recargar: async () => {
      if (auth.currentUser) { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); }
      return resumenUsuario(auth.currentUser);
    },
    recuperarClave: (correo) => enviarEnlaceClave(auth, correo),
    cambiarClave: (nueva) => auth.currentUser.updatePassword(nueva),
    cerrarSesion: () => auth.signOut(),
    // El SDK reutiliza el token mientras le queden más de 30 s: quien lo manda a un flujo pide un
    // mínimo de vigencia (vigenciaMs) para que no llegue vencido después de subir un archivo grande.
    idToken: async (vigenciaMs = 0) => {
      const u = auth.currentUser;
      if (!u) return '';
      if (!vigenciaMs) return u.getIdToken();
      const r = await u.getIdTokenResult();
      return new Date(r.expirationTime).getTime() - Date.now() < vigenciaMs ? u.getIdToken(true) : r.token;
    },
    // El admin crea las cuentas (la del contratista al crear su contrato; revisores y
    // coordinadores en Usuarios) en una app secundaria para no cerrar su propia sesión.
    // La persona define su contraseña con el enlace del correo, que además verifica el correo.
    // Si el correo no sale, la cuenta igual queda creada: la persona pide el enlace al entrar.
    crearCuentaSecundaria: async (correo, claveTemporal) => {
      const nombre = 'secundaria';
      const app2 = firebase.apps.find((a) => a.name === nombre) || firebase.initializeApp(raiz.firebaseConfig, nombre);
      const auth2 = app2.auth();
      const cred = await auth2.createUserWithEmailAndPassword(U.normalizarCorreo(correo), claveTemporal);
      const uid = cred.user.uid;
      await auth2.signOut();
      let correoEnviado = true;
      try { await enviarEnlaceClave(auth, correo); } catch (e) { correoEnviado = false; console.warn('No se pudo enviar el enlace para definir la contraseña:', e); }
      return { uid, correoEnviado };
    },
    traducirError,
  });

  const CLAVE_SESION_DEMO = 'bitacora.demo.sesion';
  const crearAuthDemo = (obtenerUsuarios) => {
    const oyentes = [];
    let actual = null;
    try { const t = sessionStorage.getItem(CLAVE_SESION_DEMO); if (t) actual = JSON.parse(t); } catch (e) { actual = null; }
    const avisar = () => { try { if (actual) sessionStorage.setItem(CLAVE_SESION_DEMO, JSON.stringify(actual)); else sessionStorage.removeItem(CLAVE_SESION_DEMO); } catch (e) { /* nada */ } oyentes.forEach((cb) => cb(actual)); };
    const auth = {
      modoDemo: true,
      alCambiar: (cb) => { oyentes.push(cb); setTimeout(() => cb(actual), 0); return () => { const i = oyentes.indexOf(cb); if (i >= 0) oyentes.splice(i, 1); }; },
      actual: () => actual,
      usuariosDemo: () => obtenerUsuarios(),
      entrarDemo: async (uid) => {
        const u = obtenerUsuarios().find((x) => x.uid === uid);
        if (!u) throw new Error('Usuario de demostración no encontrado');
        actual = { uid: u.uid, email: u.correo, emailVerified: true };
        avisar();
        return actual;
      },
      iniciarSesion: async (correo) => {
        const u = obtenerUsuarios().find((x) => x.correo === U.normalizarCorreo(correo));
        if (!u) { const e = new Error('No existe una cuenta con ese correo (modo demostración).'); e.code = 'auth/user-not-found'; throw e; }
        return auth.entrarDemo(u.uid);
      },
      enviarVerificacion: async () => {},
      recargar: async () => actual,
      recuperarClave: async () => {},
      cambiarClave: async () => {},
      cerrarSesion: async () => { actual = null; avisar(); },
      idToken: async () => 'token-demo',
      crearCuentaSecundaria: async () => ({ uid: `demo-${U.idAleatorio().slice(0, 8)}`, correoEnviado: true }),
      traducirError,
    };
    return auth;
  };

  /* ===== 6. DB de alto nivel ===== */
  const crearDB = (A) => {
    const ahora = () => new Date();
    const DB = { modo: A.nombre, adaptador: A, traducirError };

    // --- Parámetros ---
    DB.obtenerParametros = async () => {
      const p = await A.get('parametros', 'app');
      // Se mezclan con los valores por defecto para que un campo nuevo nunca falte.
      return mezclarParametros(p || {});
    };
    const mezclarParametros = (p) => ({
      ...PARAMETROS_DEFAULT, ...p,
      marca: { ...PARAMETROS_DEFAULT.marca, ...(p.marca || {}) },
      smmlv: { ...PARAMETROS_DEFAULT.smmlv, ...(p.smmlv || {}) },
      flujos: { ...PARAMETROS_DEFAULT.flujos, ...(p.flujos || {}) },
      correo: { ...PARAMETROS_DEFAULT.correo, ...(p.correo || {}), plantillas: { ...PARAMETROS_DEFAULT.correo.plantillas, ...((p.correo && p.correo.plantillas) || {}) } },
    });
    DB.guardarParametros = async (p) => { const d = { ...p }; delete d.id; await A.set('parametros', 'app', d); };

    // --- Usuarios ---
    DB.obtenerPerfil = (uid) => A.get('usuarios', uid);
    DB.crearPerfil = (uid, datos) => A.set('usuarios', uid, { revisores: [], coordinadores: [], activo: true, telefono: '', ...datos, creadoEn: ahora() });
    DB.actualizarPerfil = (uid, parcial) => A.update('usuarios', uid, parcial);
    DB.listarUsuarios = () => A.query('usuarios', {});
    DB.listarUsuariosPorRol = (rol) => A.query('usuarios', { where: [['rol', '==', rol]] });
    DB.listarContratistasAsignados = async (uid, rol) => A.query('usuarios', { where: [[rol === 'coordinador' ? 'coordinadores' : 'revisores', 'array-contains', uid]] });
    DB.buscarUsuariosPorCorreo = async (correos) => {
      const lista = U.unicos(correos.map(U.normalizarCorreo).filter(Boolean));
      const r = [];
      for (let i = 0; i < lista.length; i += 30) r.push(...await A.query('usuarios', { where: [['correo', 'in', lista.slice(i, i + 30)]] }));
      return r;
    };
    DB.obtenerFirma = (uid) => A.subGet('usuarios', uid, 'privado', 'firma');
    DB.guardarFirma = (uid, datos) => A.subSet('usuarios', uid, 'privado', 'firma', { ...datos, actualizadoEn: ahora() });

    // --- preRegistro ---
    DB.obtenerPreRegistro = (cedula) => A.get('preRegistro', U.soloDigitos(cedula));
    DB.guardarPreRegistro = (cedula, datos) => A.set('preRegistro', U.soloDigitos(cedula), { activado: false, uid: null, contratos: [], revisores: [], coordinadores: [], ...datos });
    DB.actualizarPreRegistro = (cedula, parcial) => A.update('preRegistro', U.soloDigitos(cedula), parcial);
    DB.listarPreRegistros = () => A.query('preRegistro', {});
    DB.marcarActivado = (cedula, uid) => A.update('preRegistro', U.soloDigitos(cedula), { activado: true, uid, activadoEn: ahora() });

    // --- Contratos ---
    DB.obtenerContrato = (id) => A.get('contratos', id);
    DB.listarContratos = async ({ rol, uid }) => {
      let r;
      if (rol === 'admin') r = await A.query('contratos', {});
      else if (rol === 'contratista') r = await A.query('contratos', { where: [['contratistaUid', '==', uid]] });
      else r = await A.query('contratos', { where: [[rol === 'coordinador' ? 'coordinadores' : 'revisores', 'array-contains', uid]] });
      return U.ordenarPor(r, (c) => String(c.numero || c.id));
    };
    DB.crearContrato = (id, datos) => A.crear('contratos', id, {
      numero: id, etiqueta: '', contratistaUid: null, cedulaContratista: null, correoContratista: null,
      revisores: [], coordinadores: [], correosRevisores: [], correosCoordinadores: [],
      estado: 'activo', permitirActualizar: false,
      info: { contratista: {}, contrato: {}, obligaciones: { lista: [] }, supervision: {}, modificaciones: {} },
      ...datos, creadoEn: ahora(), actualizadoEn: ahora(),
    });
    DB.guardarContrato = (id, datos) => A.set('contratos', id, { ...datos, actualizadoEn: ahora() });
    // parcial admite rutas con punto ('info.contratista'); cambios = { ruta: {antes, despues} } para la auditoría.
    DB.actualizarContrato = async (id, parcial, { por, cambios } = {}) => {
      await A.update('contratos', id, { ...parcial, actualizadoEn: ahora() });
      if (por && cambios && Object.keys(cambios).length) await A.subAdd('contratos', id, 'cambios', { por, fecha: ahora(), campos: cambios });
    };
    DB.reclamarContrato = (id, uid) => A.update('contratos', id, { contratistaUid: uid, actualizadoEn: ahora() });
    DB.eliminarContrato = (id) => A.delete('contratos', id);
    DB.listarCambios = (id) => A.subQuery('contratos', id, 'cambios', { orderBy: ['fecha', 'desc'], limit: 100 });

    // --- Formularios, catálogos, ventanas ---
    DB.listarFormularios = async () => U.ordenarPor(await A.query('formularios', {}), (f) => f.nombre);
    DB.obtenerFormulario = (id) => A.get('formularios', id);
    DB.guardarFormulario = (f) => { const d = { ...f }; delete d.id; return A.set('formularios', f.id, { ...d, actualizadoEn: ahora() }); };
    // Solo esos campos (p. ej. versionBase o activo): no reescribe el formulario con una copia vieja.
    DB.actualizarFormulario = (id, parcial) => A.update('formularios', id, { ...parcial, actualizadoEn: ahora() });
    // Última versión con copia en versiones/ (sobrevive a borrar el formulario).
    const ultimaVersionPublicada = async (id) => {
      try { const [c] = await A.subQuery('formularios', id, 'versiones', { orderBy: ['version', 'desc'], limit: 1 }); return c ? Number(c.version) || 0 : 0; } catch (e) { return 0; }
    };
    // La versión publicada siempre avanza (también si otra sesión publicó antes) y nunca reutiliza el
    // número de una copia ya publicada (versiones/N es inmutable).
    DB.publicarVersion = async (f, version = (Number(f.version) || 0) + 1) => {
      const d = { ...f }; delete d.id;
      const actual = await A.get('formularios', f.id).catch(() => null);
      const v = Math.max(Number(version) || 1, (await ultimaVersionPublicada(f.id)) + 1, ((actual && Number(actual.version)) || 0) + 1);
      await A.subSet('formularios', f.id, 'versiones', String(v), { ...d, version: v, publicadoEn: ahora() });
      await A.set('formularios', f.id, { ...d, version: v, actualizadoEn: ahora() });
      return v;
    };
    DB.eliminarFormulario = (id) => A.delete('formularios', id);
    DB.listarCatalogos = () => A.query('catalogos', {});
    DB.guardarCatalogo = (id, datos) => { const d = { ...datos }; delete d.id; return A.set('catalogos', id, d); };
    DB.eliminarCatalogo = (id) => A.delete('catalogos', id);
    DB.listarVentanas = async () => U.ordenarPor(await A.query('ventanas', {}), (v) => v.periodo, 'desc');
    DB.obtenerVentana = (periodo) => A.get('ventanas', periodo);
    DB.guardarVentana = (periodo, datos) => { const d = { ...datos }; delete d.id; return A.set('ventanas', periodo, { ...d, periodo }); };
    DB.eliminarVentana = (periodo) => A.delete('ventanas', periodo);

    // --- Borradores ---
    DB.idBorrador = (uid, contratoId, formularioId, periodo) => `${uid}_${contratoId}_${formularioId}_${periodo}`;
    DB.obtenerBorrador = (id) => A.get('borradores', id);
    DB.guardarBorrador = (id, datos) => A.set('borradores', id, { ...datos, actualizadoEn: ahora() });
    DB.eliminarBorrador = (id) => A.delete('borradores', id);

    // --- Envíos ---
    const campoRol = (rol) => (rol === 'contratista' ? 'contratistaUid' : rol === 'coordinador' ? 'coordinadores' : 'revisores');
    const baseWhere = (rol, uid) => (rol === 'admin' ? [] : [[campoRol(rol), rol === 'contratista' ? '==' : 'array-contains', uid]]);
    DB.obtenerEnvio = (id) => A.get('envios', id);
    // Filtros opcionales: contratoId, periodo, formularioId, estado (los que no van al índice se aplican en memoria).
    DB.listarEnvios = async ({ rol, uid, periodo, contratoId, formularioId, estado, limite } = {}) => {
      const where = baseWhere(rol, uid);
      if (periodo) where.push(['periodo', '==', periodo]);
      let r = await A.query('envios', { where, orderBy: ['enviadoEn', 'desc'], limit: limite || null });
      if (contratoId) r = r.filter((e) => e.contratoId === contratoId);
      if (formularioId) r = r.filter((e) => e.formularioId === formularioId);
      if (estado) r = r.filter((e) => (Array.isArray(estado) ? estado.includes(e.estado) : e.estado === estado));
      return r;
    };
    DB.idEnvio = (contratoId, formularioId, periodo, n) => `${contratoId}_${formularioId}_${periodo}_${n}`;
    DB.idContador = (contratoId, formularioId) => `${contratoId}_${formularioId}`;
    DB.obtenerContador = (contratoId, formularioId) => A.get('contadores', DB.idContador(contratoId, formularioId));
    // Crea el envío y avanza el consecutivo en una sola transacción. No se consulta
    // el envío antes de crearlo: si ya existe, la regla (o el adaptador demo) lo niega.
    DB.crearEnvio = (envio, consecutivo) => A.transaccion(async (tx) => {
      const idContador = DB.idContador(envio.contratoId, envio.formularioId);
      const contador = await tx.get('contadores', idContador);
      const ultimo = contador ? Number(contador.ultimo) || 0 : 0;
      const n = Number(consecutivo) || ultimo + 1;
      if (contador && n <= ultimo) { const e = new Error(`El consecutivo debe ser mayor que ${ultimo}`); e.code = 'consecutivo'; throw e; }
      const id = DB.idEnvio(envio.contratoId, envio.formularioId, envio.periodo, envio.n);
      if (A.nombre === 'demo' && await tx.get('envios', id)) { const e = new Error('Ya existe un envío de este formulario para el período'); e.code = 'permission-denied'; throw e; }
      tx.set('envios', id, { ...envio, consecutivo: n, enviadoEn: ahora(), actualizadoEn: ahora() });
      if (contador) tx.update('contadores', idContador, { ultimo: n, actualizadoEn: ahora() });
      else tx.set('contadores', idContador, { contratoId: envio.contratoId, formularioId: envio.formularioId, ultimo: n, actualizadoEn: ahora() });
      return { id, consecutivo: n };
    });
    DB.actualizarEnvio = (id, parcial) => A.update('envios', id, { ...parcial, actualizadoEn: ahora() });
    DB.ultimoEnvio = async ({ rol, uid, contratoId, formularioId }) => {
      const lista = await DB.listarEnvios({ rol, uid, contratoId, formularioId });
      return lista.length ? lista[0] : null;
    };

    // --- Solicitudes ---
    DB.listarSolicitudes = async ({ rol, uid, contratoId, estado } = {}) => {
      let r = await A.query('solicitudes', { where: baseWhere(rol, uid), orderBy: ['creadoEn', 'desc'] });
      if (contratoId) r = r.filter((s) => s.contratoId === contratoId);
      if (estado) r = r.filter((s) => (Array.isArray(estado) ? estado.includes(s.estado) : s.estado === estado));
      return r;
    };
    DB.crearSolicitud = (datos) => A.add('solicitudes', { envioIds: [], formularios: [], observacion: '', fechaLimite: null, revisorUid: null, motivoRechazo: null, ...datos, creadoEn: ahora(), actualizadoEn: ahora() });
    DB.actualizarSolicitud = (id, parcial) => A.update('solicitudes', id, { ...parcial, actualizadoEn: ahora() });

    // --- Notificaciones (bitácora) ---
    DB.registrarNotificacion = (datos) => A.add('notificaciones', { error: null, ...datos, fecha: ahora() });
    DB.listarNotificaciones = () => A.query('notificaciones', { orderBy: ['fecha', 'desc'], limit: 200 });

    // --- Semillas iniciales (admin, proyecto nuevo) ---
    DB.sembrarBase = async () => {
      const existentes = await DB.listarFormularios();
      for (const f of FORMULARIOS_SEMILLA) {
        if (existentes.some((x) => x.id === f.id)) continue;
        // Si se borró y ya tenía versiones publicadas, sigue después de la última (no retrocede).
        const version = Math.max(Number(f.version) || 1, (await ultimaVersionPublicada(f.id)) + 1);
        await DB.guardarFormulario({ ...U.clonar(f), version, versionBase: f.version });
      }
      const catalogos = await DB.listarCatalogos();
      for (const id of Object.keys(CATALOGOS_SEMILLA)) if (!catalogos.some((c) => c.id === id)) await DB.guardarCatalogo(id, U.clonar(CATALOGOS_SEMILLA[id]));
      const p = await A.get('parametros', 'app');
      if (!p) await DB.guardarParametros(U.clonar(PARAMETROS_DEFAULT));
    };
    return DB;
  };

  /* ===== 7. Datos ficticios del modo demostración ===== */
  const USUARIOS_DEMO = [
    { uid: 'demo-admin', rol: 'admin', nombres: 'Ana', apellidos: 'Administradora Demo', cedula: '1000000001', correo: 'admin@demo.local', telefono: '3000000001' },
    { uid: 'demo-revisor', rol: 'revisor', nombres: 'Rosa', apellidos: 'Revisora Demo', cedula: '1000000002', correo: 'revisor@demo.local', telefono: '3000000002' },
    { uid: 'demo-coordinador', rol: 'coordinador', nombres: 'Carlos', apellidos: 'Coordinador Demo', cedula: '1000000003', correo: 'coordinador@demo.local', telefono: '3000000003' },
    { uid: 'demo-contratista', rol: 'contratista', nombres: 'Nombre', apellidos: 'Apellido Apellido', cedula: '1000000004', correo: 'contratista@demo.local', telefono: '3000000004', revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'] },
  ];
  const sembrarDemo = async (DB, A) => {
    const hoy = U.hoyISO();
    const pActual = U.periodoActual();
    const pAnterior = U.periodoAnterior(pActual);
    const rAct = U.rangoPeriodo(pActual), rAnt = U.rangoPeriodo(pAnterior);
    await DB.sembrarBase();
    await DB.guardarCatalogo('componentes', { nombre: 'Componentes del proyecto', opciones: [
      { valor: 'COMP-1', etiqueta: '1. COMPONENTE INFRAESTRUCTURA FÍSICA', grupo: '' },
      { valor: 'COMP-2', etiqueta: '2. COMPONENTE GESTIÓN ADMINISTRATIVA', grupo: '' },
    ] });
    await DB.guardarCatalogo('equipos', { nombre: 'Equipos o unidades', opciones: [
      { valor: 'EQ-1', etiqueta: 'Apoyo a la Gestión Administrativa', grupo: '' },
      { valor: 'EQ-2', etiqueta: 'Apoyo Técnico de Obra', grupo: '' },
    ] });
    for (const u of USUARIOS_DEMO) {
      await DB.crearPerfil(u.uid, { rol: u.rol, nombres: u.nombres, apellidos: u.apellidos, nombreCompleto: `${u.nombres} ${u.apellidos}`,
        nombreCorto: U.nombreCorto(u.nombres, u.apellidos), cedula: u.cedula, correo: u.correo, telefono: u.telefono,
        activo: true, revisores: u.revisores || [], coordinadores: u.coordinadores || [] });
    }
    const obligaciones = [
      { numero: 1, texto: 'Apoyar la articulación del sistema de gestión de calidad del proceso con los formatos, criterios y registros vigentes.' },
      { numero: 2, texto: 'Brindar apoyo para consolidar y mantener actualizados los registros del sistema de información.' },
      { numero: 3, texto: 'Apoyar la integración de herramientas de Microsoft 365 para centralizar la información del proceso.' },
    ];
    const inicioContrato = `${pAnterior}-02` < hoy ? `${pAnterior}-02` : U.sumarDias(hoy, -40);
    await DB.crearContrato('P-00000-DE-2026', {
      numero: 'P-00000 DE 2026', etiqueta: 'PRINCIPAL', contratistaUid: 'demo-contratista', cedulaContratista: '1000000004', correoContratista: 'contratista@demo.local',
      revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'], correosRevisores: ['revisor@demo.local'], correosCoordinadores: ['coordinador@demo.local'],
      estado: 'activo', permitirActualizar: true,
      info: {
        contratista: { nombreCompleto: 'Nombre Apellido Apellido', cedula: '1000000004', cedulaExpedidaEn: 'Medellín', direccion: 'Calle 00 # 00-00', telefono: '3000000004', rolProceso: 'Apoyo Sistema de Gestión de Calidad', rutaNas: '<RUTA_NAS>\\1000000004' },
        contrato: { numero: 'P-00000 DE 2026', objeto: 'Prestación de servicios como contratista independiente, sin vínculo laboral por su propia cuenta y riesgo para realizar la gestión de Profesional de apoyo en ejecución del Contrato Interadministrativo No. 0000000000 de 2026.',
          componente: 'COMP-1', equipo: 'EQ-1', fechaFirma: U.sumarDias(inicioContrato, -3), fechaInicio: inicioContrato, fechaFin: `${pActual.slice(0, 4)}-12-31`, plazoDias: 300, valorTotal: 45000000, valorMensual: 4500000, cdp: '<PENDIENTE>', rp: '<PENDIENTE>' },
        obligaciones: { lista: obligaciones },
        supervision: { supervisor: 'Nombre del Supervisor ITM', validador: 'Nombre del Validador' },
        modificaciones: { adiciones: [], ampliaciones: [], suspensiones: [], garantias: [], pagos: [] },
      },
    });
    await DB.crearContrato('P-00001-DE-2026', {
      numero: 'P-00001 DE 2026', etiqueta: 'SIN ACTIVAR', contratistaUid: null, cedulaContratista: '1000000005', correoContratista: 'nuevo@demo.local',
      revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'], correosRevisores: ['revisor@demo.local'], correosCoordinadores: ['coordinador@demo.local'],
      estado: 'activo', permitirActualizar: false,
      info: { contratista: { nombreCompleto: 'Persona Nueva Demo', cedula: '1000000005' },
        contrato: { numero: 'P-00001 DE 2026', objeto: 'Prestación de servicios profesionales de apoyo técnico (demostración).', componente: 'COMP-2', equipo: 'EQ-2', fechaInicio: `${pActual}-10`, fechaFin: `${pActual.slice(0, 4)}-12-31`, valorTotal: 30000000, valorMensual: 3000000 },
        obligaciones: { lista: [{ numero: 1, texto: 'Apoyar técnicamente la supervisión de obras (demostración).' }] },
        supervision: { supervisor: 'Nombre del Supervisor ITM', validador: 'Nombre del Validador' }, modificaciones: {} },
    });
    await DB.guardarPreRegistro('1000000004', { correo: 'contratista@demo.local', nombreCompleto: 'Nombre Apellido Apellido', contratos: ['P-00000-DE-2026'], revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'], activado: true, uid: 'demo-contratista' });
    await DB.guardarPreRegistro('1000000005', { correo: 'nuevo@demo.local', nombreCompleto: 'Persona Nueva Demo', contratos: ['P-00001-DE-2026'], revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'], activado: false, uid: null });
    // Ventanas: la del período actual abierta todo el mes; la anterior cerrada.
    await DB.guardarVentana(pActual, { periodo: pActual, desde: U.inicioDeDiaBogota(rAct.desde), hasta: U.finDeDiaBogota(rAct.hasta), formularios: ['informe_mensual', 'cuenta_cobro'],
      aviso: `Para el mes de <b>${U.nombrePeriodo(pActual).toUpperCase()}</b> la plataforma está habilitada para diligenciar la Cuenta de cobro y el Informe mensual durante todo el mes (demostración). Cualquier corrección, desde <b>Solicitudes</b>.` });
    await DB.guardarVentana(pAnterior, { periodo: pAnterior, desde: U.inicioDeDiaBogota(rAnt.desde), hasta: U.finDeDiaBogota(rAnt.hasta), formularios: ['informe_mensual', 'cuenta_cobro'], aviso: '' });
    // Un informe aprobado del período anterior (sirve para «Traer del mes anterior» y el historial).
    const respuestasInforme = {
      numeroInforme: 1, periodoDesde: inicioContrato > rAnt.desde ? inicioContrato : rAnt.desde, periodoHasta: rAnt.hasta, fechaElaboracion: rAnt.hasta,
      actividades: [
        { numero: 1, obligacion: obligaciones[0].texto, porcentaje: 100, descripcion: 'Se dio continuidad al seguimiento semestral del mapa de oportunidades del proceso.\nSe organizaron los registros del seguimiento.', evidencia: 'Registros del seguimiento semestral', evidenciaUrl: '', evidenciaArchivo: [] },
        { numero: 2, obligacion: obligaciones[1].texto, porcentaje: 50, descripcion: 'Se apoyó la formulación de la acción de mejora y se actualizó el aplicativo de apoyo:\nhttps://ejemplo.github.io/aplicativo/', evidencia: 'Acción de mejora formulada', evidenciaUrl: 'https://ejemplo.github.io/aplicativo/', evidenciaArchivo: [] },
        { numero: 3, obligacion: obligaciones[2].texto, porcentaje: 0, descripcion: '', evidencia: '', evidenciaUrl: '', evidenciaArchivo: [] },
      ],
      dificultades: 'NINGUNA', observaciones: 'NINGUNA',
      anexos: [{ nombre: 'Acta de reunión de seguimiento.pdf', ruta: '<RUTA_NAS>\\1000000004', url: '', archivo: [] }],
    };
    const fechaAnt = U.finDeDiaBogota(rAnt.hasta);
    const historialAprobado = [
      { estado: 'enviado', por: 'demo-contratista', porNombre: 'Nombre Apellido Apellido', rol: 'contratista', fecha: new Date(fechaAnt.getTime() - 3 * 86400000), observacion: '' },
      { estado: 'aprobado_revisor', por: 'demo-revisor', porNombre: 'Rosa Revisora Demo', rol: 'revisor', fecha: new Date(fechaAnt.getTime() - 2 * 86400000), observacion: 'Revisado sin observaciones.' },
      { estado: 'aprobado', por: 'demo-coordinador', porNombre: 'Carlos Coordinador Demo', rol: 'coordinador', fecha: new Date(fechaAnt.getTime() - 86400000), observacion: '' },
    ];
    const contratoDemo = await DB.obtenerContrato('P-00000-DE-2026');
    const usuarioDemo = await DB.obtenerPerfil('demo-contratista');
    const parametros = await DB.obtenerParametros();
    const catalogos = await DB.listarCatalogos();
    const formularios = await DB.listarFormularios();
    const fInforme = formularios.find((f) => f.id === 'informe_mensual');
    const D = raiz.Descargas;
    const fotoInforme = D ? D.armarFoto(fInforme, respuestasInforme, { contrato: contratoDemo, usuario: usuarioDemo, parametros, catalogos }) : [];
    const datosInforme = D ? D.armarDatosInforme({ respuestas: respuestasInforme, contrato: contratoDemo, usuario: usuarioDemo, catalogos, parametros }) : {};
    await A.set('envios', DB.idEnvio('P-00000-DE-2026', 'informe_mensual', pAnterior, 1), {
      contratoId: 'P-00000-DE-2026', formularioId: 'informe_mensual', formularioVersion: Number(fInforme && fInforme.version) || 1,
      formularioVersionBase: Number(fInforme && (fInforme.versionBase || fInforme.version)) || 1, periodo: pAnterior, n: 1, contratistaUid: 'demo-contratista',
      revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'], consecutivo: 1, estado: 'aprobado', pasoActual: 'ninguno', enCorreccion: false, fechaLimiteCorreccion: null,
      respuestas: respuestasInforme, foto: fotoInforme, datosDescarga: datosInforme, anexos: [], totales: {},
      historial: historialAprobado, enviadoEn: historialAprobado[0].fecha, actualizadoEn: historialAprobado[2].fecha,
    });
    await A.set('contadores', DB.idContador('P-00000-DE-2026', 'informe_mensual'), { contratoId: 'P-00000-DE-2026', formularioId: 'informe_mensual', ultimo: 1, actualizadoEn: historialAprobado[0].fecha });
    // Una solicitud finalizada de ejemplo.
    await DB.crearSolicitud({ contratoId: 'P-00000-DE-2026', contratistaUid: 'demo-contratista', revisores: ['demo-revisor'], coordinadores: ['demo-coordinador'],
      tipo: 'correccion', origen: 'contratista', envioIds: [DB.idEnvio('P-00000-DE-2026', 'informe_mensual', pAnterior, 1)], formularios: ['informe_mensual'],
      observacion: 'Ajustar la descripción de la actividad 2 (demostración).', fechaLimite: fechaAnt, estado: 'finalizada', revisorUid: 'demo-revisor', motivoRechazo: null });
  };

  /* ===== Instancias ===== */
  const adaptador = raiz.MODO_DEMO ? crearAdaptadorDemo() : crearAdaptadorFirestore(raiz.db);
  const DB = crearDB(adaptador);
  // La siembra del modo demo se dispara desde la app (necesita window.Descargas,
  // que se carga después de este archivo).
  let promesaListo = null;
  DB.iniciar = () => {
    if (!promesaListo) promesaListo = (async () => { if (raiz.MODO_DEMO && adaptador.vacio()) await sembrarDemo(DB, adaptador); })();
    return promesaListo;
  };
  DB.reiniciarDemo = async () => { if (!raiz.MODO_DEMO) return; adaptador.reiniciar(); try { sessionStorage.removeItem(CLAVE_SESION_DEMO); } catch (e) { /* nada */ } await sembrarDemo(DB, adaptador); };
  DB.exportarDemo = () => (raiz.MODO_DEMO ? adaptador.exportar() : null);

  raiz.DB = DB;
  raiz.Auth = raiz.MODO_DEMO ? crearAuthDemo(() => USUARIOS_DEMO) : crearAuthFirebase(raiz.auth);
  raiz.SEMILLAS = { formularios: FORMULARIOS_SEMILLA, parametrosDefault: PARAMETROS_DEFAULT, catalogos: CATALOGOS_SEMILLA, usuariosDemo: USUARIOS_DEMO };
})(window);
