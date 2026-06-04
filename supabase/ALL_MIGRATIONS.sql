-- ============================================================================
-- GESTIVO + Rotación + Accidentabilidad — TODAS las migraciones en un archivo
-- Pegar y ejecutar completo en: Supabase → SQL Editor
-- Orden: 001 → 010. Generado automáticamente.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  001_initial_schema.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- GESTIVO HR ERP - Database Schema
-- =============================================

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'rrhh', 'reclutador', 'coordinador', 'consulta');
CREATE TYPE vacancy_status AS ENUM ('borrador', 'activa', 'cerrada', 'archivada');
CREATE TYPE contract_type AS ENUM ('indefinido', 'fijo', 'obra_labor', 'prestacion_servicios', 'practicante');
CREATE TYPE modality AS ENUM ('presencial', 'remoto', 'hibrido');
CREATE TYPE pipeline_stage AS ENUM ('recibido', 'en_revision', 'validacion_documental', 'preseleccionado', 'entrevistado', 'en_pruebas', 'aprobado', 'rechazado');
CREATE TYPE document_status AS ENUM ('pendiente', 'revisado', 'aprobado', 'firmado', 'vencido', 'rechazado');
CREATE TYPE employee_status AS ENUM ('activo', 'inactivo', 'periodo_prueba', 'permiso', 'retirado');
CREATE TYPE novedad_type AS ENUM ('incapacidad', 'permiso', 'vacaciones', 'llamado_atencion', 'sancion', 'cambio_cargo', 'cambio_salario', 'retiro', 'otro');
CREATE TYPE descargo_status AS ENUM ('abierto', 'en_proceso', 'resuelto', 'cerrado');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'consulta',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vacancies
CREATE TABLE vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  description TEXT,
  requirements TEXT,
  location TEXT,
  modality modality DEFAULT 'presencial',
  contract_type contract_type DEFAULT 'indefinido',
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency TEXT DEFAULT 'COP',
  status vacancy_status DEFAULT 'borrador',
  created_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Candidates
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'CC',
  document_number TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  location TEXT,
  linkedin_url TEXT,
  avatar_url TEXT,
  source TEXT DEFAULT 'manual',
  skills TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Candidate-Vacancy junction
CREATE TABLE candidate_vacancy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id UUID REFERENCES vacancies(id) ON DELETE CASCADE,
  current_stage pipeline_stage DEFAULT 'recibido',
  assigned_to UUID REFERENCES profiles(id),
  applied_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(candidate_id, vacancy_id)
);

-- Stage history (timeline)
CREATE TABLE stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_vacancy_id UUID REFERENCES candidate_vacancy(id) ON DELETE CASCADE,
  from_stage pipeline_stage,
  to_stage pipeline_stage NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notes
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'candidate' or 'employee'
  entity_id UUID NOT NULL,
  author_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id),
  full_name TEXT NOT NULL,
  document_number TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  department_id UUID REFERENCES departments(id),
  position TEXT NOT NULL,
  status employee_status DEFAULT 'activo',
  hire_date DATE NOT NULL,
  end_date DATE,
  contract_type contract_type DEFAULT 'indefinido',
  salary NUMERIC,
  salary_currency TEXT DEFAULT 'COP',
  supervisor_id UUID REFERENCES profiles(id),
  location TEXT,
  eps TEXT,
  afp TEXT,
  arl TEXT,
  caja_compensacion TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Document categories
CREATE TABLE document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#4F46E5',
  required_for_hiring BOOLEAN DEFAULT false
);

-- Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  category_id UUID REFERENCES document_categories(id),
  status document_status DEFAULT 'pendiente',
  classification_confidence REAL,
  needs_review BOOLEAN DEFAULT false,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id),
  uploaded_by UUID REFERENCES profiles(id),
  expires_at DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Employee events (novedades)
CREATE TABLE employee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  type novedad_type NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'pendiente',
  attachments JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disciplinary records (descargos)
CREATE TABLE disciplinary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  status descargo_status DEFAULT 'abierto',
  resolution TEXT,
  attachments JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook logs
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'webhook',
  payload JSONB NOT NULL,
  candidate_id UUID REFERENCES candidates(id),
  status TEXT DEFAULT 'recibido',
  error_message TEXT,
  processing_result JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp messages
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_log_id UUID REFERENCES webhook_logs(id),
  candidate_id UUID REFERENCES candidates(id),
  phone_number TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  direction TEXT DEFAULT 'inbound',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_candidates_phone ON candidates(phone);
