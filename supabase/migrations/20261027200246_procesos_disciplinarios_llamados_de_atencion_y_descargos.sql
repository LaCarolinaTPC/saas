-- procesos disciplinarios llamados de atencion y descargos
--
-- Contexto. RRHH lleva en un Excel los llamados de atención, las citaciones a
-- descargos y la medida que se tomó en cada caso, y no puede ver rápido
-- cuántas veces ha ido un conductor a descargos ni por qué motivo. El módulo
-- nuevo «Procesos disciplinarios» (Recursos Humanos) los registra y los
-- resume por conductor y por motivo.
--
-- Qué hace:
--   1. Crea `procesos_disciplinarios`: una fila por proceso (llamado de
--      atención o citación a descargos) con el motivo, los hechos, la
--      citación y la asistencia a descargos, y la medida tomada.
--   2. Los procesos no se borran: se anulan con motivo (queda el rastro).
--   3. Da el módulo `disciplinarios` al administrador.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor: el script corre entero de una vez y es idempotente.
-- Las tablas nuevas no heredan privilegios: el GRANT a service_role va aquí.

CREATE TABLE IF NOT EXISTS procesos_disciplinarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Número correlativo para nombrarlo («Proceso N.º 12»).
  consecutivo BIGINT GENERATED ALWAYS AS IDENTITY,
  cedula TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT NOT NULL,
  -- llamado_atencion · citacion_descargos
  tipo TEXT NOT NULL CHECK (tipo IN ('llamado_atencion', 'citacion_descargos')),
  -- Día de los hechos.
  fecha_hecho DATE NOT NULL,
  -- Clave del catálogo de motivos (src/lib/disciplinarios/reglas.ts); «otro» con detalle.
  motivo TEXT NOT NULL,
  motivo_detalle TEXT,
  descripcion TEXT,
  -- Solo citación a descargos: cuándo se citó, cuándo fue la diligencia y si asistió.
  fecha_citacion DATE,
  fecha_descargos DATE,
  asistio BOOLEAN,
  resumen_descargos TEXT,
  -- Medida ejecutada; «pendiente» mientras no se decide.
  medida TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (medida IN ('pendiente', 'sin_medida', 'llamado_verbal', 'llamado_escrito', 'suspension', 'terminacion', 'otra')),
  dias_suspension INTEGER CHECK (dias_suspension IS NULL OR dias_suspension > 0),
  fecha_medida DATE,
  medida_detalle TEXT,
  responsable TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ,
  -- Anulación con rastro: un proceso anulado no cuenta en los resúmenes.
  anulado_en TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_procesos_disciplinarios_cedula ON procesos_disciplinarios (cedula, fecha_hecho DESC);
CREATE INDEX IF NOT EXISTS idx_procesos_disciplinarios_fecha ON procesos_disciplinarios (fecha_hecho DESC) WHERE anulado_en IS NULL;

-- Como el resto de RRHH: RLS sin políticas, solo el servidor (service_role)
-- accede y valida antes los permisos de la aplicación.
ALTER TABLE procesos_disciplinarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON procesos_disciplinarios FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE procesos_disciplinarios TO service_role;

COMMENT ON TABLE procesos_disciplinarios IS
  'Llamados de atención y citaciones a descargos con su motivo y la medida tomada (Recursos Humanos > Procesos disciplinarios). Reemplaza el Excel de RRHH.';

-- El administrador recibe el módulo; a los demás se les da en Configuración.
UPDATE user_types
  SET modulos = modulos || '["disciplinarios"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'disciplinarios');

-- Verificación: la tabla y el módulo del administrador.
SELECT
  to_regclass('public.procesos_disciplinarios') AS tabla,
  (SELECT modulos ? 'disciplinarios' FROM user_types WHERE key = 'admin') AS admin_tiene_modulo;
