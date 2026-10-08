# Flujos de Power Automate

La app llama tres flujos. Sus URL se pegan en **Parámetros → Flujos de Power
Automate** y quedan en `parametros/app.flujos`. Si una URL está vacía, la app
avisa y sigue funcionando.

| Flujo | Para qué | Obligatorio |
| --- | --- | --- |
| `subirArchivo` | Guarda en OneDrive o SharePoint los archivos que se adjuntan en los formularios y devuelve el enlace. | Sí, para adjuntar archivos |
| `notificar` | Envía los correos de envío, devolución, solicitud y recordatorio. | No |
| `docxAPdf` | Convierte el Word a PDF desde la vista previa. | No |

## Convención común

- La app hace `POST` con `Content-Type: text/plain;charset=UTF-8` y un cuerpo
  JSON que siempre trae `idToken`, el token de sesión de Firebase de la persona.
  Con `text/plain` el navegador no hace la consulta previa de CORS (*preflight*).
  Por eso en el flujo el cuerpo llega como **texto**, y se lee con
  `json(triggerBody())`. No uses el esquema JSON del disparador.
- El flujo responde JSON. Si todo sale bien: código 2xx. Si algo falla: otro
  código y `{ "ok": false, "mensaje": "…" }`. La app muestra `mensaje` a la
  persona.
- **Toda** respuesta debe llevar el encabezado
  `Access-Control-Allow-Origin: *`. Sin él, el navegador oculta la respuesta y
  la app solo ve «No se pudo conectar con el flujo».
- La URL del flujo es pública en la práctica: la lee cualquier persona con
  sesión en la app. Por eso el flujo **nunca confía en el cliente**. Lee
  Firestore con el token de la persona (`Authorization: Bearer <idToken>`), así
  las reglas de `firestore.rules` validan la sesión y el permiso, y la ubicación
  del archivo sale de Firestore, no de lo que diga la app.
- Power Automate corta la conexión a los **120 s**. La app espera hasta 180 s,
  pero el flujo debe responder antes de los 120 s. Por eso: sin reintentos en
  las acciones, y la respuesta en cuanto exista el enlace.
- El disparador «Cuando se recibe una solicitud HTTP» y la acción «HTTP» son
  **Premium**. El dueño del flujo necesita Power Automate Premium o una licencia
  Process (por flujo). La prueba sirve para construirlo y probarlo, no para el
  uso diario: corre con el perfil de rendimiento «Bajo» (120 MB de contenido
  cada 5 minutos) y cada archivo de 15 MB mueve más de 20 MB, así que varias
  subidas grandes seguidas se frenan y pueden pasar de los 120 s.

## subirArchivo

### Contrato

La app envía, por cada archivo:

| Campo | Contenido |
| --- | --- |
| `idToken` | Token de sesión de Firebase. Dura 1 h; la app lo renueva si le quedan menos de 5 min. |
| `origen` | `borrador` (formulario en curso) o `envio` (corrección de un envío). |
| `docId` | Id del documento en `borradores` o `envios`. La app guarda el borrador **antes** de subir. |
| `preguntaId` | Id de la pregunta del formulario (por ejemplo `soporte` o `evidenciaArchivo`). |
| `nombre` | Nombre del archivo, ya sin `\ / : * ? " < > \|`. El flujo cambia `#` y `%` por `-`. |
| `tipo` | Tipo MIME. |
| `base64` | El archivo en base64, sin `data:…,`. Máximo 15 MB (unos 20 MB en base64). |

Respuesta esperada: `200` con `{ "ok": true, "url": "<enlace para ver el archivo>", "id": "<id en OneDrive>", "nombre": "<nombre en OneDrive>" }`.
Sin `ok: true` y `url`, la app no adjunta nada y avisa a la persona.

### Dónde queda el archivo

```
<carpeta raíz>/<contrato> - <nombre del contratista>/<AAAA-MM>/<formulario>_<pregunta>_<AAAAMMDD-HHmmssfff>_<nombre>
```

