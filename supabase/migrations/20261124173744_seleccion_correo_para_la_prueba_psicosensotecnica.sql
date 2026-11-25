-- Selección: correo para la prueba psicosensotécnica
--
-- Contexto: la prueba psicosensotécnica se presenta en una plataforma externa
-- y la información para presentarla le llega al aspirante por correo. Al
-- entrar a exámenes médicos · fase 1, Gestivo le pide el correo por WhatsApp,
-- le pregunta si está bien escrito y le envía un correo con un enlace para
-- confirmarlo. Si no responde, se le recuerda que es necesario para el
-- proceso. Con el correo confirmado, Gestión Humana lo inscribe en la
-- plataforma y, al marcarlo en la ficha, Gestivo le avisa por WhatsApp que le
-- va a llegar la información por correo (src/lib/seleccion/correo-psico.ts).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

-- ── 1. El correo y en qué va, en el proceso ────────────────────────────────
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_estado TEXT;
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_correo_estado_chk;
ALTER TABLE procesos_contratacion
  ADD CONSTRAINT procesos_contratacion_correo_estado_chk CHECK (correo_estado IN ('pedido', 'por_confirmar', 'enviado', 'validado', 'inscrito'));
-- Del enlace solo se guarda el hash: el token viaja únicamente en el correo.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_token_hash TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_token_vence TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_pedido_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_enviado_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_validado_at TIMESTAMPTZ;
-- «enlace» si lo confirmó el aspirante; si no, el correo de quien lo dio por bueno.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_validado_por TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_inscrito_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_inscrito_por TEXT;
-- Último mensaje de Gestivo sobre el correo (el pedido o un recordatorio) y cuántos recordatorios van.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_recordatorio_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_recordatorios INTEGER NOT NULL DEFAULT 0;
-- Agotó los recordatorios sin responder: el chat quedó para una persona.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_escalado_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS correo_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_procesos_correo_token ON procesos_contratacion (correo_token_hash) WHERE correo_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procesos_correo_estado ON procesos_contratacion (correo_estado) WHERE correo_estado IS NOT NULL;

COMMENT ON COLUMN procesos_contratacion.correo IS 'Correo del aspirante para la plataforma de la prueba psicosensotécnica.';
COMMENT ON COLUMN procesos_contratacion.correo_estado IS 'pedido | por_confirmar | enviado (correo con el enlace) | validado | inscrito (en la plataforma).';

-- ── 2. Mensajes (Selección › Mensajes) ─────────────────────────────────────
-- Los que salen fuera de las 24 horas de WhatsApp llevan plantilla propuesta:
-- hay que enviarlas a Meta desde Selección › Mensajes. Mientras no estén
-- aprobadas, solo salen si el aspirante escribió en las últimas 24 horas.
-- Las respuestas al momento (¿tu correo es…?, te enviamos el correo…) van en
-- la ventana abierta y no necesitan plantilla.
-- Meta rechaza las plantillas que empiezan o terminan con una variable: por eso «Hola, {nombre}.».
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables,
  plantilla_nombre, plantilla_variables, plantilla_botones, plantilla_categoria, plantilla_estado)
