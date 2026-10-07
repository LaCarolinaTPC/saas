-- accidentes historico de la matriz de control
--
-- Contexto: hasta octubre de 2026 la empresa llevó los accidentes en la
-- "Matriz de Control de Accidentes de Tráfico" (Excel, código GO-R-22). Ese
-- histórico (enero 2024 en adelante) no estaba en Gestivo, así que la
-- reincidencia, el historial del conductor y del vehículo y las estadísticas
-- solo veían lo reportado en la aplicación.
--
-- El script scripts/migrar-accidentes-historico.mts carga la matriz en la
-- misma tabla `accidentes`, marcada con origen = 'historico'. Esos registros
-- no pasan por el flujo del formulario: no tienen firma ni, a veces, cédula
-- (la matriz solo trae el nombre del conductor), y llegan ya cerrados.
--
-- La matriz también lleva datos que el formulario no capturaba y que no deben
-- perderse: costo de reparación, cobros al conductor y al tercero, número del
-- reporte a la aseguradora, funcionario que atendió, estado del caso y
-- seguimiento a lesionados. Quedan como columnas propias; la fila original
-- completa queda además en historico_datos.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y es idempotente.

-- ── Origen del registro ─────────────────────────────────────────────────────
ALTER TABLE accidentes
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'gestivo',
  -- Fila de la matriz de la que viene ("GO-R-22!fila 37"); evita cargarla dos veces.
  ADD COLUMN IF NOT EXISTS historico_ref TEXT,
  ADD COLUMN IF NOT EXISTS historico_datos JSONB;

ALTER TABLE accidentes DROP CONSTRAINT IF EXISTS accidentes_origen_check;
ALTER TABLE accidentes ADD CONSTRAINT accidentes_origen_check
  CHECK (origen IN ('gestivo', 'historico'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_accidentes_historico_ref
  ON accidentes(historico_ref) WHERE historico_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accidentes_origen ON accidentes(origen);
CREATE INDEX IF NOT EXISTS idx_accidentes_conductor_cedula ON accidentes(conductor_cedula);
CREATE INDEX IF NOT EXISTS idx_accidentes_vehiculo_placa ON accidentes(vehiculo_placa);

-- ── Seguimiento del caso (columnas que traía la matriz) ─────────────────────
ALTER TABLE accidentes
  ADD COLUMN IF NOT EXISTS funcionario_atendio TEXT,
  ADD COLUMN IF NOT EXISTS aseguradora_reporte_numero TEXT,
  ADD COLUMN IF NOT EXISTS costo_reparacion NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cobro_conductor BOOLEAN,
  ADD COLUMN IF NOT EXISTS cobro_tercero BOOLEAN,
  ADD COLUMN IF NOT EXISTS caso_estado TEXT,
  ADD COLUMN IF NOT EXISTS seguimiento_lesionados TEXT;

ALTER TABLE accidentes DROP CONSTRAINT IF EXISTS accidentes_caso_estado_check;
ALTER TABLE accidentes ADD CONSTRAINT accidentes_caso_estado_check
  CHECK (caso_estado IS NULL OR caso_estado IN ('abierto', 'cerrado'));

-- ── Cédula y firma: obligatorias solo en lo que se reporta en Gestivo ───────
ALTER TABLE accidentes ALTER COLUMN conductor_cedula DROP NOT NULL;
ALTER TABLE accidentes ALTER COLUMN firma_conductor_url DROP NOT NULL;

ALTER TABLE accidentes DROP CONSTRAINT IF EXISTS accidentes_gestivo_requeridos_check;
ALTER TABLE accidentes ADD CONSTRAINT accidentes_gestivo_requeridos_check
  CHECK (origen = 'historico' OR (conductor_cedula IS NOT NULL AND firma_conductor_url IS NOT NULL));

-- ── Ciudad que aparece en la matriz y no estaba en el catálogo ──────────────
INSERT INTO accidente_catalogos (tipo, codigo, label, orden) VALUES
  ('ciudad', 'puerto_colombia', 'Puerto Colombia', 3)
ON CONFLICT (tipo, codigo) DO NOTHING;
