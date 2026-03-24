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
