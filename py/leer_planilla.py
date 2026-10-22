"""Lector de planillas de seguridad social (PILA) en PDF.

Lee el comprobante que el contratista descarga de su operador de información
(SOI, Aportes en Línea, Mi Planilla, Asopagos, Enlace Operativo…) y saca de una
vez: número de planilla, fecha de pago, períodos, IBC y lo pagado en salud,
pensión y ARL (además del fondo de solidaridad y la caja, si aparecen).

Dónde corre:
  - En el navegador, con Pyodide (Python compilado a WebAssembly) dentro de un
    Web Worker: ver js/lector-planilla.js. El PDF no sale del equipo.
  - En la terminal, con CPython, para revisar una planilla a mano:
        pip install pypdf==6.19.0
        python3 py/leer_planilla.py planilla.pdf

Planillas escaneadas: el navegador las pasa por OCR (Tesseract.js) y manda aquí
las palabras con su posición (TSV de Tesseract); leer_ocr() arma las filas y,
como el OCR confunde dígitos, solo deja los valores que cuadran con las tarifas.

Los operadores no comparten un formato, así que la lectura combina estrategias
(fila por subsistema, encabezado con los valores debajo y «etiqueta: valor») y
después revisa la coherencia con las tarifas y el total. Lo que no encuentre
queda vacío para escribirlo a mano: nada se adivina.

Estructura:
  1. Constantes (palabras clave, tarifas, meses)
  2. Utilidades de texto (normalizar, montos, fechas, períodos)
  3. Texto del PDF (pypdf, modos «layout» y «plain») y del OCR (palabras de Tesseract por columnas)
  4. Búsqueda de campos
  5. Coherencia y resultado (con la validación de lo leído por OCR)
  6. Uso desde la terminal
"""
import datetime
import io
import json
import re
import sys
import unicodedata

# ===== 1. Constantes =====
TARIFA_SALUD = 0.125          # independientes: 12,5 % del IBC
TARIFA_PENSION = 0.16         # 16 % del IBC
TARIFA_FSP = 0.01             # fondo de solidaridad pensional desde 4 SMMLV (puede ser más)
TARIFAS_ARL = (0.00522, 0.01044, 0.02436, 0.0435, 0.0696)
# Un aporte o un IBC cae en este rango; fuera de él es un día, un código, una cédula o un NIT.
MONTO_MIN, MONTO_MAX = 5000, 60_000_000

# Nombres compuestos que se reducen antes de buscar (evitan que «Compensar EPS» cuente como caja
# y como salud, o que «Fondo de Solidaridad Pensional» cuente como pensión).
CANONICOS = [
    (r'FONDO\s+DE\s+SOLIDARIDAD\s+PENSIONAL', ' FSP '),
    (r'ADMINISTRADORA\s+DE\s+FONDOS?\s+DE\s+PENSIONES(?:\s+Y\s+CESANTIAS)?', ' AFP '),
    (r'FONDOS?\s+DE\s+PENSIONES(?:\s+Y\s+CESANTIAS)?', ' AFP '),
    (r'CAJA\s+DE\s+COMPENSACION(?:\s+FAMILIAR)?', ' CCF '),
    (r'(?:COMPENSAR|COMFENALCO(?:\s+VALLE)?|SURA(?:MERICANA)?|SANITAS|COOMEVA)\s+E\.?P\.?S\b', ' EPS '),
    (r'\bE\.?P\.?S\.?\s+(?:SURA(?:MERICANA)?|SANITAS|COMPENSAR|FAMISANAR|COOMEVA)\b', ' EPS '),
    (r'\bA\.?R\.?L\.?\s+(?:SURA|POSITIVA|COLMENA|BOLIVAR|AXA\s+COLPATRIA|LIBERTY|EQUIDAD)\b', ' ARL '),
    (r'\b(?:SURA|POSITIVA|COLMENA|BOLIVAR|AXA\s+COLPATRIA)\s+A\.?R\.?L\b', ' ARL '),
    (r'RIESGOS\s+(?:LABORALES|PROFESIONALES)(?:\s+SURA)?', ' ARL '),
]
# Palabras clave por subsistema (texto ya normalizado: mayúsculas, sin tildes, canónicos aplicados).
CLAVES = [
    ('fsp', r'\bFSP\b|SOLIDARIDAD|SUBSISTENCIA'),
    ('arl', r'\bA\.?R\.?L\b|\bA\.?R\.?P\b|\bRIESGOS?\b|POSITIVA|COLMENA|AXA\s+COLPATRIA|LIBERTY\s+SEGUROS'),
    ('pension', r'PENSION|\bA\.?F\.?P\b|COLPENSIONES|PORVENIR|PROTECCION(?!\s+DE\s+(?:DATOS|LA))|COLFONDOS|SKANDIA'),
    ('salud', r'\bSALUD\b|\bE\.?P\.?S\b|NUEVA\s+EPS|SANITAS|FAMISANAR|COOSALUD|MUTUAL\s+SER|ALIANSALUD|EMSSANAR|SURAMERICANA'),
    ('ccf', r'\bC\.?C\.?F\b|COMFAMA|COMFENALCO|CAFAM|COLSUBSIDIO|COMFANDI|COMPENSAR'),
]
CLAVES = [(k, re.compile(p)) for k, p in CLAVES]
OTRAS_COLUMNAS = [('total', re.compile(r'\bTOTAL(?:ES)?\b')), ('ibc', re.compile(r'\bI\.?B\.?C\b'))]
SUBSISTEMAS = ('salud', 'pension', 'arl', 'fsp', 'ccf')

MESES = {'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4, 'MAYO': 5, 'JUNIO': 6, 'JULIO': 7, 'AGOSTO': 8,
         'SEPTIEMBRE': 9, 'SETIEMBRE': 9, 'OCTUBRE': 10, 'NOVIEMBRE': 11, 'DICIEMBRE': 12,
         'ENE': 1, 'FEB': 2, 'MAR': 3, 'ABR': 4, 'MAY': 5, 'JUN': 6, 'JUL': 7, 'AGO': 8, 'SEP': 9, 'SET': 9,
         'OCT': 10, 'NOV': 11, 'DIC': 12, 'JAN': 1, 'APR': 4, 'AUG': 8, 'DEC': 12}
MES = '|'.join(sorted(MESES, key=len, reverse=True))

