-- Selección: pregunta «¿vienes recomendado?» y candidatos apadrinados
--
-- Contexto: Gestión Humana quiere saber desde el primer mensaje si el
-- aspirante viene recomendado por alguien que trabaja en la empresa. Quien
-- responde que sí queda en Candidatos como «apadrinado» (una marca, no un
-- estado del embudo) para que Gestión Humana le asigne el padrino después en
-- el Plan Padrino. Hasta ahora el asistente respondía «dime quién te
-- recomendó» pero la respuesta no se guardaba en ninguna parte.
--
-- Para el Plan Padrino: la política v3 exige que el referido se registre antes
-- de que empiece la selección (R13). Como aquí el padrino se asigna después,
-- cuenta como fecha de registro el día en que el candidato dijo que venía
-- recomendado; por eso el registro guarda esa fecha aparte. No depende de la
-- versión de la política: en las que no tienen R13 la fecha no afecta nada.
--
-- La pregunta no necesita plantilla de Meta: responde al primer mensaje del
-- aspirante (ventana de 24 horas abierta) y sale con botones «Sí» y «No».
--
-- Solo agrega columnas a tablas que ya tienen sus GRANT. Idempotente.

-- ── 1. El candidato: si viene recomendado, cuándo lo dijo y por quién ─────────
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS recomendado BOOLEAN;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS recomendado_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS recomendado_por TEXT;
COMMENT ON COLUMN procesos_contratacion.recomendado IS
  'Viene recomendado por alguien de la empresa (apadrinado): lo dijo por WhatsApp o lo marcó Gestión Humana. NULL = no ha respondido.';
COMMENT ON COLUMN procesos_contratacion.recomendado_at IS
  'Cuándo dijo que venía recomendado. Cuenta como fecha de registro en el Plan Padrino (R13).';
COMMENT ON COLUMN procesos_contratacion.recomendado_por IS
  'Quién lo recomendó, como lo escribió. Pista para asignar el padrino; no se valida.';

CREATE INDEX IF NOT EXISTS idx_procesos_contratacion_recomendado
  ON procesos_contratacion (recomendado_at)
  WHERE recomendado;

-- ── 2. Plan Padrino: fecha que cuenta como registro del referido ──────────────
ALTER TABLE padrino_referidos ADD COLUMN IF NOT EXISTS registrado_el DATE;
COMMENT ON COLUMN padrino_referidos.registrado_el IS
  'Día que cuenta como registro para R13 cuando el candidato dijo antes por WhatsApp que venía recomendado. NULL = el día de created_at.';

-- ── 3. El saludo termina con la pregunta nueva ───────────────────────────────
-- Solo si el saludo conserva la pregunta de la ciudad sembrada el 19-nov-2026
-- (si alguien lo editó, no se toca: el asistente agrega la pregunta al final).
UPDATE seleccion_mensajes
SET texto = replace(
      replace(texto, E'\r', ''),
      $t$Para empezar: 📍 *¿en qué ciudad vives actualmente?* Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.$t$,
      $t$Para empezar: 🤝 *¿vienes recomendado por alguien que trabaja en Transportes La Carolina?*$t$
    ),
    updated_at = now()
WHERE clave = 'bienvenida'
  AND position($t$Para empezar: 📍 *¿en qué ciudad vives actualmente?* Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.$t$ IN replace(texto, E'\r', '')) > 0;

UPDATE seleccion_mensajes
SET texto_sugerido = replace(
      replace(texto_sugerido, E'\r', ''),
      $t$Para empezar: 📍 *¿en qué ciudad vives actualmente?* Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.$t$,
      $t$Para empezar: 🤝 *¿vienes recomendado por alguien que trabaja en Transportes La Carolina?*$t$
    )
WHERE clave = 'bienvenida'
  AND position($t$Para empezar: 📍 *¿en qué ciudad vives actualmente?*$t$ IN replace(texto_sugerido, E'\r', '')) > 0;

-- ── 4. La lista de preguntas del asistente empieza por la nueva ──────────────
-- Solo si sigue siendo la sugerida del 20-nov-2026 (si alguien la editó, no se toca).
UPDATE wa_agente
SET preguntas_requisitos = $t$Si viene recomendado por alguien que trabaja en la empresa (sí o no; si dice que sí, el nombre de quien lo recomendó)
Ciudad donde vive (si no vive en Barranquilla o Soledad: si está dispuesto a trasladarse y cuándo estaría en la ciudad)
Fecha de nacimiento (día, mes y año) o edad
Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados), para revisar su licencia
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Desde cuándo podría empezar a trabajar$t$
WHERE replace(preguntas_requisitos, E'\r', '') = $t$Ciudad donde vive (si no vive en Barranquilla o Soledad: si está dispuesto a trasladarse y cuándo estaría en la ciudad)
Fecha de nacimiento (día, mes y año) o edad
Número de cédula, primer apellido y fecha de expedición (o la foto de la cédula por ambos lados), para revisar su licencia
Cuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo
Desde cuándo podría empezar a trabajar$t$;
