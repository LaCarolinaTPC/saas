-- financiera vehiculo-mes con costo contable y sin operacion en GEMA
--
-- Contexto: el cruce mensual contra Lovable (docs/financiera-cruce-mensual-
-- lovable-gestivo.md, 2026-09-24) dejó ocho vehículo-mes con costo contable
-- real y ninguna fila en GEMA: buses en el taller que no hicieron un viaje
-- (506 y 530 en julio y agosto de 2026, 534, 558 y 562). Son 46.652.641 que la
-- contabilidad registró en esos meses y que Gestivo no mostraba, porque la
-- vista consolidada partía solo de `financiera_operativo_mes`: sin fila de GEMA
-- el costo no tenía dónde quedar y la utilidad de la flota salía más alta.
--
-- Decisión del usuario (2026-09-24): aceptar el vehículo-mes que solo tiene
-- costo contable, en el mes en que contabilidad lo registró.
--
--   1. La vista consolidada parte de GEMA MÁS las filas contables que no
--      tienen fila en GEMA. En esas, todo lo de GEMA vale 0, el costo va
--      entero y `sin_operacion` = true. origen_contable es 'solo_contable'.
--      El dueño, la flota y el modelo salen del último mes en que el bus operó
--      (o del primero después, si nunca operó antes); la placa, del maestro.
--   2. La productividad de flota por mes divide solo entre los vehículo-mes
--      con operación: un bus en el taller no hizo viajes porque no salió, y
--      contarlo bajaría el promedio de los que sí trabajaron. Columna nueva
--      `vehiculos_con_operacion` al final de vw_financiera_flota_mes; cuenta
--      solamente las filas con viajes > 0 (incluido el 812 de agosto).
--
-- El cargador (archivo-contable.ts) acepta la fila si el código está en el
-- maestro de vehículos; un código que no existe en GEMA (el 1058) se sigue
-- rechazando.
--
-- Ninguna tabla cambia. CREATE OR REPLACE conserva columnas y GRANT, y las
-- columnas nuevas van al final, así que el script se puede correr dos veces.

BEGIN;

