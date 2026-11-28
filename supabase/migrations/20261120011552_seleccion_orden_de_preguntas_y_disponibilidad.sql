-- Selección: orden de las preguntas del asistente y disponibilidad
--
-- Contexto: Gestión Humana fijó el orden (19-nov-2026): dónde vive (si vive en
-- otra ciudad, si se traslada y cuándo estaría en la ciudad), edad, la cédula
-- para revisar la licencia en el RUNT (la licencia ya no se pregunta: sale de
-- Croma), experiencia y desde cuándo puede empezar a trabajar. Los dos datos
-- nuevos se guardan en el proceso para que Gestión Humana los vea en la ficha.
--
-- La lista de preguntas guardada en el agente solo se cambia si sigue siendo
-- una de las sugeridas anteriores (si alguien la editó, no se toca).
-- Solo agrega columnas a una tabla que ya tiene sus GRANT. Idempotente.

ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS llegada_ciudad TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS disponibilidad TEXT;
COMMENT ON COLUMN procesos_contratacion.llegada_ciudad IS
  'Si vive en otra ciudad y se traslada: cuándo estaría en Barranquilla o Soledad, como lo dijo por WhatsApp.';
COMMENT ON COLUMN procesos_contratacion.disponibilidad IS
  'Desde cuándo puede empezar a trabajar, como lo dijo por WhatsApp.';

UPDATE wa_agente
SET preguntas_requisitos = $t$Ciudad donde vive (si no vive en Barranquilla o Soledad: si está dispuesto a trasladarse y cuándo estaría en la ciudad)
Fecha de nacimiento (día, mes y año) o edad
Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados), para revisar su licencia
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Desde cuándo podría empezar a trabajar$t$
WHERE replace(preguntas_requisitos, E'\r', '') IN (
  $t$Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados)
Fecha de nacimiento (día, mes y año) o edad
Ciudad donde vive (si no vive en Barranquilla o Soledad, si está dispuesto a trasladarse)
Categoría de la licencia de conducción
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo$t$,
  $t$Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados)
Fecha de nacimiento (día, mes y año) o edad
Ciudad donde vive (si no vive en Barranquilla o Soledad, si está dispuesto a trasladarse)
Categoría de la licencia de conducción
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Si ha trabajado antes en La Carolina$t$
);
