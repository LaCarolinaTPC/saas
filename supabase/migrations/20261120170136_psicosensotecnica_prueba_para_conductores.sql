-- Prueba psicosensotécnica para conductores
--
-- Contexto: las pruebas psicosensotécnicas son obligatorias para contratar
-- conductores y la empresa dejó el software que usaba por costo. Los
-- requerimientos de selección (opción 5, «tamizaje propio en Gestivo») pedían
-- una batería propia: tiempo de reacción, atención sostenida, anticipación de
-- velocidad y un cuestionario de conducción riesgosa (más uno de personalidad
-- de dominio público, el IPIP, en lugar del 16PF, que es de licencia), que la
-- persona presenta en el navegador identificándose con su cédula. El sistema solo tamiza: guarda
-- los puntajes y una sugerencia, y el concepto apto / no apto lo da la
-- psicóloga (Ley 1090 de 2006).
--
-- Aquí queda:
--   * la configuración (una fila): si acepta solo candidatos o es libre, si
--     exige un equipo de la empresa, cuántos intentos y los umbrales de alerta;
--   * los intentos, que también son la asignación: una fila «asignado» es una
--     prueba que se le pidió a alguien y todavía no presenta;
--   * el resultado de cada prueba del intento, con los ensayos crudos;
--   * los equipos de la empresa vinculados con un código;
--   * el rol «Psicóloga», que solo abre este módulo.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

-- ── 1. Configuración ───────────────────────────────────────────────────────
-- Una sola fila. Lo que falte en `valor` lo completa la aplicación con sus
-- valores por defecto (src/lib/psicosensotecnica/config.ts).
CREATE TABLE IF NOT EXISTS psico_config (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  valor            JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_email TEXT
);
INSERT INTO psico_config (id, valor) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- ── 2. Equipos vinculados ──────────────────────────────────────────────────
-- Tabletas o computadores de la empresa. Se vinculan tecleando en el equipo un
-- código de un solo uso; en la base solo queda el SHA-256 de su clave.
CREATE TABLE IF NOT EXISTS psico_equipos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           TEXT NOT NULL,
  codigo           TEXT,
  codigo_expira_at TIMESTAMPTZ,
  key_hash         TEXT,
  vinculado_at     TIMESTAMPTZ,
  last_seen_at     TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by_email TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_psico_equipos_codigo ON psico_equipos (codigo) WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_psico_equipos_key ON psico_equipos (key_hash) WHERE key_hash IS NOT NULL;

