-- Control de cámaras y sensores (Mantenimiento)
--
-- Mantenimiento revisaba en un Microsoft Forms anónimo el video de cada viaje:
-- contaba los pasajeros (aforo), los comparaba con el conteo del sensor
-- Optocontrol (DFS) y anotaba las fallas de cámara o de sensor. Todo se
-- digitaba a mano: el conductor, el bus, el número de viaje y la fecha, así
-- que 2.200 filas quedaron "SIN CONDUCTOR", hay fechas con el día y el mes
-- invertidos y el mismo tipo de falla escrito de dos formas. Gestivo lo
-- reemplaza con un formulario que toma el viaje y el conductor del despacho de
-- GEMA (historico_despacho) y los tipos de novedad de un catálogo.
--
-- Una fila por viaje revisado y elemento (cámara o sensor). No hay UNIQUE: el
-- histórico trae revisiones repetidas legítimas (la «R» del Forms), que quedan
-- marcadas en revision_repetida. El recaudo de caja no se guarda: se lee de
-- viajes_recaudados por despacho_numero al mostrar.
--
-- Permiso propio `camaras`, como `registro_dano`: el técnico de cámaras recibe
-- solo esta pantalla. Lo reciben el admin y los tipos que ya tienen
-- Mantenimiento; el tipo `tecnico_camaras` queda creado sin usuarios.
--
-- Se puede correr entero más de una vez.

