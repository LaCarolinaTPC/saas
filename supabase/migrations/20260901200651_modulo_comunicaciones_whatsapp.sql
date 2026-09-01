-- ============================================================
-- Módulo Comunicaciones: WhatsApp interno (Fase 1)
--
-- Bandeja de WhatsApp de la empresa dentro de Gestivo, portada de
-- Varylo (Cloud API oficial de Meta) y recortada a uso interno:
-- un solo número, sin multi-empresa ni agentes de IA. Las
-- credenciales viven en variables de entorno del servidor
-- (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
-- WHATSAPP_VERIFY_TOKEN, META_APP_SECRET), no en la base.
-- ============================================================

CREATE TABLE IF NOT EXISTS wa_contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT NOT NULL UNIQUE,     -- E.164 sin '+', como lo entrega Meta
  nombre TEXT,                       -- profile.name del último webhook
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id UUID NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'abierta',   -- abierta | cerrada
  -- Ventana de 24h de Meta: solo se puede responder texto libre si el
  -- último mensaje ENTRANTE tiene menos de 24 horas.
  ultimo_entrante_at TIMESTAMPTZ,
  ultimo_mensaje_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  no_leidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_ultimo ON wa_conversaciones(ultimo_mensaje_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_contacto ON wa_conversaciones(contacto_id);

CREATE TABLE IF NOT EXISTS wa_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  direccion TEXT NOT NULL,           -- entrante | saliente
  contenido TEXT NOT NULL DEFAULT '',
  -- Id de Meta (wamid): dedup de webhooks reintentados y cruce de estados.
  wamid TEXT UNIQUE,
  estado TEXT,                       -- sent | delivered | read | failed
  error_codigo INTEGER,
  error_mensaje TEXT,
  media_tipo TEXT,                   -- image | video | audio | document | sticker
  media_id TEXT,                     -- id del medio en la API de Meta
  mime_type TEXT,
  nombre_archivo TEXT,
  enviado_por TEXT,                  -- email del usuario de Gestivo (salientes)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_msj_conv ON wa_mensajes(conversacion_id, timestamp);

-- Chats con PII: solo el servidor (service_role) los toca; en esta
-- instancia los GRANT a service_role no se heredan (ver docs/migraciones.md).
ALTER TABLE wa_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_mensajes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wa_contactos, wa_conversaciones, wa_mensajes FROM anon, public, authenticated;
GRANT ALL ON wa_contactos, wa_conversaciones, wa_mensajes TO service_role;