-- ── 3. Intentos (y asignaciones) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS psico_intentos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula                TEXT NOT NULL CHECK (cedula ~ '^[0-9]{5,11}$'),
  nombre                TEXT,
  celular               TEXT,
  candidate_id          UUID REFERENCES candidates(id) ON DELETE SET NULL,
  proceso_id            UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  -- candidato: tenía asignación, proceso de selección o ficha de candidato.
  origen                TEXT NOT NULL DEFAULT 'libre' CHECK (origen IN ('candidato', 'libre')),
  estado                TEXT NOT NULL DEFAULT 'en_curso'
                        CHECK (estado IN ('asignado', 'en_curso', 'terminado', 'abandonado', 'anulado')),
  asignado_por_email    TEXT,
  asignado_en           TIMESTAMPTZ,
  -- SHA-256 de la clave de la sesión de la prueba; se borra al terminar.
  token_hash            TEXT,
  equipo_id             UUID REFERENCES psico_equipos(id) ON DELETE SET NULL,
  ip                    TEXT,
  agente_usuario        TEXT,
  tipo_entrada          TEXT CHECK (tipo_entrada IN ('tactil', 'raton')),
  version_bateria       TEXT,
  autorizacion_datos_en TIMESTAMPTZ,
  iniciado_en           TIMESTAMPTZ,
  terminado_en          TIMESTAMPTZ,
  puntaje_global        NUMERIC(5, 1),
  sugerencia            TEXT CHECK (sugerencia IN ('sin_alertas', 'revisar')),
  alertas               JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Lo decide una persona con el permiso `psicosensotecnica.concepto`.
  concepto              TEXT CHECK (concepto IN ('apto', 'no_apto')),
  concepto_observacion  TEXT,
  concepto_por_email    TEXT,
  concepto_en           TIMESTAMPTZ,
  anulado_en            TIMESTAMPTZ,
  anulado_por_email     TEXT,
  motivo_anulacion      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_psico_intentos_cedula ON psico_intentos (cedula, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_psico_intentos_candidato ON psico_intentos (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_psico_intentos_estado ON psico_intentos (estado, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_psico_intentos_token ON psico_intentos (token_hash) WHERE token_hash IS NOT NULL;
-- Una sola prueba pendiente (asignada o a medias) por cédula.
CREATE UNIQUE INDEX IF NOT EXISTS uq_psico_intentos_pendiente ON psico_intentos (cedula)
  WHERE estado IN ('asignado', 'en_curso');

-- ── 4. Resultado de cada prueba del intento ────────────────────────────────
CREATE TABLE IF NOT EXISTS psico_intento_pruebas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intento_id UUID NOT NULL REFERENCES psico_intentos(id) ON DELETE CASCADE,
  prueba     TEXT NOT NULL CHECK (prueba IN ('reaccion', 'atencion', 'anticipacion', 'cuestionario', 'personalidad')),
  -- Ensayos crudos tal como los envió el navegador; las métricas las calcula el servidor.
  datos      JSONB NOT NULL,
  metricas   JSONB NOT NULL DEFAULT '{}'::jsonb,
  puntaje    NUMERIC(5, 1),
  alertas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intento_id, prueba)
);
-- Para quien aplicó la primera versión de este script (sin «personalidad», el
-- cuestionario de cinco rasgos del IPIP): se rehace la lista permitida.
ALTER TABLE psico_intento_pruebas DROP CONSTRAINT IF EXISTS psico_intento_pruebas_prueba_check;
ALTER TABLE psico_intento_pruebas ADD CONSTRAINT psico_intento_pruebas_prueba_check
  CHECK (prueba IN ('reaccion', 'atencion', 'anticipacion', 'cuestionario', 'personalidad'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['psico_config', 'psico_equipos', 'psico_intentos', 'psico_intento_pruebas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated, public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO service_role;

COMMENT ON TABLE psico_config IS 'Prueba psicosensotécnica: configuración (una fila).';
COMMENT ON TABLE psico_equipos IS 'Prueba psicosensotécnica: equipos de la empresa vinculados con un código.';
COMMENT ON TABLE psico_intentos IS 'Prueba psicosensotécnica: asignaciones e intentos por cédula, con la sugerencia del sistema y el concepto de la psicóloga.';
COMMENT ON TABLE psico_intento_pruebas IS 'Prueba psicosensotécnica: ensayos crudos, métricas y alertas de cada prueba de un intento. Datos sensibles: solo en la pantalla.';

-- ── 5. Rol de la psicóloga ─────────────────────────────────────────────────
INSERT INTO roles (clave, nombre, descripcion, es_super, es_sistema, activo)
VALUES ('psicologa', 'Psicóloga',
        'Revisa las pruebas psicosensotécnicas, da el concepto apto / no apto y asigna pruebas. Solo ve su módulo.',
        false, false, true)
ON CONFLICT (clave) DO NOTHING;
INSERT INTO rol_permisos (rol, permiso) VALUES
  ('psicologa', 'psicosensotecnica.ver'),
  ('psicologa', 'psicosensotecnica.editar'),
  ('psicologa', 'psicosensotecnica.concepto'),
  ('psicologa', 'psicosensotecnica.exportar')
ON CONFLICT (rol, permiso) DO NOTHING;

SELECT to_regclass('public.psico_config') AS config,
       to_regclass('public.psico_equipos') AS equipos,
       to_regclass('public.psico_intentos') AS intentos,
       to_regclass('public.psico_intento_pruebas') AS pruebas;
