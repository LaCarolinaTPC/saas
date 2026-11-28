-- IA por separado para chat, documentos y voz (21-nov-2026)
--
-- Contexto: la IA se configuraba en Comunicaciones › Agente IA (el chat) y en
-- Candidatos › Selección › Tiempos y reglas (los ajustes `lectura_modelo` y
-- `transcripcion_modelo`). La configuración pasa a Candidatos › IA, con un
-- proveedor y un modelo para cada uso, por si se quiere una IA distinta para
-- cada cosa. Por ahora: Haiku 5.5 para el chat y los documentos, y GPT-4o
-- mini Transcribe por OpenRouter para la voz (Claude no recibe audio).
--
-- Las claves no cambian: siguen en Configuración › Proveedores de IA. Si la de
-- Anthropic está guardada allí, Haiku va directo por Anthropic; si no, por
-- OpenRouter (anthropic/claude-haiku-5.5). La clave de entorno no se ve desde
-- SQL: en ese caso también queda OpenRouter, y se cambia en la pantalla.
--
-- Los ajustes `lectura_modelo` y `transcripcion_modelo` quedan sin uso (no se
-- borran, por si hay que volver atrás).
--
-- Idempotente: se puede correr más de una vez.

ALTER TABLE wa_agente
  ADD COLUMN IF NOT EXISTS documentos_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS documentos_modelo TEXT,
  ADD COLUMN IF NOT EXISTS voz_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS voz_modelo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_agente_documentos_proveedor_check') THEN
    ALTER TABLE wa_agente ADD CONSTRAINT wa_agente_documentos_proveedor_check
      CHECK (documentos_proveedor IS NULL OR documentos_proveedor IN ('anthropic', 'openai', 'openrouter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_agente_voz_proveedor_check') THEN
    ALTER TABLE wa_agente ADD CONSTRAINT wa_agente_voz_proveedor_check
      CHECK (voz_proveedor IS NULL OR voz_proveedor IN ('openai', 'openrouter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_agente_voz_modelo_check') THEN
    ALTER TABLE wa_agente ADD CONSTRAINT wa_agente_voz_modelo_check
      CHECK (voz_modelo IS NULL OR voz_modelo IN ('gpt4o_mini', 'whisper'));
  END IF;
END $$;

COMMENT ON COLUMN wa_agente.documentos_proveedor IS 'Proveedor que lee los documentos (hoja de vida, cartas, cédula, resultados del laboratorio). NULL: el del chat.';
COMMENT ON COLUMN wa_agente.documentos_modelo IS 'Modelo que lee los documentos, con el nombre del proveedor. NULL: Haiku 5.5 (o gpt-5-mini en OpenAI).';
COMMENT ON COLUMN wa_agente.voz_proveedor IS 'Proveedor que transcribe los audios: openrouter u openai. Si falla, se intenta con el otro.';
COMMENT ON COLUMN wa_agente.voz_modelo IS 'gpt4o_mini (GPT-4o mini Transcribe) o whisper (Whisper, más barato).';

-- Fila del agente, si todavía no existe (se crea con los valores por defecto).
INSERT INTO wa_agente (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Chat: Haiku 5.5 fijo (pedido del 21-nov-2026). Solo la primera vez que corre
-- la migración (documentos todavía sin configurar), para no deshacer después
-- lo que se elija en la pantalla.
UPDATE wa_agente SET
  proveedor = CASE
    WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'anthropic_api_key') THEN 'anthropic'
    ELSE 'openrouter' END,
  modelo = CASE
    WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'anthropic_api_key') THEN 'claude-haiku-5-5'
    ELSE 'anthropic/claude-haiku-5.5' END,
  openrouter_modo = 'manual',
  updated_at = now()
WHERE id = 1 AND documentos_proveedor IS NULL;

-- Documentos: el mismo Haiku. Voz: OpenRouter (u OpenAI si solo está esa clave),
-- con el modelo que ya tenía el ajuste `transcripcion_modelo`.
UPDATE wa_agente SET
  documentos_proveedor = proveedor,
  documentos_modelo = modelo
WHERE id = 1 AND documentos_proveedor IS NULL;

UPDATE wa_agente SET
  voz_proveedor = CASE
    WHEN NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'openrouter_api_key')
     AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'openai_api_key') THEN 'openai'
    ELSE 'openrouter' END,
  voz_modelo = COALESCE(
    (SELECT valor #>> '{}' FROM seleccion_ajustes WHERE clave = 'transcripcion_modelo' AND valor #>> '{}' IN ('gpt4o_mini', 'whisper')),
    'gpt4o_mini')
WHERE id = 1 AND voz_proveedor IS NULL;

-- Prompt sin nombre ni saludo (pedido del 21-nov-2026, para que no se repitan):
-- el nombre es el ajuste «Nombre del asistente» (Tiempos y reglas) y el saludo,
-- el mensaje «Bienvenida» (Mensajes); el asistente ya los recibe aparte y mandan
-- sobre el prompt. Solo cambia esos dos trozos si siguen como los dejó el prompt
-- sugerido; lo demás del prompt no se toca.
UPDATE wa_agente SET
  prompt = regexp_replace(
    replace(prompt, 'Eres Angie, la asistente de reclutamiento', 'Eres la asistente de reclutamiento'),
    '\s*Saludo\r?\nCuando la persona escribe por primera vez, salúdala así.*$',
    ''),
  updated_at = now()
WHERE id = 1
  AND (prompt LIKE 'Eres Angie, la asistente de reclutamiento%'
       OR prompt ~ 'Saludo\r?\nCuando la persona escribe por primera vez, salúdala así');
