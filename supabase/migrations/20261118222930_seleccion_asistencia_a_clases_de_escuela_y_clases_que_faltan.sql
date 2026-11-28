-- Selección: asistencia a las clases de escuela y clases que faltan
--
-- Contexto: pedido de Gestión Humana del 18-nov-2026. El profesor decide
-- cuántas clases necesita cada aspirante y lo va ajustando; y debe poder
-- marcar si el aspirante llegó o no a la clase. Hasta ahora cada fila de
-- seleccion_clases_escuela era una clase dictada, sin asistencia ni estimado.
--
--   * asistio: false = el aspirante no llegó a esa clase (queda como falta y
--     no cuenta como clase dictada).
--   * clases_faltantes: cuántas clases más calcula el profesor que necesita
--     después de esta (vacío = no lo dijo).
--
-- Requiere 20261118195923 (entrega 2). Idempotente: se puede volver a ejecutar.
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.

ALTER TABLE seleccion_clases_escuela ADD COLUMN IF NOT EXISTS asistio BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE seleccion_clases_escuela ADD COLUMN IF NOT EXISTS clases_faltantes SMALLINT;

COMMENT ON COLUMN seleccion_clases_escuela.asistio IS
  'false = el aspirante no llegó a la clase (falta); no cuenta como clase dictada.';
COMMENT ON COLUMN seleccion_clases_escuela.clases_faltantes IS
  'Clases que el profesor calcula que le faltan después de esta; nulo si no lo dijo.';
