-- incapacidades: recaudos, aplicaciones, ajustes y conciliacion
--
-- Contexto: radicar dice cuánto se pidió; falta saber cuánto giró la entidad,
-- a qué incapacidades se aplicó y cuánto queda. El libro Excel lo resolvía con
-- una sola celda de «valor pagado» por fila y tres fórmulas que se
-- contradecían: PAGADA marcaba SI con cualquier pago mayor que 1 aunque fuera
-- parcial, PENDIENTE no restaba lo pagado, y el indicador de conciliación
-- comparaba contra lo cobrado sin tolerancia. Aquí un recaudo es un giro real
-- de la entidad que se aplica a uno o varios expedientes, y el saldo se
-- calcula, nunca se digita.
--
-- Fase 5 del plan `docs/Plan_desarrollo_incapacidades_GESTIVO.md`. Decisiones
-- que este script asume mientras 12.5 y 12.6 siguen POR CONFIRMAR:
--   * Base exigible del saldo = valor reclamado del expediente. La vista
--     expone los tres componentes por separado.
--   * Tolerancia de conciliación = parámetro `tolerancia_conciliacion`,
--     semilla 0 (exacto, como el libro); la cambia el administrador.
--   * Tipos de ajuste: glosa aceptada, descuento de la entidad, diferencia de
--     redondeo, corrección y nota informativa. El signo lo da el valor; si
--     extingue saldo lo dice la fila. Un ajuste no se edita: se anula con
--     motivo y se registra otro.
--   * Un abono parcial NUNCA cierra. Cerrar con saldo exige excepción escrita.
--
-- Requiere las migraciones 20260911201033 y 20260911205408.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── 1. Parámetro de tolerancia ───────────────────────────────────────────────
INSERT INTO incapacidad_parametros (clave, valor, descripcion) VALUES
  ('tolerancia_conciliacion', '0'::jsonb,
   'Diferencia máxima, en pesos, entre lo reclamado y lo recaudado (más ajustes) para dar un expediente por conciliado. 0 = exacto.')
ON CONFLICT (clave) DO NOTHING;

-- ── 2. Cierre del expediente ─────────────────────────────────────────────────
ALTER TABLE incapacidad_expedientes
  ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cerrado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS motivo_cierre TEXT,
  -- true cuando se cerró con saldo fuera de la tolerancia, con excepción escrita.
  ADD COLUMN IF NOT EXISTS cierre_por_excepcion BOOLEAN;

-- ── 3. Recaudos: giros reales de la entidad ──────────────────────────────────
CREATE TABLE IF NOT EXISTS incapacidad_recaudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_catalogo_id UUID NOT NULL REFERENCES ausentismo_catalogos (id),
  fecha_giro DATE NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  -- Número de transferencia, consignación o nota de la entidad.
  referencia TEXT,
  medio TEXT CHECK (medio IN ('transferencia', 'consignacion', 'cruce', 'cheque', 'otro')),
  observaciones TEXT,
  registrado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_at TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_incapacidad_recaudos_entidad
  ON incapacidad_recaudos (entidad_catalogo_id, fecha_giro DESC) WHERE anulado_at IS NULL;
-- Una misma referencia no se registra dos veces para la misma entidad.
CREATE UNIQUE INDEX IF NOT EXISTS ux_incapacidad_recaudos_referencia
  ON incapacidad_recaudos (entidad_catalogo_id, upper(btrim(referencia)))
  WHERE referencia IS NOT NULL AND anulado_at IS NULL;

DROP TRIGGER IF EXISTS trg_incapacidad_recaudos_updated_at ON incapacidad_recaudos;
CREATE TRIGGER trg_incapacidad_recaudos_updated_at
  BEFORE UPDATE ON incapacidad_recaudos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. Aplicaciones: qué parte de cada recaudo va a cada expediente ──────────
