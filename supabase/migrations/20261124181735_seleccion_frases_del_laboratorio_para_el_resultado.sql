-- Selección: frases con las que el laboratorio responde el resultado
--
-- Contexto: los resultados del laboratorio se leen con IA y quedan en «Avisos
-- del laboratorio» para que una persona los confirme. Gestión Humana acuerda
-- con cada laboratorio una frase fija para cada resultado (la de apto, por
-- defecto, «Sí, puede pasar a fase 2»): si la respuesta trae esa frase (o una
-- variante, según la IA) y se reconoce al aspirante, el resultado se registra
-- solo y pasa a la fase 2, sin esperar la confirmación. En la fase 1, otro
-- resultado es no apto salvo que diga «aplazado»
-- (src/lib/seleccion/laboratorio.ts, decidirResultado).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

ALTER TABLE seleccion_laboratorios ADD COLUMN IF NOT EXISTS frase_apto TEXT;
ALTER TABLE seleccion_laboratorios ADD COLUMN IF NOT EXISTS frase_no_apto TEXT;
ALTER TABLE seleccion_laboratorios ADD COLUMN IF NOT EXISTS frase_aplazado TEXT;

-- Respuesta de apto por defecto (Gestión Humana, 24-nov-2026). La IA reconoce
-- también sus variantes; en la fase 1, cualquier otro resultado es no apto
-- salvo que diga «aplazado».
ALTER TABLE seleccion_laboratorios ALTER COLUMN frase_apto SET DEFAULT 'Sí, puede pasar a fase 2';
UPDATE seleccion_laboratorios SET frase_apto = 'Sí, puede pasar a fase 2' WHERE frase_apto IS NULL OR btrim(frase_apto) = '';

COMMENT ON COLUMN seleccion_laboratorios.frase_apto IS 'Frase acordada con el laboratorio para «apto»: con ella el resultado se registra sin confirmación.';
COMMENT ON COLUMN seleccion_laboratorios.frase_no_apto IS 'Frase acordada para «no apto».';
COMMENT ON COLUMN seleccion_laboratorios.frase_aplazado IS 'Frase acordada para «aplazado».';

-- Si el aviso se registró solo por la frase (para el historial de avisos).
ALTER TABLE seleccion_avisos_laboratorio ADD COLUMN IF NOT EXISTS por_frase BOOLEAN NOT NULL DEFAULT false;

SELECT column_name FROM information_schema.columns
WHERE (table_name = 'seleccion_laboratorios' AND column_name LIKE 'frase_%')
   OR (table_name = 'seleccion_avisos_laboratorio' AND column_name = 'por_frase');
