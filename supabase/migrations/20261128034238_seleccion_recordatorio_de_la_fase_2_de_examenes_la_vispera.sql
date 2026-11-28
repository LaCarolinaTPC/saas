-- seleccion recordatorio de la fase 2 de examenes la vispera
--
-- Contexto (27-nov-2026): la fase 2 de exámenes es en completo ayuno y las citas
-- del laboratorio no tenían recordatorio. Ahora, la tarde anterior a la cita
-- (desde la hora del ajuste, dentro del horario de WhatsApp), le llega
-- «recordatorio_examen_f2». No se envía si la citación salió hace menos de 6 h.
--
-- La plantilla de Meta (sel_recordatorio_examen_f2) hay que enviarla a
-- aprobación desde Selección › Mensajes: mientras no esté aprobada, el
-- recordatorio solo sale si el aspirante escribió en las últimas 24 horas (si
-- no, se reintenta en la siguiente corrida).
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables,
  plantilla_nombre, plantilla_variables, plantilla_botones, plantilla_categoria, plantilla_estado)
VALUES
  ('recordatorio_examen_f2', 'Recordatorio de la fase 2 de exámenes', 'La víspera de la cita, desde la hora del ajuste', 111,
   $t$Buenas tardes, señor(a) {nombre}.
Le recordamos que mañana tiene la segunda fase de exámenes médicos:
📍 Laboratorio: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
¡Importante! Debe asistir en completo ayuno.
¡Muchas gracias!$t$,
   $t$Buenas tardes, señor(a) {nombre}.
Le recordamos que mañana tiene la segunda fase de exámenes médicos:
📍 Laboratorio: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
¡Importante! Debe asistir en completo ayuno.
¡Muchas gracias!$t$,
   'automatico', ARRAY['nombre', 'laboratorio', 'fecha', 'hora'],
   'sel_recordatorio_examen_f2', ARRAY['nombre', 'laboratorio', 'fecha', 'hora'], ARRAY[]::text[], 'UTILITY', NULL)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('recordatorio_examen_f2_activo', 'regla', 'Recordar la fase 2 de exámenes la víspera', 121,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 3),
  ('recordatorio_examen_f2_hora', 'tiempo', 'Hora del recordatorio de la fase 2', 122,
   '"18:00"'::jsonb, '"18:00"'::jsonb, 'hora', 'Gestión Humana, 27-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, plantilla_nombre, plantilla_estado FROM seleccion_mensajes WHERE clave = 'recordatorio_examen_f2';
SELECT clave, valor FROM seleccion_ajustes WHERE clave LIKE 'recordatorio_examen_f2%';
