-- ============================================================
-- Mapa de calor: top de actividad por ubicación, no por geocerca
--
-- El "top de puntos virtuales" solo contaba eventos ocurridos
-- DENTRO de una geocerca de GEMA (cod_pv válido). La mayoría de
-- las subidas/bajadas ocurren fuera de geocercas, así que en
-- periodos cortos la lista quedaba reducida a la terminal aunque
-- el mapa mostrara calor por toda la ciudad.
--
-- Ahora cada evento se asigna a un grupo de ubicación:
--   1) su geocerca, si tiene cod_pv válido (fila clicable: filtra);
--   2) si no, la dirección GPS reportada (una cuadra ≈ un paradero);
--   3) último recurso, la celda de ~110 m (lat/lng a 3 decimales).
-- Las filas sin geocerca llevan cod = null: se muestran en el top
-- pero no ofrecen el filtro por punto.
-- Se redefine solo get_mapa_calor; el resto queda como en la 053.
-- ============================================================

DROP FUNCTION IF EXISTS get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT);

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
      COALESCE(
        -- 1) nombre real configurado en GEMA
        MIN(g.punto_virtual) FILTER (WHERE g.punto_virtual <> 'N/A' AND g.grupo LIKE 'pv:%'),
        -- 2) dirección GPS más frecuente del grupo
        MODE() WITHIN GROUP (ORDER BY trim(g.direccion))
          FILTER (WHERE g.direccion IS NOT NULL AND trim(g.direccion) <> '' AND trim(g.direccion) NOT ILIKE 'SIN DEFINIR%'),
        -- 3) último recurso: el código o la celda
        CASE WHEN g.grupo LIKE 'pv:%' THEN 'Punto ' || substring(g.grupo from 4)
             ELSE 'Zona ' || round(AVG(g.lat), 4) || ', ' || round(AVG(g.lng), 4) END
      ) AS nombre,
      SUM(g.dsub) AS suben,
      SUM(g.dbaj) AS bajan
    FROM grupos g
    GROUP BY g.grupo
    ORDER BY SUM(g.dsub) + SUM(g.dbaj) DESC
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

REVOKE ALL ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_mapa_calor(DATE, DATE, TEXT, INT, INT, TEXT) TO authenticated, service_role;