Por ejemplo: `…/P-12345-DE-2026 - Ana Pérez/2026-10/cuenta_cobro_soporte_20261008-153000123_planilla.pdf`.
La fecha y hora (de Colombia) hacen único cada nombre, así nunca se sobrescribe
un archivo. En la app se sigue viendo el nombre original.

### Antes de empezar

1. **Cuenta**: crea el flujo con la cuenta **dueña de la carpeta** de OneDrive.
   El conector OneDrive para la Empresa solo escribe en el OneDrive de la
   cuenta de la conexión, aunque otra persona tenga la carpeta compartida. Los
   archivos y sus enlaces viven en el OneDrive de esa cuenta: si la cuenta se
   elimina o pierde la licencia (por ejemplo, al terminar un contrato), los
   enlaces guardados en la app dejan de abrir y el flujo deja de funcionar.
   Agregar copropietarios al flujo no lo evita. Lo ideal es una cuenta
   institucional con licencia que no dependa de una persona.
2. **Ruta de la carpeta raíz**: abre la carpeta en el navegador con esa cuenta.
   Arriba se ve la ruta, por ejemplo «Mis archivos > Bitácora > Soportes». Para
   el flujo esa carpeta es `/Bitácora/Soportes`: sin «Mis archivos» y sin
   «Documentos». El vínculo para compartir (`https://…/:f:/g/personal/…`) **no
   sirve** como ruta.
3. **Licencia Premium** y, si tu organización tiene directivas de datos (DLP),
   que permitan usar «HTTP» y «OneDrive para la Empresa» en el mismo flujo, con
   acceso a `firestore.googleapis.com`.

### Crear el flujo con Copilot

Copilot de Power Automate entiende mejor el inglés y no arma bien las
expresiones largas. Úsalo para el esqueleto y luego pega los valores de la
sección siguiente.

