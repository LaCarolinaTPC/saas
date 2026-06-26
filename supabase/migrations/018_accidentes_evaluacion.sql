-- Módulo de Accidentabilidad — Evaluación / Dictamen (Política de Correctivos)
-- =============================================================================
-- Capa de evaluación sobre el reporte de accidente: clasificación de gravedad,
-- responsabilidad, matriz de ponderación (puntaje), nivel de correctivo (I–IV),
-- reincidencia y comité de accidentalidad.

CREATE TYPE accidente_gravedad AS ENUM ('leve', 'moderado', 'grave', 'fatal');
CREATE TYPE accidente_responsabilidad AS ENUM ('directo', 'compartido', 'tercero', 'en_estudio');
CREATE TYPE accidente_nivel AS ENUM ('ninguno', 'I', 'II', 'III', 'IV');

CREATE TABLE accidente_evaluaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL UNIQUE REFERENCES accidentes(id) ON DELETE CASCADE,

  -- Criterios de evaluación
  gravedad accidente_gravedad,
  responsabilidad accidente_responsabilidad NOT NULL DEFAULT 'en_estudio',

  -- Matriz de ponderación
  factores JSONB NOT NULL DEFAULT '[]'::jsonb,        -- FactorKey[] activos
  eximentes JSONB NOT NULL DEFAULT '[]'::jsonb,        -- EximenteKey[]
  puntaje INTEGER NOT NULL DEFAULT 0,
  puntaje_detalle JSONB NOT NULL DEFAULT '[]'::jsonb,  -- snapshot {key,label,puntaje}[]

  -- Reincidencia (snapshot al momento de evaluar)
  reincidente BOOLEAN NOT NULL DEFAULT false,
  reincidencia_3m INTEGER NOT NULL DEFAULT 0,
  reincidencia_6m INTEGER NOT NULL DEFAULT 0,
  reincidencia_12m INTEGER NOT NULL DEFAULT 0,

  -- Correctivo
  nivel_sugerido accidente_nivel,
  nivel_final accidente_nivel,
  medidas JSONB NOT NULL DEFAULT '[]'::jsonb,           -- medidas seleccionadas
  requiere_comite BOOLEAN NOT NULL DEFAULT false,

  observaciones TEXT,
  evaluado_por UUID REFERENCES profiles(id),
  evaluado_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_accidente_evaluaciones_accidente ON accidente_evaluaciones(accidente_id);

CREATE TRIGGER trg_accidente_evaluaciones_updated BEFORE UPDATE ON accidente_evaluaciones
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
