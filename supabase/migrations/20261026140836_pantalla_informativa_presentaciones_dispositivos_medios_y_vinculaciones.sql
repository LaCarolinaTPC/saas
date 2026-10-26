-- pantalla informativa presentaciones dispositivos medios y vinculaciones
--
-- Contexto: Recursos Humanos quiere un televisor en la empresa que muestre
-- accidentabilidad, ausentismo, marcaciones del día y cumpleaños/aniversarios,
-- con diapositivas que diseñan ellos mismos (textos, imágenes, videos, formas
-- y «widgets» de datos vivos). El TV abre /display sin usuario: se vincula una
-- vez con un código de 6 dígitos que RRHH teclea en Gestivo, y desde entonces
-- se identifica con una clave larga guardada en su navegador.
--
-- pantalla_presentaciones: cada presentación con su BORRADOR (lo que se edita)
--   y su versión PUBLICADA (lo que ven los TV). `version` sube en cada
--   publicación para que el TV detecte el cambio sin comparar el JSON.
-- pantalla_medios: biblioteca propia de imágenes y videos (bucket privado
--   `pantalla`). El navegador sube directo a Storage con URL firmada porque
--   Vercel corta el cuerpo de una petición en 4,5 MB. Las fotos de
--   accidentabilidad se referencian por su ruta en `accidentes`, no se copian.
-- pantalla_dispositivos: un registro por televisor. Como en api_keys solo se
--   guarda el SHA-256 de la clave. No se reutiliza api_keys porque esa tabla da
--   acceso a datos por rol; esta solo identifica un TV y qué presentación le toca.
-- pantalla_vinculaciones: códigos de 6 dígitos de vida corta (10 minutos). La
--   clave se genera en el momento en que el TV la recoge, así que nunca queda
--   en claro en la base.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.
--
-- FUERA DE ESTE SQL: para subir videos de hasta 150 MB, el límite global del
-- storage autoalojado (variable FILE_SIZE_LIMIT del contenedor storage-api,
-- 50 MiB por defecto) y el tamaño máximo de cuerpo del proxy (Kong / nginx
-- client_max_body_size) deben ser al menos 150 MB. Si no, la subida falla con
-- 413 aunque el bucket lo permita.

-- ── 1. Presentaciones ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pantalla_presentaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  -- Modelo validado por src/lib/pantalla/modelo.ts (version 1).
  borrador         jsonb NOT NULL DEFAULT '{"version":1,"diapositivas":[]}'::jsonb,
  publicada        jsonb,
  publicada_at     timestamptz,
  version          integer NOT NULL DEFAULT 0,
  created_by       uuid,
  created_by_email text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pantalla_presentaciones_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  CONSTRAINT pantalla_presentaciones_version CHECK (version >= 0)
);

COMMENT ON TABLE pantalla_presentaciones IS
  'Presentaciones de la pantalla informativa (TV). borrador = lo que se edita; publicada = lo que ven los televisores; version sube al publicar.';

