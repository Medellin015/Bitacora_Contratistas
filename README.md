# Bitácora Contratistas

Plataforma de informes de ejecución mensual y cuentas de cobro para contratistas
(ITM · Secretaría de Infraestructura Física). Es una app web **sin paso de
compilación**: React 18 por CDN con el JSX transpilado en el navegador por Babel,
Firebase/Firestore (SDK compat), Tailwind por CDN para el layout y CSS propio para
los tokens de tema, componentes y animaciones.

## Estructura del proyecto

| Archivo | Qué contiene |
| --- | --- |
| `index.html` | Página única: metadatos, librerías por CDN (en orden) y los scripts de la app. |
| `styles.css` | Tokens del tema claro/oscuro, base tipográfica, componentes, vista previa del Word, animaciones e impresión. |
| `js/tema.js` | Tema guardado (antes del primer pintado) y configuración de Tailwind. Se carga síncrono en `<head>`. |
| `js/firebase-config.js` | `firebaseConfig`, detección del modo demostración e inicialización (`window.db`, `window.auth`, `window.authReady`). |
| `js/imagenes-formato.js` | Encabezado y pie del formato Word en base64 (`window.IMAGENES_B64`). |
| `js/util.js` | Utilidades compartidas: fechas en hora de Bogotá, moneda `es-CO`, texto, archivos, objetos (`window.U`). |
| `js/formulas.js` | Mini-lenguaje de fórmulas del motor de formularios, sin `eval` (`window.Formulas`). |
| `js/datos.js` | Capa de datos: única que habla con Firestore o con la demostración (`window.DB`, `window.Auth`, `window.SEMILLAS`). |
| `js/flujos.js` | Llamadas a los flujos de Power Automate: subir archivo, notificar, Word → PDF (`window.Flujos`). |
| `js/informe-docx.js` | Generador del informe mensual en Word con docx.js (`window.InformeDocx`). |
| `js/descargas.js` | Word, Excel (con plan B en CSV) y vista previa (`window.Descargas`). |
| `js/lector-planilla.js` | Lector de planillas de seguridad social: al adjuntar el PDF corre Python en el navegador (Pyodide + pypdf en un Web Worker) y devuelve número, fecha y valores (`window.LectorPlanilla`). Si la planilla es escaneada, la lee con OCR (PDF.js + Tesseract.js). |
| `js/lector-planilla-worker.js` | El Web Worker del lector: carga Pyodide, pypdf (verificado con sha256) y `py/leer_planilla.py`; para el OCR, limpia la imagen de cada página (fondo, inclinación, líneas de tablas). |
| `js/ui-base.jsx` … `js/app.jsx` | Interfaz React: componentes base, acceso, layout, motor de formularios, pantallas por rol y raíz de la app. |
| `firestore.rules` | Reglas de seguridad de Firestore por rol. |
| `firestore.indexes.json` | Índices compuestos que necesitan las consultas de envíos y solicitudes. |
| `firebase.json` | Configuración para publicar reglas e índices con la CLI de Firebase. |
| `py/leer_planilla.py` | Lector en Python de la planilla PILA en PDF (y de lo que reconoce el OCR en una escaneada). Corre en el navegador (Pyodide) y también en la terminal. |
| `py/probar_leer_planilla.py` | Pruebas del lector con textos y OCR de planillas ficticias (`python3 py/probar_leer_planilla.py`). |
| `docs/flujos.md` | Contrato y paso a paso de los flujos de Power Automate (`subirArchivo`, `notificar`, `enviarInforme`, `docxAPdf`). |

Los `.jsx` comparten el ámbito global (constantes de primer nivel), por eso el
orden de carga importa y ningún nombre puede repetirse entre archivos. La
interfaz nunca toca Firestore directamente: siempre pasa por `window.DB`.

## Cómo ejecutarla

Babel carga los `.jsx` por XHR, así que la app debe servirse por **HTTP** (no
abriendo el archivo con `file://`). Sirve para GitHub Pages o para un servidor
local sencillo:

```bash
python3 -m http.server 8080     # o: npx serve .
```

y abre <http://localhost:8080/>.

### Modo demostración

Mientras `firebaseConfig` tenga `<PENDIENTE>` (o se abra con `?demo=1`) la app
usa datos ficticios guardados en el navegador, con un usuario de cada rol.
`?demo=0` apaga el modo forzado. Si el SDK de Firebase no carga (red que
bloquea `gstatic.com`), también abre en demostración y lo avisa en el banner.

### Conectar el proyecto real

1. Crea el proyecto en la consola de Firebase con una app web, activa
   **Authentication → Correo electrónico/contraseña** y agrega
   `medellin015.github.io` en los dominios autorizados.
