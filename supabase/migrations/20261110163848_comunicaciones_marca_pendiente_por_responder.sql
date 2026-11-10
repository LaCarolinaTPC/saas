-- comunicaciones marca pendiente por responder
--
-- Contexto. En la bandeja, abrir un chat lo marca como leído y, a medida que
-- llegan mensajes de otros, se va hacia abajo. Gestión Humana pidió poder dejar
-- una marca en un chat que todavía no ha contestado («pendiente») para que no
-- se le pierda. «Marcar como no leída» no basta: se borra apenas se vuelve a
-- abrir el chat.
--
-- La marca es del equipo, no de una persona (los chats no se asignan): la ven
-- todos, la pone o la quita cualquiera con acceso a Comunicaciones, y se quita
-- sola cuando alguien del equipo responde desde Gestivo. Abrir el chat no la
-- quita, ni tampoco las respuestas de la IA o los recordatorios automáticos.
--
-- Los triggers de aviso en tiempo real (20261110003255) ya avisan a las
-- bandejas abiertas cuando cambia cualquier columna de wa_conversaciones, así
-- que la marca aparece al instante en todas sin más cambios.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. No crea tablas (wa_conversaciones ya tiene sus GRANT).

ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS pendiente_at TIMESTAMPTZ;
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS pendiente_por TEXT;

COMMENT ON COLUMN wa_conversaciones.pendiente_at IS
  'Cuándo se marcó el chat como pendiente por responder (null = sin marca). Se limpia al responder una persona del equipo.';
COMMENT ON COLUMN wa_conversaciones.pendiente_por IS
  'Correo de quien marcó el chat como pendiente.';

-- La bandeja trae siempre todas las pendientes, aunque sean antiguas.
CREATE INDEX IF NOT EXISTS idx_wa_conv_pendiente
  ON wa_conversaciones (pendiente_at)
  WHERE pendiente_at IS NOT NULL;
