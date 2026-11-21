-- Selección: nombre del asistente de IA configurable («Angie» por defecto)
--
-- Contexto: el nombre «Angie» estaba escrito en el prompt del agente y en el
-- texto de la bienvenida. Gestión Humana pidió poder cambiarlo desde Selección ›
-- Tiempos y reglas. El asistente se presenta con este nombre aunque el prompt
-- traiga otro, y los mensajes lo usan con la variable {asistente}.
--
-- La bienvenida cambia «Angie» por {asistente}, así que con el valor por
-- defecto sale igual que hoy. Si alguien ya había quitado «Angie» del texto,
-- no se toca. Idempotente.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES (
  'asistente_nombre', 'dato', 'Nombre del asistente de IA', 290,
  '"Angie"'::jsonb, '"Angie"'::jsonb, 'texto', 'Pedido de Gestión Humana del 19-nov-2026', 1
)
ON CONFLICT (clave) DO NOTHING;

UPDATE seleccion_mensajes
SET texto = replace(texto, 'Te saluda Angie,', 'Te saluda {asistente},'),
    texto_sugerido = replace(texto_sugerido, 'Te saluda Angie,', 'Te saluda {asistente},'),
    variables = CASE WHEN 'asistente' = ANY (variables) THEN variables ELSE array_append(variables, 'asistente') END,
    updated_at = now()
WHERE clave = 'bienvenida';
