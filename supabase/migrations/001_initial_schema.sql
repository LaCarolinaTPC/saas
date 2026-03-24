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
  source TEXT NOT NULL DEFAULT 'varylo',
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
