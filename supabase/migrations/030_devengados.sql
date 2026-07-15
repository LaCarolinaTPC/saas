-- Módulo "Otros devengados" a conductores.
--
-- Solo se persiste la transacción de caja (devengados_entregas): la
-- producción diaria y el acumulado quincenal se calculan al vuelo desde
-- viajes_recaudados, porque GEMA entrega los recaudos con días de atraso y
-- una tabla materializada quedaría desactualizada.

CREATE TABLE IF NOT EXISTS devengados_entregas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Día contable de la transacción: la entrega aprobada queda en el cierre
  -- del mismo día en que se ejecuta.
  fecha DATE NOT NULL,
  periodo TEXT NOT NULL,                 -- 'YYYY-MM'
  quincena SMALLINT NOT NULL CHECK (quincena IN (1, 2)),
  cedula_conductor TEXT NOT NULL,
  codigo_conductor TEXT,
  conductor_nombre TEXT,
  -- Números de viajes_recaudados.numero liquidados en esta entrega.
  viajes JSONB NOT NULL DEFAULT '[]'::jsonb,
  valor_entregado NUMERIC(14,2) NOT NULL CHECK (valor_entregado > 0),
  cuenta_contable TEXT NOT NULL DEFAULT '281505010',
  movimiento TEXT NOT NULL DEFAULT 'DEBITO',
  observacion TEXT,
  -- Registro del traslado manual a GEMA (lo digita una persona después).
  trasladada_gema BOOLEAN NOT NULL DEFAULT false,
  trasladada_at TIMESTAMPTZ,
  trasladada_por UUID REFERENCES profiles(id),
  aprobada_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_entregas_fecha ON devengados_entregas(fecha);
CREATE INDEX IF NOT EXISTS idx_dev_entregas_conductor ON devengados_entregas(cedula_conductor);
CREATE INDEX IF NOT EXISTS idx_dev_entregas_periodo ON devengados_entregas(periodo, quincena);

-- Base diaria parametrizada (hoy $85.000/día). Nunca hardcodear en pantallas
-- ni reportes: siempre leerla de app_settings.
INSERT INTO app_settings (key, value)
VALUES ('devengados_base_diaria', '85000')
ON CONFLICT (key) DO NOTHING;

-- Permisos: habilitar el módulo a administradores y operaciones.
UPDATE user_types
SET modulos = modulos || '["devengados"]'::jsonb
WHERE key IN ('admin', 'operaciones')
  AND NOT modulos ? 'devengados';
