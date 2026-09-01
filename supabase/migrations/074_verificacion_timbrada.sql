-- ============================================================
-- Detección de reinicios de registradora por viaje
--
-- Si la registradora se reinicia a mitad de un despacho (el
-- contador retrocede: visto en el 537 el 2026-08-24, 68410 →
-- 68352), GEMA liquida las timbradas con final − inicial y la
-- neta queda corta. get_viajes_vehiculo devuelve ahora cuántos
-- retrocesos tuvo cada viaje para que la pantalla muestre la
-- alerta "VERIFICACIÓN DE TIMBRADA".
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
  reinicios BIGINT
) LANGUAGE sql STABLE AS $$
  WITH vr AS (
    SELECT v.numero, v.viaje,
           norm_ruta(COALESCE(v.ruta_reprogramada, v.ruta_programada)) AS ruta,
           v.hora_despacho, v.hora_llegada
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
           -- Contador de la registradora que retrocede = reinicio a mitad
           -- del viaje: las timbradas liquidadas quedan cortas.
           count(*) FILTER (
             WHERE e.registradora IS NOT NULL AND e.reg_prev IS NOT NULL
               AND e.registradora < e.reg_prev
           ) AS reinicios
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
         COALESCE(gps.reinicios, 0) AS reinicios
  FROM vr
  FULL JOIN gps ON gps.numero = vr.numero
  ORDER BY COALESCE(vr.hora_despacho, gps.hora_ini)
$$;

REVOKE ALL ON FUNCTION get_viajes_vehiculo(DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_viajes_vehiculo(DATE, TEXT) TO authenticated, service_role;
