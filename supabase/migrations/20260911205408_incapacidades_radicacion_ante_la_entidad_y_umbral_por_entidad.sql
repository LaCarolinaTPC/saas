-- incapacidades: radicacion ante la entidad y umbral por entidad
--
-- Contexto: liquidar dice cuánto se reclama; radicar es pedírselo a la EPS o a
-- la ARL y quedarse con el código que la entidad devuelve. Hoy eso vive en
-- tres columnas del libro Excel (fecha de solicitud, fecha de radicación y
-- código) sin estado, sin devoluciones y sin saber quién lo registró; y la
-- marca «cobrada» era un SI/NO escrito a mano que no consultaba nada.
--
-- Fase 4 del plan `docs/Plan_desarrollo_incapacidades_GESTIVO.md`. Aquí:
--   * `incapacidad_radicaciones`: solicitud y radicado con código, fechas,
--     valor, devolución y anulación con motivo. «Cobrada» pasa a derivarse de
--     la existencia de una radicación en estado radicada (sección 16).
--   * El código de radicación es único por entidad entre las no anuladas: dos
--     expedientes no pueden llevar el mismo radicado.
--   * Una incapacidad por debajo del umbral de días de SU entidad
--     (`ausentismo_catalogos.dias_min_cobro`, decisión 12.17) solo se radica
--     con una excepción escrita.
--   * Decisión 12.10 (cardinalidad) sigue abierta: se asume una radicación
--     activa por expediente a la vez; una devolución permite radicar de nuevo.
--   * La vista de lectura suma la radicación activa.
--
-- Requiere la migración 20260911201033 (expediente, reglas, catálogo).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── 1. Radicaciones ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incapacidad_radicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE,
  entidad_catalogo_id UUID NOT NULL REFERENCES ausentismo_catalogos (id),
  -- solicitada: se pidió a la entidad, sin código todavía. radicada: con
  -- código y fecha. devuelta: la entidad la rechazó; se puede radicar otra.
  -- anulada: error de captura; conserva la evidencia.
  estado TEXT NOT NULL DEFAULT 'solicitada'
    CHECK (estado IN ('solicitada', 'radicada', 'devuelta', 'anulada')),
  fecha_solicitud DATE NOT NULL,
  fecha_radicacion DATE,
  codigo_radicacion TEXT,
  -- Lo que se reclamó en ese momento (el valor_reclamado del expediente).
  valor_reclamado NUMERIC(14,2) NOT NULL CHECK (valor_reclamado >= 0),
  -- La liquidación vigente cuando se radicó, para explicar el valor.
  liquidacion_id UUID REFERENCES incapacidad_liquidaciones (id),
  -- Radicada por debajo del umbral de días de la entidad: exige excepción.
  bajo_umbral BOOLEAN NOT NULL DEFAULT false,
  excepcion_motivo TEXT,
  motivo_devolucion TEXT,
  devuelta_at TIMESTAMPTZ,
  observaciones TEXT,
  registrada_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulada_at TIMESTAMPTZ,
  anulada_por_email TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT incapacidad_radicaciones_excepcion_con_motivo
    CHECK (NOT bajo_umbral OR length(btrim(COALESCE(excepcion_motivo, ''))) >= 10),
  CONSTRAINT incapacidad_radicaciones_radicada_con_codigo
    CHECK (estado <> 'radicada' OR (codigo_radicacion IS NOT NULL AND fecha_radicacion IS NOT NULL)),
  CONSTRAINT incapacidad_radicaciones_fechas
    CHECK (fecha_radicacion IS NULL OR fecha_radicacion >= fecha_solicitud)
);

-- Un radicado no se repite ante la misma entidad (salvo el anulado).
CREATE UNIQUE INDEX IF NOT EXISTS ux_incapacidad_radicaciones_codigo
  ON incapacidad_radicaciones (entidad_catalogo_id, upper(btrim(codigo_radicacion)))
  WHERE codigo_radicacion IS NOT NULL AND estado <> 'anulada';

-- Una radicación activa por expediente a la vez (12.10, supuesto del plan).
CREATE UNIQUE INDEX IF NOT EXISTS ux_incapacidad_radicaciones_activa
  ON incapacidad_radicaciones (expediente_id)
  WHERE estado IN ('solicitada', 'radicada');

