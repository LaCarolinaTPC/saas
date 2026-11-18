-- Saludo del asistente: pide la cédula con el primer apellido, o la foto
--
-- Contexto: pedidos de Gestión Humana del 18-nov-2026. El RNMC (la consulta
-- que valida la fecha de expedición) se demora y a veces se cae, y el RUNT
-- necesita el primer apellido para no abrir el registro de otra persona. Por
-- eso el asistente ahora pide primero el número de cédula y el primer
-- apellido (o una foto de la cédula, que el asistente ya lee) y con eso revisa
-- la licencia de una vez. La fecha de expedición se pide después, cuando la
-- licencia cumple, y se usa en antecedentes. El código ya trae estos textos
-- por defecto; esto actualiza lo guardado en wa_agente, que es lo que usa el
-- asistente. Solo cambia lo que sigue igual al texto sugerido: si Gestión
-- Humana lo editó a mano, no se toca.
--
-- Va después de la migración 20261117214219. Se puede correr varias veces: la
-- segunda no encuentra los textos anteriores y no cambia nada.

-- Saludo: desde el de la migración 20261117214219.
UPDATE wa_agente
SET prompt = replace(
  prompt,
  'Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos.',
  'Para empezar, ¿me compartes tu número de cédula y tu primer apellido? Si prefieres, envíame una foto de tu cédula por ambos lados. Con eso revisamos enseguida tu licencia.'
)
WHERE id = 1
  AND prompt LIKE '%Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos.%';

-- Preguntas de requisitos: la cédula va con el primer apellido y la fecha de
-- expedición pasa a después de la fecha de nacimiento.
UPDATE wa_agente
SET preguntas_requisitos = replace(
  preguntas_requisitos,
  E'Número de cédula y fecha de expedición\nFecha de nacimiento (día, mes y año) o edad\n',
  E'Número de cédula y primer apellido (o la foto de la cédula por ambos lados)\nFecha de nacimiento (día, mes y año) o edad\nFecha de expedición de la cédula (cuando sepamos que su licencia cumple)\n'
)
WHERE id = 1
  AND preguntas_requisitos LIKE E'Número de cédula y fecha de expedición\nFecha de nacimiento (día, mes y año) o edad\n%';
