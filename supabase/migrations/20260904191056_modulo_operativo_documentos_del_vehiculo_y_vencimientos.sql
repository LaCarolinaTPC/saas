-- Módulo "operativo": documentos del vehículo y alerta temprana de vencimientos
--
-- Contexto. Operativo necesita saber, por vehículo, si el SOAT, la revisión
-- técnico-mecánica, las pólizas RCC y RCE y la tarjeta de operación están
-- vigentes, guardar el archivo de cada documento y enterarse con anticipación
-- de lo que va a vencer. Las fechas de vencimiento ya existen en el maestro
-- `vehiculos` (las trae GEMA cada día a las 8:00: fecha_soat, fecha_tecno,
-- fecha_srcc, fecha_srce, fecha_tarjeta_op), pero ese maestro es de solo
-- lectura para la app y no guarda archivos ni historial.
--
-- Qué hace:
--   1. `operativo_documento_tipos`: catálogo de los cinco documentos, con la
--      columna de GEMA que le corresponde y los umbrales de aviso (días para
--      "próximo a vencer" y "crítico"), editables desde la pantalla.
--   2. `operativo_vehiculo_documentos`: cada documento cargado (número,
--      entidad, fechas, archivo en Storage, quién lo cargó). No se borra: se
--      anula con motivo y queda el rastro.
--   3. Bucket privado `operativo` en Storage para los archivos; se sirven con
--      URL firmada desde el servidor.
--   4. Vista `vw_operativo_vencimientos`: una fila por vehículo activo y tipo
--      de documento, con la fecha de GEMA, la del último documento cargado
--      vigente, la fecha que rige (la más reciente de las dos), los días que
--      faltan y si hay discrepancia. El nivel de alerta (próximo, crítico,
--      vencido, sin dato) lo calcula la aplicación con los umbrales del
--      catálogo, para que pantalla, PDF y avisos usen la misma regla.
--   5. Permisos: módulo `operativo` para `admin` y un tipo de usuario nuevo
--      `operativo` con puede_editar.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: el script corre entero de una sola vez y
-- es idempotente. Las tablas nuevas no heredan privilegios: el GRANT a
-- service_role va aquí mismo o las consultas devuelven 403.

-- ── 1. Catálogo de tipos de documento ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operativo_documento_tipos (
  key TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  -- Columna DATE de `vehiculos` que GEMA sincroniza para este documento.
  columna_gema TEXT CHECK (columna_gema IN (
    'fecha_soat', 'fecha_tecno', 'fecha_tarjeta_op', 'fecha_srcc',
    'fecha_srce', 'fecha_full_amparo', 'fecha_contrato'
  )),
  -- Umbrales de aviso en días antes del vencimiento.
  dias_proximo INTEGER NOT NULL DEFAULT 30 CHECK (dias_proximo > 0),
  dias_critico INTEGER NOT NULL DEFAULT 15 CHECK (dias_critico >= 0),
  orden INTEGER NOT NULL DEFAULT 100,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operativo_documento_tipos_umbral_chk CHECK (dias_critico <= dias_proximo)
);

INSERT INTO operativo_documento_tipos (key, nombre, columna_gema, dias_proximo, dias_critico, orden) VALUES
  ('soat',              'SOAT',                        'fecha_soat',       30, 15, 10),
  ('tecnomecanica',     'Revisión técnico-mecánica',   'fecha_tecno',      30, 15, 20),
  ('poliza_rcc',        'Póliza RC contractual',       'fecha_srcc',       30, 15, 30),
  ('poliza_rce',        'Póliza RC extracontractual',  'fecha_srce',       30, 15, 40),
  ('tarjeta_operacion', 'Tarjeta de operación',        'fecha_tarjeta_op', 30, 15, 50)
ON CONFLICT (key) DO NOTHING;

-- ── 2. Documentos cargados por vehículo ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS operativo_vehiculo_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Llave del maestro GEMA; sobrevive a un cambio de placa.
  codigo_vehiculo TEXT NOT NULL REFERENCES vehiculos(codigo),
  tipo TEXT NOT NULL REFERENCES operativo_documento_tipos(key),
  -- Número de póliza, del SOAT o del certificado; aseguradora o CDA.
  numero TEXT,
  entidad TEXT,
  fecha_expedicion DATE,
  fecha_vencimiento DATE NOT NULL,
  -- Archivo en el bucket `operativo` (opcional: se puede registrar la
  -- vigencia sin adjuntar todavía el PDF).
  archivo_ruta TEXT,
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_tamano INTEGER,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Anulación con rastro; un documento anulado deja de contar como vigente.
  anulado_en TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT operativo_vehiculo_documentos_fechas_chk
    CHECK (fecha_expedicion IS NULL OR fecha_expedicion <= fecha_vencimiento)
);

-- La vista y la ficha buscan el último documento vigente por vehículo y tipo.
CREATE INDEX IF NOT EXISTS idx_operativo_vehiculo_documentos_vigente
  ON operativo_vehiculo_documentos (codigo_vehiculo, tipo, fecha_vencimiento DESC)
  WHERE anulado_en IS NULL;

-- ── 3. Bucket privado para los archivos ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('operativo', 'operativo', false)
ON CONFLICT (id) DO NOTHING;

