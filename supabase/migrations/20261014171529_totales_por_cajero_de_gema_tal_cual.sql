-- totales por cajero de gema tal cual
--
-- Contexto: el proveedor de GEMA habilitó pa_ext_get_TotalesCajeroByFecha, que
-- Gestivo no sincronizaba y que debe llegar a Gestivo y al servidor MCP tal
-- como GEMA lo entrega (mismos nombres de columna):
--
--   pa_ext_get_TotalesCajeroByFecha(pFecha date) → totales_cajero
--
-- Verificado contra GEMA el 2026-10-14 (días 2026-09-01 a 2026-10-14 y
-- muestras desde 2022):
--   - A diferencia de los demás procedimientos recibe UN solo día y no devuelve
--     la fecha: Gestivo la agrega en la columna fecha (el día pedido).
--   - Cada cajero trae dos clases de fila en el día:
--       · arqueo: solo datos_valores (billetes, monedas, cheques, vales y otros
--         pagos contados), con los totales en null. Una por cajero y día.
--       · recaudo: viajes, timbradas, transfers, bruto, anticipo, factura,
--         ahorro y neto, sin datos_valores. Una por cajero, día y
--         es_extemporaneo ('NO' = viajes del día, 'SI' = extemporáneos).
--     Unas 13 filas entre semana y 6 el domingo; 15 cajeros distintos.
--   - neto = bruto - anticipo - factura - ahorro en las 346 filas de recaudo.
--   - datos_valores es un arreglo JSON de un objeto: B1000…B100000 y
--     M50…M1000 con und (unidades sueltas) y faj (fajos, solo billetes), y
--     CHEQUES, VALES y OTROS_PAGOS_C con val (valor). Contando el fajo como 100
--     billetes, el arqueo iguala el neto del cajero (NO + SI) en 189 de 194
--     casos; los otros 5 quedan entre $1.000 y $206.400 por debajo.
--   - identificacion_cajero es employees.document_number.
--
-- Se sincroniza reemplazando el día completo con gema_reemplazar_dia, igual
-- que la operación tal cual de 20260911162140; esta migración agrega la tabla
-- a su lista blanca. tipo_fila y total_arqueo los calcula Gestivo para poder
-- filtrar y sumar sin leer el JSON.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

-- =============================================================================
-- 1. Total del arqueo
-- =============================================================================

-- Valor en pesos de datos_valores: unidades sueltas + fajos de 100 billetes por
-- denominación, más el val de cheques, vales y otros pagos. IMMUTABLE para
-- poder usarla en la columna generada.
CREATE OR REPLACE FUNCTION gema_total_arqueo(p_datos jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE WHEN jsonb_typeof(p_datos) = 'array' THEN (
    SELECT coalesce(sum(
      CASE
        WHEN d.value ? 'val' THEN coalesce(nullif(d.value->>'val', '')::numeric, 0)
        WHEN d.key ~ '^[BM][0-9]+$' THEN substring(d.key FROM 2)::numeric * (
          coalesce(nullif(d.value->>'und', '')::numeric, 0)
          + coalesce(nullif(d.value->>'faj', '')::numeric, 0) * 100
        )
        ELSE 0
      END
    ), 0)
    FROM jsonb_array_elements(p_datos) AS e(obj),
         jsonb_each(CASE WHEN jsonb_typeof(e.obj) = 'object' THEN e.obj ELSE '{}'::jsonb END) AS d
  ) END
$$;

-- =============================================================================
-- 2. Tabla
-- =============================================================================

CREATE TABLE IF NOT EXISTS totales_cajero (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha                 date NOT NULL,
  identificacion_cajero text,
  nombre_cajero         text,
  es_extemporaneo       text,
  viajes                integer,
  timbradas             numeric(14,2),
  transfers             numeric(14,2),
  bruto                 numeric(14,2),
  anticipo              numeric(14,2),
  factura               numeric(14,2),
  ahorro                numeric(14,2),
  neto                  numeric(14,2),
  datos_valores         jsonb,
  tipo_fila             text GENERATED ALWAYS AS (
                          CASE WHEN datos_valores IS NOT NULL THEN 'arqueo' ELSE 'recaudo' END
                        ) STORED,
  total_arqueo          numeric(14,2) GENERATED ALWAYS AS (gema_total_arqueo(datos_valores)) STORED,
  sincronizado_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_totales_cajero_fecha ON totales_cajero (fecha);
CREATE INDEX IF NOT EXISTS idx_totales_cajero_cajero ON totales_cajero (identificacion_cajero, fecha);

COMMENT ON TABLE totales_cajero IS
  'Totales por cajero de GEMA (arqueo y recaudo), tal cual pa_ext_get_TotalesCajeroByFecha. Se reemplaza el día completo según fecha.';
COMMENT ON COLUMN totales_cajero.fecha IS
  'Día pedido a GEMA; el procedimiento no lo devuelve.';
COMMENT ON COLUMN totales_cajero.tipo_fila IS
  'Calculada por Gestivo: arqueo (fila con datos_valores) o recaudo (fila con los totales).';
COMMENT ON COLUMN totales_cajero.total_arqueo IS
  'Calculada por Gestivo: valor de datos_valores con el fajo de 100 billetes. Null en las filas de recaudo.';

ALTER TABLE totales_cajero ENABLE ROW LEVEL SECURITY;
GRANT ALL ON totales_cajero TO service_role;

-- =============================================================================
-- 3. Reemplazo del día: misma función de 20261005161427 con la tabla nueva en
--    la lista blanca.
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

INSERT INTO gema_sync_state (dataset) VALUES ('totales_cajero')
ON CONFLICT (dataset) DO NOTHING;