CREATE INDEX IF NOT EXISTS idx_incapacidad_radicaciones_expediente
  ON incapacidad_radicaciones (expediente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incapacidad_radicaciones_entidad
  ON incapacidad_radicaciones (entidad_catalogo_id, estado);

DROP TRIGGER IF EXISTS trg_incapacidad_radicaciones_updated_at ON incapacidad_radicaciones;
CREATE TRIGGER trg_incapacidad_radicaciones_updated_at
  BEFORE UPDATE ON incapacidad_radicaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. La vista suma la radicación activa ────────────────────────────────────
-- «Cobrada» = existe una radicación en estado radicada. No se captura a mano.

DROP VIEW IF EXISTS vw_incapacidad_expedientes;
CREATE VIEW vw_incapacidad_expedientes AS
SELECT
  e.id,
  e.ausentismo_id,
  e.recibido_at,
  e.recibido_desde,
  e.matriz_cambio_pendiente,
  e.persona_fuente,
  e.salario_base,
  e.salario_vigencia_desde,
  e.salario_fuente,
  e.tipo_homologado,
  e.entidad_catalogo_id,
  e.entidad_nombre_recibido,
  e.pendiente_homologacion,
  e.modalidad_ajustada,
  e.dias_entidad_ajustados,
  e.valor_reclamado_ajustado,
  e.responsable_email,
  e.estado,
  e.motivo_excepcion,
  e.valor_reclamado,
  e.proxima_accion,
  e.proxima_accion_fecha,
  e.observaciones,
  e.alta_manual_motivo,
  e.version,
  e.updated_at,
  -- De la matriz (solo lectura).
  a.cedula,
  a.nombre,
  a.cargo,
  a.tipo_conductor,
  a.consecutivo_incapacidad,
  a.fecha_inicio,
  a.fecha_fin,
  a.dias_it_pagados            AS dias_incapacidad,
  a.origen,
  a.indicador_prorroga,
  incapacidad_pagador(a)       AS pagador_recibido,
  a.cie10,
  a.diagnostico,
  a.origen_registro,
  a.eliminado_at               AS matriz_eliminada_at,
  -- Entidad homologada.
  c.nombre                     AS entidad_nombre,
  c.clase                      AS entidad_clase,
  c.nit                        AS entidad_nit,
  c.dias_min_cobro             AS entidad_dias_min_cobro,
  (a.dias_it_pagados IS NOT NULL AND a.dias_it_pagados >= COALESCE(
      c.dias_min_cobro,
      CASE WHEN upper(a.origen) IN ('AT', 'EL') THEN 1 ELSE 4 END)) AS cobrable,
  -- Liquidación vigente.
  l.id                         AS liquidacion_id,
  l.regla_codigo,
  l.dias_entidad,
  l.dias_empresa,
  l.valor_total,
  l.valor_entidad,
  l.valor_empresa,
  l.calculado_at,
  (SELECT count(*) FROM incapacidad_ajustes_liquidacion j WHERE j.expediente_id = e.id) AS ajustes,
  (SELECT count(*) FROM incapacidad_adjuntos d WHERE d.expediente_id = e.id AND d.anulado_at IS NULL) AS adjuntos,
  -- Radicación activa (solicitada o radicada).
  r.id                         AS radicacion_id,
  r.estado                     AS radicacion_estado,
  r.codigo_radicacion          AS radicacion_codigo,
  r.fecha_solicitud            AS radicacion_fecha_solicitud,
  r.fecha_radicacion           AS radicacion_fecha,
  r.valor_reclamado            AS radicacion_valor,
  r.bajo_umbral                AS radicacion_bajo_umbral,
  (r.estado = 'radicada')      AS cobrada,
  (SELECT count(*) FROM incapacidad_radicaciones x WHERE x.expediente_id = e.id AND x.estado = 'devuelta') AS devoluciones
FROM incapacidad_expedientes e
JOIN ausentismo a ON a.id = e.ausentismo_id
LEFT JOIN ausentismo_catalogos c ON c.id = e.entidad_catalogo_id
LEFT JOIN incapacidad_liquidaciones l ON l.expediente_id = e.id AND l.es_vigente
LEFT JOIN incapacidad_radicaciones r ON r.expediente_id = e.id AND r.estado IN ('solicitada', 'radicada')
WHERE e.eliminado_at IS NULL;

-- ── 3. Accesos ───────────────────────────────────────────────────────────────

ALTER TABLE incapacidad_radicaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incapacidad_radicaciones, vw_incapacidad_expedientes FROM anon, authenticated, public;
GRANT ALL ON incapacidad_radicaciones TO service_role;
GRANT SELECT ON vw_incapacidad_expedientes TO service_role;

COMMENT ON TABLE incapacidad_radicaciones IS
  'Solicitud y radicado de una incapacidad ante la EPS o la ARL: código único por entidad, fechas, valor reclamado, devolución y anulación con motivo. «Cobrada» se deriva del estado radicada. Bajo el umbral de días de la entidad exige excepción escrita.';

-- ── 4. Comprobación ──────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables WHERE table_name = 'incapacidad_radicaciones';
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'vw_incapacidad_expedientes' AND column_name IN ('radicacion_id', 'cobrada', 'devoluciones')
 ORDER BY column_name;
SELECT indexname FROM pg_indexes WHERE tablename = 'incapacidad_radicaciones' ORDER BY indexname;
