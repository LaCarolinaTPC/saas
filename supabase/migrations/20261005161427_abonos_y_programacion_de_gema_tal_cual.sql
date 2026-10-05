-- abonos y programacion de gema tal cual
--
-- Contexto: el proveedor de GEMA habilitó dos procedimientos que Gestivo no
-- sincronizaba y que deben llegar a Gestivo y al servidor MCP tal como GEMA
-- los entrega (mismos nombres de columna):
--
--   pa_ext_get_AbonosByFecha       → abonos       (abonos registrados a viajes)
--   pa_ext_get_ProgramacionByFecha → programacion (planilla de turnos por ruta)
--
-- Verificado contra GEMA el 2026-10-05 (días 2026-09-01 a 2026-09-10):
--   - Abonos: 204 filas, unas 20 por día. El procedimiento filtra por la FECHA
--     DEL ABONO (fecha_abono), no por la del viaje: un abono del 2026-09-05 a
--     un viaje del 2026-09-04 solo sale al pedir el 5. id_abono es único;
--     id_viaje es historico_despacho.numero. Un abono se anula después
--     (estado 2 = ANULADO), así que el día se vuelve a reemplazar.
--   - Programación: 1.437 filas, unas 150 por día (79 el domingo). Una fila
--     por fecha, ruta y turno (sin repetidos) y un bus por fecha. Solo hay
--     programación hasta el día en curso. conductor_asignado llega siempre
--     vacío; se guarda por si GEMA lo llena.
--
-- Se sincronizan reemplazando el día completo con gema_reemplazar_dia, igual
-- que la operación tal cual de 20260911162140; esta migración agrega las dos
-- tablas a su lista blanca.
--
-- Fechas y horas: hora local de Colombia tal como la registra GEMA.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

-- =============================================================================
-- 1. Tablas
-- =============================================================================

CREATE TABLE IF NOT EXISTS abonos (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_abono           bigint NOT NULL,
  id_viaje           bigint,
  valor_abono        numeric(14,2),
  fecha_abono        timestamp NOT NULL,
  dia_abono          date GENERATED ALWAYS AS (fecha_abono::date) STORED,
  concepto_abono     text,
  estado             smallint,
  estado_texto       text,
  fecha_viaje        date,
  num_viaje          integer,
  codigo_vehiculo    text,
  placa_vehiculo     text,
  usuario_generacion text,
  sincronizado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abonos_dia ON abonos (dia_abono);
CREATE INDEX IF NOT EXISTS idx_abonos_id_abono ON abonos (id_abono);
CREATE INDEX IF NOT EXISTS idx_abonos_viaje ON abonos (id_viaje);
CREATE INDEX IF NOT EXISTS idx_abonos_vehiculo ON abonos (codigo_vehiculo, fecha_viaje);

CREATE TABLE IF NOT EXISTS programacion (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha              date NOT NULL,
  fecha_format       text,
  id_ruta            integer,
  ruta               text,
  turno              integer,
  codigo_vehiculo    text,
  placa_vehiculo     text,
  conductor_asignado text,
  es_cuna            boolean,
  tipo_cuna          text,
  es_ruleta          boolean,
  sincronizado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_programacion_fecha ON programacion (fecha, id_ruta, turno);
CREATE INDEX IF NOT EXISTS idx_programacion_vehiculo ON programacion (codigo_vehiculo, fecha);

COMMENT ON TABLE abonos IS
  'Abonos registrados a viajes en GEMA, tal cual pa_ext_get_AbonosByFecha. Se reemplaza el día completo según fecha_abono.';
COMMENT ON TABLE programacion IS
  'Programación del despacho de GEMA (turno, ruta y bus por día), tal cual pa_ext_get_ProgramacionByFecha. Se reemplaza el día completo según fecha.';

ALTER TABLE abonos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE programacion ENABLE ROW LEVEL SECURITY;
GRANT ALL ON abonos, programacion TO service_role;

-- =============================================================================
-- 2. Reemplazo del día: misma función de 20260911184759 con las dos tablas
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

INSERT INTO gema_sync_state (dataset) VALUES ('abonos'), ('programacion')
ON CONFLICT (dataset) DO NOTHING;
