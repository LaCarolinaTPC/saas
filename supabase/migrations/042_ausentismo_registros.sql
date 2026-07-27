-- 042: Registro diario de ausentismo de conductores (módulo RRHH → Ausentismo).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- Reemplaza el Excel "AUSENTES DE 2026": una fila por conductor ausente por
-- día, con tipo, justificación, fechas de incapacidad/reintegro y seguimiento
-- del soporte. NO toca la tabla `ausentismo` (matriz de la EPS que se carga
-- por Excel y se reemplaza completa en cada carga): este es el registro
-- manual del día a día y no debe perderse con esas cargas.
CREATE TABLE IF NOT EXISTS ausentismo_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  -- Snapshot del conductor al momento del registro (patrón de accidentes):
  -- el maestro puede cambiar, el registro histórico no.
  cedula TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  -- Catálogo en la app (sin CHECK para poder agregar tipos sin migración):
  -- incapacidad | permiso | vacaciones | descanso | suspension | calamidad |
  -- licencia | eps | taller | no_justificada | renuncia | otra
  tipo TEXT NOT NULL,
  -- Detalle de contacto cuando no hay justificación:
  -- apagado | no_contesta | desvia_llamadas | localizado
  contacto TEXT,
  justificacion TEXT,
  incapacidad_inicio DATE,
  incapacidad_fin DATE,
  reintegro DATE,
  -- pendiente | presentado | no_aplica
  soporte TEXT NOT NULL DEFAULT 'no_aplica',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_fecha ON ausentismo_registros (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_cedula ON ausentismo_registros (cedula);
CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_tipo ON ausentismo_registros (tipo);
-- Seguimiento de "debe traer soporte".
CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_soporte
  ON ausentismo_registros (soporte) WHERE soporte = 'pendiente';

DROP TRIGGER IF EXISTS trg_ausentismo_registros_updated ON ausentismo_registros;
CREATE TRIGGER trg_ausentismo_registros_updated
  BEFORE UPDATE ON ausentismo_registros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Bitácora: todo cambio o eliminación de un registro deja rastro (pedido
-- explícito). Solo se inserta desde el servidor; nunca se edita ni borra.
CREATE TABLE IF NOT EXISTS ausentismo_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL,
  accion TEXT NOT NULL,           -- creado | editado | eliminado
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ausentismo_log_registro ON ausentismo_log (registro_id);
CREATE INDEX IF NOT EXISTS idx_ausentismo_log_created ON ausentismo_log (created_at DESC);

-- RLS sin políticas: solo el service role (servidor) accede a ambas tablas.
ALTER TABLE ausentismo_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausentismo_log ENABLE ROW LEVEL SECURITY;

-- El módulo nuevo queda visible para administración y RRHH; los demás roles
-- se gestionan desde Configuración → Usuarios.
UPDATE user_types
  SET modulos = modulos || '["ausentismo"]'::jsonb
  WHERE key IN ('admin', 'rrhh') AND NOT (modulos ? 'ausentismo');
