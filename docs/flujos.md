# Flujos de Power Automate

La app llama tres flujos. Sus URL se pegan en **Parámetros → Flujos de Power
Automate** y quedan en `parametros/app.flujos`. Si una URL está vacía, la app
avisa y sigue funcionando.

| Flujo | Para qué | Obligatorio |
| --- | --- | --- |
| `subirArchivo` | Guarda en OneDrive o SharePoint los archivos que se adjuntan en los formularios y devuelve el enlace. | Sí, para adjuntar archivos |
| `notificar` | Envía los correos de envío, devolución, aprobación, solicitud y recordatorio. | No |
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
Sin un `url` que empiece por `https://`, la app no adjunta nada y avisa a la persona.

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
When an HTTP request is received (method POST, who can trigger the flow: Anyone, no JSON schema), save the file to OneDrive for Business and return a JSON response. Build it exactly like this and give each action the exact name in quotes:
1. Initialize variable "codigo" (Integer) = 500. Initialize variable "cuerpo" (Object) = {"ok": false, "mensaje": "No se pudo guardar el archivo en OneDrive. Intenta de nuevo; si sigue, avisa al administrador."}
2. Add a Scope named "Intentar" with these actions in order: Compose named "Entrada"; built-in HTTP action named "Leer_documento" (GET, no authentication); built-in HTTP action named "Leer_contrato" (GET, no authentication); Compose named "Contratista"; Compose named "Subcarpeta"; Compose named "NombreArchivo"; OneDrive for Business "Create file" named "Crear_archivo"; OneDrive for Business "Create share link" named "Crear_vinculo" (link type View, scope Organization); Set variable action named "Exito_codigo" that sets variable "codigo" to 200; Set variable action named "Exito_cuerpo" that sets variable "cuerpo".
3. Add a Scope named "Capturar" that runs only when "Intentar" has failed or has timed out, with: Filter array named "Filtrar_fallo" from result('Intentar') where status is equal to Failed; Set variable action named "Error_codigo" that sets variable "codigo"; Set variable action named "Error_cuerpo" that sets variable "cuerpo".
4. After "Capturar", add a Response action named "Respuesta" that runs when "Capturar" is successful, skipped, failed or timed out, with status code variables('codigo'), headers Content-Type: application/json and Access-Control-Allow-Origin: *, and body variables('cuerpo').
```

Envía el texto. Cuando Copilot muestre la propuesta, continúa (*Keep it and
continue*). Confirma que la conexión de OneDrive para la Empresa tenga la marca
verde y sea la de la cuenta dueña de la carpeta, y pulsa **Crear flujo**.

**Revisa lo que armó Copilot antes de pegar nada.** No siempre sigue el texto
al pie de la letra: puede omitir acciones, dejarlas fuera de un ámbito, elegir
otra acción o cambiar los nombres. Compara con la sección siguiente y corrige a
mano:

- Son 18 acciones: 2 «Inicializar variable»; el ámbito «Intentar» con 10
  adentro; el ámbito «Capturar» con 3; y «Respuesta» fuera de los dos. Lo que
  falte se agrega con el **+** que aparece dentro del recuadro del ámbito (para
  «Respuesta», con el **+** de debajo de «Capturar»).
- `Leer_documento` y `Leer_contrato` deben ser la acción «HTTP» (no «Enviar una
  solicitud HTTP a SharePoint» ni «HTTP con Microsoft Entra ID»).
  `Crear_archivo` y `Crear_vinculo` deben ser de «OneDrive para la Empresa».
- Cada acción debe llamarse **exactamente** como aquí, con las mismas
  mayúsculas y guiones bajos: las expresiones usan esos nombres y, si uno no
  coincide, el flujo no se deja guardar. Para renombrar, haz clic en la
  acción; en el panel, haz clic en su nombre (arriba), escribe el nuevo y
  presiona Enter. Renombra **antes** de pegar las expresiones.

Si Copilot no está disponible, crea el flujo en blanco («Flujo de nube
instantáneo» → disparador «Cuando se recibe una solicitud HTTP») y agrega las
mismas acciones a mano, con los mismos nombres.

### Valores de cada paso

**Cómo pegar una expresión.** Todo valor con paréntesis (como
`variables('codigo')`, `outputs('NombreArchivo')`, `body('Crear_archivo')?['Id']`
o `result('Intentar')`) es una expresión: haz clic en el campo, pulsa el botón
*fx* que aparece a su lado (o escribe `/` y elige «Insertar expresión»), pega
la expresión **tal cual** y pulsa **Agregar**. En el campo debe quedar una
ficha (un recuadro de color); si ves el texto suelto, quedó como texto y no
funcionará: bórralo y repite. Los valores sueltos se escriben directo, sin
*fx*: `POST`, `GET`, `200`, `500`, `Failed`, `application/json`, `*` y los
nombres de los encabezados (`Authorization`, `Content-Type`,
`Access-Control-Allow-Origin`).

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
  Cambia solo `/RUTA/DE/TU/CARPETA` por la ruta de la carpeta raíz y **deja la
  barra final**. Con la carpeta del ejemplo queda
  `concat('/Bitácora/Soportes/', outputs('Subcarpeta'))`. Sin esa barra, los
  archivos terminan en una carpeta nueva llamada `SoportesP-…`, sin aviso.

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

`Exito_cuerpo` (Establecer variable): en `cuerpo`, escribe
`{"ok": true, "url": "", "id": "", "nombre": ""}`. Luego pon el cursor entre
cada par de comillas vacías e inserta con *fx* esta expresión (sin `@{` ni
`}`):

- en `url`: `body('Crear_vinculo')?['WebUrl']`
- en `id`: `body('Crear_archivo')?['Id']`
- en `nombre`: `body('Crear_archivo')?['Name']`

Al terminar, la pestaña «Vista de código» de la acción debe mostrar:

```
{"ok": true, "url": "@{body('Crear_vinculo')?['WebUrl']}", "id": "@{body('Crear_archivo')?['Id']}", "nombre": "@{body('Crear_archivo')?['Name']}"}
```

**4. Ámbito «Capturar»**

Configuración → Ejecutar después de: en «Intentar», marca **Error** y **Ha
agotado el tiempo de espera**, y al final desmarca **Correcto** (la última
casilla marcada no se puede quitar; por eso va de último).

`Filtrar_fallo` (Filtrar matriz): Desde = `result('Intentar')` · condición:
`item()?['status']` es igual a `Failed`.

`Error_codigo` (Establecer variable): `codigo` =
<!-- expr:codigo_error -->
```
if(contains(createArray('Leer_documento', 'Leer_contrato'), first(body('Filtrar_fallo'))?['name']), 403, 500)
```

`Error_cuerpo` (Establecer variable): en `cuerpo`, escribe
`{"ok": false, "mensaje": ""}` y, entre las comillas vacías de `mensaje`,
inserta con *fx* esta expresión:
<!-- expr:mensaje_error -->
```
if(contains(createArray('Leer_documento', 'Leer_contrato'), first(body('Filtrar_fallo'))?['name']), 'No se pudo verificar tu sesión o tu permiso sobre este formulario. Recarga la página e inténtalo de nuevo.', 'No se pudo guardar el archivo en OneDrive. Intenta de nuevo; si sigue, avisa al administrador.')
```

**5. Respuesta** (fuera de los ámbitos)

- Configuración → Ejecutar después de: en «Capturar», marca las cuatro
  casillas: **Correcto**, **Ha agotado el tiempo de espera**, **Se ha omitido**
  y **Error**. Así responde siempre, salga bien o mal (si falta «Se ha
  omitido», en las subidas correctas no hay respuesta).
- Código de estado: `variables('codigo')` · Cuerpo: `variables('cuerpo')`.
- Encabezados: `Content-Type` = `application/json` y
  `Access-Control-Allow-Origin` = `*`.
- «Respuesta asincrónica»: desactivada.

**6. Configuración de las acciones**

- En `Leer_documento`, `Leer_contrato`, `Crear_archivo` y `Crear_vinculo`:
  Configuración → Redes → Directiva de reintentos: **Ninguno**. Los reintentos
  por defecto pueden pasar de los 120 s; si algo falla, la persona lo vuelve a
  intentar.
- Opcional, para ver en rojo las ejecuciones con error: después de
  «Respuesta», agrega una «Condición». Valor izquierdo: `variables('codigo')`
  (con *fx*). Operador: **es mayor o igual que** (puede verse como **≥**).
  Valor derecho: `500`. En la rama **True** agrega «Terminar» y deja el estado
  que trae por defecto (*Failed*). Nunca antes de «Respuesta».

### Probar y conectar

1. Guarda el flujo. Luego haz clic en la tarjeta «Cuando se recibe una
   solicitud HTTP»: el campo «HTTP URL» (puede decir «Dirección URL HTTP») ya
   tiene la dirección; solo se llena después del primer guardado. Cópiala con
   el ícono de copiar que tiene al lado: empieza por `https://` y termina con
   `sig=…`. Pégala en **Parámetros → subirArchivo (OneDrive o SharePoint)** y
   pulsa «Guardar cambios». Quien ya tenía la app abierta debe recargarla (F5).
