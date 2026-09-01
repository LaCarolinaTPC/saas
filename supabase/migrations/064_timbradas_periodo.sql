-- ============================================================
-- Timbradas vendidas del periodo (KPI del mapa de calor)
--
-- Suma el Tim R (timbradas) de viajes_recaudados con los mismos
-- filtros del mapa: rango de fechas, ruta, vehículo, despacho y
-- franja horaria. Las timbradas son por viaje, así que la franja
-- se aplica sobre la hora de despacho del viaje.
-- ============================================================

CREATE OR REPLACE FUNCTION get_timbradas_periodo(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL,
  p_hora_desde INT DEFAULT 0,
  p_hora_hasta INT DEFAULT 23,
  p_vehiculo TEXT DEFAULT NULL,
  p_despacho BIGINT DEFAULT NULL
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'timbradas', COALESCE(SUM(vr.timbradas), 0),
    'descuento', COALESCE(SUM(vr.descuento), 0),
    'viajes', COUNT(*)
  )
  FROM viajes_recaudados vr
  WHERE vr.fecha_viaje BETWEEN p_desde AND p_hasta
    AND (p_ruta IS NULL OR norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) = p_ruta)
    AND (p_vehiculo IS NULL OR vr.codigo_vehiculo = p_vehiculo)
    AND (p_despacho IS NULL OR vr.numero = p_despacho)
    AND (
      -- Franja completa: no exigir hora de despacho válida.
      (p_hora_desde = 0 AND p_hora_hasta = 23)
      OR COALESCE(NULLIF(substring(vr.hora_despacho from 1 for 2), '')::int, -1)
         BETWEEN p_hora_desde AND p_hora_hasta
    )
$$;

REVOKE ALL ON FUNCTION get_timbradas_periodo(DATE, DATE, TEXT, INT, INT, TEXT, BIGINT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_timbradas_periodo(DATE, DATE, TEXT, INT, INT, TEXT, BIGINT) TO authenticated, service_role;
