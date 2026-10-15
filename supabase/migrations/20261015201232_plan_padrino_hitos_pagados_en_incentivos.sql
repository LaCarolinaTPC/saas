-- plan padrino hitos pagados en incentivos
--
-- Contexto: fase 3 del Plan Padrino (spec RQ-12). Los incentivos pagados a
-- cada persona viven en la tabla `incentivos` (la ven Rotación, el MCP y la
-- API). Para que nadie tenga que volver a digitar a mano la bonificación del
-- Plan Padrino, cada hito marcado como pagado deja su fila ahí, con
-- source_file = 'gestivo-plan-padrino' y concepto «PLAN PADRINO …».
--
-- La carga del Excel de incentivos (Rotación → Datos) reemplazaba TODA la
-- tabla; desde este cambio borra solo lo que no generó Gestivo, así que
-- estas filas sobreviven a las cargas. Ojo: si el Excel también trae el pago
-- del Plan Padrino, quedaría dos veces; nómina debe dejar de incluirlo.
--
-- padrino_hitos.incentivo_id enlaza el hito con su fila de incentivos y hace
-- la escritura idempotente: un hito pagado se registra una sola vez.
--
-- Depende de 20261015195455 (padrino_hitos). Se aplica a mano en el SQL
-- Editor, entero y de una sola vez. Es idempotente.

ALTER TABLE padrino_hitos ADD COLUMN IF NOT EXISTS incentivo_id uuid REFERENCES incentivos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_incentivos_source_file ON incentivos (source_file);

COMMENT ON COLUMN padrino_hitos.incentivo_id IS
  'Fila de incentivos que registra el pago de este hito (source_file = gestivo-plan-padrino). Nula mientras no esté pagado.';

-- Verificación: hitos pagados sin su fila de incentivos (se crean en la siguiente evaluación diaria).
SELECT count(*) FILTER (WHERE estado = 'pagado' AND incentivo_id IS NULL) AS pagados_sin_incentivo
FROM padrino_hitos;
