-- financiera buses sin movimiento no cuentan como faltantes del archivo contable
--
-- Contexto: agosto de 2026 salía con cobertura «parcial» (155 de 156) solo por
-- el bus 812, inactivo en el maestro, con 0 viajes, 0 ingresos y 25.500 de
-- póliza y fondo. El archivo contable del mes no lo traía porque no operó, y
-- con eso bastaba para que todo rango que tocara agosto mostrara el aviso
-- «Parte del rango no tiene cargado el archivo contable» y marcara la utilidad
-- como techo.
--
-- La ausencia de un bus parado en el archivo de un mes que SÍ tiene archivo no
-- es un dato faltante: la contabilidad no tenía nada que cargarle. Se crea un
-- tercer valor de origen_contable, `sin_movimiento`, que cuenta como cubierto:
--
--   archivo         el bus tiene fila en financiera_contable_mes
--   sin_movimiento  no tiene fila, pero no hizo viajes ni tuvo ingresos ni
--                   timbradas, y el mes sí tiene archivo para otros buses
--   sin_dato        todo lo demás: falta el archivo y la utilidad es un techo
--
-- La condición del mes es la misma que usa historico.ts para los conceptos de
-- vehículos nuevos: en un mes sin archivo (septiembre de 2026, en curso) los
-- buses parados siguen como `sin_dato`, porque si no el mes pasaría de «sin
-- dato» a «parcial» y parecería que tiene archivo.
--
-- Queda fuera, a propósito, el bus que operó y no vino en el archivo: eso sí es
-- un faltante.
--
-- Solo cambia la expresión de origen_contable y el conteo de la vista por mes;
-- ningún importe se mueve. CREATE OR REPLACE conserva columnas y GRANT, así que
-- el script se puede correr dos veces sin efecto adicional.

-- ── 1. Vista consolidada: el tercer origen ───────────────────────────────────
-- Definición vigente: la de 20260921202204 con `mes_con_archivo` en `base` y el
-- CASE de origen_contable ampliado. Todo lo demás, igual.

