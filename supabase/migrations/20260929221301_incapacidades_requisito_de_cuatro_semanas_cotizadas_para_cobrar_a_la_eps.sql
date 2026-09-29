-- incapacidades requisito de cuatro semanas cotizadas para cobrar a la EPS
--
-- Contexto: la EPS solo reconoce la incapacidad de origen común si el
-- trabajador cotizó al menos cuatro semanas ininterrumpidas y completas antes
-- de su inicio (Decreto 780 de 2016, art. 2.2.3.2.1, modificado por el
-- Decreto 1427 de 2022). Sin ese requisito la EPS no paga y el costo lo asume
-- la empresa, así que radicarla solo genera una cartera que no se va a
-- recuperar. RRHH pidió el 2026-09-29 marcarlas y no habilitarlas para cobro.
--
-- Decisiones del usuario (2026-09-29):
--   * La regla es SOLO de EPS. A la ARL (origen AT o EL) no se le mira la
--     antigüedad: queda `no_aplica` y su cobro sigue igual.
--   * Gestivo no tiene semanas cotizadas; se presume con la fecha de
--     vinculación del maestro con el que el expediente resolvió a la persona:
--     conductores (la más reciente entre ingreso y reingreso que no pase del
--     inicio) o employees (hire_date). Sin fecha, el cobro se bloquea.
--   * Como la persona pudo cotizar con otro empleador sin interrupción, RRHH
--     puede acreditar las semanas con un soporte cargado al expediente (el
--     certificado de la EPS). Si el soporte se anula, la acreditación cae.
--   * En la prórroga las semanas se cuentan antes del inicio de la incapacidad
--     inicial de la cadena (previa del mismo empleado que termina el día
--     anterior, la misma relación de la marca `prorroga_sin_previa`).
--   * Lo ya radicado sin el requisito no se anula solo: sale en incidencias.
--
-- Qué cambia: `cobrable` de la vista pasa a exigir el umbral de días Y el
-- requisito de semanas; el umbral solo queda en la columna nueva
-- `cumple_umbral`, que es la que decide la excepción escrita de 12.17. La
-- excepción NO salta el requisito de semanas.
--
-- Se aplica a mano en el SQL Editor, entero, de una vez. Idempotente. Las
-- funciones usan etiquetas propias de dollar quoting.

