-- Selección: el profesor solo cambia las citas del mismo día por un imprevisto
--
-- Contexto (24-nov-2026): el profesor podía marcar «no puedo» u «otra hora»
-- para hoy y reprogramar las citas a última hora, sin tiempo para que los
-- aspirantes se enteraran. Ahora, para hoy, solo por un imprevisto
-- (enfermedad u otro imprevisto, con la explicación escrita) y con al menos
-- `cambio_mismo_dia_minutos` antes de la primera cita afectada y de la hora
-- nueva (src/lib/seleccion/agenda.ts, validarCambioMismoDia). Gestión Humana,
-- desde la Agenda, no tiene esa restricción.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

-- «Imprevisto» como motivo de la novedad del profesor.
ALTER TABLE seleccion_disponibilidad_profesor DROP CONSTRAINT IF EXISTS seleccion_disponibilidad_profesor_motivo_check;
ALTER TABLE seleccion_disponibilidad_profesor
  ADD CONSTRAINT seleccion_disponibilidad_profesor_motivo_check CHECK (motivo IN ('enfermedad', 'permiso', 'otra_hora', 'otro', 'imprevisto'));

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('cambio_mismo_dia_minutos', 'tiempo', 'Anticipación mínima para que el profesor cambie las citas del mismo día', 75,
        '120'::jsonb, '120'::jsonb, 'minutos', 'Gestión Humana, 24-nov-2026', 2)
ON CONFLICT (clave) DO NOTHING;

SELECT pg_get_constraintdef(oid) AS motivos FROM pg_constraint WHERE conname = 'seleccion_disponibilidad_profesor_motivo_check';
