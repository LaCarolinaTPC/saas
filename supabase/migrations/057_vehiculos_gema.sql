-- ============================================================
-- Maestro de vehículos sincronizado desde GEMA
--
-- Fuente: vista MySQL `vst_ext_get_vehiculos` (~200 filas, única
-- por código). Se sincroniza como maestro (refresco completo) en
-- cada corrida del cron /api/cron/sync-gema, igual que
-- conductores/empleados/propietarios. La tabla `busetas` (048) se
-- mantiene aparte: es el catálogo manual de Mantenimiento.
-- ============================================================

CREATE TABLE IF NOT EXISTS vehiculos (
  codigo TEXT PRIMARY KEY,
  placa TEXT,
  modelo TEXT,
  motor TEXT,
  chasis TEXT,
  color TEXT,
  capacidad_sentado INTEGER,
  capacidad_en_pie INTEGER,
  tarjeta_propiedad TEXT,
  pasaje_ordinario NUMERIC(12,2),
  pasaje_festivo NUMERIC(12,2),
  registro BIGINT,
  max_factura NUMERIC(12,2),
  numero_tarjeta_op TEXT,
  automatico BOOLEAN,
  -- Se guarda tal cual llega de GEMA (la vista no documenta el significado).
  estado INTEGER,
  id_unidad TEXT,
  vinculado BOOLEAN,
  parametro_conteo TEXT,
  activo_cartulina BOOLEAN,
  activo_poliza BOOLEAN,
  tipo_propietario TEXT,
  tipo_propietario_op TEXT,
  observacion TEXT,
  tipo_carroceria TEXT,
  marca TEXT,
  clase TEXT,
  grupo_liquidacion TEXT,
  grupo_cu TEXT,
  tipo_gps TEXT,
  conductor_nombre TEXT,
  cedula_conductor TEXT,
  propietario_nombre TEXT,
  cedula_propietario TEXT,
  propietario_admin TEXT,
  cedula_propietario_admin TEXT,
  ruta TEXT,
  nombre_cartulina TEXT,
  fecha_tecno DATE,
  fecha_tarjeta_op DATE,
  fecha_soat DATE,
  fecha_contrato DATE,
  fecha_srcc DATE,
  fecha_srce DATE,
  fecha_full_amparo DATE,
  source_file TEXT DEFAULT 'GEMA',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON vehiculos(placa);

ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vehiculos FROM anon, public;
GRANT SELECT ON vehiculos TO authenticated;

INSERT INTO gema_sync_state (dataset) VALUES ('vehiculos')
ON CONFLICT (dataset) DO NOTHING;
