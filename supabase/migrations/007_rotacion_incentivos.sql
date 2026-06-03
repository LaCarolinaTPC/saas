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
