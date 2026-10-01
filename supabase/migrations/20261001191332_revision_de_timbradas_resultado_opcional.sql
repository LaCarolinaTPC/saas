-- Tesorería · Revisión cartulina: el resultado de la revisión pasa a ser opcional.
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Contexto: el check de revisado por viaje guarda la fila sin resultado (el
-- resultado y la nota se eligen solo cuando hay algo que explicar). La
-- migración 20261001182315 se aplicó en su primera versión, con
-- `resultado NOT NULL`, así que el check fallaba con "null value in column
-- resultado violates not-null constraint". Aquí solo se quita esa
-- obligación: la regla de valores permitidos ya acepta NULL (un CHECK con
-- NULL no falla), así que no hace falta tocarla.

ALTER TABLE tesoreria_revision_timbradas ALTER COLUMN resultado DROP NOT NULL;

-- Comprobación: es_nulable debe ser YES.
SELECT column_name, is_nullable AS es_nulable
FROM information_schema.columns
WHERE table_name = 'tesoreria_revision_timbradas' AND column_name = 'resultado';
