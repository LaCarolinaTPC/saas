-- ============================================================
-- Excesos de velocidad sincronizados desde GEMA
--
-- Fuente: procedimiento MySQL `pa_ext_get_VelocidadesByFecha
-- (pFecha1, pFecha2, pVelocidad)`: eventos GPS con velocidad
-- mayor o igual al umbral (GEMA exige mínimo 50 km/h). Con umbral
-- 50 llegan ~1.300 filas/día. No trae id propio: la clave es
-- (vehículo, fecha_hora).
-- ============================================================

CREATE TABLE IF NOT EXISTS velocidades (
  codigo_vehiculo TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL,
  fecha DATE NOT NULL,
  hora TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  velocidad NUMERIC(6,2),
  direccion TEXT,
  source_file TEXT DEFAULT 'GEMA',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (codigo_vehiculo, fecha_hora)
);

CREATE INDEX IF NOT EXISTS idx_velocidades_fecha ON velocidades(fecha);

ALTER TABLE velocidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON velocidades FROM anon, public;
GRANT SELECT ON velocidades TO authenticated;

INSERT INTO gema_sync_state (dataset) VALUES ('velocidades')
ON CONFLICT (dataset) DO NOTHING;
