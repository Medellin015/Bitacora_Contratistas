"""Pruebas del lector de planillas (solo el análisis del texto: no necesitan pypdf).

Uso:  python3 py/probar_leer_planilla.py      (o: python3 -m unittest discover py)

Los textos imitan lo que pypdf extrae de comprobantes de distintos operadores.
Son datos ficticios: ninguna persona, cédula ni planilla real.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leer_planilla as L  # noqa: E402

# ===== Textos de planillas ficticias (como los entrega pypdf en modo «layout») =====
COMPROBANTE_TABLA = """
OPERADOR DE INFORMACIÓN · COMPROBANTE DE PAGO DE APORTES
Planilla Integrada de Liquidación de Aportes - PILA
Número de planilla: 9400001234                                          Tipo de planilla: I - Independiente
Aportante: CONTRATISTA DE PRUEBA                                        C.C. 1.000.000.001
Período de cotización pensión: 2026-09                                  Período de cotización salud: 2026-09
Fecha límite de pago: 2026-10-10                                        Fecha de pago: 2026-10-05 09:41:12
Valor total pagado: $ 580.500
Detalle por subsistema
 Subsistema         Administradora                      IBC          Tarifa          Valor
 Salud              EPS SURA                      2.000.000         12,50 %        250.000
 Pensión            PROTECCIÓN                    2.000.000         16,00 %        320.000
 Riesgos laborales  ARL SURA (Clase I)            2.000.000         0,522 %         10.500
 Total                                                                             580.500
Protección de datos personales: este comprobante es de uso exclusivo del aportante.
"""
ENCABEZADO_COLUMNAS = """
COMPROBANTE DE PAGO
Aportante: CONTRATISTA DE PRUEBA · CC 1000000002
 Planilla No.                    Periodo Pensión                             Periodo Salud                        Fecha de Pago
 8812345678                      09/2026                                     09/2026                              05/10/2026
Resumen de aportes
 AFP                               EPS                               ARL                            CCF                 Total
 $ 320.000                         $ 250.000                         $ 10.500                       $ 0                 $ 580.500
"""
FORMATO_US = """
Planilla Integrada de Liquidación de Aportes
N° de planilla 7701234567 | Pagada el 5 de octubre de 2026
Periodo: SEPTIEMBRE 2026
Ingreso base de cotización (IBC): 2,000,000.00
Aportes
Salud (EPS Nueva EPS) ...................................... 250,000.00
Pensión (Colpensiones) ..................................... 320,000.00
Riesgos laborales (Positiva) ................................ 10,500.00
Total pagado ............................................... 580,500.00
"""
ADMINISTRADORAS_NIT = """
DETALLE DE PAGO POR ADMINISTRADORA
No. de planilla asociada: 1234567890 · Periodo de liquidación: 2026/09
Fecha límite de pago 2026/10/09 · Fecha y hora de la transacción: 2026/10/05 10:15
 Tipo       Código          NIT                      Administradora                     Días               IBC          Cotización
 AFP        230301          800.224.808-8            PORVENIR                             30         2.000.000             320.000
 EPS        EPS010          800.088.702-2            EPS SURAMERICANA                     30         2.000.000             250.000
 ARL        14-23           860.011.153-6            POSITIVA COMPAÑÍA DE SEGUROS         30         2.000.000              10.500
Valor transacción: $580.500
"""
DOS_COLUMNAS_FSP = """
Resumen de pago · Planilla N° 5512345678
Periodo pensión: Septiembre de 2026                              Periodo salud: Septiembre de 2026
Fecha de pago: 08-oct-2026                                       IBC: $ 8.000.000
Salud: $ 1.000.000                                               Pensión: $ 1.280.000
Fondo de Solidaridad Pensional: $ 80.000                         ARL: $ 41.800
Total pagado: $ 2.401.800
"""
PENSIONADO = """
Planilla de autoliquidación de aportes
Planilla número: 6612345678 · Cotizante pensionado (no aporta a pensión)
Período: 2026-09 · Fecha de pago: 03/10/2026
 Concepto            Entidad                    Base            Valor
 Salud               SANITAS             $ 2.000.000        $ 250.000
 ARL (riesgo III)    COLMENA SEGUROS     $ 2.000.000         $ 48.800
Total a pagar: $ 298.800
"""
TRANSPUESTA = """
RESUMEN DE APORTES                        Planilla No. 4412345678
                 Salud            Pensión          ARL