CREATE INDEX idx_candidates_document ON candidates(document_number);
CREATE INDEX idx_candidate_vacancy_stage ON candidate_vacancy(current_stage);
CREATE INDEX idx_candidate_vacancy_vacancy ON candidate_vacancy(vacancy_id);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_candidate ON documents(candidate_id);
CREATE INDEX idx_documents_employee ON documents(employee_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX idx_whatsapp_phone ON whatsapp_messages(phone_number);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vacancies_updated BEFORE UPDATE ON vacancies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_candidate_vacancy_updated BEFORE UPDATE ON candidate_vacancy FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  002_seed_data.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Seed Data for GESTIVO

-- Departments
INSERT INTO departments (name, description) VALUES
  ('Ingeniería', 'Departamento de desarrollo de software e infraestructura'),
  ('Diseño', 'Departamento de diseño UX/UI y producto'),
  ('Mercadeo', 'Departamento de marketing y comunicaciones'),
  ('RRHH', 'Departamento de recursos humanos'),
  ('Operaciones', 'Departamento de operaciones y logística'),
  ('Finanzas', 'Departamento de finanzas y contabilidad');

-- Document categories
INSERT INTO document_categories (name, slug, color, required_for_hiring) VALUES
  ('Hoja de Vida', 'hoja-de-vida', '#4F46E5', true),
  ('Documento de Identidad', 'documento-identidad', '#2563EB', true),
  ('Licencia de Conducción', 'licencia', '#7C3AED', false),
  ('Certificados Laborales', 'certificados', '#0891B2', false),
  ('Antecedentes', 'antecedentes', '#DC2626', true),
  ('Exámenes Médicos', 'examenes', '#EA580C', true),
  ('Contrato', 'contrato', '#4F46E5', true),
  ('Política', 'politica', '#7C3AED', false),
  ('Nómina', 'nomina', '#D97706', false),
  ('Vinculación', 'vinculacion', '#1E40AF', false),
  ('Otro', 'otro', '#64748B', false);


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  003_webhook_configs.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Webhook configurations for dynamic integrations
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  field_mappings JSONB NOT NULL DEFAULT '{}',
  auth_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_webhook_configs_updated BEFORE UPDATE ON webhook_configs
FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  004_documents_storage.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access on documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Allow service role to upload
CREATE POLICY "Service role upload on documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

-- Allow service role to delete
CREATE POLICY "Service role delete on documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents');


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  005_rotacion_tables.sql
-- ╚══════════════════════════════════════════════════════════════════════════

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


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  006_rotacion_fecha_reingreso.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Add fecha_reingreso to conductores table
-- Populated automatically when a previously retired conductor is re-hired.
-- Used as the data cutoff date for profile queries (cierres, viajes_perdidos, ausentismo).
-- NULL means the conductor has never been re-hired (no cutoff applied).
ALTER TABLE conductores ADD COLUMN fecha_reingreso DATE NULL;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  007_rotacion_incentivos.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Incentivos entregados a conductores
-- Carga maestra acumulada (delete_insert): cada carga reemplaza todos los registros.
-- periodo: primer día del mes de entrega, usada para filtrar por fecha_reingreso.
CREATE TABLE incentivos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cedula TEXT NOT NULL,
  nombre TEXT,
  mes_entrega TEXT,
  periodo DATE,
  valor NUMERIC(14,2) DEFAULT 0,
  concepto TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_incentivos_cedula ON incentivos(cedula);


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  008_accidentes.sql
-- ╚══════════════════════════════════════════════════════════════════════════

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


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  009_accidentes_storage.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Storage privado para el módulo de Accidentabilidad
-- Firmas y audio contienen datos personales → bucket privado, lectura por signed URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('accidentes', 'accidentes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role read on accidentes" ON storage.objects
  FOR SELECT USING (bucket_id = 'accidentes');

CREATE POLICY "Service role upload on accidentes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'accidentes');

CREATE POLICY "Service role delete on accidentes" ON storage.objects
  FOR DELETE USING (bucket_id = 'accidentes');


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  010_app_settings.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- Configuración de la aplicación (clave-valor)
-- Usado, entre otros, para la API key de transcripción (OpenAI), editable desde Configuración.
-- Acceso solo vía service role (server-side); nunca exponer 'value' al cliente.

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

