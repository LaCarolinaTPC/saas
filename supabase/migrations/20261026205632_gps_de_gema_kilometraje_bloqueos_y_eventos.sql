-- gps de gema kilometraje bloqueos y eventos
--
-- Contexto: GEMA expone el GPS de la flota en procedimientos que Gestivo no
-- guardaba. Con el kilometraje por bus y día se pueden sacar indicadores por
-- kilómetro (accidentes y excesos por cada 100.000 km, costo por km); los
-- bloqueos del sensor de pasajeros alimentan el control de cámaras y sensores,
-- que hoy se llena a mano; y los eventos de conducción (frenadas y
-- aceleraciones bruscas, pánico, colisión) permiten medir cómo se maneja.
--
-- Los trae un cron propio (/api/cron/sync-gps), con carga histórica gradual
-- hacia atrás: cada noche lo reciente y, con el tiempo que sobre, unos días más
-- del histórico. Detalle en docs/gps-gema.md.
--
--   pa_ext_get_KilometrajeByFecha(desde, hasta)         ~150 filas/día
--   pa_ext_get_HistoricoBloqueosByFecha(fecha)          ~1.000 filas/día
--   pa_ext_get_HistoricoEventosByFecha(fecha, hi, hf)   ~200.000 filas/día, de
--     las que se guardan ~4.400: se descartan el ping de conducción (1), el de
--     estacionamiento (0) y la geocerca de velocidad (100/101), cuyos excesos
--     ya están en `velocidades`.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: el script corre entero de una vez y es
-- idempotente.

-- =============================================================================
-- 1. Kilometraje por bus y día. Llave natural: (vehículo, fecha).
-- =============================================================================

CREATE TABLE IF NOT EXISTS gps_kilometraje (
  codigo_vehiculo TEXT NOT NULL,
  fecha DATE NOT NULL,
  placa TEXT,
  imei TEXT,
  km_inicial NUMERIC(12,1),
  km_final NUMERIC(12,1),
  km_total NUMERIC(10,1),
  -- Más de 600 km en un día o negativo: salto del odómetro, no un recorrido.
  sospechoso BOOLEAN NOT NULL DEFAULT false,
  sincronizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_vehiculo, fecha)
);
CREATE INDEX IF NOT EXISTS idx_gps_kilometraje_fecha ON gps_kilometraje (fecha);

COMMENT ON TABLE gps_kilometraje IS
  'Kilómetros por bus y día según el GPS (GEMA pa_ext_get_KilometrajeByFecha). sospechoso = salto del odómetro (> 600 km o negativo).';

-- =============================================================================
-- 2. Bloqueos y novedades del sensor de pasajeros. Sin llave estable en GEMA:
--    se reemplaza el día completo (gema_reemplazar_dia).
-- =============================================================================

CREATE TABLE IF NOT EXISTS gps_bloqueos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha DATE NOT NULL,
  hora TEXT,
  -- Hora de Colombia tal cual la entrega GEMA (sin zona).
  fecha_hora TIMESTAMP,
  codigo_vehiculo TEXT,
  placa TEXT,
  direccion TEXT,
  cod_evento INTEGER,
  evento TEXT,
  es_critico BOOLEAN,
  velocidad_kph NUMERIC(6,2),
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  registro_sensor INTEGER,
  pasajero_dia INTEGER,
  bloqueos INTEGER,
  sincronizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gps_bloqueos_fecha ON gps_bloqueos (fecha);
CREATE INDEX IF NOT EXISTS idx_gps_bloqueos_vehiculo_fecha ON gps_bloqueos (codigo_vehiculo, fecha);

COMMENT ON TABLE gps_bloqueos IS
  'Eventos del sensor de pasajeros por día (GEMA pa_ext_get_HistoricoBloqueosByFecha): BLOQUEO P1/P2, antisalto, tapa abierta, reset… Se reemplaza el día completo.';

-- =============================================================================
-- 3. Eventos del GPS, sin los pings. Se reemplaza el día completo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gps_eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha DATE NOT NULL,
  hora TEXT,
  fecha_hora TIMESTAMP,
  codigo_vehiculo TEXT,
  placa TEXT,
  cod_evento INTEGER,
  evento TEXT,
  descripcion TEXT,
  velocidad_kph NUMERIC(6,2),
  direccion TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  sincronizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gps_eventos_fecha ON gps_eventos (fecha);
CREATE INDEX IF NOT EXISTS idx_gps_eventos_evento_fecha ON gps_eventos (cod_evento, fecha);
CREATE INDEX IF NOT EXISTS idx_gps_eventos_vehiculo_fecha ON gps_eventos (codigo_vehiculo, fecha);

