-- ============================================================
-- Alarmas filtrables por vehículo y por viaje (despacho)
--
-- La capa de alarmas del mapa de calor debe seguir los mismos
-- filtros que el resto de la pantalla: al elegir un vehículo o un
-- viaje concreto, solo sus alarmas. Se agregan p_vehiculo y
-- p_despacho a get_alarmas; la pantalla de Alarmas sigue llamando
-- con los cuatro parámetros de siempre.
-- ============================================================

DROP FUNCTION IF EXISTS get_alarmas(DATE, DATE, TEXT, TEXT);

CREATE FUNCTION get_alarmas(
  p_desde DATE,
  p_hasta DATE,
  p_tipo TEXT DEFAULT NULL,       -- prefijo: 'BLOQUEO' | 'PUERTA' | 'FALLA'
  p_ruta TEXT DEFAULT NULL,
  p_vehiculo TEXT DEFAULT NULL,   -- código del vehículo
  p_despacho BIGINT DEFAULT NULL  -- numero de viajes_recaudados (un viaje)
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH al AS (
    SELECT pv.fecha, pv.hora,
           NULLIF(substring(pv.hora from 1 for 2), '')::int AS hora_n,
           pv.descripcion, pv.codigo_vehiculo, pv.placa,
           pv.latitud, pv.longitud, trim(pv.direccion) AS direccion,
           NULLIF(pv.punto_virtual, 'N/A') AS punto_virtual,
           norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) AS ruta,
           vr.conductor_nombre AS conductor
    FROM puntos_virtuales pv
    LEFT JOIN viajes_recaudados vr ON vr.numero = pv.numero_despacho
    WHERE pv.fecha BETWEEN p_desde AND p_hasta
      AND pv.descripcion IN (
        'BLOQUEO P1', 'BLOQUEO P2', 'BLOQUEO P3',
        'PUERTA ABIERTA', 'PUERTA CERRADA', 'FALLA DE COMUNICACION'
      )
      AND (p_tipo IS NULL OR pv.descripcion LIKE p_tipo || '%')
      AND (p_ruta IS NULL OR norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) = p_ruta)
      AND (p_vehiculo IS NULL OR pv.codigo_vehiculo = p_vehiculo)
      AND (p_despacho IS NULL OR pv.numero_despacho = p_despacho)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM al),
    -- Últimos 500 eventos para la tabla.
    'eventos', COALESCE((SELECT jsonb_agg(e ORDER BY e.fecha DESC, e.hora DESC) FROM (
        SELECT a.fecha, a.hora, a.descripcion AS tipo, a.codigo_vehiculo, a.placa,
               a.conductor, a.ruta, a.direccion, a.punto_virtual, a.latitud, a.longitud
        FROM al a ORDER BY a.fecha DESC, a.hora DESC LIMIT 500) e), '[]'::jsonb),
    'por_tipo', COALESCE((SELECT jsonb_agg(t ORDER BY t.total DESC) FROM (
        SELECT a.descripcion AS tipo, count(*) AS total
        FROM al a GROUP BY a.descripcion) t), '[]'::jsonb),
    'por_hora', COALESCE((SELECT jsonb_agg(h ORDER BY h.hora) FROM (
        SELECT a.hora_n AS hora, count(*) AS total
        FROM al a WHERE a.hora_n BETWEEN 0 AND 23 GROUP BY a.hora_n) h), '[]'::jsonb),
    'por_vehiculo', COALESCE((SELECT jsonb_agg(v ORDER BY v.total DESC) FROM (
        SELECT a.codigo_vehiculo AS codigo, MIN(a.placa) AS placa, count(*) AS total,
               count(*) FILTER (WHERE a.descripcion LIKE 'BLOQUEO%') AS bloqueos,
               count(*) FILTER (WHERE a.descripcion LIKE 'PUERTA%') AS puertas,
               count(*) FILTER (WHERE a.descripcion LIKE 'FALLA%') AS fallas
        FROM al a WHERE a.codigo_vehiculo IS NOT NULL
        GROUP BY a.codigo_vehiculo ORDER BY count(*) DESC LIMIT 10) v), '[]'::jsonb),
    'por_conductor', COALESCE((SELECT jsonb_agg(c ORDER BY c.total DESC) FROM (
        SELECT a.conductor, count(*) AS total,
               count(*) FILTER (WHERE a.descripcion LIKE 'BLOQUEO%') AS bloqueos,
               count(*) FILTER (WHERE a.descripcion LIKE 'PUERTA%') AS puertas,
               count(*) FILTER (WHERE a.descripcion LIKE 'FALLA%') AS fallas
        FROM al a WHERE a.conductor IS NOT NULL
        GROUP BY a.conductor ORDER BY count(*) DESC LIMIT 10) c), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION get_alarmas(DATE, DATE, TEXT, TEXT, TEXT, BIGINT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_alarmas(DATE, DATE, TEXT, TEXT, TEXT, BIGINT) TO authenticated, service_role;
