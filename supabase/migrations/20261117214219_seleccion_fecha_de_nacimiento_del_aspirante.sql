-- seleccion fecha de nacimiento del aspirante
--
-- Contexto (pedido de Gestión Humana, 17-nov-2026): el asistente pedía el
-- nombre, la cédula y la edad, y la autorización de datos solo al final. Ahora:
--   * pide la cédula desde el primer mensaje y enseguida la autorización; el
--     aspirante queda como candidato apenas autoriza y se consulta el RUNT (y
--     el SIMIT) para saber cuanto antes si cumple la preselección;
--   * ya no pregunta el nombre: lo trae el RUNT de Croma (person.full_name);
--   * en lugar de la edad pide la fecha de nacimiento o, si la persona lo
--     prefiere, la edad; con la fecha, la edad se calcula.
-- Ninguna fuente de Croma devuelve la fecha de nacimiento por cédula, por eso
-- se le pregunta al aspirante.
--
-- El RNMC (medidas correctivas del Código de Policía) se consulta siempre con
-- la autorización, y Croma exige la fecha de expedición de la cédula: el
-- asistente la pide junto con la cédula (columna cedula_fecha_expedicion). El
-- resultado solo se guarda (verificaciones_externas); las reglas, en la E3.
--
-- Licencia según el RUNT: si está vencida se le pregunta si la va a renovar
-- (columna renovara_licencia); si no cumple, o tiene restricción por pérdida
-- auditiva, no queda preseleccionado; si exige lentes, debe traerlos a la prueba.
--
-- Además, el chat de prueba de la selección puede guardar el caso en
-- Candidatos (casilla «Guardar en Candidatos»): esos procesos quedan con
-- origen 'chat_prueba' para distinguirlos de los reales.
--
-- Requiere las migraciones 20261113205625 y 20261116215859.
-- Idempotente: se puede volver a ejecutar (en dev se aplicó una versión
-- anterior de este mismo archivo el 17-nov; ejecútelo de nuevo). Los textos
-- del agente solo se cambian si siguen siendo los sugeridos; si Gestión
-- Humana los editó, se dejan: las reglas fijas del código ya mandan sobre ellos.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.

ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
COMMENT ON COLUMN procesos_contratacion.fecha_nacimiento IS
  'Fecha de nacimiento que dio el aspirante por WhatsApp. La edad (columna edad) se calcula con ella.';

-- Fecha de expedición de la cédula, para consultar el RNMC.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS cedula_fecha_expedicion DATE;
COMMENT ON COLUMN procesos_contratacion.cedula_fecha_expedicion IS
  'Fecha de expedición de la cédula que dio el aspirante. La exige la consulta del RNMC (Croma).';

-- Licencia vencida en el RUNT: el asistente pregunta si la va a renovar. Si
-- dice que no, no queda preseleccionado; si dice que sí, sigue y Gestión
-- Humana lo revisa. NULL = no se ha hablado.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS renovara_licencia BOOLEAN;
COMMENT ON COLUMN procesos_contratacion.renovara_licencia IS
  'Si la licencia está vencida en el RUNT: true si dijo que la renueva, false si dijo que no. NULL = no se ha hablado.';

-- Origen de los procesos guardados desde el chat de prueba.
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_origen_chk;
ALTER TABLE procesos_contratacion
  ADD CONSTRAINT procesos_contratacion_origen_chk CHECK (origen IN ('manual', 'whatsapp_agente', 'webhook', 'chat_prueba'));

-- Preguntas sugeridas: sin «Nombre completo» y con la fecha de nacimiento o la edad.
ALTER TABLE wa_agente ALTER COLUMN preguntas_requisitos SET DEFAULT
  E'Número de cédula y fecha de expedición\nFecha de nacimiento (día, mes y año) o edad\nCiudad donde vive (si no vive en Barranquilla o Soledad, si está dispuesto a trasladarse)\nCategoría de la licencia de conducción\nCuánto tiempo lleva manejando como conductor (años o meses) y en qué tipo de vehículo\nSi ha trabajado antes en La Carolina';

