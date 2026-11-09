-- sst examenes sincronizacion con gema y novedades
--
-- Contexto. El control de exámenes periódicos (sst_examenes_personas) se
-- llenaba a mano: quien ingresaba a La Carolina no entraba al control hasta
-- que SST lo agregaba, y quien se retiraba seguía contando como vencido. SST
-- pidió que los ingresos y retiros de GMAS/GEMA se reflejen solos y que quede
-- constancia de cada novedad.
--
-- Qué hace:
--   1. sst_examenes_personas.origen admite 'gema' (personas que entraron solas
--      con la sincronización nocturna).
--   2. sst_examenes_novedades: una fila por ingreso, retiro o reingreso que la
--      sincronización aplicó al control, con la periodicidad asignada según el
--      profesiograma (src/lib/sst/profesiograma.ts).
--
-- Aplicar esta migración ENCIENDE la sincronización: el cron de GEMA la corre
-- solo si la tabla de novedades existe. Antes, revisar el ensayo
-- (npm run sst:examenes-sincronizar -- --ensayo) con SST.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

-- ── 1. Origen 'gema' ───────────────────────────────────────────────────────
ALTER TABLE sst_examenes_personas DROP CONSTRAINT IF EXISTS sst_examenes_personas_origen_check;
ALTER TABLE sst_examenes_personas DROP CONSTRAINT IF EXISTS sst_examenes_personas_origen_chk;
ALTER TABLE sst_examenes_personas
  ADD CONSTRAINT sst_examenes_personas_origen_chk CHECK (origen IN ('gestivo', 'historico', 'gema'));

-- ── 2. Novedades de la sincronización ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sst_examenes_novedades (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cedula            TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  grupo             TEXT NOT NULL,
  cargo             TEXT,
  tipo              TEXT NOT NULL CHECK (tipo IN ('ingreso', 'retiro', 'reingreso')),
  -- Fecha de ingreso (ingreso, reingreso) o de retiro (retiro) según GEMA.
  fecha             DATE,
  -- Periodicidad asignada (ingreso, reingreso).
  periodicidad_meses INTEGER,
  -- El cargo no está en el profesiograma: se asignó la periodicidad por defecto.
  sin_profesiograma BOOLEAN NOT NULL DEFAULT false,
  detectado_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  origen            TEXT NOT NULL DEFAULT 'cron' CHECK (origen IN ('cron', 'manual')),
  usuario_email     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sst_examenes_novedades_detectado ON sst_examenes_novedades (detectado_at DESC);
CREATE INDEX IF NOT EXISTS idx_sst_examenes_novedades_cedula ON sst_examenes_novedades (cedula);

ALTER TABLE sst_examenes_novedades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sst_examenes_novedades FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sst_examenes_novedades TO service_role;

COMMENT ON TABLE sst_examenes_novedades IS
  'Ingresos, retiros y reingresos que la sincronización con GEMA aplicó al control de exámenes periódicos (sst_examenes_personas).';
