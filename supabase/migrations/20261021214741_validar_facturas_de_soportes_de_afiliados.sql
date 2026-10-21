-- validar facturas de soportes de afiliados
--
-- Guarda el consecutivo de la factura que respalda el soporte. La aplicación
-- lo extrae del detalle de GEMA, lo valida contra la liquidación del vehículo
-- y evita asociar dos soportes vigentes a la misma factura.
-- Instancia autoalojada: ejecutar completo en SQL Editor. Idempotente.

BEGIN;

ALTER TABLE afiliado_soportes
  ADD COLUMN IF NOT EXISTS numero_factura TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS afiliado_soportes_factura_vigente_uniq
  ON afiliado_soportes (cedula_propietario, codigo_vehiculo, fecha, numero_factura)
  WHERE anulado_at IS NULL AND numero_factura IS NOT NULL;

COMMENT ON COLUMN afiliado_soportes.numero_factura IS
  'Consecutivo normalizado de factura extraído del detalle de GEMA y validado al subir el soporte.';

GRANT ALL ON afiliado_soportes TO service_role;

COMMIT;

-- Verificación:
-- SELECT numero_factura, archivo_nombre FROM afiliado_soportes WHERE numero_factura IS NOT NULL;
