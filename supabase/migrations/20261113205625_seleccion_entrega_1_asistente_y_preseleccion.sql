-- seleccion entrega 1 asistente y preseleccion
--
-- Contexto. Entrega 1 de la selección de conductores (requerimientos A1–A5,
-- B1–B3, J1, N1–N5; docs/Requerimientos — Selección de conductores.md). El
-- asistente de WhatsApp recoge los datos del aspirante y crea el proceso; un
-- semáforo decide si pasa a antecedentes; los fríos se reactivan con
-- plantillas; y Gestión Humana edita los mensajes y los tiempos. Hasta ahora el
-- proceso solo guardaba estado y fechas, ningún cambio dejaba rastro de quién
-- lo hizo y la misma cédula podía tener dos procesos abiertos.
--
-- Qué hace:
--   1. procesos_contratacion: datos del prefiltro, autorización de datos
--      (Ley 1581), resultado del semáforo, origen y quién lo cambió por última vez.
--   2. Un solo proceso abierto por cédula (índice único parcial; si ya hay
--      duplicados abiertos, avisa en vez de fallar).
--   3. procesos_contratacion_eventos: historial de cambios de estado.
--   4. verificaciones_externas: cada consulta a Croma u otra fuente (SIMIT hoy;
--      antecedentes en la entrega 3).
--   5. Catálogo de mensajes y ajustes de selección, con historial de cambios.
--   6. wa_conversaciones: datos parciales del prefiltro, reactivación y borrador
--      sugerido para «revisar antes de enviar».
--   7. Aviso en tiempo real al tablero de procesos (solo el id, canal privado).
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

