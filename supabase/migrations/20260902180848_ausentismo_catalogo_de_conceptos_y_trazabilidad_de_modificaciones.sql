-- ausentismo: catálogo de conceptos y trazabilidad de modificaciones
--
-- Contexto. El campo "Tipo de ausencia" era una lista fija en código
-- (src/lib/ausentismo/constants.ts): agregar un concepto exigía un despliegue.
-- RRHH pidió poder crear conceptos nuevos desde el propio formulario y, además,
-- que cuando un registro se modifique después (trajo la incapacidad, se
-- prorrogó, se corrigió) quede guardado el concepto con el que se creó, en un
-- campo que el formulario no muestra, para poder validar más adelante el
-- registro inicial contra el actual.
--
-- Qué hace:
--   1. Crea `ausentismo_conceptos` y lo siembra con los 12 tipos que ya usaba
--      la app, con las MISMAS claves, así `ausentismo_registros.tipo` sigue
--      siendo válido sin rellenar nada. Las dos reglas que estaban en código
--      ("vacaciones y descanso no cuentan para reincidencia", "estos tipos
--      exigen soporte") pasan a ser banderas del catálogo.
--   2. Enlaza `tipo` al catálogo con llave foránea. Antes, cualquier tipo
--      suelto que exista en los registros se da de alta como concepto para que
--      la llave no falle.
--   3. Agrega al registro `tipo_inicial` (se escribe una vez y un trigger lo
--      vuelve inmutable), `tipo_modificado_at`, `modificado_por_email` y
--      `motivo_modificacion`.
--   4. Vista `vw_ausentismo_reclasificados` para la validación posterior.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Ejecutar después de 20260902162916 (vehículo y rango de fechas).

-- ── 1. Catálogo ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ausentismo_conceptos (
  -- Clave corta y estable; es lo que guarda `ausentismo_registros.tipo`.
  key TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 100,
  activo BOOLEAN NOT NULL DEFAULT true,
  -- Vacaciones y descansos son programados: no suman como reincidencia.
  cuenta_reincidencia BOOLEAN NOT NULL DEFAULT true,
  -- Si al elegirlo el formulario debe sugerir "Debe traer soporte".
  exige_soporte BOOLEAN NOT NULL DEFAULT false,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un mismo nombre no puede repetirse aunque cambie mayúsculas o tildes de más.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ausentismo_conceptos_nombre
  ON ausentismo_conceptos (lower(nombre));

DROP TRIGGER IF EXISTS trg_ausentismo_conceptos_updated ON ausentismo_conceptos;
CREATE TRIGGER trg_ausentismo_conceptos_updated
  BEFORE UPDATE ON ausentismo_conceptos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Semilla: los 12 tipos de constants.ts, mismo orden en que se mostraban.
INSERT INTO ausentismo_conceptos (key, nombre, orden, cuenta_reincidencia, exige_soporte) VALUES
  ('incapacidad',    'Incapacidad',                        10, true,  true),
  ('permiso',        'Permiso',                            20, true,  false),
  ('vacaciones',     'Vacaciones',                         30, false, false),
  ('descanso',       'Descanso',                           40, false, false),
  ('suspension',     'Suspensión',                         50, true,  false),
  ('calamidad',      'Calamidad familiar',                 60, true,  true),
  ('licencia',       'Licencia (paternidad/maternidad)',   70, true,  true),
  ('eps',            'Cita médica / EPS',                  80, true,  true),
  ('taller',         'Vehículo en taller',                 90, true,  false),
  ('no_justificada', 'No justificada',                    100, true,  false),
  ('renuncia',       'Renuncia / retiro',                 110, true,  false),
  ('otra',           'Otra',                              120, true,  false)
ON CONFLICT (key) DO NOTHING;

-- ── 2. Enlazar el registro al catálogo ───────────────────────────────────────
-- Cualquier tipo que exista en los registros y no esté en el catálogo se da de
-- alta tal cual (activo, al final de la lista) para que la llave no falle.
INSERT INTO ausentismo_conceptos (key, nombre, orden)
SELECT DISTINCT r.tipo, r.tipo, 900
FROM ausentismo_registros r
WHERE r.tipo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ausentismo_conceptos c WHERE c.key = r.tipo)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ausentismo_registros_tipo_fkey'
  ) THEN
    ALTER TABLE ausentismo_registros
      ADD CONSTRAINT ausentismo_registros_tipo_fkey
      FOREIGN KEY (tipo) REFERENCES ausentismo_conceptos(key);
  END IF;