OPERADORES = [('Aportes en Línea', r'APORTES\s+EN\s+LINEA'), ('SOI', r'\bSOI\b|SERVICIO\s+DE\s+OPERACION\s+DE\s+INFORMACION'),
              ('Mi Planilla', r'MI\s*PLANILLA'), ('Asopagos', r'ASOPAGOS'), ('Enlace Operativo', r'ENLACE\s+OPERATIVO|\bARUS\b'),
              ('Simple', r'\bSIMPLE\s+S\.?A'), ('Pila Fácil', r'PILA\s+FACIL')]

# ===== 2. Utilidades de texto =====
def normalizar(texto):
    """Mayúsculas, sin tildes ni ligaduras («ﬁ» → «FI»), espacios raros como espacios."""
    t = unicodedata.normalize('NFKD', texto or '')
    t = ''.join(c for c in t if not unicodedata.combining(c))
    t = t.replace(' ', ' ').replace(' ', ' ').replace(' ', ' ').replace('\t', '    ')
    return t.upper()


def canonizar(linea):
    for patron, reemplazo in CANONICOS:
        linea = re.sub(patron, lambda m: reemplazo.center(len(m.group(0))), linea)  # misma longitud: columnas intactas
    return linea


# Un monto: «$ 1.234.567», «250,000.00», «10.500», «580500». No si va pegado a letras, guiones, barras o
# dos puntos (NIT «800.088.702-2», fechas, horas, códigos «EPS010») ni si es un porcentaje («12,50 %»).
TOKEN_MONTO = re.compile(r'(?<![\w.,:/-])(\$\s?)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\w%/:-]|\s?%|[.,]\d)')
# Palabras que anuncian identificadores: en esa línea solo cuentan los montos con «$».
IDENTIFICADORES = re.compile(r'\bNIT\b|\bC\.?\s?C\.?(?=\s|:|$)|CEDULA|IDENTIFICACION|DOCUMENTO|PLANILLA|REFERENCIA|APROBACION|AUTORIZACION|\bCUS\b|TELEFONO|CELULAR|RADICADO|PIN\b|PERIODO|FECHA')


def a_monto(texto):
    """«1.234.567» / «1,234,567.00» / «1.234.567,00» / «580500» → 1234567 (pesos, redondeado)."""
    t = re.sub(r'[\s$]', '', texto or '')
    if not t or not re.fullmatch(r'[\d.,]+', t):
        return None
    if ',' in t and '.' in t:
        decimal = ',' if t.rfind(',') > t.rfind('.') else '.'
        t = t.replace('.' if decimal == ',' else ',', '').replace(decimal, '.')
    elif ',' in t or '.' in t:
        sep = ',' if ',' in t else '.'
        partes = t.split(sep)
        if all(len(p) == 3 for p in partes[1:]) and 1 <= len(partes[0]) <= 3:
            t = ''.join(partes)                       # separador de miles
        elif len(partes) == 2 and len(partes[1]) in (1, 2):
            t = partes[0] + '.' + partes[1]           # decimales
        else:
            return None
    try:
        return int(round(float(t)))
    except ValueError:
        return None


def montos_en(linea, con_ceros=False):
    """Montos candidatos de una línea: (valor, inicio, fin, con_signo, con_separador)."""
    solo_con_signo = bool(IDENTIFICADORES.search(linea))
    salida = []
    for m in TOKEN_MONTO.finditer(linea):
        valor = a_monto(m.group(2))
        if valor is None:
            continue
        con_signo, con_sep = bool(m.group(1)), bool(re.search(r'[.,]\d{3}', m.group(2)))
        if solo_con_signo and not con_signo:
            continue
        if not (MONTO_MIN <= valor <= MONTO_MAX) and not (con_ceros and valor == 0 and (con_signo or re.fullmatch(r'0(?:[.,]0{1,2})?', m.group(2)))):
            continue
        salida.append((valor, m.start(), m.end(), con_signo, con_sep))
    return salida


def _fecha(anio, mes, dia):
    try:
        a, m, d = int(anio), int(mes), int(dia)
    except (TypeError, ValueError):
        return None
    if not (2000 <= a <= 2100 and 1 <= m <= 12 and 1 <= d <= 31):
        return None
    if d > (29 if m == 2 and a % 4 == 0 else 28 if m == 2 else 30 if m in (4, 6, 9, 11) else 31):
        return None
    return f'{a:04d}-{m:02d}-{d:02d}'


DIA = r'(0?[1-9]|[12]\d|3[01])'
NUM_MES = r'(0?[1-9]|1[0-2])'
FECHAS = [
    (re.compile(rf'(?<!\d)(20\d\d)[-/.]{NUM_MES}[-/.]{DIA}(?!\d)'), lambda g: _fecha(g[0], g[1], g[2])),
    (re.compile(rf'(?<![\d/.-]){DIA}[-/.]{NUM_MES}[-/.](20\d\d)(?!\d)'), lambda g: _fecha(g[2], g[1], g[0])),
    (re.compile(rf'(?<!\d){DIA}\s+(?:DE\s+)?({MES})\.?\s+(?:DE\s+|DEL\s+)?(20\d\d)(?!\d)'), lambda g: _fecha(g[2], MESES[g[1]], g[0])),
    (re.compile(rf'(?<!\d){DIA}[-/ ]({MES})\.?[-/ ](20\d\d)(?!\d)'), lambda g: _fecha(g[2], MESES[g[1]], g[0])),
    (re.compile(rf'\b({MES})\.?\s+{DIA},?\s+(20\d\d)(?!\d)'), lambda g: _fecha(g[2], MESES[g[0]], g[1])),
]


def fechas_en(texto):
    salida = []
    for patron, convertir in FECHAS:
        for m in patron.finditer(texto):
            iso = convertir(m.groups())
            if iso and not any(m.start() < f and m.end() > i for _, i, f in salida):
                salida.append((iso, m.start(), m.end()))
    return sorted(salida, key=lambda x: x[1])


PERIODOS = [
    (re.compile(r'(?<![\d/.-])(20\d\d)[-/.](0[1-9]|1[0-2])(?![\d]|[-/.]\d)'), lambda g: (g[0], g[1])),
    (re.compile(r'(?<![\d/.-])(0?[1-9]|1[0-2])[-/.](20\d\d)(?![\d]|[-/.]\d)'), lambda g: (g[1], g[0])),
    (re.compile(rf'\b({MES})\.?\s*(?:DE\s+|DEL\s+|/|-)?\s*(20\d\d)(?!\d)'), lambda g: (g[1], MESES[g[0]])),
    (re.compile(rf'(?<!\d)(20\d\d)\s*(?:/|-)?\s*({MES})\b'), lambda g: (g[0], MESES[g[1]])),
    (re.compile(r'(?<!\d)(20\d\d)(0[1-9]|1[0-2])(?!\d)'), lambda g: (g[0], g[1])),
]