2. Crea **Firestore** en modo producción y publica `firestore.rules`.
3. Crea los índices compuestos de `firestore.indexes.json`. Con la CLI de
   Firebase, los dos pasos anteriores son `firebase deploy --only firestore`.
4. Crea el primer administrador: un usuario en Authentication y, con su UID, el
   documento `usuarios/{UID}` con `rol: "admin"`, `activo: true`, `nombres`,
   `apellidos`, `nombreCompleto`, `nombreCorto`, `cedula` y `correo` en minúscula.
5. Pega la configuración web del proyecto en `js/firebase-config.js`.
6. Entra como administrador, verifica el correo y usa **Sembrar** en el inicio.
   Luego completa **Parámetros** (NIT, SMMLV, URL de los flujos de Power
   Automate: ver [docs/flujos.md](docs/flujos.md)), los **contratos** y las
   **Ventanas** del período.

Cada vez que cambie `firestore.rules` hay que volver a publicarlas
(`firebase deploy --only firestore:rules`, o pegarlas en Firestore → Reglas).

Las **Ventanas** (una por período) dicen entre qué fechas se puede diligenciar y
enviar cada formulario. **Abrir varios meses** abre un rango de períodos de una
vez con las mismas fechas (por defecto, del mes anterior a dos meses adelante,
desde hoy hasta el fin del mes siguiente al último) y escribe el aviso de cada
mes; si un período ya tenía ventana, se reemplaza. Con varias ventanas
abiertas, la app entra en el mes anterior (o en el actual) si su ventana está
abierta; si no, en la abierta más antigua.

Los formularios viven en Firestore: cambiar sus plantillas base en `js/datos.js`
no toca los ya sembrados. Cuando una plantilla base sube de versión, el inicio
del administrador y **Formularios** muestran «Hay una versión nueva…» con el
botón **Actualizar**, que la publica como versión nueva. Las respuestas se
guardan por id de pregunta, así que envíos y borradores siguen sirviendo.

### Menú del contratista

El contratista ve cuatro apartados: **Inicio** (el tablero del período),
**Cuenta de cobro**, **Generación de informe de gestión** y **Contrato**.

- **Generación de informe de gestión** es donde se hace el informe: mientras
  el del período no se haya enviado (y la ventana esté abierta), el formulario
  está ahí mismo y abre en las **actividades** del contrato, cada una con su
  % de ejecución, descripción y evidencia. Con **0 %**, la descripción se
  llena sola con «Esta actividad no se requirió en este periodo» (se puede
  cambiar) y no pide evidencia. La barra de abajo trae **Vista previa**,
  **Descargar Word** (el Word institucional con lo que va diligenciado, sin
  enviarlo; en el celular el botón dice «Word»), **Guardar** (guarda ya; además
  se guarda solo cada pocos segundos y al volver sigue lo que se dejó, con
  **Empezar de nuevo** para descartarlo) y **Enviar** (pide la firma).
- **Después de enviarlo** se puede **Editar** mientras no esté aprobado ni en
  corrección y la ventana siga abierta: los cambios se guardan aparte (el
  revisor y el validador siguen viendo lo enviado) y quedan el aviso
  «Tienes cambios guardados sin enviar» en la página y «cambios sin enviar»
  en Inicio, hasta pulsar **Enviar de nuevo** (pide la firma otra vez, vuelve
  al revisor y sale de nuevo al correo del validador) o **Descartar cambios**.
  Ya aprobado (o con la ventana cerrada), se cambia con «Solicitar
  corrección»: cuando el revisor abre la corrección, las actividades se vuelven
  editables ahí mismo, con su observación y **Reenviar corrección**. Debajo
  del estado se ve **lo que se envió**, y al final, los informes anteriores
  del contrato. El «Diligenciar» y el «Corregir» de Inicio llevan a esta
  página. La **Cuenta de cobro** funciona igual cuando está habilitada, salvo
  la edición después de enviar (se cambia con «Solicitar corrección»).
- **Cuenta de cobro: deshabilitada por ahora.** Se ve en el menú, en gris, y no
  se pueden diligenciar cuentas de cobro nuevas (las ya enviadas se siguen
  viendo, descargando y corrigiendo). Se habilita en **Parámetros → Procesos del
  contratista**.
- **Mis envíos** y **Solicitudes** ya no van en el menú; se llega a ellas desde
  Inicio («Últimos envíos → Ver todos» e «Ir a solicitudes»).

### Firma en línea del informe

El informe de gestión se firma en la plataforma, sin imprimir:

