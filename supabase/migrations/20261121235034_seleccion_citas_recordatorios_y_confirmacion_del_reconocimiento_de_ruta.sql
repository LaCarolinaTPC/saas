-- Citas, recordatorio y confirmación del reconocimiento de ruta (21-nov-2026)
--
-- Contexto: Gestión Humana pidió que el reconocimiento de ruta funcione como
-- la prueba de manejo. Al pasar la fase 2 de exámenes se cita la primera
-- salida (siguiente día hábil en que el profesor puede, a la hora del ajuste
-- `reconocimiento_hora`); después de cada salida que no completa las rutas se
-- cita la siguiente, hasta que las aprenda. Cada salida se recuerda el día de
-- la cita, se confirma con los botones «Sí, voy» / «Necesito otra fecha», el
-- profesor marca si llegó y, si no llega, queda el aviso de inasistencia como
-- borrador (con las mismas reprogramaciones permitidas que la prueba).
--
-- Los mensajes que pueden salir fuera de la ventana de 24 horas necesitan su
-- plantilla de Meta (se envían a aprobación desde Selección › Mensajes).
-- Ninguna plantilla termina ni empieza en una variable (Meta lo rechaza).
--
-- Idempotente: se puede correr más de una vez; no pisa textos editados.

-- 1. Tipo de cita nuevo.
ALTER TABLE seleccion_citas DROP CONSTRAINT IF EXISTS seleccion_citas_tipo_check;
ALTER TABLE seleccion_citas ADD CONSTRAINT seleccion_citas_tipo_check
  CHECK (tipo IN ('prueba_manejo', 'examen_f1', 'examen_f2', 'psicotecnica', 'reconocimiento'));

-- 2. Hora de las salidas.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('reconocimiento_hora', 'tiempo', 'Hora de cada salida de reconocimiento de ruta', 125, '"09:00"'::jsonb, '"09:00"'::jsonb, 'hora', 'Gestión Humana, 21-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;

-- 3. Mensaje de la primera salida: ahora con el día y la hora, y botones para confirmar.
--    Solo si sigue con el texto que sembró la migración 20261121231903.
UPDATE seleccion_mensajes
SET texto = $t$¡Felicitaciones, {nombre}! 🎉 Tus exámenes médicos salieron aptos. Sigue el reconocimiento de ruta: vas a salir con nuestro profesor a aprender {rutas} rutas.
Te esperamos el *{fecha} a las {hora}*.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
¿Nos confirmas que vienes?$t$,
    variables = ARRAY['nombre', 'rutas', 'fecha', 'hora', 'direccion', 'contacto'],
    plantilla_variables = ARRAY['nombre', 'rutas', 'fecha', 'hora', 'direccion', 'contacto'],
    plantilla_botones = ARRAY['Sí, voy', 'Necesito otra fecha'],
    updated_at = now()
WHERE clave = 'reconocimiento_ruta'
  AND texto = $t$¡Felicitaciones, {nombre}! 🎉 Tus exámenes médicos salieron aptos. El siguiente paso es el reconocimiento de ruta: vas a salir con nuestro profesor a aprender {rutas} rutas. Acércate a {direccion} y pregunta por {contacto}.$t$;
UPDATE seleccion_mensajes
SET texto_sugerido = $t$¡Felicitaciones, {nombre}! 🎉 Tus exámenes médicos salieron aptos. Sigue el reconocimiento de ruta: vas a salir con nuestro profesor a aprender {rutas} rutas.
Te esperamos el *{fecha} a las {hora}*.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
¿Nos confirmas que vienes?$t$,
    cuando = 'Se registra la fase 2 de exámenes como apta: lo cita a la primera salida'
WHERE clave = 'reconocimiento_ruta';

-- 4. Mensajes nuevos.
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_botones, plantilla_categoria, plantilla_estado)
VALUES
(
  'reconocimiento_siguiente', 'Siguiente salida de reconocimiento', 'Se registra una salida y todavía le faltan rutas: lo cita a la siguiente', 108,
  $t$Hola, {nombre}. Llevas {aprendidas} de {rutas} rutas aprendidas en el reconocimiento de ruta 💪
Tu siguiente salida es el *{fecha} a las {hora}*.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
¿Nos confirmas que vienes?$t$,
  $t$Hola, {nombre}. Llevas {aprendidas} de {rutas} rutas aprendidas en el reconocimiento de ruta 💪
Tu siguiente salida es el *{fecha} a las {hora}*.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
¿Nos confirmas que vienes?$t$,
  'automatico', ARRAY['nombre', 'aprendidas', 'rutas', 'fecha', 'hora', 'direccion', 'contacto'],
  'sel_reconocimiento_siguiente', ARRAY['nombre', 'aprendidas', 'rutas', 'fecha', 'hora', 'direccion', 'contacto'], ARRAY['Sí, voy', 'Necesito otra fecha'], 'UTILITY', NULL
),
(
  'recordatorio_reconocimiento', 'Recordatorio del reconocimiento de ruta', 'El día de la salida, a la hora del recordatorio de las citas', 109,
  $t$Buenos días, {nombre}. *Te esperamos hoy a las {hora}* para tu reconocimiento de ruta 🚌
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
Confirma tu asistencia por este chat.$t$,
  $t$Buenos días, {nombre}. *Te esperamos hoy a las {hora}* para tu reconocimiento de ruta 🚌
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
Confirma tu asistencia por este chat.$t$,
  'automatico', ARRAY['nombre', 'hora', 'direccion', 'contacto'],
  'sel_recordatorio_reconocimiento', ARRAY['nombre', 'hora', 'direccion', 'contacto'], ARRAY['Sí, voy', 'Necesito otra fecha'], 'UTILITY', NULL
),
(
  'inasistencia_reconocimiento', 'Inasistencia al reconocimiento de ruta', 'No llegó a la salida (lo marca el profesor o solo, pasada la tolerancia)', 110,
  $t$Hola, {nombre}. Te esperábamos hoy a las {hora} para el reconocimiento de ruta. ¿Quieres que lo reprogramemos para el próximo día hábil?$t$,
  $t$Hola, {nombre}. Te esperábamos hoy a las {hora} para el reconocimiento de ruta. ¿Quieres que lo reprogramemos para el próximo día hábil?$t$,
  'revisar', ARRAY['nombre', 'hora'],
  'sel_inasistencia_reconocimiento', ARRAY['nombre', 'hora'], ARRAY['Sí, reprogramar', 'Ya no me interesa'], 'UTILITY', NULL
),
(
  'reconocimiento_reprogramado', 'Reconocimiento de ruta reprogramado', 'Una persona mueve la salida de reconocimiento a otro día u hora', 111,
  $t$Listo, {nombre}. Tu reconocimiento de ruta quedó para el *{fecha} a las {hora}*.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
¿Nos confirmas que vienes?$t$,
  $t$Listo, {nombre}. Tu reconocimiento de ruta quedó para el *{fecha} a las {hora}*.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
¿Nos confirmas que vienes?$t$,
  'revisar', ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto'],
  'sel_reconocimiento_reprogramado', ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto'], ARRAY['Sí, voy', 'Necesito otra fecha'], 'UTILITY', NULL
)
ON CONFLICT (clave) DO NOTHING;
