-- ============================================================
-- Trazado de la ruta en el mapa de calor
--
-- GEMA no expone la geometría de las rutas, así que el trazado se
-- reconstruye con el rastro GPS de puntos_virtuales:
--  - con p_despacho: el recorrido exacto de ese viaje;
--  - con p_ruta: un viaje representativo reciente de la ruta en el
--    rango (entre los últimos 5, el que más eventos GPS tenga,
--    para evitar viajes con el equipo apagado).
-- Devuelve {despacho, puntos: [[lat,lng], ...]} ordenado en el
-- tiempo, o puntos vacío si no hay viaje con GPS.
-- ============================================================

CREATE OR REPLACE FUNCTION get_trazado_ruta(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL,
  p_despacho BIGINT DEFAULT NULL
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH candidatos AS (
    SELECT vr.numero
    FROM viajes_recaudados vr
    WHERE p_despacho IS NULL
      AND p_ruta IS NOT NULL
      AND vr.fecha_viaje BETWEEN p_desde AND p_hasta
      AND norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) = p_ruta
    ORDER BY vr.fecha_viaje DESC, vr.hora_despacho DESC
    LIMIT 5
  ),
  elegido AS (
    SELECT COALESCE(
      p_despacho,
      (SELECT c.numero FROM candidatos c
       ORDER BY (SELECT count(*) FROM puntos_virtuales pv WHERE pv.numero_despacho = c.numero) DESC
       LIMIT 1)
    ) AS numero
  )
  SELECT jsonb_build_object(
    'despacho', (SELECT e.numero FROM elegido e LIMIT 1),
    'puntos', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(round(pv.latitud::numeric, 5), round(pv.longitud::numeric, 5))
                       ORDER BY pv.fecha_hora, pv.numero)
      FROM puntos_virtuales pv
      WHERE pv.numero_despacho = (SELECT e.numero FROM elegido e LIMIT 1)
        AND pv.latitud IS NOT NULL AND pv.longitud IS NOT NULL
        AND NOT (pv.latitud = 0 AND pv.longitud = 0)
    ), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION get_trazado_ruta(DATE, DATE, TEXT, BIGINT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_trazado_ruta(DATE, DATE, TEXT, BIGINT) TO authenticated, service_role;