CREATE TABLE IF NOT EXISTS camaras_tipos_novedad (
  clave TEXT PRIMARY KEY,
  elemento TEXT NOT NULL CHECK (elemento IN ('camara', 'sensor')),
  nombre TEXT NOT NULL,
  -- false para los resultados que no son daño: normal, rutina, bus varado.
  es_falla BOOLEAN NOT NULL,
  -- Conteos que la revisión de cámara exige. Sin información del sensor o con
  -- el bus varado el DFS no llega, pero el aforo se cuenta en el video; con la
  -- cámara dañada no hay video y ninguno de los dos es obligatorio.
  exige_dfs BOOLEAN NOT NULL DEFAULT false,
  exige_aforo BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE camaras_tipos_novedad IS
  'Catálogo de resultados de la revisión de cámaras y sensores; sembrado con los valores del Forms de Mantenimiento.';

INSERT INTO camaras_tipos_novedad (clave, elemento, nombre, es_falla, exige_dfs, exige_aforo, orden) VALUES
  ('camara_normal',            'camara', 'Normal',                   false, true,  true,  10),
  ('camara_no_bajo_info',      'camara', 'No bajó información',      true,  false, true,  20),
  ('camara_varado',            'camara', 'Bus varado',               false, false, true,  30),
  ('camara_desconfiguracion',  'camara', 'Desconfiguración',         true,  false, false, 40),
  ('camara_corto_electrico',   'camara', 'Corto eléctrico',          true,  false, false, 50),
  ('camara_microsd',           'camara', 'MicroSD',                  true,  false, false, 60),
  ('camara_cambio',            'camara', 'Cambio de cámara',         true,  false, false, 70),
  ('camara_accidente',         'camara', 'Accidente',                true,  false, false, 80),
  ('sensor_rutina',            'sensor', 'Revisión rutinaria',       false, false, false, 10),
  ('sensor_no_descargaba',     'sensor', 'No descargaba',            true,  false, false, 20),
  ('sensor_exceso_timbradas',  'sensor', 'Exceso de timbradas',      true,  false, false, 30),
  ('sensor_abordados',         'sensor', 'Abordados',                true,  false, false, 40),
  ('sensor_bloqueo_p1',        'sensor', 'Bloqueos puerta 1',        true,  false, false, 50),
  ('sensor_bloqueo_p2',        'sensor', 'Bloqueos puerta 2',        true,  false, false, 60),
  ('sensor_no_marca_p1',       'sensor', 'No marca puerta 1',        true,  false, false, 70),
  ('sensor_no_marca_p2',       'sensor', 'No marca puerta 2',        true,  false, false, 80),
  ('sensor_no_marca_info',     'sensor', 'No marca información',     true,  false, false, 90),
  ('sensor_apagado',           'sensor', 'Sensor apagado',           true,  false, false, 100),
  ('sensor_diferencia_aforo',  'sensor', 'Diferencia con el aforo',  true,  false, false, 110),
  ('sensor_falla_gps',         'sensor', 'Falla de GPS',             true,  false, false, 120)
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS camaras_revisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_viaje DATE NOT NULL,
  -- Sin FK a vehiculos: el histórico trae buses que ya salieron de la flota.
  vehiculo_codigo TEXT NOT NULL,
  -- Número de viaje del bus ese día ('1'..'99') o 'C.U'.
  viaje TEXT NOT NULL CHECK (viaje ~ '^([1-9][0-9]?|C\.U)$'),
  -- historico_despacho.numero del viaje revisado; null si GEMA no lo tiene.
  despacho_numero BIGINT,
  conductor_cedula TEXT,
  conductor_nombre TEXT,
  conductor_origen TEXT NOT NULL CHECK (conductor_origen IN
    ('gema_viaje', 'gema_dia', 'formulario', 'ambiguo', 'sin_cruce')),
  elemento TEXT NOT NULL CHECK (elemento IN ('camara', 'sensor')),
  tipo_novedad TEXT NOT NULL REFERENCES camaras_tipos_novedad(clave),
  con_falla BOOLEAN NOT NULL,
  dfs_optocontrol INTEGER CHECK (dfs_optocontrol IS NULL OR dfs_optocontrol >= 0),
  aforo INTEGER CHECK (aforo IS NULL OR aforo >= 0),
  revision_repetida BOOLEAN NOT NULL DEFAULT false,
  observaciones TEXT CHECK (observaciones IS NULL OR length(observaciones) <= 1000),
  mantenimiento_reporte_id UUID REFERENCES mantenimiento_reportes(id) ON DELETE SET NULL,
  tecnico_id UUID REFERENCES auth.users(id),
  tecnico_email TEXT,
  origen TEXT NOT NULL DEFAULT 'formulario' CHECK (origen IN ('formulario', 'migracion')),
  -- Fila original del Excel del Forms, para rastrear lo migrado.
  datos_origen JSONB,
  -- Avisos de calidad: fecha_corregida, vehiculo_no_existe, viaje_no_existe,
  -- conductor_distinto, conteo_invalido…
  alertas TEXT[] NOT NULL DEFAULT '{}',
  eliminado_at TIMESTAMPTZ,
  eliminado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camaras_revisiones_vehiculo
  ON camaras_revisiones (vehiculo_codigo, fecha_viaje DESC);
CREATE INDEX IF NOT EXISTS idx_camaras_revisiones_fecha
  ON camaras_revisiones (fecha_viaje DESC);
CREATE INDEX IF NOT EXISTS idx_camaras_revisiones_conductor
  ON camaras_revisiones (conductor_cedula, fecha_viaje DESC);
CREATE INDEX IF NOT EXISTS idx_camaras_revisiones_despacho
  ON camaras_revisiones (despacho_numero) WHERE despacho_numero IS NOT NULL;

COMMENT ON TABLE camaras_revisiones IS
  'Revisión de cámara o sensor de un viaje (Mantenimiento → Cámaras y sensores). Todo lector filtra eliminado_at IS NULL.';

ALTER TABLE mantenimiento_reportes
  ADD COLUMN IF NOT EXISTS origen_camaras_id UUID
  REFERENCES camaras_revisiones(id) ON DELETE SET NULL;

COMMENT ON COLUMN mantenimiento_reportes.origen_camaras_id IS
  'Revisión de cámaras y sensores que abrió el reporte; null si se registró por otra vía.';

ALTER TABLE camaras_tipos_novedad ENABLE ROW LEVEL SECURITY;
ALTER TABLE camaras_revisiones ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE camaras_tipos_novedad TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE camaras_revisiones TO service_role;

-- Permisos: el admin y quien ya tiene Mantenimiento reciben la clave nueva.
UPDATE user_types
SET modulos = modulos || '["camaras"]'::jsonb
WHERE (key = 'admin' OR modulos ? 'mantenimiento')
  AND NOT (modulos ? 'camaras');

INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema)
VALUES (
  'tecnico_camaras',
  'Técnico de cámaras',
  'Solo registra la revisión de cámaras y sensores de los viajes',
  '["camaras"]'::jsonb,
  'all',
  true,
  false
)
ON CONFLICT (key) DO NOTHING;

-- Comprobación: tablas con RLS y privilegios, catálogo sembrado, columna nueva
-- y tipos de usuario con el permiso.
SELECT c.relname AS tabla,
       c.relrowsecurity::text AS rls,
       has_table_privilege('service_role', c.oid, 'SELECT')::text AS puede_leer,
       has_table_privilege('service_role', c.oid, 'INSERT')::text AS puede_insertar
FROM pg_class c
WHERE c.relname IN ('camaras_tipos_novedad', 'camaras_revisiones')
UNION ALL
SELECT 'tipos de novedad', (SELECT count(*) FROM camaras_tipos_novedad)::text, NULL, NULL
UNION ALL
SELECT 'mantenimiento_reportes.origen_camaras_id',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'mantenimiento_reportes' AND column_name = 'origen_camaras_id')::text, NULL, NULL
UNION ALL
SELECT 'user_types con camaras: ' || string_agg(key, ', ' ORDER BY key), NULL, NULL, NULL
FROM user_types WHERE modulos ? 'camaras';
