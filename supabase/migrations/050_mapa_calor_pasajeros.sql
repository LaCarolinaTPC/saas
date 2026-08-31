-- ============================================================
-- Mapa de calor de pasajeros (Rotación → Mapa de calor)
--
-- Fuente: la tabla cruda `puntos_virtuales` (migración 027), que
-- guarda ~40k eventos GPS/día con contadores ACUMULADOS de
-- subidas/bajadas dentro de cada despacho (el máximo del viaje
-- coincide con las timbradas). `get_mapa_calor` calcula el delta
-- entre eventos consecutivos del mismo despacho (= pasajeros que
-- subieron/bajaron en ese punto), cruza la ruta por
-- viajes_recaudados.numero = numero_despacho y agrega por celda
-- de ~11 m (lat/lng a 4 decimales).
--
-- Devuelve UN solo JSONB (celdas + distribución horaria + top de
-- geocercas) a propósito: son ~20k celdas por semana y paginar un
-- RPC con .range() re-ejecuta la agregación completa en cada
-- página; en un solo valor la función corre una vez (~2-3 s).
-- ============================================================

DROP FUNCTION IF EXISTS get_mapa_calor(DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS get_mapa_calor(DATE, DATE, TEXT, INT, INT);
DROP FUNCTION IF EXISTS get_mapa_calor_rutas(DATE, DATE);
DROP FUNCTION IF EXISTS get_mapa_calor_puntos(DATE, DATE);
DROP FUNCTION IF EXISTS norm_ruta(TEXT);

-- GEMA escribe la misma ruta con guiones/espacios variables
-- ("A - 16 MIRAMAR" vs "A -- 16 MIRAMAR"): normalizamos para agrupar.
CREATE FUNCTION norm_ruta(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(trim(regexp_replace(regexp_replace(t, '-+', '-', 'g'), '\s+', ' ', 'g')), '')
$$;

CREATE FUNCTION get_mapa_calor(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL,
  p_hora_desde INT DEFAULT 0,
  p_hora_hasta INT DEFAULT 23
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH ev AS (
    -- Se escanea desde un día antes solo para sembrar el lag(): sin eso,
    -- un despacho que cruza la medianoche entra al rango sin su evento
    -- previo y el primer delta contaría el acumulado completo del viaje.
    SELECT
      pv.fecha,
      pv.numero_despacho,
      NULLIF(substring(pv.hora from 1 for 2), '')::int AS hora,
      pv.latitud, pv.longitud, pv.cod_pv, pv.punto_virtual,
      -- Un contador menor al anterior es un reinicio del equipo: no se resta.
      GREATEST(0, COALESCE(pv.subidas, 0) - lag(COALESCE(pv.subidas, 0), 1, 0) OVER w) AS dsub,
      GREATEST(0, COALESCE(pv.bajadas, 0) - lag(COALESCE(pv.bajadas, 0), 1, 0) OVER w) AS dbaj
    FROM puntos_virtuales pv
    WHERE pv.fecha BETWEEN p_desde - 1 AND p_hasta
      AND pv.numero_despacho IS NOT NULL
      -- Contadores absurdos (la registradora a veces vuelca basura, p. ej.
      -- 36.882 en un viaje de 92 timbradas): fuera de la ventana para que
      -- tampoco contaminen el delta del evento siguiente.
      AND COALESCE(pv.subidas, 0) BETWEEN 0 AND 2000
      AND COALESCE(pv.bajadas, 0) BETWEEN 0 AND 2000
    WINDOW w AS (PARTITION BY pv.numero_despacho ORDER BY pv.fecha_hora, pv.numero)
  ),
  dets AS (
    SELECT ev.hora,
           round(ev.latitud::numeric, 4)  AS lat,
           round(ev.longitud::numeric, 4) AS lng,
           ev.cod_pv, ev.punto_virtual, ev.dsub, ev.dbaj
    FROM ev
    JOIN viajes_recaudados vr ON vr.numero = ev.numero_despacho
    WHERE ev.fecha BETWEEN p_desde AND p_hasta
      AND (ev.dsub > 0 OR ev.dbaj > 0)
      -- Más pasajeros que la capacidad del bus en un solo evento = basura.
      AND ev.dsub <= 60 AND ev.dbaj <= 60
      AND ev.latitud IS NOT NULL AND ev.longitud IS NOT NULL
      AND NOT (ev.latitud = 0 AND ev.longitud = 0)
      AND ev.hora BETWEEN 0 AND 23
      AND (p_ruta IS NULL OR norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) = p_ruta)
  ),
  celdas AS (
    SELECT d.lat, d.lng,
           MIN(d.punto_virtual) FILTER (WHERE d.cod_pv IS NOT NULL AND d.cod_pv <> '0') AS pv,
           SUM(d.dsub) AS suben,
           SUM(d.dbaj) AS bajan
    FROM dets d
    WHERE d.hora BETWEEN p_hora_desde AND p_hora_hasta
    GROUP BY d.lat, d.lng
  ),
  por_hora AS (
    SELECT d.hora, SUM(d.dsub) AS suben, SUM(d.dbaj) AS bajan
    FROM dets d GROUP BY d.hora
  ),
  top_pv AS (
    SELECT d.punto_virtual AS pv, SUM(d.dsub) AS suben, SUM(d.dbaj) AS bajan
    FROM dets d
    WHERE d.punto_virtual IS NOT NULL AND d.cod_pv IS NOT NULL AND d.cod_pv <> '0'
      AND d.hora BETWEEN p_hora_desde AND p_hora_hasta
    GROUP BY d.punto_virtual
    ORDER BY SUM(d.dsub) + SUM(d.dbaj) DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    -- [lat, lng, suben, bajan, punto_virtual|null] compacto: ~20k celdas/semana.
    'celdas', COALESCE(
      (SELECT jsonb_agg(jsonb_build_array(c.lat, c.lng, c.suben, c.bajan, c.pv)) FROM celdas c),
      '[]'::jsonb),
    'por_hora', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('hora', h.hora, 'suben', h.suben, 'bajan', h.bajan) ORDER BY h.hora) FROM por_hora h),
      '[]'::jsonb),
    'top_pv', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('nombre', t.pv, 'suben', t.suben, 'bajan', t.bajan) ORDER BY t.suben + t.bajan DESC) FROM top_pv t),
      '[]'::jsonb)
  )
