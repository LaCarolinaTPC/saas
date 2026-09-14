-- Parte 3 de 5 de la migracion 20260914161822: la vista de la bandeja.
--
-- Se parte en cinco porque el SQL Editor estaba ejecutando el texto viejo
-- guardado en la pestaña. Pegue cada parte en una pestaña NUEVA y en orden:
-- 1 funciones, 2 trigger, 3 vista, 4 limpieza, 5 comprobacion.
--
-- Que debe salir: DROP VIEW, CREATE VIEW, REVOKE y GRANT. Sin el GRANT la aplicacion deja de leer la bandeja, asi que este trozo va entero.
--
-- El archivo completo, con el contexto y el porque, esta en
-- supabase/migrations/20260914161822_incapacidades_umbral_de_entrada_eps_desde_3_dias_y_arl_todas.sql

SELECT 'parte 3 de 5 · migracion 20260914161822' AS ejecutando;
-- ── 4. La vista: el umbral por defecto sale ahora de la funcion ─────────────
-- Se recrea entera (misma definicion de la migracion de recaudos, cambiando
-- solo el calculo de `cobrable`); al recrearla se pierden los permisos, por
-- eso se vuelven a conceder mas abajo.
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
      incapacidad_dias_min_defecto(a.origen))) AS cobrable,
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

REVOKE ALL ON vw_incapacidad_expedientes FROM anon, authenticated, public;
GRANT SELECT ON vw_incapacidad_expedientes TO service_role;
