-- ============================================================
-- GEMA Sync — fuente de datos MySQL `gema_cr` (La Carolina)
-- Reemplaza la carga por Excel de: conductores, empleados,
-- cierres, viajes perdidos. Agrega: propietarios, ingreso de
-- terceros y viajes recaudados.
-- (Excel se conserva solo para: ausentismo, familia, incentivos)
-- ============================================================

-- 1. PROPIETARIOS (vst_ext_get_propietarios)
CREATE TABLE IF NOT EXISTS propietarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cedula TEXT NOT NULL UNIQUE,
  codigo TEXT,
  nombre TEXT,
  tipo_identificacion TEXT,
  tipo_propietario TEXT,
  plazo_pago TEXT,
  direccion TEXT,
  telefono TEXT,
  celular TEXT,
  correo TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO',
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_propietarios_codigo ON propietarios(codigo);

-- 2. INGRESO TERCERO (pa_ext_get_IngresoTerceroByFecha)
CREATE TABLE IF NOT EXISTS ingreso_tercero (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  tipo_cierre TEXT,
  ruta TEXT,
  grupo_liquidacion TEXT,
  tipo_prom TEXT,
  tipo_gps TEXT,
  codigo_vehiculo TEXT,
  placa TEXT,
  cedula_conductor TEXT,
  codigo_conductor TEXT,
  conductor_nombre TEXT,
  cedula_propietario TEXT,
  propietario_nombre TEXT,
  tipo_propietario TEXT,
  pasaje NUMERIC(12,2),
  viajes NUMERIC(10,2),
  timbradas NUMERIC(12,2),
  timbradas_cu NUMERIC(12,2),
  descuento NUMERIC(12,2),
  fet NUMERIC(14,2),
  factor_calidad NUMERIC(14,2),
  valor_camb NUMERIC(14,2),
  bruto NUMERIC(14,2),
  total_cartulina NUMERIC(14,2),
  cartu_admon NUMERIC(14,2),
  cartu_estudio NUMERIC(14,2),
  cartu_fondo NUMERIC(14,2),
  cartu_poliza NUMERIC(14,2),
  cartu_presta NUMERIC(14,2),
  salario NUMERIC(14,2),
  anticipo NUMERIC(14,2),
  factura NUMERIC(14,2),
  incentivo_c NUMERIC(14,2),
  valor_descuentos NUMERIC(14,2),
  combustible NUMERIC(14,2),
  sitra NUMERIC(14,2),
  rtica NUMERIC(14,2),
  admon NUMERIC(14,2),
  liquido NUMERIC(14,2),
  source_file TEXT DEFAULT 'GEMA',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fecha, codigo_vehiculo, cedula_conductor, ruta, grupo_liquidacion)
);
CREATE INDEX IF NOT EXISTS idx_ing_tercero_fecha ON ingreso_tercero(fecha);
CREATE INDEX IF NOT EXISTS idx_ing_tercero_cond ON ingreso_tercero(cedula_conductor);
CREATE INDEX IF NOT EXISTS idx_ing_tercero_prop ON ingreso_tercero(cedula_propietario);

-- 3. VIAJES RECAUDADOS (pa_ext_get_ViajesRecaudadosByFecha)
-- `numero` es el identificador natural del viaje en GEMA.
CREATE TABLE IF NOT EXISTS viajes_recaudados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero BIGINT NOT NULL UNIQUE,
  fecha_viaje DATE NOT NULL,
  hora_despacho TEXT,
  hora_llegada TEXT,
  codigo_vehiculo TEXT,
  placa TEXT,
  conductor_nombre TEXT,
  codigo_conductor TEXT,
  cedula_conductor TEXT,
  viaje TEXT,
  inicial NUMERIC(14,2),
  final NUMERIC(14,2),
  descuento NUMERIC(14,2),
  timbradas NUMERIC(12,2),
  timbradas_real NUMERIC(12,2),
  bruto NUMERIC(14,2),
  anticipo NUMERIC(14,2),
  factura NUMERIC(14,2),
  ahorro NUMERIC(14,2),
  neto NUMERIC(14,2),
  fecha_recaudo TIMESTAMPTZ,
  is_extemporaneo BOOLEAN DEFAULT false,
  cajero TEXT,
  pasaje NUMERIC(12,2),
  propietario_nombre TEXT,
  cedula_propietario TEXT,
  estado TEXT,
  novedad TEXT,
  ruta_programada TEXT,
  ruta_reprogramada TEXT,
  is_viaje_contable BOOLEAN DEFAULT false,
  source_file TEXT DEFAULT 'GEMA',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vrec_fecha ON viajes_recaudados(fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_vrec_cond ON viajes_recaudados(cedula_conductor);

-- 4. ESTADO DE SINCRONIZACIÓN
CREATE TABLE IF NOT EXISTS gema_sync_state (
  dataset TEXT PRIMARY KEY,
  last_synced_date DATE,
  last_run_at TIMESTAMPTZ,
  rows_synced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  error TEXT
);

INSERT INTO gema_sync_state (dataset) VALUES
  ('conductores'), ('empleados'), ('propietarios'),
  ('cierres'), ('viajes_perdidos'), ('ingreso_tercero'), ('viajes_recaudados')
ON CONFLICT (dataset) DO NOTHING;

-- 5. Origen del dato en cierres/viajes_perdidos (Excel vs GEMA)
ALTER TABLE cierres_diarios   ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'excel';
ALTER TABLE viajes_perdidos   ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'excel';

-- 6. Soporte de sincronización de empleados RRHH desde GEMA.
-- `gema_codigo` (código de personal) da una clave estable para upsert
-- idempotente sin pisar empleados creados manualmente.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gema_codigo TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_gema_codigo
  ON employees(gema_codigo) WHERE gema_codigo IS NOT NULL;

-- Trigger updated_at para propietarios
DROP TRIGGER IF EXISTS trg_propietarios_updated ON propietarios;
CREATE TRIGGER trg_propietarios_updated BEFORE UPDATE ON propietarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
