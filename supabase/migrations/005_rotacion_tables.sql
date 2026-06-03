-- ============================================================
-- MTC La Carolina — Database Schema
-- ============================================================

-- 1. CONDUCTORES (from vstConductoresactivos/retirados.xlsx)
CREATE TABLE conductores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cedula TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  codigo TEXT,
  correo TEXT,
  direccion TEXT,
  celular TEXT,
  telefono TEXT,
  tipo_conductor TEXT,
  licencia TEXT,
  venc_licencia DATE,
  venc_contrato DATE,
  fecha_ingreso DATE,
  fecha_retiro DATE,
  experiencia TEXT,
  fecha_nacimiento DATE,
  observacion TEXT,
  eps TEXT,
  arl TEXT,
  pension TEXT,
  compensacion TEXT,
  tipo_sangre TEXT,
  nivel_educativo TEXT,
  num_hijos INTEGER,
  estado_civil TEXT,
  reubicado TEXT,
  estado TEXT NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conductores_cedula ON conductores(cedula);
CREATE INDEX idx_conductores_codigo ON conductores(codigo);
CREATE INDEX idx_conductores_estado ON conductores(estado);
CREATE INDEX idx_conductores_fecha_ingreso ON conductores(fecha_ingreso);

-- 2. CIERRES DIARIOS (from CIERRE DEFINITIVO CONDUCTOR *.xlsx)
-- Cross-reference key: cod_conductor -> conductores.codigo
CREATE TABLE cierres_diarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_conductor TEXT NOT NULL,
  conductor_nombre TEXT,
  fecha DATE NOT NULL,
  tipo_cierre TEXT,
  ruta TEXT,
  grupo_liquidacion TEXT,
  vehiculo TEXT,
  viajes NUMERIC(10,2) DEFAULT 0,
  timbradas NUMERIC(12,2) DEFAULT 0,
  diff_tim NUMERIC(12,2) DEFAULT 0,
  prom_tim NUMERIC(12,2) DEFAULT 0,
  pct_indiv NUMERIC(6,2),
  pct_grupo NUMERIC(6,2),
  pct_total NUMERIC(6,2),
  tim_grupo NUMERIC(12,2),
  viajes_grupo NUMERIC(10,2),
  prom_grupo NUMERIC(12,2),
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cod_conductor, fecha, ruta)
);

CREATE INDEX idx_cierres_cod ON cierres_diarios(cod_conductor);
CREATE INDEX idx_cierres_fecha ON cierres_diarios(fecha);

-- 3. VIAJES PERDIDOS (from Feb_2026.xlsx, Mar_2026.xlsx)
-- Cross-reference key: cedula_conductor -> conductores.cedula
CREATE TABLE viajes_perdidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cedula_conductor TEXT NOT NULL,
  tipologia TEXT,
  novedad TEXT,
  detalle_novedad TEXT,
  fecha DATE NOT NULL,
  despacho TEXT,
  tipo_propietario TEXT,
  vehiculo TEXT,
  placa TEXT,
  conductor_nombre TEXT,
  turno TEXT,
  viaje TEXT,
  ruta TEXT,
  planillero TEXT,
  periodo TEXT,
  quincena SMALLINT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vp_cedula ON viajes_perdidos(cedula_conductor);
CREATE INDEX idx_vp_fecha ON viajes_perdidos(fecha);
CREATE INDEX idx_vp_tipologia ON viajes_perdidos(tipologia);
CREATE INDEX idx_vp_periodo ON viajes_perdidos(periodo);

-- 4. AUSENTISMO (from MATRIZ DE AUSENTISMO.xlsx)
-- Cross-reference key: cedula -> conductores.cedula
CREATE TABLE ausentismo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cedula TEXT NOT NULL,
  consecutivo_incapacidad TEXT,
  nombre TEXT,
  genero TEXT,
  edad INTEGER,
  antiguedad TEXT,
  vinculacion TEXT,
  centro_trabajo TEXT,
  departamento TEXT,
  area TEXT,
  cargo TEXT,
  indicador_prorroga TEXT,
  dias_it_pagados INTEGER,
  origen TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  mes_inicio TEXT,
  cie10 TEXT,
  diagnostico TEXT,
  soat TEXT,
  grd TEXT,
  dia_ocurrencia TEXT,
  eps TEXT,
  ips TEXT,
  profesional_responsable TEXT,
  tipo_conductor TEXT,
  estado TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ausentismo_cedula ON ausentismo(cedula);
CREATE INDEX idx_ausentismo_fecha ON ausentismo(fecha_inicio);

-- 5. FAMILIA (from Hijos y Conyugues.xlsx)
-- Cross-reference key: cedula_empleado -> conductores.cedula
CREATE TABLE familia (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cedula_empleado TEXT NOT NULL,
  nombre_familiar TEXT,
  parentesco TEXT,
  edad INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_familia_cedula ON familia(cedula_empleado);

-- 6. DATA UPLOADS (tracking)
CREATE TABLE data_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  rows_processed INTEGER DEFAULT 0,
  rows_errors INTEGER DEFAULT 0,
  periodo TEXT,
  fecha_corte DATE,
  status TEXT DEFAULT 'processing',
  error_log JSONB,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_grupo_antiguedad(p_fecha_ingreso DATE)
RETURNS TEXT AS $$
DECLARE
  meses INTEGER;
BEGIN
  IF p_fecha_ingreso IS NULL THEN RETURN NULL; END IF;
  meses := EXTRACT(YEAR FROM age(CURRENT_DATE, p_fecha_ingreso)) * 12
          + EXTRACT(MONTH FROM age(CURRENT_DATE, p_fecha_ingreso));
  RETURN CASE
    WHEN meses < 3 THEN '0-3m'
    WHEN meses < 6 THEN '3-6m'
    WHEN meses < 12 THEN '6-12m'
    ELSE '1+a'
  END;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE VIEW conductores_con_grupo AS
SELECT
  c.*,
  get_grupo_antiguedad(c.fecha_ingreso) AS grupo_antiguedad,
  EXTRACT(YEAR FROM age(CURRENT_DATE, c.fecha_ingreso)) * 12
    + EXTRACT(MONTH FROM age(CURRENT_DATE, c.fecha_ingreso)) AS meses_antiguedad
FROM conductores c;