CREATE TABLE IF NOT EXISTS incapacidad_recaudo_aplicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recaudo_id UUID NOT NULL REFERENCES incapacidad_recaudos (id) ON DELETE RESTRICT,
  expediente_id UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE RESTRICT,
  -- La radicación que se estaba cobrando, para explicar la aplicación.
  radicacion_id UUID REFERENCES incapacidad_radicaciones (id),
  valor_aplicado NUMERIC(14,2) NOT NULL CHECK (valor_aplicado > 0),
  aplicado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulada_at TIMESTAMPTZ,
  anulada_por_email TEXT,
  motivo_anulacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_incapacidad_aplicaciones_expediente
  ON incapacidad_recaudo_aplicaciones (expediente_id) WHERE anulada_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_incapacidad_aplicaciones_recaudo
  ON incapacidad_recaudo_aplicaciones (recaudo_id) WHERE anulada_at IS NULL;

-- Σ aplicaciones vigentes ≤ valor del recaudo. Se comprueba en la base para
-- que dos personas aplicando el mismo recaudo a la vez no lo repartan dos veces.
CREATE OR REPLACE FUNCTION incapacidad_aplicacion_no_excede()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_valor NUMERIC(14,2);
  v_aplicado NUMERIC(14,2);
BEGIN
  IF NEW.anulada_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Bloquea el recaudo mientras se suma.
  SELECT valor INTO v_valor FROM incapacidad_recaudos WHERE id = NEW.recaudo_id FOR UPDATE;
  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'El recaudo % no existe.', NEW.recaudo_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT COALESCE(sum(valor_aplicado), 0) INTO v_aplicado
  FROM incapacidad_recaudo_aplicaciones
  WHERE recaudo_id = NEW.recaudo_id AND anulada_at IS NULL AND id <> NEW.id;
  IF v_aplicado + NEW.valor_aplicado > v_valor THEN
    RAISE EXCEPTION 'La aplicación (%) supera lo que queda del recaudo (% de %).',
      NEW.valor_aplicado, v_valor - v_aplicado, v_valor
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incapacidad_aplicacion_no_excede ON incapacidad_recaudo_aplicaciones;
CREATE TRIGGER trg_incapacidad_aplicacion_no_excede
  BEFORE INSERT OR UPDATE OF valor_aplicado, anulada_at ON incapacidad_recaudo_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION incapacidad_aplicacion_no_excede();

-- ── 5. Ajustes monetarios ────────────────────────────────────────────────────
-- Distintos de los ajustes de liquidación (fase 3, cambian el cálculo): estos
-- mueven el saldo exigible después de radicar. Positivo reduce lo que la
-- entidad debe (glosa aceptada); negativo lo aumenta (se reclamó de menos).
CREATE TABLE IF NOT EXISTS incapacidad_ajustes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('glosa_aceptada', 'descuento_entidad', 'diferencia_redondeo', 'correccion', 'nota_informativa')),
  valor NUMERIC(14,2) NOT NULL CHECK (valor <> 0),
  -- true: entra al saldo operativo. false: solo informa (sigue exigible).
  extingue_saldo BOOLEAN NOT NULL DEFAULT true,
  motivo TEXT NOT NULL CHECK (length(btrim(motivo)) >= 5),
  autorizado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_at TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_incapacidad_ajustes_expediente
  ON incapacidad_ajustes (expediente_id) WHERE anulado_at IS NULL;

-- ── 6. Vistas ────────────────────────────────────────────────────────────────
-- Recaudos con lo aplicado y lo que queda sin aplicar.
DROP VIEW IF EXISTS vw_incapacidad_recaudos;
CREATE VIEW vw_incapacidad_recaudos AS
SELECT
  r.id,
  r.entidad_catalogo_id,
  c.nombre                                  AS entidad_nombre,
  c.clase                                   AS entidad_clase,
  r.fecha_giro,
  r.valor,
  r.referencia,
  r.medio,
  r.observaciones,
  r.registrado_por_email,
  r.created_at,
  r.anulado_at,
  r.motivo_anulacion,
  COALESCE(ap.aplicado, 0)                  AS aplicado,
  r.valor - COALESCE(ap.aplicado, 0)        AS sin_aplicar,
  COALESCE(ap.n, 0)                         AS aplicaciones
