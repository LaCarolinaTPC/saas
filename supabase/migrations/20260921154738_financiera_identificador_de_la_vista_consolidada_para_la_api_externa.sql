-- financiera identificador de la vista consolidada para la api externa
--
-- Contexto: la fase 6 expone Gestión de flota en la Data API de solo lectura
-- (`/api/external/v1`) y en el catálogo del MCP. Esa API tiene un endpoint de
-- detalle `GET /api/external/v1/<recurso>/<id>` que necesita una columna que
-- identifique una fila sola. `vw_financiera_flota_mes` ya la tiene (`periodo`,
-- único por definición), pero `vw_financiera_consolidado` está al grano de
-- período + vehículo y ninguna de sus columnas es única por sí misma.
--
-- Se le añade `id` = 'AAAA-MM|<codigo>' al final de la vista. Va al final a
-- propósito: CREATE OR REPLACE VIEW solo admite columnas nuevas después de las
-- existentes, y así `vw_financiera_flota_mes`, que lee de esta vista por
-- nombre de columna, no se entera del cambio.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING). Correrlo dos veces deja la vista
-- igual.
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo. Aquí no se
-- crea ninguna tabla; los GRANT de las dos vistas ya están en la migración
-- 20260921140156 y CREATE OR REPLACE los conserva.

-- ── 1. La vista, con `id` al final ───────────────────────────────────────────
-- Copia literal de la definición de 20260921140156 más la última columna. Si
-- se vuelve a tocar la vista, mantenga las dos definiciones sincronizadas: la
-- de esta migración es la vigente.

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
    COALESCE(c.celdas_vacias, 0)              AS celdas_vacias,
    c.updated_at                              AS contable_updated_at,
    (op.fondo + op.poliza + op.prestamo + op.estudio + op.salario
       + op.combustible + op.rtica + op.admon + op.sitra) AS gastos_gema,
    (COALESCE(c.despacho, 0) + COALESCE(c.intereses, 0) + COALESCE(c.otros_gastos, 0)
       + (COALESCE(c.repuestos, 0) - COALESCE(c.desc_fondo_conductor, 0))
       + COALESCE(c.mano_de_obra, 0))                    AS gastos_contables
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
  -- Vista operativa (sin intereses), fleetUtils.ts.
  (c.utilidad_neta + c.intereses)                              AS utilidad_operativa,
  CASE WHEN c.ingresos > 0
       THEN (c.utilidad_neta + c.intereses) / c.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN c.timbradas > 0
       THEN (c.gastos_operativos_totales - c.intereses) / c.timbradas ELSE 0 END AS gastos_por_timbrada_operativo,
  c.filas_origen,
  c.operativo_updated_at,
  c.contable_updated_at,
  -- Identificador de una fila para el endpoint de detalle de la Data API.
  -- Es la llave de negocio de la vista, no un id interno: no cambia entre
  -- corridas y se puede construir desde fuera sin consultar nada.
  (c.periodo || '|' || c.codigo_vehiculo)             AS id
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados: gastos_operativos_totales, utilidad_neta, rentabilidad y gastos_por_timbrada, más la vista operativa (sin intereses). origen_contable = sin_dato marca la fila incompleta: su utilidad es un techo. `id` = periodo|codigo_vehiculo, la llave de negocio, para el endpoint de detalle de la Data API.';

-- ── 2. Comprobación ──────────────────────────────────────────────────────────
-- Debe devolver una fila con id de la forma 'AAAA-MM|<codigo>' y el mismo
-- número de filas que antes del cambio.

SELECT id, periodo, codigo_vehiculo, ingresos, utilidad_neta, origen_contable
  FROM vw_financiera_consolidado
 ORDER BY periodo DESC, codigo_vehiculo
 LIMIT 3;

SELECT COUNT(*) AS filas_consolidado FROM vw_financiera_consolidado;
SELECT COUNT(*) AS filas_flota_mes   FROM vw_financiera_flota_mes;
