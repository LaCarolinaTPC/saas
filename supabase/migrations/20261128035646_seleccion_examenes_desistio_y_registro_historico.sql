-- seleccion examenes desistio y registro historico
--
-- Contexto (27-nov-2026, Salud Ocupacional / GH): en el registro de exámenes de
-- ingreso hay aspirantes que desisten y no hacen la fase 1 (74 de 464 en 2026).
--  1. «Desistió» como resultado de cada fase (seleccion_examenes.resultado) y la
--     causa (de la lista o escrita) en la columna nueva `causa`, que también usa
--     el «no apto» (columna, sustancias psicoactivas…). Registrar «desistió»
--     cierra el proceso con «Desistimiento».
--  2. El registro histórico del Excel «INFORMACIÓN EXÁMENES DE INGRESO» para
--     Candidatos › Indicadores › Exámenes médicos: una fila por aspirante y fase 1.
--     Se vuelve a cargar cuando lo actualicen (la misma cédula y fecha se reemplaza).
-- Idempotente: se puede volver a ejecutar.

ALTER TABLE seleccion_examenes DROP CONSTRAINT IF EXISTS seleccion_examenes_resultado_check;
ALTER TABLE seleccion_examenes ADD CONSTRAINT seleccion_examenes_resultado_check
  CHECK (resultado IN ('pendiente', 'apto', 'no_apto', 'aplazado', 'desistio'));
ALTER TABLE seleccion_examenes ADD COLUMN IF NOT EXISTS causa TEXT;
COMMENT ON COLUMN seleccion_examenes.causa IS 'Por qué no fue apto o desistió (27-nov-2026): de la lista de Gestivo o escrita.';

CREATE TABLE IF NOT EXISTS seleccion_examenes_historico (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula           TEXT NOT NULL,
  nombre           TEXT,
  laboratorio      TEXT,
  fecha_fase1      DATE,
  resultado_fase1  TEXT NOT NULL CHECK (resultado_fase1 IN ('pendiente', 'apto', 'no_apto', 'aplazado', 'desistio')),
  fecha_fase2      DATE,
  resultado_fase2  TEXT CHECK (resultado_fase2 IN ('pendiente', 'apto', 'no_apto', 'aplazado', 'desistio')),
  causa            TEXT,
  archivo          TEXT,
  cargado_por      TEXT,
  cargado_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Una fila por cédula y fecha de la fase 1 (sin fecha cuenta como una sola).
CREATE UNIQUE INDEX IF NOT EXISTS seleccion_examenes_historico_cedula_fecha
  ON seleccion_examenes_historico (cedula, COALESCE(fecha_fase1, DATE '1900-01-01'));
CREATE INDEX IF NOT EXISTS seleccion_examenes_historico_fecha ON seleccion_examenes_historico (fecha_fase1);

ALTER TABLE seleccion_examenes_historico ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON seleccion_examenes_historico TO service_role;

SELECT conname FROM pg_constraint WHERE conname = 'seleccion_examenes_resultado_check';
SELECT count(*) AS filas_historico FROM seleccion_examenes_historico;
