-- historico de despacho de gema tal cual
--
-- Contexto: pa_ext_get_ViajesByFecha entrega el histórico de despacho completo
-- de GEMA (unos 500 viajes por día, 31 columnas), pero Gestivo solo guardaba en
-- viajes_perdidos los viajes con novedad distinta de NORMAL y 15 de sus
-- columnas. El proveedor pidió tenerlo tal cual en Gestivo y en el servidor MCP.
--
-- Nombres de columna: los de GEMA pasados a minúsculas con guion bajo
-- (HoraDespacho → hora_despacho). Con mayúsculas, Postgres exigiría citarlos y
-- los agentes de IA fallarían al filtrar.
--
-- Verificado contra GEMA el 2026-09-11: Numero es único, el procedimiento
-- filtra por FechaViaje y los viajes cambian después (recaudo, pago), así que se
-- reemplaza el día completo con gema_reemplazar_dia, igual que la operación tal
-- cual de la migración 20260911162140. Esta migración agrega la tabla a esa
-- función.
--
-- Horas y fecha de recaudo: hora local de Colombia tal como la registra GEMA.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

CREATE TABLE IF NOT EXISTS historico_despacho (
  numero            bigint PRIMARY KEY,
  fecha_viaje       date NOT NULL,
  hora_procesado    text,
  hora_despacho     text,
  hora_llegada      text,
  fecha_recaudo     timestamp,
  codigo            text,
  placa             text,
  conductor_cod     text,
  conductor         text,
  conductor_ced     text,
  turno             integer,
  viaje             integer,
  estado            text,
  ruta_reprogramada text,
  ruta_programada   text,
  novedad           text,
  sigla_novedad     text,
  tipologia_novedad text,
  detalle_novedad   text,
  despachador       text,
  planillero        text,
  tipo_paquete      text,
  is_ruleta         boolean,
  is_cuna           boolean,
  tipo_propietario  text,
  propietario       text,
  propietario_ced   text,
  timbradas         integer,
  is_pago           boolean,
  tipo_gps          text,
  sincronizado_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_despacho_fecha ON historico_despacho (fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_historico_despacho_conductor ON historico_despacho (conductor_ced, fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_historico_despacho_vehiculo ON historico_despacho (codigo, fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_historico_despacho_novedad ON historico_despacho (novedad, fecha_viaje);

ALTER TABLE historico_despacho ENABLE ROW LEVEL SECURITY;
GRANT ALL ON historico_despacho TO service_role;

-- Misma función de 20260911162140 con historico_despacho en la lista blanca.
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

INSERT INTO gema_sync_state (dataset) VALUES ('historico_despacho')
ON CONFLICT (dataset) DO NOTHING;
