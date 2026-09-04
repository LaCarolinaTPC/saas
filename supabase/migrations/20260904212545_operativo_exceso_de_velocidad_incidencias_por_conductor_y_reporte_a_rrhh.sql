-- Operativo · Exceso de velocidad: incidencias por conductor y reporte a RRHH.
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Fuente: `velocidades` (GEMA, eventos GPS con velocidad >= 50 km/h; una fila
-- por vehículo y segundo, sin conductor). El conductor sale del viaje de
-- `viajes_recaudados` que tenía despachado el vehículo a esa hora.
--
-- Qué hace:
--   1. `operativo_velocidad_parametros`: umbral (km/h), mínimo de incidencias
--      por semana para reportar a RRHH y minutos que separan dos incidencias.
--      Una sola fila, editable desde la pantalla.
--   2. `operativo_velocidad_reportes`: marca de "reportado a RRHH" por conductor
--      y semana, con quién y cuándo; se anula con motivo, nunca se borra.
--   3. `get_incidencias_velocidad(desde, hasta, umbral, minutos)`: agrupa los
--      eventos >= umbral del mismo vehículo separados por menos de `minutos`
--      en una incidencia (episodio) y le asigna el conductor del viaje.
--
-- Zona horaria: GEMA entrega la hora local y la sincronización la guardó en
-- `fecha_hora` etiquetada como UTC ("15:04:13+00:00" con hora "15:04:13"), así
-- que `fecha_hora AT TIME ZONE 'UTC'` es la hora local de Barranquilla.
-- Las horas de los viajes son texto "HH:MM:SS" del mismo reloj.
--
-- Las tablas nuevas no heredan privilegios en esta instancia: los GRANT a
-- service_role van aquí mismo.

