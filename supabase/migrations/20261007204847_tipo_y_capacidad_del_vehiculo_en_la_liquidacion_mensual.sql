-- tipo y capacidad del vehiculo en la liquidacion mensual
--
-- Contexto: en el Análisis de liquidación no todos los vehículos son
-- comparables. La flota tiene buses (93 activos) y busetas (53), con
-- capacidades de 43 a 67 pasajeros entre sentados y de pie, y la mayoría de
-- busetas son anteriores a 2012. Comparar las ventas o los pasajeros de un
-- conductor de buseta con los de un bus lo castigaba por el vehículo y no por
-- su desempeño.
--
-- La vista agrega, al final (CREATE OR REPLACE VIEW solo permite agregar
-- columnas al final), el vehículo principal del mes de cada conductor —el de
-- más viajes— con su clase, capacidad total y año del modelo, tomados del
-- maestro `vehiculos` de GEMA. Los códigos de cierres_diarios casan con el
-- maestro en el 100 % de las filas.
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
veh AS (
  -- cierres_diarios.vehiculo puede traer varios códigos separados por coma;
  -- en ese caso los viajes de la fila cuentan para cada uno (son 1 % de filas).
  SELECT c.cedula, date_trunc('month', c.fecha)::date AS mes, trim(v) AS vehiculo,
         sum(COALESCE(c.viajes, 0)) AS viajes, count(DISTINCT c.fecha) AS dias
  FROM c
  CROSS JOIN LATERAL unnest(string_to_array(c.vehiculo, ',')) AS v
  WHERE c.cedula IS NOT NULL AND c.cedula <> '' AND trim(v) <> ''
  GROUP BY c.cedula, date_trunc('month', c.fecha), trim(v)
),
veh_mes AS (
  -- El vehículo principal del mes es el de más viajes, como la ruta.
  SELECT
    veh.cedula,
    veh.mes,
    count(*)::int AS vehiculos,
    (array_agg(veh.vehiculo ORDER BY veh.viajes DESC, veh.dias DESC, veh.vehiculo))[1] AS vehiculo_principal
  FROM veh
  GROUP BY veh.cedula, veh.mes
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
  max(b.base) AS base_diaria,
  -- Columnas nuevas al final: CREATE OR REPLACE VIEW solo admite agregar así.
  max(v.vehiculo_principal) AS vehiculo_principal,
  max(upper(trim(vh.clase))) AS clase_vehiculo,
  max(NULLIF(COALESCE(vh.capacidad_sentado, 0) + COALESCE(vh.capacidad_en_pie, 0), 0))::int AS capacidad_vehiculo,
  max(CASE WHEN vh.modelo ~ '^\d{4}$' THEN vh.modelo::int END) AS modelo_vehiculo
FROM dia d
CROSS JOIN base b
LEFT JOIN veh_mes v ON v.cedula = d.cedula AND v.mes = date_trunc('month', d.fecha)::date
LEFT JOIN vehiculos vh ON vh.codigo = v.vehiculo_principal
LEFT JOIN ruta_mes rm ON rm.cedula = d.cedula AND rm.mes = date_trunc('month', d.fecha)::date
LEFT JOIN tipo_mes tm ON tm.cedula = d.cedula AND tm.mes = date_trunc('month', d.fecha)::date
GROUP BY d.cedula, date_trunc('month', d.fecha);

-- CREATE OR REPLACE VIEW conserva los permisos, pero se repiten por si la
-- vista se recrea desde cero en otra instalación.
REVOKE ALL ON liquidacion_conductor_mes FROM anon, authenticated, public;
GRANT SELECT ON liquidacion_conductor_mes TO service_role;