CREATE OR REPLACE VIEW vw_financiera_consolidado AS
WITH op AS (
  SELECT
    o.periodo,
    o.codigo_vehiculo,
    COUNT(*)::integer                              AS propietarios,
    CASE WHEN COUNT(*) = 1 THEN MAX(o.cedula_propietario) END AS cedula_propietario,
    CASE WHEN COUNT(*) = 1 THEN MAX(o.propietario_nombre) ELSE 'VARIOS' END AS propietario_nombre,
    CASE WHEN COUNT(DISTINCT o.tipo_propietario) = 1 THEN MAX(o.tipo_propietario) ELSE 'MIXTO' END AS tipo_propietario,
    (array_agg(o.placa ORDER BY o.dias_con_produccion DESC, o.updated_at DESC))[1] AS placa,
    (BOOL_OR(o.placa_cambio) OR COUNT(DISTINCT o.placa) > 1)  AS placa_cambio,
    MAX(o.modelo)                                  AS modelo,
    SUM(o.viajes)                                  AS viajes,
    SUM(o.timbradas)                               AS timbradas,
    SUM(o.ingresos)                                AS ingresos,
    SUM(o.dias_con_produccion)::integer            AS dias_con_produccion,
    SUM(o.fondo)                                   AS fondo,
    SUM(o.poliza)                                  AS poliza,
    SUM(o.prestamo)                                AS prestamo,
    SUM(o.estudio)                                 AS estudio,
    SUM(o.salario)                                 AS salario,
    SUM(o.combustible)                             AS combustible,
    SUM(o.rtica)                                   AS rtica,
    SUM(o.admon)                                   AS admon,
    SUM(o.sitra)                                   AS sitra,
    SUM(o.fet)                                     AS fet,
    SUM(o.valor_camb)                              AS valor_camb,
    SUM(o.incentivo_c)                             AS incentivo_c,
    SUM(o.valor_descuentos)                        AS valor_descuentos,
    SUM(o.filas_origen)::integer                   AS filas_origen,
    MAX(o.updated_at)                              AS operativo_updated_at
  FROM financiera_operativo_mes o
  GROUP BY o.periodo, o.codigo_vehiculo
),
base AS (
  SELECT
    op.*,
    v.placa                                   AS placa_maestro,
    COALESCE(op.modelo, v.modelo)             AS modelo_efectivo,
    v.estado                                  AS estado_vehiculo,
    (v.estado = 1)                            AS vehiculo_activo,
    p.estado                                  AS estado_periodo,
    p.cerrado_at,
    c.id IS NOT NULL                          AS tiene_contable,
    BOOL_OR(c.id IS NOT NULL) OVER (PARTITION BY op.periodo) AS mes_con_archivo,
    COALESCE(c.despacho, 0)                   AS despacho,
    COALESCE(c.intereses, 0)                  AS intereses,
    COALESCE(c.otros_gastos, 0)               AS otros_gastos,
    COALESCE(c.repuestos, 0)                  AS repuestos,
    COALESCE(c.mano_de_obra, 0)               AS mano_de_obra,
    COALESCE(c.desc_fondo_conductor, 0)       AS desc_fondo_conductor,
    COALESCE(c.combustible_vehiculos_nuevos, 0) AS combustible_vehiculos_nuevos,
    COALESCE(c.poliza_vehiculos_nuevos, 0)      AS poliza_vehiculos_nuevos,
    COALESCE(c.celdas_vacias, 0)              AS celdas_vacias,
    c.updated_at                              AS contable_updated_at,
    (op.fondo + op.poliza + op.prestamo + op.estudio + op.salario
       + op.combustible + op.rtica + op.admon + op.sitra) AS gastos_gema,
    (COALESCE(c.despacho, 0) + COALESCE(c.intereses, 0) + COALESCE(c.otros_gastos, 0)
       + (COALESCE(c.repuestos, 0) - COALESCE(c.desc_fondo_conductor, 0))
       + COALESCE(c.mano_de_obra, 0)
       + COALESCE(c.combustible_vehiculos_nuevos, 0)
       + COALESCE(c.poliza_vehiculos_nuevos, 0))         AS gastos_contables
  FROM op
  LEFT JOIN financiera_contable_mes c
         ON c.periodo = op.periodo AND c.codigo_vehiculo = op.codigo_vehiculo
  LEFT JOIN vehiculos v ON v.codigo = op.codigo_vehiculo
  LEFT JOIN financiera_periodos p ON p.periodo = op.periodo
),
calc AS (
  SELECT
    b.*,
    (b.gastos_gema + b.gastos_contables)              AS gastos_operativos_totales,
    (b.ingresos - b.gastos_gema - b.gastos_contables)  AS utilidad_neta
  FROM base b
)
SELECT
  c.periodo,
  c.codigo_vehiculo,
  c.propietarios,
  c.cedula_propietario,
  c.propietario_nombre,
  c.tipo_propietario,
  c.placa,
  c.placa_cambio,
  c.placa_maestro,
  c.modelo_efectivo                                   AS modelo,
  c.estado_vehiculo,
  c.vehiculo_activo,
  c.estado_periodo,
  c.cerrado_at,
  c.viajes,
  c.timbradas,
  c.ingresos,
  c.dias_con_produccion,
  c.fondo, c.poliza, c.prestamo, c.estudio, c.salario,
  c.combustible, c.rtica, c.admon, c.sitra,
  c.fet, c.valor_camb, c.incentivo_c, c.valor_descuentos,
  c.despacho, c.intereses, c.otros_gastos, c.repuestos,
  c.mano_de_obra, c.desc_fondo_conductor,
  (c.repuestos - c.desc_fondo_conductor)              AS repuestos_netos,
  c.celdas_vacias,
  CASE WHEN c.tiene_contable THEN 'archivo'
       WHEN c.mes_con_archivo AND c.viajes = 0 AND c.ingresos = 0 AND c.timbradas = 0
            THEN 'sin_movimiento'
       ELSE 'sin_dato' END                            AS origen_contable,
  c.gastos_gema,
  c.gastos_contables,
  c.gastos_operativos_totales,
  c.utilidad_neta,
  CASE WHEN c.ingresos > 0
       THEN c.utilidad_neta / c.ingresos * 100 ELSE 0 END      AS rentabilidad,
  CASE WHEN c.timbradas > 0
       THEN c.gastos_operativos_totales / c.timbradas ELSE 0 END AS gastos_por_timbrada,
  (c.utilidad_neta + c.intereses)                              AS utilidad_operativa,
  CASE WHEN c.ingresos > 0
       THEN (c.utilidad_neta + c.intereses) / c.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN c.timbradas > 0
       THEN (c.gastos_operativos_totales - c.intereses) / c.timbradas ELSE 0 END AS gastos_por_timbrada_operativo,
  c.filas_origen,
  c.operativo_updated_at,
  c.contable_updated_at,
  (c.periodo || '|' || c.codigo_vehiculo)             AS id,
  -- Al final, que CREATE OR REPLACE VIEW solo admite columnas nuevas ahí.
  c.combustible_vehiculos_nuevos,
  c.poliza_vehiculos_nuevos
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados. origen_contable: archivo = tiene los rubros contables; sin_movimiento = no vino en el archivo del mes pero no hizo viajes ni tuvo ingresos, así que no le falta nada; sin_dato = falta el archivo y su utilidad es un techo. tipo_propietario (la «Flota») sale de vehiculos.tipo_propietario_op desde el corte de financiera_flota_desde_maestro() y del histórico del aplicativo antes. gastos_contables incluye combustible_vehiculos_nuevos y poliza_vehiculos_nuevos, que son costo operativo aunque GEMA no los registre. `id` = periodo|codigo_vehiculo.';

