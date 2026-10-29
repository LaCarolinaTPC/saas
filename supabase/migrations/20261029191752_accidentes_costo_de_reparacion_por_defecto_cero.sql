-- accidentes costo de reparacion por defecto cero
--
-- Contexto. El reporte de accidente necesita el costo de reparación, que llena
-- el director de mantenimiento con el permiso nuevo
-- `accidentabilidad.costo_reparacion`. La columna ya existía (la llenaba solo
-- la importación del histórico GO-R-22); los reportes de Gestivo la tenían
-- vacía. Se pide que arranque en cero y que sea un número válido.
--
-- Qué hace:
--   1. Valor por defecto 0 para los reportes nuevos.
--   2. Los reportes de Gestivo sin costo quedan en 0 (40 al 29/10/2026). Los
--      históricos sin costo se dejan vacíos: la matriz no lo traía.
--   3. Un costo no puede ser negativo.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente.

ALTER TABLE accidentes ALTER COLUMN costo_reparacion SET DEFAULT 0;

UPDATE accidentes
   SET costo_reparacion = 0
 WHERE costo_reparacion IS NULL
   AND COALESCE(origen, 'gestivo') = 'gestivo';

ALTER TABLE accidentes DROP CONSTRAINT IF EXISTS accidentes_costo_reparacion_no_negativo;
ALTER TABLE accidentes ADD CONSTRAINT accidentes_costo_reparacion_no_negativo
  CHECK (costo_reparacion IS NULL OR costo_reparacion >= 0);

COMMENT ON COLUMN accidentes.costo_reparacion IS
  'Costo de reparación en pesos. En los reportes de Gestivo lo registra quien tenga el permiso accidentabilidad.costo_reparacion (director de mantenimiento); 0 mientras no se registre. En el histórico, el de la matriz GO-R-22.';

-- Verificación: reportes de Gestivo sin costo (debe ser 0).
SELECT count(*) AS gestivo_sin_costo
  FROM accidentes
 WHERE costo_reparacion IS NULL AND COALESCE(origen, 'gestivo') = 'gestivo';