En [make.powerautomate.com](https://make.powerautomate.com) → **Crear con
Copilot**, pega:

```text
When an HTTP request is received (method POST, who can trigger the flow: Anyone, no JSON schema), save the file to OneDrive for Business and return a JSON response. Build it exactly like this:
1. Initialize variable "codigo" (Integer) = 500. Initialize variable "cuerpo" (Object) = {"ok": false, "mensaje": "No se pudo guardar el archivo en OneDrive. Intenta de nuevo; si sigue, avisa al administrador."}
2. Add a Scope named "Intentar" with these actions in order: Compose "Entrada"; HTTP "Leer_documento" (GET, no authentication); HTTP "Leer_contrato" (GET, no authentication); Compose "Contratista"; Compose "Subcarpeta"; Compose "NombreArchivo"; OneDrive for Business "Create file" named "Crear_archivo"; OneDrive for Business "Create share link" named "Crear_vinculo" (link type View, scope Organization); Set variable "Exito_codigo" (codigo = 200); Set variable "Exito_cuerpo" (cuerpo).
3. Add a Scope named "Capturar" that runs only when "Intentar" has failed or has timed out, with: Filter array "Filtrar_fallo" from result('Intentar') where status is equal to Failed; Set variable "Error_codigo" (codigo); Set variable "Error_cuerpo" (cuerpo).
4. After "Capturar", add a Response action named "Respuesta" that runs when "Capturar" is successful, skipped, failed or timed out, with status code variables('codigo'), headers Content-Type: application/json and Access-Control-Allow-Origin: *, and body variables('cuerpo').
```

Si Copilot no está disponible, crea el flujo en blanco («Flujo de nube
instantáneo» → disparador «Cuando se recibe una solicitud HTTP») y agrega las
mismas acciones a mano. Los nombres importan: las expresiones los usan.

### Valores de cada paso

Pega cada expresión en el editor de expresiones (*fx*) del campo, **tal
cual**. Donde dice `/RUTA/DE/TU/CARPETA`, va la ruta de la carpeta raíz.

**1. Cuando se recibe una solicitud HTTP**

- Quién puede desencadenar el flujo: **Cualquiera**. Las otras opciones exigen
  un token de Microsoft que la app no tiene.
- Método: `POST`. Esquema JSON del cuerpo de la solicitud: vacío.

**2. Variables** (fuera de los ámbitos)

- `codigo` · Entero · `500`
- `cuerpo` · Objeto ·
  `{"ok": false, "mensaje": "No se pudo guardar el archivo en OneDrive. Intenta de nuevo; si sigue, avisa al administrador."}`

**3. Ámbito «Intentar»**

`Entrada` (Redactar) · Entradas:
<!-- expr:Entrada -->
```
removeProperty(json(triggerBody()), 'base64')
```

`Leer_documento` (HTTP) · Método `GET` · Autenticación: ninguna · URI:
<!-- expr:URI_Leer_documento -->
```
concat('https://firestore.googleapis.com/v1/projects/bitacora-contratistas/databases/(default)/documents/', if(equals(outputs('Entrada')?['origen'], 'envio'), 'envios', 'borradores'), '/', uriComponent(outputs('Entrada')?['docId']), '?mask.fieldPaths=contratoId&mask.fieldPaths=formularioId&mask.fieldPaths=periodo')
```
Encabezados: `Authorization` =
<!-- expr:Authorization -->
```
concat('Bearer ', outputs('Entrada')?['idToken'])
```

`Leer_contrato` (HTTP) · Método `GET` · el mismo encabezado `Authorization` · URI:
<!-- expr:URI_Leer_contrato -->
```
concat('https://firestore.googleapis.com/v1/projects/bitacora-contratistas/databases/(default)/documents/contratos/', uriComponent(body('Leer_documento')?['fields']?['contratoId']?['stringValue']), '?mask.fieldPaths=info.contratista.nombreCompleto')
```
Leer el contrato con el token de la persona es el control de permiso: las
reglas solo lo dejan leer a su dueño, a su equipo o al administrador. Sin este
paso, alguien podría escribir un borrador que apunte al contrato de otra
persona y guardar archivos en su carpeta.

`Contratista` (Redactar): el nombre sin caracteres que OneDrive no admite en
carpetas.
<!-- expr:Contratista -->
```
trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(body('Leer_contrato')?['fields']?['info']?['mapValue']?['fields']?['contratista']?['mapValue']?['fields']?['nombreCompleto']?['stringValue'], ''), '.', ''), '/', '-'), decodeUriComponent('%5C'), '-'), ':', '-'), '*', '-'), '?', '-'), decodeUriComponent('%22'), '-'), '<', '-'), '>', '-'), '|', '-'), '#', '-'), '%', '-'), '~', '-'))
```

`Subcarpeta` (Redactar):
<!-- expr:Subcarpeta -->
```
concat(body('Leer_documento')?['fields']?['contratoId']?['stringValue'], if(empty(outputs('Contratista')), '', concat(' - ', outputs('Contratista'))), '/', body('Leer_documento')?['fields']?['periodo']?['stringValue'])
```

`NombreArchivo` (Redactar):
<!-- expr:NombreArchivo -->
```
concat(body('Leer_documento')?['fields']?['formularioId']?['stringValue'], '_', outputs('Entrada')?['preguntaId'], '_', convertFromUtc(utcNow(), 'SA Pacific Standard Time', 'yyyyMMdd-HHmmssfff'), '_', replace(replace(outputs('Entrada')?['nombre'], '#', '-'), '%', '-'))
```

`Crear_archivo` (OneDrive para la Empresa → Crear archivo):

- Ruta de acceso de carpeta:
  <!-- expr:Ruta -->
  ```
  concat('/RUTA/DE/TU/CARPETA/', outputs('Subcarpeta'))
  ```
  Si las subcarpetas no existen, «Crear archivo» las crea al guardar el
  primer archivo. Así funciona hoy el conector, pero Microsoft no lo
  documenta: compruébalo en la prueba (dentro de la carpeta raíz deben
  aparecer `<contrato> - <nombre>/<AAAA-MM>`). Por lo mismo, una ruta raíz mal
  escrita no da error: crea otra carpeta.
- Nombre de archivo: `outputs('NombreArchivo')`
- Contenido del archivo:
  <!-- expr:Contenido -->
  ```
  base64ToBinary(json(triggerBody())?['base64'])
  ```
  No copies el base64 a variables ni a «Redactar»: es grande y llena el
  historial.

  Al guardar, al salir y volver, o con solo seleccionar la acción, el
  diseñador muestra este campo como `json(triggerBody())?['base64']`, sin
  `base64ToBinary`. Es normal: la función sigue en el flujo (compruébalo en la
  pestaña «Vista de código» de la acción). **No edites ese campo**: si lo
  editas, el diseñador sí borra la función y el archivo se guarda como texto.
  Si tienes que cambiarlo, bórralo completo y vuelve a pegar la expresión con
  *fx*.

`Crear_vinculo` (OneDrive para la Empresa → Crear vínculo de recurso
compartido): Archivo = `body('Crear_archivo')?['Id']` · Tipo de vínculo: **Ver**
· Ámbito de vínculo: **Organización**. Así el enlace solo abre con una cuenta
de la organización (no para invitados). Si quienes revisan son externos, elige
la opción anónima (en el diseñador aparece como «Anónimo» o «Anonymous»; en
OneDrive web se llama «Cualquier persona»), si tu organización lo permite.
Pregunta a TI si en tu organización caducan los vínculos: si caducan, los
enlaces guardados en la app dejarán de abrir pasado ese plazo, aunque el
archivo siga en la carpeta.

`Exito_codigo` (Establecer variable): `codigo` = `200`.

`Exito_cuerpo` (Establecer variable): `cuerpo` =

```
{"ok": true, "url": "@{body('Crear_vinculo')?['WebUrl']}", "id": "@{body('Crear_archivo')?['Id']}", "nombre": "@{body('Crear_archivo')?['Name']}"}
```

En el diseñador: escribe el JSON y pon cada valor con *fx* dentro de las
comillas.

**4. Ámbito «Capturar»**

Configuración → Ejecutar después de: «Intentar» **ha fallado** y **ha agotado
el tiempo de espera** (desmarca «es correcto»).

`Filtrar_fallo` (Filtrar matriz): Desde = `result('Intentar')` · condición:
`item()?['status']` es igual a `Failed`.

`Error_codigo` (Establecer variable): `codigo` =
<!-- expr:codigo_error -->
```
if(contains(createArray('Leer_documento', 'Leer_contrato'), first(body('Filtrar_fallo'))?['name']), 403, 500)
```

`Error_cuerpo` (Establecer variable): `cuerpo` = `{"ok": false, "mensaje": "<fx>"}`, con esta expresión dentro de las comillas:
<!-- expr:mensaje_error -->
```
if(contains(createArray('Leer_documento', 'Leer_contrato'), first(body('Filtrar_fallo'))?['name']), 'No se pudo verificar tu sesión o tu permiso sobre este formulario. Recarga la página e inténtalo de nuevo.', 'No se pudo guardar el archivo en OneDrive. Intenta de nuevo; si sigue, avisa al administrador.')
```

**5. Respuesta** (fuera de los ámbitos)

- Configuración → Ejecutar después de: «Capturar» **es correcto**, **se ha
  omitido**, **ha fallado** y **ha agotado el tiempo de espera**. Así responde
  siempre, salga bien o mal.
- Código de estado: `variables('codigo')` · Cuerpo: `variables('cuerpo')`.
- Encabezados: `Content-Type` = `application/json` y
  `Access-Control-Allow-Origin` = `*`.
- «Respuesta asincrónica»: desactivada.

**6. Configuración de las acciones**

- En `Leer_documento`, `Leer_contrato`, `Crear_archivo` y `Crear_vinculo`:
  Configuración → Directiva de reintentos: **Ninguno**. Los reintentos por
  defecto pueden pasar de los 120 s; si algo falla, la persona lo vuelve a
  intentar.
- Opcional, para ver en rojo las ejecuciones con error: después de
  «Respuesta», una condición `codigo` mayor o igual que 500 con «Terminar»
  (estado: Error) en la rama «Sí». Nunca antes de «Respuesta».

### Probar y conectar

1. Guarda el flujo y copia la URL del disparador (aparece al guardar por
   primera vez; empieza por `https://` y termina con `sig=…`). Pégala en
   **Parámetros → subirArchivo (OneDrive o SharePoint)** y guarda.
2. En la app, abre un formulario y adjunta un PDF pequeño. Debe quedar el
   enlace en la fila y el archivo en `<carpeta raíz>/<contrato> - <nombre>/<período>`.
3. Abre el enlace y verifica que el archivo se ve bien.
4. En DevTools (F12) → Red, abre la solicitud al flujo: en la respuesta debe
   haber **un solo** `Access-Control-Allow-Origin`. Si sale dos veces, quítalo
   de la acción «Respuesta».
5. Cuando funcione, activa **Entradas seguras** y **Salidas seguras**
   (Configuración → Seguridad) en el disparador, `Entrada`, `Leer_documento`,
   `Leer_contrato` y `Crear_archivo`. Así el token y el archivo no quedan
   visibles en el historial de ejecuciones.

### Problemas frecuentes

| La app dice… | Causa probable | Qué hacer |
| --- | --- | --- |
| «El flujo «subirArchivo» no está configurado en Parámetros» | Falta la URL. | Pégala en Parámetros. |
| «No se pudo conectar con el flujo…» | La respuesta no trae `Access-Control-Allow-Origin` (o lo trae dos veces). También: flujo apagado, «Quién puede desencadenar» distinto de «Cualquiera», o pasaron los 120 s. | Revisa la acción «Respuesta» y el historial de ejecuciones. |
| «No se pudo verificar tu sesión o tu permiso…» | Falló `Leer_documento` o `Leer_contrato`. Firestore respondió 401 (token), 403 (reglas) o 404, o el proyecto de la URI no es `bitacora-contratistas`. | Mira el código en el historial. Con 403 o 404, la persona debe recargar la página; si sigue, revisa que el contrato sea suyo. |
| «No se pudo guardar el archivo en OneDrive…» | Ruta con el vínculo para compartir (`https://…`), conexión de otra cuenta, o OneDrive limitó las solicitudes. | Revisa `Crear_archivo` en el historial. |
| El enlace abre, pero el archivo no está en la carpeta raíz | La ruta raíz quedó mal escrita (por ejemplo con «Mis archivos» o «Documentos») y el conector creó otra carpeta. | Busca el archivo por su nombre en OneDrive y corrige `/RUTA/DE/TU/CARPETA`. |
| «El flujo no devolvió el enlace del archivo» | No hay acción «Respuesta», tiene «Respuesta asincrónica» activada, o el cuerpo no trae `ok` y `url`. | Revisa la acción «Respuesta». |
| El archivo se abre dañado o contiene texto | Se editó «Contenido del archivo» después de guardar y el diseñador borró `base64ToBinary()`, que hasta entonces solo estaba oculto. | En la pestaña «Vista de código» de `Crear_archivo`, verifica que diga `base64ToBinary(json(triggerBody())?['base64'])`; si no, borra el campo y vuelve a pegar la expresión completa. |
| El enlace no abre para alguien | El vínculo es de «Organización» y la persona entra con una cuenta de fuera o de invitado, o la organización hace caducar los vínculos. | Para externos, usa el ámbito anónimo si tu organización lo permite. Si caducan, el archivo sigue en la carpeta: pide a TI una excepción. |

Si la URL se filtra o hay abuso, regenera la clave del disparador (menú del
flujo → regenerar la clave de acceso) y pega la URL nueva en Parámetros.

## notificar

La app envía `{ idToken, evento, coleccion, docId }`, con `evento` igual a
`envio`, `devolucion`, `solicitud` o `recordatorio`, y espera `200` con
`{ "ok": true }`. Cada intento queda registrado en `notificaciones`. Igual que
`subirArchivo`, el flujo lee el documento (`coleccion/docId`) con el token para
armar destinatarios y mensaje, y responde con `Access-Control-Allow-Origin: *`.

## docxAPdf

La app envía `{ idToken, nombre, base64 }`, con el Word en base64 (máximo
10 MB), y espera `200` con `{ "ok": true, "base64Pdf": "<PDF en base64>" }`.
