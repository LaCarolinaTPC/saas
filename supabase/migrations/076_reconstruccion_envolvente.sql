-- ============================================================
-- Reconstrucción de timbradas por envolvente del contador
--
-- La suma de avances positivos contaba doble cuando el contador
-- tenía un BAJÓN transitorio con recuperación (537 el 24/08:
-- 68410 → 68352 a las 08:48 y a las 08:53 retoma en 68412; la
-- venta real del viaje es 68426 − 68350 = 76, no 135).
--
-- Algoritmo: se parte la serie solo en los REINICIOS REALES
-- (caídas tras las cuales el contador nunca vuelve a superar el
-- máximo previo). En cada segmento la venta es max − primer
-- valor; los bajones recuperados quedan absorbidos por el máximo.
--   · Bajón con recuperación → 1 segmento: 68426 − 68350 = 76 ✔
--   · Reinicio real (p. ej. reinicia en 0 y sigue) → 2 segmentos:
--     (max previo − inicio) + (último − 0).
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
  timbradas_gps BIGINT     -- reconstrucción por envolvente del contador
) LANGUAGE sql STABLE AS $$
  WITH vr AS (
    SELECT v.numero, v.viaje,
           norm_ruta(COALESCE(v.ruta_reprogramada, v.ruta_programada)) AS ruta,
           v.hora_despacho, v.hora_llegada, v.timbradas, v.descuento
    FROM viajes_recaudados v
    WHERE v.fecha_viaje = p_fecha AND v.codigo_vehiculo = p_vehiculo
  ),
  base AS (
    SELECT pv.numero_despacho, pv.fecha_hora, pv.numero AS ev_num,
           pv.hora, pv.descripcion, pv.registradora
    FROM puntos_virtuales pv
    WHERE pv.fecha = p_fecha AND pv.codigo_vehiculo = p_vehiculo
      AND pv.numero_despacho IS NOT NULL
  ),
  reg AS (
    SELECT b.numero_despacho, b.fecha_hora, b.ev_num, b.registradora,
           lag(b.registradora) OVER w AS prev,
           max(b.registradora) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS max_previo,
           max(b.registradora) OVER (w ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS max_futuro
    FROM base b
    WHERE b.registradora IS NOT NULL
    WINDOW w AS (PARTITION BY b.numero_despacho ORDER BY b.fecha_hora, b.ev_num)
  ),
  seg AS (
    SELECT r.*,
           count(*) FILTER (
             WHERE r.prev IS NOT NULL AND r.registradora < r.prev
               AND r.max_futuro < r.max_previo  -- nunca se recupera: reinicio real
           ) OVER (PARTITION BY r.numero_despacho ORDER BY r.fecha_hora, r.ev_num) AS segmento
    FROM reg r
  ),
  ventas AS (
    SELECT s.numero_despacho,
           SUM(seg_venta)::bigint AS timbradas_gps
    FROM (
      SELECT s2.numero_despacho, s2.segmento,
             GREATEST(0, max(s2.registradora) -
               (array_agg(s2.registradora ORDER BY s2.fecha_hora, s2.ev_num))[1]) AS seg_venta
      FROM seg s2
      GROUP BY s2.numero_despacho, s2.segmento
    ) s
    GROUP BY s.numero_despacho
  ),
  gps AS (
    SELECT b.numero_despacho AS numero,
           min(b.hora) AS hora_ini,
           max(b.hora) AS hora_fin,
           count(*) FILTER (WHERE b.descripcion IN (
             'BLOQUEO P1', 'BLOQUEO P2', 'BLOQUEO P3',
             'PUERTA ABIERTA', 'PUERTA CERRADA', 'FALLA DE COMUNICACION'
           )) AS alarmas
    FROM base b
    GROUP BY b.numero_despacho
  ),
  caidas AS (
    SELECT r.numero_despacho AS numero,
           count(*) FILTER (
             WHERE r.prev IS NOT NULL AND r.registradora < r.prev
           ) AS reinicios
    FROM reg r
    GROUP BY r.numero_despacho
  )
  SELECT COALESCE(vr.numero, gps.numero)::bigint AS numero,
         vr.viaje,
         vr.ruta,
         COALESCE(vr.hora_despacho, gps.hora_ini) AS hora_despacho,
         COALESCE(NULLIF(vr.hora_llegada, '00:00:00'), gps.hora_fin) AS hora_llegada,
         (vr.numero IS NULL) AS sin_recaudo,
         COALESCE(gps.alarmas, 0) AS alarmas,
         COALESCE(c.reinicios, 0) AS reinicios,
         vr.timbradas AS timbradas_vr,
         vr.descuento AS descuento_vr,
         COALESCE(v.timbradas_gps, 0) AS timbradas_gps
  FROM vr
  FULL JOIN gps ON gps.numero = vr.numero
  LEFT JOIN caidas c ON c.numero = COALESCE(vr.numero, gps.numero)
  LEFT JOIN ventas v ON v.numero_despacho = COALESCE(vr.numero, gps.numero)
  ORDER BY COALESCE(vr.hora_despacho, gps.hora_ini)
$$;

REVOKE ALL ON FUNCTION get_viajes_vehiculo(DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_viajes_vehiculo(DATE, TEXT) TO authenticated, service_role;