COMMENT ON TABLE gps_eventos IS
  'Eventos del GPS por día (GEMA pa_ext_get_HistoricoEventosByFecha) sin los códigos 0, 1, 100 y 101 (pings y geocerca de velocidad). Se reemplaza el día completo.';

-- =============================================================================
-- 4. Permisos: lectura para usuarios autenticados (como `velocidades`) y todo
--    para service_role, que en esta instalación no se hereda.
-- =============================================================================

ALTER TABLE gps_kilometraje ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gps_kilometraje FROM anon, public;
REVOKE ALL ON gps_bloqueos FROM anon, public;
REVOKE ALL ON gps_eventos FROM anon, public;
GRANT SELECT ON gps_kilometraje TO authenticated;
GRANT SELECT ON gps_bloqueos TO authenticated;
GRANT SELECT ON gps_eventos TO authenticated;
GRANT ALL ON gps_kilometraje TO service_role;
GRANT ALL ON gps_bloqueos TO service_role;
GRANT ALL ON gps_eventos TO service_role;

-- =============================================================================
-- 5. Reemplazo del día: misma función de 20261014171529 con las dos tablas
--    nuevas en la lista blanca.
-- =============================================================================

CREATE OR REPLACE FUNCTION gema_reemplazar_dia(p_tabla text, p_dia date, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_columna_dia text;
  v_columnas    text;
  v_insertadas  integer;
  v_ajenas      integer;
BEGIN
  v_columna_dia := CASE p_tabla
    WHEN 'timbradas_descontadas' THEN 'dia_generacion'
    WHEN 'tickets_transfer'      THEN 'dia_generacion'
    WHEN 'anotaciones_viajes'    THEN 'fecha_viaje'
    WHEN 'cumplimientos'         THEN 'fecha_viaje'
    WHEN 'historico_despacho'    THEN 'fecha_viaje'
    WHEN 'abonos'                THEN 'dia_abono'
    WHEN 'programacion'          THEN 'fecha'
    WHEN 'totales_cajero'        THEN 'fecha'
    WHEN 'gps_bloqueos'          THEN 'fecha'
    WHEN 'gps_eventos'           THEN 'fecha'
  END;
  IF v_columna_dia IS NULL THEN
    RAISE EXCEPTION 'Tabla no permitida para reemplazo diario: %', p_tabla;
  END IF;
  IF p_dia IS NULL THEN
    RAISE EXCEPTION 'p_dia es obligatorio';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_columnas
    FROM pg_attribute a
   WHERE a.attrelid = p_tabla::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attidentity = ''
     AND a.attgenerated = ''
     AND a.attname <> 'sincronizado_at';

  EXECUTE format('DELETE FROM %I WHERE %I = $1', p_tabla, v_columna_dia) USING p_dia;
  EXECUTE format(
    'INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I, $1)',
    p_tabla, v_columnas, v_columnas, p_tabla
  ) USING p_filas;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;

  -- Protección: una fila de otro día quedaría fuera del próximo reemplazo y se
  -- duplicaría para siempre. Si llega, se revierte todo.
  EXECUTE format('SELECT count(*) FROM %I WHERE %I IS DISTINCT FROM $1 AND sincronizado_at = now()', p_tabla, v_columna_dia)
    INTO v_ajenas USING p_dia;
  IF v_ajenas > 0 THEN
    RAISE EXCEPTION '% filas recibidas no pertenecen al día % en %', v_ajenas, p_dia, p_tabla;
  END IF;

  RETURN v_insertadas;
END;
$$;

REVOKE ALL ON FUNCTION gema_reemplazar_dia(text, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gema_reemplazar_dia(text, date, jsonb) TO service_role;

-- =============================================================================
-- 6. Marcadores en gema_sync_state (se ven en Tesorería › Parámetros).
--    gps_* = hasta dónde llegó lo reciente; gps_*_historico = el día más
--    antiguo ya cargado del histórico (NULL = todavía no empieza).
-- =============================================================================

INSERT INTO gema_sync_state (dataset) VALUES
  ('gps_kilometraje'), ('gps_bloqueos'), ('gps_eventos'),
  ('gps_kilometraje_historico'), ('gps_bloqueos_historico'), ('gps_eventos_historico')
ON CONFLICT (dataset) DO NOTHING;

-- Verificación: 3 tablas, 6 marcadores y la función con las tablas nuevas.
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('gps_kilometraje', 'gps_bloqueos', 'gps_eventos')) AS tablas,
  (SELECT count(*) FROM gema_sync_state WHERE dataset LIKE 'gps\_%') AS marcadores,
  (SELECT pg_get_functiondef('gema_reemplazar_dia(text, date, jsonb)'::regprocedure) LIKE '%gps_eventos%') AS funcion_actualizada;
