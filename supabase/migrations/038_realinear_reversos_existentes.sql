-- ── Realineación de los reversos ya registrados (acompaña a la 037) ──
--
-- Los reversos creados antes de la 037 quedaron con la fecha operativa del día
-- en que se registró la devolución. Esto los devuelve a la fecha contable de la
-- entrega que anulan, para que débito y crédito queden en el mismo día.
--
-- Al 22-jul-2026 esto afecta 2 filas (SUÁREZ $66.014 y BORREGO $91.192,
-- entregas del 16 devueltas el 21). Los 13 reversos anteriores ya estaban
-- alineados. Es idempotente: correrlo de nuevo no cambia nada.
--
-- Pegar en: Supabase → SQL Editor

BEGIN;

-- Constancia en la bitácora ANTES de mover, para conservar la fecha anterior.
INSERT INTO tesoreria_audit_log (
  user_email, accion, cedula_conductor, conductor_nombre, valor,
  modulo, resultado, valor_anterior, valor_nuevo, detalle
)
SELECT
  'sistema@migracion', 'correccion_fecha', r.cedula_conductor, r.conductor_nombre,
  r.valor_entregado, 'tesoreria', 'exitoso', r.fecha::text, o.fecha::text,
  jsonb_build_object(
    'motivo', 'Reverso realineado a la fecha contable de la entrega original (migración 037/038)',
    'reverso_id', r.id,
    'entrega_id', o.id,
    'registrado_el', r.created_at::date
  )
FROM devengados_entregas r
JOIN devengados_entregas o ON o.id = r.devolucion_de
WHERE r.movimiento = 'CREDITO'
  AND (r.fecha, r.periodo, r.quincena) IS DISTINCT FROM (o.fecha, o.periodo, o.quincena);

UPDATE devengados_entregas r
   SET fecha = o.fecha,
       periodo = o.periodo,
       quincena = o.quincena
  FROM devengados_entregas o
 WHERE o.id = r.devolucion_de
   AND r.movimiento = 'CREDITO'
   AND (r.fecha, r.periodo, r.quincena) IS DISTINCT FROM (o.fecha, o.periodo, o.quincena);

COMMIT;

-- Verificación: debe devolver 0 filas.
-- SELECT r.id, r.fecha AS fecha_reverso, o.fecha AS fecha_entrega
--   FROM devengados_entregas r
--   JOIN devengados_entregas o ON o.id = r.devolucion_de
--  WHERE r.movimiento = 'CREDITO' AND r.fecha <> o.fecha;
