-- tablas espejo de gema timbradas descontadas tickets transfer anotaciones y cumplimientos
--
-- Contexto: el proveedor de GEMA habilitó cuatro procedimientos nuevos que
-- Gestivo no sincronizaba y que deben llegar al servidor MCP tal como GEMA los
-- entrega (mismos nombres de columna):
--
--   pa_ext_get_TimbradasDescontadasByFecha → timbradas_descontadas
--   pa_ext_get_TicketsTransferByFecha      → tickets_transfer
--   pa_ext_get_AnotacionesViajesByFecha    → anotaciones_viajes
--   pa_ext_get_CumplimientosByFecha        → cumplimientos (planilla de tiempos)
--
-- Ninguno trae una llave estable (un viaje puede pasar dos veces por el mismo
-- punto de control; hay anotaciones repetidas en el mismo segundo), así que se
-- sincronizan reemplazando el día completo según la fecha que filtra cada
-- procedimiento, verificada contra GEMA el 2026-09-11: fecha de generación en
-- timbradas y tickets, fecha del viaje en anotaciones y cumplimientos. El
-- reemplazo es atómico (función gema_reemplazar_dia) y también refleja lo que
-- GEMA borre.
--
-- Las fechas de generación se guardan como timestamp SIN zona: son la hora
-- local de Colombia tal como la registra GEMA.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

-- =============================================================================
-- 1. Tablas
-- =============================================================================

CREATE TABLE IF NOT EXISTS timbradas_descontadas (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_viaje                 bigint NOT NULL,
  fecha_viaje              date,
  num_viaje                integer,
  codigo_vehiculo          text,
  placa_vehiculo           text,
  conductor                text,
  identificacion_conductor text,
  tim_descuento            numeric(12,2),
  motivo_descuento         text,
  observacion              text,
  fecha_generacion         timestamp NOT NULL,
  dia_generacion           date GENERATED ALWAYS AS (fecha_generacion::date) STORED,
  usuario_generacion       text,
  sincronizado_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timbradas_desc_dia ON timbradas_descontadas (dia_generacion);
CREATE INDEX IF NOT EXISTS idx_timbradas_desc_viaje ON timbradas_descontadas (id_viaje);
CREATE INDEX IF NOT EXISTS idx_timbradas_desc_fecha_viaje ON timbradas_descontadas (fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_timbradas_desc_conductor ON timbradas_descontadas (identificacion_conductor);

CREATE TABLE IF NOT EXISTS tickets_transfer (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_viaje           bigint NOT NULL,
  fecha_viaje        date,
  num_viaje          integer,
  codigo_vehiculo    text,
  placa_vehiculo     text,
  cantidad_total     integer,
  cantidad_descuento integer,
  cantidad_incentivo integer,
  tickets            text,
  tickets_detalles   jsonb,
  estado             smallint,
  fecha_generacion   timestamp NOT NULL,
  dia_generacion     date GENERATED ALWAYS AS (fecha_generacion::date) STORED,
  usuario_generacion text,
  fecha_anulacion    timestamp,
  usuario_anulacion  text,
  sincronizado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_transfer_dia ON tickets_transfer (dia_generacion);
CREATE INDEX IF NOT EXISTS idx_tickets_transfer_viaje ON tickets_transfer (id_viaje);

CREATE TABLE IF NOT EXISTS anotaciones_viajes (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_viaje           bigint NOT NULL,
  fecha_viaje        date NOT NULL,
  num_viaje          integer,
  codigo_vehiculo    text,
  placa_vehiculo     text,
  conductor          text,
  ruta_programada    text,
  ruta_reprogramada  text,
  cod_novedad        integer,
  novedad            text,
  observacion        text,
  estado             smallint,
  fecha_generacion   timestamp,
  usuario_generacion text,
  sincronizado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anotaciones_viajes_fecha ON anotaciones_viajes (fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_anotaciones_viajes_viaje ON anotaciones_viajes (id_viaje);

CREATE TABLE IF NOT EXISTS cumplimientos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_viaje          bigint NOT NULL,
  fecha_viaje       date NOT NULL,
  turno             integer,
  num_viaje         integer,
  codigo_vehiculo   text,
  placa_vehiculo    text,
  ruta              text,
  hora_despacho     text,
  punto_control     text,
  abreviatura       text,
  hora_cumplimiento text,
  hora_llegada      text,
  min_diferencia    integer,
  sincronizado_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cumplimientos_fecha ON cumplimientos (fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_cumplimientos_viaje ON cumplimientos (id_viaje);
CREATE INDEX IF NOT EXISTS idx_cumplimientos_vehiculo_fecha ON cumplimientos (codigo_vehiculo, fecha_viaje);

ALTER TABLE timbradas_descontadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets_transfer      ENABLE ROW LEVEL SECURITY;
ALTER TABLE anotaciones_viajes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cumplimientos         ENABLE ROW LEVEL SECURITY;

GRANT ALL ON timbradas_descontadas, tickets_transfer, anotaciones_viajes, cumplimientos TO service_role;

-- =============================================================================
-- 2. Reemplazo atómico de un día
-- =============================================================================
-- Borra las filas del día según la columna que filtra el procedimiento de GEMA
-- e inserta las recibidas, en una sola transacción: una consulta concurrente
-- nunca ve el día a medias. Las columnas se toman del catálogo (sin id,
-- generadas ni sincronizado_at), así que el JSON solo aporta datos de GEMA.

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
-- 3. Estado de sincronización
-- =============================================================================

INSERT INTO gema_sync_state (dataset) VALUES
  ('timbradas_descontadas'), ('tickets_transfer'), ('anotaciones_viajes'), ('cumplimientos')
ON CONFLICT (dataset) DO NOTHING;
