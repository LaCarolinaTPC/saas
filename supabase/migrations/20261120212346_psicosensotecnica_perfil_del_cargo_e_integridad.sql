-- Prueba psicosensotécnica: perfil del cargo e integridad
--
-- Contexto: Gestión Humana evaluaba a los conductores con dos pruebas
-- comerciales de un proveedor externo (un perfil de personalidad con
-- competencias y riesgos, y una prueba de valores), que se pagan por
-- aplicación y no tienen integración con Gestivo. Se agregan a la batería dos
-- pruebas propias que cumplen esa labor, con preguntas de redacción propia
-- sobre constructos de dominio público (IPIP):
--   * «perfil»: cuatro rasgos, competencias y riesgos comparados con el perfil
--     esperado del cargo (configurable), más una escala de simulación;
--   * «integridad»: rectitud, honra y confidencialidad, con sinceridad.
-- Las dos entregan, además de las métricas, un informe con el ajuste, las
-- respuestas a revisar y preguntas para la entrevista: va en `informe`.
--
-- Requiere 20261120170136 (módulo de la prueba psicosensotécnica).
-- Idempotente: se puede volver a ejecutar. Esta instancia de Supabase es
-- autoalojada: ejecute el script entero en el SQL Editor.

ALTER TABLE psico_intento_pruebas DROP CONSTRAINT IF EXISTS psico_intento_pruebas_prueba_check;
ALTER TABLE psico_intento_pruebas ADD CONSTRAINT psico_intento_pruebas_prueba_check
  CHECK (prueba IN ('reaccion', 'atencion', 'anticipacion', 'cuestionario', 'personalidad', 'perfil', 'integridad'));

ALTER TABLE psico_intento_pruebas ADD COLUMN IF NOT EXISTS informe JSONB;
COMMENT ON COLUMN psico_intento_pruebas.informe IS
  'Perfil del cargo e integridad: ajuste (0-100), banda, rasgo predominante, respuestas a revisar y preguntas para la entrevista.';

SELECT count(*) FILTER (WHERE column_name = 'informe') AS columna_informe
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'psico_intento_pruebas';