-- ── 1. Parámetros ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operativo_velocidad_parametros (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Velocidad desde la que un evento cuenta como exceso (>=).
  umbral_kmh NUMERIC(5,1) NOT NULL DEFAULT 60 CHECK (umbral_kmh >= 50 AND umbral_kmh <= 150),
  -- Incidencias en la misma semana desde las que el conductor se reporta a RRHH.
  minimo_incidencias INTEGER NOT NULL DEFAULT 4 CHECK (minimo_incidencias >= 1 AND minimo_incidencias <= 100),
  -- Dos eventos del mismo vehículo separados por menos de estos minutos son la misma incidencia.
  minutos_agrupacion INTEGER NOT NULL DEFAULT 5 CHECK (minutos_agrupacion >= 1 AND minutos_agrupacion <= 120),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO operativo_velocidad_parametros (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE operativo_velocidad_parametros IS
  'Parámetros del informe de exceso de velocidad: umbral km/h, mínimo de incidencias semanales para reportar a RRHH y minutos que separan dos incidencias.';

-- ── 2. Reportes a RRHH ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operativo_velocidad_reportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula TEXT NOT NULL,
  codigo TEXT,
  nombre TEXT NOT NULL,
  -- Semana (lunes a domingo, recortada al mes) que motivó el reporte.
  semana_desde DATE NOT NULL,
  semana_hasta DATE NOT NULL,
  incidencias INTEGER NOT NULL CHECK (incidencias > 0),
  velocidad_max NUMERIC(6,2),
  -- Día en que se entregó el reporte a Recursos Humanos.
  reportado_en DATE NOT NULL,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulada_en TIMESTAMPTZ,
  anulada_por_email TEXT,
  motivo_anulacion TEXT,
  CONSTRAINT operativo_velocidad_reportes_semana_chk CHECK (semana_hasta >= semana_desde)
);

-- Un solo reporte vigente por conductor y semana.
CREATE UNIQUE INDEX IF NOT EXISTS idx_operativo_velocidad_reportes_vigente
  ON operativo_velocidad_reportes (cedula, semana_desde) WHERE anulada_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_operativo_velocidad_reportes_semana
  ON operativo_velocidad_reportes (semana_desde);

COMMENT ON TABLE operativo_velocidad_reportes IS
  'Marca de "reportado a RRHH" por conductor y semana por exceso de velocidad. No se borra: se anula con motivo.';

-- ── 3. Índices de apoyo sobre las tablas de GEMA ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_velocidades_vehiculo_fecha ON velocidades (codigo_vehiculo, fecha);
CREATE INDEX IF NOT EXISTS idx_vrec_vehiculo_fecha ON viajes_recaudados (codigo_vehiculo, fecha_viaje);

-- ── 4. Hora de texto a TIME sin reventar con formatos raros ──────────────────
CREATE OR REPLACE FUNCTION operativo_hora_a_time(h TEXT)
RETURNS TIME
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN h ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN h::time
    ELSE NULL
  END;
$$;

-- ── 5. Incidencias por vehículo con el conductor del viaje ───────────────────
DROP FUNCTION IF EXISTS get_incidencias_velocidad(DATE, DATE, NUMERIC, INTEGER);
CREATE OR REPLACE FUNCTION get_incidencias_velocidad(
  p_desde DATE,
  p_hasta DATE,
  p_umbral NUMERIC DEFAULT 60,
  p_minutos INTEGER DEFAULT 5
)
RETURNS TABLE (
  codigo_vehiculo TEXT,
  inicio TIMESTAMP,
  fin TIMESTAMP,
  eventos INTEGER,
  velocidad_max NUMERIC,
  velocidad_prom NUMERIC,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  direccion TEXT,
  cedula_conductor TEXT,
  codigo_conductor TEXT,
  conductor_nombre TEXT,
  ruta TEXT,
  viaje_numero BIGINT,
  hora_despacho TEXT,
  hora_llegada TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT
      v.codigo_vehiculo,
      (v.fecha_hora AT TIME ZONE 'UTC') AS ts,
      v.velocidad, v.latitud, v.longitud, v.direccion
    FROM velocidades v
    WHERE v.fecha BETWEEN p_desde AND p_hasta
      AND v.velocidad >= p_umbral
  ),
  marcado AS (
    SELECT
      ev.*,
      CASE
        WHEN LAG(ev.ts) OVER (PARTITION BY ev.codigo_vehiculo ORDER BY ev.ts) IS NULL THEN 1
        WHEN ev.ts - LAG(ev.ts) OVER (PARTITION BY ev.codigo_vehiculo ORDER BY ev.ts)
             > make_interval(mins => p_minutos) THEN 1
        ELSE 0
      END AS nueva
    FROM ev
  ),
  episodios AS (
    SELECT
      m.*,
      SUM(m.nueva) OVER (PARTITION BY m.codigo_vehiculo ORDER BY m.ts ROWS UNBOUNDED PRECEDING) AS ep
    FROM marcado m
  ),
  agg AS (
    SELECT
      e.codigo_vehiculo,
      e.ep,
      MIN(e.ts) AS inicio,
      MAX(e.ts) AS fin,
      COUNT(*)::int AS eventos,
      MAX(e.velocidad) AS velocidad_max,
      ROUND(AVG(e.velocidad), 1) AS velocidad_prom,
      (array_agg(e.latitud ORDER BY e.velocidad DESC NULLS LAST, e.ts))[1] AS latitud,
      (array_agg(e.longitud ORDER BY e.velocidad DESC NULLS LAST, e.ts))[1] AS longitud,
      (array_agg(e.direccion ORDER BY e.velocidad DESC NULLS LAST, e.ts))[1] AS direccion
    FROM episodios e
    GROUP BY e.codigo_vehiculo, e.ep
  )
  SELECT
    a.codigo_vehiculo,
    a.inicio,
    a.fin,
    a.eventos,
    a.velocidad_max,
    a.velocidad_prom,
    a.latitud,
    a.longitud,
    a.direccion,
    vj.cedula_conductor,
    vj.codigo_conductor,
    vj.conductor_nombre,
    COALESCE(NULLIF(vj.ruta_reprogramada, ''), vj.ruta_programada) AS ruta,
    vj.numero AS viaje_numero,
    vj.hora_despacho,
    vj.hora_llegada
  FROM agg a
  -- El viaje del vehículo cuyo despacho es el último antes de la incidencia
  -- (mismo día o el anterior, por los turnos que cruzan medianoche). Si el
  -- viaje ya había llegado más de 30 minutos antes, no se le atribuye.
  LEFT JOIN LATERAL (
    SELECT
      vr.numero, vr.cedula_conductor, vr.codigo_conductor, vr.conductor_nombre,
      vr.ruta_programada, vr.ruta_reprogramada, vr.hora_despacho, vr.hora_llegada
    FROM viajes_recaudados vr
    CROSS JOIN LATERAL (
      SELECT
        vr.fecha_viaje + operativo_hora_a_time(vr.hora_despacho) AS despacho_ts,
        CASE
          WHEN operativo_hora_a_time(vr.hora_llegada) IS NULL THEN NULL
          WHEN operativo_hora_a_time(vr.hora_llegada) < operativo_hora_a_time(vr.hora_despacho)
            THEN vr.fecha_viaje + 1 + operativo_hora_a_time(vr.hora_llegada)
          ELSE vr.fecha_viaje + operativo_hora_a_time(vr.hora_llegada)
        END AS llegada_ts
    ) t
    WHERE vr.codigo_vehiculo = a.codigo_vehiculo
      AND vr.fecha_viaje BETWEEN (a.inicio::date - 1) AND a.inicio::date
      AND t.despacho_ts IS NOT NULL
      AND t.despacho_ts <= a.inicio
      AND (t.llegada_ts IS NULL OR t.llegada_ts >= a.inicio - interval '30 minutes')
    ORDER BY t.despacho_ts DESC
    LIMIT 1
  ) vj ON true
  ORDER BY a.inicio;
$$;

COMMENT ON FUNCTION get_incidencias_velocidad(DATE, DATE, NUMERIC, INTEGER) IS
  'Incidencias de exceso de velocidad (episodios de eventos >= umbral separados por menos de p_minutos) por vehículo, con el conductor del viaje despachado a esa hora. Sin conductor cuando no hay viaje que cubra la hora.';

-- ── 6. Privilegios ───────────────────────────────────────────────────────────
ALTER TABLE operativo_velocidad_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE operativo_velocidad_reportes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON operativo_velocidad_parametros FROM anon, public;
REVOKE ALL ON operativo_velocidad_reportes FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operativo_velocidad_parametros TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operativo_velocidad_reportes TO service_role;
GRANT SELECT ON TABLE velocidades TO service_role;
GRANT SELECT ON TABLE viajes_recaudados TO service_role;
GRANT EXECUTE ON FUNCTION operativo_hora_a_time(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_incidencias_velocidad(DATE, DATE, NUMERIC, INTEGER) TO service_role;

-- ── 7. Comprobación: incidencias de la última semana con y sin conductor ────
SELECT
  count(*) AS incidencias,
  count(*) FILTER (WHERE cedula_conductor IS NOT NULL) AS con_conductor,
  count(*) FILTER (WHERE cedula_conductor IS NULL) AS sin_conductor,
  max(velocidad_max) AS velocidad_maxima
FROM get_incidencias_velocidad(current_date - 7, current_date, 60, 5);
