-- ============================================================
-- Timbradas reconstruidas para viajes con reinicio
--
-- GEMA liquida final − inicial: si la registradora se reinicia a
-- mitad del viaje, lo vendido antes del reinicio se pierde (537
-- el 24/08: liquidó 32 cuando el contador avanzó 60 + 30 = 90).
-- La reconstrucción suma los avances POSITIVOS del contador
-- dentro del despacho, inmune a los retrocesos.
-- get_viajes_vehiculo devuelve ahora la timbrada de recaudo, el
-- descuento y la reconstrucción GPS para que la pantalla corrija
-- la neta de los viajes con reinicio.
-- ============================================================

DROP FUNCTION IF EXISTS get_viajes_vehiculo(DATE, TEXT);

CREATE FUNCTION get_viajes_vehiculo(
  p_fecha DATE,
  p_vehiculo TEXT
) RETURNS TABLE (
  numero BIGINT,
  viaje TEXT,
  ruta TEXT,
  hora_despacho TEXT,
  hora_llegada TEXT,
  sin_recaudo BOOLEAN,
  alarmas BIGINT,
  reinicios BIGINT,
  timbradas_vr NUMERIC,    -- neta liquidada por GEMA (ya con dcto restado)
  descuento_vr NUMERIC,
  timbradas_gps BIGINT     -- reconstrucción: suma de avances del contador
) LANGUAGE sql STABLE AS $$
  WITH vr AS (
    SELECT v.numero, v.viaje,
           norm_ruta(COALESCE(v.ruta_reprogramada, v.ruta_programada)) AS ruta,
           v.hora_despacho, v.hora_llegada, v.timbradas, v.descuento
    FROM viajes_recaudados v
    WHERE v.fecha_viaje = p_fecha AND v.codigo_vehiculo = p_vehiculo
  ),
  ev AS (
    SELECT pv.numero_despacho, pv.hora, pv.descripcion, pv.registradora,
           lag(pv.registradora) OVER (
             PARTITION BY pv.numero_despacho ORDER BY pv.fecha_hora, pv.numero
           ) AS reg_prev
    FROM puntos_virtuales pv
    WHERE pv.fecha = p_fecha AND pv.codigo_vehiculo = p_vehiculo
      AND pv.numero_despacho IS NOT NULL
  ),
  gps AS (
    SELECT e.numero_despacho AS numero,
           min(e.hora) AS hora_ini,
           max(e.hora) AS hora_fin,
           count(*) FILTER (WHERE e.descripcion IN (
             'BLOQUEO P1', 'BLOQUEO P2', 'BLOQUEO P3',
             'PUERTA ABIERTA', 'PUERTA CERRADA', 'FALLA DE COMUNICACION'
           )) AS alarmas,
           -- Contador que retrocede = reinicio a mitad del viaje.
           count(*) FILTER (
             WHERE e.registradora IS NOT NULL AND e.reg_prev IS NOT NULL
               AND e.registradora < e.reg_prev
           ) AS reinicios,
           -- Venta real del viaje: solo los avances del contador (los
           -- retrocesos por reinicio no restan).
           COALESCE(SUM(GREATEST(0, e.registradora - e.reg_prev)) FILTER (
             WHERE e.registradora IS NOT NULL AND e.reg_prev IS NOT NULL
           ), 0)::bigint AS timbradas_gps
    FROM ev e
    GROUP BY e.numero_despacho
  )
  SELECT COALESCE(vr.numero, gps.numero)::bigint AS numero,
         vr.viaje,
         vr.ruta,
         COALESCE(vr.hora_despacho, gps.hora_ini) AS hora_despacho,
         COALESCE(NULLIF(vr.hora_llegada, '00:00:00'), gps.hora_fin) AS hora_llegada,
         (vr.numero IS NULL) AS sin_recaudo,
         COALESCE(gps.alarmas, 0) AS alarmas,
         COALESCE(gps.reinicios, 0) AS reinicios,
         vr.timbradas AS timbradas_vr,
         vr.descuento AS descuento_vr,
         COALESCE(gps.timbradas_gps, 0) AS timbradas_gps
  FROM vr
  FULL JOIN gps ON gps.numero = vr.numero
  ORDER BY COALESCE(vr.hora_despacho, gps.hora_ini)
$$;

REVOKE ALL ON FUNCTION get_viajes_vehiculo(DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_viajes_vehiculo(DATE, TEXT) TO authenticated, service_role;
