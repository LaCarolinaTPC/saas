-- Operativo · Exceso de velocidad: incidencias en un solo JSON, sin tope de filas.
-- Pegar entero en: Supabase → SQL Editor (idempotente). Complementa la
-- migración 20260904212545, que debe estar aplicada.
--
-- Por qué: PostgREST en esta instancia recorta toda respuesta a 1.000 filas
-- (max-rows) y, en las funciones llamadas por /rpc, ignora el encabezado
-- Range: siempre devuelve la primera página. Un mes son ~12.000 incidencias,
-- así que la aplicación las pide como un único valor jsonb (una fila, sin
-- recorte). `get_incidencias_velocidad` se conserva para consultas en SQL.

CREATE OR REPLACE FUNCTION get_incidencias_velocidad_json(
  p_desde DATE,
  p_hasta DATE,
  p_umbral NUMERIC DEFAULT 60,
  p_minutos INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.inicio), '[]'::jsonb)
  FROM get_incidencias_velocidad(p_desde, p_hasta, p_umbral, p_minutos) t;
$$;

COMMENT ON FUNCTION get_incidencias_velocidad_json(DATE, DATE, NUMERIC, INTEGER) IS
  'Misma salida que get_incidencias_velocidad pero como un arreglo jsonb en una sola fila, para que PostgREST no la recorte a 1.000 filas.';

GRANT EXECUTE ON FUNCTION get_incidencias_velocidad_json(DATE, DATE, NUMERIC, INTEGER) TO service_role;

-- PostgREST guarda en caché el esquema y puede no ver la función nueva hasta
-- reiniciarse ("Could not find the function ... in the schema cache"). Este
-- aviso le pide recargarla al instante.
NOTIFY pgrst, 'reload schema';

-- Comprobación: cuántas incidencias trae el mes en curso y cuántas tienen conductor.
SELECT
  jsonb_array_length(j) AS incidencias,
  (SELECT count(*) FROM jsonb_array_elements(j) e WHERE e->>'cedula_conductor' IS NOT NULL) AS con_conductor
FROM get_incidencias_velocidad_json(date_trunc('month', current_date)::date, current_date, 60, 5) AS j;