- **Contratista**: «Enviar» (o «Enviar de nuevo», o «Reenviar corrección»)
  pide **Firmar y enviar**. Propone la firma guardada en **Mi perfil**; si no hay,
  se dibuja en pantalla con el dedo, un lápiz o el mouse, o se sube una imagen,
  y puede quedar guardada para la próxima vez. Quien diligencia en nombre del
  contratista no firma en su lugar: el informe queda enviado y el contratista
  lo firma después desde su cuenta (en **Inicio** sale «falta tu firma» con el
  botón **Firmar**, que abre la firma en la página del informe; se puede
  mientras esté en revisión, no aprobado ni en corrección).
- **Validador**: la aprobación final («Aprobar», del coordinador o de quien
  tenga el último paso) pide **Firmar Vo.Bo. y aprobar**. Las aprobaciones
  intermedias no piden firma.
- **En el Word**: «Firma del contratista» lleva su firma y debajo «Firmado en
  línea el DD/MM/AAAA HH:MM»; «Vo.Bo. VALIDADOR» lleva la firma de quien aprobó
  y «Firmado en línea por <nombre> el …». El Vo.Bo. solo sale mientras el
  informe esté aprobado: si se reabre, desaparece hasta la nueva aprobación, y
  al reenviar la corrección el contratista vuelve a firmar.
- Cada firma se guarda con el envío en `envios/{id}/firmas/contratista` y
  `…/validador` (imagen, quién, rol y fecha y hora). Los envíos anteriores, sin
  firma en línea, siguen saliendo con la firma del perfil.
- En **Mi perfil → Firma para el Word** se puede dibujar o subir la firma.

Requiere publicar `firestore.rules` (ver arriba). Mientras no estén publicadas,
el envío y la aprobación funcionan igual, la app avisa que la firma en línea no
se guardó y el Word usa la firma del perfil.

### Informe al correo del validador

