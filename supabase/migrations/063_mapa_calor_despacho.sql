-- ============================================================
-- Mapa de calor: filtro por viaje (despacho)
--
-- Un vehículo hace varios viajes al día; para aislar uno, los
-- deltas guardan ahora el numero_despacho y get_mapa_calor gana
-- p_despacho. La lista de viajes del día sale de
-- viajes_recaudados (numero = despacho, con horas de salida y
-- llegada). Se re-backfillea pv_deltas para poblar la columna.
-- ============================================================

ALTER TABLE pv_deltas ADD COLUMN IF NOT EXISTS numero_despacho BIGINT;

-- refrescar_pv_deltas ahora conserva el despacho del evento.
CREATE OR REPLACE FUNCTION refrescar_pv_deltas(p_desde DATE, p_hasta DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM pv_deltas WHERE fecha BETWEEN p_desde AND p_hasta;
  INSERT INTO pv_deltas (numero, fecha, hora, lat, lng, cod_pv, punto_virtual,
                         direccion, codigo_vehiculo, ruta, dsub, dbaj, velocidad,
                         numero_despacho)
  WITH ev AS (
    -- Se escanea desde un día antes solo para sembrar el lag(): sin eso,
    -- un despacho que cruza la medianoche entra al rango sin su evento
    -- previo y el primer delta contaría el acumulado completo del viaje.
    SELECT
      pv.numero, pv.fecha,
      NULLIF(substring(pv.hora from 1 for 2), '')::int AS hora,
      pv.latitud, pv.longitud, pv.cod_pv, pv.punto_virtual, pv.direccion,
      pv.codigo_vehiculo, pv.numero_despacho, pv.velocidad,
      -- Un contador menor al anterior es un reinicio del equipo: no se resta.
      GREATEST(0, COALESCE(pv.subidas, 0) - lag(COALESCE(pv.subidas, 0), 1, 0) OVER w) AS dsub,
      GREATEST(0, COALESCE(pv.bajadas, 0) - lag(COALESCE(pv.bajadas, 0), 1, 0) OVER w) AS dbaj
    FROM puntos_virtuales pv
    WHERE pv.fecha BETWEEN p_desde - 1 AND p_hasta
      AND pv.numero_despacho IS NOT NULL
      -- Contadores absurdos: fuera de la ventana para que tampoco
      -- contaminen el delta del evento siguiente.
      AND COALESCE(pv.subidas, 0) BETWEEN 0 AND 2000
      AND COALESCE(pv.bajadas, 0) BETWEEN 0 AND 2000
    WINDOW w AS (PARTITION BY pv.numero_despacho ORDER BY pv.fecha_hora, pv.numero)
  )
  SELECT ev.numero, ev.fecha, ev.hora,
         round(ev.latitud::numeric, 4), round(ev.longitud::numeric, 4),
         ev.cod_pv, ev.punto_virtual, ev.direccion, ev.codigo_vehiculo,
         norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)),
         ev.dsub, ev.dbaj, ev.velocidad,
         ev.numero_despacho
  FROM ev
  JOIN viajes_recaudados vr ON vr.numero = ev.numero_despacho
  WHERE ev.fecha BETWEEN p_desde AND p_hasta
    AND (ev.dsub > 0 OR ev.dbaj > 0)
    -- Más pasajeros que la capacidad del bus en un solo evento = basura.
    AND ev.dsub <= 60 AND ev.dbaj <= 60
    AND ev.latitud IS NOT NULL AND ev.longitud IS NOT NULL
    AND NOT (ev.latitud = 0 AND ev.longitud = 0)
    AND ev.hora BETWEEN 0 AND 23;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DROP FUNCTION IF EXISTS get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT, TEXT);

