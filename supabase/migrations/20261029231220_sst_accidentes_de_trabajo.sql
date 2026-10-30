-- sst accidentes de trabajo
--
-- Contexto. Recursos Humanos – SST lleva los accidentes de trabajo en el Excel
-- «INFORMACION ACCIDENTES DE TRABAJO» (pestaña «Consolidado 2026», 23 casos de
-- enero a septiembre) y arma a mano la caracterización (por mes, tipo de
-- lesión, parte del cuerpo, mecanismo, agente y día). El módulo nuevo
-- «Accidentes de trabajo (SST)» los registra y calcula la caracterización
-- desde los registros. El histórico se carga con
-- scripts/migrar-sst-accidentes-trabajo.mts (origen = 'historico').
--
-- No es lo mismo que Accidentabilidad (accidentes de tránsito de los buses):
-- aquí la unidad es el TRABAJADOR lesionado y su reporte a la ARL.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

CREATE TABLE IF NOT EXISTS sst_accidentes_trabajo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Número de caso del año («CASO No» del Excel). Único por año.
  anio INTEGER NOT NULL,
  caso INTEGER NOT NULL,
  fecha_at DATE NOT NULL,
  hora TEXT,
  fecha_notificacion DATE,
  cedula TEXT,
  nombre TEXT NOT NULL,
  cargo TEXT,
  empresa_usuaria TEXT,
  ciudad TEXT,
  sexo TEXT CHECK (sexo IS NULL OR sexo IN ('M', 'F')),
  -- Claves de los catálogos de src/lib/sst/reglas.ts («otro» con detalle).
  tipo_lesion TEXT NOT NULL,
  -- La parte del cuerpo tal como se describe («MANO IZQUIERDA») y su grupo
  -- para la caracterización («manos»).
  parte_cuerpo TEXT,
  parte_cuerpo_grupo TEXT NOT NULL,
  mecanismo TEXT NOT NULL,
  agente TEXT NOT NULL,
  descripcion TEXT,
  accidente_transito BOOLEAN NOT NULL DEFAULT false,
  dias_incapacidad INTEGER NOT NULL DEFAULT 0 CHECK (dias_incapacidad >= 0),
  estado_investigacion TEXT,
  cierre_administrativo_arl BOOLEAN,
  observaciones TEXT,
  origen TEXT NOT NULL DEFAULT 'gestivo' CHECK (origen IN ('gestivo', 'historico')),
  historico_ref TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ,
  -- Anulación con rastro: un caso anulado no cuenta en la caracterización.
  anulado_en TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sst_at_caso ON sst_accidentes_trabajo (anio, caso) WHERE anulado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sst_at_historico_ref ON sst_accidentes_trabajo (historico_ref) WHERE historico_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sst_at_fecha ON sst_accidentes_trabajo (fecha_at DESC) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_sst_at_cedula ON sst_accidentes_trabajo (cedula, fecha_at DESC);

-- Como el resto de RRHH: RLS sin políticas; solo el servidor (service_role)
-- accede y valida antes los permisos de la aplicación.
ALTER TABLE sst_accidentes_trabajo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sst_accidentes_trabajo FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sst_accidentes_trabajo TO service_role;

COMMENT ON TABLE sst_accidentes_trabajo IS
  'Accidentes de trabajo (Recursos Humanos – SST): el trabajador lesionado, la lesión, el mecanismo, el agente y su seguimiento ARL. Reemplaza el Excel «INFORMACION ACCIDENTES DE TRABAJO».';

-- El administrador recibe el módulo en el sistema viejo de permisos (en el
-- nuevo es super y lo tiene todo); a los demás se les da en Configuración.
UPDATE user_types
   SET modulos = modulos || '["accidentes_trabajo"]'::jsonb
 WHERE key = 'admin' AND NOT (modulos ? 'accidentes_trabajo');

-- Verificación.
SELECT to_regclass('public.sst_accidentes_trabajo') AS tabla;