-- ── 2. Vista por mes: los buses sin movimiento cuentan como cubiertos ────────
-- Definición de 20260921140156 con un solo cambio: el FILTER de
-- vehiculos_con_contable. Mismas columnas y en el mismo orden.

CREATE OR REPLACE VIEW vw_financiera_flota_mes AS
WITH t AS (
  SELECT
    periodo,
    MAX(estado_periodo)                                      AS estado_periodo,
    COUNT(*)::integer                                        AS vehiculos,
    COUNT(*) FILTER (WHERE vehiculo_activo)::integer         AS vehiculos_activos,
    COUNT(*) FILTER (WHERE origen_contable <> 'sin_dato')::integer AS vehiculos_con_contable,
    SUM(viajes)                                              AS viajes,
    SUM(timbradas)                                           AS timbradas,
    SUM(ingresos)                                            AS ingresos,
    SUM(gastos_gema)                                         AS gastos_gema,
    SUM(gastos_contables)                                    AS gastos_contables,
    SUM(gastos_operativos_totales)                           AS gastos_operativos_totales,
    SUM(utilidad_neta)                                       AS utilidad_neta,
    SUM(intereses)                                           AS intereses,
    SUM(fet)                                                 AS fet,
    SUM(valor_camb)                                          AS valor_camb,
    SUM(incentivo_c)                                         AS incentivo_c,
    SUM(valor_descuentos)                                    AS valor_descuentos
  FROM vw_financiera_consolidado
  GROUP BY periodo
)
SELECT
  t.*,
  CASE WHEN t.vehiculos = t.vehiculos_con_contable THEN 'completo'
       WHEN t.vehiculos_con_contable = 0            THEN 'sin_dato'
       ELSE 'parcial' END                                    AS cobertura_contable,
  CASE WHEN t.ingresos > 0 THEN t.utilidad_neta / t.ingresos * 100 ELSE 0 END AS rentabilidad,
  CASE WHEN t.timbradas > 0 THEN t.gastos_operativos_totales / t.timbradas ELSE 0 END AS gastos_por_timbrada,
  CASE WHEN t.vehiculos > 0 THEN t.viajes / t.vehiculos ELSE 0 END AS productividad,
  CASE WHEN t.ingresos > 0 THEN (t.utilidad_neta + t.intereses) / t.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN t.timbradas > 0 THEN (t.gastos_operativos_totales - t.intereses) / t.timbradas ELSE 0 END AS gastos_por_timbrada_operativo
FROM t;

-- ── 3. Comprobación ──────────────────────────────────────────────────────────
-- Esperado hoy: una sola fila sin_movimiento (2026-08, bus 812); agosto pasa a
-- «completo» con 156 de 156 y septiembre sigue «sin_dato».

SELECT periodo, codigo_vehiculo, viajes, ingresos, gastos_gema
  FROM vw_financiera_consolidado
 WHERE origen_contable = 'sin_movimiento'
 ORDER BY periodo, codigo_vehiculo;

SELECT periodo, vehiculos, vehiculos_con_contable, cobertura_contable
  FROM vw_financiera_flota_mes
 WHERE periodo >= '2026-07'
 ORDER BY periodo;