Cada vez que el contratista envía el informe de gestión (o reenvía una
corrección), la app le manda el Word, ya firmado, al **validador del
contrato** por correo, con el flujo `enviarInforme` de Power Automate (ver
[docs/flujos.md](docs/flujos.md#enviarinforme)).

- El correo sale del campo **Correo del validador** del contrato
  (*Información del contrato → Supervisión y validación*; en el Excel de
  importación, la columna `correoValidador`). Lo llenan el administrador o el
  equipo del contrato. La app nunca le dice al flujo a quién escribir: el
  flujo lo lee del contrato.
- El campo llega con la versión 2 de *Información del contrato*: el
  administrador debe pulsar **Actualizar** en el aviso «Hay una versión
  nueva…».
- La URL del flujo va en **Parámetros → enviarInforme**.
- Solo sale **firmado por el contratista**: al enviarlo (o enviarlo de nuevo
  después de editarlo), la app le pide la firma antes de mandar nada. Si otra persona lo envió en su nombre, no va al
  validador hasta que el contratista lo firme (botón **Firmar y enviar al
  validador** en la página del informe, o **Firmar** en Inicio).
- El correo se manda después de mostrar el informe como enviado, sin hacer
  esperar al contratista. Si falla (o falta el correo o el flujo), el informe
  queda enviado igual, la app lo avisa y en la página del informe queda el
  botón **Enviar al validador** para intentarlo de nuevo (si el informe aún
  no tiene la firma del contratista, la pide antes).

### Lector de planillas de seguridad social

En la cuenta de cobro, al adjuntar el PDF de la planilla en **Planillas
pagadas**, la app la lee y llena esa fila: número de planilla, fecha de pago y
lo pagado en salud, pensión y ARL. Los valores quedan como escritos a mano (se
pueden corregir y «Usar lo obligatorio» los vuelve a enlazar) y debajo del PDF
se ve qué se tomó, con avisos si el período o el IBC de la planilla no
coinciden con los de la fila, o si la suma no da el total.

- **Cómo lee**: `py/leer_planilla.py` corre con **Pyodide** (Python compilado a
  WebAssembly) dentro de un Web Worker. Extrae el texto con **pypdf** y combina
  tres lecturas (fila por subsistema, encabezado con los valores debajo y
  «etiqueta: valor») revisadas contra las tarifas (12,5 % salud, 16 % pensión,
  clases de riesgo ARL) y el total. Lo que no encuentra lo deja vacío.
- **Privacidad**: el PDF no sale del navegador de la persona; no hay servidor.
- **Red**: la primera vez descarga unos 10 MB de `cdn.jsdelivr.net` (Pyodide
  0.29.5) y `files.pythonhosted.org` (pypdf 6.19.0, verificado con sha256); luego
  quedan en la caché del navegador. Si la red los bloquea, la app lo avisa y la
  persona escribe los valores a mano como antes. Las planillas cifradas con
  AES cargan además pycryptodome desde el mismo CDN de Pyodide.
- **Planillas escaneadas (OCR)**: si el PDF no tiene texto (un escaneo o una
  foto; también si solo trae el pie de la app de escáner), la app lo lee con
  reconocimiento de texto, también en el navegador: **PDF.js** dibuja las dos
  primeras páginas, el worker empareja el fondo (la sombra de una foto),
  endereza la hoja y borra las líneas de las tablas, **Tesseract.js** reconoce
  el texto en español y Python arma las filas por la posición de cada palabra.
  Como el OCR puede confundir dígitos, solo se llena lo que se puede comprobar:
  cada aporte debe cuadrar con su tarifa sobre un IBC confirmado (el de la
  planilla, el de la fila o el que comparten salud y pensión), el número de
  planilla se lee dos veces y, si no coincide, queda vacío, y la fecha de pago
  debe caer cerca del período. Lo demás queda vacío con el aviso «No se pudo
  leer con seguridad…». Tarda unos segundos por página; la primera vez descarga
  unos 8 MB de `cdn.jsdelivr.net`: PDF.js 6.4.299, Tesseract.js 7.0.0 y el
  modelo del español, en versiones fijas (el script de Tesseract.js que corre en
  la página se verifica con sha384) y el modelo queda guardado en el navegador.
  Si se elige otro archivo mientras lee, la lectura anterior se cancela. Con
  `window.LECTOR_PLANILLA_CONFIG = { ocr: false }` se apaga.
- **No lee** planillas con contraseña de apertura: lo dice y se escriben a mano.
- **Plantilla**: se activa con `lector`, `llenar` y `pistas` en la pregunta
  ARCHIVO (cuenta de cobro versión 5). En una instalación que ya tenía la
  versión 4, el administrador la publica con **Formularios → Actualizar**.
- **En la terminal**, para revisar una planilla:

  ```bash
  pip install pypdf==6.19.0
  python3 py/leer_planilla.py planilla.pdf          # agrega --texto para ver lo que extrae pypdf
  python3 py/leer_planilla.py --tsv pagina.tsv      # una escaneada: tesseract pagina.png pagina -l spa --psm 11 tsv
  python3 py/probar_leer_planilla.py                # pruebas (no necesitan pypdf ni Tesseract)
  ```

### Cuentas: nadie se registra ni activa nada

- **Contratistas**: su cuenta queda lista al crear o importar su contrato. Si
  el correo aún no tiene cuenta, se crea y a la persona le llega un correo para
  definir su contraseña; al abrirlo, el correo queda verificado y entra
  directo. Si el correo ya tiene cuenta, el contrato se vincula a esa.
- **Revisores, coordinadores y administradores**: se crean en **Usuarios** y
  reciben el mismo correo para definir su contraseña.
- **Primera vez: crear mi contraseña** (en el inicio de sesión) vuelve a enviar
  ese enlace si el correo no llegó o se venció.
- **Cuentas con otro rol que también son contratistas** (por ejemplo, el
  administrador con su propio contrato): el contrato se vincula a esa cuenta y
  la persona cambia a **Mi vista de contratista** desde el menú de usuario
  para diligenciar su informe y su cuenta de cobro.
- Los contratos que se crearon antes sin cuenta muestran **Vincular** en
  Contratistas y contratos; los que llevan el correo del propio administrador
  se vinculan solos a su cuenta al entrar.

### Reglas de Firestore

`firestore.rules` exige sesión con el correo verificado y un perfil activo. Lo
que no está declarado queda denegado.

- **Contratista** (la cuenta vinculada en el contrato, sea cual sea su rol): ve
  y escribe solo lo de sus contratos. Envía dentro de la ventana y del límite
  mensual, corrige dentro del plazo y edita sus datos solo cuando el revisor
  abre la edición.
- **Revisor y coordinador**: ven los contratos, envíos y solicitudes donde están
  asignados, y el perfil y la firma de quien tienen asignado (van en el Word).
  Cambian el estado del envío, siempre con una entrada nueva en el historial.
- **Firmas en línea** (`envios/{id}/firmas`): las leen el dueño del envío, su
  equipo y el admin. La del contratista la pone él, con su cuenta, mientras el
  envío está enviado o reenviado; la del Vo.Bo., el equipo del contrato o el
  admin con el envío ya aprobado. Cada una pesa a lo sumo ~150 KB y su hora debe
  estar a menos de 15 minutos de la del servidor.
- **Administrador**: todo, salvo sobrescribir un perfil, contrato o envío
  existente al «crear».
- **Activación de respaldo**: solo si la cuenta ya existía sin perfil cuando se
  creó el contrato. El contratista lee su precarga solo si el correo coincide,
  crea su propio perfil y reclama los contratos precargados con su cédula.