2. En la app, abre un formulario y adjunta un PDF pequeño. Debe quedar el
   enlace en la fila y el archivo en `<carpeta raíz>/<contrato> - <nombre>/<período>`.
3. Abre el enlace y verifica que el archivo se ve bien.
4. En DevTools (F12) → Red, abre la solicitud al flujo: en la respuesta debe
   haber **un solo** `Access-Control-Allow-Origin`. Si sale dos veces, quítalo
   de la acción «Respuesta».
5. Cuando funcione, activa la seguridad (Configuración → Seguridad):
   **Entradas seguras** y **Salidas seguras** en el disparador,
   `Leer_documento`, `Leer_contrato`, `Crear_archivo` y `Filtrar_fallo`. En
   `Entrada` (Redactar) solo existe **Entradas seguras**: actívala; también
   oculta sus salidas. Así el token y el archivo no quedan visibles en el
   historial de ejecuciones.

### Problemas frecuentes

La app muestra cada error así: «No se pudo subir «archivo»: *mensaje*».

| La app dice… | Causa probable | Qué hacer |
| --- | --- | --- |
| «El flujo «subirArchivo» no está configurado en Parámetros» | Falta la URL o no empieza por `https://`, o la persona abrió la app antes de que se guardara la URL. | Pégala en Parámetros y pulsa «Guardar cambios». Quien ya tenía la app abierta debe recargarla (F5). |
| «No se pudo conectar con el flujo…» | La respuesta no trae `Access-Control-Allow-Origin` (o lo trae dos veces). También: flujo apagado, «Quién puede desencadenar» distinto de «Cualquiera», o pasaron los 120 s. | Revisa la acción «Respuesta» y el historial de ejecuciones. |
| «No se pudo verificar tu sesión o tu permiso…» | Falló `Leer_documento` o `Leer_contrato`. Firestore respondió 401 (token), 403 (reglas) o 404, o el proyecto de la URI no es `bitacora-contratistas`. | Mira el código en el historial. Con 403 o 404, la persona debe recargar la página; si sigue, revisa que el contrato sea suyo. |
| «No se pudo guardar el archivo en OneDrive…» | Falló una acción de «Intentar» que no lee Firestore: ruta con el vínculo para compartir, conexión de otra cuenta, OneDrive limitó las solicitudes, la organización no permite ese tipo de vínculo, o una expresión quedó como texto. | En el historial, abre «Intentar» y mira qué acción quedó en rojo. Si es `Crear_vinculo`, el archivo sí se guardó pero el vínculo no: usa «Organización». Si es `Crear_archivo`, revisa la ruta y la conexión. Si es otra, vuelve a pegar su expresión con *fx*. |
| El enlace abre, pero el archivo no está en la carpeta raíz | La ruta raíz quedó mal escrita (por ejemplo con «Mis archivos» o «Documentos») y el conector creó otra carpeta. | Busca el archivo por su nombre en OneDrive y corrige `/RUTA/DE/TU/CARPETA`. |
| «El flujo no devolvió el enlace del archivo…» | No hay acción «Respuesta», tiene «Respuesta asincrónica» activada, o el cuerpo no trae `url`. | Revisa la acción «Respuesta». |
| «El flujo «subirArchivo» respondió 401» (o 403, 504…) | Respondió la propia plataforma, no el flujo: «Quién puede desencadenar» no es «Cualquiera», falta la licencia Premium, o el flujo no respondió en 120 s (504). | Revisa el disparador y, en el historial, qué acción tardó o falló; los reintentos deben estar en «Ninguno». |
| «El flujo «subirArchivo» no respondió a tiempo» | Pasaron más de 3 minutos entre subir el archivo y recibir la respuesta: conexión lenta o archivo grande. | Prueba con mejor conexión o con un archivo más liviano. |
| «Sin conexión: no se pudo guardar el borrador antes de subir…» | La persona no tiene red. | Que revise la conexión y vuelva a intentarlo. |
| El archivo se abre dañado o contiene texto | Se editó «Contenido del archivo» después de guardar y el diseñador borró `base64ToBinary()`, que hasta entonces solo estaba oculto. | En la pestaña «Vista de código» de `Crear_archivo`, verifica que diga `base64ToBinary(json(triggerBody())?['base64'])`; si no, borra el campo y vuelve a pegar la expresión completa. |
| El enlace no abre para alguien | El vínculo es de «Organización» y la persona entra con una cuenta de fuera o de invitado, o la organización hace caducar los vínculos. | Para externos, usa el ámbito anónimo si tu organización lo permite. Si caducan, el archivo sigue en la carpeta: pide a TI una excepción. |

