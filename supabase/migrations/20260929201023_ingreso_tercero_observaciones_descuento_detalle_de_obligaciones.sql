-- ingreso tercero observaciones descuento detalle de obligaciones
--
-- Contexto: el GAF-R-12 detalla el pago de obligaciones factura por factura
-- ("PAG FACT FE3789-501 GASTOS $83.300"), pero Gestivo solo tenía el total
-- del día (descuentos_otros), así que Tesorería y el afiliado no podían ver
-- de qué era cada descuento, ni por qué algunos llegan en negativo (nueve
-- entre el 1 y el 10 de septiembre de 2026). GMAS agregó
-- "observacionesDescuento" a pa_ext_get_IngresoTerceroByFecha el 2026-09-29.
-- La sincronización (src/lib/gema/sync.ts) solo copia las columnas que conoce,
-- así que sin esta columna el texto se perdía.
--
-- Se guarda el texto tal como lo entrega GEMA, sin partirlo: todavía no se ha
-- visto su formato exacto con varias facturas en un mismo cierre.
--
-- Se agrega vacía: la sincronización diaria repasa los últimos 45 días y la
-- recarga por meses de Devengados → Parámetros llena lo anterior. NULL = sin
-- observación o día sincronizado antes de existir la columna.
--
-- ALTER TABLE conserva los GRANT de la tabla. Idempotente.

ALTER TABLE ingreso_tercero ADD COLUMN IF NOT EXISTS observaciones_descuento TEXT;

COMMENT ON COLUMN ingreso_tercero.observaciones_descuento IS
  'Campo "observacionesDescuento" de pa_ext_get_IngresoTerceroByFecha: el concepto de los descuentos otros (pago de obligaciones del GAF-R-12), tal como lo entrega GEMA.';

-- Verificación: debe devolver una fila con text.
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'ingreso_tercero' AND column_name = 'observaciones_descuento';
