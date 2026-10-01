-- Tesorería · Revisión cartulina: consolidado de la revisión de timbradas.
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Contexto: el check por viaje (tesoreria_revision_timbradas) dice qué se
-- revisó, pero no cuántos viajes había por revisar cada día: ese número sale
-- de recalcular las cuatro fuentes de GEMA, y hacerlo para un mes entero tarda
-- cerca de un minuto. Para que el consolidado responda al instante se guarda
-- una foto del cálculo por día, y el cierre formal del día queda aparte como
-- evidencia.
--
--   1. `tesoreria_revision_timbradas_dias`: una fila por día con los conteos y
--      la lista de viajes por revisar (numero, estado, placa, vuelta). Se
--      reescribe cada vez que se calcula el día (al abrir la revisión y con el
--      cron diario de los últimos 10 días), porque GEMA sigue corrigiendo.
--   2. `tesoreria_revision_timbradas_cierres`: "Cerrar día" con quién, cuándo
--      y los viajes revisados en ese momento. Nunca se borra: si el día se
--      reabre (pendientes nuevos tras el cierre) y se vuelve a cerrar, queda
--      un cierre nuevo y el anterior se conserva como historial.
--
-- Las tablas nuevas no heredan privilegios en esta instancia: los GRANT a
-- service_role van aquí mismo.

-- ── 1. Foto diaria del cálculo ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tesoreria_revision_timbradas_dias (
  fecha_viaje DATE PRIMARY KEY,
  total_viajes INTEGER NOT NULL CHECK (total_viajes >= 0),
  por_revisar INTEGER NOT NULL CHECK (por_revisar >= 0),
  alertas INTEGER NOT NULL DEFAULT 0 CHECK (alertas >= 0),
  -- {"OK": 318, "Diferencia Por Revisar": 32, ...}
  conteo_estados JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{"n": 1842953, "e": "Diferencia Por Revisar", "p": "LJO699", "v": 1}, ...]
  viajes_por_revisar JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tesoreria_revision_timbradas_dias IS
  'Foto diaria del cálculo de la revisión de timbradas: conteos y viajes por revisar. La reescribe la pantalla y el cron; base del consolidado.';

-- ── 2. Cierres del día ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tesoreria_revision_timbradas_cierres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_viaje DATE NOT NULL,
  por_revisar INTEGER NOT NULL CHECK (por_revisar >= 0),
  revisados INTEGER NOT NULL CHECK (revisados >= 0),
  -- Viajes por revisar en el momento del cierre (todos con check).
  numeros JSONB NOT NULL DEFAULT '[]'::jsonb,
  cerrado_por UUID REFERENCES auth.users(id),
  cerrado_por_email TEXT,
  cerrado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tesoreria_revision_timbradas_cierres_fecha
  ON tesoreria_revision_timbradas_cierres (fecha_viaje, cerrado_at DESC);

COMMENT ON TABLE tesoreria_revision_timbradas_cierres IS
  'Cierre formal del día de revisión de timbradas (100 % revisado). Historial: no se borra; el último cierre del día es el vigente.';

ALTER TABLE tesoreria_revision_timbradas_dias ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesoreria_revision_timbradas_cierres ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_revision_timbradas_dias TO service_role;
GRANT SELECT, INSERT ON TABLE tesoreria_revision_timbradas_cierres TO service_role;

-- Comprobación: dos filas, RLS activo, service_role lee y escribe.
SELECT c.relname AS tabla,
       c.relrowsecurity AS rls,
       has_table_privilege('service_role', c.oid, 'SELECT') AS puede_leer,
       has_table_privilege('service_role', c.oid, 'INSERT') AS puede_insertar
FROM pg_class c
WHERE c.relname IN ('tesoreria_revision_timbradas_dias', 'tesoreria_revision_timbradas_cierres')
ORDER BY c.relname;
