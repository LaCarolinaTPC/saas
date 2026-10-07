-- vista mensual de liquidacion por conductor y modulo analisis de liquidacion
--
-- Contexto: se pidió un análisis descriptivo y predictivo de deserción de
-- conductores basado en su liquidación (lo que trabajan, venden y ganan),
-- distinto del módulo Riesgo, que se apoya en el ausentismo. La fuente es
-- cierres_diarios (95 mil filas desde enero de 2025): bajarla entera tarda
-- unos 18 s por PostgREST, así que la pantalla lee este resumen por conductor
-- y mes (unas 8 mil filas), que Postgres arma en una fracción de segundo.
--
-- Arreglos de datos que hace la vista, no la aplicación:
--   * Cédula: los cierres de enero a mayo de 2026 llegaron sin cédula (y sin
--     valores en plata). Se toma del maestro por cod_conductor, que casa en el
--     100 % de esas filas. Si un código estuviera en dos fichas, gana la
--     activa y luego la de ingreso más reciente.
--   * Ruta: GEMA escribe Miramar como "A - 16" y como "A -- 16"; se unifican
--     los guiones. Un conductor suele cubrir varias rutas en el mismo día, así
--     que la ruta principal del mes es la de más viajes, no la primera.
--   * Días sin valores: un día cuenta como "con valores" si GEMA trajo el
--     salario neto. Los meses sin valores siguen sirviendo para días, viajes
--     y timbradas; los promedios en plata se calculan solo sobre días con
--     valores (dias_con_valores).
--   * Base diaria: la de Tesorería (app_settings devengados_base_diaria, hoy
--     $85.000). Un día por debajo de la base es neto > 0 y < base, como en la
--     liquidación del conductor.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor, así que el script debe poder ejecutarse entero de
-- una sola vez y es idempotente.