$$;

-- Rutas del rango con sus totales, para el selector de la pantalla.
CREATE FUNCTION get_mapa_calor_rutas(
  p_desde DATE,
  p_hasta DATE
) RETURNS TABLE (
  ruta TEXT,
  viajes BIGINT,
  timbradas BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) AS ruta,
         COUNT(*) AS viajes,
         COALESCE(SUM(vr.timbradas), 0)::bigint AS timbradas
  FROM viajes_recaudados vr
  WHERE vr.fecha_viaje BETWEEN p_desde AND p_hasta
    AND norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) IS NOT NULL
  GROUP BY 1
  ORDER BY 3 DESC
$$;

-- Geocercas (puntos virtuales) vistas en el rango, para marcarlas en el mapa.
CREATE FUNCTION get_mapa_calor_puntos(
  p_desde DATE,
  p_hasta DATE
) RETURNS TABLE (
  cod_pv TEXT,
  nombre TEXT,
  lat NUMERIC,
  lng NUMERIC,
  is_base BOOLEAN
) LANGUAGE sql STABLE AS $$
  SELECT pv.cod_pv,
         MIN(pv.punto_virtual) AS nombre,
         round(AVG(pv.latitud)::numeric, 6)  AS lat,
         round(AVG(pv.longitud)::numeric, 6) AS lng,
         BOOL_OR(COALESCE(pv.is_base, false)) AS is_base
  FROM puntos_virtuales pv
  WHERE pv.fecha BETWEEN p_desde AND p_hasta
    AND pv.cod_pv IS NOT NULL AND pv.cod_pv <> '0'
    AND pv.punto_virtual IS NOT NULL
    AND pv.latitud IS NOT NULL AND pv.longitud IS NOT NULL
  GROUP BY pv.cod_pv
$$;

REVOKE ALL ON FUNCTION norm_ruta(TEXT) FROM anon, public;
REVOKE ALL ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT) FROM anon, public;
REVOKE ALL ON FUNCTION get_mapa_calor_rutas(DATE, DATE) FROM anon, public;
REVOKE ALL ON FUNCTION get_mapa_calor_puntos(DATE, DATE) FROM anon, public;
GRANT EXECUTE ON FUNCTION norm_ruta(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_mapa_calor_rutas(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_mapa_calor_puntos(DATE, DATE) TO authenticated, service_role;

-- Índice para el cruce evento → viaje (la ruta del despacho).
CREATE INDEX IF NOT EXISTS idx_pv_despacho ON puntos_virtuales(numero_despacho)
  WHERE numero_despacho IS NOT NULL;
