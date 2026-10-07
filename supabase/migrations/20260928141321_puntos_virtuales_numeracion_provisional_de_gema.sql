-- Numeración provisional de GEMA en puntos_virtuales
--
-- GEMA numera los eventos de un día de dos formas: mientras el día está en
-- curso les da un número provisional (serie ~31 M, que además se reutiliza:
-- el 25/09 volvió a emitir números que ya habían tenido eventos del 4 y 5 de
-- julio) y, al cerrar el día, los re-numera en la serie definitiva (~43 M).
-- Son los mismos eventos: mismo IMEI, misma fecha_hora, mismos contadores.
--
-- Como puntos_virtuales se sincroniza por upsert sobre `numero`, eso dejaba
-- dos daños:
--
--   * Duplicados: quien sincroniza a mitad de día guarda los provisionales,
--     y la corrida posterior al cierre agrega los definitivos sin borrar los
--     anteriores. Al 28/09 eran ~2,9 M filas repetidas en 78 días, que las
--     alarmas, timbradas y el mapa de calor contaban dos veces.
--   * Eventos pisados: un número provisional reutilizado hacía que el upsert
--     sobrescribiera un evento histórico de otro día (36.763 eventos de julio
--     se perdieron así) y dejaba a pv_deltas con una fila de otra fecha, que
--     es lo que tumbó la sincronización con "duplicate key ... pv_deltas_pkey".
--
-- Arreglo, sin tocar el código de sincronización:
--
--   1. Un disparador descarta el UPDATE que cambiaría la fecha de un evento:
--      mismo número en otro día es otro evento, no una corrección. El
--      provisional descartado no se pierde, llega con su número definitivo
--      cuando el día cierra.
--   2. refrescar_pv_deltas, que la sincronización llama después de cada día,
--      borra primero los provisionales del rango que ya tienen su gemelo
--      definitivo. Solo cuenta como gemelo una fila creada después del cierre
--      del día (hora Bogotá), con otro número y el mismo IMEI, fecha_hora y
--      contadores; dos filas de una misma corrida nunca se borran entre sí.
--   3. Limpieza de lo ya acumulado: se refresca cada día con provisionales,
--      en orden, para que el lag() de un día vea el anterior ya limpio.
--
-- Los eventos de julio sobrescritos (4 y 5 de julio) solo se recuperan
-- volviendo a traer esos días de GEMA.

-- 1. No pisar eventos de otro día ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION pv_no_pisar_otro_dia()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fecha IS DISTINCT FROM OLD.fecha THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pv_no_pisar_otro_dia ON puntos_virtuales;
CREATE TRIGGER trg_pv_no_pisar_otro_dia
  BEFORE UPDATE ON puntos_virtuales
  FOR EACH ROW EXECUTE FUNCTION pv_no_pisar_otro_dia();

-- 2. refrescar_pv_deltas purga los provisionales del rango ────────────────

CREATE OR REPLACE FUNCTION refrescar_pv_deltas(p_desde DATE, p_hasta DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n INTEGER;
BEGIN
  -- Serializa corridas concurrentes; se libera al terminar la transacción.
  PERFORM pg_advisory_xact_lock(hashtext('refrescar_pv_deltas'));

  -- Provisionales con su gemelo definitivo ya sincronizado.
  DELETE FROM puntos_virtuales p
  USING puntos_virtuales f
  WHERE p.fecha BETWEEN p_desde AND p_hasta
    -- Acotar también f por el rango: sin esto el planificador lee la tabla
    -- entera (7 GB) para armar el hash del gemelo.
    AND f.fecha BETWEEN p_desde AND p_hasta
    AND f.fecha = p.fecha
    AND p.created_at <  ((p.fecha + 1)::timestamp AT TIME ZONE 'America/Bogota')
    AND f.created_at >= ((f.fecha + 1)::timestamp AT TIME ZONE 'America/Bogota')
    AND f.numero <> p.numero
    AND f.imei = p.imei
    AND f.fecha_hora = p.fecha_hora
    AND f.subidas IS NOT DISTINCT FROM p.subidas
    AND f.bajadas IS NOT DISTINCT FROM p.bajadas;

  -- Dos borrados y no un OR con IN (subconsulta): esa forma impedía usar los
  -- índices y recorría los 4 M de filas de pv_deltas contra la lista entera.
  DELETE FROM pv_deltas d WHERE d.fecha BETWEEN p_desde AND p_hasta;
  -- Filas de otra fecha con un número que ahora es de un evento del rango.
  DELETE FROM pv_deltas d
  USING puntos_virtuales pv
  WHERE pv.fecha BETWEEN p_desde AND p_hasta
    AND d.numero = pv.numero;

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

-- 3. Limpieza de lo acumulado ─────────────────────────────────────────────
-- Idempotente: un día sin provisionales solo se vuelve a refrescar.
--
-- OJO: el SQL Editor corre el archivo entero en UNA transacción. Con ~2,9 M
-- filas este bloque supera el tiempo del editor (el Studio muestra un error
-- de validación "expected string, received undefined" en code/formattedError)
-- y al cortarse se deshace TODO, también las partes 1 y 2. Por eso:
--   a) ejecute primero solo las partes 1 y 2 (hasta el GRANT de arriba);
--   b) ejecute este bloque por rangos, añadiendo al WHERE del FOR
--      `AND p.fecha BETWEEN '2026-07-01' AND '2026-07-31'` y avanzando mes a
--      mes (o semana a semana si un mes también se corta). Cada ejecución es
--      su propia transacción y lo terminado queda guardado.

DO $$
DECLARE
  d DATE;
BEGIN
  FOR d IN
    SELECT DISTINCT p.fecha
    FROM puntos_virtuales p
    WHERE p.created_at < ((p.fecha + 1)::timestamp AT TIME ZONE 'America/Bogota')
      AND EXISTS (
        SELECT 1 FROM puntos_virtuales f
        WHERE f.fecha = p.fecha
          AND f.created_at >= ((f.fecha + 1)::timestamp AT TIME ZONE 'America/Bogota')
      )
    ORDER BY p.fecha
  LOOP
    PERFORM refrescar_pv_deltas(d, d);
  END LOOP;
END;
$$;
