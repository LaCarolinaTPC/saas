-- tareas programadas estilo wp-cron
--
-- Contexto. En el plan Hobby de Vercel un cron corre una sola vez al día y
-- con ±59 minutos de holgura, así que no sirve para «a las 09:00 registra a
-- los ausentes». Hasta ahora eso se hacía al abrir la pantalla de Marcaciones,
-- y si nadie la abría no se hacía. Ahora cualquier página abierta de Gestivo
-- (y el televisor) da un «latido» cada pocos minutos, y el servidor corre las
-- tareas cuya hora ya pasó, como el wp-cron de WordPress.
--
-- Qué hace: crea `tareas_programadas`, una fila por tarea con su última
-- ejecución. La «ranura» (día + hora configurada) es lo que impide repetir:
-- una tarea corre una vez por ranura, salvo que cambien la hora o alguien la
-- ejecute a mano. `bloqueada_hasta` es el candado para que dos pestañas que
-- laten al mismo segundo no la corran dos veces.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor: el script corre entero de una vez y es idempotente.
-- Las tablas nuevas no heredan privilegios: el GRANT a service_role va aquí.

CREATE TABLE IF NOT EXISTS tareas_programadas (
  id TEXT PRIMARY KEY,
  -- «2026-10-27@09:00»: el día y la hora con que corrió por última vez. Vacía
  -- (y no NULL) si nunca corrió, para que el candado compare con un simple «<>».
  ultima_ranura TEXT NOT NULL DEFAULT '',
  ultima_ejecucion TIMESTAMPTZ,
  -- 'automatico' (latido) o 'manual' (botón).
  ultimo_origen TEXT CHECK (ultimo_origen IN ('automatico', 'manual')),
  ultimo_usuario TEXT,
  -- Lo que devolvió la tarea (p. ej. cuántos registros creó) y el error, si lo hubo.
  ultimo_resultado JSONB,
  ultimo_error TEXT,
  -- Candado: mientras esté en el futuro, otra pestaña no la toma. 'epoch' = libre.
  bloqueada_hasta TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Las tareas conocidas. El código también la crea si falta.
INSERT INTO tareas_programadas (id) VALUES ('ausentismo.pendientes')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE tareas_programadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tareas_programadas FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE tareas_programadas TO service_role;

COMMENT ON TABLE tareas_programadas IS
  'Estado de las tareas que corre Gestivo al latir una página abierta (estilo wp-cron): última ranura día@hora, origen, resultado y candado.';

-- Verificación: debe devolver la fila de ausentismo.pendientes.
SELECT id, ultima_ranura, ultima_ejecucion FROM tareas_programadas;
