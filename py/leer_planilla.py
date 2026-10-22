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

Los operadores no comparten un formato, así que la lectura combina estrategias
(fila por subsistema, encabezado con los valores debajo y «etiqueta: valor») y
después revisa la coherencia con las tarifas y el total. Lo que no encuentre
queda vacío para escribirlo a mano: nada se adivina.

Estructura:
  1. Constantes (palabras clave, tarifas, meses)
  2. Utilidades de texto (normalizar, montos, fechas, períodos)
  3. Texto del PDF (pypdf, modos «layout» y «plain»)
  4. Búsqueda de campos
  5. Coherencia y resultado
  6. Uso desde la terminal
"""
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


# ===== 3. Texto del PDF =====
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


def valor_cerca(lineas, i, etiqueta, buscar, ventana=40):
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


def buscar_fecha_pago(lineas):
    for i, linea in enumerate(lineas):
        for m in ETQ_FECHA_PAGO.finditer(linea):
            alrededor = linea[max(0, m.start() - 14):m.start()] + linea[m.start():m.end() + 14]
            if NO_ES_PAGO.search(alrededor):   # «Fecha límite de pago», «fecha de pago oportuno»
                continue
            v = valor_cerca(lineas, i, m, fechas_en)
            if v:
                return v
    return None


def buscar_periodos(lineas):
    periodos = {}
    for i, linea in enumerate(lineas):
        for m in ETQ_PERIODO.finditer(linea):
            v = valor_cerca(lineas, i, m, periodos_en, ventana=30)
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


def buscar_valores(lineas):
    """Candidatos por subsistema con su origen: filas, pares en línea y encabezados con valores debajo."""
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
            # Pares en la misma línea: «Salud: $ 250.000    Pensión: $ 320.000».
            for n, (k, ini, fin) in enumerate(claves):
                limite = claves[n + 1][1] if n + 1 < len(claves) else len(linea)
                entre = [x for x in montos if fin <= x[1] < limite]
                if entre:
                    candidatos[k].append((entre[0][0], 'linea'))
        elif len(distintos) >= 2 and not montos:
            # Encabezado: «AFP  EPS  ARL  CCF  Total» y los valores en la línea siguiente.
            columnas = sorted(claves + [(k, m.start(), m.end()) for k, p in OTRAS_COLUMNAS for m in p.finditer(linea)], key=lambda x: x[1])
            for j in (i + 1, i + 2, i + 3, i + 4):
                if j >= len(lineas):
                    break
                valores = montos_en(lineas[j], con_ceros=True)
                if len(valores) < 2:
                    if claves_en(lineas[j]):
                        break
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
                        candidatos[k].append((v[0], 'encabezado'))
                    elif k == 'ibc' and v[0]:
                        ibc_etiquetado.append(v[0])
                    elif k == 'total' and v[0]:
                        totales.append(v[0])
                break
    # IBC: el etiquetado o el monto que se repite en las filas de dos o más subsistemas.
    ibc = ibc_etiquetado[0] if ibc_etiquetado else None
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
    return candidatos, ibc, (max(totales) if totales else None)


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


def analizar_texto(texto, pistas=None):
    """Campos de una planilla a partir de su texto (sin pypdf: sirve para probar el análisis).
    pistas: {'ibc': n} — el IBC que calcula la app; solo ayuda a escoger entre candidatos."""
    lineas = preparar(texto)
    candidatos, ibc, total_columna = buscar_valores(lineas)
    periodos = buscar_periodos(lineas)
    ibc_guia = ibc or ((pistas or {}).get('ibc') or None)
    valores = {k: elegir(candidatos[k], k, ibc_guia) for k in SUBSISTEMAS}
    if ibc_guia:
        for k in ('salud', 'pension', 'arl'):
            if valores[k] is None:
                valores[k] = por_tarifa(lineas, k, ibc_guia, {v for v in valores.values() if v} | {ibc_guia})
    plano = '\n'.join(lineas)
    if valores['pension'] is None and re.search(r'\bPENSIONAD[OA]\b', plano):
        valores['pension'] = 0
    operador = next((nombre for nombre, p in OPERADORES if re.search(p, plano)), None)
    return {
        'numeroPlanilla': buscar_numero(lineas),
        'fechaPago': buscar_fecha_pago(lineas),
        'periodoPension': periodos.get('pension') or periodos.get('general'),
        'periodoSalud': periodos.get('salud') or periodos.get('general'),
        'ibc': ibc,
        **valores,
        'total': buscar_total(lineas) or total_columna,
        'operador': operador,
    }


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
        avisos.append('No se encontró ' + ', '.join(no_hallados[:-1]) + (' ni ' if len(no_hallados) > 1 else '') + no_hallados[-1] + ': escríbelo a mano.')
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


def leer_planilla(datos, pistas=None):
    """Lee el PDF y devuelve un dict listo para JSON. Nunca lanza: los problemas van en 'error'."""
    try:
        textos = textos_de_pdf(datos)
    except ErrorLectura as e:
        return {'ok': False, 'error': e.codigo, 'mensaje': str(e)}
    if sum(len(re.sub(r'\s', '', t)) for t in textos) < 40:
        return {'ok': False, 'error': 'sin-texto', 'mensaje': 'El PDF no tiene texto (¿es una imagen escaneada?)'}
    r = combinar([analizar_texto(t, pistas) for t in textos])
    if all(r.get(k) is None for k in CAMPOS_PRINCIPALES):
        return {'ok': False, 'error': 'sin-datos', 'mensaje': 'No se reconoció una planilla de seguridad social en el PDF', **r}
    return {'ok': True, **r, 'avisos': avisos_de(r, pistas)}


def leer_planilla_json(datos, pistas_json='{}'):
    """Para Pyodide: recibe bytes (o un memoryview) y pistas en JSON; devuelve el resultado en JSON."""
    try:
        pistas = json.loads(pistas_json or '{}')
    except ValueError:
        pistas = {}
    try:
        return json.dumps(leer_planilla(datos, pistas), ensure_ascii=False)
    except Exception as e:  # un PDF raro no debe dejar al navegador sin respuesta
        return json.dumps({'ok': False, 'error': 'interno', 'mensaje': f'Error leyendo la planilla: {e}'}, ensure_ascii=False)


# ===== 6. Uso desde la terminal =====
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python3 py/leer_planilla.py planilla.pdf [--texto]', file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], 'rb') as archivo:
        contenido = archivo.read()
    if '--texto' in sys.argv:
        for modo, t in zip(('layout', 'plain'), textos_de_pdf(contenido)):
            print(f'===== {modo} =====\n{t}')
    print(json.dumps(leer_planilla(contenido), ensure_ascii=False, indent=2))