-- ── 1. Parámetro ────────────────────────────────────────────────────────────
INSERT INTO incapacidad_parametros (clave, valor, descripcion) VALUES
  ('semanas_min_cotizacion_eps', '4'::jsonb,
   'Semanas de cotización ininterrumpida antes del inicio que exige la EPS para pagar una incapacidad de origen común (Decreto 1427 de 2022). No aplica a la ARL.')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION incapacidad_semanas_min_eps()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $sem$
  SELECT COALESCE(
    (SELECT (valor #>> '{}')::integer FROM incapacidad_parametros WHERE clave = 'semanas_min_cotizacion_eps'),
    4);
$sem$;

-- ── 2. Acreditación manual en el expediente ─────────────────────────────────
ALTER TABLE incapacidad_expedientes
  ADD COLUMN IF NOT EXISTS semanas_acreditadas_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS semanas_acreditadas_por_email TEXT,
  ADD COLUMN IF NOT EXISTS semanas_acreditadas_motivo TEXT,
  ADD COLUMN IF NOT EXISTS semanas_acreditadas_adjunto_id UUID REFERENCES incapacidad_adjuntos (id);

-- ── 3. Funciones ────────────────────────────────────────────────────────────

-- Inicio de la incapacidad inicial: si la fila es prórroga, se sigue hacia
-- atrás por la previa del mismo empleado que termina el día anterior.
CREATE OR REPLACE FUNCTION incapacidad_inicio_cadena(p_ausentismo_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
AS $cad$
  WITH RECURSIVE cadena AS (
    SELECT a.id, a.cedula, a.fecha_inicio, a.indicador_prorroga, 0 AS n
    FROM ausentismo a
    WHERE a.id = p_ausentismo_id
    UNION ALL
    SELECT p.id, p.cedula, p.fecha_inicio, p.indicador_prorroga, c.n + 1
    FROM cadena c
    JOIN ausentismo p
      ON p.cedula = c.cedula
     AND p.id <> c.id
     AND p.eliminado_at IS NULL
     AND c.fecha_inicio IS NOT NULL
     AND p.fecha_fin = c.fecha_inicio - 1
    WHERE upper(COALESCE(c.indicador_prorroga, '')) = 'PRORROGA'
      AND c.n < 60
  )
  SELECT min(fecha_inicio) FROM cadena;
$cad$;

-- Fecha de vinculación vigente al inicio, del maestro con que se resolvió la
-- persona. En conductores, la más reciente entre ingreso y reingreso que no
-- pase del inicio (el reingreso interrumpe la cotización); si el conductor no
-- tiene fechas, la de employees.
CREATE OR REPLACE FUNCTION incapacidad_fecha_vinculacion(p_fuente TEXT, p_cedula TEXT, p_inicio DATE)
RETURNS DATE
LANGUAGE sql
STABLE
AS $vin$
  SELECT CASE
    WHEN p_inicio IS NULL OR p_cedula IS NULL OR p_fuente IS NULL OR p_fuente = 'sin_resolver' THEN NULL
    ELSE COALESCE(
      CASE WHEN p_fuente = 'conductores' THEN (
        SELECT max(f) FROM conductores k
        CROSS JOIN LATERAL (VALUES (k.fecha_ingreso), (k.fecha_reingreso)) AS v(f)
        WHERE k.cedula = p_cedula AND f IS NOT NULL AND f <= p_inicio
      ) END,
      (SELECT max(e.hire_date) FROM employees e
        WHERE e.document_number = p_cedula AND e.hire_date <= p_inicio)
    )
  END;
$vin$;

-- La regla, pura: se puede probar con valores sueltos (ver comprobación).
--   no_aplica   origen AT/EL: la paga la ARL
--   cumple      días entre vinculación e inicio >= semanas × 7
--   acreditado  no cumple por la fecha, pero RRHH acreditó con soporte
--   no_cumple   la EPS no la paga
--   sin_dato    no hay fecha de vinculación o de inicio
CREATE OR REPLACE FUNCTION incapacidad_requisito_semanas(
  p_origen TEXT, p_inicio DATE, p_vinculacion DATE, p_acreditada BOOLEAN, p_semanas INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $req$
  SELECT CASE
    WHEN upper(COALESCE(p_origen, '')) IN ('AT', 'EL') THEN 'no_aplica'
    WHEN p_inicio IS NOT NULL AND p_vinculacion IS NOT NULL
         AND (p_inicio - p_vinculacion) >= COALESCE(p_semanas, 4) * 7 THEN 'cumple'
    WHEN COALESCE(p_acreditada, false) THEN 'acreditado'
    WHEN p_inicio IS NULL OR p_vinculacion IS NULL THEN 'sin_dato'
    ELSE 'no_cumple'
  END;
$req$;

-- ── 4. La vista ─────────────────────────────────────────────────────────────
-- Misma definición de 20260914161822 con: `cumple_umbral` (el `cobrable` de
-- antes), el bloque de semanas y `cobrable` = umbral Y semanas. Al recrearla
-- se pierden los permisos; se vuelven a conceder abajo.
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
  um.cumple_umbral,
  (um.cumple_umbral AND sq.requisito_semanas NOT IN ('no_cumple', 'sin_dato')) AS cobrable,
  -- Requisito de cuatro semanas cotizadas (solo EPS).
  sm.semanas                   AS semanas_min_cotizacion,
  sv.inicio_cadena,
  sv.fecha_vinculacion,
  (sv.inicio_cadena - sv.fecha_vinculacion) AS dias_previos_vinculacion,
  sq.requisito_semanas,
  e.semanas_acreditadas_at,
  e.semanas_acreditadas_por_email,
  e.semanas_acreditadas_motivo,
  e.semanas_acreditadas_adjunto_id,
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
CROSS JOIN LATERAL (
  SELECT (a.dias_it_pagados IS NOT NULL AND a.dias_it_pagados >= COALESCE(
            c.dias_min_cobro,
            incapacidad_dias_min_defecto(a.origen))) AS cumple_umbral
) um
CROSS JOIN LATERAL (SELECT incapacidad_semanas_min_eps() AS semanas) sm
CROSS JOIN LATERAL (
  SELECT ic.inicio_cadena,
         CASE WHEN upper(COALESCE(a.origen, '')) IN ('AT', 'EL') THEN NULL
              ELSE incapacidad_fecha_vinculacion(e.persona_fuente, e.persona_ref, ic.inicio_cadena) END AS fecha_vinculacion
  FROM (SELECT COALESCE(incapacidad_inicio_cadena(a.id), a.fecha_inicio) AS inicio_cadena) ic
) sv
CROSS JOIN LATERAL (
  SELECT incapacidad_requisito_semanas(
    a.origen, sv.inicio_cadena, sv.fecha_vinculacion,
    e.semanas_acreditadas_at IS NOT NULL AND EXISTS (
      SELECT 1 FROM incapacidad_adjuntos s
      WHERE s.id = e.semanas_acreditadas_adjunto_id AND s.expediente_id = e.id AND s.anulado_at IS NULL),
    sm.semanas) AS requisito_semanas
) sq
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

REVOKE ALL ON vw_incapacidad_expedientes FROM anon, authenticated, public;
GRANT SELECT ON vw_incapacidad_expedientes TO service_role;

-- ── 5. Comprobación ─────────────────────────────────────────────────────────
-- (a) La regla con valores sueltos: la columna `ok` debe salir true en todas.
SELECT caso, esperado, obtenido, esperado = obtenido AS ok
FROM (VALUES
  ('EPS 27 días',             'no_cumple',  incapacidad_requisito_semanas('EG', DATE '2026-09-28', DATE '2026-09-01', false, 4)),
  ('EPS 28 días',             'cumple',     incapacidad_requisito_semanas('EG', DATE '2026-09-29', DATE '2026-09-01', false, 4)),
  ('EPS 29 días',             'cumple',     incapacidad_requisito_semanas('EG', DATE '2026-09-30', DATE '2026-09-01', false, 4)),
  ('EPS acreditada',          'acreditado', incapacidad_requisito_semanas('EG', DATE '2026-09-10', DATE '2026-09-01', true,  4)),
  ('EPS sin vinculación',     'sin_dato',   incapacidad_requisito_semanas('EG', DATE '2026-09-10', NULL,              false, 4)),
  ('ARL AT 1 día',            'no_aplica',  incapacidad_requisito_semanas('AT', DATE '2026-09-02', DATE '2026-09-01', false, 4)),
  ('ARL EL sin vinculación',  'no_aplica',  incapacidad_requisito_semanas('EL', DATE '2026-09-02', NULL,              false, 4))
) t(caso, esperado, obtenido);

-- (b) Los expedientes vigentes. Medido el 2026-09-29 antes de aplicar: 12
-- vigentes, dos de EPS sin cuatro semanas (78746062 de SALUD TOTAL, 11 días,
-- y 1007349264 de EPS SURA, 17 días, ya radicado), seis de EPS que cumplen y
-- las cuatro de ARL en `no_aplica`; ninguno en `sin_dato`.
SELECT cedula, origen, pagador_recibido, fecha_inicio, inicio_cadena, persona_fuente,
       fecha_vinculacion, dias_previos_vinculacion, requisito_semanas, cumple_umbral, cobrable,
       estado, radicacion_estado
FROM vw_incapacidad_expedientes
ORDER BY requisito_semanas, fecha_inicio;
