-- ============================================================
-- Canal de WhatsApp configurable desde la app
--
-- Como en Varylo, las credenciales del número se registran desde
-- la pantalla de configuración del módulo Comunicaciones (no en
-- variables de entorno). Los secretos (token y app secret) se
-- guardan cifrados con AES-256-GCM cuando ENCRYPTION_KEY está
-- definida; la tabla solo es accesible para service_role.
-- Una sola fila (id = 1): un número de empresa.
-- ============================================================

CREATE TABLE IF NOT EXISTS wa_canal (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phone_number_id TEXT NOT NULL,
  waba_id TEXT,
  access_token TEXT NOT NULL,        -- cifrado iv:tag:cipher (o plano legado)
  app_secret TEXT,                   -- cifrado; valida la firma del webhook
  verify_token TEXT NOT NULL,        -- apretón de manos del webhook (GET)
  numero_mostrado TEXT,              -- ej. +57 300 123 4567 (informativo)
  actualizado_por TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE wa_canal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_canal FROM anon, public, authenticated;
GRANT ALL ON wa_canal TO service_role;
