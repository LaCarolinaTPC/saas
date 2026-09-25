-- soportes de descuentos de afiliados
--
-- Contexto: Tesorería necesita respaldar ante cada afiliado los descuentos
-- de su liquidación (pago de obligaciones, combustible, póliza…): sube la
-- factura o el comprobante por buseta y fecha, y el afiliado lo ve y lo
-- descarga en el portal (/portal-afiliados). Decisión del 2026-09-25: solo
-- Tesorería sube; el afiliado solo consulta y descarga.
--
-- Cada soporte queda ligado a propietario + vehículo + fecha. La aplicación
-- solo lo acepta si ese día GEMA liquidó el vehículo a nombre de ese
-- afiliado (ingreso_tercero): así un afiliado nunca ve soportes de un bus en
-- días en que no era suyo. Nada se borra: se anula con motivo.
--
-- Tabla y bucket privados: solo service_role. Se revoca todo a anon y
-- authenticated, como en las tablas del portal (migración 20260925203623).
-- Instancia autoalojada: se aplica a mano en el SQL Editor. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS afiliado_soportes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula_propietario  TEXT NOT NULL,
  codigo_vehiculo     TEXT NOT NULL,
  fecha               DATE NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('obligaciones', 'combustible', 'poliza', 'anticipo', 'facturas', 'otro')),
  concepto            TEXT NOT NULL CHECK (length(trim(concepto)) BETWEEN 3 AND 200),
  -- Opcional: con valor, el soporte cuenta para el cruce contra el descuento de GEMA.
  valor               NUMERIC(14,2) CHECK (valor IS NULL OR valor >= 0),
  archivo_ruta        TEXT NOT NULL UNIQUE,
  archivo_nombre      TEXT NOT NULL,
  archivo_mime        TEXT NOT NULL,
  archivo_tamano      INTEGER NOT NULL,
  subido_por_email    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_at          TIMESTAMPTZ,
  anulado_por_email   TEXT,
  motivo_anulacion    TEXT
);

CREATE INDEX IF NOT EXISTS afiliado_soportes_cedula_fecha_idx
  ON afiliado_soportes (cedula_propietario, fecha) WHERE anulado_at IS NULL;
CREATE INDEX IF NOT EXISTS afiliado_soportes_vehiculo_fecha_idx
  ON afiliado_soportes (codigo_vehiculo, fecha);

COMMENT ON TABLE afiliado_soportes IS
  'Soportes (PDF o imagen) de los descuentos de la liquidación de un afiliado, por vehículo y fecha. Los sube Tesorería; el afiliado los ve en /portal-afiliados.';

ALTER TABLE afiliado_soportes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON afiliado_soportes FROM anon, authenticated, public;
GRANT ALL ON afiliado_soportes TO service_role;

-- Bucket privado: los archivos solo se sirven con URL firmada de corta
-- duración, después de comprobar el permiso en el servidor.
INSERT INTO storage.buckets (id, name, public)
VALUES ('afiliados-soportes', 'afiliados-soportes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_role lee afiliados-soportes" ON storage.objects;
CREATE POLICY "service_role lee afiliados-soportes" ON storage.objects
  FOR SELECT TO service_role USING (bucket_id = 'afiliados-soportes');

DROP POLICY IF EXISTS "service_role sube afiliados-soportes" ON storage.objects;
CREATE POLICY "service_role sube afiliados-soportes" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'afiliados-soportes');

DROP POLICY IF EXISTS "service_role borra afiliados-soportes" ON storage.objects;
CREATE POLICY "service_role borra afiliados-soportes" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'afiliados-soportes');

-- Subir y anular soportes es una sub-función sensible (no se concede por
-- defecto): se le da al tipo Tesorería.
UPDATE user_types
   SET submodulos = jsonb_set(
         submodulos, '{tesoreria}',
         (submodulos -> 'tesoreria') || '["liq_afiliados_soportes"]'::jsonb)
 WHERE key = 'tesoreria'
   AND jsonb_typeof(submodulos -> 'tesoreria') = 'array'
   AND NOT (submodulos -> 'tesoreria') ? 'liq_afiliados_soportes';

COMMIT;

-- Verificación:
-- SELECT count(*) FROM afiliado_soportes;                                   -- 0
-- SELECT id, public FROM storage.buckets WHERE id = 'afiliados-soportes';   -- public = false
-- SELECT submodulos -> 'tesoreria' FROM user_types WHERE key = 'tesoreria'; -- incluye liq_afiliados_soportes
