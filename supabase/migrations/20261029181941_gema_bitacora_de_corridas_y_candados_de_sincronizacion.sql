-- gema bitacora de corridas y candados de sincronizacion
--
-- Contexto. La sincronización con GEMA se lanza por el cron de las 03:00 y a
-- mano desde Tesorería › Parámetros (44 veces del 15 al 29 de octubre, dos de
-- ellas con 14 s de diferencia). Tres problemas:
--   1. Dos corridas a la vez reemplazan el mismo día de las tablas «tal cual»
--      (sin llave única): una puede borrar mientras la otra inserta y dejar
--      filas duplicadas. Hasta hoy no pasó; los datos están limpios.
--   2. Solo quedaba rastro de las corridas manuales (auditoría); de la del
--      cron no había ninguno, y cada corrida pisaba la hora de la anterior en
--      gema_sync_state: no se podía saber si la de las 03:00 corrió.
--   3. (En código) una tabla que fallaba seguía figurando «ok».
--
-- Qué hace:
--   1. gema_corridas: una fila por corrida (cron o manual) con quién, cuándo,
--      cuánto tardó y el resultado por tabla.
--   2. gema_abrir_corrida(): abre una corrida solo si no hay otra en curso, de
--      forma atómica (candado de transacción). Una «corriendo» de más de 6 min
--      murió (el tope de la función es 5 min) y se marca «abandonada».
--   3. gema_reemplazar_dia(): igual que antes más un candado por (tabla, día):
--      el despacho del día (Marcaciones) y una corrida completa ya no pueden
--      reemplazar el mismo día a la vez.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

-- ── 1. Bitácora de corridas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gema_corridas (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  iniciada_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminada_at  TIMESTAMPTZ,
  origen        TEXT NOT NULL CHECK (origen IN ('cron', 'manual')),
  usuario_email TEXT,
  rango_desde   DATE,
  rango_hasta   DATE,
  estado        TEXT NOT NULL DEFAULT 'corriendo'
                CHECK (estado IN ('corriendo', 'ok', 'parcial', 'error', 'abandonada')),
  duracion_ms   INTEGER,
  -- [{dataset, rows, error?, aviso?}, …] tal como lo devuelve runSync.
  resultados    JSONB,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_gema_corridas_iniciada ON gema_corridas (iniciada_at DESC);
CREATE INDEX IF NOT EXISTS idx_gema_corridas_origen ON gema_corridas (origen, iniciada_at DESC);

ALTER TABLE gema_corridas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gema_corridas FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gema_corridas TO service_role;

COMMENT ON TABLE gema_corridas IS
  'Bitácora de sincronizaciones con GEMA (cron de las 03:00 y botón de Tesorería › Parámetros). Una «corriendo» de menos de 6 min impide abrir otra.';

-- ── 2. Abrir una corrida (o fallar si hay otra en curso) ───────────────────
CREATE OR REPLACE FUNCTION gema_abrir_corrida(
  p_origen  TEXT,
  p_usuario TEXT,
  p_desde   DATE,
  p_hasta   DATE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_viva gema_corridas%ROWTYPE;
  v_id   BIGINT;
BEGIN
  -- Serializa a quienes intentan abrir: sin esto, dos clics simultáneos
  -- verían «no hay ninguna» los dos y abrirían dos corridas.
  PERFORM pg_advisory_xact_lock(hashtext('gema_abrir_corrida'));

  -- Una corrida no pasa de 5 min (tope de la función serverless): la que
  -- siga «corriendo» después de 6 murió sin cerrar.
  UPDATE gema_corridas
     SET estado = 'abandonada',
         terminada_at = now(),
         error = COALESCE(error, 'No terminó (la función se cortó o falló sin cerrar la corrida).')
   WHERE estado = 'corriendo'
     AND iniciada_at < now() - INTERVAL '6 minutes';

  SELECT * INTO v_viva
    FROM gema_corridas
   WHERE estado = 'corriendo'
   ORDER BY iniciada_at DESC
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '%', format(
      'GEMA_EN_CURSO: ya hay una sincronización con GEMA en curso (#%s, %s%s, desde las %s).',
      v_viva.id, v_viva.origen,
      CASE WHEN v_viva.usuario_email IS NULL THEN '' ELSE ', ' || v_viva.usuario_email END,
      to_char(v_viva.iniciada_at AT TIME ZONE 'America/Bogota', 'HH24:MI:SS'));
  END IF;

  INSERT INTO gema_corridas (origen, usuario_email, rango_desde, rango_hasta)
  VALUES (p_origen, p_usuario, p_desde, p_hasta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION gema_abrir_corrida(TEXT, TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gema_abrir_corrida(TEXT, TEXT, DATE, DATE) TO service_role;

-- ── 3. Reemplazo de un día, con candado por (tabla, día) ────────────────────
-- Mismo cuerpo que en 20261026205632; solo se agrega el candado al principio.
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

  -- Dos reemplazos del mismo (tabla, día) a la vez dejarían duplicados: el
  -- segundo DELETE no ve las filas que el primero insertó y aún no confirmó.
  -- Con el candado, el segundo espera y su DELETE ya las ve.
  PERFORM pg_advisory_xact_lock(hashtext('gema_reemplazar_dia:' || p_tabla), (p_dia - DATE '2000-01-01'));

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

-- Verificación: la tabla y las dos funciones.
SELECT
  to_regclass('public.gema_corridas') AS tabla,
  to_regprocedure('gema_abrir_corrida(text,text,date,date)') AS abrir,
  to_regprocedure('gema_reemplazar_dia(text,date,jsonb)') AS reemplazar;