CREATE OR REPLACE VIEW liquidacion_conductor_mes AS
WITH cod AS (
  SELECT DISTINCT ON (codigo)
    codigo,
    regexp_replace(cedula, '\D', '', 'g') AS cedula
  FROM conductores
  WHERE codigo IS NOT NULL AND codigo <> ''
  ORDER BY codigo, (estado = 'ACTIVO') DESC, fecha_ingreso DESC NULLS LAST
),
c AS (
  SELECT
    COALESCE(NULLIF(regexp_replace(cd.cedula_conductor, '\D', '', 'g'), ''), cod.cedula) AS cedula,
    cd.fecha,
    upper(trim(regexp_replace(cd.ruta, '\s*-+\s*', ' - ', 'g'))) AS ruta,
    cd.vehiculo,
    cd.tipo_cierre,
    cd.viajes,
    cd.timbradas,
    cd.bruto,
    cd.salario_bruto_dia,
    cd.salario_neto_dia,
    cd.ahorro,
    cd.ahorro_obli,
    cd.anticipo
  FROM cierres_diarios cd
  LEFT JOIN cod ON cod.codigo = cd.cod_conductor
),
dia AS (
  -- Un día = todas sus filas de cierre (varias rutas o vehículos) sumadas.
  SELECT
    cedula,
    fecha,
    sum(viajes) AS viajes,
    sum(timbradas) AS timbradas,
    sum(bruto) AS bruto,
    sum(salario_bruto_dia) AS salario_bruto,
    sum(salario_neto_dia) AS neto,
    sum(COALESCE(ahorro, 0) + COALESCE(ahorro_obli, 0)) AS ahorro,
    sum(COALESCE(anticipo, 0)) AS anticipo,
    bool_or(salario_neto_dia IS NOT NULL) AS con_valores
  FROM c
  WHERE cedula IS NOT NULL AND cedula <> ''
  GROUP BY cedula, fecha
),
vehiculos AS (
  -- cierres_diarios.vehiculo puede traer varios códigos separados por coma.
  SELECT c.cedula, date_trunc('month', c.fecha)::date AS mes, count(DISTINCT trim(v)) AS vehiculos
  FROM c
  CROSS JOIN LATERAL unnest(string_to_array(c.vehiculo, ',')) AS v
  WHERE c.cedula IS NOT NULL AND c.cedula <> '' AND trim(v) <> ''
  GROUP BY c.cedula, date_trunc('month', c.fecha)
),
rutas AS (
  SELECT cedula, date_trunc('month', fecha)::date AS mes, ruta, sum(COALESCE(viajes, 0)) AS viajes, count(DISTINCT fecha) AS dias
  FROM c
  WHERE cedula IS NOT NULL AND cedula <> '' AND ruta IS NOT NULL AND ruta <> ''
  GROUP BY cedula, date_trunc('month', fecha), ruta
),
ruta_mes AS (
  SELECT
    r.cedula,
    r.mes,
    count(*)::int AS rutas,
    (array_agg(r.ruta ORDER BY r.viajes DESC, r.dias DESC, r.ruta))[1] AS ruta_principal
  FROM rutas r
  GROUP BY r.cedula, r.mes
),
tipo_mes AS (
  SELECT cedula, date_trunc('month', fecha)::date AS mes, mode() WITHIN GROUP (ORDER BY tipo_cierre) AS tipo_cierre
  FROM c
  WHERE cedula IS NOT NULL AND cedula <> ''
  GROUP BY cedula, date_trunc('month', fecha)
),
base AS (
  SELECT COALESCE(
    (SELECT NULLIF(value, '')::numeric FROM app_settings WHERE key = 'devengados_base_diaria'),
    85000
  ) AS base
)
SELECT
  d.cedula,
  date_trunc('month', d.fecha)::date AS mes,
  count(*)::int AS dias,
  count(*) FILTER (WHERE d.con_valores)::int AS dias_con_valores,
  COALESCE(sum(d.viajes), 0)::numeric AS viajes,
  COALESCE(sum(d.timbradas), 0)::numeric AS timbradas,
  sum(d.bruto) FILTER (WHERE d.con_valores) AS bruto,
  sum(d.salario_bruto) FILTER (WHERE d.con_valores) AS salario_bruto,
  sum(d.neto) FILTER (WHERE d.con_valores) AS neto,
  sum(d.ahorro) FILTER (WHERE d.con_valores) AS ahorro,
  sum(d.anticipo) FILTER (WHERE d.con_valores) AS anticipo,
  count(*) FILTER (WHERE d.con_valores AND d.neto > 0 AND d.neto < b.base)::int AS dias_bajo_base,
  stddev_pop(d.neto) FILTER (WHERE d.con_valores) AS neto_sd,
  COALESCE(max(rm.rutas), 0)::int AS rutas,
  COALESCE(max(v.vehiculos), 0)::int AS vehiculos,
  max(rm.ruta_principal) AS ruta_principal,
  max(tm.tipo_cierre) AS tipo_cierre,
  min(d.fecha) AS primer_dia,
  max(d.fecha) AS ultimo_dia,
  max(b.base) AS base_diaria
FROM dia d
CROSS JOIN base b
LEFT JOIN vehiculos v ON v.cedula = d.cedula AND v.mes = date_trunc('month', d.fecha)::date
LEFT JOIN ruta_mes rm ON rm.cedula = d.cedula AND rm.mes = date_trunc('month', d.fecha)::date
LEFT JOIN tipo_mes tm ON tm.cedula = d.cedula AND tm.mes = date_trunc('month', d.fecha)::date
GROUP BY d.cedula, date_trunc('month', d.fecha);

COMMENT ON VIEW liquidacion_conductor_mes IS
  'Liquidación por conductor (cédula) y mes desde cierres_diarios: días, viajes, timbradas, bruto (ventas), neto, ahorro, anticipos, días bajo la base diaria, rutas y vehículos. Fuente del módulo Análisis de liquidación.';

-- La vista no tiene RLS propia: hereda la de sus tablas, y la aplicación la
-- consulta con service_role. En esta instalación hay que concederlo a mano.
REVOKE ALL ON liquidacion_conductor_mes FROM anon, authenticated, public;
GRANT SELECT ON liquidacion_conductor_mes TO service_role;

-- Índice para el cruce por código (el maestro no lo tenía).
CREATE INDEX IF NOT EXISTS idx_conductores_codigo ON conductores (codigo);

-- ── El módulo ───────────────────────────────────────────────────────────────
-- Lleva el ingreso de cada conductor: solo Administración lo recibe de
-- entrada. Otros tipos se habilitan en Configuración → Usuarios.
UPDATE user_types
  SET modulos = modulos || '["analisis_liquidacion"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'analisis_liquidacion');
