-- Operativo › Rutas: trazado KML de cada ruta y cruce con el GPS en vivo
--
-- Contexto: Operativo dibuja las rutas en Google My Maps y necesita verlas en
-- Gestivo y saber, con el GPS en vivo de GEMA, qué buses se salen de su ruta.
-- GEMA no trae el trazado: solo el código de la ruta (`programacion.id_ruta`,
-- `programacion.ruta`). Esta tabla guarda el trazado por ruta, con versiones.
--
--   - Un KML = una ruta = UNA sola línea que recorre ida y vuelta.
--   - El original queda en el bucket privado `operativo`
--     (`rutas-kml/<id_ruta>/...`); la línea ya procesada va en `linea` para no
--     releer el KML en cada refresco del mapa.
--   - Solo una versión vigente por ruta (índice único parcial). Activar otra
--     versión es apagar la vigente y prender la nueva.
--   - `tolerancia_m`: distancia máxima del bus a la línea para contar como
--     "en ruta". Por defecto 10 m (decisión de Operativo), ajustable por ruta.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: el script corre entero de una sola vez y
-- es idempotente. El bucket `operativo` ya existe (migración
-- 20260904191056_modulo_operativo_documentos_del_vehiculo_y_vencimientos.sql).

CREATE TABLE IF NOT EXISTS operativo_rutas_kml (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Llave de GEMA (programacion.id_ruta) y su nombre tal como viene.
  id_ruta INTEGER NOT NULL,
  ruta TEXT NOT NULL,
  version INTEGER NOT NULL,
  vigente BOOLEAN NOT NULL DEFAULT false,
  -- Archivo original en el bucket `operativo`.
  archivo_ruta TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_tamano INTEGER,
  -- Trazado procesado: [[lon, lat], ...] en el orden del recorrido.
  linea JSONB NOT NULL,
  -- Paradas marcadas en el mapa: [{ "nombre": ..., "lon": ..., "lat": ... }].
  paradas JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [minLon, minLat, maxLon, maxLat] para encuadrar el mapa.
  bbox JSONB NOT NULL,
  longitud_km NUMERIC(8, 3) NOT NULL,
  num_puntos INTEGER NOT NULL,
  -- La línea termina donde empieza (recorrido cerrado).
  circular BOOLEAN NOT NULL DEFAULT false,
  tolerancia_m INTEGER NOT NULL DEFAULT 10,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operativo_rutas_kml_version_uq UNIQUE (id_ruta, version),
  CONSTRAINT operativo_rutas_kml_tolerancia_chk CHECK (tolerancia_m BETWEEN 5 AND 1000),
  CONSTRAINT operativo_rutas_kml_linea_chk CHECK (jsonb_typeof(linea) = 'array' AND jsonb_array_length(linea) >= 2)
);

-- Una sola versión vigente por ruta.
CREATE UNIQUE INDEX IF NOT EXISTS operativo_rutas_kml_vigente_uq
  ON operativo_rutas_kml (id_ruta)
  WHERE vigente;

-- El mapa en vivo lee solo las vigentes.
CREATE INDEX IF NOT EXISTS idx_operativo_rutas_kml_ruta
  ON operativo_rutas_kml (id_ruta, version DESC);

ALTER TABLE operativo_rutas_kml ENABLE ROW LEVEL SECURITY;

-- En esta instalación las tablas nuevas no conceden privilegios a service_role.
GRANT SELECT, INSERT, UPDATE, DELETE ON operativo_rutas_kml TO service_role;
GRANT USAGE, SELECT ON SEQUENCE operativo_rutas_kml_id_seq TO service_role;
