-- ============================================================
-- Conteo de alarmas por despacho de un vehículo en un día
--
-- Alimenta el selector de viajes del mapa de calor: cada opción
-- muestra cuántas alarmas de registradora hubo en ese viaje, para
-- ir directo al que tuvo eventos.
-- ============================================================

CREATE OR REPLACE FUNCTION get_alarmas_por_despacho(
  p_fecha DATE,
  p_vehiculo TEXT
) RETURNS TABLE (
  numero_despacho BIGINT,
  total BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT pv.numero_despacho, count(*) AS total
  FROM puntos_virtuales pv
  WHERE pv.fecha = p_fecha
    AND pv.codigo_vehiculo = p_vehiculo
    AND pv.numero_despacho IS NOT NULL
    AND pv.descripcion IN (
      'BLOQUEO P1', 'BLOQUEO P2', 'BLOQUEO P3',
      'PUERTA ABIERTA', 'PUERTA CERRADA', 'FALLA DE COMUNICACION'
    )
  GROUP BY pv.numero_despacho
$$;

REVOKE ALL ON FUNCTION get_alarmas_por_despacho(DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_alarmas_por_despacho(DATE, TEXT) TO authenticated, service_role;
