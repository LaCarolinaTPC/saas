-- Selección: mensajes de exámenes (banco y rutas) y firma de la carta del banco
--
-- Contexto (24-nov-2026, documento «MENSAJE FASE EXÁMENES MÉDICOS» de Gestión
-- Humana):
--   * Fase 1: el mensaje pregunta si ya tiene cuenta de ahorros en el Banco de
--     Bogotá. Si dice que sí, se le pide el certificado bancario; si dice que
--     no, se le explica dónde abrirla y se le envía la carta de autorización.
--     La carta ya no sale sola al citar.
--   * Fase 2: el mensaje dice que es en ayunas y pregunta cuántas rutas lleva
--     aprendidas; según la respuesta (frente al mínimo de rutas de Tiempos y
--     reglas) se le dice que siga a la empresa o que siga aprendiendo rutas.
--   * La carta del banco: nombre y cargo de quien firma (la firma y el sello
--     son imágenes que se suben en Selección › Laboratorios).
-- Lo atiende src/lib/seleccion/respuestas-examenes*.ts.
--
-- Los textos de las plantillas de Meta cambian: hay que enviar las versiones
-- nuevas (Selección › Mensajes). Mientras no estén aprobadas sigue saliendo la
-- versión aprobada fuera de las 24 horas.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

-- ── 1. Respuestas del aspirante, en el proceso ─────────────────────────────
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS banco_cuenta TEXT;
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_banco_cuenta_chk;
ALTER TABLE procesos_contratacion ADD CONSTRAINT procesos_contratacion_banco_cuenta_chk CHECK (banco_cuenta IN ('si', 'no'));
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS banco_preguntado_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS banco_respondido_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS rutas_declaradas INTEGER;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS rutas_preguntado_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS rutas_respondido_at TIMESTAMPTZ;
COMMENT ON COLUMN procesos_contratacion.banco_cuenta IS 'Respuesta a «¿tiene cuenta de ahorros en el Banco de Bogotá?» (fase 1): si = pedir certificado; no = carta de apertura.';
COMMENT ON COLUMN procesos_contratacion.rutas_declaradas IS 'Rutas que el aspirante dice llevar aprendidas (pregunta del mensaje de la fase 2).';

-- ── 2. Mensajes de las fases ───────────────────────────────────────────────
UPDATE seleccion_mensajes
SET texto = $t$Buen día, señor(a) {nombre}.
Le informamos que continuaremos con su proceso de selección en Empresa Metropolitana de Transporte La Carolina S.A.S., por lo que se ha programado la primera fase de sus exámenes médicos.
Para ello, deberá presentarse en la siguiente dirección:
📍 Dirección: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
Adicionalmente, queremos consultarle si actualmente tiene cuenta de ahorros en el Banco de Bogotá. Esto con el fin de indicarle el procedimiento correspondiente para gestionar su cuenta de nómina.
Quedamos atentos a su respuesta. ¡Muchas gracias!$t$,
    texto_sugerido = $t$Buen día, señor(a) {nombre}.
Le informamos que continuaremos con su proceso de selección en Empresa Metropolitana de Transporte La Carolina S.A.S., por lo que se ha programado la primera fase de sus exámenes médicos.
Para ello, deberá presentarse en la siguiente dirección:
📍 Dirección: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
Adicionalmente, queremos consultarle si actualmente tiene cuenta de ahorros en el Banco de Bogotá. Esto con el fin de indicarle el procedimiento correspondiente para gestionar su cuenta de nómina.
Quedamos atentos a su respuesta. ¡Muchas gracias!$t$,
    variables = ARRAY['nombre', 'laboratorio', 'fecha', 'hora'],
    plantilla_botones = ARRAY['Sí, tengo cuenta', 'No tengo cuenta'],
    updated_at = now()
WHERE clave = 'examenes_fase1';

UPDATE seleccion_mensajes
SET texto = $t$Buen día, señor(a) {nombre}.
Nos permitimos informarle que ha avanzado a la segunda fase de exámenes médicos dentro de su proceso de selección con Empresa Metropolitana de Transporte La Carolina S.A.S.
Por este motivo, deberá presentarse nuevamente en el laboratorio donde realizó la primera fase:
📍 Laboratorio: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
¡Importante! Para esta segunda fase deberá asistir en completo ayuno, siguiendo las indicaciones médicas correspondientes.
Adicionalmente, queremos consultarle: ¿cuántas rutas de la empresa lleva aprendidas hasta el momento? Esta información nos permitirá orientarlo sobre los siguientes pasos de su proceso.
Quedamos atentos a su respuesta. ¡Muchas gracias!$t$,
    texto_sugerido = $t$Buen día, señor(a) {nombre}.
Nos permitimos informarle que ha avanzado a la segunda fase de exámenes médicos dentro de su proceso de selección con Empresa Metropolitana de Transporte La Carolina S.A.S.
Por este motivo, deberá presentarse nuevamente en el laboratorio donde realizó la primera fase:
📍 Laboratorio: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
¡Importante! Para esta segunda fase deberá asistir en completo ayuno, siguiendo las indicaciones médicas correspondientes.
Adicionalmente, queremos consultarle: ¿cuántas rutas de la empresa lleva aprendidas hasta el momento? Esta información nos permitirá orientarlo sobre los siguientes pasos de su proceso.
Quedamos atentos a su respuesta. ¡Muchas gracias!$t$,
    variables = ARRAY['nombre', 'laboratorio', 'fecha', 'hora'],
    updated_at = now()
WHERE clave = 'examenes_fase2';

