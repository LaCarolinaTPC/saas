-- ============================================================
-- Pipeline configurable: etapas como datos (no enum fijo)
-- ============================================================

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#DBEAFE',
  text_color TEXT NOT NULL DEFAULT '#2563EB',
  orden INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal', 'ganado', 'perdido')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Etapas actuales (semilla, conserva las claves del enum previo)
INSERT INTO pipeline_stages (key, label, color, text_color, orden, tipo) VALUES
  ('recibido',              'Recibido',              '#DBEAFE', '#2563EB', 1, 'normal'),
  ('en_revision',           'En Revisión',           '#FEF3C7', '#D97706', 2, 'normal'),
  ('validacion_documental', 'Validación Documental', '#E0E7FF', '#4F46E5', 3, 'normal'),
  ('preseleccionado',       'Preseleccionado',       '#D1FAE5', '#059669', 4, 'normal'),
  ('entrevistado',          'Entrevistado',          '#E0E7FF', '#4F46E5', 5, 'normal'),
  ('en_pruebas',            'En Pruebas',            '#FEF3C7', '#D97706', 6, 'normal'),
  ('aprobado',              'Aprobado',              '#D1FAE5', '#059669', 7, 'ganado'),
  ('rechazado',             'Rechazado',             '#FEE2E2', '#EF4444', 8, 'perdido')
ON CONFLICT (key) DO NOTHING;

-- Convertir las columnas de enum `pipeline_stage` a TEXT para permitir
-- etapas personalizadas. Se conserva el tipo enum (sin uso) por compatibilidad.
ALTER TABLE candidate_vacancy ALTER COLUMN current_stage DROP DEFAULT;
ALTER TABLE candidate_vacancy ALTER COLUMN current_stage TYPE TEXT USING current_stage::text;
ALTER TABLE candidate_vacancy ALTER COLUMN current_stage SET DEFAULT 'recibido';

ALTER TABLE stage_history ALTER COLUMN from_stage TYPE TEXT USING from_stage::text;
ALTER TABLE stage_history ALTER COLUMN to_stage   TYPE TEXT USING to_stage::text;
