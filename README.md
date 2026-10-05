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
| `js/ui-base.jsx` … `js/app.jsx` | Interfaz React: componentes base, acceso, layout, motor de formularios, pantallas por rol y raíz de la app. |
| `firestore.rules` | Reglas de seguridad de Firestore por rol. |
| `firestore.indexes.json` | Índices compuestos que necesitan las consultas de envíos y solicitudes. |
| `firebase.json` | Configuración para publicar reglas e índices con la CLI de Firebase. |

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
   Automate), los **contratos** y las **Ventanas** del período.

### Reglas de Firestore

`firestore.rules` exige sesión con el correo verificado y un perfil activo. Lo
que no está declarado queda denegado.

- **Contratista**: ve y escribe solo lo de sus contratos. Envía dentro de la
  ventana y del límite mensual, corrige dentro del plazo y edita sus datos solo
  cuando el revisor abre la edición.
- **Revisor y coordinador**: ven los contratos, envíos y solicitudes donde están
  asignados. Cambian el estado del envío, siempre con una entrada nueva en el
  historial.
- **Administrador**: todo, salvo sobrescribir un perfil, contrato o envío
  existente al «crear».
- **Activación**: el contratista lee su precarga solo si el correo coincide,
  crea su propio perfil y reclama los contratos precargados con su cédula.