-- Desde las preguntas de la migración del 16 de noviembre.
UPDATE wa_agente
SET preguntas_requisitos = replace(
  preguntas_requisitos,
  E'Nombre completo\nNúmero de cédula\nEdad\n',
  E'Número de cédula y fecha de expedición\nFecha de nacimiento (día, mes y año) o edad\n'
)
WHERE id = 1
  AND preguntas_requisitos LIKE E'Nombre completo\nNúmero de cédula\nEdad\n%';

-- Desde la versión anterior de esta migración (solo la fecha de nacimiento).
UPDATE wa_agente
SET preguntas_requisitos = replace(
  preguntas_requisitos,
  E'Fecha de nacimiento (día, mes y año)\n',
  E'Fecha de nacimiento (día, mes y año) o edad\n'
)
WHERE id = 1
  AND preguntas_requisitos LIKE E'%Fecha de nacimiento (día, mes y año)\n%';

-- La cédula se pide con su fecha de expedición (versiones anteriores de esta migración).
UPDATE wa_agente
SET preguntas_requisitos = replace(preguntas_requisitos, E'Número de cédula\n', E'Número de cédula y fecha de expedición\n')
WHERE id = 1
  AND preguntas_requisitos LIKE E'Número de cédula\n%';

-- Saludo del prompt: pide la cédula en lugar del nombre.
UPDATE wa_agente
SET prompt = replace(
  prompt,
  'Para empezar, cuéntame: ¿cómo te llamas y en qué ciudad vives?',
  'Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos.'
)
WHERE id = 1
  AND prompt LIKE '%Para empezar, cuéntame: ¿cómo te llamas y en qué ciudad vives?%';

-- Desde la versión anterior de esta migración (saludo sin la fecha de expedición).
UPDATE wa_agente
SET prompt = replace(
  prompt,
  'Para empezar, ¿me compartes tu número de cédula? Con ella revisamos enseguida si cumples los requisitos.',
  'Para empezar, ¿me compartes tu número de cédula y su fecha de expedición? Con ellos revisamos enseguida si cumples los requisitos.'
)
WHERE id = 1
  AND prompt LIKE '%Para empezar, ¿me compartes tu número de cédula? Con ella revisamos enseguida si cumples los requisitos.%';

-- Aviso al aspirante cuando sus antecedentes quedan para revisión de una persona
-- (mientras se definen las reglas de la selección automática). No menciona
-- antecedentes. Sin plantilla de Meta: con la ventana cerrada queda como borrador.
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado)
VALUES (
  'revision_antecedentes', 'Revisión por una persona', 'Los antecedentes traen un hallazgo', 125,
  'Gracias por tu paciencia. Una persona de Gestión Humana revisará tu proceso y se contactará contigo pronto. Mantente atento a tu teléfono.',
  'Gracias por tu paciencia. Una persona de Gestión Humana revisará tu proceso y se contactará contigo pronto. Mantente atento a tu teléfono.',
  'automatico', ARRAY[]::TEXT[], NULL, ARRAY[]::TEXT[], NULL, NULL
)
ON CONFLICT (clave) DO NOTHING;

-- Aviso cuando el proceso se cierra por antecedentes: no dice el motivo.
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado)
VALUES (
  'no_seleccionado', 'No continúa en el proceso', 'El proceso se cierra por antecedentes', 126,
  'Gracias por tu interés y por el tiempo que dedicaste a tu proceso. Te informamos que en esta ocasión no continúas en el proceso de selección. Te deseamos muchos éxitos.',
  'Gracias por tu interés y por el tiempo que dedicaste a tu proceso. Te informamos que en esta ocasión no continúas en el proceso de selección. Te deseamos muchos éxitos.',
  'automatico', ARRAY[]::TEXT[], NULL, ARRAY[]::TEXT[], NULL, NULL
)
ON CONFLICT (clave) DO NOTHING;

-- Lectura automática de la foto de la cédula que manda el aspirante: el
-- asistente la ve y pide confirmar los datos en vez de preguntarlos.
ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS lectura JSONB;
COMMENT ON COLUMN wa_mensajes.lectura IS
  'Lectura automática de la foto (cédula) con el modelo del asistente: resumen, datos leídos, modelo y fecha. NULL = no se ha leído.';