IBC              2.000.000        2.000.000        2.000.000
Tarifa           12,50 %          16,00 %          0,522 %
Valor            250.000          320.000          10.500
Fecha de pago oportuno: 2026-10-10
Fecha de pago: 2026-10-07
"""
CELDA_POR_LINEA = """
Número de planilla
3312345678
IBC: 2.000.000
Salud
EPS SURA
250.000
Pensión
PORVENIR
320.000
ARL
SURA
10.500
"""
# Formato «Autoliquidación consolidada» (Enlace Operativo / SuAporte): todos los subsistemas en UNA fila, cada
# uno con su IBC antes del aporte; la parte de riesgos no dice «ARL»; la fecha va en el sello «PAGADO dd/mm/aaaa».
AUTOLIQUIDACION_CONSOLIDADA = """
                                                                                     SuAporte                         |             AUTOLIQUIDACION
                                                                                                                                       CONSOLIDADA
              Fecha creación reporte:           2026-10-15, 06:25:35 PM              Tipo Planilla:                 I: PLANILLA INDEPENDIENTES                Numéro Planilla:            77700011
                                                                                     Periodo Cotización:             septiembre de 2026            Periodo Servicio:            septiembre de 2026
                                                                                                                PAGADO 05/10/2026
 I. DATOS DEL APORTANTE
 Razón Social                            CONTRATISTA DE PRUEBA
 Documento                               CC1000000003
 Total Afiliados                         1                                                                                                                    ARP                                 POSITIVA DE SEGUROS
 II. DETALLE DEL APORTANTE
              Datos del Afiliado                                          Novedades                                      Pensiones                                         Salud                                 Riesgos                                  Cajas                                  Parafiscales                    Total
  Identificación  Apellidos y Nombres     Tipo   Subtipo                                                         Administradora      IBC       Aporte         Administradora         IBC       Aporte      Tarifa       IBC      Aporte        Administradora        IBC      Aporte    Aporte    Aporte     ESAP     Aporte       Total
CC 1000000003 CONTRATISTA DE PRUEBA       59       00                                            0 303030  0 (230201) PROTECCION   $ 2.800.000 $ 448.000(EPS010) EPS SURA          $ 2.800.000 $ 350.000    0,522    $ 2.800.000 $ 14.700(NIN-CC) NINGUNA CCF            $ 0       $ 0       $ 0       $ 0       $ 0       $ 0      $ 812.700
     III.TOTALES
       IBC Pensión        IBC Salud       IBC Riesgos        IBC Cajas       Aportes Pensión      Aportes Salud    Aportes Riesgos   Aportes Cajas     Aportes Sena      Aportes ICBF         ESAP         Min Educación     Licencias, Saldos        ARP         INTERESES DE        INTERESES      TOTAL FINAL
           $ 2.800.000       $ 2.800.000      $ 2.800.000              $ 0             $ 448.000         $ 350.000         $ 14.700               $ 0              $ 0               $ 0              $ 0               $ 0                 $ 0               $ 0        $ 812.700               $ 0      $ 812.700
           Enlace Operativo – Línea Expertos en PILA
