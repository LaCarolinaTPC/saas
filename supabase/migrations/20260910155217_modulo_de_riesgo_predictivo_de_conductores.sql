-- modulo de riesgo predictivo de conductores
--
-- Contexto: el análisis predictivo de retiro y de falta no justificada por
-- conductor existía solo como script de línea de comandos. Cada consulta
-- obligaba a regenerar un HTML y un CSV nominal en exports/ y a repartirlos por
-- correo o SharePoint: el CSV lleva, junto al nombre y la cédula, la
-- antigüedad, la edad, el número de hijos, los días de incapacidad, las citas
-- EPS, el ingreso promedio y una puntuación de riesgo de retiro de 191
-- personas. Estas dos tablas mueven la consulta dentro de Gestivo, detrás del
-- permiso del módulo y con rastro en la auditoría.
--
-- Además, hasta ahora ninguna corrida dejaba huella: los modelos se entrenaban
-- desde cero cada vez y ni los coeficientes ni los puntajes se guardaban. No
-- había forma de volver a un corte anterior ni de comprobar, con el tiempo, si
-- el modelo acertó. Se conservan todas las corridas, no solo la última.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── 1. Corridas ──────────────────────────────────────────────────────────────
-- Una fila por ejecución del análisis. `modelos` guarda, por cada uno de los
-- dos resultados, sus métricas de validación temporal y los pesos
-- estandarizados; `descriptivos` las tablas de tasas por tramo. Todo en JSONB
-- porque son cifras para mostrar, no para consultar por columna.

CREATE TABLE IF NOT EXISTS riesgo_corridas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fecha a la que se puntúa. No es única: se puede recalcular el mismo corte.
  corte DATE NOT NULL,
  ejecutada_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ejecutada_por_email TEXT,
  origen TEXT NOT NULL DEFAULT 'cron' CHECK (origen IN ('cron', 'manual')),
  estado TEXT NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok', 'error')),
  error TEXT,
  -- Filas conductor-mes del panel con que se entrenó.
  observaciones INTEGER,
  conductores_puntuados INTEGER,
  -- Meses del panel, del más viejo al más reciente.
  cortes JSONB NOT NULL DEFAULT '[]'::jsonb,
  modelos JSONB NOT NULL DEFAULT '{}'::jsonb,
  descriptivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  retiros_mes JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Filas leídas de cada fuente, para explicar una corrida rara.
  conteos JSONB NOT NULL DEFAULT '{}'::jsonb,
  duracion_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La pantalla siempre pide la última corrida buena.
CREATE INDEX IF NOT EXISTS idx_riesgo_corridas_ultima
  ON riesgo_corridas (estado, ejecutada_at DESC);

-- ── 2. Puntaje por conductor ─────────────────────────────────────────────────
-- Los nombres y las variables se guardan por conductor aunque la primera
-- pantalla solo muestre agregados: es lo que permitirá añadir el ranking y la
-- ficha individual sin volver a calcular nada.

CREATE TABLE IF NOT EXISTS riesgo_conductores (
  corrida_id UUID NOT NULL REFERENCES riesgo_corridas (id) ON DELETE CASCADE,
  cedula TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT NOT NULL,
  tipo_conductor TEXT,
  prob_retiro NUMERIC(6,5) NOT NULL,
  nivel_retiro TEXT NOT NULL CHECK (nivel_retiro IN ('Alto', 'Medio', 'Bajo')),
  factores_retiro JSONB NOT NULL DEFAULT '[]'::jsonb,
  prob_novedad NUMERIC(6,5) NOT NULL,
  nivel_novedad TEXT NOT NULL CHECK (nivel_novedad IN ('Alto', 'Medio', 'Bajo')),
  factores_novedad JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Las 24 variables explicativas al corte, crudas.
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (corrida_id, cedula)
);

CREATE INDEX IF NOT EXISTS idx_riesgo_conductores_retiro
  ON riesgo_conductores (corrida_id, prob_retiro DESC);
CREATE INDEX IF NOT EXISTS idx_riesgo_conductores_cedula
  ON riesgo_conductores (cedula);

-- ── 3. Accesos ───────────────────────────────────────────────────────────────
-- RLS habilitada y sin políticas: solo el service role entra, como en
-- ausentismo_registros. A diferencia de otras tablas de resultados
-- (pv_deltas), aquí NO se concede SELECT a `authenticated`: son datos
-- personales y un usuario con sesión podría leerlos por PostgREST saltándose
-- el permiso del módulo. Todo pasa por el servidor.

ALTER TABLE riesgo_corridas ENABLE ROW LEVEL SECURITY;
ALTER TABLE riesgo_conductores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON riesgo_corridas FROM anon, authenticated, public;
REVOKE ALL ON riesgo_conductores FROM anon, authenticated, public;
GRANT ALL ON riesgo_corridas TO service_role;
GRANT ALL ON riesgo_conductores TO service_role;

-- ── 4. El módulo ─────────────────────────────────────────────────────────────
-- Administración y RRHH lo reciben de entrada. Las subgerencias y Psicología,
-- que hoy reciben el informe por correo, se habilitan desde
-- Configuración → Usuarios asignándoles el módulo: no hace falta tocar código
-- ni volver a correr esta migración.

UPDATE user_types
  SET modulos = modulos || '["riesgo"]'::jsonb
  WHERE key IN ('admin', 'rrhh') AND NOT (modulos ? 'riesgo');

COMMENT ON TABLE riesgo_corridas IS
  'Una fila por corrida del análisis predictivo de conductores: corte, métricas de los dos modelos, pesos y tasas por tramo. Se conservan todas para poder volver a un corte y medir después si el modelo acertó.';
COMMENT ON TABLE riesgo_conductores IS
  'Puntaje de retiro (60 días) y de falta no justificada (30 días) por conductor en cada corrida, con sus factores dominantes y las 24 variables del corte. Datos personales: solo service_role.';

-- ── 5. Comprobación (debe devolver las dos tablas y los tipos con el módulo) ─
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('riesgo_corridas', 'riesgo_conductores');

SELECT key, modulos ? 'riesgo' AS tiene_riesgo FROM user_types ORDER BY key;
