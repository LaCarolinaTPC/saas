-- Selección: guion de Gestión Humana («Saludo inicial», 19-nov-2026)
--
-- Contexto: Gestión Humana compartió el guion con el que atiende a mano a los
-- aspirantes (saludo, salario, vehículos, otra ciudad, licencia que no sirve,
-- desistimientos, documentación recibida, cita, confirmación, no seleccionado)
-- y los tres recordatorios para quien deja de responder. Decisiones del 19-nov:
-- tuteo en todo; la conversación empieza preguntando la ciudad (después la
-- cédula); la licencia debe tener al menos 6 meses de vigencia; el asistente
-- sigue siendo Angie, de Transportes La Carolina, para conductor de busetas.
-- Todo queda editable en Selección › Mensajes y Selección › Tiempos y reglas.
--
-- También agrega a seleccion_mensajes las columnas de la versión propuesta y
-- de los botones: la migración de la entrega 1 las tenía en su CREATE TABLE,
-- pero se agregaron después de aplicarla y no existían en la base, así que
-- «Enviar versión nueva a Meta» fallaba.
--
-- Plantillas enviadas a Meta el 19-nov-2026 (en revisión): sel_citacion_v2,
-- sel_recordatorio_cita_v2 y sel_no_seleccionado. Mientras Meta no aprueba
-- las v2, fuera de la ventana de 24 h siguen saliendo las aprobadas.
--
-- Los textos solo se cambian si nadie los había editado (texto igual al
-- sugerido). Idempotente.

-- ── 1. Columnas que faltaban (versión propuesta y botones) ───────────────────
ALTER TABLE seleccion_mensajes ADD COLUMN IF NOT EXISTS plantilla_botones TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE seleccion_mensajes ADD COLUMN IF NOT EXISTS plantilla_propuesta_nombre TEXT;
ALTER TABLE seleccion_mensajes ADD COLUMN IF NOT EXISTS plantilla_propuesta_texto TEXT;
ALTER TABLE seleccion_mensajes ADD COLUMN IF NOT EXISTS plantilla_propuesta_estado TEXT;
ALTER TABLE seleccion_mensajes ADD COLUMN IF NOT EXISTS plantilla_propuesta_variables TEXT[];
COMMENT ON COLUMN seleccion_mensajes.plantilla_propuesta_variables IS
  'Variables de la versión propuesta en el orden de {{1}}, {{2}}…; al aprobarse pasan a plantilla_variables.';

-- Botones de respuesta rápida, tal como se enviaron a Meta el 13-nov-2026.
UPDATE seleccion_mensajes m SET plantilla_botones = v.botones
FROM (VALUES
  ('reactivacion_1', ARRAY['Sí, sigo interesado', 'Ya no me interesa']),
  ('reactivacion_2', ARRAY['Quiero continuar']),
  ('citacion', ARRAY['Sí, voy', 'Necesito otra fecha']),
  ('recordatorio_cita', ARRAY['Sí, voy', 'Necesito otra fecha']),
  ('inasistencia', ARRAY['Sí, reprogramar', 'Ya no me interesa']),
  ('examenes_fase1', ARRAY['Ahí estaré']),
  ('autorizacion_datos', ARRAY['Sí, autorizo', 'No autorizo']),
  ('recordatorio_psicotecnica', ARRAY['Sí, voy', 'Necesito otra fecha'])
) AS v(clave, botones)
WHERE m.clave = v.clave AND m.plantilla_botones = '{}';

-- ── 2. Ajustes ────────────────────────────────────────────────────────────────
-- La licencia debe tener al menos 6 meses de vigencia (guion de GH).
UPDATE seleccion_ajustes
SET valor = CASE WHEN valor = '0'::jsonb THEN '6'::jsonb ELSE valor END,
    valor_sugerido = '6'::jsonb,
    origen = 'Guion de Gestión Humana del 19-nov-2026'
WHERE clave = 'licencia_vigencia_minima_meses';

-- Persona por la que pregunta en la cita, y la dirección de la sede si no estaba.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('contacto_cita', 'dato', 'Persona por la que pregunta en la cita', 305, '"Yisseth"'::jsonb, '"Yisseth"'::jsonb, 'texto',
        'Guion de Gestión Humana del 19-nov-2026', 2)
