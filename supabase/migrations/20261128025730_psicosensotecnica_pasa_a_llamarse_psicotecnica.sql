-- psicosensotecnica pasa a llamarse psicotecnica
--
-- Contexto (27-nov-2026, pedido del usuario): la prueba que Gestión Humana
-- inscribe en PsicoAlianza se llama «psicotécnica», no «psicosensotécnica».
-- El código ya usa el nombre nuevo; aquí se cambian los textos guardados en la
-- base: los mensajes del asistente (texto y sugerido), sus nombres, los
-- ajustes de Selección y el prompt del agente, si lo menciona.
--
-- No se toca `plantilla_texto_aprobado`: es lo que Meta aprobó y se sigue
-- enviando fuera de la ventana de 24 h hasta que Meta apruebe la versión nueva
-- (Selección › Mensajes › enviar la versión nueva a Meta).
-- Idempotente: se puede volver a ejecutar.

CREATE OR REPLACE FUNCTION pg_temp.psico(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $f$
  SELECT replace(replace(replace(replace(replace(replace(t,
    'Psicosensotécnicas', 'Psicotécnicas'),
    'psicosensotécnicas', 'psicotécnicas'),
    'Psicosensotécnica', 'Psicotécnica'),
    'psicosensotécnica', 'psicotécnica'),
    'PSICOSENSOTÉCNICA', 'PSICOTÉCNICA'),
    'psicosensotecnica', 'psicotecnica')
$f$;

UPDATE seleccion_mensajes
SET texto = pg_temp.psico(texto),
    texto_sugerido = pg_temp.psico(texto_sugerido),
    nombre = pg_temp.psico(nombre),
    cuando = pg_temp.psico(cuando)
WHERE texto ILIKE '%psicosensot%' OR texto_sugerido ILIKE '%psicosensot%' OR nombre ILIKE '%psicosensot%' OR cuando ILIKE '%psicosensot%';

UPDATE seleccion_ajustes
SET nombre = pg_temp.psico(nombre)
WHERE nombre ILIKE '%psicosensot%';

-- El prompt del asistente (si alguien lo escribió con el nombre viejo).
UPDATE wa_agente
SET prompt = pg_temp.psico(prompt)
WHERE prompt ILIKE '%psicosensot%';

COMMENT ON COLUMN procesos_contratacion.correo IS 'Correo del aspirante para la plataforma de la prueba psicotécnica.';

-- Debe quedar en cero.
SELECT 'seleccion_mensajes' AS tabla, count(*) AS con_nombre_viejo FROM seleccion_mensajes
  WHERE texto ILIKE '%psicosensot%' OR texto_sugerido ILIKE '%psicosensot%' OR nombre ILIKE '%psicosensot%'
UNION ALL
SELECT 'seleccion_ajustes', count(*) FROM seleccion_ajustes WHERE nombre ILIKE '%psicosensot%'
UNION ALL
SELECT 'wa_agente', count(*) FROM wa_agente WHERE prompt ILIKE '%psicosensot%';
