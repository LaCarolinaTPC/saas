-- seguimiento de reincidentes de ausentismo
--
-- Contexto. La pestaña Ausentismo › Reincidentes muestra a los conductores
-- que reinciden (citas EPS, incapacidades, faltas sin justificar), pero RRHH
-- no tenía dónde registrar qué hizo con cada uno. Cada fila tiene ahora un
-- botón «Seguimiento» y una columna con el estado del último seguimiento
-- (Sin seguimiento / En seguimiento / Compromiso cumplido / no cumplido).
--
-- Qué hace: crea `ausentismo_seguimientos`, una fila por seguimiento de un
-- conductor (puede tener varios: queda el historial). Se editan para cerrar
-- el estado, no se borran; quedan quién lo creó y quién lo modificó.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor: el script corre entero de una vez y es idempotente.
-- Las tablas nuevas no heredan privilegios: el GRANT a service_role va aquí.

CREATE TABLE IF NOT EXISTS ausentismo_seguimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT NOT NULL,
  -- EPS · Incapacidad · Ausentismo
  tipo TEXT NOT NULL CHECK (tipo IN ('eps', 'incapacidad', 'ausentismo')),
  -- Día del seguimiento y rol de quien lo hizo.
  fecha DATE NOT NULL,
  responsable TEXT NOT NULL CHECK (responsable IN ('asistente_gh', 'directora_gh', 'sst')),
  -- Recurrente en incapacidad · en ir a la EPS · en faltar injustificadamente
  motivo TEXT NOT NULL CHECK (motivo IN ('incapacidad_recurrente', 'eps_recurrente', 'faltas_injustificadas')),
  accion TEXT,
  compromiso_conductor TEXT,
  compromiso_empresa TEXT,
  fecha_limite DATE,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cumplido', 'incumplido')),
  proxima_revision DATE,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ,
  CONSTRAINT ausentismo_seguimientos_limite_chk CHECK (fecha_limite IS NULL OR fecha_limite >= fecha)
);

-- La pestaña busca el último seguimiento de un grupo de cédulas.
CREATE INDEX IF NOT EXISTS idx_ausentismo_seguimientos_cedula
  ON ausentismo_seguimientos (cedula, fecha DESC, created_at DESC);

-- Mismo esquema que el resto del módulo: RLS sin políticas, solo el servidor
-- (service_role) accede y valida antes los permisos de aplicación.
ALTER TABLE ausentismo_seguimientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ausentismo_seguimientos FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE ausentismo_seguimientos TO service_role;

COMMENT ON TABLE ausentismo_seguimientos IS
  'Seguimientos de RRHH a conductores reincidentes en ausentismo (Ausentismo › Reincidentes). Varios por conductor; el más reciente da el estado de la columna.';

-- Verificación: debe devolver la tabla con sus 19 columnas.
SELECT table_name, count(*) AS columnas
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'ausentismo_seguimientos'
 GROUP BY table_name;