-- ── 1. Datos del prefiltro en el proceso ───────────────────────────────────
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS edad SMALLINT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS ciudad_residencia TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS dispuesto_traslado BOOLEAN;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS experiencia_meses SMALLINT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS licencia_verificada_runt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS hoja_vida_recibida_at TIMESTAMPTZ;
-- Autorización de tratamiento de datos: 'si' | 'no', cuándo, el texto que se le
-- mostró y el mensaje de WhatsApp con su respuesta (evidencia).
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS autorizacion_datos TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS autorizacion_datos_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS autorizacion_datos_texto TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS autorizacion_mensaje_id UUID REFERENCES wa_mensajes(id) ON DELETE SET NULL;
-- Resultado del semáforo: {edad:{color,motivo,origen}, residencia:…, licencia:…, simit:…, global, evaluado_at}.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS preseleccion JSONB;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS requisito_incumplido TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS carta_laboral_pendiente BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS updated_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procesos_contratacion_autorizacion_chk') THEN
    ALTER TABLE procesos_contratacion
      ADD CONSTRAINT procesos_contratacion_autorizacion_chk CHECK (autorizacion_datos IS NULL OR autorizacion_datos IN ('si', 'no'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procesos_contratacion_origen_chk') THEN
    ALTER TABLE procesos_contratacion
      ADD CONSTRAINT procesos_contratacion_origen_chk CHECK (origen IN ('manual', 'whatsapp_agente', 'webhook'));
  END IF;
END $$;

COMMENT ON COLUMN procesos_contratacion.preseleccion IS
  'Semáforo de preselección (B1): color, motivo y origen (declarado/verificado) de edad, residencia, licencia y SIMIT.';
COMMENT ON COLUMN procesos_contratacion.autorizacion_datos IS
  'Autorización de tratamiento de datos (Ley 1581): si | no. Sin «si» no se consultan antecedentes ni SIMIT.';

-- ── 2. Un solo proceso abierto por cédula ──────────────────────────────────
DO $$
DECLARE
  duplicadas INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_procesos_cedula_abierto') THEN
    RETURN;
  END IF;
  SELECT count(*) INTO duplicadas FROM (
    SELECT cedula FROM procesos_contratacion
    WHERE estado NOT IN ('contratado', 'cierre') AND coalesce(trim(cedula), '') <> ''
    GROUP BY cedula HAVING count(*) > 1
  ) d;
  IF duplicadas > 0 THEN
    RAISE NOTICE 'No se creó uq_procesos_cedula_abierto: % cédulas tienen más de un proceso abierto. '
      'Consúltelas con: SELECT cedula, count(*) FROM procesos_contratacion WHERE estado NOT IN (''contratado'',''cierre'') '
      'GROUP BY cedula HAVING count(*) > 1; ciérrelas y vuelva a ejecutar esta migración.', duplicadas;
  ELSE
    CREATE UNIQUE INDEX uq_procesos_cedula_abierto ON procesos_contratacion (cedula)
      WHERE estado NOT IN ('contratado', 'cierre') AND coalesce(trim(cedula), '') <> '';
  END IF;
END $$;

-- ── 3. Historial de cambios del proceso ────────────────────────────────────
CREATE TABLE IF NOT EXISTS procesos_contratacion_eventos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id       UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  -- creado | estado | preseleccion | autorizacion | dato
  tipo             TEXT NOT NULL DEFAULT 'estado',
  estado_anterior  TEXT,
  estado_nuevo     TEXT,
  causa            TEXT,
  detalle          JSONB,
  -- usuario | agente | sistema
  actor            TEXT NOT NULL DEFAULT 'usuario' CHECK (actor IN ('usuario', 'agente', 'sistema')),
  user_id          UUID,
  usuario_email    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proc_eventos_proceso ON procesos_contratacion_eventos (proceso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proc_eventos_fecha ON procesos_contratacion_eventos (created_at DESC);

ALTER TABLE procesos_contratacion_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON procesos_contratacion_eventos FROM anon, public;
GRANT SELECT, INSERT ON TABLE procesos_contratacion_eventos TO service_role;

COMMENT ON TABLE procesos_contratacion_eventos IS
  'Historial del proceso de contratación (NF6): quién cambió qué y cuándo (usuario, agente de IA o sistema).';

-- ── 4. Consultas a fuentes externas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verificaciones_externas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id      UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  cedula          TEXT NOT NULL,
  -- croma | manual | …
  proveedor       TEXT NOT NULL,
  -- simit | policia | procuraduria | contraloria | rnmc | runt
  fuente          TEXT NOT NULL,
  -- ok | hallazgo | error | pendiente
  estado          TEXT NOT NULL,
  valor           NUMERIC,
  resultado       JSONB,
  pdf_path        TEXT,
  costo           NUMERIC,
  error           TEXT,
  consultado_por  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verif_ext_proceso ON verificaciones_externas (proceso_id, fuente, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verif_ext_cedula ON verificaciones_externas (cedula, fuente, created_at DESC);

ALTER TABLE verificaciones_externas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON verificaciones_externas FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON TABLE verificaciones_externas TO service_role;

COMMENT ON TABLE verificaciones_externas IS
  'Cada consulta a una fuente externa (Croma: SIMIT, antecedentes) con su resultado crudo. Base de C1 (entrega 3).';

-- ── 5. Mensajes y ajustes de selección ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS seleccion_mensajes (
  clave                     TEXT PRIMARY KEY,
  nombre                    TEXT NOT NULL,
  cuando                    TEXT NOT NULL,
  orden                     SMALLINT NOT NULL DEFAULT 0,
  texto                     TEXT NOT NULL,
  texto_sugerido            TEXT NOT NULL,
  modo                      TEXT NOT NULL DEFAULT 'automatico' CHECK (modo IN ('automatico', 'revisar')),
  variables                 TEXT[] NOT NULL DEFAULT '{}',
  -- Plantilla de Meta para cuando la ventana de 24 h está cerrada (NULL = solo dentro de la ventana).
  plantilla_nombre          TEXT,
  plantilla_variables       TEXT[] NOT NULL DEFAULT '{}',
  plantilla_categoria       TEXT,
  plantilla_estado          TEXT,
  plantilla_texto_aprobado  TEXT,
  plantilla_botones         TEXT[] NOT NULL DEFAULT '{}',
  -- Versión nueva enviada a Meta y aún no aprobada: mientras tanto se usa la aprobada (N3).
  plantilla_propuesta_nombre TEXT,
  plantilla_propuesta_texto  TEXT,
  plantilla_propuesta_estado TEXT,
  plantilla_revisada_at     TIMESTAMPTZ,
  actualizado_por           TEXT,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seleccion_ajustes (
  clave            TEXT PRIMARY KEY,
  -- tiempo | regla | dato
  grupo            TEXT NOT NULL CHECK (grupo IN ('tiempo', 'regla', 'dato')),
  nombre           TEXT NOT NULL,
  orden            SMALLINT NOT NULL DEFAULT 0,
  valor            JSONB NOT NULL,
  valor_sugerido   JSONB NOT NULL,
  -- horas | dias | minutos | hora | numero | pesos | lista | texto
  unidad           TEXT NOT NULL,
  origen           TEXT,
  entrega          SMALLINT NOT NULL DEFAULT 1,
  actualizado_por  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seleccion_cambios (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- mensaje | ajuste
  tipo             TEXT NOT NULL CHECK (tipo IN ('mensaje', 'ajuste')),
  clave            TEXT NOT NULL,
  campo            TEXT NOT NULL,
  valor_anterior   JSONB,
  valor_nuevo      JSONB,
  usuario_email    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_cambios_clave ON seleccion_cambios (tipo, clave, created_at DESC);

ALTER TABLE seleccion_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE seleccion_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE seleccion_cambios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_mensajes, seleccion_ajustes, seleccion_cambios FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON TABLE seleccion_mensajes TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE seleccion_ajustes TO service_role;
GRANT SELECT, INSERT ON TABLE seleccion_cambios TO service_role;

COMMENT ON TABLE seleccion_mensajes IS 'Catálogo de mensajes de la selección (N1–N3): texto editable, modo de envío y plantilla de Meta.';
COMMENT ON TABLE seleccion_ajustes IS 'Tiempos, reglas de preselección y datos fijos de la selección (N5, B1), con su valor sugerido.';
COMMENT ON TABLE seleccion_cambios IS 'Historial de cambios del catálogo de mensajes y de los ajustes de selección.';

-- Mensajes sugeridos (documento de requerimientos y docs/seleccion-plantillas-whatsapp.md).
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado)
SELECT v.clave, v.nombre, v.cuando, v.orden, v.texto, v.texto, v.modo, v.variables, v.plantilla, v.pvars, v.categoria,
       CASE WHEN v.plantilla IS NULL THEN NULL ELSE 'PENDING' END
FROM (VALUES
  ('bienvenida', 'Bienvenida', 'Primer mensaje del aspirante', 10,
   'Hola, {nombre}. Gracias por escribir a La Carolina. Para seguir con tu proceso como conductor cuéntanos: ¿cuántos años tienes?, ¿en qué ciudad vives?, ¿qué categoría de licencia tienes? y ¿cuánto tiempo llevas manejando? Envíanos también tu hoja de vida, puede ser en foto o PDF.',
   'automatico', ARRAY['nombre'], NULL, ARRAY[]::TEXT[], NULL),
  ('salario_horario', 'Salario u horario', 'El aspirante pregunta por pago u horario', 20,
   'Esa información te la damos en la llamada o cuando vengas a la empresa. Primero terminemos tus datos para poder citarte.',
   'automatico', ARRAY[]::TEXT[], NULL, ARRAY[]::TEXT[], NULL),
  ('autorizacion_datos', 'Autorización de datos', 'Antes de consultar antecedentes', 30,
   'Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: {enlace_politica}. ¿Nos autorizas? Responde SÍ o NO.',
   'automatico', ARRAY['nombre', 'enlace_politica'], 'sel_autorizacion_datos', ARRAY['nombre', 'enlace_politica'], 'UTILITY'),
  ('reactivacion_1', 'Reactivación, primer aviso', 'Dejó de responder sin enviar la hoja de vida', 40,
   'Hola, {nombre}. Vimos que te interesó trabajar como conductor en La Carolina. ¿Sigues interesado? Solo nos falta tu hoja de vida para seguir con tu proceso.',
   'automatico', ARRAY['nombre'], 'sel_reactivacion_1', ARRAY['nombre'], 'MARKETING'),
  ('reactivacion_2', 'Reactivación, segundo aviso', 'Sigue sin responder', 50,
   'Hola, {nombre}. Todavía tenemos vacantes de conductor en La Carolina. Si tienes alguna duda, cuéntanos por aquí y te ayudamos.',
   'revisar', ARRAY['nombre'], 'sel_reactivacion_2', ARRAY['nombre'], 'MARKETING'),
  ('citacion', 'Citación', 'Pasó preselección y antecedentes', 60,
   'Hola, {nombre}. Pasaste la primera revisión de tu proceso como conductor. Te esperamos el {fecha} a las {hora} en La Carolina, {direccion}, para la prueba de manejo. Trae zapatos cerrados y tu hoja de vida impresa; si tu licencia exige lentes, tráelos. ¿Nos confirmas que vienes?',
   'revisar', ARRAY['nombre', 'fecha', 'hora', 'direccion'], 'sel_citacion', ARRAY['nombre', 'fecha', 'hora', 'direccion'], 'UTILITY'),
  ('cita_reprogramada', 'Cita reprogramada', 'El aspirante pide otra fecha', 65,
   'Listo, {nombre}. Te esperamos el {fecha} a las {hora} en La Carolina, {direccion}, para la prueba de manejo. Trae zapatos cerrados y tu hoja de vida impresa; si tu licencia exige lentes, tráelos.',
   'revisar', ARRAY['nombre', 'fecha', 'hora', 'direccion'], NULL, ARRAY[]::TEXT[], NULL),
  ('recordatorio_cita', 'Recordatorio de la cita', 'La mañana de la cita', 70,
   'Buenos días, {nombre}. Te recordamos que hoy a las {hora} tienes la prueba de manejo en La Carolina, {direccion}. ¿Nos confirmas que vienes?',
   'automatico', ARRAY['nombre', 'hora', 'direccion'], 'sel_recordatorio_cita', ARRAY['nombre', 'hora', 'direccion'], 'UTILITY'),
  ('inasistencia', 'Inasistencia', 'No llegó a la cita', 80,
   'Hola, {nombre}. Te esperábamos hoy a las {hora} para la prueba de manejo. ¿Quieres que la reprogramemos para el próximo día hábil?',
   'revisar', ARRAY['nombre', 'hora'], 'sel_inasistencia', ARRAY['nombre', 'hora'], 'UTILITY'),
  ('escuela', 'Escuela', 'Cada mañana mientras esté en escuela', 90,
   'Buenos días, {nombre}. Hoy sigues con la clase de refuerzo con el profesor a las {hora} en La Carolina. ¡Te esperamos!',
   'automatico', ARRAY['nombre', 'hora'], 'sel_escuela', ARRAY['nombre', 'hora'], 'UTILITY'),
  ('examenes_fase1', 'Orden de exámenes, fase 1', 'Aprobó la prueba de manejo', 100,
   'Hola, {nombre}. Aprobaste la prueba de manejo. Mañana te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Recuerda llevar la orden que te entregamos en recepción.',
   'automatico', ARRAY['nombre', 'hora', 'laboratorio'], 'sel_examenes_fase1', ARRAY['nombre', 'hora', 'laboratorio'], 'UTILITY'),
  ('examenes_fase2', 'Paso a la fase 2 de exámenes', 'Se registra la fase 1 apta', 110,
   'Hola, {nombre}. Pasaste la primera fase de exámenes. Mañana te presentas a las {hora} en {laboratorio}, esta vez en ayunas. Al salir, vienes a la empresa para el reconocimiento de ruta.',
   'automatico', ARRAY['nombre', 'hora', 'laboratorio'], 'sel_examenes_fase2', ARRAY['nombre', 'hora', 'laboratorio'], 'UTILITY'),
  ('reenviar_archivo', 'Reenviar un archivo', 'La foto o el PDF no se pudo leer', 120,
   'No pudimos leer bien el archivo. ¿Puedes tomar la foto de nuevo con buena luz, sin flash y con el documento completo?',
   'automatico', ARRAY[]::TEXT[], NULL, ARRAY[]::TEXT[], NULL),
  ('documentos_pendientes', 'Documentos pendientes', 'Falta algo en la carpeta', 130,
   'Hola, {nombre}. Para tu contratación nos falta: {pendientes}. ¿Nos lo puedes traer o enviar por aquí?',
   'revisar', ARRAY['nombre', 'pendientes'], 'sel_documentos_pendientes', ARRAY['nombre', 'pendientes'], 'UTILITY'),
  ('recordatorio_psicotecnica', 'Recordatorio de pruebas psicosensotécnicas', 'El día de la prueba', 140,
   'Buenos días, {nombre}. Te recordamos que hoy a las {hora} tienes las pruebas psicosensotécnicas en {lugar}. ¿Nos confirmas que vienes?',
   'automatico', ARRAY['nombre', 'hora', 'lugar'], 'sel_recordatorio_psicotecnica', ARRAY['nombre', 'hora', 'lugar'], 'UTILITY')
) AS v(clave, nombre, cuando, orden, texto, modo, variables, plantilla, pvars, categoria)
ON CONFLICT (clave) DO NOTHING;

-- Tiempos, reglas y datos fijos con su valor sugerido. El horario permitido,
-- la espera del asistente y el seguimiento a las 2 h siguen en wa_seguimiento
-- y wa_agente (una sola fuente de verdad); la pantalla los muestra juntos.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
SELECT v.clave, v.grupo, v.nombre, v.orden, v.valor, v.valor, v.unidad, v.origen, v.entrega
FROM (VALUES
  ('reactivacion_aviso1_horas', 'tiempo', 'Reactivación, primer aviso (sin respuesta y sin hoja de vida)', 10, '24'::jsonb, 'horas', 'Propuesta', 1),
  ('reactivacion_aviso2_horas', 'tiempo', 'Reactivación, segundo aviso (después del primero)', 20, '72'::jsonb, 'horas', 'Propuesta', 1),
  ('reactivacion_llamar_horas', 'tiempo', 'Pasar a llamada (después del segundo aviso)', 30, '24'::jsonb, 'horas', 'Propuesta', 1),
  ('incomunicado_dias', 'tiempo', 'Cerrar el proceso como «Incomunicado»', 40, '7'::jsonb, 'dias', 'Propuesta', 1),
  ('cita_hora_semana', 'tiempo', 'Hora de la cita de lunes a viernes', 50, '"13:00"'::jsonb, 'hora', 'Reunión', 2),
  ('cita_hora_sabado', 'tiempo', 'Hora de la cita los sábados', 55, '"08:00"'::jsonb, 'hora', 'Reunión («en la mañana»); la hora es propuesta', 2),
  ('cita_limite_mismo_dia', 'tiempo', 'Hora límite para ofrecer la cita el mismo día', 60, '"12:00"'::jsonb, 'hora', 'Reunión', 2),
  ('recordatorio_cita_hora', 'tiempo', 'Recordatorio el día de la cita', 70, '"08:00"'::jsonb, 'hora', 'Reunión («en la mañana»); la hora es propuesta', 2),
  ('alerta_no_confirmo_hora', 'tiempo', 'Alerta para llamar si no confirmó la cita', 80, '"11:00"'::jsonb, 'hora', 'Propuesta', 2),
  ('tolerancia_inasistencia_minutos', 'tiempo', 'Tolerancia antes de marcar «no asistió»', 90, '30'::jsonb, 'minutos', 'Propuesta', 2),
  ('reprogramaciones_max', 'tiempo', 'Reprogramaciones permitidas antes de cerrar por desistimiento', 100, '2'::jsonb, 'numero', 'Propuesta', 2),
  ('recordatorio_escuela_hora', 'tiempo', 'Recordatorio diario de escuela', 110, '"07:30"'::jsonb, 'hora', 'Reunión («en la mañana»); la hora es propuesta', 2),
  ('laboratorio_hora', 'tiempo', 'Hora de presentación en el laboratorio', 120, '"06:00"'::jsonb, 'hora', 'Reunión', 3),
  ('documentos_pendientes_dias', 'tiempo', 'Recordatorio de documentos pendientes de la carpeta', 130, '2'::jsonb, 'dias', 'Propuesta', 3),
  ('edad_minima', 'regla', 'Edad mínima', 200, '20'::jsonb, 'numero', 'Reunión', 1),
  ('edad_maxima', 'regla', 'Edad máxima', 210, '57'::jsonb, 'numero', 'Reunión', 1),
  ('ciudades', 'regla', 'Ciudades donde puede vivir (o dispuesto a trasladarse)', 220, '["Barranquilla", "Soledad"]'::jsonb, 'lista', 'Reunión', 1),
  ('licencias', 'regla', 'Categorías de licencia aceptadas', 230, '["C2", "C3"]'::jsonb, 'lista', 'Reunión', 1),
  ('simit_tope', 'regla', 'Tope de comparendos en el SIMIT', 240, '3000000'::jsonb, 'pesos', 'Reunión', 1),
  ('experiencia_meses', 'regla', 'Experiencia pedida (no excluyente)', 250, '6'::jsonb, 'numero', 'Reunión', 1),
  ('direccion_sede', 'dato', 'Dirección de la sede para la cita', 300, '""'::jsonb, 'texto', 'Por confirmar con GH', 2),
  ('laboratorio_nombre', 'dato', 'Nombre y dirección del laboratorio', 310, '""'::jsonb, 'texto', 'Por confirmar con GH', 3),
  ('enlace_politica', 'dato', 'Enlace a la política de tratamiento de datos', 320, '""'::jsonb, 'texto', 'Por confirmar con GH', 1)
) AS v(clave, grupo, nombre, orden, valor, unidad, origen, entrega)
ON CONFLICT (clave) DO NOTHING;

-- ── 6. Prefiltro, reactivación y borrador en la conversación ───────────────
-- prefiltro: datos que el asistente ya extrajo antes de que exista el proceso.
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS prefiltro JSONB;
-- Reactivación de fríos (J1): 0 = nada; 1 y 2 = avisos enviados; 3 = para llamar.
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS reactivacion_paso SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS reactivacion_ultimo_at TIMESTAMPTZ;
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS reactivacion_llamar_at TIMESTAMPTZ;
-- Mensaje en modo «revisar antes de enviar» (N2): {clave, texto, plantilla, variables, creado_at}.
ALTER TABLE wa_conversaciones ADD COLUMN IF NOT EXISTS borrador_sugerido JSONB;

CREATE INDEX IF NOT EXISTS idx_wa_conv_reactivacion ON wa_conversaciones (reactivacion_paso, ultimo_mensaje_at);

-- ── 7. Aviso en tiempo real al tablero de procesos ─────────────────────────
-- Igual que la bandeja (20261105220000): solo el id, canal privado, y solo
-- cuando la fila cambia de verdad.
CREATE OR REPLACE FUNCTION public.procesos_avisar_tablero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('proceso_id', coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id')),
      'cambio',
      'procesos',
      true
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'procesos_avisar_tablero: %', sqlerrm;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS procesos_aviso_tablero_insert ON public.procesos_contratacion;
CREATE TRIGGER procesos_aviso_tablero_insert
  AFTER INSERT OR DELETE ON public.procesos_contratacion
  FOR EACH ROW EXECUTE FUNCTION public.procesos_avisar_tablero();

DROP TRIGGER IF EXISTS procesos_aviso_tablero_update ON public.procesos_contratacion;
CREATE TRIGGER procesos_aviso_tablero_update
  AFTER UPDATE ON public.procesos_contratacion
  FOR EACH ROW
  WHEN (old.* IS DISTINCT FROM new.*)
  EXECUTE FUNCTION public.procesos_avisar_tablero();

DROP POLICY IF EXISTS "procesos_escuchar_autenticados" ON realtime.messages;
CREATE POLICY "procesos_escuchar_autenticados"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (realtime.topic() = 'procesos' AND extension = 'broadcast');

-- Botones de respuesta rápida de cada plantilla, tal como se enviaron a Meta el
-- 2026-11-13 (docs/seleccion-plantillas-whatsapp.md). Las versiones nuevas los repiten.
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
