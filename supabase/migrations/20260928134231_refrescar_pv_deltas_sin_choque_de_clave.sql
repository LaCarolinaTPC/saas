-- Refrescar pv_deltas sin choque de clave
--
-- La sincronización con GEMA falló con:
--   refrescar_pv_deltas 2026-09-25: duplicate key value violates unique
--   constraint "pv_deltas_pkey"
--
-- La función borraba solo por fecha y reinsertaba. pv_deltas tiene como
-- clave el numero del evento, no la fecha, así que el INSERT choca cuando
-- ya existe una fila con ese numero que el DELETE no alcanzó:
--
--   * GEMA cambió la fecha de un evento ya sincronizado (el upsert de
--     puntos_virtuales por numero la actualiza, pero en pv_deltas la fila
--     vieja sigue con la fecha anterior, fuera del rango borrado).
--   * Dos sincronizaciones corrieron a la vez (el cron diario y el botón
--     "Sincronizar ahora"): ambas borran el mismo día y la segunda en
--     insertar choca con lo que la primera ya confirmó.
--
-- Ahora la función toma un candado por transacción para que dos corridas
-- no se pisen, borra también por numero los eventos del rango y el INSERT
-- actualiza en conflicto como red de seguridad. Mismo cálculo que la
-- versión de 070_viajes_vehiculo.sql.

CREATE OR REPLACE FUNCTION refrescar_pv_deltas(p_desde DATE, p_hasta DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n INTEGER;
BEGIN
  -- Serializa corridas concurrentes; se libera al terminar la transacción.
  PERFORM pg_advisory_xact_lock(hashtext('refrescar_pv_deltas'));

  DELETE FROM pv_deltas d
  WHERE d.fecha BETWEEN p_desde AND p_hasta
     OR d.numero IN (
       SELECT pv.numero FROM puntos_virtuales pv
       WHERE pv.fecha BETWEEN p_desde AND p_hasta
     );

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
    AND ev.hora BETWEEN 0 AND 23
  ON CONFLICT (numero) DO UPDATE SET
    fecha = EXCLUDED.fecha,
    hora = EXCLUDED.hora,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    cod_pv = EXCLUDED.cod_pv,
    punto_virtual = EXCLUDED.punto_virtual,
    direccion = EXCLUDED.direccion,
    codigo_vehiculo = EXCLUDED.codigo_vehiculo,
    ruta = EXCLUDED.ruta,
    dsub = EXCLUDED.dsub,
    dbaj = EXCLUDED.dbaj,
    velocidad = EXCLUDED.velocidad,
    numero_despacho = EXCLUDED.numero_despacho;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION refrescar_pv_deltas(DATE, DATE) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION refrescar_pv_deltas(DATE, DATE) TO service_role;
