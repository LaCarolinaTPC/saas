-- Operativo › Rutas: la ruta se identifica por su NOMBRE de GEMA, y catálogo
-- de rutas en una sola consulta.
--
-- Contexto: la migración 20261113190449_operativo_rutas_kml_y_cruce_con_gps_en_vivo.sql
-- tomó `programacion.id_ruta` como llave. Pero en la operación real cerca de
-- la mitad de los viajes se REPROGRAMAN a otra ruta (`historico_despacho.
-- ruta_reprogramada`), y varias de esas rutas ("A - 16 MIRAMAR - GAVIOTAS",
-- "B-17 MALLORQUIN") nunca aparecen en la programación: solo existen por su
-- nombre. Para cruzar el GPS con la ruta que el bus está haciendo de verdad,
-- la llave tiene que ser el nombre exacto de GEMA. Ojo: GEMA distingue rutas
-- que solo difieren en los guiones ("A - 16 MIRAMAR" y "A -- 16 MIRAMAR"); se
-- respetan como rutas distintas.
--
-- `id_ruta` queda como dato informativo (nulo si la ruta no está en la
-- programación). La tabla todavía no tiene filas, así que el cambio de llave
-- no toca datos.
--
-- `operativo_rutas_catalogo(desde)`: nombres de ruta usados desde esa fecha
-- en la programación y en el despacho (programada y reprogramada), con su
-- id_ruta cuando se conoce. Evita paginar decenas de miles de filas desde la
-- aplicación.
--
-- Se aplica a mano en el SQL Editor: corre entero de una vez y es idempotente.

ALTER TABLE operativo_rutas_kml ALTER COLUMN id_ruta DROP NOT NULL;

ALTER TABLE operativo_rutas_kml DROP CONSTRAINT IF EXISTS operativo_rutas_kml_version_uq;
DROP INDEX IF EXISTS operativo_rutas_kml_vigente_uq;
DROP INDEX IF EXISTS idx_operativo_rutas_kml_ruta;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operativo_rutas_kml_ruta_version_uq') THEN
    ALTER TABLE operativo_rutas_kml
      ADD CONSTRAINT operativo_rutas_kml_ruta_version_uq UNIQUE (ruta, version);
  END IF;
END $$;

-- Una sola versión vigente por ruta (por nombre).
CREATE UNIQUE INDEX IF NOT EXISTS operativo_rutas_kml_ruta_vigente_uq
  ON operativo_rutas_kml (ruta)
  WHERE vigente;

CREATE OR REPLACE FUNCTION operativo_rutas_catalogo(p_desde date)
RETURNS TABLE (ruta text, id_ruta integer, ultima_fecha date)
LANGUAGE sql
STABLE
AS $$
  WITH usos AS (
    SELECT trim(p.ruta) AS ruta, p.id_ruta, p.fecha AS fecha
    FROM programacion p
    WHERE p.fecha >= p_desde AND p.ruta IS NOT NULL
    UNION ALL
    SELECT trim(h.ruta_reprogramada), NULL::integer, h.fecha_viaje
    FROM historico_despacho h
    WHERE h.fecha_viaje >= p_desde AND h.ruta_reprogramada IS NOT NULL
    UNION ALL
    SELECT trim(h.ruta_programada), NULL::integer, h.fecha_viaje
    FROM historico_despacho h
    WHERE h.fecha_viaje >= p_desde AND h.ruta_programada IS NOT NULL
  )
  SELECT u.ruta, max(u.id_ruta) AS id_ruta, max(u.fecha) AS ultima_fecha
  FROM usos u
  WHERE u.ruta <> ''
  GROUP BY u.ruta
  ORDER BY u.ruta;
$$;

GRANT EXECUTE ON FUNCTION operativo_rutas_catalogo(date) TO service_role;
