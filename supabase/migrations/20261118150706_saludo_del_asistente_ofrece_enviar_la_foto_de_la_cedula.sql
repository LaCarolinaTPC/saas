-- Saludo del asistente: pide la foto de la cédula por ambos lados (o los datos)
--
-- Contexto: pedidos de Gestión Humana del 18-nov-2026. El RUNT necesita el
-- primer apellido para no abrir el registro de otra persona, y el RNMC (en
-- antecedentes) la fecha de expedición. Por eso, antes de la autorización, el
-- asistente junta la cédula, el primer apellido y la fecha de expedición: pide
-- primero la foto de la cédula por ambos lados (el asistente la lee) o que los
-- escriba, y si llega un solo lado pide el otro, para no tener que pedir nada
-- después. Con eso revisa la licencia de una vez. El código ya trae estos
-- textos por defecto; esto actualiza lo guardado en wa_agente, que es lo que
-- usa el asistente. Solo cambia lo que sigue igual al texto sugerido: si
-- Gestión Humana lo editó a mano, no se toca.
--
-- Va después de la migración 20261117214219. Se puede correr varias veces: la
-- segunda no encuentra los textos anteriores y no cambia nada.

-- Saludo: desde el de la migración 20261117214219.
UPDATE wa_agente
SET prompt = replace(
  prompt,
  'Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos.',
  'Para empezar, envíame una foto de tu cédula por ambos lados (frente y reverso). Si prefieres, escríbeme tu número de cédula, tu primer apellido y la fecha de expedición. Con eso revisamos enseguida tu licencia.'
)
WHERE id = 1
  AND prompt LIKE '%Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos.%';

-- Preguntas de requisitos: la cédula va con el primer apellido y la fecha de expedición.
UPDATE wa_agente
SET preguntas_requisitos = replace(
  preguntas_requisitos,
  E'Número de cédula y fecha de expedición\n',
  E'Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados)\n'
)
WHERE id = 1
  AND preguntas_requisitos LIKE E'Número de cédula y fecha de expedición\n%';
