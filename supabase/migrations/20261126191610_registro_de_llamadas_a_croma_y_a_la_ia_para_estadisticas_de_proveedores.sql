-- Registro de cada llamada a Croma y a la IA, para las estadísticas de proveedores
--
-- Contexto: el 26-nov-2026 el RNMC de Croma dejó de responder mientras las demás
-- fuentes funcionaban, y no había cómo ver con datos qué tan seguido falla cada
-- proveedor ni cuánto tarda, para decidir si conviene cambiarlo.
-- verificaciones_externas guarda solo el resultado final de cada consulta (sin
-- tiempo de respuesta ni reintentos) y wa_agente_ejecuciones solo el chat del
-- asistente. Aquí queda cada llamada: a qué servicio y fuente, si respondió,
-- cuánto tardó y el error. Lo lee Candidatos › Indicadores › Proveedores.
-- Escribir aquí nunca detiene la operación: sin esta tabla no se registra.
--
-- Tabla nueva: necesita su GRANT a service_role. Idempotente.

CREATE TABLE IF NOT EXISTS servicios_llamadas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- croma | ia
  servicio     TEXT NOT NULL,
  -- croma, anthropic, openai, openrouter…
  proveedor    TEXT NOT NULL,
  -- Croma: rnmc, policia, procuraduria, contraloria, simit, runt, adres, trabajo.
  -- IA: chat, documentos, voz.
  fuente       TEXT NOT NULL,
  modelo       TEXT,
  ok           BOOLEAN NOT NULL,
  -- Código HTTP, si lo hubo (sin él: se cortó por tiempo o no hubo conexión).
  status       INTEGER,
  duracion_ms  INTEGER,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicios_llamadas_fecha ON servicios_llamadas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_servicios_llamadas_fuente ON servicios_llamadas (servicio, proveedor, fuente, created_at DESC);

ALTER TABLE servicios_llamadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON servicios_llamadas FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE servicios_llamadas TO service_role;
COMMENT ON TABLE servicios_llamadas IS
  'Cada llamada a Croma y a la IA: servicio, proveedor, fuente, si respondió, cuánto tardó y el error. Para las estadísticas de proveedores.';
