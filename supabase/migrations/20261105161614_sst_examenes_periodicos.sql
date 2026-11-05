-- sst examenes periodicos
--
-- Contexto. Recursos Humanos – SST controla los exámenes médicos ocupacionales
-- periódicos en el Excel «LISTADO PERSONAL EXAMEN PERIODICO»: una hoja por mes
-- con las atenciones (fecha, entrega y recomendaciones) y cinco hojas de
-- control (conductores, administrativos y reubicados de La Carolina,
-- Metrorecaudo y Anaya Giraldo) con la fecha del examen de cada año, el
-- próximo examen y una alerta de días. El módulo nuevo «Exámenes periódicos
-- (SST)» registra cada examen, calcula el próximo (12 meses por defecto,
-- editable) y alerta los vencidos. El histórico se carga con
-- scripts/migrar-sst-examenes-periodicos.mts (origen = 'historico').
--
-- Las recomendaciones y observaciones son datos de salud: el MCP y la Data API
-- NO las ven. Para ellos hay dos vistas sin esas columnas
-- (sst_examenes_estado y sst_examenes_atenciones).
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entera, y es
-- idempotente. Las tablas nuevas no heredan privilegios: los GRANT van aquí.

-- ── 1. Población en control (las hojas de control del Excel) ───────────────
CREATE TABLE IF NOT EXISTS sst_examenes_personas (
  cedula TEXT PRIMARY KEY CHECK (cedula ~ '^[0-9]{5,12}$'),
  nombre TEXT NOT NULL,
  cargo TEXT,
  grupo TEXT NOT NULL CHECK (grupo IN ('conductores', 'administrativos', 'reubicados', 'metrorecaudo', 'anaya_giraldo')),
  fecha_ingreso DATE,
  -- Cada cuántos meses le toca el examen. Mientras no tenga exámenes
  -- periódicos, el primero vence a fecha_ingreso + periodicidad_meses (el
  -- examen de ingreso cuenta como el primero, como en el Excel).
  periodicidad_meses INTEGER NOT NULL DEFAULT 12 CHECK (periodicidad_meses BETWEEN 6 AND 60),
  -- Fuera del control (retirado u otro motivo): no cuenta en los vencimientos.
  activo BOOLEAN NOT NULL DEFAULT true,
  motivo_inactivo TEXT CHECK (motivo_inactivo IS NULL OR motivo_inactivo IN ('retirado', 'otro')),
  inactivo_desde DATE,
  observaciones TEXT,
  origen TEXT NOT NULL DEFAULT 'gestivo' CHECK (origen IN ('gestivo', 'historico')),
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ,
  CONSTRAINT sst_examenes_personas_inactivo_chk CHECK (activo OR motivo_inactivo IS NOT NULL)
);

-- Para quien ya aplicó la primera versión de este script.
ALTER TABLE sst_examenes_personas
  ADD COLUMN IF NOT EXISTS periodicidad_meses INTEGER NOT NULL DEFAULT 12 CHECK (periodicidad_meses BETWEEN 6 AND 60);

CREATE INDEX IF NOT EXISTS idx_sst_examenes_personas_grupo ON sst_examenes_personas (grupo) WHERE activo;

-- ── 2. Exámenes (una fila por atención) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sst_examenes_periodicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula TEXT NOT NULL REFERENCES sst_examenes_personas(cedula) ON UPDATE CASCADE,
  -- Nombre y cargo a la fecha del examen (la persona puede cambiar de cargo).
  nombre TEXT NOT NULL,
  cargo TEXT,
  fecha_atencion DATE NOT NULL,
  fecha_entrega DATE,
  periodicidad_meses INTEGER NOT NULL DEFAULT 12 CHECK (periodicidad_meses BETWEEN 6 AND 60),
  -- Lo calcula la aplicación: fecha_atencion + periodicidad_meses (meses calendario).
  proximo_examen DATE NOT NULL,
  -- Datos de salud: solo en la pantalla del módulo.
  recomendaciones TEXT,
  observaciones TEXT,
  origen TEXT NOT NULL DEFAULT 'gestivo' CHECK (origen IN ('gestivo', 'historico')),
  -- «hoja:fila» (o «hoja:fila:año» en las hojas de control) del Excel.
  historico_ref TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ,
  -- Anulación con rastro: un examen anulado no cuenta para el próximo.
  anulado_en TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT sst_examenes_entrega_chk CHECK (fecha_entrega IS NULL OR origen = 'historico' OR fecha_entrega >= fecha_atencion),
  CONSTRAINT sst_examenes_proximo_chk CHECK (proximo_examen > fecha_atencion)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sst_examenes_cedula_fecha ON sst_examenes_periodicos (cedula, fecha_atencion) WHERE anulado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sst_examenes_historico_ref ON sst_examenes_periodicos (historico_ref) WHERE historico_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sst_examenes_cedula ON sst_examenes_periodicos (cedula, fecha_atencion DESC) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_sst_examenes_fecha ON sst_examenes_periodicos (fecha_atencion DESC) WHERE anulado_en IS NULL;

-- Como el resto de RRHH: RLS sin políticas; solo el servidor (service_role)
-- accede y valida antes los permisos de la aplicación.
ALTER TABLE sst_examenes_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_examenes_periodicos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sst_examenes_personas FROM anon, authenticated, public;
REVOKE ALL ON sst_examenes_periodicos FROM anon, authenticated, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sst_examenes_personas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sst_examenes_periodicos TO service_role;

