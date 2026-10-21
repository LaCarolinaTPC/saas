-- Registros de ausentismo creados por Gestivo: «origen» y «pendiente por clasificar»
--
-- En la pantalla de Marcaciones, a quien aparecía en «sin despacho» había que
-- registrarlo a mano, uno por uno. Esto permite que Gestivo los escriba solo a
-- una hora configurable — pero sin inventar faltas, que es la parte delicada.
--
-- POR QUÉ NO SE CREAN COMO «NO JUSTIFICADA»
--
-- Gestivo no tiene calendario de turnos, así que «sin despacho» incluye a quien
-- simplemente descansaba. Medido sobre los datos reales: de lunes a viernes son
-- 4-13 personas; **domingos y festivos, 83-94**, casi todos descansos.
--
-- Y el módulo escala por días CALENDARIO: cuatro «No justificada» seguidas
-- notifican citación a descargos y cinco la terminación del contrato (ver
-- DIAS_DESCARGOS y DIAS_TERMINACION en src/lib/ausentismo/constants.ts). Crear
-- «no justificada» automáticamente habría puesto a decenas de conductores en un
-- proceso disciplinario por haber descansado un fin de semana largo.
--
-- Así que lo que se automatiza es la DIGITACIÓN, no el juicio: el registro entra
-- con tipo `pendiente`, no cuenta para nada, y una persona lo clasifica después.
-- La creación automática además solo corre en días hábiles y solo del día en
-- curso; la lógica y sus pruebas están en src/lib/biometrico/auto-pendientes.ts.
--
-- Qué hace:
--   1. columna `origen` en ausentismo_registros ('manual' | 'automatico')
--   2. índice único parcial para que dos pestañas no creen el mismo dos veces
--   3. el concepto «pendiente» en el catálogo, SIN contar reincidencia
--   4. comentarios
--
-- El tipo `pendiente` NO necesita cambios de esquema: la columna `tipo` se dejó
-- sin CHECK a propósito, justamente para poder agregar tipos sin migración.
--
-- Se aplica a mano en el SQL Editor. Es idempotente y se puede correr más de
-- una vez.

BEGIN;

-- =============================================================================
-- 1. De dónde salió el registro
-- =============================================================================
-- Por omisión 'manual': los 'automatico' son solo los que escribe Gestivo, y
-- todo lo que ya existe lo escribió una persona.
ALTER TABLE ausentismo_registros
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE ausentismo_registros
  DROP CONSTRAINT IF EXISTS ausentismo_registros_origen_chk;
ALTER TABLE ausentismo_registros
  ADD CONSTRAINT ausentismo_registros_origen_chk
  CHECK (origen IN ('manual', 'automatico'));

-- =============================================================================
-- 2. Que no se cree el mismo dos veces
-- =============================================================================
-- La pantalla dispara la creación al abrirse, así que dos pestañas abiertas a la
-- misma hora la dispararían a la vez. En vez de un candado en la aplicación, lo
-- impide la base: es la única forma de que no dependa de que el código acierte.
--
-- PARCIAL, solo sobre los automáticos: una persona sí puede registrar algo el
-- mismo día que Gestivo dejó un pendiente (de hecho es justo lo que hará al
-- clasificarlo si decide crear un registro aparte).
--
-- Al ser parcial, la aplicación NO puede usarlo con `ON CONFLICT`: Postgres
-- solo infiere un índice parcial si el `ON CONFLICT` repite su condición, y
-- PostgREST no sabe mandarla. Así que inserta derecho y trata el error 23505
-- como benigno (ver src/lib/biometrico/pendientes-auto.ts): el que pierde la
-- carrera no crea nada y la siguiente lectura de la pantalla completa lo que
-- falte.
CREATE UNIQUE INDEX IF NOT EXISTS ausentismo_registros_auto_dia_cedula_uq
  ON ausentismo_registros (fecha, cedula)
  WHERE origen = 'automatico';

-- Para la consulta de la pantalla: «qué dejó Gestivo hoy».
CREATE INDEX IF NOT EXISTS ausentismo_registros_origen_fecha_idx
  ON ausentismo_registros (origen, fecha DESC);

