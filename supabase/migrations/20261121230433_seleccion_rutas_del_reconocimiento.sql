-- Rutas del reconocimiento de ruta (21-nov-2026)
--
-- Contexto: el reconocimiento contaba cuántas rutas distintas aprendió el
-- aspirante (ajuste `rutas_minimas`), con la lista que trae GEMA, sin poder
-- decir cuáles. Gestión Humana pidió una lista propia que se pueda ampliar,
-- editar y depurar, y marcar las rutas que son obligatorias. Cada nombre es una
-- ruta distinta: «A - 16 MIRAMAR» y «A - 16 MIRAMAR - GAVIOTAS» pueden ser
-- variaciones y se cuentan aparte.
--
-- Para contratar debe aprender al menos `rutas_minimas` rutas, entre ellas
-- todas las obligatorias. Las salidas (seleccion_reconocimientos_ruta) guardan
-- el nombre de la ruta: al corregir un nombre en la pantalla se corrige también
-- en las salidas ya registradas; al quitar una ruta, las salidas que ya la
-- tenían como aprendida siguen contando.
--
-- La lista se siembra una sola vez (si está vacía) con las rutas que GEMA usó
-- en los últimos 45 días y las que ya se registraron en salidas.
--
-- Idempotente: se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS seleccion_rutas_reconocimiento (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT NOT NULL,
  -- Debe aprenderla sí o sí (además de completar el número de rutas).
  obligatoria      BOOLEAN NOT NULL DEFAULT false,
  orden            INTEGER NOT NULL DEFAULT 0,
  actualizado_por  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sel_rutas_reconocimiento_nombre ON seleccion_rutas_reconocimiento (lower(nombre));

ALTER TABLE seleccion_rutas_reconocimiento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_rutas_reconocimiento FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE seleccion_rutas_reconocimiento TO service_role;

COMMENT ON TABLE seleccion_rutas_reconocimiento IS 'Rutas del reconocimiento de ruta de la selección, editables en Selección › Tiempos y reglas. Cada nombre es una ruta distinta.';
COMMENT ON COLUMN seleccion_rutas_reconocimiento.obligatoria IS 'El aspirante debe aprenderla para contratar, además de completar el ajuste rutas_minimas.';

-- Siembra: solo si la lista está vacía.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM seleccion_rutas_reconocimiento) THEN
    RETURN;
  END IF;
  IF to_regprocedure('operativo_rutas_catalogo(date)') IS NOT NULL THEN
    INSERT INTO seleccion_rutas_reconocimiento (nombre)
    SELECT DISTINCT trim(c.ruta)
    FROM operativo_rutas_catalogo(((now() AT TIME ZONE 'America/Bogota')::date - 45)) c
    WHERE trim(coalesce(c.ruta, '')) <> ''
    ON CONFLICT DO NOTHING;
  END IF;
  IF to_regclass('seleccion_reconocimientos_ruta') IS NOT NULL THEN
    INSERT INTO seleccion_rutas_reconocimiento (nombre)
    SELECT DISTINCT trim(s.ruta)
    FROM seleccion_reconocimientos_ruta s
    WHERE trim(coalesce(s.ruta, '')) <> ''
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Ayuda del ajuste: ahora cuenta junto con las obligatorias.
UPDATE seleccion_ajustes
SET nombre = 'Rutas que debe aprender en el reconocimiento de ruta (entre ellas, todas las obligatorias)'
WHERE clave = 'rutas_minimas';
