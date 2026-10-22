-- revision cartulina novedades dinamicas y puente a camaras
--
-- Contexto: explique por qué hace falta este cambio, no lo que hace el SQL.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- Revisión cartulina ↔ Revisión de cámaras
-- =============================================================================
-- 1. El campo "Revisión" de cartulina deja de ser una lista fija de 5 valores y
--    pasa a un catálogo editable: quien tenga la revisión de cartulina puede
--    crear novedades nuevas. Un concepto especial, "Enviar a revisión de
--    cámaras", dispara una solicitud al módulo de cámaras.
-- 2. La solicitud la resuelve el revisor de cámaras generando "Recobro" o
--    "Normalidad de timbradas" (ambas solo informativas), lo que a su vez deja
--    un registro en camaras_revisiones y se ve de vuelta en cartulina.

-- ── Catálogo editable de novedades de la revisión de cartulina ───────────────
CREATE TABLE IF NOT EXISTS tesoreria_revision_novedades (
  clave TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  -- Al marcar un viaje con esta novedad se abre una solicitud a cámaras.
  envia_a_camaras BOOLEAN NOT NULL DEFAULT false,
  -- Las de sistema no se pueden borrar ni renombrar desde la UI.
  es_sistema BOOLEAN NOT NULL DEFAULT false,
  creado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tesoreria_revision_novedades IS
  'Catálogo editable del campo "Revisión" de Tesorería → Revisión cartulina. Los nombres de sistema coinciden con los 5 valores históricos para no romper filas ya guardadas.';

-- Semilla: los 5 valores históricos (mismo nombre que guardaban las filas) y el
-- concepto especial que envía a cámaras.
INSERT INTO tesoreria_revision_novedades (clave, nombre, orden, envia_a_camaras, es_sistema) VALUES
  ('justificado',       'Justificado (con soporte)',          10, false, true),
  ('no_justificado',    'No justificado — cobrar/descontar',  20, false, true),
  ('error_datos',       'Error de datos / sistema',           30, false, true),
  ('escalado',          'Escalado a otra área',               40, false, true),
  ('otro',              'Otro (ver nota)',                    50, false, true),
  ('enviar_camaras',    'Enviar a revisión de cámaras',       60, true,  true)
ON CONFLICT (clave) DO NOTHING;

-- El resultado ya no se valida con un CHECK fijo: ahora se valida en el server
-- action contra el catálogo activo. Se quita el CHECK heredado si existe.
ALTER TABLE tesoreria_revision_timbradas
  DROP CONSTRAINT IF EXISTS tesoreria_revision_timbradas_resultado_check;

-- ── Dos novedades de cámaras para la resolución de timbradas ─────────────────
-- Se registran como novedades de "sensor" porque el recobro/normalidad nace del
-- conteo de timbradas (sensor de puertas). "Recobro" es falla; "Normalidad" no.
INSERT INTO camaras_tipos_novedad (clave, elemento, nombre, es_falla, exige_dfs, exige_aforo, orden) VALUES
  ('sensor_recobro',               'sensor', 'Recobro',                 true,  false, false, 130),
  ('sensor_normalidad_timbradas',  'sensor', 'Normalidad de timbradas', false, false, false, 140)
ON CONFLICT (clave) DO NOTHING;

-- ── Puente Cartulina → Cámaras (solicitud y su resolución) ───────────────────
CREATE TABLE IF NOT EXISTS tesoreria_camaras_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_viaje DATE NOT NULL,
  numero BIGINT NOT NULL,                 -- despacho de GEMA (une con la cartulina)
  placa TEXT,
  viaje INTEGER,
  vehiculo_codigo TEXT,                   -- número interno del bus (snapshot)
  conductor_cedula TEXT,
  conductor_nombre TEXT,
  ruta TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelto')),
  solicitado_por_email TEXT,
  solicitado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota_solicitud TEXT CHECK (nota_solicitud IS NULL OR length(nota_solicitud) <= 500),
  -- Resolución desde cámaras (solo informativa: recobro | normalidad_timbradas).
  resultado TEXT CHECK (resultado IS NULL OR resultado IN ('recobro', 'normalidad_timbradas')),
  nota_camaras TEXT CHECK (nota_camaras IS NULL OR length(nota_camaras) <= 1000),
  camaras_revision_id UUID REFERENCES camaras_revisiones(id) ON DELETE SET NULL,
  resuelto_por_email TEXT,
  resuelto_at TIMESTAMPTZ,
  -- Un único hilo abierto por viaje: upsert por (fecha_viaje, numero).
  UNIQUE (fecha_viaje, numero)
);

COMMENT ON TABLE tesoreria_camaras_solicitudes IS
  'Solicitudes que la Revisión cartulina envía a la Revisión de cámaras y su resolución (recobro / normalidad de timbradas), visible en ambos módulos.';

CREATE INDEX IF NOT EXISTS idx_tes_cam_solic_estado ON tesoreria_camaras_solicitudes (estado);
CREATE INDEX IF NOT EXISTS idx_tes_cam_solic_fecha ON tesoreria_camaras_solicitudes (fecha_viaje);

ALTER TABLE tesoreria_revision_novedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesoreria_camaras_solicitudes ENABLE ROW LEVEL SECURITY;

-- En esta instalación los privilegios no se heredan: se conceden a mano.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_revision_novedades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_camaras_solicitudes TO service_role;
