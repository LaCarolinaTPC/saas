-- camaras fecha de revision
--
-- Contexto: el técnico no siempre ve el video del viaje el mismo día del
-- viaje, ni lo registra el mismo día que lo ve. La revisión solo guardaba la
-- fecha del viaje y created_at (el momento de guardar), así que no había forma
-- de saber cuándo se revisó cada viaje ni medir cuánto tarda la revisión.
--
-- El histórico migrado del Forms se rellena con su hora de envío
-- (datos_origen.hora_inicio), con la misma regla que fechaRevisionForms en
-- src/lib/mantenimiento/camaras-reglas.ts:
--   - las filas del «CARGUE MTTO BD» traen solo el día (00:00:00): es el día
--     en que se vio el video, y vale aunque muchas filas lo compartan;
--   - la hora es creíble si no la comparten más de 3 filas del Forms (carga en
--     bloque con hora falsa) y cae entre el día del viaje y 60 días después;
--   - sin hora creíble la fecha es estimada y la fila recibe la alerta
--     fecha_revision_estimada: el día de envío si no es anterior al viaje y,
--     si lo es, el día del viaje (decisión del usuario, 2026-10-13).
-- Ensayo 2026-10-13: 3.992 creíbles y 473 estimadas (462 con el día del viaje,
-- 11 con el día de envío, más de 60 días después del viaje).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- No crea tablas, así que no hace falta GRANT nuevo.

ALTER TABLE camaras_revisiones
  ADD COLUMN IF NOT EXISTS fecha_revision DATE;

COMMENT ON COLUMN camaras_revisiones.fecha_revision IS
  'Día en que el técnico vio el video. Obligatoria en el formulario; en el histórico del Forms es estimada (alerta fecha_revision_estimada) cuando la hora de envío no es creíble.';

-- Relleno del histórico. Solo toca filas migradas que aún no tienen fecha.
WITH horas AS (
  SELECT datos_origen->>'hora_inicio' AS hora_inicio,
         count(DISTINCT datos_origen->>'fila') AS filas
  FROM camaras_revisiones
  WHERE origen = 'migracion' AND datos_origen->>'hora_inicio' IS NOT NULL
  GROUP BY 1
),
lecturas AS (
  SELECT r.id,
         r.fecha_viaje,
         CASE WHEN r.datos_origen->>'hora_inicio' ~ '^\d{4}-\d{2}-\d{2}'
              THEN left(r.datos_origen->>'hora_inicio', 10)::date END AS dia,
         substr(r.datos_origen->>'hora_inicio', 12, 8) AS hora,
         coalesce(h.filas, 0) AS filas
  FROM camaras_revisiones r
  LEFT JOIN horas h ON h.hora_inicio = r.datos_origen->>'hora_inicio'
  WHERE r.origen = 'migracion' AND r.fecha_revision IS NULL
),
decision AS (
  SELECT id, fecha_viaje, dia,
         dia IS NOT NULL
           AND (coalesce(hora, '') IN ('', '00:00:00') OR filas <= 3)
           AND dia BETWEEN fecha_viaje AND fecha_viaje + 60 AS creible
  FROM lecturas
)
UPDATE camaras_revisiones r
SET fecha_revision = CASE WHEN d.creible OR d.dia >= d.fecha_viaje THEN d.dia ELSE d.fecha_viaje END,
    alertas = CASE WHEN d.creible OR 'fecha_revision_estimada' = ANY (r.alertas) THEN r.alertas
                   ELSE array_append(r.alertas, 'fecha_revision_estimada') END
FROM decision d
WHERE r.id = d.id;

-- La revisión no puede ser anterior al viaje.
DO $camaras_fecha_revision$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camaras_revisiones_fecha_revision_check'
  ) THEN
    ALTER TABLE camaras_revisiones
      ADD CONSTRAINT camaras_revisiones_fecha_revision_check
      CHECK (fecha_revision IS NULL OR fecha_revision >= fecha_viaje);
  END IF;
END
$camaras_fecha_revision$;

CREATE INDEX IF NOT EXISTS idx_camaras_revisiones_fecha_revision
  ON camaras_revisiones (fecha_revision DESC) WHERE fecha_revision IS NOT NULL;

-- Comprobación: esperado en migracion 4.465 con fecha, 3.992 creíbles,
-- 473 estimadas y 0 sin dato.
SELECT origen,
       count(*) FILTER (WHERE fecha_revision IS NOT NULL) AS con_fecha,
       count(*) FILTER (WHERE fecha_revision IS NOT NULL
                          AND NOT 'fecha_revision_estimada' = ANY (alertas)) AS creibles,
       count(*) FILTER (WHERE 'fecha_revision_estimada' = ANY (alertas)) AS estimadas,
       count(*) FILTER (WHERE fecha_revision IS NULL) AS sin_dato
FROM camaras_revisiones
WHERE eliminado_at IS NULL
GROUP BY origen;