CREATE FUNCTION get_mapa_calor(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL,
  p_hora_desde INT DEFAULT 0,
  p_hora_hasta INT DEFAULT 23,
  p_punto TEXT DEFAULT NULL,      -- cod_pv de la geocerca
  p_vehiculo TEXT DEFAULT NULL,   -- código del vehículo
  p_despacho BIGINT DEFAULT NULL  -- numero de viajes_recaudados (un viaje)
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH dets AS (
    SELECT d.*
    FROM pv_deltas d
    WHERE d.fecha BETWEEN p_desde AND p_hasta
      AND (p_ruta IS NULL OR d.ruta = p_ruta)
      -- Filtro por geocerca (por código: los nombres no son únicos en GEMA).
      AND (p_punto IS NULL OR d.cod_pv = p_punto)
      AND (p_vehiculo IS NULL OR d.codigo_vehiculo = p_vehiculo)
      AND (p_despacho IS NULL OR d.numero_despacho = p_despacho)
  ),
  celdas AS (
    SELECT d.lat, d.lng,
           MIN(d.punto_virtual) FILTER (WHERE d.cod_pv IS NOT NULL AND d.cod_pv <> '0' AND d.punto_virtual <> 'N/A') AS pv,
           SUM(d.dsub) AS suben,
           SUM(d.dbaj) AS bajan,
           round(AVG(d.velocidad) FILTER (WHERE d.velocidad IS NOT NULL AND d.velocidad >= 0)::numeric, 1) AS vel
    FROM dets d
    WHERE d.hora BETWEEN p_hora_desde AND p_hora_hasta
    GROUP BY d.lat, d.lng
  ),
  por_hora AS (
    SELECT d.hora, SUM(d.dsub) AS suben, SUM(d.dbaj) AS bajan
    FROM dets d GROUP BY d.hora
  ),
  grupos AS (
    SELECT
      CASE
        WHEN d.cod_pv IS NOT NULL AND d.cod_pv <> '0' THEN 'pv:' || d.cod_pv
        WHEN trim(COALESCE(d.direccion, '')) <> '' AND trim(d.direccion) NOT ILIKE 'SIN DEFINIR%'
          THEN 'dir:' || upper(trim(d.direccion))
        ELSE 'cel:' || round(d.lat, 3) || ',' || round(d.lng, 3)
      END AS grupo,
      d.*
    FROM dets d
    WHERE d.hora BETWEEN p_hora_desde AND p_hora_hasta
  ),
  top_pv AS (
    SELECT
      CASE WHEN g.grupo LIKE 'pv:%' THEN substring(g.grupo from 4) END AS cod,
      -- NULL cuando no hay nombre ni dirección: el servidor lo resuelve
      -- por geocodificación inversa usando lat/lng.
      COALESCE(
        MIN(g.punto_virtual) FILTER (WHERE g.punto_virtual <> 'N/A' AND g.grupo LIKE 'pv:%'),
        MODE() WITHIN GROUP (ORDER BY trim(g.direccion))
          FILTER (WHERE g.direccion IS NOT NULL AND trim(g.direccion) <> '' AND trim(g.direccion) NOT ILIKE 'SIN DEFINIR%'),
        CASE WHEN g.grupo LIKE 'pv:%' THEN 'Punto ' || substring(g.grupo from 4) END
      ) AS nombre,
      round(AVG(g.lat), 4) AS lat,
      round(AVG(g.lng), 4) AS lng,
      SUM(g.dsub) AS suben,
      SUM(g.dbaj) AS bajan
    FROM grupos g
    GROUP BY g.grupo
    ORDER BY SUM(g.dsub) + SUM(g.dbaj) DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    -- [lat, lng, suben, bajan, punto_virtual|null, vel_prom|null] compacto.
    'celdas', COALESCE(
      (SELECT jsonb_agg(jsonb_build_array(c.lat, c.lng, c.suben, c.bajan, c.pv, c.vel)) FROM celdas c),
      '[]'::jsonb),
    'por_hora', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('hora', h.hora, 'suben', h.suben, 'bajan', h.bajan) ORDER BY h.hora) FROM por_hora h),
      '[]'::jsonb),
    'top_pv', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('cod', t.cod, 'nombre', t.nombre, 'lat', t.lat, 'lng', t.lng, 'suben', t.suben, 'bajan', t.bajan) ORDER BY t.suben + t.bajan DESC) FROM top_pv t),
      '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT, TEXT, BIGINT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT, TEXT, BIGINT) TO authenticated, service_role;

-- Re-backfill para poblar numero_despacho en el histórico.
SELECT refrescar_pv_deltas(
  (SELECT MIN(fecha) FROM puntos_virtuales),
  (SELECT MAX(fecha) FROM puntos_virtuales)
);