-- =============================================================================
-- 3. El concepto «pendiente» en el catálogo
-- =============================================================================
-- El catálogo vive en `ausentismo_conceptos` y es lo que la pantalla usa para
-- poner nombre a `ausentismo_registros.tipo`. Sin esta fila, los registros
-- automáticos saldrían con la clave cruda y el formulario no sabría nada de
-- ellos.
--
-- Lo importante son las tres banderas:
--   · cuenta_reincidencia = false  -> NO suma a la alerta de reincidentes.
--     Esta es la clave de todo el diseño: un «pendiente» es «todavía no se
--     sabe», no una falta. Con true, cada descanso de un día hábil habría
--     empezado a contar contra el conductor.
--   · exige_soporte = false        -> no se le pide soporte a quien aún no se
--     ha clasificado.
--   · orden = 1                    -> primero en la lista: es lo que hay que
--     resolver, así que conviene que esté arriba.
--
-- ON CONFLICT DO NOTHING: si alguien ya lo creó desde el formulario, se respeta
-- lo que haya puesto.
INSERT INTO ausentismo_conceptos
       (key, nombre, orden, activo, cuenta_reincidencia, exige_soporte, created_by_email)
VALUES ('pendiente', 'Pendiente por clasificar', 1, true, false, false, 'gestivo (automático)')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 4. Comentarios
-- =============================================================================
COMMENT ON COLUMN ausentismo_registros.origen IS
  'Quién escribió el registro: «manual» una persona, «automatico» Gestivo al pasar la hora configurada (ausentismo.pendientes_auto_hora en app_settings). Los automáticos nacen con tipo «pendiente» y no cuentan para el conteo de días seguidos que dispara descargos y terminación: existen para que alguien los clasifique.';

COMMENT ON COLUMN ausentismo_registros.tipo IS
  'Catálogo de la aplicación, sin CHECK para poder agregar tipos sin migración: incapacidad | permiso | vacaciones | descanso | suspension | calamidad | licencia | eps | taller | no_justificada | renuncia | pendiente | otra. «pendiente» es el que crea Gestivo solo y significa «sin clasificar todavía»; «no_justificada» es el único que escala a disciplinario.';

COMMIT;

-- =============================================================================
-- Comprobación (solo lectura)
-- =============================================================================
-- Esperado tras aplicarla y antes de que corra por primera vez:
--   origen manual = todos los registros que ya existían · automatico = 0
--   el índice único parcial existe
SELECT 'por origen' AS que,
       (SELECT string_agg(origen || '=' || n, ' ')
          FROM (SELECT origen, count(*) n FROM ausentismo_registros GROUP BY origen) t) AS valor
UNION ALL
SELECT 'con tipo pendiente',
       (SELECT count(*)::text FROM ausentismo_registros WHERE tipo = 'pendiente')
UNION ALL
SELECT 'indice unico parcial',
       EXISTS (SELECT 1 FROM pg_indexes
                WHERE indexname = 'ausentismo_registros_auto_dia_cedula_uq')::text
UNION ALL
SELECT 'restriccion de origen',
       EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ausentismo_registros_origen_chk')::text
UNION ALL
-- La que de verdad hay que mirar. Si esto dice «true», un pendiente contaría
-- como reincidencia y todo el diseño quedaría roto: debe decir «false».
SELECT 'OJO: pendiente cuenta reincidencia',
       coalesce((SELECT cuenta_reincidencia::text
                   FROM ausentismo_conceptos WHERE key = 'pendiente'),
                'NO EXISTE EL CONCEPTO');

-- =============================================================================
-- Vuelta atrás
-- =============================================================================
-- Borra los que haya creado Gestivo y deja la tabla como estaba:
--   DELETE FROM ausentismo_registros WHERE origen = 'automatico';
--   DROP INDEX IF EXISTS ausentismo_registros_auto_dia_cedula_uq;
--   DROP INDEX IF EXISTS ausentismo_registros_origen_fecha_idx;
--   ALTER TABLE ausentismo_registros DROP CONSTRAINT IF EXISTS ausentismo_registros_origen_chk;
--   ALTER TABLE ausentismo_registros DROP COLUMN IF EXISTS origen;
--
-- Y para apagarlo sin tocar la base: poner «no» en
--   app_settings donde key = 'ausentismo.pendientes_auto_activo'
