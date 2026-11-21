-- Selección: modelo con el que se transcriben los audios de los aspirantes
--
-- Contexto: la entrega 4 transcribía solo con la clave de OpenAI, que no está
-- configurada. Desde el 21-nov-2026 la transcripción va primero por
-- OpenRouter (la misma clave del asistente) y usa la de OpenAI solo si existe
-- y OpenRouter falla. Este ajuste elige el modelo:
--   gpt4o_mini → openai/gpt-4o-mini-transcribe (mejor con ruido y palabras locales)
--   whisper    → openai/whisper-large-v3-turbo (unas quince veces más barato)
--
-- Requiere la migración de la entrega 4 (20261121030237). Idempotente.
-- Esta instancia es autoalojada: ejecute el script entero en el SQL Editor.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('transcripcion_modelo', 'regla', 'Modelo con el que se transcriben los audios', 343,
   '"gpt4o_mini"'::jsonb, '"gpt4o_mini"'::jsonb, 'opcion', 'Requerimiento A6', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave IN ('transcribir_audios', 'transcripcion_modelo');
