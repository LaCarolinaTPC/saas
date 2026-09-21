-- financiera conceptos contables de combustible y poliza de vehiculos nuevos
--
-- Contexto: al cotejar el histórico contra el aplicativo de Lovable (fase 7)
-- aparecieron 50 vehículo-mes donde el aplicativo tenía más costo que GEMA.
-- No es un error del espejo: son valores que se escribían a mano en el Excel
-- porque GEMA no los registra. Ocurre con los buses que acaban de entrar a
-- operar, cuyo combustible y póliza todavía no llegan por el cierre diario.
--
--   combustible  47 vehículo-mes · 101.176.280 · 2025-06 a 08 y 2026-05 a 08
--   póliza        3 vehículo-mes ·   2.745.624 · 2026-04
--
-- Buses afectados: 1022, 1029, 1038, 1055, 1056 y 1057, todos entrados en
-- operación desde 2026-04, más el 10000, que operó cuatro meses en 2025 y ya
-- está retirado.
--
-- En vez de un mecanismo de «ajustes» anónimo, se crean dos conceptos
-- contables con nombre propio, que se cargan por el mismo archivo y el mismo
-- flujo de la fase 4 (previsualización, reversión y bitácora). Así en los
-- informes se lee «combustible de vehículos nuevos» y no un ajuste sin
-- explicación.
--
-- Entran en `gastos_contables` y por tanto en gastos_operativos_totales, la
-- utilidad, la rentabilidad y el gasto por timbrada. NO son financieros: el
-- único rubro financiero sigue siendo `intereses`, así que estos también
-- restan en la vista operativa. Tampoco son mantenimiento: no entran en el
-- análisis de repuestos y mano de obra.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING). Correrlo dos veces deja lo mismo.
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto. Aquí no se crea ninguna tabla, solo columnas; los
-- GRANT de 20260921140156 siguen valiendo y CREATE OR REPLACE conserva los de
-- la vista.

-- ── 1. Las dos columnas ──────────────────────────────────────────────────────
-- Por defecto 0, como los otros seis rubros: en el archivo son opcionales y
-- una celda vacía vale cero.

ALTER TABLE financiera_contable_mes
  ADD COLUMN IF NOT EXISTS combustible_vehiculos_nuevos NUMERIC(16,2) NOT NULL DEFAULT 0;

ALTER TABLE financiera_contable_mes
  ADD COLUMN IF NOT EXISTS poliza_vehiculos_nuevos NUMERIC(16,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN financiera_contable_mes.combustible_vehiculos_nuevos IS
  'Combustible que GEMA no registra en el cierre diario, típicamente de buses recién entrados a operar. Se cargaba a mano en el Excel del aplicativo de Lovable. Es costo operativo: suma a gastos_operativos_totales. No confundir con `combustible`, que viene del espejo.';

COMMENT ON COLUMN financiera_contable_mes.poliza_vehiculos_nuevos IS
  'Póliza que GEMA no registra en el cierre diario, típicamente de buses recién entrados a operar. Es costo operativo: suma a gastos_operativos_totales. No confundir con `poliza`, que viene del espejo.';

-- ── 2. La vista los suma al gasto contable ───────────────────────────────────
-- Definición vigente: la de 20260921154738 con los dos rubros añadidos a
-- `gastos_contables` y expuestos como columnas propias. Todo lo demás, igual.

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
  CASE WHEN c.tiene_contable THEN 'archivo' ELSE 'sin_dato' END AS origen_contable,
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
  'Vehículo-mes con los indicadores del Excel de flota calculados. origen_contable = sin_dato marca la fila incompleta: su utilidad es un techo. tipo_propietario (la «Flota») sale de vehiculos.tipo_propietario_op desde el corte de financiera_flota_desde_maestro() y del histórico del aplicativo antes. gastos_contables incluye combustible_vehiculos_nuevos y poliza_vehiculos_nuevos, que son costo operativo aunque GEMA no los registre. `id` = periodo|codigo_vehiculo.';

-- ── 3. Comprobación ──────────────────────────────────────────────────────────
-- Las dos columnas existen y valen 0 en todo lo cargado hasta ahora, así que
-- ningún importe cambia todavía. Los 50 vehículo-mes se cargan después, por la
-- pantalla, con `npm run financiera:historico -- --api --nuevos`.

SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'financiera_contable_mes'
   AND column_name IN ('combustible_vehiculos_nuevos', 'poliza_vehiculos_nuevos')
 ORDER BY column_name;

SELECT COUNT(*)                                         AS filas,
       SUM(combustible_vehiculos_nuevos)::bigint        AS combustible_nuevos,
       SUM(poliza_vehiculos_nuevos)::bigint             AS poliza_nuevos
  FROM financiera_contable_mes;

SELECT COUNT(*) AS filas, SUM(ingresos)::bigint AS ingresos, SUM(utilidad_neta)::bigint AS utilidad
  FROM vw_financiera_consolidado;
