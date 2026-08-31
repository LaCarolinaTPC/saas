-- ============================================================
-- Mapa de calor: puntos virtuales sin nombre en GEMA
--
-- Solo 25 de ~168 geocercas tienen nombre en GEMA; el resto llega
-- con el literal "N/A", así que (a) filtrar por nombre mezclaba
-- todas las geocercas sin nombre como si fueran una sola, y (b) el
-- mapa mostraba decenas de marcadores "N/A".
--
-- Corrección: p_punto pasa a ser el CÓDIGO de la geocerca (cod_pv)
-- y las etiquetas de los puntos sin nombre se construyen como
-- "Punto <cod> · <dirección GPS más frecuente>".
-- ============================================================

DROP FUNCTION IF EXISTS get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT);
DROP FUNCTION IF EXISTS get_mapa_calor_puntos(DATE, DATE);

CREATE FUNCTION get_mapa_calor(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL,
  p_hora_desde INT DEFAULT 0,
  p_hora_hasta INT DEFAULT 23,
  p_punto TEXT DEFAULT NULL   -- cod_pv de la geocerca
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH ev AS (
    -- Se escanea desde un día antes solo para sembrar el lag(): sin eso,
    -- un despacho que cruza la medianoche entra al rango sin su evento
    -- previo y el primer delta contaría el acumulado completo del viaje.
    SELECT
      pv.fecha,
      pv.numero_despacho,
      NULLIF(substring(pv.hora from 1 for 2), '')::int AS hora,
      pv.latitud, pv.longitud, pv.cod_pv, pv.punto_virtual, pv.direccion,
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
           ev.cod_pv, ev.punto_virtual, ev.direccion, ev.dsub, ev.dbaj
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
      -- Filtro por geocerca (por código: los nombres no son únicos en GEMA).
      AND (p_punto IS NULL OR ev.cod_pv = p_punto)
  ),
  celdas AS (
    SELECT d.lat, d.lng,
           MIN(d.punto_virtual) FILTER (WHERE d.cod_pv IS NOT NULL AND d.cod_pv <> '0' AND d.punto_virtual <> 'N/A') AS pv,
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
    SELECT d.cod_pv AS cod,
           COALESCE(
             MIN(d.punto_virtual) FILTER (WHERE d.punto_virtual <> 'N/A'),
             'Punto ' || d.cod_pv || COALESCE(
               ' · ' || MODE() WITHIN GROUP (ORDER BY trim(d.direccion))
                 FILTER (WHERE d.direccion IS NOT NULL AND trim(d.direccion) NOT ILIKE 'SIN DEFINIR%'),
               '')
           ) AS nombre,
           SUM(d.dsub) AS suben,
           SUM(d.dbaj) AS bajan
    FROM dets d
    WHERE d.cod_pv IS NOT NULL AND d.cod_pv <> '0'
      AND d.hora BETWEEN p_hora_desde AND p_hora_hasta
    GROUP BY d.cod_pv
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
      (SELECT jsonb_agg(jsonb_build_object('cod', t.cod, 'nombre', t.nombre, 'suben', t.suben, 'bajan', t.bajan) ORDER BY t.suben + t.bajan DESC) FROM top_pv t),
      '[]'::jsonb)
  )
$$;

-- Geocercas vistas en el rango, con etiqueta legible aunque GEMA no
-- tenga el nombre configurado.
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
         COALESCE(
           MIN(pv.punto_virtual) FILTER (WHERE pv.punto_virtual <> 'N/A'),
           'Punto ' || pv.cod_pv || COALESCE(
             ' · ' || MODE() WITHIN GROUP (ORDER BY trim(pv.direccion))
               FILTER (WHERE pv.direccion IS NOT NULL AND trim(pv.direccion) NOT ILIKE 'SIN DEFINIR%'),
             '')
         ) AS nombre,
         round(AVG(pv.latitud)::numeric, 6)  AS lat,
         round(AVG(pv.longitud)::numeric, 6) AS lng,
         BOOL_OR(COALESCE(pv.is_base, false)) AS is_base
  FROM puntos_virtuales pv
  WHERE pv.fecha BETWEEN p_desde AND p_hasta
    AND pv.cod_pv IS NOT NULL AND pv.cod_pv <> '0'
    AND pv.latitud IS NOT NULL AND pv.longitud IS NOT NULL
  GROUP BY pv.cod_pv
$$;

REVOKE ALL ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT) FROM anon, public;
REVOKE ALL ON FUNCTION get_mapa_calor_puntos(DATE, DATE) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_mapa_calor_puntos(DATE, DATE) TO authenticated, service_role;
