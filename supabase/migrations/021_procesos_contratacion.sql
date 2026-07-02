-- =============================================================================
-- Procesos de contratación — reemplaza el Excel "Procesos de reclutamiento"
-- =============================================================================
-- Registro operativo de RRHH por cada aspirante a conductor: validaciones
-- (SIMIT, antecedentes, licencia), fechas del proceso y resultado final.
-- Se vincula a `candidates` por cédula cuando el candidato existe en el módulo
-- de candidatos, para unificar la información.

CREATE TABLE IF NOT EXISTS procesos_contratacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,

  fecha_creacion DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Bogota')::date),
  nombre TEXT NOT NULL,
  cedula TEXT NOT NULL,
  celular TEXT,
  reingreso BOOLEAN NOT NULL DEFAULT false,

  -- pendiente | citado | en_examenes | prueba_manejo | en_escuela |
  -- reconocimiento_ruta | contratado | cierre
  estado TEXT NOT NULL DEFAULT 'pendiente',
  causa_no_contrato TEXT,
  observacion TEXT,

  -- Validaciones
  simit TEXT,                                 -- ok | deuda | acuerdo_pago | pendiente
  simit_valor NUMERIC NOT NULL DEFAULT 0,     -- valor de la deuda SIMIT (COP)
  antecedentes TEXT,                          -- ok | pendiente | con_antecedentes
  licencia_categoria TEXT,                    -- categoría RUNT (C2, C3, ...)
  medio_postulacion TEXT,                     -- whatsapp | computrabajo | referido | ...

  -- Fechas del proceso
  fecha_citacion DATE,
  fecha_examenes DATE,
  fecha_prueba_manejo DATE,
  fecha_contrato DATE,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procesos_contratacion_cedula ON procesos_contratacion(cedula);
CREATE INDEX IF NOT EXISTS idx_procesos_contratacion_estado ON procesos_contratacion(estado);
CREATE INDEX IF NOT EXISTS idx_procesos_contratacion_fecha ON procesos_contratacion(fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_procesos_contratacion_candidate ON procesos_contratacion(candidate_id);

DROP TRIGGER IF EXISTS trg_procesos_contratacion_updated ON procesos_contratacion;
CREATE TRIGGER trg_procesos_contratacion_updated BEFORE UPDATE ON procesos_contratacion
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