"""
RECIBO_PSE = """
Comprobante de pago PSE
Valor pagado: $ 580.500
Referencia 1: 9400001234
Fecha: 2026-10-05
"""


class Analisis(unittest.TestCase):
    def revisar(self, texto, esperado, pistas=None):
        r = L.analizar_texto(texto, pistas)
        for k, v in esperado.items():
            self.assertEqual(r.get(k), v, f'{k}: {r.get(k)!r} ≠ {v!r}')
        return r

    def test_comprobante_con_tabla(self):
        self.revisar(COMPROBANTE_TABLA, {'numeroPlanilla': '9400001234', 'fechaPago': '2026-10-05', 'periodoPension': '2026-09',
                                         'periodoSalud': '2026-09', 'ibc': 2000000, 'salud': 250000, 'pension': 320000, 'arl': 10500, 'total': 580500})

    def test_encabezado_con_valores_debajo(self):
        self.revisar(ENCABEZADO_COLUMNAS, {'numeroPlanilla': '8812345678', 'fechaPago': '2026-10-05', 'periodoPension': '2026-09',
                                           'salud': 250000, 'pension': 320000, 'arl': 10500, 'total': 580500})

    def test_formato_us_y_fecha_en_letras(self):
        self.revisar(FORMATO_US, {'numeroPlanilla': '7701234567', 'fechaPago': '2026-10-05', 'periodoSalud': '2026-09',
                                  'ibc': 2000000, 'salud': 250000, 'pension': 320000, 'arl': 10500, 'total': 580500})

    def test_codigos_y_nit_no_son_valores_y_fecha_limite_no_es_la_de_pago(self):
        self.revisar(ADMINISTRADORAS_NIT, {'numeroPlanilla': '1234567890', 'fechaPago': '2026-10-05', 'periodoPension': '2026-09',
                                           'ibc': 2000000, 'salud': 250000, 'pension': 320000, 'arl': 10500, 'total': 580500})

    def test_pares_en_dos_columnas_y_fondo_de_solidaridad(self):
        r = self.revisar(DOS_COLUMNAS_FSP, {'numeroPlanilla': '5512345678', 'fechaPago': '2026-10-08', 'periodoPension': '2026-09',
                                            'ibc': 8000000, 'salud': 1000000, 'pension': 1280000, 'arl': 41800, 'fsp': 80000, 'total': 2401800})
        self.assertIn('fondo de solidaridad', ' '.join(L.avisos_de(r)))

    def test_pensionado_sin_aporte_a_pension(self):
        self.revisar(PENSIONADO, {'numeroPlanilla': '6612345678', 'fechaPago': '2026-10-03', 'salud': 250000, 'pension': 0, 'arl': 48800, 'total': 298800})

    def test_tabla_transpuesta_y_fecha_de_pago_oportuno(self):
        self.revisar(TRANSPUESTA, {'numeroPlanilla': '4412345678', 'fechaPago': '2026-10-07', 'ibc': 2000000, 'salud': 250000, 'pension': 320000, 'arl': 10500})

    def test_una_celda_por_linea_usa_la_tarifa_sobre_el_ibc(self):
        self.revisar(CELDA_POR_LINEA, {'numeroPlanilla': '3312345678', 'ibc': 2000000, 'salud': 250000, 'pension': 320000, 'arl': 10500})

    def test_autoliquidacion_consolidada_en_una_fila(self):
        r = self.revisar(AUTOLIQUIDACION_CONSOLIDADA, {'numeroPlanilla': '77700011', 'fechaPago': '2026-10-05', 'periodoPension': '2026-09',
                                                      'periodoSalud': '2026-09', 'ibc': 2800000, 'salud': 350000, 'pension': 448000,
                                                      'arl': 14700, 'total': 812700, 'operador': 'Enlace Operativo'})
        self.assertIsNone(r['ccf'])
        self.assertEqual(L.avisos_de(r, {'ibc': 2800000, 'anio': 2026, 'mes': 9}), [])

    def test_recibo_que_no_es_planilla_no_inventa_valores(self):
        r = L.analizar_texto(RECIBO_PSE)
        self.assertIsNone(r['numeroPlanilla'])
        for k in ('salud', 'pension', 'arl'):
            self.assertIsNone(r[k])

    def test_avisos_comparan_con_la_fila(self):
        r = L.analizar_texto(COMPROBANTE_TABLA)
        avisos = L.avisos_de(r, {'ibc': 1750905, 'anio': 2026, 'mes': 10})
        self.assertTrue(any('período 2026-09' in a for a in avisos))
        self.assertTrue(any('IBC de $ 2.000.000' in a for a in avisos))
        self.assertEqual(L.avisos_de(r, {'ibc': 2000000, 'anio': 2026, 'mes': 9}), [])


class Utilidades(unittest.TestCase):
    def test_montos(self):
        casos = {'1.234.567': 1234567, '1,234,567.00': 1234567, '1.234.567,89': 1234568, '580500': 580500,
                 '250,000.00': 250000, '$ 10.500': 10500, '12,50': 12, 'abc': None, '1.23.4': None}
        for texto, valor in casos.items():
            self.assertEqual(L.a_monto(texto), valor, texto)

    def test_porcentajes_nit_y_fechas_no_son_montos(self):
        self.assertEqual([m[0] for m in L.montos_en('Salud 12,50 % 800.088.702-2 2026-10-05 250.000')], [250000])

    def test_fechas(self):
        casos = {'5 de octubre de 2026': '2026-10-05', '08-oct-2026': '2026-10-08', '2026/10/05 10:15': '2026-10-05',
                 '05/10/2026': '2026-10-05', 'OCT 5, 2026': '2026-10-05'}
        for texto, iso in casos.items():
            self.assertEqual([f[0] for f in L.fechas_en(L.normalizar(texto))], [iso], texto)
        self.assertEqual(L.fechas_en('31/02/2026'), [])

    def test_periodos(self):
        casos = {'SEPTIEMBRE DE 2026': '2026-09', '09/2026': '2026-09', '2026-09': '2026-09', '202609': '2026-09', 'SEP/2026': '2026-09'}
        for texto, periodo in casos.items():
            self.assertEqual([p[0] for p in L.periodos_en(texto)], [periodo], texto)
        self.assertEqual(L.periodos_en('2026-09-15'), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
