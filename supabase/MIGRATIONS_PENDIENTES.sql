-- ============================================================================
-- Migraciones PENDIENTES (Accidentabilidad) — 008, 009, 010
-- Úsalo si ya corriste 001–007. Es idempotente: se puede ejecutar varias veces.
-- Pegar en: Supabase → SQL Editor
-- ============================================================================

-- ── 008: Accidentabilidad ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE accidente_estado AS ENUM (
    'pendiente_revision', 'falta_informacion', 'completada', 'aprobado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS accidentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consecutivo BIGINT GENERATED ALWAYS AS IDENTITY,
  conductor_id UUID REFERENCES conductores(id),
  conductor_cedula TEXT NOT NULL,
  conductor_nombre TEXT NOT NULL,
  conductor_licencia TEXT,
  fecha_accidente TIMESTAMPTZ NOT NULL DEFAULT now(),
  direccion_accidente TEXT NOT NULL,
  resumen_hechos TEXT,
  nota_voz_url TEXT,
  nota_voz_transcripcion TEXT,
  tiene_peaton BOOLEAN NOT NULL DEFAULT false,
  peaton_nombre TEXT,
  peaton_cedula TEXT,
  peaton_telefono TEXT,
  peaton_direccion TEXT,
  peaton_correo TEXT,
  hubo_arreglo BOOLEAN NOT NULL DEFAULT false,
  arreglo_monto NUMERIC(14,2),
  arreglo_receptor_nombre TEXT,
  arreglo_receptor_cedula TEXT,
  arreglo_firma_url TEXT,
  solicito_aseguradora BOOLEAN NOT NULL DEFAULT false,
  aseguradora_nombre TEXT,
  abogado_nombre TEXT,
  abogado_apellidos TEXT,
  abogado_cedula TEXT,
  abogado_celular TEXT,
  firma_conductor_url TEXT NOT NULL,
  firma_tercero_url TEXT,
  estado accidente_estado NOT NULL DEFAULT 'pendiente_revision',
  created_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accidente_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE,
  placa TEXT,
  descripcion TEXT,
  es_propio BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accidente_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  estado_nuevo accidente_estado,
  comentario TEXT,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accidentes_conductor ON accidentes(conductor_id);
CREATE INDEX IF NOT EXISTS idx_accidentes_estado ON accidentes(estado);
CREATE INDEX IF NOT EXISTS idx_accidentes_fecha ON accidentes(fecha_accidente DESC);
CREATE INDEX IF NOT EXISTS idx_accidente_vehiculos_accidente ON accidente_vehiculos(accidente_id);
CREATE INDEX IF NOT EXISTS idx_accidente_eventos_accidente ON accidente_eventos(accidente_id);

DROP TRIGGER IF EXISTS trg_accidentes_updated ON accidentes;
CREATE TRIGGER trg_accidentes_updated BEFORE UPDATE ON accidentes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 009: Storage privado de accidentes ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('accidentes', 'accidentes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Service role read on accidentes" ON storage.objects;
CREATE POLICY "Service role read on accidentes" ON storage.objects
  FOR SELECT USING (bucket_id = 'accidentes');

DROP POLICY IF EXISTS "Service role upload on accidentes" ON storage.objects;
CREATE POLICY "Service role upload on accidentes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'accidentes');

DROP POLICY IF EXISTS "Service role delete on accidentes" ON storage.objects;
CREATE POLICY "Service role delete on accidentes" ON storage.objects
  FOR DELETE USING (bucket_id = 'accidentes');

-- ── 010: Configuración de la app (app_settings) ─────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

-- ── 018: Evaluación / Dictamen (Política de Correctivos) ────────────────────

DO $$ BEGIN
  CREATE TYPE accidente_gravedad AS ENUM ('leve', 'moderado', 'grave', 'fatal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accidente_responsabilidad AS ENUM ('directo', 'compartido', 'tercero', 'en_estudio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accidente_nivel AS ENUM ('ninguno', 'I', 'II', 'III', 'IV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS accidente_evaluaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL UNIQUE REFERENCES accidentes(id) ON DELETE CASCADE,
  gravedad accidente_gravedad,
  responsabilidad accidente_responsabilidad NOT NULL DEFAULT 'en_estudio',
  factores JSONB NOT NULL DEFAULT '[]'::jsonb,
  eximentes JSONB NOT NULL DEFAULT '[]'::jsonb,
  puntaje INTEGER NOT NULL DEFAULT 0,
  puntaje_detalle JSONB NOT NULL DEFAULT '[]'::jsonb,
  reincidente BOOLEAN NOT NULL DEFAULT false,
  reincidencia_3m INTEGER NOT NULL DEFAULT 0,
  reincidencia_6m INTEGER NOT NULL DEFAULT 0,
  reincidencia_12m INTEGER NOT NULL DEFAULT 0,
  nivel_sugerido accidente_nivel,
  nivel_final accidente_nivel,
  medidas JSONB NOT NULL DEFAULT '[]'::jsonb,
  requiere_comite BOOLEAN NOT NULL DEFAULT false,
  observaciones TEXT,
  evaluado_por UUID REFERENCES profiles(id),
  evaluado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accidente_evaluaciones_accidente ON accidente_evaluaciones(accidente_id);

DROP TRIGGER IF EXISTS trg_accidente_evaluaciones_updated ON accidente_evaluaciones;
CREATE TRIGGER trg_accidente_evaluaciones_updated BEFORE UPDATE ON accidente_evaluaciones
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 019: Criterios objetivos del reporte (clasificación automática) ─────────

DO $$ BEGIN
  CREATE TYPE accidente_lesionados AS ENUM ('ninguno', 'leves', 'incapacitantes', 'fatal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accidente_danos AS ENUM ('menores', 'significativos', 'altos', 'perdida_total');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS ciudad TEXT;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS lesionados accidente_lesionados;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS danos_materiales accidente_danos;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS fact_exceso_velocidad BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS fact_uso_celular BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS fact_no_distancia BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS fact_fatiga BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accidentes ADD COLUMN IF NOT EXISTS responsabilidad_reportada accidente_responsabilidad;
