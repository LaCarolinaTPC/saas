-- ── Corrección: 22 pagos quedaron sellados con el 21 y pertenecen al 18 ──
--
-- El 21-jul el cajero estuvo cuadrando el día 18 (fecha operativa fijada en
-- 2026-07-18 a las 3:21 pm). A las 4:02 pm la fecha operativa se cambió a
-- "automática (día real)" y el sistema empezó a sellar los pagos con el 21; a
-- las 5:27 pm se devolvió a 2026-07-18. Los 22 movimientos registrados dentro
-- de esa ventana de 85 minutos quedaron con la fecha contable equivocada.
--
-- Bitácora de fecha operativa (tesoreria_audit_log, accion='fecha_operativa'):
--   21/07 3:21 pm  -> 2026-07-18        (registros posteriores: fecha 18 ✔)
--   21/07 4:02 pm  -> automática (real) (registros posteriores: fecha 21 ✘)
--   21/07 5:27 pm  -> 2026-07-18        (registros posteriores: fecha 18 ✔)
--
-- Alcance verificado al 22-jul-2026 (los 22 son exactamente los de la ventana):
--   · 22 movimientos, todos DEBITO activos, suma $1.246.301
--   · 22 conductores distintos, NINGUNO con pago activo ya en el 18
--   · ninguno trasladado aún a GEMA -> no hay que corregir asientos digitados
--   · periodo/quincena ya son 2026-07 / q2, los mismos del 18: la liquidación
--     quincenal no se mueve, solo el cierre de caja de cada día
--
-- Efecto: el 18 pasa de $1.740.694 a $2.986.995 y el 21 queda en $0.
-- Es idempotente: la ventana solo existe en filas con fecha = 2026-07-21.
--
-- Pegar en: Supabase → SQL Editor

BEGIN;

-- Constancia en la bitácora ANTES de mover, para conservar la fecha anterior.
INSERT INTO tesoreria_audit_log (
  user_email, accion, cedula_conductor, conductor_nombre, valor,
  modulo, resultado, valor_anterior, valor_nuevo, detalle
)
SELECT
  'sistema@migracion', 'correccion_fecha', e.cedula_conductor, e.conductor_nombre,
  e.valor_entregado, 'tesoreria', 'exitoso', e.fecha::text, '2026-07-18',
  jsonb_build_object(
    'motivo', 'Pago registrado mientras la fecha operativa estuvo en automático (21-jul 4:02-5:27 pm); corresponde al cierre del 18',
    'entrega_id', e.id,
    'registrado_el', e.created_at
  )
FROM devengados_entregas e
WHERE e.fecha = DATE '2026-07-21'
  AND e.created_at >= TIMESTAMPTZ '2026-07-21 16:02:00-05'
  AND e.created_at <= TIMESTAMPTZ '2026-07-21 17:27:00-05';

UPDATE devengados_entregas e
   SET fecha = DATE '2026-07-18'
 WHERE e.fecha = DATE '2026-07-21'
   AND e.created_at >= TIMESTAMPTZ '2026-07-21 16:02:00-05'
   AND e.created_at <= TIMESTAMPTZ '2026-07-21 17:27:00-05';

COMMIT;

-- Verificación 1: debe devolver 0 filas (nada quedó con fecha 21).
-- SELECT count(*) FROM devengados_entregas WHERE fecha = DATE '2026-07-21';

-- Verificación 2: el 18 debe sumar $2.986.995 en 56 pagos vigentes.
-- SELECT count(*) AS pagos, sum(valor_entregado) AS total
--   FROM devengados_entregas
--  WHERE fecha = DATE '2026-07-18' AND movimiento = 'DEBITO' AND estado = 'activa';
