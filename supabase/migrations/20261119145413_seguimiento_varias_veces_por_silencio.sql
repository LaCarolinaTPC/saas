-- Seguimiento a quien no responde: varios recordatorios por silencio
--
-- Contexto: el «¿sigues interesado?» salía una sola vez por silencio. Gestión
-- Humana pidió poder configurar cuántas veces se le recuerda (por defecto 3),
-- cada una a las mismas horas de la anterior, y editarlo desde Selección ›
-- Tiempos y reglas. Para eso hace falta guardar el número en la configuración
-- y llevar la cuenta por conversación (vuelve a cero cuando el aspirante
-- escribe: lo decide el código comparando con seguimiento_enviado_at).
--
-- Sin esta migración el código sigue mandando uno solo por silencio.
-- Solo agrega columnas a tablas que ya tienen sus GRANT. Idempotente.

ALTER TABLE wa_seguimiento
  ADD COLUMN IF NOT EXISTS max_recordatorios INTEGER NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_seguimiento_max_recordatorios_check') THEN
    ALTER TABLE wa_seguimiento
      ADD CONSTRAINT wa_seguimiento_max_recordatorios_check CHECK (max_recordatorios BETWEEN 1 AND 10);
  END IF;
END $$;

COMMENT ON COLUMN wa_seguimiento.max_recordatorios IS
  'Recordatorios «¿sigues interesado?» por silencio; cada uno sale horas_espera después del anterior.';

ALTER TABLE wa_conversaciones
  ADD COLUMN IF NOT EXISTS seguimiento_conteo INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN wa_conversaciones.seguimiento_conteo IS
  'Recordatorios enviados en el silencio que empezó antes de seguimiento_enviado_at (si el aspirante escribió después, la cuenta es 0).';