FROM incapacidad_recaudos r
JOIN ausentismo_catalogos c ON c.id = r.entidad_catalogo_id
LEFT JOIN LATERAL (
  SELECT sum(a.valor_aplicado) AS aplicado, count(*) AS n
  FROM incapacidad_recaudo_aplicaciones a
  WHERE a.recaudo_id = r.id AND a.anulada_at IS NULL
) ap ON true;

-- El expediente con sus componentes de saldo. Se recrea entera.
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
  e.cerrado_at,
  e.cerrado_por_email,
  e.motivo_cierre,
  e.cierre_por_excepcion,
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
  (SELECT count(*) FROM incapacidad_radicaciones x WHERE x.expediente_id = e.id AND x.estado = 'devuelta') AS devoluciones,
  -- Componentes del saldo (base exigible = valor_reclamado, 12.5 por confirmar).
  COALESCE(ab.abonos, 0)       AS abonos_aplicados,
  ab.ultimo_giro,
  COALESCE(aj.ajustes, 0)      AS ajustes_saldo,
  CASE WHEN e.valor_reclamado IS NULL THEN NULL
       ELSE e.valor_reclamado - COALESCE(ab.abonos, 0) - COALESCE(aj.ajustes, 0) END AS saldo_operativo
FROM incapacidad_expedientes e
JOIN ausentismo a ON a.id = e.ausentismo_id
LEFT JOIN ausentismo_catalogos c ON c.id = e.entidad_catalogo_id
LEFT JOIN incapacidad_liquidaciones l ON l.expediente_id = e.id AND l.es_vigente
LEFT JOIN incapacidad_radicaciones r ON r.expediente_id = e.id AND r.estado IN ('solicitada', 'radicada')
LEFT JOIN LATERAL (
  SELECT sum(ap.valor_aplicado) AS abonos, max(rc.fecha_giro) AS ultimo_giro
  FROM incapacidad_recaudo_aplicaciones ap
  JOIN incapacidad_recaudos rc ON rc.id = ap.recaudo_id
  WHERE ap.expediente_id = e.id AND ap.anulada_at IS NULL AND rc.anulado_at IS NULL
) ab ON true
LEFT JOIN LATERAL (
  SELECT sum(valor) AS ajustes
  FROM incapacidad_ajustes x
  WHERE x.expediente_id = e.id AND x.extingue_saldo AND x.anulado_at IS NULL
) aj ON true
WHERE e.eliminado_at IS NULL;

-- ── 7. Accesos ───────────────────────────────────────────────────────────────
ALTER TABLE incapacidad_recaudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_recaudo_aplicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_ajustes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON incapacidad_recaudos, incapacidad_recaudo_aplicaciones, incapacidad_ajustes,
  vw_incapacidad_recaudos, vw_incapacidad_expedientes FROM anon, authenticated, public;
GRANT ALL ON incapacidad_recaudos, incapacidad_recaudo_aplicaciones, incapacidad_ajustes TO service_role;
GRANT SELECT ON vw_incapacidad_recaudos, vw_incapacidad_expedientes TO service_role;

COMMENT ON TABLE incapacidad_recaudos IS
  'Giro real de una EPS o ARL: fecha, valor, referencia y medio. Se aplica a uno o varios expedientes; lo que queda sin aplicar es visible. Se anula con motivo, no se borra.';
COMMENT ON TABLE incapacidad_recaudo_aplicaciones IS
  'Qué parte de un recaudo cubre cada expediente. Σ aplicaciones vigentes ≤ valor del recaudo (trigger). Se anula con motivo.';
COMMENT ON TABLE incapacidad_ajustes IS
  'Ajustes monetarios al saldo exigible después de radicar: glosa aceptada, descuento, redondeo, corrección, nota. Positivo reduce el saldo. No se editan: se anulan y se registra otro.';

-- ── 8. Comprobación ──────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
 WHERE table_name IN ('incapacidad_recaudos', 'incapacidad_recaudo_aplicaciones', 'incapacidad_ajustes') ORDER BY 1;
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'vw_incapacidad_expedientes' AND column_name IN ('abonos_aplicados', 'ajustes_saldo', 'saldo_operativo', 'cerrado_at') ORDER BY 1;
SELECT clave, valor FROM incapacidad_parametros ORDER BY clave;
