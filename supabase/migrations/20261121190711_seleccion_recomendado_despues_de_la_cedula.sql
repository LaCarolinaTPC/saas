-- Selección: «¿vienes recomendado?» pasa a después de la cédula
--
-- Contexto: la migración 20261121181420 puso la pregunta al final del saludo,
-- como primera pregunta. En las pruebas con el modelo real eso chocaba con los
-- mensajes que no son de aspirantes (un número equivocado, alguien que pregunta
-- por un proceso ya hecho): el saludo se copiaba igual y terminaba preguntando
-- si venía recomendado. El mismo día el usuario pidió hacerla después del
-- saludo y de la cédula: a esa altura ya es claramente un aspirante. Va antes
-- de la autorización, así que el «sí» sigue siendo anterior al proceso (la
-- fecha que cuenta para R13 del Plan Padrino no cambia).
--
-- Esta migración deshace solo los textos de la anterior; las columnas se quedan.
-- Cambia el saludo y la lista de preguntas solo si siguen como los dejó la
-- 20261121181420 (si alguien los editó, no se tocan). Idempotente; si la
-- anterior no se aplicó todavía, no hace nada.

-- ── 1. El saludo vuelve a terminar con la pregunta de la ciudad ──────────────
UPDATE seleccion_mensajes
SET texto = replace(
      replace(texto, E'\r', ''),
      $t$Para empezar: 🤝 *¿vienes recomendado por alguien que trabaja en Transportes La Carolina?*$t$,
      $t$Para empezar: 📍 *¿en qué ciudad vives actualmente?* Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.$t$
    ),
    updated_at = now()
WHERE clave = 'bienvenida'
  AND position($t$Para empezar: 🤝 *¿vienes recomendado por alguien que trabaja en Transportes La Carolina?*$t$ IN replace(texto, E'\r', '')) > 0;

UPDATE seleccion_mensajes
SET texto_sugerido = replace(
      replace(texto_sugerido, E'\r', ''),
      $t$Para empezar: 🤝 *¿vienes recomendado por alguien que trabaja en Transportes La Carolina?*$t$,
      $t$Para empezar: 📍 *¿en qué ciudad vives actualmente?* Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.$t$
    )
WHERE clave = 'bienvenida'
  AND position($t$Para empezar: 🤝 *¿vienes recomendado por alguien que trabaja en Transportes La Carolina?*$t$ IN replace(texto_sugerido, E'\r', '')) > 0;

-- ── 2. En la lista de preguntas del asistente, después de la cédula ──────────
-- Solo si sigue como la dejó la 20261121181420, o como la sugerida del 20-nov-2026.
UPDATE wa_agente
SET preguntas_requisitos = $t$Ciudad donde vive (si no vive en Barranquilla o Soledad: si está dispuesto a trasladarse y cuándo estaría en la ciudad)
Fecha de nacimiento (día, mes y año) o edad
Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados), para revisar su licencia
Si viene recomendado por alguien que trabaja en la empresa (sí o no; si dice que sí, más adelante el nombre de quien lo recomendó)
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Desde cuándo podría empezar a trabajar$t$
WHERE replace(preguntas_requisitos, E'\r', '') IN (
  $t$Si viene recomendado por alguien que trabaja en la empresa (sí o no; si dice que sí, el nombre de quien lo recomendó)
Ciudad donde vive (si no vive en Barranquilla o Soledad: si está dispuesto a trasladarse y cuándo estaría en la ciudad)
Fecha de nacimiento (día, mes y año) o edad
Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados), para revisar su licencia
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Desde cuándo podría empezar a trabajar$t$,
  $t$Ciudad donde vive (si no vive en Barranquilla o Soledad: si está dispuesto a trasladarse y cuándo estaría en la ciudad)
Fecha de nacimiento (día, mes y año) o edad
Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados), para revisar su licencia
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Desde cuándo podría empezar a trabajar$t$
);
