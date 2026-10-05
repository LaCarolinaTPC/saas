-- operativo movilidad por hora desde el historico de despacho
--
-- Contexto: Operativo necesita saber, con el histórico de despacho de GEMA,
-- a qué hora del día la vuelta de cada ruta dura menos (mejor movilidad) y a
-- cuál dura más, para decidir cambios al despacho: tiempos de vuelta por
-- franja, salidas que conviene correr de hora y cuántos buses mover.
--
-- La tabla `historico_despacho` tiene unos 500 viajes por día (≈300.000 en
-- total) y PostgREST recorta las respuestas a 1.000 filas, así que la base
-- agrega por ruta, tipo de día y hora de despacho y devuelve un solo JSON
-- (unas 250 filas). Nada se guarda: la pantalla recalcula con el periodo
-- que se elija.
--
-- Qué cuenta:
--   - Viajes DESPACHADO con novedad NORMAL (los que sí hicieron la vuelta).
--   - Duración = hora_llegada − hora_despacho, en minutos; si la llegada es
--     menor, cruzó la medianoche. Sin llegada (00:00:00 o vacía) o fuera de
--     p_min_minutos..p_max_minutos no entra a la duración (es un cierre mal
--     registrado), pero sí a las salidas.
--   - Tipo de día: LV (lunes a viernes hábil), SAB, DOM (domingo o festivo).
--     Los festivos de Colombia los calcula la aplicación y llegan en
--     p_festivos, para no duplicar aquí la Ley Emiliani.
--   - Pasajeros: timbradas del viaje (mediana).
--
-- Horas: texto "HH:MM:SS" local de Colombia tal como lo registra GEMA.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

-- Minutos desde la medianoche de una hora "HH:MM[:SS]"; NULL si viene rara.
CREATE OR REPLACE FUNCTION operativo_hora_a_minutos(h TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN h ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
      split_part(h, ':', 1)::numeric * 60
      + split_part(h, ':', 2)::numeric
      + COALESCE(NULLIF(split_part(h, ':', 3), ''), '0')::numeric / 60
    ELSE NULL
  END;
$$;

DROP FUNCTION IF EXISTS get_movilidad_por_hora_json(DATE, DATE, DATE[], INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION get_movilidad_por_hora_json(
  p_desde DATE,
  p_hasta DATE,
  p_festivos DATE[] DEFAULT '{}',
  p_min_minutos INTEGER DEFAULT 40,
  p_max_minutos INTEGER DEFAULT 360
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  WITH base AS (
    SELECT
      COALESCE(NULLIF(trim(h.ruta_reprogramada), ''), NULLIF(trim(h.ruta_programada), ''), 'SIN RUTA') AS ruta,
      h.fecha_viaje,
      CASE
        WHEN EXTRACT(ISODOW FROM h.fecha_viaje) = 7 OR h.fecha_viaje = ANY (p_festivos) THEN 'DOM'
        WHEN EXTRACT(ISODOW FROM h.fecha_viaje) = 6 THEN 'SAB'
        ELSE 'LV'
      END AS tipo_dia,
      operativo_hora_a_minutos(h.hora_despacho) AS m_desp,
      CASE WHEN h.hora_llegada IN ('00:00:00', '00:00') THEN NULL
           ELSE operativo_hora_a_minutos(h.hora_llegada) END AS m_lleg,
      h.timbradas
    FROM historico_despacho h
    WHERE h.fecha_viaje BETWEEN p_desde AND p_hasta
      AND h.estado = 'DESPACHADO'
      AND h.novedad = 'NORMAL'
  ),
  viajes AS (
    SELECT
      b.ruta, b.fecha_viaje, b.tipo_dia,
      floor(b.m_desp / 60)::int AS hora,
      CASE
        WHEN b.m_lleg IS NULL THEN NULL
        WHEN b.m_lleg >= b.m_desp THEN b.m_lleg - b.m_desp
        ELSE b.m_lleg + 1440 - b.m_desp
      END AS duracion,
      b.timbradas
    FROM base b
    WHERE b.m_desp IS NOT NULL AND b.m_desp > 0 AND b.m_desp < 1440
  ),
  dias AS (
    SELECT ruta, tipo_dia, count(DISTINCT fecha_viaje) AS dias
    FROM viajes
    GROUP BY ruta, tipo_dia
  ),
  agg AS (
    SELECT
      v.ruta, v.tipo_dia, v.hora,
      count(*) AS salidas,
      count(*) FILTER (WHERE v.duracion BETWEEN p_min_minutos AND p_max_minutos) AS con_duracion,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY v.duracion) FILTER (WHERE v.duracion BETWEEN p_min_minutos AND p_max_minutos) AS mediana,
      percentile_cont(0.1)  WITHIN GROUP (ORDER BY v.duracion) FILTER (WHERE v.duracion BETWEEN p_min_minutos AND p_max_minutos) AS p10,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY v.duracion) FILTER (WHERE v.duracion BETWEEN p_min_minutos AND p_max_minutos) AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY v.duracion) FILTER (WHERE v.duracion BETWEEN p_min_minutos AND p_max_minutos) AS p75,
      percentile_cont(0.9)  WITHIN GROUP (ORDER BY v.duracion) FILTER (WHERE v.duracion BETWEEN p_min_minutos AND p_max_minutos) AS p90,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY v.timbradas) FILTER (WHERE v.timbradas > 0) AS pasajeros
    FROM viajes v
    GROUP BY v.ruta, v.tipo_dia, v.hora
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ruta', a.ruta,
    'tipo_dia', a.tipo_dia,
    'hora', a.hora,
    'dias', d.dias,
    'salidas', a.salidas,
    'con_duracion', a.con_duracion,
    'mediana', round(a.mediana::numeric, 1),
    'p10', round(a.p10::numeric, 1),
    'p25', round(a.p25::numeric, 1),
    'p75', round(a.p75::numeric, 1),
    'p90', round(a.p90::numeric, 1),
    'pasajeros', round(a.pasajeros::numeric, 1)
  ) ORDER BY a.ruta, a.tipo_dia, a.hora), '[]'::jsonb)
  FROM agg a
  JOIN dias d USING (ruta, tipo_dia);
$$;

COMMENT ON FUNCTION get_movilidad_por_hora_json(DATE, DATE, DATE[], INTEGER, INTEGER) IS
  'Operativo · Movilidad: duración de la vuelta (mediana y percentiles) y salidas por ruta, tipo de día (LV/SAB/DOM) y hora de despacho, desde historico_despacho.';

GRANT EXECUTE ON FUNCTION operativo_hora_a_minutos(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_movilidad_por_hora_json(DATE, DATE, DATE[], INTEGER, INTEGER) TO service_role;
