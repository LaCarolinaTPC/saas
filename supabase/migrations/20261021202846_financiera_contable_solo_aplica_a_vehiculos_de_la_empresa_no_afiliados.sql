-- El archivo contable aplica solo a los vehículos de la EMPRESA (no afiliados).
--
-- Contexto (verificado 2026-10-21 contra Supabase):
--   Los rubros del archivo contable (intereses, otros gastos, repuestos, mano de
--   obra, desc. fondo-conductor) son GASTOS DE LA EMPRESA: aplican a los buses
--   propios (tipo_propietario EMPRESA/MIXTO), no a los AFILIADOS (de terceros).
--
--     | mes | EMPRESA con fila | suma rubros empresa | AFILIADO con fila | rubros afiliado |
--     | ago | 72/72            | 300.032.445         | 86/87 (ceros)     | ~0              |
--     | sep | 72/72            | 404.591.269         | 3/84              | 1.114.647       |
--
--   En septiembre contabilidad cargó solo los vehículos de la empresa, así que
--   los 78 afiliados sin fila hacían que la cobertura saliera "parcial (78/156)"
--   y la rentabilidad quedara como TECHO (≤). Es un falso positivo: los 72 de la
--   empresa están completos y el costo contable de un afiliado es ~0.
--
-- Esta migración:
--   1. vw_financiera_consolidado: columna `requiere_contable` (EMPRESA/MIXTO) y
--      nuevo origen_contable `no_aplica` (afiliado que operó y no tiene fila:
--      antes caía en `sin_dato`). `sin_dato` queda SOLO para empresa sin fila.
--   2. vw_financiera_flota_mes: la cobertura se mide sobre los que REQUIEREN
--      contable; `completo` cuando ningún empresa/mixto queda sin su fila.
--
--   No cambia la utilidad ni la rentabilidad de ningún vehículo (el contable de
--   afiliados ya valía 0): solo la clasificación de cobertura y la alerta.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

BEGIN;

