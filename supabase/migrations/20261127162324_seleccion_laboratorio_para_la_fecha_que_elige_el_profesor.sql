-- seleccion laboratorio para la fecha que elige el profesor
--
-- Contexto: desde el 27-nov-2026 el profesor puede elegir la fecha y la hora de
-- la fase 1 de exámenes (por ejemplo, el mismo día, si el aspirante alcanza a
-- ir). Para esos casos Gestión Humana suele mandar a Rescate porque queda
-- cerca: este ajuste dice qué laboratorio se le propone al profesor (él puede
-- cambiarlo). Se edita en Selección › Laboratorios. Arranca con el laboratorio
-- cuyo nombre contiene «Rescate», si existe; si no, vacío (se propone el del
-- reparto).
--
-- También: fechas sueltas en que un laboratorio avisa que no atiende (además
-- de sus días de la semana y de los festivos, que nunca atiende). Esos días no
-- se le cita a nadie allí. Se editan en la tarjeta de cada laboratorio.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: el script es idempotente.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES (
  'laboratorio_fecha_profesor',
  'regla',
  'Laboratorio cuando el profesor elige la fecha de exámenes',
  331,
  COALESCE((SELECT to_jsonb(id::text) FROM seleccion_laboratorios WHERE activo AND nombre ILIKE '%rescate%' ORDER BY orden LIMIT 1), 'null'::jsonb),
  'null'::jsonb,
  'texto',
  'Gestión Humana, 27-nov-2026',
  3
)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE seleccion_laboratorios
  ADD COLUMN IF NOT EXISTS fechas_sin_atencion date[] NOT NULL DEFAULT '{}';