-- ── 1. Vista consolidada ─────────────────────────────────────────────────────
-- Definición vigente: la de 20260923212520 con la CTE `solo_contable`, la
-- unión `filas` y la columna `sin_operacion` al final. Todo lo demás, igual.

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
    MAX(o.updated_at)                              AS operativo_updated_at,
    false                                          AS sin_operacion
  FROM financiera_operativo_mes o
  GROUP BY o.periodo, o.codigo_vehiculo
),
-- Filas contables sin fila en GEMA: mismas columnas que `op`, en el mismo orden.
solo_contable AS (
  SELECT
    c.periodo,
    c.codigo_vehiculo,
    1                                              AS propietarios,
    d.cedula_propietario,
    d.propietario_nombre,
    COALESCE(v.tipo_propietario_op, d.tipo_propietario) AS tipo_propietario,
    COALESCE(v.placa, d.placa)                     AS placa,
    false                                          AS placa_cambio,
    d.modelo,
    0::numeric                                     AS viajes,
    0::numeric                                     AS timbradas,
    0::numeric                                     AS ingresos,
    0                                              AS dias_con_produccion,
    0::numeric AS fondo, 0::numeric AS poliza, 0::numeric AS prestamo, 0::numeric AS estudio,
    0::numeric AS salario, 0::numeric AS combustible, 0::numeric AS rtica, 0::numeric AS admon,
    0::numeric AS sitra, 0::numeric AS fet, 0::numeric AS valor_camb, 0::numeric AS incentivo_c,
    0::numeric AS valor_descuentos,
    0                                              AS filas_origen,
    NULL::timestamptz                              AS operativo_updated_at,
    true                                           AS sin_operacion
  FROM financiera_contable_mes c
  LEFT JOIN vehiculos v ON v.codigo = c.codigo_vehiculo
  LEFT JOIN LATERAL (
    -- El dueño del último mes en que operó; si nunca operó antes, el del primero después.
    SELECT o.cedula_propietario, o.propietario_nombre, o.tipo_propietario, o.placa, o.modelo
      FROM financiera_operativo_mes o
     WHERE o.codigo_vehiculo = c.codigo_vehiculo
     ORDER BY (o.periodo > c.periodo),
              CASE WHEN o.periodo < c.periodo THEN o.periodo END DESC,
              o.periodo,
              o.dias_con_produccion DESC,
              o.updated_at DESC
     LIMIT 1
  ) d ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM financiera_operativo_mes o
     WHERE o.periodo = c.periodo AND o.codigo_vehiculo = c.codigo_vehiculo
  )
),
filas AS (
  SELECT * FROM op
  UNION ALL
  SELECT * FROM solo_contable
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
  FROM filas op
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
  CASE WHEN c.sin_operacion THEN 'solo_contable'
       WHEN c.tiene_contable THEN 'archivo'
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
  c.poliza_vehiculos_nuevos,
  c.sin_operacion
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados. origen_contable: archivo = fila contable con GEMA; solo_contable = fila contable sin GEMA; sin_movimiento = no vino en el archivo del mes pero no hizo viajes ni tuvo ingresos; sin_dato = falta el archivo. sin_operacion = true si no hay fila en GEMA: todo lo operativo vale 0 y no cuenta para productividad. El dueño sale del último mes en que operó y la flota y placa del maestro de vehículos. gastos_contables incluye combustible y póliza de vehículos nuevos. id = periodo|codigo_vehiculo.';

-- ── 2. Vista por mes: productividad solo sobre los que operaron ──────────────
-- Definición de 20260923212520 con la lista de columnas explícita (antes t.*),
-- el conteo nuevo al final y la productividad dividida por ese conteo.

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
    SUM(valor_descuentos)                                    AS valor_descuentos,
    COUNT(*) FILTER (WHERE viajes > 0)::integer              AS vehiculos_con_operacion
  FROM vw_financiera_consolidado
  GROUP BY periodo
)
SELECT
  t.periodo, t.estado_periodo, t.vehiculos, t.vehiculos_activos, t.vehiculos_con_contable,
  t.viajes, t.timbradas, t.ingresos, t.gastos_gema, t.gastos_contables,
  t.gastos_operativos_totales, t.utilidad_neta, t.intereses,
  t.fet, t.valor_camb, t.incentivo_c, t.valor_descuentos,
  CASE WHEN t.vehiculos = t.vehiculos_con_contable THEN 'completo'
       WHEN t.vehiculos_con_contable = 0            THEN 'sin_dato'
       ELSE 'parcial' END                                    AS cobertura_contable,
  CASE WHEN t.ingresos > 0 THEN t.utilidad_neta / t.ingresos * 100 ELSE 0 END AS rentabilidad,
  CASE WHEN t.timbradas > 0 THEN t.gastos_operativos_totales / t.timbradas ELSE 0 END AS gastos_por_timbrada,
  CASE WHEN t.vehiculos_con_operacion > 0 THEN t.viajes / t.vehiculos_con_operacion ELSE 0 END AS productividad,
  CASE WHEN t.ingresos > 0 THEN (t.utilidad_neta + t.intereses) / t.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN t.timbradas > 0 THEN (t.gastos_operativos_totales - t.intereses) / t.timbradas ELSE 0 END AS gastos_por_timbrada_operativo,
  t.vehiculos_con_operacion
FROM t;

COMMIT;

-- ── 3. Comprobación ──────────────────────────────────────────────────────────
-- Antes de cargar las ocho filas: ninguna fila sin_operacion y la
-- Antes de cargar las ocho filas: ninguna fila sin_operacion. El divisor de
-- productividad ya excluye los vehículo-mes sin viajes (p. ej. 812 de agosto).
-- Después de cargarlas: ocho filas, 46.652.641 de gastos contables.

SELECT periodo, codigo_vehiculo, propietario_nombre, tipo_propietario, placa, gastos_contables, utilidad_neta
  FROM vw_financiera_consolidado
 WHERE sin_operacion
 ORDER BY periodo, codigo_vehiculo;

SELECT periodo, vehiculos, vehiculos_con_operacion, vehiculos_con_contable, cobertura_contable, productividad
  FROM vw_financiera_flota_mes
 WHERE periodo >= '2025-12'
 ORDER BY periodo;
