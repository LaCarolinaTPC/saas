-- plan padrino v3 respuestas gestion humana y vigencia retroactiva
--
-- Contexto: Gestión Humana respondió las preguntas pendientes de la v3 de la
-- Política Plan Padrino (2026-11-07). Esta migración lleva esas decisiones al
-- BORRADOR de la v3 (la versión publicada no se toca) y prepara la
-- publicación retroactiva.
--
--  · Padrino: ningún cargo administrativo puede ser padrino, salvo el
--    instructor de conducción (que ya está en padrino_empleados_autorizados).
--    Vuelve la lista blanca de la v2: conductores y empleados autorizados.
--  · R1 (antecedentes internos del referido): se apaga.
--  · R6 a R9 (licencia, antecedentes, exámenes, PESV): si al contratar no se
--    cumplen, no se paga (bloquean, momento «al contratar»).
--  · R13 (hoja de vida registrada antes de la selección): se enciende. El
--    borrador se creó antes de que existiera y había quedado apagado.
--  · Reintegro (esquema C): se paga salvo despido con justa causa. Un fin de
--    contrato sí da derecho. Cuentan como justa causa: JUSTA_CAUSA,
--    ABANDONO_CARGO, BAJO_RENDIMIENTO, ACCIDENTALIDAD y PERIODO_PRUEBA.
--  · padrino_politicas_vigencia: admite un rango vacío (vigente_hasta =
--    vigente_desde - 1). Así queda una versión «reemplazada» que nunca rigió
--    cuando se publica otra, retroactiva, desde su misma fecha de inicio.
--
-- Los valores son los de PARAMETROS_V3 en src/lib/padrino/politica.ts. Se
-- cambian solo esas claves (jsonb_set): lo demás que se haya editado en el
-- borrador desde la pantalla se conserva.
--
-- No crea tablas: no hace falta GRANT. Se aplica a mano en el SQL Editor,
-- entero y de una sola vez. Es idempotente.

-- ── 1. Borrador de la v3 ────────────────────────────────────────────────────

UPDATE padrino_politicas
SET parametros =
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
    parametros,
    '{padrino,modo_empleados}', '"lista_blanca"'),
    '{padrino,excluidos}', '{"areas": [], "cargos": []}'),
    '{referido,reintegro,tipos_causa_permitidos}', '["voluntario", "empresa", "otro"]'),
    '{referido,reintegro,causas_que_excluyen}', '["JUSTA_CAUSA", "ABANDONO_CARGO", "BAJO_RENDIMIENTO", "ACCIDENTALIDAD", "PERIODO_PRUEBA"]'),
    '{requisitos,R1}', '{"activo": false, "bloquea": true, "momento": "registro"}'),
    '{requisitos,R6}', '{"activo": true, "bloquea": true, "momento": "contratacion"}'),
    '{requisitos,R7}', '{"activo": true, "bloquea": true, "momento": "contratacion"}'),
    '{requisitos,R8}', '{"activo": true, "bloquea": true, "momento": "contratacion"}'),
    '{requisitos,R9}', '{"activo": true, "bloquea": true, "momento": "contratacion"}'),
    '{requisitos,R13}', '{"activo": true, "bloquea": true, "momento": "registro"}'),
    '{esquemas,C,condicion}', '"Extrabajador con 6 meses o más por fuera, sin despido con justa causa y sin pago previo de padrino"'),
  esquemas = CASE
    WHEN esquemas ? 'C' THEN jsonb_set(esquemas, '{C,condicion}', '"Extrabajador con 6 meses o más por fuera, sin despido con justa causa y sin pago previo de padrino"')
    ELSE esquemas
  END
WHERE version = 'v3'
  AND estado = 'borrador'
  AND parametros IS NOT NULL;

-- ── 2. Vigencia: una versión puede quedar reemplazada (rango vacío) ─────────

ALTER TABLE padrino_politicas DROP CONSTRAINT IF EXISTS padrino_politicas_vigencia;
ALTER TABLE padrino_politicas ADD CONSTRAINT padrino_politicas_vigencia
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde - 1);

COMMENT ON CONSTRAINT padrino_politicas_vigencia ON padrino_politicas IS
  'vigente_hasta = vigente_desde - 1: la versión fue reemplazada por otra publicada retroactivamente desde su misma fecha y nunca rigió.';

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT version, estado, vigente_desde, vigente_hasta,
       parametros #>> '{padrino,modo_empleados}' AS modo_empleados,
       parametros #> '{referido,reintegro,causas_que_excluyen}' AS causas_que_excluyen,
       parametros #> '{requisitos,R1}' AS r1,
       parametros #> '{requisitos,R8}' AS r8,
       parametros #> '{requisitos,R13}' AS r13
FROM padrino_politicas ORDER BY created_at;