-- Las respuestas, al momento (el aspirante acaba de escribir: no necesitan plantilla).
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables,
  plantilla_nombre, plantilla_variables, plantilla_botones, plantilla_categoria, plantilla_estado)
VALUES
  ('banco_si', 'Tiene cuenta en el Banco de Bogotá', 'Responde que sí tiene cuenta (fase 1)', 102,
   $t$¡Perfecto, muchas gracias por confirmarnos!
En ese caso, le agradecemos enviarnos un certificado bancario actualizado de su cuenta del Banco de Bogotá, para continuar con el proceso de vinculación.
Puede compartirlo por este mismo medio.$t$,
   $t$¡Perfecto, muchas gracias por confirmarnos!
En ese caso, le agradecemos enviarnos un certificado bancario actualizado de su cuenta del Banco de Bogotá, para continuar con el proceso de vinculación.
Puede compartirlo por este mismo medio.$t$,
   'automatico', ARRAY[]::text[], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('banco_no', 'No tiene cuenta en el Banco de Bogotá', 'Responde que no tiene cuenta (fase 1): después sale la carta', 102,
   $t$¡Gracias por confirmarnos!
En ese caso, la empresa le hace entrega de una carta de autorización del Banco de Bogotá para que pueda realizar la apertura de su cuenta de ahorros.
Podrá acercarse a cualquiera de las siguientes sedes para realizar el trámite:
📍 Sede C.C. Metrocentro.
📍 Sede C.C. Plaza del Sol.
📍 Sede C.C. Parque Alegra (jornada continua).
Recuerde llevar la carta y su documento de identidad en físico.
Una vez realizada la apertura, deberá compartirnos el certificado bancario para continuar con su proceso de vinculación.
¡Muchas gracias!$t$,
   $t$¡Gracias por confirmarnos!
En ese caso, la empresa le hace entrega de una carta de autorización del Banco de Bogotá para que pueda realizar la apertura de su cuenta de ahorros.
Podrá acercarse a cualquiera de las siguientes sedes para realizar el trámite:
📍 Sede C.C. Metrocentro.
📍 Sede C.C. Plaza del Sol.
📍 Sede C.C. Parque Alegra (jornada continua).
Recuerde llevar la carta y su documento de identidad en físico.
Una vez realizada la apertura, deberá compartirnos el certificado bancario para continuar con su proceso de vinculación.
¡Muchas gracias!$t$,
   'automatico', ARRAY[]::text[], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('rutas_suficientes', 'Sabe las rutas', 'Responde que sabe las rutas mínimas (fase 2)', 112,
   $t$¡Excelente! Muchas gracias por la información.
Una vez finalice sus exámenes médicos, deberá acercarse a las instalaciones de la empresa para continuar con la siguiente etapa de su proceso de selección.
Posteriormente, le estaremos indicando las instrucciones correspondientes.
¡Muchos éxitos!$t$,
   $t$¡Excelente! Muchas gracias por la información.
Una vez finalice sus exámenes médicos, deberá acercarse a las instalaciones de la empresa para continuar con la siguiente etapa de su proceso de selección.
Posteriormente, le estaremos indicando las instrucciones correspondientes.
¡Muchos éxitos!$t$,
   'automatico', ARRAY[]::text[], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL),
  ('rutas_faltan', 'Le faltan rutas', 'Responde que sabe menos rutas que el mínimo (fase 2)', 112,
   $t$Gracias por la información.
En ese caso, deberá continuar con el proceso de reconocimiento y aprendizaje de rutas antes de avanzar a la siguiente etapa.
Le recordamos que es muy importante dedicar tiempo a este proceso y procurar aprender adecuadamente los recorridos, ya que el conocimiento de las rutas es fundamental para el desempeño de las funciones del cargo.
Una vez tenga un mayor avance en el aprendizaje, podremos orientarlo sobre los siguientes pasos del proceso de selección.
¡Muchos éxitos!$t$,
   $t$Gracias por la información.
En ese caso, deberá continuar con el proceso de reconocimiento y aprendizaje de rutas antes de avanzar a la siguiente etapa.
Le recordamos que es muy importante dedicar tiempo a este proceso y procurar aprender adecuadamente los recorridos, ya que el conocimiento de las rutas es fundamental para el desempeño de las funciones del cargo.
Una vez tenga un mayor avance en el aprendizaje, podremos orientarlo sobre los siguientes pasos del proceso de selección.
¡Muchos éxitos!$t$,
   'automatico', ARRAY[]::text[], NULL, ARRAY[]::text[], ARRAY[]::text[], 'UTILITY', NULL)
ON CONFLICT (clave) DO NOTHING;

-- ── 3. Quién firma la carta del banco (se edita en Selección › Laboratorios) ─
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('carta_firmante', 'dato', 'Nombre de quien firma la carta del banco', 321, '""'::jsonb, '""'::jsonb, 'texto', 'Gestión Humana, 24-nov-2026', 3),
  ('carta_firmante_cargo', 'dato', 'Cargo de quien firma la carta del banco', 322, '""'::jsonb, '""'::jsonb, 'texto', 'Gestión Humana, 24-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;

SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'procesos_contratacion' AND (column_name LIKE 'banco_%' OR column_name LIKE 'rutas_%')) AS columnas,
       (SELECT count(*) FROM seleccion_mensajes WHERE clave IN ('banco_si', 'banco_no', 'rutas_suficientes', 'rutas_faltan')) AS mensajes,
       (SELECT count(*) FROM seleccion_ajustes WHERE clave LIKE 'carta_firmante%') AS ajustes;