-- ── 2. Biblioteca de medios ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pantalla_medios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             text NOT NULL,
  nombre           text NOT NULL,
  -- Ruta dentro del bucket privado `pantalla`: biblioteca/<uuid>.<ext>
  path             text NOT NULL UNIQUE,
  -- Primer fotograma del video (biblioteca/<uuid>.poster.jpg); null en imágenes.
  poster_path      text,
  mime             text NOT NULL,
  bytes            bigint NOT NULL,
  ancho            integer,
  alto             integer,
  -- Solo videos: la mide el navegador al subir.
  duracion_seg     numeric(8,2),
  created_by       uuid,
  created_by_email text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pantalla_medios_tipo CHECK (tipo IN ('imagen', 'video')),
  CONSTRAINT pantalla_medios_mime CHECK (
    (tipo = 'imagen' AND mime IN ('image/jpeg', 'image/png', 'image/webp')) OR
    (tipo = 'video'  AND mime IN ('video/mp4', 'video/webm'))
  ),
  CONSTRAINT pantalla_medios_bytes CHECK (
    bytes > 0 AND ((tipo = 'imagen' AND bytes <= 4194304) OR (tipo = 'video' AND bytes <= 157286400))
  ),
  CONSTRAINT pantalla_medios_duracion CHECK (duracion_seg IS NULL OR duracion_seg >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pantalla_medios_creado ON pantalla_medios (created_at DESC);

COMMENT ON TABLE pantalla_medios IS
  'Biblioteca de imágenes y videos de la pantalla informativa (bucket privado pantalla). Se sirven con URL firmada desde el servidor.';

-- ── 3. Televisores ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pantalla_dispositivos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  -- La clave se genera cuando el TV la recoge (ver pantalla_vinculaciones):
  -- hasta entonces ambas columnas son NULL y el dispositivo no autentica.
  -- Solo se guarda el SHA-256; la clave completa la conoce únicamente el TV.
  key_prefix       text,
  key_hash         text UNIQUE,
  presentacion_id  uuid REFERENCES pantalla_presentaciones(id) ON DELETE SET NULL,
  is_active        boolean NOT NULL DEFAULT true,
  vinculado_at     timestamptz,
  last_seen_at     timestamptz,
  created_by       uuid,
  created_by_email text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  CONSTRAINT pantalla_dispositivos_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  CONSTRAINT pantalla_dispositivos_clave_completa CHECK ((key_hash IS NULL) = (key_prefix IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_pantalla_dispositivos_presentacion ON pantalla_dispositivos (presentacion_id);

COMMENT ON TABLE pantalla_dispositivos IS
  'Televisores de la pantalla informativa. Se vinculan con un código de 6 dígitos que muestra el TV; la clave larga se genera al recogerla y solo queda su hash. Se revocan desde Gestivo; un TV revocado vuelve a pedir vinculación.';

-- ── 4. Vinculación por código ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pantalla_vinculaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text NOT NULL,
  -- SHA-256 del secreto que solo conoce el navegador del TV mientras espera.
  token_tv_hash    text NOT NULL UNIQUE,
  dispositivo_id   uuid REFERENCES pantalla_dispositivos(id) ON DELETE SET NULL,
  estado           text NOT NULL DEFAULT 'pendiente',
  expira_at        timestamptz NOT NULL,
  ip               text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pantalla_vinculaciones_codigo CHECK (codigo ~ '^[0-9]{6}$'),
  CONSTRAINT pantalla_vinculaciones_estado CHECK (estado IN ('pendiente', 'completada')),
  CONSTRAINT pantalla_vinculaciones_completa CHECK (estado = 'pendiente' OR dispositivo_id IS NOT NULL)
);

-- Dos TV no pueden mostrar el mismo código vigente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pantalla_vinculaciones_codigo_pendiente
  ON pantalla_vinculaciones (codigo) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_pantalla_vinculaciones_expira ON pantalla_vinculaciones (expira_at);

COMMENT ON TABLE pantalla_vinculaciones IS
  'Códigos de vinculación de televisores (6 dígitos, 10 minutos). pendiente = esperando que RRHH lo teclee; completada = esperando que el TV recoja su clave. Se borran al entregar la clave o al vencer.';

-- ── 5. Privilegios ──────────────────────────────────────────────────────────
-- Solo el servidor (service_role) lee y escribe: RLS sin políticas.

ALTER TABLE pantalla_presentaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantalla_medios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantalla_dispositivos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantalla_vinculaciones  ENABLE ROW LEVEL SECURITY;
GRANT ALL ON pantalla_presentaciones TO service_role;
GRANT ALL ON pantalla_medios         TO service_role;
GRANT ALL ON pantalla_dispositivos   TO service_role;
GRANT ALL ON pantalla_vinculaciones  TO service_role;

-- ── 6. Bucket ───────────────────────────────────────────────────────────────
-- Privado, con límite de 150 MB y solo los tipos que la app reproduce.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pantalla', 'pantalla', false, 157286400,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- service_role ignora RLS, pero las políticas quedan explícitas para que
-- ningún otro rol pueda leer o escribir el bucket.
DROP POLICY IF EXISTS "service_role lee pantalla" ON storage.objects;
CREATE POLICY "service_role lee pantalla" ON storage.objects
  FOR SELECT TO service_role USING (bucket_id = 'pantalla');

DROP POLICY IF EXISTS "service_role sube pantalla" ON storage.objects;
CREATE POLICY "service_role sube pantalla" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'pantalla');

DROP POLICY IF EXISTS "service_role borra pantalla" ON storage.objects;
CREATE POLICY "service_role borra pantalla" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'pantalla');

-- ── 7. Módulo ───────────────────────────────────────────────────────────────
-- Para el administrador. A Recursos Humanos se le concede desde
-- Configuración › Usuarios (aquí no se asume qué rol lo tendrá).

UPDATE user_types
  SET modulos = modulos || '["pantalla"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'pantalla');

-- ── Verificación ────────────────────────────────────────────────────────────

SELECT
  (SELECT count(*) FROM pantalla_presentaciones)                            AS presentaciones,
  (SELECT count(*) FROM pantalla_medios)                                    AS medios,
  (SELECT count(*) FROM pantalla_dispositivos)                              AS dispositivos,
  (SELECT count(*) FROM pantalla_vinculaciones)                             AS vinculaciones,
  (SELECT count(*) FROM storage.buckets WHERE id = 'pantalla')              AS bucket,
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'pantalla')       AS limite_bucket,
  (SELECT modulos ? 'pantalla' FROM user_types WHERE key = 'admin')         AS admin_tiene_modulo;
