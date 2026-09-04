-- Matriz de ausentismo: eliminación lógica de incapacidades y rastro en la
-- auditoría general (tesoreria_audit_log, módulo "ausentismo").
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Por qué lógica y no física: la carga por Excel hace upsert por la llave
-- natural (cédula, fecha inicio, consecutivo) y reviviría cualquier fila
-- borrada de verdad. Con la marca `eliminado_at` la fila sigue ocupando su
-- llave, el cargador la respeta, los lectores la excluyen y se puede
-- restaurar si el borrado fue el error.

-- ── 1. Columnas de eliminación ───────────────────────────────────────────────
ALTER TABLE ausentismo
  ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eliminado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;

COMMENT ON COLUMN ausentismo.eliminado_at IS
  'Eliminación lógica desde el formulario. Con valor, la fila no cuenta en matriz, indicadores ni exportaciones y la carga por Excel no la toca.';
COMMENT ON COLUMN ausentismo.motivo_eliminacion IS
  'Motivo obligatorio que escribió quien eliminó; también queda en ausentismo_log y tesoreria_audit_log.';

-- Índice parcial: las eliminadas son pocas y se consultan aparte (filtro
-- "ver eliminadas" y protección del cargador).
CREATE INDEX IF NOT EXISTS idx_ausentismo_eliminado
  ON ausentismo (eliminado_at) WHERE eliminado_at IS NOT NULL;

-- ── 2. La vista oficial deja fuera las eliminadas ────────────────────────────
-- Se recrea (no CREATE OR REPLACE): la vista vigente, de la migración
-- 20260902223110, trae `lote_carga` y REPLACE no admite quitar ni reordenar
-- columnas. Nada depende de la vista; la app consulta la tabla.
DROP VIEW IF EXISTS vw_ausentismo_matriz;
CREATE VIEW vw_ausentismo_matriz AS
SELECT
  a.id,
  a.consecutivo_incapacidad,
  a.cedula                  AS documento_de_identidad,
  a.nombre,
  a.cargo,
  a.indicador_prorroga,
  a.dias_it_pagados         AS dias_perdidos,
  a.origen,
  a.fecha_inicio,
  a.fecha_fin,
  a.mes_inicio,
  a.dia_ocurrencia          AS dia_de_ocurrencia_del_evento,
  a.eps,
  a.arl,
  a.ips,
  a.profesional_responsable,
  a.tipo_conductor          AS tipo_de_conductor,
  a.estado,
  a.cie10,
  a.diagnostico             AS dx,
  a.soat,
  a.grd,
  a.estado_registro,
  a.origen_registro,
  a.revision,
  a.abierto_por_email,
  a.cerrado_por_email,
  a.cerrado_at,
  a.modificado_por_email,
  a.motivo_modificacion,
  a.source_file,
  a.lote_carga,
  a.created_at,
  a.updated_at
FROM ausentismo a
WHERE a.eliminado_at IS NULL;

GRANT SELECT ON vw_ausentismo_matriz TO service_role;

-- ── 3. Bitácora propia: el índice por acción ayuda a filtrar eliminaciones ──
CREATE INDEX IF NOT EXISTS idx_ausentismo_log_accion ON ausentismo_log (accion);

-- ── 4. Auditoría general: índice por módulo para el filtro de la pantalla ───
CREATE INDEX IF NOT EXISTS idx_tesoreria_audit_modulo
  ON tesoreria_audit_log (modulo, created_at DESC);

-- Las tablas ya existen y ya tienen GRANT a service_role; las columnas nuevas
-- los heredan. No hace falta conceder nada más.
