-- examenes medicos en dos fases
--
-- Contexto: los exámenes médicos de los candidatos se hacen en dos fases, cada
-- una con su propia fecha de citación, pero el proceso solo tenía un estado
-- (`en_examenes`) y una fecha (`fecha_examenes`). Lo existente pasa a ser la
-- fase 1 (no se pierde nada de lo ya digitado) y se agrega la fase 2 como
-- estado y fecha propios.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- No crea tablas, así que no hace falta GRANT nuevo.

ALTER TABLE procesos_contratacion
  ADD COLUMN IF NOT EXISTS fecha_examenes_fase2 DATE;

COMMENT ON COLUMN procesos_contratacion.fecha_examenes IS
  'Fecha de citación a exámenes médicos, fase 1.';
COMMENT ON COLUMN procesos_contratacion.fecha_examenes_fase2 IS
  'Fecha de citación a exámenes médicos, fase 2.';

-- Etapas del pipeline: se abre un hueco después de la fase 1 para la fase 2.
UPDATE pipeline_stages SET orden = orden + 1
WHERE key IN ('prueba_manejo', 'en_escuela', 'reconocimiento_ruta', 'contratado', 'rechazado')
  AND NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE key = 'en_examenes_fase2');

INSERT INTO pipeline_stages (key, label, color, text_color, orden, tipo, activo) VALUES
  ('en_examenes',       'Exámenes médicos · fase 1', '#FEF3C7', '#D97706', 3, 'normal', true),
  ('en_examenes_fase2', 'Exámenes médicos · fase 2', '#FFEDD5', '#EA580C', 4, 'normal', true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  color = EXCLUDED.color,
  text_color = EXCLUDED.text_color,
  orden = EXCLUDED.orden,
  tipo = EXCLUDED.tipo,
  activo = true;
