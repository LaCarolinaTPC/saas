-- ============================================================
-- Timbradas del periodo: el bruto sale de timbradas_real
--
-- En GEMA `Timbradas` ya viene NETA (TimbradasReal − Descuento;
-- verificado: viaje 1821058 = 120 real − 3 dcto = 117 timbradas).
-- El KPI mostraba neto − dcto (doble resta). La función devuelve
-- ahora también el bruto (timbradas_real) para el desglose.
-- ============================================================

CREATE OR REPLACE FUNCTION get_timbradas_periodo(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL,
  p_hora_desde INT DEFAULT 0,
  p_hora_hasta INT DEFAULT 23,
  p_vehiculo TEXT DEFAULT NULL,
  p_despacho BIGINT DEFAULT NULL
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'timbradas', COALESCE(SUM(vr.timbradas), 0),                       -- neta
    'bruto', COALESCE(SUM(COALESCE(vr.timbradas_real, vr.timbradas)), 0),
    'descuento', COALESCE(SUM(vr.descuento), 0),
    'viajes', COUNT(*)
  )
  FROM viajes_recaudados vr
  WHERE vr.fecha_viaje BETWEEN p_desde AND p_hasta
    AND (p_ruta IS NULL OR norm_ruta(COALESCE(vr.ruta_reprogramada, vr.ruta_programada)) = p_ruta)
    AND (p_vehiculo IS NULL OR vr.codigo_vehiculo = p_vehiculo)
    AND (p_despacho IS NULL OR vr.numero = p_despacho)
    AND (
      -- Franja completa: no exigir hora de despacho válida.
      (p_hora_desde = 0 AND p_hora_hasta = 23)
      OR COALESCE(NULLIF(substring(vr.hora_despacho from 1 for 2), '')::int, -1)
         BETWEEN p_hora_desde AND p_hora_hasta
    )
$$;