-- =============================================================================
-- 1. vw_financiera_consolidado: requiere_contable + origen_contable 'no_aplica'
-- =============================================================================
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
    SUM(o.despacho)                                AS despacho,
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
    0::numeric AS despacho,
    0::numeric AS sitra, 0::numeric AS fet, 0::numeric AS valor_camb, 0::numeric AS incentivo_c,
    0::numeric AS valor_descuentos,
    0                                              AS filas_origen,
    NULL::timestamptz                              AS operativo_updated_at,
    true                                           AS sin_operacion
  FROM financiera_contable_mes c
  LEFT JOIN vehiculos v ON v.codigo = c.codigo_vehiculo
  LEFT JOIN LATERAL (
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
    -- Costo de empresa: aplica a los buses propios (EMPRESA/MIXTO), no a afiliados.
    (op.tipo_propietario IN ('EMPRESA', 'MIXTO')) AS requiere_contable,
    COALESCE(c.intereses, 0)                  AS intereses,
    COALESCE(c.otros_gastos, 0)               AS otros_gastos,
    COALESCE(c.repuestos, 0)                  AS repuestos,
    COALESCE(c.mano_de_obra, 0)               AS mano_de_obra,
    COALESCE(c.desc_fondo_conductor, 0)       AS desc_fondo_conductor,
    COALESCE(c.combustible_vehiculos_nuevos, 0) AS combustible_vehiculos_nuevos,
    COALESCE(c.poliza_vehiculos_nuevos, 0)      AS poliza_vehiculos_nuevos,
    COALESCE(c.recuperacion_combustible_gn, 0)  AS recuperacion_combustible_gn,
    COALESCE(c.celdas_vacias, 0)              AS celdas_vacias,
    c.updated_at                              AS contable_updated_at,
    (op.fondo + op.poliza + op.prestamo + op.estudio + op.salario
       + op.combustible + op.rtica + op.admon + op.despacho + op.sitra) AS gastos_gema,
    (COALESCE(c.intereses, 0) + COALESCE(c.otros_gastos, 0)
       + (COALESCE(c.repuestos, 0) - COALESCE(c.desc_fondo_conductor, 0))
       + COALESCE(c.mano_de_obra, 0)
       + COALESCE(c.combustible_vehiculos_nuevos, 0)
       + COALESCE(c.poliza_vehiculos_nuevos, 0)
       - COALESCE(c.recuperacion_combustible_gn, 0))     AS gastos_contables
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
  -- origen_contable: 'no_aplica' = afiliado que operó y no requiere contable
  -- (antes caía en 'sin_dato'); 'sin_dato' queda solo para empresa sin su fila.
  CASE WHEN c.sin_operacion THEN 'solo_contable'
       WHEN c.tiene_contable THEN 'archivo'
       WHEN c.mes_con_archivo AND c.viajes = 0 AND c.ingresos = 0 AND c.timbradas = 0
            THEN 'sin_movimiento'
       WHEN NOT c.requiere_contable THEN 'no_aplica'
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
  c.sin_operacion,
  c.recuperacion_combustible_gn,
  c.requiere_contable
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota. despacho sale de GEMA (SUM(cartu_admon)) y entra en gastos_gema. requiere_contable = el bus es de la empresa (EMPRESA/MIXTO): solo esos deben traer archivo contable. origen_contable: archivo = fila contable con GEMA; solo_contable = fila sin GEMA; sin_movimiento = sin fila pero sin operación; no_aplica = afiliado que operó y no requiere contable; sin_dato = empresa que operó y le falta la fila contable. id = periodo|codigo_vehiculo.';

-- =============================================================================
-- 2. vw_financiera_flota_mes: cobertura sobre los que REQUIEREN contable
-- =============================================================================
CREATE OR REPLACE VIEW vw_financiera_flota_mes AS
WITH t AS (
  SELECT
    periodo,
    MAX(estado_periodo)                                      AS estado_periodo,
    COUNT(*)::integer                                        AS vehiculos,
    COUNT(*) FILTER (WHERE vehiculo_activo)::integer         AS vehiculos_activos,
    -- Empresa/mixto que deben traer contable y los que ya lo tienen.
    COUNT(*) FILTER (WHERE requiere_contable)::integer       AS vehiculos_requieren_contable,
    COUNT(*) FILTER (WHERE requiere_contable
                       AND origen_contable IN ('archivo', 'solo_contable'))::integer AS vehiculos_con_contable,
    COUNT(*) FILTER (WHERE origen_contable = 'sin_dato')::integer AS vehiculos_sin_contable,
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
  -- Completo cuando ningún empresa/mixto queda sin su fila contable.
  CASE WHEN t.vehiculos_requieren_contable = 0            THEN 'no_aplica'
       WHEN t.vehiculos_sin_contable = 0                  THEN 'completo'
       WHEN t.vehiculos_con_contable = 0                  THEN 'sin_dato'
       ELSE 'parcial' END                                   AS cobertura_contable,
  CASE WHEN t.ingresos > 0 THEN t.utilidad_neta / t.ingresos * 100 ELSE 0 END AS rentabilidad,
  CASE WHEN t.timbradas > 0 THEN t.gastos_operativos_totales / t.timbradas ELSE 0 END AS gastos_por_timbrada,
  CASE WHEN t.vehiculos_con_operacion > 0 THEN t.viajes / t.vehiculos_con_operacion ELSE 0 END AS productividad,
  CASE WHEN t.ingresos > 0 THEN (t.utilidad_neta + t.intereses) / t.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN t.timbradas > 0 THEN (t.gastos_operativos_totales - t.intereses) / t.timbradas ELSE 0 END AS gastos_por_timbrada_operativo,
  t.vehiculos_con_operacion,
  -- Columna nueva al final (CREATE OR REPLACE VIEW).
  t.vehiculos_requieren_contable
FROM t;

COMMENT ON VIEW vw_financiera_flota_mes IS
  'Resumen por período de vw_financiera_consolidado. cobertura_contable se mide sobre los vehículos que REQUIEREN contable (empresa/mixto): completo cuando ninguno queda sin su fila; parcial si faltan algunos; sin_dato si no se cargó ninguno; no_aplica si el mes no tiene buses de empresa. vehiculos_con_contable y vehiculos_requieren_contable son del universo empresa.';

COMMIT;

-- ── Comprobación ─────────────────────────────────────────────────────────────
SELECT periodo, vehiculos, vehiculos_requieren_contable, vehiculos_con_contable,
       cobertura_contable, round(rentabilidad::numeric, 2) AS rentabilidad
  FROM vw_financiera_flota_mes
 WHERE periodo BETWEEN '2026-07' AND '2026-10'
 ORDER BY periodo;

SELECT periodo, origen_contable, count(*)
  FROM vw_financiera_consolidado
 WHERE periodo = '2026-09'
 GROUP BY periodo, origen_contable
 ORDER BY origen_contable;
