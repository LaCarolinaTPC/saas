-- ingreso tercero descuentos otros pago de obligaciones
--
-- Contexto: el reporte GEMA GAF-R-12 resta un "pago de obligaciones"
-- (facturas de parqueadero, repuestos, cuotas…) para llegar al producido
-- neto del afiliado. Tesorería confirmó el 2026-09-25 que sale del campo
-- "descuentos otros" de la liquidación de terceros de GEMA. La
-- sincronización (src/lib/gema/sync.ts) no lo guardaba porque solo copia las
-- columnas que conoce. No es valor_descuentos: en las 38.427 filas de 2026 ese
-- campo es exactamente combustible + póliza.
--
-- Se agrega la columna vacía. La sincronización diaria repasa los últimos 45
-- días, así que se llena sola desde la primera corrida después del
-- despliegue; los días anteriores quedan en NULL (sin dato, que no es cero).
--
-- ALTER TABLE conserva los GRANT de la tabla. Idempotente.

ALTER TABLE ingreso_tercero ADD COLUMN IF NOT EXISTS descuentos_otros NUMERIC(14,2);

COMMENT ON COLUMN ingreso_tercero.descuentos_otros IS
  'Campo "descuentos otros" de pa_ext_get_IngresoTerceroByFecha: el pago de obligaciones del GAF-R-12. NULL = día sincronizado antes de existir la columna.';

-- Verificación: debe devolver una fila con numeric.
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'ingreso_tercero' AND column_name = 'descuentos_otros';
