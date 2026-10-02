-- Revisión preoperacional (Operativo)
--
-- El patio revisaba cada bus antes del despacho en una lista de SharePoint:
-- 34 casillas Sí/No que había que tocar una por una, un desplegable con los
-- buses escritos a mano y desactualizado, los documentos marcados a mano
-- aunque GEMA ya trae sus vencimientos, y ninguna falla llegaba a
-- Mantenimiento. Gestivo lo reemplaza con un formulario donde todo arranca en
-- «cumple» y el inspector solo marca lo que falla; la aplicación decide si el
-- bus sale (apto, apto con observación, no apto).
--
-- La lista de chequeo vive en el código (src/lib/operativo/preoperacional-lista.ts)
-- y cada revisión guarda la versión con que se hizo. Solo se guardan los
-- puntos que fallaron: lo que no aparece en las fallas cumplió.
--
-- Cada falla mecánica abre un reporte en mantenimiento_reportes, así cuenta
-- para la alerta de 2 reportes en 30 días sin digitarlo dos veces;
-- origen_preoperacional_id deja el rastro de dónde salió.
--
-- Permiso propio `preoperacional`, como `registro_dano`: al inspector de patio
-- se le da solo esta pantalla. Lo reciben el admin y los tipos que ya tienen
-- Operativo; el tipo `inspector_patio` queda creado sin usuarios.
--
-- Se puede correr entero más de una vez.

CREATE TABLE IF NOT EXISTS operativo_preoperacional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  codigo_vehiculo TEXT NOT NULL REFERENCES vehiculos(codigo),
  placa TEXT,
  cedula_conductor TEXT REFERENCES conductores(cedula),
  conductor_nombre TEXT,
  resultado TEXT NOT NULL CHECK (resultado IN ('apto', 'apto_obs', 'no_apto')),
  fallas INTEGER NOT NULL DEFAULT 0 CHECK (fallas >= 0),
  fallas_criticas INTEGER NOT NULL DEFAULT 0 CHECK (fallas_criticas >= 0),
  documentos_vencidos INTEGER NOT NULL DEFAULT 0 CHECK (documentos_vencidos >= 0),
  -- Foto de la vigencia de cada documento al revisar: [{tipo, nombre, nivel, fecha, dias}].
  documentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  observaciones TEXT CHECK (observaciones IS NULL OR length(observaciones) <= 1000),
  version_lista TEXT NOT NULL,
  -- Segundos entre abrir el formulario del bus y guardarlo, para medir el tiempo por bus.
  duracion_seg INTEGER CHECK (duracion_seg IS NULL OR duracion_seg >= 0),
  inspector_id UUID REFERENCES auth.users(id),
  inspector_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operativo_preoperacional_fecha
  ON operativo_preoperacional (fecha, codigo_vehiculo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operativo_preoperacional_vehiculo
  ON operativo_preoperacional (codigo_vehiculo, fecha DESC);

COMMENT ON TABLE operativo_preoperacional IS
  'Revisión preoperacional de cada vehículo antes del despacho (Operativo → Preoperacional). Puede haber varias por bus y día; rige la más reciente.';

CREATE TABLE IF NOT EXISTS operativo_preoperacional_fallas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preoperacional_id UUID NOT NULL REFERENCES operativo_preoperacional(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  critico BOOLEAN NOT NULL,
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 300),
  concepto TEXT,
  mantenimiento_reporte_id UUID REFERENCES mantenimiento_reportes(id) ON DELETE SET NULL,
  UNIQUE (preoperacional_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_operativo_preoperacional_fallas_item
  ON operativo_preoperacional_fallas (item_key);

COMMENT ON TABLE operativo_preoperacional_fallas IS
  'Puntos que fallaron en una revisión preoperacional; los que no aparecen cumplieron con la versión de lista de la revisión.';

ALTER TABLE mantenimiento_reportes
  ADD COLUMN IF NOT EXISTS origen_preoperacional_id UUID
  REFERENCES operativo_preoperacional(id) ON DELETE SET NULL;

COMMENT ON COLUMN mantenimiento_reportes.origen_preoperacional_id IS
  'Revisión preoperacional que abrió el reporte; null si se registró a mano o desde el formulario del conductor.';

ALTER TABLE operativo_preoperacional ENABLE ROW LEVEL SECURITY;
ALTER TABLE operativo_preoperacional_fallas ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operativo_preoperacional TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operativo_preoperacional_fallas TO service_role;

-- Permisos: el admin y quien ya tiene Operativo reciben la clave nueva.
UPDATE user_types
SET modulos = modulos || '["preoperacional"]'::jsonb
WHERE (key = 'admin' OR modulos ? 'operativo')
  AND NOT (modulos ? 'preoperacional');

INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema)
VALUES (
  'inspector_patio',
  'Inspector de patio',
  'Solo diligencia la revisión preoperacional de los vehículos antes del despacho',
  '["preoperacional"]'::jsonb,
  'all',
  true,
  false
)
ON CONFLICT (key) DO NOTHING;

-- Comprobación: las dos tablas con RLS y privilegios de service_role, la
-- columna nueva y los tipos de usuario que quedaron con el permiso.
SELECT c.relname AS tabla,
       c.relrowsecurity AS rls,
       has_table_privilege('service_role', c.oid, 'SELECT') AS puede_leer,
       has_table_privilege('service_role', c.oid, 'INSERT') AS puede_insertar
FROM pg_class c
WHERE c.relname IN ('operativo_preoperacional', 'operativo_preoperacional_fallas')
UNION ALL
SELECT 'mantenimiento_reportes.origen_preoperacional_id', NULL,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'mantenimiento_reportes' AND column_name = 'origen_preoperacional_id'), NULL
UNION ALL
SELECT 'user_types con preoperacional: ' || string_agg(key, ', ' ORDER BY key), NULL, NULL, NULL
FROM user_types WHERE modulos ? 'preoperacional';
