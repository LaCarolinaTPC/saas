-- Módulo de Accidentabilidad
-- =============================================

CREATE TYPE accidente_estado AS ENUM (
  'pendiente_revision',
  'falta_informacion',
  'completada',
  'aprobado'
);

-- Reporte de accidente
CREATE TABLE accidentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consecutivo BIGINT GENERATED ALWAYS AS IDENTITY,

  -- Conductor de nuestra empresa (snapshot al momento del reporte)
  conductor_id UUID REFERENCES conductores(id),
  conductor_cedula TEXT NOT NULL,
  conductor_nombre TEXT NOT NULL,
  conductor_licencia TEXT,

  -- Datos del accidente
  fecha_accidente TIMESTAMPTZ NOT NULL DEFAULT now(),
  direccion_accidente TEXT NOT NULL,
  resumen_hechos TEXT,
  nota_voz_url TEXT,
  nota_voz_transcripcion TEXT,

  -- Peatón (opcional)
  tiene_peaton BOOLEAN NOT NULL DEFAULT false,
  peaton_nombre TEXT,
  peaton_cedula TEXT,
  peaton_telefono TEXT,
  peaton_direccion TEXT,
  peaton_correo TEXT,

  -- Arreglo inmediato (opcional)
  hubo_arreglo BOOLEAN NOT NULL DEFAULT false,
  arreglo_monto NUMERIC(14,2),
  arreglo_receptor_nombre TEXT,
  arreglo_receptor_cedula TEXT,
  arreglo_firma_url TEXT,

  -- Aseguradora / abogado (si no hubo arreglo)
  solicito_aseguradora BOOLEAN NOT NULL DEFAULT false,
  aseguradora_nombre TEXT,
  abogado_nombre TEXT,
  abogado_apellidos TEXT,
  abogado_cedula TEXT,
  abogado_celular TEXT,

  -- Firmas (canvas) — la del conductor es obligatoria
  firma_conductor_url TEXT NOT NULL,
  firma_tercero_url TEXT,

  -- Flujo de revisión
  estado accidente_estado NOT NULL DEFAULT 'pendiente_revision',
  created_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vehículos implicados (uno o varios)
CREATE TABLE accidente_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE,
  placa TEXT,
  descripcion TEXT,          -- p.ej. "vehículo que nos chocó"
  es_propio BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bitácora de eventos / comentarios de revisión
CREATE TABLE accidente_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,        -- 'creado' | 'cambio_estado' | 'comentario' | 'aprobado'
  estado_nuevo accidente_estado,
  comentario TEXT,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_accidentes_conductor ON accidentes(conductor_id);
CREATE INDEX idx_accidentes_estado ON accidentes(estado);
CREATE INDEX idx_accidentes_fecha ON accidentes(fecha_accidente DESC);
CREATE INDEX idx_accidente_vehiculos_accidente ON accidente_vehiculos(accidente_id);
CREATE INDEX idx_accidente_eventos_accidente ON accidente_eventos(accidente_id);

CREATE TRIGGER trg_accidentes_updated BEFORE UPDATE ON accidentes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
