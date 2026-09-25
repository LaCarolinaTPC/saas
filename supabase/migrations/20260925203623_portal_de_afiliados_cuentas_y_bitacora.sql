-- portal de afiliados cuentas y bitacora
--
-- Contexto: los afiliados (propietarios de buses) van a consultar su propia
-- liquidación. No entran con el login de los empleados a propósito: una
-- sesión de Supabase Auth entrega un token del rol `authenticated`, y con él
-- se consulta la API REST directamente desde el navegador. Varias tablas de
-- datos operan sin RLS (migraciones 013 y 022: employees, ingreso_tercero,
-- propietarios, candidatos…), así que ese token le abriría a un tercero la
-- información de toda la empresa. Decisión del 2026-09-25: portal aparte en
-- /portal-afiliados, con cuentas propias y una sesión firmada por el
-- servidor; el navegador del afiliado nunca recibe un token de Supabase.
--
-- Las dos tablas solo las toca la aplicación con service_role. Se revoca todo
-- a anon y authenticated: ni un empleado con sesión puede leer las claves.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, de una sola vez,
-- y es idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS afiliado_cuentas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Propietario de GEMA (propietarios.cedula). Sin FK: la sincronización de
  -- GEMA reescribe propietarios y no debe fallar por una cuenta.
  cedula_propietario  TEXT NOT NULL,
  email               TEXT NOT NULL,
  nombre              TEXT,
  -- scrypt$N$r$p$sal$hash (src/lib/portal-afiliados/clave.ts). Nunca la clave.
  clave_hash          TEXT NOT NULL,
  -- La clave la asigna Tesorería: se cambia en el primer ingreso.
  debe_cambiar_clave  BOOLEAN NOT NULL DEFAULT true,
  activo              BOOLEAN NOT NULL DEFAULT true,
  intentos_fallidos   INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta     TIMESTAMPTZ,
  -- Sube al restablecer la clave o desactivar: invalida las sesiones abiertas.
  sesion_version      INTEGER NOT NULL DEFAULT 1,
  ultimo_ingreso_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_por_email   TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT afiliado_cuentas_email_minusculas CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS afiliado_cuentas_email_uk ON afiliado_cuentas (email);
CREATE INDEX IF NOT EXISTS afiliado_cuentas_cedula_idx ON afiliado_cuentas (cedula_propietario);

COMMENT ON TABLE afiliado_cuentas IS
  'Cuentas del portal de afiliados (/portal-afiliados). Separadas de Supabase Auth a propósito: el afiliado nunca recibe un token del rol authenticated.';

-- Bitácora del portal: ingresos, intentos fallidos, cambios de clave,
-- consultas y descargas, y lo que Tesorería hace con las cuentas.
CREATE TABLE IF NOT EXISTS afiliado_accesos (
  id           BIGSERIAL PRIMARY KEY,
  cuenta_id    UUID REFERENCES afiliado_cuentas(id) ON DELETE SET NULL,
  email        TEXT,
  evento       TEXT NOT NULL,
  detalle      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip           TEXT,
  equipo       TEXT,
  actor_email  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS afiliado_accesos_cuenta_idx ON afiliado_accesos (cuenta_id, created_at DESC);

ALTER TABLE afiliado_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE afiliado_accesos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON afiliado_cuentas, afiliado_accesos FROM anon, authenticated, public;
REVOKE ALL ON SEQUENCE afiliado_accesos_id_seq FROM anon, authenticated, public;
GRANT ALL ON afiliado_cuentas, afiliado_accesos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE afiliado_accesos_id_seq TO service_role;

-- Gestionar cuentas del portal es una sub-función sensible (no se concede
-- por defecto: src/lib/permissions-shared.ts). Se le da al tipo Tesorería.
UPDATE user_types
   SET submodulos = jsonb_set(
         submodulos, '{tesoreria}',
         (submodulos -> 'tesoreria') || '["liq_afiliados_cuentas"]'::jsonb)
 WHERE key = 'tesoreria'
   AND jsonb_typeof(submodulos -> 'tesoreria') = 'array'
   AND NOT (submodulos -> 'tesoreria') ? 'liq_afiliados_cuentas';

COMMIT;

-- Verificación:
-- SELECT count(*) FROM afiliado_cuentas;                       -- 0
-- SELECT has_table_privilege('authenticated', 'afiliado_cuentas', 'SELECT');  -- false
-- SELECT submodulos -> 'tesoreria' FROM user_types WHERE key = 'tesoreria';  -- incluye liq_afiliados_cuentas
