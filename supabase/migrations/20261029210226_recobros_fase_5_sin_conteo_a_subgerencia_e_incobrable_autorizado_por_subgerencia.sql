-- recobros fase 5 sin conteo a subgerencia e incobrable autorizado por subgerencia
--
-- Contexto: la fase 5 del módulo de Recobros trae las acciones por rol a la
-- página /tesoreria/recobros (gestión diaria de caja, subgerencia, Operativo,
-- correcciones, incobrable y liquidación definitiva). Esta migración deja los
-- datos y las reglas listos para eso:
--
-- 1. Los recobros de cámara que quedaron sin conteo (los `sensor_recobro`
--    viejos, con la alerta `sin_conteo_camara` de la fase 1) pasan a
--    resultado `sin_conteo`: los decide subgerencia. Solo los que caja no ha
--    tocado (sin cobro, sin gestiones y sin incobrable pedido); los demás
--    conservan la alerta para revisarlos a mano.
-- 2. Un incobrable cerrado desde ahora exige quién lo autorizó en subgerencia,
--    la fecha y el soporte (decisión D1 del 29-oct-2026). Los cerrados antes
--    no se tocan.
-- 3. Subgerencia puede decidir cobrar con las timbradas que fija ella misma
--    (no hay conteo de cámara): se guardan en `diferencia`.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).

BEGIN;

-- ── 1. Sin conteo → decide subgerencia ───────────────────────────────────────
WITH movidas AS (
  UPDATE tesoreria_camaras_solicitudes s
     SET resultado = 'sin_conteo',
         valor_recobro = NULL,
         alertas = array_remove(s.alertas, 'sin_conteo_camara')
   WHERE s.tipo = 'camara'
     AND s.resultado = 'recobro'
     AND s.conteo_camara IS NULL
     AND 'sin_conteo_camara' = ANY (s.alertas)
     AND s.cobro_estado IS NULL
     AND s.incobrable_solicitado_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM tesoreria_camaras_recobro_gestiones g WHERE g.solicitud_id = s.id)
  RETURNING s.id
)
INSERT INTO tesoreria_camaras_solicitudes_eventos (solicitud_id, accion, antes, despues, usuario_email)
SELECT id, 'revision_resuelta', jsonb_build_object('resultado', 'recobro'),
       jsonb_build_object('resultado', 'sin_conteo', 'motivo', 'Recobro marcado solo por el sensor, sin conteo de cámara'),
       'migracion 20261029210226'
  FROM movidas;

-- ── 2. Incobrable: quién lo autorizó en subgerencia ──────────────────────────
ALTER TABLE tesoreria_camaras_solicitudes
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_incobrable_subgerencia_check;
ALTER TABLE tesoreria_camaras_solicitudes
  ADD CONSTRAINT tesoreria_camaras_solicitudes_incobrable_subgerencia_check CHECK (
    cobro_estado IS DISTINCT FROM 'incobrable'
    OR incobrable_autorizado_at < TIMESTAMPTZ '2026-10-30 00:00:00-05'
    OR (length(trim(coalesce(incobrable_autoriza_nombre, ''))) BETWEEN 1 AND 120
        AND incobrable_autoriza_fecha IS NOT NULL
        AND length(trim(coalesce(incobrable_soporte, ''))) BETWEEN 1 AND 200)
  );

-- ── 3. Cobrar sin conteo: las timbradas las fija subgerencia ─────────────────
ALTER TABLE tesoreria_camaras_solicitudes
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_subgerencia_cobra_check;
ALTER TABLE tesoreria_camaras_solicitudes
  ADD CONSTRAINT tesoreria_camaras_solicitudes_subgerencia_cobra_check CHECK (
    subgerencia_decision IS DISTINCT FROM 'cobrar'
    OR (diferencia > 0 AND valor_recobro > 0)
  );

COMMIT;

-- Verificación:
-- SELECT resultado, count(*), count(*) FILTER (WHERE 'sin_conteo_camara' = ANY (alertas)) AS con_alerta
--   FROM tesoreria_camaras_solicitudes WHERE tipo = 'camara' GROUP BY 1;
--   -- los que quedan con alerta tenían gestiones o cobro: revisarlos a mano.