COMMENT ON TABLE sst_examenes_personas IS
  'Exámenes periódicos (SST): población en control (hojas de control del Excel «LISTADO PERSONAL EXAMEN PERIODICO»). Una fila por persona.';
COMMENT ON TABLE sst_examenes_periodicos IS
  'Exámenes médicos ocupacionales periódicos (SST): una fila por atención, con su próximo examen. recomendaciones y observaciones son datos de salud.';

-- ── 3. Vistas para el MCP y la Data API (sin datos de salud) ───────────────
-- security_invoker: quien consulta la vista necesita permiso sobre las tablas
-- (solo service_role lo tiene).

-- Una fila por persona ACTIVA en control, con el semáforo a la fecha de Colombia.
-- El próximo examen es el del último examen; sin exámenes, fecha de ingreso +
-- periodicidad de la persona (base_proximo = 'ingreso'). Sin ninguna de las
-- dos: sin_examen. Las columnas nuevas van al final (CREATE OR REPLACE VIEW
-- solo deja agregar columnas al final).
CREATE OR REPLACE VIEW sst_examenes_estado
WITH (security_invoker = on) AS
WITH hoy AS (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS d
),
vigentes AS (
  SELECT * FROM sst_examenes_periodicos WHERE anulado_en IS NULL
),
ultimo AS (
  SELECT DISTINCT ON (cedula) cedula, fecha_atencion, fecha_entrega, periodicidad_meses, proximo_examen
  FROM vigentes
  ORDER BY cedula, fecha_atencion DESC
),
conteo AS (
  SELECT cedula, count(*)::int AS examenes FROM vigentes GROUP BY cedula
)
SELECT
  p.cedula,
  p.nombre,
  p.cargo,
  p.grupo,
  p.fecha_ingreso,
  u.fecha_atencion AS ultimo_examen,
  u.fecha_entrega AS ultima_entrega,
  COALESCE(u.periodicidad_meses, p.periodicidad_meses) AS periodicidad_meses,
  x.proximo AS proximo_examen,
  (x.proximo - h.d) AS dias_restantes,
  CASE
    WHEN x.proximo IS NULL THEN 'sin_examen'
    WHEN x.proximo < h.d THEN 'vencido'
    WHEN x.proximo - h.d <= 30 THEN 'por_vencer'
    ELSE 'vigente'
  END AS estado,
  COALESCE(c.examenes, 0) AS examenes,
  CASE WHEN u.cedula IS NOT NULL THEN 'examen' WHEN p.fecha_ingreso IS NOT NULL THEN 'ingreso' END AS base_proximo
FROM sst_examenes_personas p
CROSS JOIN hoy h
LEFT JOIN ultimo u ON u.cedula = p.cedula
LEFT JOIN conteo c ON c.cedula = p.cedula
CROSS JOIN LATERAL (
  SELECT COALESCE(u.proximo_examen, (p.fecha_ingreso + make_interval(months => p.periodicidad_meses))::date) AS proximo
) x
WHERE p.activo;

-- Una fila por examen no anulado; en lugar de las recomendaciones, solo si las hay.
CREATE OR REPLACE VIEW sst_examenes_atenciones
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.cedula,
  e.nombre,
  e.cargo,
  p.grupo,
  e.fecha_atencion,
  e.fecha_entrega,
  e.periodicidad_meses,
  e.proximo_examen,
  (e.recomendaciones IS NOT NULL AND btrim(e.recomendaciones) <> '') AS tiene_recomendaciones,
  e.origen,
  e.created_at
FROM sst_examenes_periodicos e
LEFT JOIN sst_examenes_personas p ON p.cedula = e.cedula
WHERE e.anulado_en IS NULL;

REVOKE ALL ON sst_examenes_estado FROM anon, authenticated, public;
REVOKE ALL ON sst_examenes_atenciones FROM anon, authenticated, public;
GRANT SELECT ON sst_examenes_estado TO service_role;
GRANT SELECT ON sst_examenes_atenciones TO service_role;

COMMENT ON VIEW sst_examenes_estado IS
  'Exámenes periódicos (SST): semáforo por persona activa en control (sin_examen, vencido, por_vencer ≤ 30 días, vigente). Sin exámenes, el próximo se cuenta desde la fecha de ingreso. Sin datos de salud; la usa el MCP.';
COMMENT ON VIEW sst_examenes_atenciones IS
  'Exámenes periódicos (SST): atenciones no anuladas SIN recomendaciones ni observaciones (solo tiene_recomendaciones). La usa el MCP.';

-- ── 4. Permisos ─────────────────────────────────────────────────────────────
-- El administrador recibe el módulo en el sistema viejo de permisos (en el
-- nuevo es super y lo tiene todo); a los demás se les da en Configuración.
UPDATE user_types
   SET modulos = modulos || '["examenes_periodicos"]'::jsonb
 WHERE key = 'admin' AND NOT (modulos ? 'examenes_periodicos');

-- Verificación.
SELECT to_regclass('public.sst_examenes_personas') AS personas,
       to_regclass('public.sst_examenes_periodicos') AS examenes,
       to_regclass('public.sst_examenes_estado') AS vista_estado,
       to_regclass('public.sst_examenes_atenciones') AS vista_atenciones;
