-- agente de ia en comunicaciones
--
-- Contexto: RRHH quiere que un agente de IA conteste solo los WhatsApp que
-- llegan a la bandeja, con un prompt que el administrador escribe en la app y
-- con el proveedor que elija (Claude, OpenAI u OpenRouter). El agente responde
-- hasta que un humano toma el control: cuando alguien de Gestivo escribe en
-- el hilo, cuando la persona pide hablar con alguien o cuando el agente decide
-- que no puede ayudar. Se apaga del todo (wa_agente.activo) o por conversación
-- (wa_conversaciones.agente_pausado).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).

-- Configuración del agente: una sola fila, como wa_canal. Las API keys se
-- guardan cifradas (AES-256-GCM) cuando ENCRYPTION_KEY está definida.
CREATE TABLE IF NOT EXISTS wa_agente (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activo BOOLEAN NOT NULL DEFAULT false,
  proveedor TEXT NOT NULL DEFAULT 'openrouter'
    CHECK (proveedor IN ('anthropic', 'openai', 'openrouter')),
  -- Modelo para anthropic/openai, o para openrouter en modo manual.
  modelo TEXT,
  -- OpenRouter: 'auto' deja que su Auto Router elija dentro del nivel de costo;
  -- 'manual' usa el modelo indicado con el proveedor más barato.
  openrouter_modo TEXT NOT NULL DEFAULT 'auto'
    CHECK (openrouter_modo IN ('auto', 'manual')),
  openrouter_nivel_costo TEXT NOT NULL DEFAULT 'low'
    CHECK (openrouter_nivel_costo IN ('low', 'medium', 'high')),
  -- Patrones separados por coma (p. ej. "anthropic/*, google/*"); vacío = todos.
  openrouter_modelos_permitidos TEXT,
  anthropic_api_key TEXT,            -- cifrada
  openai_api_key TEXT,               -- cifrada; si falta se usa la de Configuración
  openrouter_api_key TEXT,           -- cifrada
  prompt TEXT NOT NULL DEFAULT '',
  -- Lo que recibe la persona cuando la conversación pasa a un humano.
  mensaje_transferencia TEXT NOT NULL DEFAULT
    'Listo, ya le paso tu mensaje a una persona del equipo. Te responderemos lo antes posible.',
  -- Frases (una por línea) que pasan la conversación a un humano sin consultar al modelo.
  frases_transferencia TEXT NOT NULL DEFAULT
    E'hablar con una persona\nhablar con un asesor\nasesor humano\ncon un humano\nagente humano',
  mensajes_historial INTEGER NOT NULL DEFAULT 20 CHECK (mensajes_historial BETWEEN 2 AND 60),
  -- Espera antes de responder, para juntar varios mensajes seguidos en una respuesta.
  espera_segundos INTEGER NOT NULL DEFAULT 6 CHECK (espera_segundos BETWEEN 0 AND 20),
  actualizado_por TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado del agente en cada conversación.
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS agente_pausado BOOLEAN NOT NULL DEFAULT false;
-- humano | solicitud | agente | manual
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS agente_motivo_pausa TEXT;
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS agente_pausado_at TIMESTAMPTZ;
-- La conversación pasó a humano y nadie de Gestivo ha respondido todavía.
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS requiere_humano BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS generado_por_ia BOOLEAN NOT NULL DEFAULT false;

-- Bitácora de cada vez que el agente consulta al modelo: qué modelo respondió
-- de verdad (OpenRouter puede elegir otro), tokens y resultado.
CREATE TABLE IF NOT EXISTS wa_agente_ejecuciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  proveedor TEXT NOT NULL,
  modelo_solicitado TEXT,
  modelo_usado TEXT,
  tokens_entrada INTEGER,
  tokens_salida INTEGER,
  duracion_ms INTEGER,
  resultado TEXT NOT NULL,           -- respondido | transferido | error
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_agente_ejec_fecha ON wa_agente_ejecuciones(created_at DESC);

-- Igual que el resto del módulo: solo el servidor (service_role) lo toca.
ALTER TABLE wa_agente ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_agente_ejecuciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_agente, wa_agente_ejecuciones FROM anon, public, authenticated;
GRANT ALL ON wa_agente, wa_agente_ejecuciones TO service_role;
