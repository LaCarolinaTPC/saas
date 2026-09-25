-- portal de afiliados secreto de sesion en la base
--
-- Contexto: el portal de afiliados firma su sesión con un secreto. Estaba
-- previsto en la variable AFILIADOS_SESSION_SECRET de Vercel, pero quien
-- administra el despliegue no tiene cómo crearla (2026-09-25). Se guarda en
-- una tabla propia, de una sola fila, que la base genera al vuelo: nadie
-- tiene que escribirlo ni copiarlo. Si algún día se crea la variable, la
-- aplicación la prefiere (src/lib/portal-afiliados/servidor.ts).
--
-- No va en app_settings a propósito: esta tabla revoca todo a anon y
-- authenticated, así que ni un empleado con sesión puede leerla (con el
-- secreto se podría fabricar la sesión de cualquier afiliado).
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, de una sola vez.
-- Idempotente: si ya hay secreto no lo cambia (cambiarlo cierra todas las
-- sesiones abiertas del portal).

BEGIN;

CREATE TABLE IF NOT EXISTS afiliado_portal_config (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secreto_sesion  TEXT NOT NULL CHECK (length(secreto_sesion) >= 32),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 64 caracteres hexadecimales a partir de dos UUID aleatorios (244 bits de azar).
INSERT INTO afiliado_portal_config (id, secreto_sesion)
VALUES (1, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE afiliado_portal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON afiliado_portal_config FROM anon, authenticated, public;
GRANT SELECT ON afiliado_portal_config TO service_role;

COMMIT;

-- Verificación (no muestra el secreto): debe devolver 1 fila con largo 64.
-- SELECT id, length(secreto_sesion) AS largo, created_at FROM afiliado_portal_config;
