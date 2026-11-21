-- Selección: mensaje «Cita movida por la empresa»
--
-- Contexto: desde la semana de la agenda (Candidatos › Agenda › Semana) se
-- reprograma una cita arrastrándola a otro día, y también se mueven solas las
-- citas de un día en que el profesor no puede. En esos casos la que cambia la
-- fecha es la empresa, pero se avisaba con «Cita reprogramada» («Listo, {nombre}.
-- Te esperamos…»), que está escrito como respuesta a un aspirante que pidió el
-- cambio. Además ese mensaje no tiene plantilla: si el aspirante no ha escrito en
-- 24 horas (lo normal cuando lo movemos nosotros) quedaba como borrador.
--
-- Este mensaje explica el cambio y tiene su plantilla de Utilidad
-- (sel_cita_movida_v2, enviada a Meta el 19-nov-2026; queda PENDING hasta que
-- «Actualizar estado de las plantillas con Meta» traiga la aprobación). Mientras
-- no esté aprobada, con la ventana cerrada el aviso queda como borrador, igual
-- que antes. Gestión Humana puede editar el texto en Selección › Mensajes (si
-- lo cambia, hay que enviar la versión nueva a Meta desde ahí).
--
-- Solo inserta una fila en una tabla que ya tiene sus GRANT. Idempotente.

INSERT INTO seleccion_mensajes (
  clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables,
  plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado, plantilla_botones
)
SELECT
  'cita_movida_empresa',
  'Cita movida por la empresa',
  'La empresa cambia la fecha de la cita (desde la agenda, o porque el profesor no puede)',
  66,
  t.texto,
  t.texto,
  'revisar',
  ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto'],
  'sel_cita_movida_v2',
  ARRAY['nombre', 'fecha', 'hora', 'direccion', 'contacto'],
  'UTILITY',
  'PENDING',
  ARRAY['Sí, voy', 'Necesito otra fecha']
FROM (SELECT $t$Hola, {nombre}. Tuvimos que cambiar la fecha de tu prueba de manejo en La Carolina; disculpa las molestias 🙏
Tu nueva cita es el *{fecha} a las {hora}*
📍 *Lugar:* {direccion}
👤 *Pregunta por:* {contacto}
📄 *Importante:* trae tu hoja de vida impresa y zapatos cerrados; si tu licencia exige lentes, tráelos.
¿Nos confirmas que puedes venir?$t$ AS texto) t
ON CONFLICT (clave) DO NOTHING;
