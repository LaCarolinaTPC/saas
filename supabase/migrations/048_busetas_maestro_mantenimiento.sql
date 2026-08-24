-- 048: Maestro de busetas para el área de Mantenimiento.
-- Replica el catálogo funcional del proyecto Da-o_Busetas y se usará como
-- fuente de vehículos del módulo. Idempotente: seguro de ejecutar una vez.

CREATE TABLE IF NOT EXISTS busetas (
  placa TEXT PRIMARY KEY,
  descripcion TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  numero_interno TEXT
);

-- Compatibilidad si una instalación previa creó la tabla sin el número interno.
ALTER TABLE busetas
  ADD COLUMN IF NOT EXISTS numero_interno TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_busetas_numero_interno
  ON busetas(numero_interno)
  WHERE numero_interno IS NOT NULL;

ALTER TABLE busetas ENABLE ROW LEVEL SECURITY;

-- Las operaciones del módulo se realizan desde Server Actions con permisos
-- propios de Gestivo; no se concede acceso público al catálogo.
