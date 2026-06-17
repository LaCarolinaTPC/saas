-- ============================================================
-- Tipos de usuario + permisos por módulo + alcance de datos
-- ============================================================

-- 1. TIPOS DE USUARIO
CREATE TABLE IF NOT EXISTS user_types (
  key TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  -- módulos permitidos (claves de módulo de la app)
  modulos JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- alcance de datos: 'all' = todo; 'departamentos' = limitado por scope_departments del perfil
  alcance TEXT NOT NULL DEFAULT 'all' CHECK (alcance IN ('all', 'departamentos')),
  puede_editar BOOLEAN NOT NULL DEFAULT false,
  es_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tipos por defecto (pocos, editables salvo admin).
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema) VALUES
  ('admin', 'Administrador', 'Acceso total al sistema',
   '["dashboard","accidentabilidad","vacantes","candidatos","empleados","conductores","documentos","campanas","rotacion","configuracion"]'::jsonb,
   'all', true, true),
  ('rrhh', 'Recursos Humanos', 'Gestión de personal y reclutamiento',
   '["dashboard","vacantes","candidatos","empleados","conductores","documentos","campanas","accidentabilidad"]'::jsonb,
   'all', true, false),
  ('operaciones', 'Operaciones', 'Conductores, rotación y accidentabilidad',
   '["dashboard","conductores","rotacion","accidentabilidad"]'::jsonb,
   'all', true, false),
  ('conductor', 'Conductor', 'Acceso básico',
   '["dashboard"]'::jsonb,
   'departamentos', false, false),
  ('consulta', 'Consulta', 'Solo lectura del tablero',
   '["dashboard"]'::jsonb,
   'all', false, true)
ON CONFLICT (key) DO NOTHING;

-- 2. PERFIL: tipo de usuario + alcance de datos
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_type TEXT REFERENCES user_types(key);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scope_departments TEXT[];

-- Los usuarios existentes quedan como admin para no perder acceso.
UPDATE profiles SET user_type = 'admin' WHERE user_type IS NULL;
ALTER TABLE profiles ALTER COLUMN user_type SET DEFAULT 'consulta';

-- 3. MAPEO CARGO → TIPO DE USUARIO
CREATE TABLE IF NOT EXISTS cargo_user_type (
  cargo TEXT PRIMARY KEY,
  user_type TEXT NOT NULL REFERENCES user_types(key),
  updated_at TIMESTAMPTZ DEFAULT now()
);