def periodos_en(texto):
    salida = []
    for patron, convertir in PERIODOS:
        for m in patron.finditer(texto):
            anio, mes = convertir(m.groups())
            if 2000 <= int(anio) <= 2100 and not any(m.start() < f and m.end() > i for _, i, f in salida):
                salida.append((f'{int(anio):04d}-{int(mes):02d}', m.start(), m.end()))
    return sorted(salida, key=lambda x: x[1])


def numeros_planilla_en(texto):
    return [(m.group(1), m.start(1), m.end(1)) for m in re.finditer(r'(?<![\d.,/-])(\d{6,12})(?![\d.,/-]\d|\d)', texto)]


# ===== 3. Texto del PDF y del OCR =====
class ErrorLectura(Exception):
    """codigo: 'no-pdf' | 'clave' | 'cifrado' (falta pycryptodome) | 'sin-texto'."""

    def __init__(self, codigo, mensaje):
        super().__init__(mensaje)
        self.codigo = codigo


def _pypdf_con_cifrado():
    """pypdf escoge su librería de cifrado al importarse. En el navegador, pycryptodome se carga solo
    cuando una planilla viene cifrada con AES (después de importar pypdf): se vuelve a importar pypdf
    para que la vea. Devuelve False si no hay ninguna librería de cifrado disponible."""
    import importlib.util
    if not (importlib.util.find_spec('Crypto') or importlib.util.find_spec('cryptography')):
        return False
    for nombre in [m for m in sys.modules if m == 'pypdf' or m.startswith('pypdf.')]:
        del sys.modules[nombre]
    return True


def textos_de_pdf(datos, max_paginas=5, _reintento=True):
    """Texto de las primeras páginas en dos modos: «layout» (conserva columnas) y «plain»."""
    try:
        from pypdf import PdfReader
        from pypdf.errors import DependencyError, PdfReadError
    except ImportError as e:  # pragma: no cover - depende del entorno
        raise ErrorLectura('sin-pypdf', 'Falta la librería pypdf') from e
    try:
        lector = PdfReader(io.BytesIO(bytes(datos)))
        if lector.is_encrypted:
            # Los comprobantes suelen venir «protegidos» sin clave de apertura: se abren con clave vacía.
            if not lector.decrypt(''):
                raise ErrorLectura('clave', 'La planilla tiene contraseña')
        textos = []
        for modo in ('layout', 'plain'):
            partes = []
            for pagina in lector.pages[:max_paginas]:
                try:
                    partes.append(pagina.extract_text(extraction_mode=modo) or '')
                except DependencyError:
                    raise
                except Exception:  # una página dañada no tumba la lectura de las demás
                    partes.append('')
            textos.append('\n'.join(partes))
        return textos
    except ErrorLectura:
        raise
    except Exception as e:
        cifrado = isinstance(e, DependencyError) or any(x in str(e).lower() for x in ('aes', 'cryptography', 'pycryptodome'))
        if cifrado:
            if _reintento and _pypdf_con_cifrado():
                return textos_de_pdf(datos, max_paginas, _reintento=False)
            raise ErrorLectura('cifrado', 'La planilla está cifrada (AES) y falta la librería para abrirla') from e
        if isinstance(e, PdfReadError):
            raise ErrorLectura('no-pdf', f'No es un PDF válido: {e}') from e
        raise ErrorLectura('no-pdf', f'No se pudo abrir el PDF: {e}') from e


def tiene_imagenes(datos, max_paginas=5):
    """¿Alguna de las primeras páginas trae imágenes? (una planilla escaneada a la que el escáner le puso
    una capa de texto que no sirve: vale la pena pasarla por OCR)."""
    try:
        from pypdf import PdfReader
        lector = PdfReader(io.BytesIO(bytes(datos)))
        if lector.is_encrypted and not lector.decrypt(''):
            return False
        for pagina in lector.pages[:max_paginas]:
            objetos = (pagina.get('/Resources') or {}).get('/XObject') or {}
            if any(objetos[k].get_object().get('/Subtype') == '/Image' for k in objetos):
                return True
    except Exception:  # si no se puede saber, no se insiste
        return False
    return False


# El OCR (Tesseract, en js/lector-planilla.js) devuelve palabras con su caja en píxeles; aquí se arma el
# texto como lo da pypdf en modo «layout», para que la búsqueda de campos sea la misma.
def palabras_de_tsv(tsv):
    """Palabras del TSV de Tesseract (filas de nivel 5): (x0, y0, x1, y1, texto, línea de Tesseract)."""
    palabras = []
    for fila in (tsv or '').splitlines():
        c = fila.split('\t')
        if len(c) < 12 or c[0] != '5':
            continue
        try:
            x, y, ancho, alto = (int(float(v)) for v in c[6:10])
            confianza = float(c[10])
        except ValueError:
            continue
        texto = '\t'.join(c[11:]).strip()
        if texto and confianza >= 0 and ancho > 0 and alto > 0:
            palabras.append((x, y, x + ancho, y + alto, texto, tuple(c[1:5])))
    return palabras


