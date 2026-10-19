-- financiera recuperacion contable de combustible gn
--
-- Contexto (2026-10-19): contabilidad registra devoluciones del proveedor de
-- gas natural (GN) por el combustible de los buses. Hoy ese valor no entra en
-- Gestión Resultado Flota y la utilidad del mes sale más baja de lo real. El
-- usuario pidió un rubro con nombre propio, «Recuperación Combustible (GN)»,
-- que llega por el mismo archivo contable de la fase 4 (previsualización,
-- reversión y bitácora) en Datos de flota.
--
-- Decisión: es una RECUPERACIÓN, así que RESTA del gasto contable, igual que
-- `desc_fondo_conductor` (signo -1 en la comparación mensual). Entra en
-- `gastos_contables` restando, y por tanto sube la utilidad, la rentabilidad
-- y baja el gasto por timbrada. NO es financiera: el único rubro financiero
-- sigue siendo `intereses`. Tampoco es mantenimiento: no toca el análisis de
-- repuestos y mano de obra.
--
-- Columna OPCIONAL en el archivo: los archivos existentes de contabilidad no
-- la traen y deben seguir entrando; ausente vale 0.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF NOT EXISTS,
-- CREATE OR REPLACE). Correrlo dos veces deja lo mismo.
--
-- No se crea ninguna tabla, solo una columna; los GRANT de 20260921140156
-- siguen valiendo y CREATE OR REPLACE conserva los de la vista.

BEGIN;

-- ── 1. La columna ────────────────────────────────────────────────────────────
-- Por defecto 0, como los otros rubros: en el archivo es opcional y una celda
-- vacía vale cero.

ALTER TABLE financiera_contable_mes
  ADD COLUMN IF NOT EXISTS recuperacion_combustible_gn NUMERIC(16,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN financiera_contable_mes.recuperacion_combustible_gn IS
  'Recuperación Combustible (GN): devolución del proveedor de gas natural que contabilidad registra por vehículo-mes. Se RESTA de gastos_contables (es una recuperación, no un gasto), igual que desc_fondo_conductor. Llega por el archivo contable como columna opcional.';

-- ── 2. La vista lo resta del gasto contable ──────────────────────────────────
-- Definición vigente: la de 20260924145446 con el rubro nuevo restado en
-- `gastos_contables` y expuesto como columna propia al final. Todo lo demás,
-- igual.

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
    COALESCE(c.recuperacion_combustible_gn, 0)  AS recuperacion_combustible_gn,
    COALESCE(c.celdas_vacias, 0)              AS celdas_vacias,
    c.updated_at                              AS contable_updated_at,
    (op.fondo + op.poliza + op.prestamo + op.estudio + op.salario
       + op.combustible + op.rtica + op.admon + op.sitra) AS gastos_gema,
    (COALESCE(c.despacho, 0) + COALESCE(c.intereses, 0) + COALESCE(c.otros_gastos, 0)
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
  c.sin_operacion,
  c.recuperacion_combustible_gn
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados. origen_contable: archivo = fila contable con GEMA; solo_contable = fila contable sin GEMA; sin_movimiento = no vino en el archivo del mes pero no hizo viajes ni tuvo ingresos; sin_dato = falta el archivo. sin_operacion = true si no hay fila en GEMA: todo lo operativo vale 0 y no cuenta para productividad. El dueño sale del último mes en que operó y la flota y placa del maestro de vehículos. gastos_contables incluye combustible y póliza de vehículos nuevos y RESTA recuperacion_combustible_gn (devolución del proveedor de gas). id = periodo|codigo_vehiculo.';

COMMIT;

-- ── 3. Comprobación ──────────────────────────────────────────────────────────
-- La columna existe y vale 0 en todo lo cargado hasta ahora, así que ningún
-- importe cambia todavía. El valor entra después, por la pantalla de Datos de
-- flota, con el archivo contable que traiga la columna nueva.

SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'financiera_contable_mes'
   AND column_name = 'recuperacion_combustible_gn';

SELECT COUNT(*)                                  AS filas,
       SUM(recuperacion_combustible_gn)::bigint  AS recuperacion_gn
  FROM financiera_contable_mes;

SELECT COUNT(*) AS filas, SUM(ingresos)::bigint AS ingresos, SUM(utilidad_neta)::bigint AS utilidad
  FROM vw_financiera_consolidado;
