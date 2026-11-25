-- Selección: el reconocimiento de ruta tiene su propio encargado
--
-- Contexto (24-nov-2026): el reconocimiento de ruta no lo hace el profesor de
-- manejo (su labor termina en «Listo para exámenes»). Ahora:
--   * Hay una pantalla propia, «Reconocimiento de ruta» (/reconocimiento), con
--     su permiso y el rol «Coordinador de rutas»: registra las rutas hechas y
--     las que faltan, cita (día y hora a su elección) y da la fase por terminada.
--   * Al citar a la fase 1 (después de la respuesta del banco) le llega al
--     aspirante un mensaje de que debe hacer el reconocimiento, con la pregunta
--     de cuántas rutas conoce. Si dice que conoce las suficientes, queda «por
--     verificar»; si no, «pendiente» de citar. La pregunta sale del mensaje de
--     la fase 2.
--   * Gestivo ya no cita solo al reconocimiento; lo cita el encargado.
--   * Para contratar cuenta el reconocimiento terminado.
-- Lo atienden src/lib/seleccion/reconocimiento*.ts y respuestas-examenes*.ts.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

-- ── 1. En qué va el reconocimiento, en el proceso ───────────────────────────
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS reconocimiento_estado TEXT;
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_reconocimiento_estado_chk;
ALTER TABLE procesos_contratacion
  ADD CONSTRAINT procesos_contratacion_reconocimiento_estado_chk CHECK (reconocimiento_estado IN ('pendiente', 'por_verificar', 'en_curso', 'finalizado'));
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS reconocimiento_aviso_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS reconocimiento_finalizado_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS reconocimiento_finalizado_por TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS reconocimiento_nota TEXT;
COMMENT ON COLUMN procesos_contratacion.reconocimiento_estado IS 'pendiente (hay que citarlo) | por_verificar (dice que conoce las rutas) | en_curso | finalizado (lo dio por terminado el encargado).';

-- ── 2. Mensajes ─────────────────────────────────────────────────────────────
-- El aviso de la fase 1 (después de la respuesta del banco): sale fuera de las 24 horas con su plantilla.
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables,
  plantilla_nombre, plantilla_variables, plantilla_botones, plantilla_categoria, plantilla_estado)
VALUES ('reconocimiento_aviso', 'Aviso del reconocimiento de ruta', 'Fase 1, después de la respuesta del banco', 103,
   $t$Señor(a) {nombre}, como parte de su proceso de selección también deberá realizar el reconocimiento de las rutas de la empresa.
¿Conoce ya algunas rutas de la empresa? Por favor, indíquenos cuántas.
Esta información nos permitirá orientarlo sobre los siguientes pasos. ¡Muchas gracias!$t$,
   $t$Señor(a) {nombre}, como parte de su proceso de selección también deberá realizar el reconocimiento de las rutas de la empresa.
¿Conoce ya algunas rutas de la empresa? Por favor, indíquenos cuántas.
Esta información nos permitirá orientarlo sobre los siguientes pasos. ¡Muchas gracias!$t$,
   'automatico', ARRAY['nombre'], 'sel_reconocimiento_aviso', ARRAY['nombre'], ARRAY[]::text[], 'UTILITY', NULL)
ON CONFLICT (clave) DO NOTHING;

-- Las respuestas a cuántas rutas conoce (al momento, sin plantilla).
UPDATE seleccion_mensajes
SET texto = $t$¡Excelente! Muchas gracias por la información.
La persona encargada del reconocimiento de rutas lo verificará con usted y le indicará los siguientes pasos.
¡Muchos éxitos!$t$,
    texto_sugerido = $t$¡Excelente! Muchas gracias por la información.
La persona encargada del reconocimiento de rutas lo verificará con usted y le indicará los siguientes pasos.
¡Muchos éxitos!$t$,
    cuando = 'Responde que conoce las rutas mínimas (queda por verificar)',
    updated_at = now()
WHERE clave = 'rutas_suficientes';

UPDATE seleccion_mensajes
SET texto = $t$Gracias por la información.
En ese caso, deberá realizar el proceso de reconocimiento y aprendizaje de rutas. La persona encargada le enviará la citación con el día y la hora.
Le recordamos que es muy importante dedicar tiempo a este proceso y aprender adecuadamente los recorridos, ya que el conocimiento de las rutas es fundamental para el desempeño de las funciones del cargo.
¡Muchos éxitos!$t$,
    texto_sugerido = $t$Gracias por la información.
En ese caso, deberá realizar el proceso de reconocimiento y aprendizaje de rutas. La persona encargada le enviará la citación con el día y la hora.
Le recordamos que es muy importante dedicar tiempo a este proceso y aprender adecuadamente los recorridos, ya que el conocimiento de las rutas es fundamental para el desempeño de las funciones del cargo.
¡Muchos éxitos!$t$,
    cuando = 'Responde que conoce menos rutas que el mínimo (hay que citarlo)',
    updated_at = now()
WHERE clave = 'rutas_faltan';

-- La fase 2 ya no pregunta por las rutas (se pregunta en la fase 1).
UPDATE seleccion_mensajes
SET texto = $t$Buen día, señor(a) {nombre}.
Nos permitimos informarle que ha avanzado a la segunda fase de exámenes médicos dentro de su proceso de selección con Empresa Metropolitana de Transporte La Carolina S.A.S.
Por este motivo, deberá presentarse nuevamente en el laboratorio donde realizó la primera fase:
📍 Laboratorio: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
¡Importante! Para esta segunda fase deberá asistir en completo ayuno, siguiendo las indicaciones médicas correspondientes.
¡Muchas gracias!$t$,
    texto_sugerido = $t$Buen día, señor(a) {nombre}.
Nos permitimos informarle que ha avanzado a la segunda fase de exámenes médicos dentro de su proceso de selección con Empresa Metropolitana de Transporte La Carolina S.A.S.
Por este motivo, deberá presentarse nuevamente en el laboratorio donde realizó la primera fase:
📍 Laboratorio: {laboratorio}
📅 Fecha: {fecha}
⏰ Hora: {hora}
¡Importante! Para esta segunda fase deberá asistir en completo ayuno, siguiendo las indicaciones médicas correspondientes.
¡Muchas gracias!$t$,
    updated_at = now()
WHERE clave = 'examenes_fase2';

-- ── 3. Rol del encargado ────────────────────────────────────────────────────
INSERT INTO roles (clave, nombre, descripcion, es_super, es_sistema, activo)
VALUES ('coordinador_rutas', 'Coordinador de rutas',
        'Registra el reconocimiento de ruta de los aspirantes: rutas hechas y faltantes, citaciones y fin de la fase. Solo ve su pantalla.',
        false, false, true)
ON CONFLICT (clave) DO NOTHING;
INSERT INTO rol_permisos (rol, permiso) VALUES
  ('coordinador_rutas', 'reconocimiento.ver'),
  ('coordinador_rutas', 'reconocimiento.editar')
ON CONFLICT (rol, permiso) DO NOTHING;

SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'procesos_contratacion' AND column_name LIKE 'reconocimiento_%') AS columnas,
       (SELECT count(*) FROM seleccion_mensajes WHERE clave = 'reconocimiento_aviso') AS aviso,
       (SELECT count(*) FROM rol_permisos WHERE rol = 'coordinador_rutas') AS permisos;
