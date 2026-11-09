-- comunicaciones seguimiento a quien no responde
--
-- Contexto. En el proceso de selección por WhatsApp muchos aspirantes dejan de
-- contestar a mitad de la conversación y el chat queda olvidado. Gestión
-- Humana pidió que, si la persona no responde en 2 horas, se le pregunte
-- automáticamente si sigue interesada, y que si tampoco responde a eso en
-- 24 horas el chat quede marcado para que alguien de GH decida.
--
-- Qué hace:
--   1. wa_seguimiento (una sola fila): si está activo, cuántas horas esperar,
--      el texto del recordatorio, en qué horario se puede enviar y a las
--      cuántas horas sin respuesta se marca «Para humano».
--   2. wa_conversaciones.seguimiento_enviado_at / seguimiento_escalado_at:
--      cuándo se envió el recordatorio y cuándo se marcó para GH, para no
--      repetirlos en el mismo silencio.
--
-- Lo ejecuta src/lib/comunicaciones/seguimiento-ejecutar.ts cada 15 minutos
-- (tarea programada «comunicaciones.seguimiento» y /api/cron/seguimiento-whatsapp).
-- Sin esta migración no hace nada.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

-- ── 1. Configuración ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_seguimiento (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activo          BOOLEAN NOT NULL DEFAULT true,
  -- Horas sin respuesta del aspirante (con el último mensaje nuestro) para el recordatorio.
  horas_espera    NUMERIC(4,1) NOT NULL DEFAULT 2 CHECK (horas_espera BETWEEN 0.5 AND 20),
  -- {nombre} se reemplaza por el nombre del contacto (o se omite si no hay).
  mensaje         TEXT NOT NULL DEFAULT 'Hola {nombre}, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.',
  -- Horario de envío (hora de Bogotá, HH:MM). Fuera de él se espera al siguiente.
  hora_desde      TEXT NOT NULL DEFAULT '07:00' CHECK (hora_desde ~ '^[0-2][0-9]:[0-5][0-9]$'),
  hora_hasta      TEXT NOT NULL DEFAULT '20:00' CHECK (hora_hasta ~ '^[0-2][0-9]:[0-5][0-9]$'),
  -- Horas sin respuesta al recordatorio para marcar el chat «Para humano» (0 = no marcar).
  horas_escalar   INTEGER NOT NULL DEFAULT 24 CHECK (horas_escalar BETWEEN 0 AND 168),
  actualizado_por TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO wa_seguimiento (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE wa_seguimiento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_seguimiento FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE wa_seguimiento TO service_role;

COMMENT ON TABLE wa_seguimiento IS
  'Recordatorio automático «¿sigues interesado?» a quien no responde en WhatsApp (Comunicaciones › Configuración).';

-- ── 2. Marcas por conversación ─────────────────────────────────────────────
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS seguimiento_enviado_at TIMESTAMPTZ;
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS seguimiento_escalado_at TIMESTAMPTZ;

-- Las candidatas a recordatorio son las de ventana abierta (entrante en las últimas 24 h).
CREATE INDEX IF NOT EXISTS idx_wa_conv_entrante ON wa_conversaciones (ultimo_entrante_at DESC);
