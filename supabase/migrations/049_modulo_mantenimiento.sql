-- 049: Área de Mantenimiento. Ejecutar después de 048.

CREATE TABLE IF NOT EXISTS mantenimiento_conceptos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mantenimiento_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa_buseta TEXT NOT NULL REFERENCES busetas(placa),
  concepto_id UUID NOT NULL REFERENCES mantenimiento_conceptos(id),
  cantidad INTEGER NOT NULL DEFAULT 2 CHECK (cantidad >= 2),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  orden_taller TEXT,
  notas_cierre TEXT,
  cerrada_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cerrada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mantenimiento_alerta_abierta
  ON mantenimiento_alertas(placa_buseta, concepto_id)
  WHERE estado = 'abierta';

CREATE TABLE IF NOT EXISTS mantenimiento_reportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID UNIQUE,
  placa_buseta TEXT NOT NULL REFERENCES busetas(placa),
  cedula_conductor TEXT NOT NULL REFERENCES conductores(cedula),
  concepto_id UUID NOT NULL REFERENCES mantenimiento_conceptos(id),
  descripcion TEXT,
  fecha_reporte TIMESTAMPTZ NOT NULL DEFAULT now(),
  alerta_id UUID REFERENCES mantenimiento_alertas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mantenimiento_reportes_fecha
  ON mantenimiento_reportes(fecha_reporte DESC);
CREATE INDEX IF NOT EXISTS idx_mantenimiento_reportes_buseta_concepto
  ON mantenimiento_reportes(placa_buseta, concepto_id, fecha_reporte DESC);

CREATE TABLE IF NOT EXISTS mantenimiento_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id UUID REFERENCES mantenimiento_alertas(id) ON DELETE CASCADE,
  reporte_id UUID REFERENCES mantenimiento_reportes(id) ON DELETE CASCADE,
  accion TEXT NOT NULL CHECK (accion IN ('reporte_creado', 'alerta_abierta', 'alerta_cerrada', 'buseta_creada')),
  detalle JSONB,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION mantenimiento_detectar_recurrencia()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_reportes INTEGER;
  alerta UUID;
BEGIN
  SELECT COUNT(*) INTO total_reportes
  FROM mantenimiento_reportes
  WHERE placa_buseta = NEW.placa_buseta
    AND concepto_id = NEW.concepto_id
    AND fecha_reporte >= NEW.fecha_reporte - INTERVAL '30 days'
    AND fecha_reporte <= NEW.fecha_reporte;

  IF total_reportes >= 2 THEN
    SELECT id INTO alerta
    FROM mantenimiento_alertas
    WHERE placa_buseta = NEW.placa_buseta
      AND concepto_id = NEW.concepto_id
      AND estado = 'abierta'
    LIMIT 1;

    IF alerta IS NULL THEN
      INSERT INTO mantenimiento_alertas (placa_buseta, concepto_id, cantidad)
      VALUES (NEW.placa_buseta, NEW.concepto_id, total_reportes)
      RETURNING id INTO alerta;
      INSERT INTO mantenimiento_auditoria (alerta_id, accion, detalle)
      VALUES (alerta, 'alerta_abierta', jsonb_build_object('cantidad', total_reportes));
    ELSE
      UPDATE mantenimiento_alertas SET cantidad = total_reportes WHERE id = alerta;
    END IF;

    UPDATE mantenimiento_reportes
    SET alerta_id = alerta
    WHERE placa_buseta = NEW.placa_buseta
      AND concepto_id = NEW.concepto_id
      AND fecha_reporte >= NEW.fecha_reporte - INTERVAL '30 days'
      AND fecha_reporte <= NEW.fecha_reporte
      AND alerta_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mantenimiento_recurrencia ON mantenimiento_reportes;
CREATE TRIGGER trg_mantenimiento_recurrencia
  AFTER INSERT ON mantenimiento_reportes
  FOR EACH ROW EXECUTE FUNCTION mantenimiento_detectar_recurrencia();

ALTER TABLE mantenimiento_conceptos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimiento_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimiento_reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimiento_auditoria ENABLE ROW LEVEL SECURITY;

INSERT INTO mantenimiento_conceptos (nombre, descripcion) VALUES
  ('Carrocería / Golpes', 'Daños externos en la estructura de la carrocería'),
  ('Vidrios / Espejos', 'Rotura o daño en vidrios, espejos o lunas'),
  ('Motor / Mecánica', 'Fallas mecánicas o del motor'),
  ('Llantas / Frenos', 'Problemas con llantas, frenos o suspensión'),
  ('Sistema Eléctrico', 'Fallas eléctricas, luces o batería'),
  ('Interior / Asientos', 'Daños internos de la buseta'),
  ('Otro', 'Daño no clasificado')
ON CONFLICT (nombre) DO NOTHING;

UPDATE user_types
SET modulos = modulos || '["mantenimiento"]'::jsonb
WHERE key = 'admin' AND NOT (modulos ? 'mantenimiento');

INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema)
VALUES ('mantenimiento', 'Mantenimiento', 'Registro y gestión de daños de busetas',
  '["mantenimiento"]'::jsonb, 'all', true, false)
ON CONFLICT (key) DO NOTHING;