-- service_role ignora RLS, pero las políticas quedan explícitas para que
-- ningún otro rol pueda leer o escribir el bucket.
DROP POLICY IF EXISTS "service_role lee operativo" ON storage.objects;
CREATE POLICY "service_role lee operativo" ON storage.objects
  FOR SELECT TO service_role USING (bucket_id = 'operativo');

DROP POLICY IF EXISTS "service_role sube operativo" ON storage.objects;
CREATE POLICY "service_role sube operativo" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'operativo');

DROP POLICY IF EXISTS "service_role borra operativo" ON storage.objects;
CREATE POLICY "service_role borra operativo" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'operativo');

-- ── 4. Vista de vencimientos ────────────────────────────────────────────────
-- Una fila por vehículo activo (estado = 1, misma regla que Mantenimiento) y
-- tipo de documento activo. `fecha_vigente` es la más reciente entre la de
-- GEMA y la del último documento cargado (GREATEST ignora los NULL); si no
-- hay ninguna, queda NULL y la app lo trata como "sin dato", lo más grave.
-- La columna de GEMA se resuelve por nombre desde el catálogo (`to_jsonb(v)
-- ->> columna_gema`), así agregar un documento nuevo es un INSERT en el
-- catálogo y no una edición de la vista. El CHECK del catálogo evita que un
-- nombre mal escrito devuelva NULL en silencio.
-- `dias_restantes` usa CURRENT_DATE (UTC) y es solo de apoyo para consultas
-- manuales: la app cuenta los días con la fecha de Bogotá.
CREATE OR REPLACE VIEW vw_operativo_vencimientos AS
SELECT
  v.codigo,
  v.placa,
  v.marca,
  v.clase,
  v.ruta,
  v.conductor_nombre,
  v.cedula_conductor,
  t.key AS tipo,
  t.nombre AS tipo_nombre,
  t.orden AS tipo_orden,
  t.dias_proximo,
  t.dias_critico,
  (to_jsonb(v) ->> t.columna_gema)::date AS fecha_gema,
  d.id AS documento_id,
  d.fecha_vencimiento AS fecha_documento,
  d.numero,
  d.entidad,
  d.archivo_ruta,
  d.archivo_nombre,
  GREATEST((to_jsonb(v) ->> t.columna_gema)::date, d.fecha_vencimiento) AS fecha_vigente,
  GREATEST((to_jsonb(v) ->> t.columna_gema)::date, d.fecha_vencimiento) - CURRENT_DATE AS dias_restantes,
  -- Discrepancia: hay fecha en GEMA y en el documento y no coinciden.
  (
    (to_jsonb(v) ->> t.columna_gema)::date IS NOT NULL
    AND d.fecha_vencimiento IS NOT NULL
    AND (to_jsonb(v) ->> t.columna_gema)::date <> d.fecha_vencimiento
  ) AS discrepancia
FROM vehiculos v
CROSS JOIN operativo_documento_tipos t
LEFT JOIN LATERAL (
  SELECT id, fecha_vencimiento, numero, entidad, archivo_ruta, archivo_nombre
  FROM operativo_vehiculo_documentos od
  WHERE od.codigo_vehiculo = v.codigo
    AND od.tipo = t.key
    AND od.anulado_en IS NULL
  ORDER BY od.fecha_vencimiento DESC, od.created_at DESC
  LIMIT 1
) d ON true
WHERE v.estado = 1
  AND t.activo;

-- ── 5. Seguridad y permisos ──────────────────────────────────────────────────
-- Mismo esquema que el resto de los módulos: RLS sin políticas, solo el
-- servidor (service_role) accede y valida antes los permisos de aplicación.
ALTER TABLE operativo_documento_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE operativo_vehiculo_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operativo_documento_tipos FROM anon, public;
REVOKE ALL ON operativo_vehiculo_documentos FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operativo_documento_tipos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operativo_vehiculo_documentos TO service_role;
GRANT SELECT ON vw_operativo_vencimientos TO service_role;

-- El administrador recibe el módulo; el resto se asigna desde Configuración.
UPDATE user_types
SET modulos = modulos || '["operativo"]'::jsonb
WHERE key = 'admin'
  AND NOT (modulos ? 'operativo');

-- Tipo pensado para el área operativa: gestiona los documentos del vehículo
-- y ve las alertas de vencimiento. No se crea ningún usuario; el
-- administrador asigna el tipo desde Configuración cuando lo necesite.
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema)
VALUES (
  'operativo',
  'Operativo',
  'Documentos del vehículo (SOAT, técnico-mecánica, pólizas, tarjeta de operación) y alertas de vencimiento',
  '["operativo"]'::jsonb,
  'all',
  true,
  false
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE operativo_documento_tipos IS
  'Catálogo de documentos del vehículo con la columna de GEMA que les corresponde y los umbrales de aviso (días).';
COMMENT ON TABLE operativo_vehiculo_documentos IS
  'Documentos cargados por vehículo (número, entidad, vigencia, archivo en Storage). Se anulan con motivo, no se borran.';
COMMENT ON VIEW vw_operativo_vencimientos IS
  'Vehículos activos × tipos de documento: fecha de GEMA, del último documento cargado, la que rige, días restantes y discrepancia.';
