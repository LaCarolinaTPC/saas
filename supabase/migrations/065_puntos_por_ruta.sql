-- ============================================================
-- Mapa de calor: geocercas filtradas por ruta
--
-- get_mapa_calor_puntos mostraba todas las geocercas del rango
-- aunque hubiera una ruta seleccionada. Con p_ruta, se limita a
-- las geocercas donde esa ruta tuvo movimiento de pasajeros en el
-- periodo (membresía vía pv_deltas, que ya trae la ruta resuelta
-- por despacho).
-- ============================================================

DROP FUNCTION IF EXISTS get_mapa_calor_puntos(DATE, DATE);

CREATE FUNCTION get_mapa_calor_puntos(
  p_desde DATE,
  p_hasta DATE,
  p_ruta TEXT DEFAULT NULL
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
           MODE() WITHIN GROUP (ORDER BY trim(pv.direccion))
             FILTER (WHERE pv.direccion IS NOT NULL AND trim(pv.direccion) <> '' AND trim(pv.direccion) NOT ILIKE 'SIN DEFINIR%'),
           'Punto ' || pv.cod_pv
         ) AS nombre,
         round(AVG(pv.latitud)::numeric, 6)  AS lat,
         round(AVG(pv.longitud)::numeric, 6) AS lng,
         BOOL_OR(COALESCE(pv.is_base, false)) AS is_base
  FROM puntos_virtuales pv
  WHERE pv.fecha BETWEEN p_desde AND p_hasta
    AND pv.cod_pv IS NOT NULL AND pv.cod_pv <> '0'
    AND pv.latitud IS NOT NULL AND pv.longitud IS NOT NULL
    AND (p_ruta IS NULL OR pv.cod_pv IN (
      SELECT DISTINCT d.cod_pv FROM pv_deltas d
      WHERE d.fecha BETWEEN p_desde AND p_hasta
        AND d.ruta = p_ruta
        AND d.cod_pv IS NOT NULL AND d.cod_pv <> '0'
    ))
  GROUP BY pv.cod_pv
$$;

REVOKE ALL ON FUNCTION get_mapa_calor_puntos(DATE, DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_mapa_calor_puntos(DATE, DATE, TEXT) TO authenticated, service_role;