ON CONFLICT (clave) DO NOTHING;

UPDATE seleccion_ajustes
SET valor = '"Carrera 14 #54-110, Soledad"'::jsonb
WHERE clave = 'direccion_sede' AND valor = '""'::jsonb;

-- ── 3. Recordatorios a quien deja de responder: uno distinto cada vez ─────────
ALTER TABLE wa_seguimiento ADD COLUMN IF NOT EXISTS mensajes_siguientes TEXT[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN wa_seguimiento.mensajes_siguientes IS
  'Textos del 2.º recordatorio en adelante (el 1.º es mensaje). Si hay más recordatorios que textos, se repite el último.';

UPDATE wa_seguimiento
SET mensaje = $t$¡Hola nuevamente! 👋
No queremos que pierdas la oportunidad de conocer lo que Transportes La Carolina tiene para ti.
Estamos interesados en conocer tu perfil y avanzar contigo en nuestro proceso de selección.
Si aún estás interesado, ¡respóndenos por este medio! Queremos saber de ti.$t$
WHERE mensaje = 'Hola {nombre}, ¿sigues interesado en el proceso de selección de La Carolina? Respóndenos para continuar.';

UPDATE wa_seguimiento
SET mensajes_siguientes = ARRAY[
$t$¡Tenemos grandes beneficios para ti y tu familia!
Al vincularte con Transportes La Carolina podrás disfrutar de:
🚘 Formación continua en nuestra Escuela de Conducción.
🏠 Apoyo para alcanzar el sueño de tener vivienda propia.
🗓️ Descansos programados.
💰 Facilidades para préstamos.
🎓 Convenios universitarios para ti y tu familia.
👨‍👩‍👧‍👦 Actividades de integración familiar.
¡Más que un empleo, queremos ofrecerte oportunidades para crecer!
¿Te animas a continuar con tu postulación?$t$,
$t$🚍 ¡Esta oportunidad puede ser el comienzo de una nueva experiencia para ti!
En Transportes La Carolina queremos brindarte la oportunidad de crecer laboral y personalmente, con beneficios pensados también en tu bienestar y el de tu familia.
No dejes pasar la oportunidad de conocer todo lo que tenemos para ofrecerte. ¡Dar el primer paso está en tus manos!
¿Qué esperas para postularte? Responde a este mensaje y te guiaremos para continuar con tu proceso de selección.$t$
]
WHERE mensajes_siguientes = '{}';

-- ── 4. Textos del catálogo que cambian ───────────────────────────────────────
-- Tabla temporal de la sesión (el editor puede no envolver todo en una transacción).
DROP TABLE IF EXISTS pg_temp.guion_gh;
CREATE TEMP TABLE guion_gh (clave TEXT PRIMARY KEY, texto TEXT NOT NULL, variables TEXT[] NOT NULL);
INSERT INTO guion_gh VALUES
('bienvenida', $t$¡Hola! 👋 Te saluda {asistente}, del área de Reclutamiento de Transportes La Carolina.
Gracias por tu interés en nuestra vacante de *conductor de busetas*.
🔹 *Requisitos:*
📄 Licencia C2 o C3 con al menos 6 meses de vigencia
👤 Tener entre 20 y 57 años
📍 Vivir en Barranquilla o Soledad, o poder trasladarte
🚛 Al menos 6 meses de experiencia manejando buses urbanos, escolares, camiones o transporte intermunicipal
✨ ¿No tienes experiencia en transporte urbano? ¡No te preocupes! Nosotros te capacitamos 💼
Para empezar: 📍 *¿en qué ciudad vives actualmente?* Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.$t$,
 ARRAY['nombre', 'asistente']),
('salario_horario', $t$El salario del conductor se maneja por producción: el ingreso depende de la operación y del trabajo realizado. Los detalles de salario, horarios, jornada y demás condiciones te los explicamos completos en la inducción y durante el proceso de selección. Si te interesa, con gusto seguimos con tu proceso para que conozcas toda la información.$t$,
 ARRAY[]::TEXT[]),
('citacion', $t$Hola, {nombre}. Pasaste la primera revisión de tu proceso como conductor 🙌
Te esperamos el *{fecha} a las {hora}* en La Carolina para la prueba de manejo.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
📄 *Importante:* trae tu hoja de vida impresa y zapatos cerrados; si tu licencia exige lentes, tráelos.
Durante la cita conocerás cómo acceder a beneficios como formación continua en nuestra Escuela de Conducción, apoyo para tener vivienda propia, descansos programados, facilidades para préstamos, convenios universitarios para ti y tu familia, y actividades de integración familiar.
¿Nos confirmas que vienes?$t$,
 ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto']),
('cita_reprogramada', $t$Listo, {nombre}. Te esperamos el *{fecha} a las {hora}* en La Carolina para la prueba de manejo.
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
📄 *Importante:* trae tu hoja de vida impresa y zapatos cerrados; si tu licencia exige lentes, tráelos.$t$,
 ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto']),
('recordatorio_cita', $t$Buenos días, {nombre}. *Te esperamos hoy a las {hora} en La Carolina* para tu prueba de manejo 🚌❤️
📍 *Lugar:* {direccion}
Queremos que conozcas algunos de los beneficios de ser parte de nuestra empresa:
🎓 Formación continua en nuestra Escuela de Conducción.
🏠 Apoyo para cumplir el sueño de tener vivienda propia.
🗓️ Descansos programados.
💰 Facilidades de préstamos.
📚 Convenios universitarios para ti y tu familia.
👨‍👩‍👧‍👦 Actividades que integran a tu familia.
Hoy podrás conocer en detalle estos beneficios y cómo acceder a ellos.
¡No faltes a tu cita! Confirma tu asistencia respondiendo *CONFIRMO* por este chat.
La Carolina, transporte con corazón ❤️$t$,
 ARRAY['nombre', 'hora', 'direccion']),
('no_seleccionado', $t$Te agradecemos sinceramente tu interés en la vacante de conductor, así como el tiempo y la disposición que tuviste durante nuestro proceso de selección.
Luego de la revisión correspondiente, en esta oportunidad no fuiste seleccionado para continuar en el proceso. Esta decisión responde a los criterios de la vacante actual y no desmerita tu experiencia ni tus capacidades.
Gracias por tu interés en ser parte de la familia La Carolina; esperamos que encuentres nuevas oportunidades que se ajusten a tu perfil. No te desanimes: te deseamos muchos éxitos en tus próximos proyectos laborales.$t$,
 ARRAY[]::TEXT[]);

UPDATE seleccion_mensajes m
SET texto = CASE WHEN m.texto = m.texto_sugerido THEN g.texto ELSE m.texto END,
    texto_sugerido = g.texto,
    variables = (SELECT ARRAY(SELECT DISTINCT unnest(m.variables || g.variables))),
    updated_at = now()
FROM guion_gh g
WHERE m.clave = g.clave;

-- La primera conversación ya no pide la cédula en el saludo, sino la ciudad.
UPDATE seleccion_mensajes SET cuando = 'Primera respuesta del asistente a quien escribe' WHERE clave = 'bienvenida';

-- ── 5. Plantillas enviadas a Meta (19-nov-2026) ──────────────────────────────
-- Versiones nuevas de la citación y del recordatorio (solo si el texto es el que se envió).
UPDATE seleccion_mensajes m
SET plantilla_propuesta_nombre = v.nombre,
    plantilla_propuesta_texto = m.texto,
    plantilla_propuesta_estado = 'PENDING',
    plantilla_propuesta_variables = v.variables
FROM (VALUES
  ('citacion', 'sel_citacion_v2', ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto']),
  ('recordatorio_cita', 'sel_recordatorio_cita_v2', ARRAY['nombre', 'hora', 'direccion'])
) AS v(clave, nombre, variables), guion_gh g
WHERE m.clave = v.clave AND g.clave = v.clave AND m.texto = g.texto
  AND m.plantilla_propuesta_nombre IS NULL AND m.plantilla_nombre <> v.nombre;

-- «No seleccionado» pasa a tener plantilla: si la ventana está cerrada, sale por ella.
UPDATE seleccion_mensajes m
SET plantilla_nombre = 'sel_no_seleccionado',
    plantilla_variables = '{}',
    plantilla_categoria = 'UTILITY',
    plantilla_estado = 'PENDING'
FROM guion_gh g
WHERE m.clave = 'no_seleccionado' AND g.clave = 'no_seleccionado' AND m.texto = g.texto AND m.plantilla_nombre IS NULL;

-- ── 6. Respuestas del asistente para casos frecuentes (nuevas) ───────────────
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado)
SELECT v.clave, v.nombre, v.cuando, v.orden, v.texto, v.texto, 'automatico', ARRAY['asistente'], NULL, ARRAY[]::TEXT[], NULL, NULL
FROM (VALUES
  ('vehiculos', 'Vehículos que se manejan', 'El aspirante pregunta qué vehículos se manejan', 21,
   $t$En La Carolina manejamos principalmente buses y busetas de transporte público colectivo urbano en Barranquilla y su área metropolitana, de las marcas Chevrolet (NQR, FRR y MS), Foton y Yutong.$t$),
  ('beneficios', 'Beneficios', 'El aspirante pregunta por los beneficios', 22,
   $t$Al ser parte de La Carolina tienes formación continua en nuestra Escuela de Conducción, apoyo para cumplir el sueño de tener vivienda propia, descansos programados, facilidades para préstamos, convenios universitarios para ti y tu familia, y actividades de integración familiar. Los detalles y condiciones te los explicamos en la cita.$t$),
  ('registro_completo', 'Documentación recibida', 'Respondió todo, autorizó y envió la hoja de vida', 25,
   $t$¡Recibimos correctamente tu documentación! Gracias por tu interés en la vacante. Ya quedaste registrado: nuestro equipo revisa tus datos y muy pronto te escribimos con los siguientes pasos para tu prueba de manejo. Mantente atento a tu teléfono.$t$),
  ('no_cumple_licencia', 'Licencia que no sirve', 'No tiene licencia C2 o C3 vigente', 26,
   $t$Lamentamos informarte que con tu licencia no es posible aplicar a la vacante de conductor de busetas: para esta convocatoria se necesita licencia C2 o C3 vigente, con al menos 6 meses de vigencia. Si en el futuro recategorizas o renuevas tu licencia, puedes escribirnos de nuevo para postularte. ¡Gracias por tu interés en ser parte de la familia La Carolina! Te deseamos muchos éxitos.$t$),
  ('fuera_de_zona', 'Vive en otra ciudad', 'Vive fuera y no puede trasladarse', 27,
   $t$Entiendo. Si en el futuro estás en Barranquilla o en el Atlántico y sigues interesado en la vacante, puedes escribirnos de nuevo o acercarte directamente a la empresa para retomar tu proceso. ¡Gracias por tu interés en ser parte de la familia La Carolina! Te deseamos muchos éxitos y un excelente día.$t$),
  ('desistimiento', 'Ya no le interesa', 'El aspirante dice que ya no le interesa', 28,
   $t$Lamento leer eso. Conservaremos tu hoja de vida para futuras postulaciones. ¡Muchas gracias por interesarte en nosotros! Te deseamos éxitos y que tengas un excelente día.$t$),
  ('agradecimiento', 'Agradecimiento', 'El aspirante agradece o se despide', 29,
   $t$¡A ti por interesarte en nosotros! Que tengas un excelente día.$t$)
) AS v(clave, nombre, cuando, orden, texto)
ON CONFLICT (clave) DO NOTHING;

-- ── 7. Prompt del agente: su saludo pedía la cédula primero ──────────────────
UPDATE wa_agente
SET prompt = replace(
  prompt,
  'Para empezar, envíame una foto de tu cédula por ambos lados (frente y reverso). Si prefieres, escríbeme tu número de cédula, tu primer apellido y la fecha de expedición. Con eso revisamos enseguida tu licencia.',
  'Para empezar, ¿en qué ciudad vives actualmente? Si vives fuera de Barranquilla o Soledad, cuéntame si podrías trasladarte en caso de avanzar en el proceso.'
)
WHERE prompt LIKE '%Para empezar, envíame una foto de tu cédula por ambos lados%';

DROP TABLE IF EXISTS pg_temp.guion_gh;
