-- ausentismo: vehículo, rango de fechas del reporte y observaciones del soporte
--
-- Contexto: el registro diario de ausentismo (042) guardaba una sola `fecha`
-- y no decía qué vehículo dejaba de rodar. RRHH pidió tres cosas para poder
-- gestionar el reporte desde la base y no desde el Excel:
--
--   1. El número de vehículo del conductor, tomado del maestro `vehiculos`
--      que GEMA sincroniza (057). Se guarda `codigo_vehiculo`, la llave del
--      maestro, igual que hace Mantenimiento (073); la placa se muestra desde
--      `vehiculos`. Es opcional: hay ausencias (renuncia, licencia) sin
--      vehículo asignado. El sync de GEMA es un upsert, nunca borra, así que
--      la referencia no estorba; ON DELETE SET NULL cubre una limpieza manual.
--   2. Fecha de inicio y fecha final del reporte. `fecha` sigue siendo el día
--      operativo en que se registra (la pestaña "Registro del día" cuelga de
--      ella); `fecha_inicio`/`fecha_fin` delimitan la ausencia. Las filas
--      viejas heredan `fecha_inicio = fecha`.
--   3. Observaciones del soporte: al elegir un soporte (debe traer / presentado)
--      el formulario despliega un campo para anotar qué se pidió o qué llegó.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- No crea tablas: `ausentismo_registros` ya tiene sus privilegios y las
-- columnas nuevas los heredan.

ALTER TABLE ausentismo_registros
  ADD COLUMN IF NOT EXISTS codigo_vehiculo TEXT REFERENCES vehiculos(codigo) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin DATE,
  ADD COLUMN IF NOT EXISTS soporte_observaciones TEXT;

-- Los registros anteriores a esta migración empiezan el mismo día en que se
-- registraron; el fin queda abierto porque el Excel no lo traía.
UPDATE ausentismo_registros
  SET fecha_inicio = fecha
  WHERE fecha_inicio IS NULL;

ALTER TABLE ausentismo_registros
  DROP CONSTRAINT IF EXISTS ausentismo_registros_rango_check;
ALTER TABLE ausentismo_registros
  ADD CONSTRAINT ausentismo_registros_rango_check
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio);

CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_vehiculo
  ON ausentismo_registros (codigo_vehiculo) WHERE codigo_vehiculo IS NOT NULL;
