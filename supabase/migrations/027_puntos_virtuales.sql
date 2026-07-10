-- ============================================================
-- PUNTOS VIRTUALES (pa_ext_get_PuntosVirtualesByFecha)
-- Telemetría de las registradoras a bordo: posición GPS, punto
-- virtual, subidas/bajadas de pasajeros por puerta y despacho.
-- Volumen alto: ~40.000 filas por día → sync incremental propio
-- (no usa la ventana de re-sincronización de 45 días).
-- `Numero` es el identificador natural del evento en GEMA.
-- ============================================================

CREATE TABLE IF NOT EXISTS puntos_virtuales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero BIGINT NOT NULL UNIQUE,
  imei TEXT,
  placa TEXT,
  codigo_vehiculo TEXT,
  registradora BIGINT,
  pasajeros_dia INTEGER,
  fecha_hora TIMESTAMPTZ,
  fecha DATE NOT NULL,
  hora TEXT,
  cod_pv TEXT,
  punto_virtual TEXT,
  descripcion TEXT,
  estado TEXT,
  bloqueo BOOLEAN DEFAULT false,
  velocidad NUMERIC(8,2),
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  direccion TEXT,
  is_base BOOLEAN,
  subidas INTEGER,
  bajadas INTEGER,
  abordo INTEGER,
  subidas_p1 INTEGER,
  subidas_p2 INTEGER,
  subidas_p3 INTEGER,
  bajadas_p1 INTEGER,
  bajadas_p2 INTEGER,
  bajadas_p3 INTEGER,
  numero_despacho BIGINT,
  viaje_despacho TEXT,
  hora_despacho TEXT,
  source_file TEXT DEFAULT 'GEMA',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_fecha ON puntos_virtuales(fecha);
CREATE INDEX IF NOT EXISTS idx_pv_vehiculo ON puntos_virtuales(codigo_vehiculo, fecha);
CREATE INDEX IF NOT EXISTS idx_pv_punto ON puntos_virtuales(punto_virtual);

INSERT INTO gema_sync_state (dataset) VALUES ('puntos_virtuales')
ON CONFLICT (dataset) DO NOTHING;