END $$;

-- ── 3. Trazabilidad de la modificación posterior ─────────────────────────────
ALTER TABLE ausentismo_registros
  -- Concepto con el que se creó el registro. Oculto en el formulario.
  ADD COLUMN IF NOT EXISTS tipo_inicial TEXT REFERENCES ausentismo_conceptos(key),
  -- Cuándo cambió por última vez el concepto (vacío mientras no cambie).
  ADD COLUMN IF NOT EXISTS tipo_modificado_at TIMESTAMPTZ,
  -- Quién hizo la última edición y por qué. La fecha es `updated_at`.
  ADD COLUMN IF NOT EXISTS modificado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS motivo_modificacion TEXT;

-- Lo que ya existe se creó con el concepto que tiene hoy.
UPDATE ausentismo_registros
  SET tipo_inicial = tipo
  WHERE tipo_inicial IS NULL;

ALTER TABLE ausentismo_registros
  ALTER COLUMN tipo_inicial SET NOT NULL;

-- El trigger sella `tipo_inicial` al insertar, lo vuelve inmutable en las
-- ediciones (venga de la app o del SQL Editor) y estampa `tipo_modificado_at`
-- cada vez que el concepto cambia.
CREATE OR REPLACE FUNCTION ausentismo_registros_trazabilidad()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.tipo_inicial := COALESCE(NEW.tipo_inicial, NEW.tipo);
    RETURN NEW;
  END IF;

  -- UPDATE
  NEW.tipo_inicial := OLD.tipo_inicial;
  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    NEW.tipo_modificado_at := now();
  ELSE
    NEW.tipo_modificado_at := OLD.tipo_modificado_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ausentismo_registros_trazabilidad ON ausentismo_registros;
CREATE TRIGGER trg_ausentismo_registros_trazabilidad
  BEFORE INSERT OR UPDATE ON ausentismo_registros
  FOR EACH ROW EXECUTE FUNCTION ausentismo_registros_trazabilidad();

CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_reclasificados
  ON ausentismo_registros (tipo_modificado_at DESC)
  WHERE tipo <> tipo_inicial;

-- ── 4. Vista para validar el registro inicial contra el actual ───────────────
CREATE OR REPLACE VIEW vw_ausentismo_reclasificados AS
SELECT
  r.id,
  r.fecha,
  r.fecha_inicio,
  r.fecha_fin,
  r.cedula,
  r.codigo,
  r.nombre,
  r.codigo_vehiculo,
  r.tipo_inicial,
  ci.nombre  AS tipo_inicial_nombre,
  r.tipo     AS tipo_actual,
  ca.nombre  AS tipo_actual_nombre,
  r.tipo_modificado_at,
  r.modificado_por_email,
  r.motivo_modificacion,
  r.soporte,
  r.soporte_observaciones,
  r.created_by_email,
  r.created_at,
  r.updated_at
FROM ausentismo_registros r
JOIN ausentismo_conceptos ci ON ci.key = r.tipo_inicial
JOIN ausentismo_conceptos ca ON ca.key = r.tipo
WHERE r.tipo <> r.tipo_inicial;

-- ── 5. Seguridad y permisos ──────────────────────────────────────────────────
-- Mismo esquema que el resto del módulo: RLS sin políticas, solo el servidor
-- (service_role) accede y valida antes los permisos de aplicación.
ALTER TABLE ausentismo_conceptos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ausentismo_conceptos FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ausentismo_conceptos TO service_role;
GRANT SELECT ON vw_ausentismo_reclasificados TO service_role;
