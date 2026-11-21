-- seleccion licencia verificada en el RUNT con Croma
--
-- Contexto: el asistente preguntaba la fecha de vencimiento de la licencia y
-- Gestión Humana marcaba a mano «licencia verificada en el RUNT». La consulta
-- RUNT de personas de Croma (/co/runt/citizen-by-document/v1) trae cada
-- licencia con sus categorías y la fecha de vencimiento de cada una, así que
-- con la autorización de datos el sistema verifica la licencia solo: si no
-- tiene, está vencida o no es de la categoría, el semáforo queda en rojo
-- enseguida y el asistente se lo dice al aspirante; ya no hace falta preguntar
-- la vigencia.
--
-- Requiere la migración 20261113205625 (seleccion_ajustes, verificaciones_externas).
-- Idempotente: IF NOT EXISTS, ON CONFLICT DO NOTHING y el texto del agente
-- solo se cambia si sigue siendo el de la migración del 10 de noviembre.

-- Resumen del RUNT que usa el semáforo: { tieneLicencia, categorias: [{ categoria, vence, activa }], consultadoEl }.
-- NULL = no se ha consultado. La consulta completa queda en verificaciones_externas (fuente 'runt').
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS licencia_runt JSONB;
COMMENT ON COLUMN procesos_contratacion.licencia_runt IS
  'Licencia según el RUNT (Croma), ya leída para el semáforo. NULL = no consultada. Al llenarse, licencia_verificada_runt pasa a true.';

-- Meses de vigencia que le deben quedar a la licencia. 0 = basta con que no esté vencida.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES (
  'licencia_vigencia_minima_meses', 'regla', 'Meses de vigencia que le deben quedar a la licencia (RUNT; 0 = que no esté vencida)',
  235, '0'::jsonb, '0'::jsonb, 'numero', 'Propuesta: la vigencia se consulta en el RUNT', 1
)
ON CONFLICT (clave) DO NOTHING;

-- El asistente ya no pregunta la fecha de vencimiento: la trae el RUNT.
UPDATE wa_agente
SET preguntas_requisitos = replace(
  preguntas_requisitos,
  'Categoría de la licencia de conducción y fecha de vencimiento',
  'Categoría de la licencia de conducción'
)
WHERE id = 1
  AND preguntas_requisitos LIKE '%Categoría de la licencia de conducción y fecha de vencimiento%';
