-- GPS: últimas posiciones de la flota
--
-- GEMA tiene `pa_ext_get_UltimasPosiciones()`: la última posición GPS de cada
-- bus (~154 filas, ~1 s), al minuto. El cron del GPS corre una vez al día, así
-- que una copia diaria llegaría con horas de atraso. Esta tabla la refresca el
-- cron local de las páginas abiertas (tarea `gps.ultimas_posiciones`, cada 5
-- minutos; ver docs/tareas-programadas.md) y sirve para:
--
--   * saber desde cuándo un bus no reporta (`fecha_hora` es su último reporte);
--   * cruzarla con otras tablas y exponerla al MCP sin ir a GEMA en cada consulta.
--
-- La pantalla Operativo › GPS de la flota consulta GEMA en vivo y usa esta
-- tabla solo si GEMA no responde. `actualizado_at` dice qué tan fresca es la
-- copia: si nadie tiene Gestivo abierto, no se refresca.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero e
-- idempotente. Las tablas nuevas no heredan privilegios: GRANT a service_role.

CREATE TABLE IF NOT EXISTS gps_ultimas_posiciones (
  codigo_vehiculo TEXT PRIMARY KEY,
  placa TEXT,
  imei TEXT,
  -- Último reporte del GPS, hora de Colombia tal cual la entrega GEMA (sin zona).
  fecha_hora TIMESTAMP,
  fecha DATE,
  hora TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  velocidad_kph NUMERIC(6,2),
  rumbo_grados NUMERIC(6,2),
  direccion TEXT,
  -- Modo del equipo en ese reporte: conducción, estacionamiento, parqueo.
  evento TEXT,
  -- Último encendido o apagado registrado y su hora.
  ultimo_evento_critico TEXT,
  hora_ultimo_evento_critico TEXT,
  -- Cuándo la copió Gestivo (UTC real). Si es vieja, la tabla está congelada.
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_ultimas_posiciones_fecha_hora ON gps_ultimas_posiciones (fecha_hora);

COMMENT ON TABLE gps_ultimas_posiciones IS
  'Última posición GPS de cada bus (GEMA pa_ext_get_UltimasPosiciones), refrescada cada 5 minutos por el cron local mientras haya páginas de Gestivo abiertas. fecha_hora = último reporte del bus; actualizado_at = cuándo se copió.';

ALTER TABLE gps_ultimas_posiciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gps_ultimas_posiciones FROM anon, public;
GRANT SELECT ON gps_ultimas_posiciones TO authenticated;
GRANT ALL ON gps_ultimas_posiciones TO service_role;

-- KPIs del GPS de un periodo, para Operativo › GPS de la flota.
--
-- Agrega en la base porque un mes de gps_eventos son ~120.000 filas y
-- PostgREST corta en 1.000. Códigos de GEMA verificados el 2026-10-28 sobre
-- una semana real de gps_eventos:
--   conducción brusca: 46 Harsh Acceleration, 47 Harsh Braking,
--                      48 Sharp Turn Left, 49 Sharp Turn Right
--   seguridad:         42 BOTON DE PANICO, 45 Bateria Desconectada
-- Sensor de pasajeros: los que GEMA marca es_critico (BLOQUEO P1, BLOQUEO P2,
-- RESET DE SISTEMA). Los kilómetros excluyen los días con odómetro sospechoso.
-- Las tasas por bus solo cuentan buses con 100 km o más en el periodo.
CREATE OR REPLACE FUNCTION gps_kpis(p_desde DATE, p_hasta DATE)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
WITH
km AS (
  SELECT codigo_vehiculo, fecha, km_total, sospechoso
  FROM gps_kilometraje
  WHERE fecha BETWEEN p_desde AND p_hasta
),
ev AS (
  SELECT codigo_vehiculo, fecha, cod_evento
  FROM gps_eventos
  WHERE fecha BETWEEN p_desde AND p_hasta
    AND cod_evento IN (42, 45, 46, 47, 48, 49)
),
bl AS (
  SELECT codigo_vehiculo, fecha, evento, es_critico
  FROM gps_bloqueos
  WHERE fecha BETWEEN p_desde AND p_hasta
),
km_bus AS (
  SELECT codigo_vehiculo, SUM(km_total) FILTER (WHERE NOT sospechoso) AS km
  FROM km GROUP BY codigo_vehiculo
),
bruscos_bus AS (
  SELECT codigo_vehiculo,
         COUNT(*) FILTER (WHERE cod_evento IN (46, 47, 48, 49)) AS bruscos,
         COUNT(*) FILTER (WHERE cod_evento = 47) AS frenadas
  FROM ev GROUP BY codigo_vehiculo
),
criticos_bus AS (
  SELECT codigo_vehiculo, COUNT(*) FILTER (WHERE es_critico) AS criticos
  FROM bl GROUP BY codigo_vehiculo
),
por_bus AS (
  SELECT k.codigo_vehiculo, round(k.km, 1) AS km,
         COALESCE(b.bruscos, 0) AS bruscos,
         COALESCE(b.frenadas, 0) AS frenadas,
         COALESCE(c.criticos, 0) AS sensor_criticos,
         round(COALESCE(b.bruscos, 0) * 100.0 / NULLIF(k.km, 0), 2) AS bruscos_100km
  FROM km_bus k
  LEFT JOIN bruscos_bus b USING (codigo_vehiculo)
  LEFT JOIN criticos_bus c USING (codigo_vehiculo)
  WHERE k.km >= 100
),
dias AS (
  SELECT d::date AS fecha FROM generate_series(p_desde, p_hasta, interval '1 day') d
)
SELECT jsonb_build_object(
  'desde', p_desde,
  'hasta', p_hasta,
  'km', (SELECT jsonb_build_object(
      'total', COALESCE(round(SUM(km_total) FILTER (WHERE NOT sospechoso), 1), 0),
      'buses', COUNT(DISTINCT codigo_vehiculo) FILTER (WHERE NOT sospechoso),
      'bus_dias', COUNT(*) FILTER (WHERE NOT sospechoso),
      'sospechosos', COUNT(*) FILTER (WHERE sospechoso)
    ) FROM km),
  'eventos', (SELECT COALESCE(jsonb_object_agg(cod_evento::text, n), '{}'::jsonb)
    FROM (SELECT cod_evento, COUNT(*) AS n FROM ev GROUP BY cod_evento) x),
  'sensor', (SELECT COALESCE(jsonb_agg(jsonb_build_object('evento', evento, 'critico', es_critico, 'n', n) ORDER BY n DESC), '[]'::jsonb)
    FROM (SELECT evento, bool_or(es_critico) AS es_critico, COUNT(*) AS n FROM bl GROUP BY evento) x),
  'por_dia', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fecha', d.fecha,
        'km', COALESCE((SELECT round(SUM(km_total), 1) FROM km WHERE km.fecha = d.fecha AND NOT sospechoso), 0),
        'bruscos', (SELECT COUNT(*) FROM ev WHERE ev.fecha = d.fecha AND cod_evento IN (46, 47, 48, 49)),
        'sensor_criticos', (SELECT COUNT(*) FROM bl WHERE bl.fecha = d.fecha AND es_critico)
      ) ORDER BY d.fecha), '[]'::jsonb) FROM dias d),
  'top_bruscos', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.bruscos_100km DESC NULLS LAST), '[]'::jsonb)
    FROM (SELECT * FROM por_bus ORDER BY bruscos_100km DESC NULLS LAST LIMIT 15) p),
  'top_sensor', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.sensor_criticos DESC), '[]'::jsonb)
    FROM (SELECT * FROM por_bus WHERE sensor_criticos > 0 ORDER BY sensor_criticos DESC LIMIT 15) p)
);
$$;

REVOKE ALL ON FUNCTION gps_kpis(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gps_kpis(DATE, DATE) TO service_role;

-- Marcador para Tesorería › Parámetros y el MCP, y la fila de la tarea.
INSERT INTO gema_sync_state (dataset) VALUES ('gps_ultimas_posiciones')
ON CONFLICT (dataset) DO NOTHING;

INSERT INTO tareas_programadas (id) VALUES ('gps.ultimas_posiciones')
ON CONFLICT (id) DO NOTHING;
