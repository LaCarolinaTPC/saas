-- tipo de usuario por api key para el mcp y la data api
--
-- Contexto: el MCP y la Data API entregaban todos los recursos de la lista
-- blanca a cualquier credencial. Se pidió (2026-09-30) que el acceso dependa
-- del rol: un usuario conectado por OAuth ve los recursos de los módulos de su
-- tipo de usuario, y una clave sk_live_… los del tipo que se le asigne al
-- crearla (src/lib/external/acceso.ts).
--
-- Las claves existentes quedan como 'admin' para no cortar las integraciones
-- que ya funcionan; un administrador puede bajarles el tipo en
-- Configuración → API. Sin tipo (NULL) la clave autentica pero no ve nada:
-- pasa si se elimina el tipo de usuario que tenía.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.
-- ALTER TABLE conserva los GRANT de api_keys.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_type_fkey'
  ) THEN
    ALTER TABLE api_keys
      ADD CONSTRAINT api_keys_user_type_fkey
      FOREIGN KEY (user_type) REFERENCES user_types (key)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- Solo las claves que existían antes de esta migración: una clave nueva sin
-- tipo es un error de la aplicación, no algo que haya que completar.
UPDATE api_keys SET user_type = 'admin'
 WHERE user_type IS NULL
   AND created_at < '2026-10-01';

COMMENT ON COLUMN api_keys.user_type IS
  'Tipo de usuario (rol) cuyos módulos definen qué recursos ve la clave en el MCP y la Data API. NULL = ninguno.';

-- Verificación: todas las claves activas deben tener tipo.
-- SELECT name, key_prefix, user_type FROM api_keys WHERE is_active ORDER BY created_at;
