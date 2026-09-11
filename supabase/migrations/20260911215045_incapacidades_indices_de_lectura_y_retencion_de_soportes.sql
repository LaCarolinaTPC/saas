-- incapacidades: indices de lectura y retencion de soportes
--
-- Contexto: fase 7 del plan `docs/Plan_desarrollo_incapacidades_GESTIVO.md`
-- (endurecimiento). El módulo arranca con 23 expedientes, pero la bandeja,
-- la conciliación y el tablero leen la vista completa en cada carga, y la
-- vista resuelve por expediente la liquidación vigente, la radicación activa,
-- los abonos y los ajustes. Con miles de expedientes eso se paga en cada
-- LEFT JOIN LATERAL si falta un índice que case con el filtro parcial. Aquí:
--   * Índices que cubren exactamente los filtros de la vista y el orden de la
--     bandeja (recibido_at DESC, id).
--   * Índice por fecha de inicio en la matriz, que es la llave del corte
--     (`incapacidad_entra_por_corte`) y del alta manual.
--   * Retención de soportes: un parámetro (días) y una vista que lista los
--     soportes anulados que ya cumplieron la retención. NO se borra nada de
--     forma automática: la depuración es una decisión de Administración y
--     queda documentada en docs/incapacidades-fase-7.md.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── 1. Índices de lectura ────────────────────────────────────────────────────

-- Orden de la bandeja y de la consulta (recibido_at DESC, id).
CREATE INDEX IF NOT EXISTS idx_incapacidad_expedientes_recibido
  ON incapacidad_expedientes (recibido_at DESC, id) WHERE eliminado_at IS NULL;

-- Filtros de la bandeja: por entidad y por cambios pendientes de la matriz.
CREATE INDEX IF NOT EXISTS idx_incapacidad_expedientes_cambio
  ON incapacidad_expedientes (matriz_cambio_pendiente) WHERE matriz_cambio_pendiente;

-- La llave del corte y de la búsqueda del alta manual por cédula.
CREATE INDEX IF NOT EXISTS idx_ausentismo_fecha_inicio
  ON ausentismo (fecha_inicio) WHERE eliminado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ausentismo_cedula_inicio
  ON ausentismo (cedula, fecha_inicio DESC) WHERE eliminado_at IS NULL;

-- Los LATERAL de la vista: abonos por expediente (ya cubierto por
-- idx_incapacidad_aplicaciones_expediente), recaudos vigentes por id para el
-- JOIN con el recaudo no anulado.
CREATE INDEX IF NOT EXISTS idx_incapacidad_recaudos_vigentes
  ON incapacidad_recaudos (id) WHERE anulado_at IS NULL;

-- Bitácora del expediente: la ficha lee por registro_id ordenado por fecha.
CREATE INDEX IF NOT EXISTS idx_ausentismo_log_registro_fecha
  ON ausentismo_log (registro_id, created_at DESC);

-- Auditoría deduplicada de consultas: (modulo, accion, user_email, created_at).
CREATE INDEX IF NOT EXISTS idx_tesoreria_audit_modulo_accion_usuario
  ON tesoreria_audit_log (modulo, accion, user_email, created_at DESC);

-- ── 2. Retención de soportes ─────────────────────────────────────────────────
-- Un soporte anulado se conserva este número de días desde su anulación.
-- Después aparece en la vista de depuración; borrarlo del bucket y de la
-- tabla es una acción manual de Administración, con la vista como lista.
INSERT INTO incapacidad_parametros (clave, valor, descripcion) VALUES
  ('retencion_soportes_dias', '1825'::jsonb,
   'Días que se conserva un soporte anulado antes de poder depurarlo del bucket. 1825 = 5 años. Los soportes vigentes no se depuran nunca.')
ON CONFLICT (clave) DO NOTHING;

DROP VIEW IF EXISTS vw_incapacidad_soportes_depurables;
CREATE VIEW vw_incapacidad_soportes_depurables AS
SELECT
  d.id,
  d.expediente_id,
  d.archivo_ruta,
  d.archivo_nombre,
  d.archivo_tamano,
  d.anulado_at,
  d.anulado_por_email,
  d.motivo_anulacion,
  (now() - d.anulado_at) AS anulado_hace
FROM incapacidad_adjuntos d
WHERE d.anulado_at IS NOT NULL
  AND d.anulado_at < now() - make_interval(days =>
        COALESCE((SELECT (valor #>> '{}')::int FROM incapacidad_parametros WHERE clave = 'retencion_soportes_dias'), 1825));

REVOKE ALL ON vw_incapacidad_soportes_depurables FROM anon, authenticated, public;
GRANT SELECT ON vw_incapacidad_soportes_depurables TO service_role;

COMMENT ON VIEW vw_incapacidad_soportes_depurables IS
  'Soportes anulados que ya cumplieron la retención (parámetro retencion_soportes_dias). Lista para depurar a mano; nada se borra solo.';

-- ── 3. Comprobación ──────────────────────────────────────────────────────────
SELECT indexname FROM pg_indexes
 WHERE indexname IN (
   'idx_incapacidad_expedientes_recibido', 'idx_incapacidad_expedientes_cambio', 'idx_ausentismo_fecha_inicio',
   'idx_ausentismo_cedula_inicio', 'idx_incapacidad_recaudos_vigentes', 'idx_ausentismo_log_registro_fecha',
   'idx_tesoreria_audit_modulo_accion_usuario')
 ORDER BY indexname;
SELECT clave, valor FROM incapacidad_parametros ORDER BY clave;
SELECT count(*) AS soportes_depurables FROM vw_incapacidad_soportes_depurables;
-- Plan de la bandeja: debe usar idx_incapacidad_expedientes_recibido y los
-- índices parciales de los LATERAL, sin Seq Scan sobre las tablas del módulo.
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM vw_incapacidad_expedientes ORDER BY recibido_at DESC, id LIMIT 1000;
