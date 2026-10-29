-- procesos disciplinarios campos del excel e historico
--
-- Contexto. RRHH lleva los procesos en el Excel «PROCESOS DISCIPLINARIOS»
-- (hojas 2025 y 2026) con columnas que el módulo no tenía: cargo, área, quién
-- hizo el proceso y la norma incumplida (CST, seguridad vial, funciones…). El
-- módulo se alinea a ese Excel y su histórico se carga con
-- scripts/migrar-disciplinarios-historico.mts, marcado con origen 'historico'.
--
-- Qué hace:
--   1. Agrega cargo, area, realizado_por, norma_incumplida, origen e
--      historico_ref (fila del Excel, para que la carga sea idempotente).
--   2. Admite la medida 'no_registrada': el Excel no siempre dice qué medida se
--      tomó (p. ej. «ACTA DE DESCARGO») y no debe quedar como «pendiente».
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor: el script corre entero de una vez y es idempotente.

ALTER TABLE procesos_disciplinarios ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE procesos_disciplinarios ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE procesos_disciplinarios ADD COLUMN IF NOT EXISTS realizado_por TEXT;
ALTER TABLE procesos_disciplinarios ADD COLUMN IF NOT EXISTS norma_incumplida TEXT;
ALTER TABLE procesos_disciplinarios ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'gestivo';
ALTER TABLE procesos_disciplinarios ADD COLUMN IF NOT EXISTS historico_ref TEXT;

ALTER TABLE procesos_disciplinarios DROP CONSTRAINT IF EXISTS procesos_disciplinarios_area_check;
ALTER TABLE procesos_disciplinarios ADD CONSTRAINT procesos_disciplinarios_area_check
  CHECK (area IS NULL OR area IN ('operativa', 'administrativa'));

ALTER TABLE procesos_disciplinarios DROP CONSTRAINT IF EXISTS procesos_disciplinarios_origen_check;
ALTER TABLE procesos_disciplinarios ADD CONSTRAINT procesos_disciplinarios_origen_check
  CHECK (origen IN ('gestivo', 'historico'));

ALTER TABLE procesos_disciplinarios DROP CONSTRAINT IF EXISTS procesos_disciplinarios_medida_check;
ALTER TABLE procesos_disciplinarios ADD CONSTRAINT procesos_disciplinarios_medida_check
  CHECK (medida IN ('pendiente', 'sin_medida', 'llamado_verbal', 'llamado_escrito', 'suspension', 'terminacion', 'otra', 'no_registrada'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_procesos_disciplinarios_historico_ref
  ON procesos_disciplinarios (historico_ref) WHERE historico_ref IS NOT NULL;

COMMENT ON COLUMN procesos_disciplinarios.realizado_por IS 'Persona que hizo el proceso (columna REALIZADO POR del Excel).';
COMMENT ON COLUMN procesos_disciplinarios.norma_incumplida IS 'Clave de NORMAS_INCUMPLIDAS (src/lib/disciplinarios/reglas.ts).';
COMMENT ON COLUMN procesos_disciplinarios.origen IS 'gestivo: registrado en la aplicación; historico: cargado del Excel de RRHH.';
COMMENT ON COLUMN procesos_disciplinarios.historico_ref IS 'Hoja y fila del Excel («2025:14») de un proceso histórico.';

-- La carga del histórico inserta y, si se reversa, borra (solo origen historico).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE procesos_disciplinarios TO service_role;

-- Verificación: columnas nuevas y cuántos históricos hay.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'procesos_disciplinarios'
      AND column_name IN ('cargo', 'area', 'realizado_por', 'norma_incumplida', 'origen', 'historico_ref')) AS columnas_nuevas,
  (SELECT count(*) FROM procesos_disciplinarios WHERE origen = 'historico') AS historicos;