VALUES
  ('pedir_correo', 'Pedir el correo (psicosensotécnica)', 'Entra a exámenes · fase 1', 101,
   $t$Hola, {nombre}. Para continuar con tu proceso necesitamos tu correo electrónico: allí te llegará la información para presentar la prueba psicosensotécnica. ¿Nos lo escribes por aquí, por favor?$t$,
   $t$Hola, {nombre}. Para continuar con tu proceso necesitamos tu correo electrónico: allí te llegará la información para presentar la prueba psicosensotécnica. ¿Nos lo escribes por aquí, por favor?$t$,
   'automatico', ARRAY['nombre'], 'sel_pedir_correo', ARRAY['nombre'], ARRAY[]::text[], 'UTILITY', NULL),
  ('correo_confirmar', '¿Tu correo es …? (psicosensotécnica)', 'Escribe su correo', 102,
   $t$¿Tu correo es {correo}? Revísalo bien, por favor: allí te llegará la información para la prueba psicosensotécnica.$t$,
   $t$¿Tu correo es {correo}? Revísalo bien, por favor: allí te llegará la información para la prueba psicosensotécnica.$t$,
   'automatico', ARRAY['correo'], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('correo_corregir', 'Pedir el correo correcto (psicosensotécnica)', 'Dice que el correo está mal', 103,
   $t$Está bien. Escríbenos tu correo electrónico correcto, por favor.$t$,
   $t$Está bien. Escríbenos tu correo electrónico correcto, por favor.$t$,
   'automatico', ARRAY[]::text[], 'sel_correo_corregir', ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('correo_enviado', 'Te enviamos el correo (psicosensotécnica)', 'Confirma que el correo está bien', 104,
   $t$Listo. Te enviamos un correo a {correo}. Ábrelo y toca «Sí, es mi correo» para confirmarlo. Si no lo ves, revisa la carpeta de spam o correo no deseado.$t$,
   $t$Listo. Te enviamos un correo a {correo}. Ábrelo y toca «Sí, es mi correo» para confirmarlo. Si no lo ves, revisa la carpeta de spam o correo no deseado.$t$,
   'automatico', ARRAY['correo'], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('correo_no_enviado', 'No se pudo enviar el correo (psicosensotécnica)', 'Falla el envío del correo', 105,
   $t$Gracias. Tuvimos un problema al enviarte el correo; Gestión Humana lo revisa y te escribimos.$t$,
   $t$Gracias. Tuvimos un problema al enviarte el correo; Gestión Humana lo revisa y te escribimos.$t$,
   'automatico', ARRAY[]::text[], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('recordatorio_correo', 'Recordatorio: falta el correo (psicosensotécnica)', 'No ha escrito su correo', 106,
   $t$Hola, {nombre}. Te recordamos que necesitamos tu correo electrónico para la prueba psicosensotécnica. Es necesario para continuar con tu proceso. Escríbelo aquí, por favor.$t$,
   $t$Hola, {nombre}. Te recordamos que necesitamos tu correo electrónico para la prueba psicosensotécnica. Es necesario para continuar con tu proceso. Escríbelo aquí, por favor.$t$,
   'automatico', ARRAY['nombre'], 'sel_recordatorio_correo', ARRAY['nombre'], ARRAY[]::text[], 'UTILITY', NULL),
  ('recordatorio_validar_correo', 'Recordatorio: confirmar el correo (psicosensotécnica)', 'No ha confirmado el correo', 107,
   $t$Hola, {nombre}. Te enviamos un correo a {correo} para confirmarlo y todavía no lo has abierto. Búscalo (también en spam o correo no deseado) y toca «Sí, es mi correo». Es necesario para continuar con tu proceso. Si el correo está mal, escríbenos el correcto aquí.$t$,
   $t$Hola, {nombre}. Te enviamos un correo a {correo} para confirmarlo y todavía no lo has abierto. Búscalo (también en spam o correo no deseado) y toca «Sí, es mi correo». Es necesario para continuar con tu proceso. Si el correo está mal, escríbenos el correcto aquí.$t$,
   'automatico', ARRAY['nombre', 'correo'], 'sel_recordatorio_validar_correo', ARRAY['nombre', 'correo'], ARRAY[]::text[], 'UTILITY', NULL),
  ('correo_validado', 'Correo confirmado (psicosensotécnica)', 'Confirma el correo en el enlace', 109,
   $t$¡Gracias, {nombre}! Tu correo {correo} quedó confirmado. Te avisaremos cuando te inscribamos en la plataforma de la prueba psicosensotécnica.$t$,
   $t$¡Gracias, {nombre}! Tu correo {correo} quedó confirmado. Te avisaremos cuando te inscribamos en la plataforma de la prueba psicosensotécnica.$t$,
   'automatico', ARRAY['nombre', 'correo'], 'sel_correo_validado', ARRAY['nombre', 'correo'], ARRAY[]::text[], 'UTILITY', NULL),
  ('psico_inscrito', 'Inscrito en la plataforma (psicosensotécnica)', 'Gestión Humana lo inscribe en la plataforma', 109,
   $t$Hola, {nombre}. Ya te inscribimos en la plataforma de la prueba psicosensotécnica. En las próximas horas te llegará un correo a {correo} con la información para presentarla. Revisa también la carpeta de spam o correo no deseado.$t$,
   $t$Hola, {nombre}. Ya te inscribimos en la plataforma de la prueba psicosensotécnica. En las próximas horas te llegará un correo a {correo} con la información para presentarla. Revisa también la carpeta de spam o correo no deseado.$t$,
   'automatico', ARRAY['nombre', 'correo'], 'sel_psico_inscrito', ARRAY['nombre', 'correo'], ARRAY[]::text[], 'UTILITY', NULL)
ON CONFLICT (clave) DO NOTHING;

-- ── 3. Ajustes (Selección › Tiempos y reglas › Escuela, exámenes y contratación) ─
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('correo_psico_activo', 'regla', 'Pedir el correo para la prueba psicosensotécnica al entrar a la fase 1', 126,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 24-nov-2026', 4),
  ('correo_psico_horas', 'tiempo', 'Horas sin respuesta antes de recordarle el correo', 127,
   '24'::jsonb, '24'::jsonb, 'horas', 'Gestión Humana, 24-nov-2026', 4),
  ('correo_psico_recordatorios', 'regla', 'Recordatorios del correo antes de pasar el chat a una persona', 128,
   '3'::jsonb, '3'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

-- Comprobación: 14 columnas, 9 mensajes y 3 ajustes.
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'procesos_contratacion' AND column_name LIKE 'correo%') AS columnas,
       (SELECT count(*) FROM seleccion_mensajes WHERE clave IN ('pedir_correo', 'correo_confirmar', 'correo_corregir', 'correo_enviado', 'correo_no_enviado',
          'recordatorio_correo', 'recordatorio_validar_correo', 'correo_validado', 'psico_inscrito')) AS mensajes,
       (SELECT count(*) FROM seleccion_ajustes WHERE clave LIKE 'correo_psico_%') AS ajustes;