def _mediana(valores, defecto):
    v = sorted(valores)
    return v[len(v) // 2] if v else defecto


def texto_por_columnas(palabras):
    """Una línea por fila de la página y cada palabra en la columna que le toca por su posición: así una
    fila de la tabla («SALUD … 350.000») queda en una sola línea y los valores, debajo de sus encabezados."""
    if not palabras:
        return ''
    altura = _mediana([p[3] - p[1] for p in palabras if len(p[4]) > 1], 30)
    ancho = _mediana([(p[2] - p[0]) / len(p[4]) for p in palabras if len(p[4]) >= 3], altura * 0.5) or 1
    # Tesseract agrupa las palabras en líneas, pero una fila de tabla puede quedar partida en varios bloques
    # (una línea por celda): se juntan las líneas que están a la misma altura.
    lineas = {}
    for p in palabras:
        lineas.setdefault(p[5], []).append(p)
    filas = []
    for grupo in sorted(lineas.values(), key=lambda g: _mediana([(p[1] + p[3]) / 2 for p in g], 0)):
        grandes = [p for p in grupo if p[3] - p[1] >= altura * 0.4] or grupo   # sin guiones ni comas sueltas
        centro = _mediana([(p[1] + p[3]) / 2 for p in grandes], 0)
        alto = _mediana([p[3] - p[1] for p in grandes], altura)
        fila = next((f for f in reversed(filas) if abs(f['centro'] - centro) <= max(f['alto'], alto) * 0.5), None)
        if fila:
            fila['palabras'] += grupo
        else:
            filas.append({'centro': centro, 'alto': alto, 'palabras': list(grupo)})
    izquierda = min(p[0] for p in palabras)
    salida = []
    for fila in sorted(filas, key=lambda f: f['centro']):
        linea = ''
        for p in sorted(fila['palabras'], key=lambda p: p[0]):
            columna = round((p[0] - izquierda) / ancho)
            linea = linea.ljust(max(columna, len(linea) + 1) if linea else columna) + p[4]
        salida.append(linea)
    return '\n'.join(salida)


# Letras que el OCR pone en lugar de dígitos dentro de un monto o una fecha («2.OOO.OOO», «2O26-1O-O5»).
DIGITOS_OCR = str.maketrans({'O': '0', 'o': '0', 'D': '0', 'Q': '0', 'I': '1', 'l': '1', '|': '1', 'S': '5', 'B': '8'})
FORMA_NUMERICA = re.compile(r'\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|(?:20\d\d[-/.]\d\d(?:[-/.]\d\d)?)|\d\d[-/.]\d\d[-/.]20\d\d')


def _digitos(m):
    token = m.group(0)
    cambiado = token.translate(DIGITOS_OCR)
    return cambiado if any(c.isdigit() for c in token) and FORMA_NUMERICA.fullmatch(cambiado) else token


def limpiar_ocr(texto):
    """Confusiones típicas del OCR en las planillas. Cada cambio conserva el largo (las columnas no se mueven)."""
    salida = []
    for linea in (texto or '').splitlines():
        linea = re.sub(r'(?:[.·…_]\s?){3,}', lambda m: ' ' * len(m.group(0)), linea)        # puntos guía «Salud .......»
        linea = re.sub(r'(?<![\w$])[sS§](?=\s?\d{1,3}(?:[.,]\d{3})+(?!\d))', '$', linea)     # «s 448.000» = «$ 448.000»
        linea = re.sub(r'(?<![\w$])[sS][oO0](?!\w)', '$0', linea)                              # «so» = «$0»
        linea = re.sub(r'(?<!\w)[\dOoDQIl|SB][\dOoDQIl|SB.,/-]{3,}', _digitos, linea)
        linea = re.sub(r'(\d[.,]) (\d{3})(?!\d)', r'\1\2 ', linea)                              # «250. 000»
        linea = re.sub(r'\b[1I][8B]C\b', 'IBC', linea)                                          # «1BC», «18C»
        linea = re.sub(r'\b(N\s?)[*”“"\'’º](?=\s)', r'\1°', linea)                             # «N* de planilla», «N” de …»
        linea = re.sub(r'\bN[eE](?=\s+\d{6,12}\b)', 'N°', linea)                                 # «Planilla Ne 5512345678»
        salida.append(linea)
    return '\n'.join(salida)


def textos_de_ocr(paginas):
    """paginas: [{'tsv'}] de Tesseract (una por página) → [texto por columnas]. Un número que el navegador no
    pudo confirmar al releerlo llega tachado («########») y no se usa."""
    return [limpiar_ocr('\n'.join(texto_por_columnas(palabras_de_tsv(p.get('tsv'))) for p in paginas))]


# ===== 4. Búsqueda de campos =====
def preparar(texto):
    """Líneas normalizadas y canonizadas (sin vacías), conservando las columnas."""
    return [canonizar(normalizar(l).rstrip()) for l in (texto or '').splitlines() if l.strip()]


def claves_en(linea):
    """Subsistemas mencionados en la línea: [(subsistema, inicio, fin)] sin solaparse."""
    salida = []
    for k, patron in CLAVES:
        for m in patron.finditer(linea):
            if not any(m.start() < f and m.end() > i for _, i, f in salida):
                salida.append((k, m.start(), m.end()))
    return sorted(salida, key=lambda x: x[1])


def valor_cerca(lineas, i, etiqueta, buscar, ventana=60):
    """Valor de una etiqueta: a su derecha en la misma línea (antes de otra etiqueta) o debajo, en su columna."""
    linea = lineas[i]
    tramo = linea[etiqueta.end():etiqueta.end() + ventana]
    corte = re.search(r'\s{3,}[A-Z][A-Z .]{3,}:', tramo)   # la siguiente etiqueta en la misma fila
    if corte:
        tramo = tramo[:corte.start()]
    encontrados = buscar(tramo)
    if encontrados:
        return encontrados[0][0]
    ini, fin = etiqueta.start() - 4, etiqueta.end() + 10
    for j in (i + 1, i + 2):
        if j >= len(lineas):
            break
        candidatos = [(v, a, b) for v, a, b in buscar(lineas[j]) if a < fin and b > ini]
        if candidatos:
            centro = (etiqueta.start() + etiqueta.end()) / 2
            return min(candidatos, key=lambda c: abs((c[1] + c[2]) / 2 - centro))[0]
    return None


ETQ_PLANILLA = re.compile(r'(?:NUMERO|NRO\.?|NO\.?|N\s?[°O]\.?|#)\s*(?:DE\s+(?:LA\s+)?)?PLANILLA\b|PLANILLA\s*(?:NUMERO|NRO\.?|NO\.?|N\s?[°O]\.?|#)|PLANILLA(?:\s+(?:ASOCIADA|PAGADA))?\s*:')
ETQ_FECHA_PAGO = re.compile(r'FECHA\s*(?:Y\s+HORA\s+)?(?:DE\s+(?:LA\s+)?|DEL\s+)?(?:PAGO|TRANSACCION|RECAUDO|CANCELACION|APLICACION)|PAGAD[AO]\s+EL|PAGO\s+REALIZADO\s+EL')
NO_ES_PAGO = re.compile(r'LIMITE|MAXIMA|OPORTUN|VENCIM')
ETQ_PERIODO = re.compile(r'PERIODO\s*(?:DE\s+)?(?:COTIZACION|LIQUIDACION|PAGO|APORTE)?S?\s*(?:DE\s+|EN\s+)?(PENSION|SALUD|RIESGOS|ARL|AFP|EPS)?')
ETQ_IBC = re.compile(r'\bI\.?B\.?C\b|INGRESO\s+BASE(?:\s+DE\s+COTIZACION)?|BASE\s+DE\s+COTIZACION')
ETQ_TOTAL = re.compile(r'TOTAL\s*(?:PAGADO|A\s+PAGAR|APORTES|PLANILLA|TRANSACCION|GENERAL)?|VALOR\s+(?:TOTAL|PAGADO|TRANSACCION|A\s+PAGAR)')


def buscar_numero(lineas):
    for i, linea in enumerate(lineas):
        for m in ETQ_PLANILLA.finditer(linea):
            v = valor_cerca(lineas, i, m, numeros_planilla_en)
            if v:
                return v
    return None


ETQ_PAGADO = re.compile(r'\bPAGAD[AO]\b\s*(?:EL\s+)?:?\s*')


def buscar_fecha_pago(lineas):
    for i, linea in enumerate(lineas):
        for m in ETQ_FECHA_PAGO.finditer(linea):
            alrededor = linea[max(0, m.start() - 14):m.start()] + linea[m.start():m.end() + 14]
            if NO_ES_PAGO.search(alrededor):   # «Fecha límite de pago», «fecha de pago oportuno»
                continue
            v = valor_cerca(lineas, i, m, fechas_en)
            if v:
                return v
    # «PAGADO 05/10/2026» (sello del comprobante): solo si la fecha va pegada a la palabra.
    for linea in lineas:
        for m in ETQ_PAGADO.finditer(linea):
            pegada = [f for f in fechas_en(linea[m.end():m.end() + 30]) if f[1] == 0]
            if pegada:
                return pegada[0][0]
    return None


def buscar_periodos(lineas):
    periodos = {}
    for i, linea in enumerate(lineas):
        for m in ETQ_PERIODO.finditer(linea):
            v = valor_cerca(lineas, i, m, periodos_en, ventana=50)
            if not v:
                continue
            tipo = m.group(1) or ''
            claves = ['pension'] if tipo in ('PENSION', 'AFP') else ['salud'] if tipo in ('SALUD', 'EPS') else ['arl'] if tipo in ('RIESGOS', 'ARL') else ['general']
            for k in claves:
                periodos.setdefault(k, v)
    return periodos


def buscar_total(lineas):
    mejores = []
    for linea in lineas:
        for m in ETQ_TOTAL.finditer(linea):
            resto = linea[m.end():]
            if re.match(r'\s*(?:DE\s+)?I\.?B\.?C', resto) or claves_en(linea[m.end():m.end() + 25]):
                continue   # «Total IBC», «Total salud» no son el total pagado
            montos = montos_en(resto[:60])
            if montos:
                mejores.append(montos[0][0])
    return max(mejores) if mejores else None


def buscar_valores(lineas, ibc_dado=None):
    """Candidatos por subsistema con su origen: filas, pares en línea y encabezados con valores debajo.
    ibc_dado: el IBC ya calculado para todo el documento; se salta al tomar el aporte de cada subsistema."""
    candidatos = {k: [] for k in SUBSISTEMAS}
    ibc_etiquetado, montos_por_fila, totales = [], [], []
    for i, linea in enumerate(lineas):
        claves = claves_en(linea)
        distintos = []
        for k, _, _ in claves:
            if k not in distintos:
                distintos.append(k)
        m_ibc = ETQ_IBC.search(linea)
        if m_ibc and len(distintos) == 0:
            montos = montos_en(linea[m_ibc.end():m_ibc.end() + 50])
            if montos:
                ibc_etiquetado.append(montos[0][0])
        montos = montos_en(linea)
        if len(distintos) == 1 and montos:
            # Fila de un subsistema: «Salud  EPS SURA  2.000.000  12,50 %  250.000».
            ultimo_clave = max(f for _, _, f in claves)
            despues = [x for x in montos if x[1] >= ultimo_clave] or montos
            montos_por_fila.append((distintos[0], despues))
        elif len(distintos) >= 2 and montos:
            # Pares en la misma línea: «Salud: $ 250.000    Pensión: $ 320.000», o una fila con todos los
            # subsistemas: «PROTECCION $ 2.800.000 $ 448.000 EPS SURA $ 2.800.000 $ 350.000 …» (el IBC se salta).
            for n, (k, ini, fin) in enumerate(claves):
                limite = min(claves[n + 1][1] if n + 1 < len(claves) else len(linea), fin + 60)
                entre = [x for x in montos if fin <= x[1] < limite and x[0] != ibc_dado]
                if entre:
                    candidatos[k].append((entre[0][0], 'linea'))
        elif len(distintos) >= 2 and not montos:
            # Encabezado: «AFP  EPS  ARL  CCF  Total» y los valores en la línea siguiente.
            columnas = sorted(claves + [(k, m.start(), m.end()) for k, p in OTRAS_COLUMNAS for m in p.finditer(linea)], key=lambda x: x[1])
            for j in (i + 1, i + 2, i + 3, i + 4):
                if j >= len(lineas):
                    break
                if claves_en(lineas[j]):
                    break    # una línea con sus propios rótulos («Salud: $ … Pensión: $ …») no es la de valores
                valores = montos_en(lineas[j], con_ceros=True)
                if len(valores) < 2:
                    continue
                rotulo = lineas[j][:valores[0][1]]
                if ETQ_IBC.search(rotulo):          # tabla transpuesta: fila «IBC» antes de la de valores
                    ibc_etiquetado.extend(v[0] for v in valores if v[0])
                    continue
                if re.search(r'TARIFA|PORCENTAJE|DIAS', rotulo):
                    continue
                if len(valores) == len(columnas):
                    pares = list(zip(columnas, valores))   # mismo número: por orden
                else:
                    pares = []
                    for v in valores:                       # por columna: el encabezado más cercano
                        centro = (v[1] + v[2]) / 2
                        col = min(columnas, key=lambda c: abs((c[1] + c[2]) / 2 - centro))
                        pares.append((col, v))
                for (k, _, _), v in pares:
                    if k in candidatos:
                        if v[0] != ibc_dado:   # el IBC no es el aporte de nadie (un pensionado tiene «$ 0» al lado)
                            candidatos[k].append((v[0], 'encabezado'))
                    elif k == 'ibc' and v[0]:
                        ibc_etiquetado.append(v[0])
                    elif k == 'total' and v[0]:
                        totales.append(v[0])
                break
    # IBC: el dado, el etiquetado o el monto que se repite en las filas de dos o más subsistemas.
    ibc = ibc_dado or (ibc_etiquetado[0] if ibc_etiquetado else None)
    if ibc is None and len(montos_por_fila) >= 2:
        conteo = {}
        for k, montos in montos_por_fila:
            for v in {x[0] for x in montos}:
                conteo.setdefault(v, set()).add(k)
        repetidos = [v for v, ks in conteo.items() if len(ks) >= 2 and v >= 900_000]
        if repetidos:
            ibc = max(repetidos)
    for k, montos in montos_por_fila:
        opciones = [x for x in montos if x[0] != ibc] or montos
        if any(x[4] for x in opciones):
            opciones = [x for x in opciones if x[4]] or opciones   # sin separador suele ser un código
        candidatos[k].append((opciones[-1][0], 'fila'))
    return candidatos, ibc, (max(totales) if totales else None), ibc_etiquetado


def esperado(k, ibc):
    if not ibc:
        return []
    if k == 'salud':
        return [ibc * TARIFA_SALUD]
    if k == 'pension':
        return [ibc * TARIFA_PENSION, ibc * (TARIFA_PENSION + TARIFA_FSP)]
    if k == 'arl':
        return [ibc * t for t in TARIFAS_ARL]
    return []


def cerca(valor, objetivo, holgura=0.02):
    """PILA redondea cada aporte al múltiplo de 100 siguiente: se tolera eso y un 2 %."""
    return abs(valor - objetivo) <= max(200, objetivo * holgura)


def elegir(candidatos, k, ibc):
    if not candidatos:
        return None
    valores = [v for v, _ in candidatos]
    coherentes = [v for v in valores if any(cerca(v, e) for e in esperado(k, ibc))]
    if coherentes:
        return max(set(coherentes), key=coherentes.count)
    return max(set(valores), key=lambda v: (valores.count(v), -valores.index(v)))


def por_tarifa(lineas, k, ibc, usados):
    """Último recurso: un monto del documento que sea justo la tarifa del subsistema sobre el IBC."""
    objetivos = esperado(k, ibc)[:1] if k == 'pension' else esperado(k, ibc)
    hallados = {v for linea in lineas for v, *_ in montos_en(linea) if v not in usados and any(cerca(v, e, 0.005) for e in objetivos)}
    return hallados.pop() if len(hallados) == 1 else None


def ibc_por_tarifas(lineas, etiquetados, otro=None):
    """El IBC es el monto que explica los aportes del documento: su 12,5 % (salud), su 16 % (pensión) o su
    tarifa de ARL también aparecen. Sirve aunque el comprobante no lo rotule (columnas «IBC Pensión»,
    «IBC Salud»…). Gana el que explique más aportes; luego el etiquetado, el más repetido y el mayor."""
    todos = [v for linea in lineas for v, *_ in montos_en(linea)]
    distintos = set(todos)
    mejor, clave_mejor = None, (0,)
    for c in {v for v in distintos if v >= 900_000} | set(etiquetados) | ({otro} if otro else set()):
        puntos = sum(1 for k in ('salud', 'pension', 'arl') if any(v != c and any(cerca(v, e, 0.005) for e in esperado(k, c)) for v in distintos))
        clave = (puntos, c in etiquetados, todos.count(c), c)
        if clave > clave_mejor:
            mejor, clave_mejor = c, clave
    if mejor is not None and clave_mejor[0] >= 1:
        return mejor
    return etiquetados[0] if etiquetados else otro


def coherente(v, k, ibc):
    return v is not None and any(cerca(v, e) for e in esperado(k, ibc))


def analizar_texto(texto, pistas=None):
    """Campos de una planilla a partir de su texto (sin pypdf: sirve para probar el análisis).
    pistas: {'ibc': n} — el IBC que calcula la app; solo ayuda a escoger entre candidatos."""
    lineas = preparar(texto)
    # Primero el IBC de todo el documento (así se puede saltar en las filas) y luego los candidatos.
    _, ibc_previo, _, etiquetados = buscar_valores(lineas)
    ibc = ibc_por_tarifas(lineas, etiquetados, ibc_previo)
    candidatos, ibc, total_columna, _ = buscar_valores(lineas, ibc)
    periodos = buscar_periodos(lineas)
    ibc_guia = ibc or ((pistas or {}).get('ibc') or None)
    valores = {k: elegir(candidatos[k], k, ibc_guia) for k in SUBSISTEMAS}
    plano = '\n'.join(lineas)
    pensionado = bool(re.search(r'\bPENSIONAD[OA]\b', plano))
    if ibc_guia:
        for k in ('salud', 'pension', 'arl'):
            # Si lo leído no corresponde a la tarifa (p. ej. se tomó el IBC) y en el documento hay un único
            # monto que sí corresponde, ese es el aporte. Un pensionado (pensión 0) no se toca.
            cero = valores[k] == 0 and (k != 'pension' or pensionado)
            if valores[k] is None or (not cero and not coherente(valores[k], k, ibc_guia)):
                usados = {v for kk, v in valores.items() if v and kk != k} | {ibc_guia}
                hallado = por_tarifa(lineas, k, ibc_guia, usados)
                if hallado is not None:
                    valores[k] = hallado
        # Caja y fondo de solidaridad son pequeños frente al IBC: un monto grande ahí es otra columna (un total).
        if valores['ccf'] and valores['ccf'] > ibc_guia * 0.045:
            valores['ccf'] = None
        if valores['fsp'] and valores['fsp'] > ibc_guia * 0.025:
            valores['fsp'] = None
    if valores['pension'] is None and pensionado:
        valores['pension'] = 0
    operador = next((nombre for nombre, p in OPERADORES if re.search(p, plano)), None)
    return {
        'numeroPlanilla': buscar_numero(lineas),
        'fechaPago': buscar_fecha_pago(lineas),
        'periodoPension': periodos.get('pension') or periodos.get('general'),
        'periodoSalud': periodos.get('salud') or periodos.get('general'),
        'ibc': ibc,
        **valores,
        'total': buscar_total(lineas) or total_columna or total_por_suma(lineas, valores),
        'operador': operador,
    }


def total_por_suma(lineas, valores):
    """Sin un total rotulado: el monto del documento que es la suma de los aportes leídos."""
    suma = sum(valores.get(k) or 0 for k in SUBSISTEMAS)
    if not suma or any(valores.get(k) is None for k in ('salud', 'arl')):
        return None
    for linea in lineas:
        for v, *_ in montos_en(linea):
            if abs(v - suma) <= 1000:
                return v
    return None


# ===== 5. Coherencia y resultado =====
CAMPOS_PRINCIPALES = ('numeroPlanilla', 'fechaPago', 'salud', 'pension', 'arl')


def puntaje(r):
    p = sum(2 for k in ('salud', 'pension', 'arl') if r.get(k) is not None) + sum(1 for k in ('numeroPlanilla', 'fechaPago', 'ibc', 'total') if r.get(k))
    suma = sum(r.get(k) or 0 for k in SUBSISTEMAS)
    if r.get('total') and suma and abs(suma - r['total']) <= 1000:
        p += 3
    return p


def combinar(resultados):
    """El análisis con más campos y más coherente manda; los demás solo llenan huecos."""
    ordenados = sorted(resultados, key=puntaje, reverse=True)
    base = dict(ordenados[0])
    for otro in ordenados[1:]:
        for k, v in otro.items():
            if base.get(k) is None and v is not None:
                base[k] = v
    return base


def fmt_pesos(n):
    return '$ ' + f'{int(n):,}'.replace(',', '.')


def avisos_de(r, pistas=None):
    """Avisos para la persona. pistas: {'ibc', 'anio', 'mes'} de la fila de la app, para compararlos."""
    pistas = pistas or {}
    avisos = []
    faltan = {'numeroPlanilla': 'el número de planilla', 'fechaPago': 'la fecha de pago', 'salud': 'el valor de salud',
              'pension': 'el valor de pensión', 'arl': 'el valor de ARL'}
    no_hallados = [t for k, t in faltan.items() if r.get(k) is None]
    if no_hallados:
        avisos.append(('No se pudo leer con seguridad ' if r.get('ocr') else 'No se encontró ') + ', '.join(no_hallados[:-1]) + (' ni ' if len(no_hallados) > 1 else '') + no_hallados[-1] + ': escríbelo a mano.')
    ibc = r.get('ibc')
    if ibc:
        if r.get('salud') and not cerca(r['salud'], ibc * TARIFA_SALUD):
            avisos.append('Salud no corresponde al 12,5 % del IBC de la planilla: revísalo.')
        if r.get('pension') and not any(cerca(r['pension'], e) for e in esperado('pension', ibc)):
            avisos.append('Pensión no corresponde al 16 % del IBC de la planilla: revísalo.')
        if r.get('arl') and not any(cerca(r['arl'], e) for e in esperado('arl', ibc)):
            avisos.append('ARL no corresponde a una clase de riesgo con el IBC de la planilla: revísalo.')
    suma = sum(r.get(k) or 0 for k in SUBSISTEMAS)
    if r.get('total') and suma and abs(suma - r['total']) > 1000:
        avisos.append('Salud, pensión y ARL no suman el total pagado de la planilla: revisa los valores.')
    if r.get('fsp'):
        avisos.append('La planilla incluye fondo de solidaridad pensional; no se sumó a pensión.')
    try:
        anio, mes = int(pistas.get('anio') or 0), int(pistas.get('mes') or 0)
    except (TypeError, ValueError):
        anio = mes = 0
    periodos = {p for p in (r.get('periodoPension'), r.get('periodoSalud')) if p}
    if anio and 1 <= mes <= 12 and periodos and f'{anio:04d}-{mes:02d}' not in periodos:
        avisos.append(f'La planilla es del período {" / ".join(sorted(periodos))} y la fila dice {anio:04d}-{mes:02d}: revisa el mes y el año.')
    try:
        ibc_app = float(pistas.get('ibc') or 0)
    except (TypeError, ValueError):
        ibc_app = 0
    if ibc_app and r.get('ibc') and not cerca(r['ibc'], ibc_app, 0.005):
        avisos.append(f'La planilla cotiza sobre un IBC de {fmt_pesos(r["ibc"])}; con el valor de la fila el IBC es {fmt_pesos(round(ibc_app))}.')
    return avisos


AVISO_OCR = ('La planilla es escaneada y se leyó con reconocimiento de texto (OCR): los valores se comprobaron con las '
             'tarifas, pero compara el número de planilla y la fecha de pago con el documento.')


def _mes(iso):
    return int(iso[:4]) * 12 + int(iso[5:7]) - 1


def cuadra_tarifa(v, k, ibc):
    """Más estricto que coherente(), para lo leído con OCR: PILA sube cada aporte al múltiplo de 100
    siguiente, así que el valor es múltiplo de 100 y queda a menos de 100 pesos de la tarifa."""
    return v is not None and v % 100 == 0 and any(abs(v - e) < 100 for e in esperado(k, ibc))


def validar_ocr(r, textos, pistas=None):
    """El OCR confunde dígitos (5, 6, 8, 3…), así que de lo leído solo queda lo que se puede comprobar: cada
    aporte cuadra con su tarifa sobre un IBC confirmado (el de la planilla, el de la fila o el que comparten
    la salud y la pensión), el total es su suma y la fecha de pago cae cerca del período. Lo demás queda
    vacío para escribirlo a mano."""
    pistas = pistas or {}
    try:
        ibc_fila = float(pistas.get('ibc') or 0)
    except (TypeError, ValueError):
        ibc_fila = 0
    r = dict(r)
    pensionado = bool(re.search(r'\bPENSIONAD[OA]\b', normalizar('\n'.join(textos))))
    # El IBC de la planilla sirve de referencia solo si lo confirma la salud o la pensión (la ARL tiene cinco
    # tarifas: con un IBC mal leído alguna cuadraría por casualidad) o si es el mismo de la fila.
    if r.get('ibc') and not (any(cuadra_tarifa(r.get(k), k, r['ibc']) for k in ('salud', 'pension')) or (ibc_fila and cerca(r['ibc'], ibc_fila, 0.005))):
        r['ibc'] = None
    referencias = [i for i in (r.get('ibc'), ibc_fila) if i]
    # Sin IBC: el que comparten la salud (12,5 %) y la pensión (16 %, o 17 % con el fondo de solidaridad).
    if r.get('salud') and r.get('pension'):
        for tarifa in (TARIFA_PENSION, TARIFA_PENSION + TARIFA_FSP):
            desde = max((r['salud'] - 100) / TARIFA_SALUD, (r['pension'] - 100) / tarifa)
            hasta = min((r['salud'] + 100) / TARIFA_SALUD, (r['pension'] + 100) / tarifa)
            if desde < hasta:
                referencias.append((desde + hasta) / 2)
    for k in SUBSISTEMAS:
        v = r.get(k)
        if v is None:
            continue
        if v == 0:
            bien = k == 'pension' and pensionado
        elif k in ('salud', 'pension', 'arl'):
            bien = any(cuadra_tarifa(v, k, i) for i in referencias)
        else:   # fondo de solidaridad (1 % a 2 %) o caja (0,6 % o 2 %)
            bien = v % 100 == 0 and any(0.005 * i <= v <= 0.021 * i for i in referencias)
        if not bien:
            r[k] = None
    # El total solo si es la suma de lo que quedó (el leído u otro monto del documento que lo sea).
    suma = sum(r.get(k) or 0 for k in SUBSISTEMAS)
    completos = all(r.get(k) is not None for k in ('salud', 'pension', 'arl'))
    if not (completos and r.get('total') and abs(r['total'] - suma) <= 100):
        iguales = sorted({v for t in textos for linea in preparar(t) for v, *_ in montos_en(linea) if abs(v - suma) <= 100}) if completos else []
        r['total'] = iguales[0] if iguales else None
    hoy = datetime.date.today()
    for k in ('periodoPension', 'periodoSalud'):
        if r.get(k) and not 2000 <= int(r[k][:4]) <= hoy.year + 1:
            r[k] = None
    try:
        anio, mes = int(pistas.get('anio') or 0), int(pistas.get('mes') or 0)
    except (TypeError, ValueError):
        anio = mes = 0
    periodo = f'{anio:04d}-{mes:02d}' if anio and 1 <= mes <= 12 else (r.get('periodoPension') or r.get('periodoSalud'))
    fecha = r.get('fechaPago')
    if fecha:
        # Se paga en el mes del período o en los siguientes (con un margen); nunca en el futuro.
        if datetime.date.fromisoformat(fecha) > hoy + datetime.timedelta(days=1) or (periodo and not -1 <= _mes(fecha) - _mes(periodo) <= 3):
            r['fechaPago'] = None
    return r


def resultado(textos, pistas=None, ocr=False):
    """Del texto de la planilla (del PDF o del OCR) al dict de respuesta."""
    if ocr:
        r = combinar([validar_ocr(analizar_texto(t, pistas), textos, pistas) for t in textos])
        r['ocr'] = True
    else:
        r = combinar([analizar_texto(t, pistas) for t in textos])
    if all(r.get(k) is None for k in CAMPOS_PRINCIPALES):
        donde = 'la imagen escaneada' if ocr else 'el PDF'
        return {'ok': False, 'error': 'sin-datos', 'mensaje': f'No se reconoció una planilla de seguridad social en {donde}', **r}
    return {'ok': True, **r, 'avisos': ([AVISO_OCR] if ocr else []) + avisos_de(r, pistas)}


def leer_planilla(datos, pistas=None):
    """Lee el PDF y devuelve un dict listo para JSON. Nunca lanza: los problemas van en 'error'.
    'sin-texto' (o 'sin-datos' con 'escaneada') le indica al navegador que pruebe con OCR."""
    try:
        textos = textos_de_pdf(datos)
    except ErrorLectura as e:
        return {'ok': False, 'error': e.codigo, 'mensaje': str(e)}
    if sum(len(re.sub(r'\s', '', t)) for t in textos) < 40:
        return {'ok': False, 'error': 'sin-texto', 'mensaje': 'El PDF no tiene texto (¿es una imagen escaneada?)'}
    r = resultado(textos, pistas)
    if not r['ok'] and tiene_imagenes(datos):
        r['escaneada'] = True
    return r


def leer_ocr(paginas, pistas=None):
    """Como leer_planilla, pero con lo que reconoció Tesseract: [{'tsv'}] por página."""
    textos = textos_de_ocr(paginas or [])
    if sum(len(re.sub(r'\s', '', t)) for t in textos) < 40:
        return {'ok': False, 'error': 'sin-datos', 'ocr': True, 'mensaje': 'El OCR no encontró texto en la planilla escaneada'}
    return resultado(textos, pistas, ocr=True)


def _json(funcion, entrada, pistas_json):
    try:
        pistas = json.loads(pistas_json or '{}')
    except ValueError:
        pistas = {}
    try:
        return json.dumps(funcion(entrada, pistas), ensure_ascii=False)
    except Exception as e:  # un PDF raro no debe dejar al navegador sin respuesta
        return json.dumps({'ok': False, 'error': 'interno', 'mensaje': f'Error leyendo la planilla: {e}'}, ensure_ascii=False)


def leer_planilla_json(datos, pistas_json='{}'):
    """Para Pyodide: recibe bytes (o un memoryview) y pistas en JSON; devuelve el resultado en JSON."""
    return _json(leer_planilla, datos, pistas_json)


def leer_ocr_json(paginas_json, pistas_json='{}'):
    """Para Pyodide: las páginas del OCR y las pistas en JSON; devuelve el resultado en JSON."""
    return _json(lambda p, pistas: leer_ocr(json.loads(p or '[]'), pistas), paginas_json, pistas_json)


# ===== 6. Uso desde la terminal =====
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python3 py/leer_planilla.py planilla.pdf [--texto]\n'
              '     python3 py/leer_planilla.py --tsv pagina1.tsv [pagina2.tsv] [--texto]   (salida TSV de Tesseract)', file=sys.stderr)
        sys.exit(2)
    if sys.argv[1] == '--tsv':
        paginas = []
        for ruta in [a for a in sys.argv[2:] if not a.startswith('--')]:
            with open(ruta, encoding='utf-8') as archivo:
                paginas.append({'tsv': archivo.read()})
        if '--texto' in sys.argv:
            print(f'===== columnas =====\n{textos_de_ocr(paginas)[0]}')
        print(json.dumps(leer_ocr(paginas), ensure_ascii=False, indent=2))
        sys.exit(0)
    with open(sys.argv[1], 'rb') as archivo:
        contenido = archivo.read()
    if '--texto' in sys.argv:
        for modo, t in zip(('layout', 'plain'), textos_de_pdf(contenido)):
            print(f'===== {modo} =====\n{t}')
    print(json.dumps(leer_planilla(contenido), ensure_ascii=False, indent=2))