Si la URL se filtra o hay abuso, **apaga el flujo** de inmediato (Mis flujos →
el flujo → «Desactivar»): deja de aceptar solicitudes, aunque nadie podrá
adjuntar hasta que lo resuelvas. Power Automate no tiene un botón para cambiar
la clave. La salida sencilla: crea una copia con «Guardar como» (la copia tiene
otra URL), actívala, copia la URL de su disparador, pégala en Parámetros y
elimina el flujo original. La otra opción es el procedimiento oficial [Volver a
generar la clave SAS](https://learn.microsoft.com/es-es/power-automate/regenerate-sas-key),
que usa las herramientas de desarrollo del navegador (F12); si no te sientes
seguro, pide ayuda a TI.

## notificar

La app envía `{ idToken, evento, coleccion, docId }`, con `evento` igual a
`envio`, `devolucion`, `aprobacion`, `solicitud` o `recordatorio`, y espera `200` con
`{ "ok": true }`. Cada intento queda registrado en `notificaciones`. Igual que
`subirArchivo`, el flujo lee el documento (`coleccion/docId`) con el token para
armar destinatarios y mensaje, y responde con `Access-Control-Allow-Origin: *`.

## docxAPdf

La app envía `{ idToken, nombre, base64 }`, con el Word en base64 (máximo
10 MB), y espera `200` con `{ "ok": true, "base64Pdf": "<PDF en base64>" }`.
