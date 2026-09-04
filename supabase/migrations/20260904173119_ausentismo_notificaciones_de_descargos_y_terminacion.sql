-- ausentismo: notificaciones de citación a descargos y terminación de contrato
--
-- Contexto. La pestaña Reincidentes alerta cuando un conductor lleva 4 días
-- seguidos sin justificar (hay que notificarle la citación a descargos) y
-- cuando llega a 5 (notificación de terminación de contrato). Las alertas se
-- calculan del registro de ausencias y se quedan encendidas mientras la racha
-- esté dentro de la ventana, así que RRHH pidió una marca de "ya notificado"
-- para distinguir lo pendiente de lo hecho.
--
-- Qué hace:
--   1. Crea `ausentismo_notificaciones`: una fila por conductor, nivel
--      (descargos | terminacion) y racha notificada, con la fecha en que se
--      notificó, quién lo marcó y una observación libre (medio, acta, etc.).
--   2. Las marcas no se borran: se anulan con motivo (`anulada_en`,
--      `anulada_por_email`, `motivo_anulacion`) para conservar el rastro.
--      Solo cuenta como vigente la que no está anulada, y no puede haber dos
--      vigentes para la misma cédula, nivel e inicio de racha.
--
-- La aplicación empareja la marca con la racha actual por solapamiento de
-- fechas (racha_desde..racha_hasta), así sigue valiendo aunque la racha se
-- alargue un día más.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: el script corre entero de una sola vez y
-- es idempotente. Las tablas nuevas no heredan privilegios: el GRANT a
-- service_role va aquí mismo o las consultas devuelven 403.

CREATE TABLE IF NOT EXISTS ausentismo_notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT NOT NULL,
  -- descargos: citación a descargos (4 días seguidos). terminacion: terminación
  -- de contrato (5 o más).
  nivel TEXT NOT NULL CHECK (nivel IN ('descargos', 'terminacion')),
  -- Racha de días seguidos sin justificar que motivó la notificación.
  racha_desde DATE NOT NULL,
  racha_hasta DATE NOT NULL,
  dias INTEGER NOT NULL CHECK (dias > 0),
  -- Día en que se entregó la notificación al conductor.
  notificado_en DATE NOT NULL,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Anulación con rastro; una marca anulada deja de contar como notificada.
  anulada_en TIMESTAMPTZ,
  anulada_por_email TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT ausentismo_notificaciones_racha_chk CHECK (racha_hasta >= racha_desde)
);

-- Una sola marca vigente por conductor, nivel y racha.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ausentismo_notificaciones_vigente
  ON ausentismo_notificaciones (cedula, nivel, racha_desde)
  WHERE anulada_en IS NULL;

-- La pestaña consulta las vigentes de un grupo de cédulas dentro de la ventana.
CREATE INDEX IF NOT EXISTS idx_ausentismo_notificaciones_cedula_hasta
  ON ausentismo_notificaciones (cedula, racha_hasta DESC)
  WHERE anulada_en IS NULL;

-- Mismo esquema que el resto del módulo: RLS sin políticas, solo el servidor
-- (service_role) accede y valida antes los permisos de aplicación.
ALTER TABLE ausentismo_notificaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ausentismo_notificaciones FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ausentismo_notificaciones TO service_role;

COMMENT ON TABLE ausentismo_notificaciones IS
  'Marca de "ya notificado" de la alerta de reincidentes: citación a descargos (4 días seguidos sin justificar) y terminación de contrato (5+). Se anula con motivo, no se borra.';
