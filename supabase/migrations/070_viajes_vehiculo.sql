-- ============================================================
-- Viajes del vehículo en un día: recaudados + solo-GPS
--
-- El selector de viajes se armaba desde viajes_recaudados, pero
-- un bus puede tener despachos sin registro de recaudo (el caso
-- "Sin Recaudo - Con Timbradas" del informe de timbradas): sus
-- alarmas y su calor quedaban inalcanzables por viaje. Esta
-- función une los viajes recaudados con los despachos observados
-- solo en la telemetría, con su conteo de alarmas incluido
-- (reemplaza a get_alarmas_por_despacho en la pantalla).
-- ============================================================

CREATE OR REPLACE FUNCTION get_viajes_vehiculo(
  p_fecha DATE,
  p_vehiculo TEXT
) RETURNS TABLE (
  numero BIGINT,
  viaje TEXT,
  ruta TEXT,
  hora_despacho TEXT,
  hora_llegada TEXT,
  sin_recaudo BOOLEAN,
  alarmas BIGINT
) LANGUAGE sql STABLE AS $$
  WITH vr AS (
    SELECT v.numero, v.viaje,
           norm_ruta(COALESCE(v.ruta_reprogramada, v.ruta_programada)) AS ruta,
           v.hora_despacho, v.hora_llegada
    FROM viajes_recaudados v
    WHERE v.fecha_viaje = p_fecha AND v.codigo_vehiculo = p_vehiculo
  ),
  gps AS (
    SELECT pv.numero_despacho AS numero,
           min(pv.hora) AS hora_ini,
           max(pv.hora) AS hora_fin,
           count(*) FILTER (WHERE pv.descripcion IN (
             'BLOQUEO P1', 'BLOQUEO P2', 'BLOQUEO P3',
             'PUERTA ABIERTA', 'PUERTA CERRADA', 'FALLA DE COMUNICACION'
           )) AS alarmas
    FROM puntos_virtuales pv
    WHERE pv.fecha = p_fecha AND pv.codigo_vehiculo = p_vehiculo
      AND pv.numero_despacho IS NOT NULL
    GROUP BY pv.numero_despacho
  )
  SELECT COALESCE(vr.numero, gps.numero)::bigint AS numero,
         vr.viaje,
         vr.ruta,
         COALESCE(vr.hora_despacho, gps.hora_ini) AS hora_despacho,
         COALESCE(NULLIF(vr.hora_llegada, '00:00:00'), gps.hora_fin) AS hora_llegada,
         (vr.numero IS NULL) AS sin_recaudo,
         COALESCE(gps.alarmas, 0) AS alarmas
  FROM vr
  FULL JOIN gps ON gps.numero = vr.numero
  ORDER BY COALESCE(vr.hora_despacho, gps.hora_ini)
$$;

REVOKE ALL ON FUNCTION get_viajes_vehiculo(DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_viajes_vehiculo(DATE, TEXT) TO authenticated, service_role;

-- Los deltas también deben incluir los despachos sin recaudo: el JOIN
-- interno con viajes_recaudados los dejaba fuera del mapa. LEFT JOIN y
-- re-backfill (quedan con ruta NULL: no entran al filtro por ruta, pero
-- sí al de vehículo/viaje y al mapa general).
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
  LEFT JOIN viajes_recaudados vr ON vr.numero = ev.numero_despacho
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

SELECT refrescar_pv_deltas(
  (SELECT MIN(fecha) FROM puntos_virtuales),
  (SELECT MAX(fecha) FROM puntos_virtuales)
);
