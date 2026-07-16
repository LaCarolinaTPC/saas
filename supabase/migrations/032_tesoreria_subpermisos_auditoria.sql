-- 032: Sub-permisos por módulo en user_types + auditoría de Tesorería.
-- Pegar en: Supabase → SQL Editor (idempotente).

-- Sub-funciones permitidas por módulo, ej. {"tesoreria": ["caja","analisis"]}.
-- Ausencia de la clave del módulo = sin restricción (acceso a todas sus
-- sub-funciones); así los tipos existentes conservan el comportamiento actual.
ALTER TABLE user_types
  ADD COLUMN IF NOT EXISTS submodulos JSONB NOT NULL DEFAULT '{}';

-- El rol Tesorería arranca con las funciones operativas; la auditoría se
-- concede desde Configuración → Usuarios a quien se determine.
UPDATE user_types
  SET submodulos = jsonb_set(
    submodulos, '{tesoreria}', '["caja","analisis","entregas","parametros"]'
  )
  WHERE key = 'tesoreria' AND NOT (submodulos ? 'tesoreria');

-- Registro de auditoría de las acciones de Tesorería (dinero): quién hizo
-- qué, sobre qué conductor y con qué valores. Solo se inserta desde el
-- servidor (service role); nunca se actualiza ni borra desde la app.
CREATE TABLE IF NOT EXISTS tesoreria_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  accion TEXT NOT NULL,             -- entrega_registrada | traslado_gema | base_diaria | fecha_operativa
  cedula_conductor TEXT,
  conductor_nombre TEXT,
  valor NUMERIC,
  detalle JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tesoreria_audit_created
  ON tesoreria_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tesoreria_audit_cedula
  ON tesoreria_audit_log (cedula_conductor);

ALTER TABLE tesoreria_audit_log ENABLE ROW LEVEL SECURITY;
