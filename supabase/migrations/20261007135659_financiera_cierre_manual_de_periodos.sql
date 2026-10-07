-- financiera cierre manual de periodos
--
-- Contexto: el acta del 2026-09-18 (punto 13) dejó el cierre del mes en manos
-- de GEMA: la consolidación diaria congelaba cada período en cuanto el marcador
-- del sync de ingreso_tercero pasaba su último día. En la práctica eso cierra
-- el mes el día 1 del siguiente, antes de que contabilidad entregue el archivo
-- (septiembre de 2026 quedó cerrado el 2026-10-01 sin archivo). La primera
-- carga sí entraba en un mes cerrado, pero corregirla o reversarla exigía que
-- el administrador lo reabriera.
--
-- Decisión del usuario (2026-10-07): el período lo cierra el usuario de Datos
-- de flota (sub-función fin_datos) cuando terminó de cargar y revisar el
-- archivo contable. Reabrir sigue siendo del administrador, con motivo.
--
--   * `financiera_consolidar_abiertos` ya no cierra nada: solo consolida los
--     meses no cerrados. Devuelve `cierre.cerrados = []` para no romper a quien
--     lee el resultado.
--   * `financiera_cerrar_periodos_por_gema` se elimina.
--   * `financiera_cerrar_periodo(periodo, email)` cierra un mes a demanda:
--     exige que GEMA ya haya pasado su último día (un mes en curso no se
--     congela), lo consolida una última vez y deja la bitácora con quién cerró
--     y cómo estaba el archivo contable.
--   * Bloque correctivo: los meses que GEMA cerró solo y que NO tienen el
--     archivo contable completo se reabren (con versión previa y bitácora, vía
--     financiera_reabrir_periodo). Los completos se quedan cerrados.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda. Cada función lleva
-- su propia etiqueta de dollar quoting para que un error señale el bloque.
--
-- No se crean tablas: no hace falta ningún GRANT nuevo sobre tablas.

BEGIN;

-- ── 1. La corrida diaria solo consolida ──────────────────────────────────────

CREATE OR REPLACE FUNCTION financiera_consolidar_abiertos(p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fin_abiertos_v2$
DECLARE
  v_marca DATE;
  v_ini   DATE;
  v_mes   DATE;
  v_p     TEXT;
  v_res   JSONB := '[]'::jsonb;
BEGIN
  SELECT MIN(fecha) INTO v_ini FROM ingreso_tercero;
  IF v_ini IS NULL THEN
    RETURN jsonb_build_object('periodos', v_res, 'motivo', 'espejo vacio');
  END IF;

  SELECT last_synced_date INTO v_marca
    FROM gema_sync_state WHERE dataset = 'ingreso_tercero';
  IF v_marca IS NULL THEN
    SELECT MAX(fecha) INTO v_marca FROM ingreso_tercero;
  END IF;

  v_mes := date_trunc('month', v_ini)::date;
  WHILE v_mes <= date_trunc('month', v_marca)::date LOOP
    v_p := to_char(v_mes, 'YYYY-MM');
    IF NOT EXISTS (SELECT 1 FROM financiera_periodos WHERE periodo = v_p AND estado = 'cerrado') THEN
      v_res := v_res || financiera_consolidar_periodo(v_p, false, p_email);
    END IF;
    v_mes := (v_mes + INTERVAL '1 month')::date;
  END LOOP;

  -- El cierre ya no es automático: lo hace el usuario con financiera_cerrar_periodo.
  RETURN jsonb_build_object(
    'marca_gema', v_marca,
    'periodos',   v_res,
    'cierre',     jsonb_build_object('marca_gema', v_marca, 'cerrados', '[]'::jsonb)
  );
END;
$fin_abiertos_v2$;

-- ── 2. Fuera el cierre por el marcador de GEMA ──────────────────────────────

DROP FUNCTION IF EXISTS financiera_cerrar_periodos_por_gema();

-- ── 3. Cierre manual de un período ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION financiera_cerrar_periodo(
  p_periodo TEXT,
  p_email   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fin_cerrar_manual$
DECLARE
  v_estado    TEXT;
  v_marca     DATE;
  v_ultimo    DATE;
  v_resultado JSONB;
  v_flota     RECORD;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Falta el usuario que cierra el periodo.';
  END IF;

  SELECT estado INTO v_estado FROM financiera_periodos WHERE periodo = p_periodo FOR UPDATE;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El periodo % no existe en Financiera.', p_periodo;
  END IF;
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'El periodo % ya esta cerrado.', p_periodo;
  END IF;

  SELECT last_synced_date INTO v_marca
    FROM gema_sync_state WHERE dataset = 'ingreso_tercero';
  v_ultimo := (to_date(p_periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date;
  IF v_marca IS NULL OR v_ultimo > v_marca THEN
    RAISE EXCEPTION 'El periodo % no ha terminado en GEMA (marcador: %): sus cifras todavia se mueven.',
      p_periodo, COALESCE(v_marca::text, 'sin dato');
  END IF;

  -- Última consolidación: lo que se congela es lo que hay hoy en el espejo.
  v_resultado := financiera_consolidar_periodo(p_periodo, false, p_email);
  IF COALESCE((v_resultado->>'omitido')::boolean, false) THEN
    RAISE EXCEPTION 'No se pudo consolidar % antes de cerrarlo: %', p_periodo, v_resultado;
  END IF;

  UPDATE financiera_periodos
     SET estado      = 'cerrado',
         cerrado_at  = now(),
         cerrado_por = btrim(p_email)
   WHERE periodo = p_periodo;

  SELECT vehiculos, vehiculos_con_contable, cobertura_contable
    INTO v_flota
    FROM vw_financiera_flota_mes WHERE periodo = p_periodo;

  INSERT INTO financiera_cargas (tipo, periodo, usuario_email, detalle)
  VALUES ('cerrar_periodo', p_periodo, btrim(p_email),
          jsonb_build_object(
            'manual',                 true,
            'estado_anterior',        v_estado,
            'marca_gema',             v_marca,
            'cobertura_contable',     v_flota.cobertura_contable,
            'vehiculos',              v_flota.vehiculos,
            'vehiculos_con_contable', v_flota.vehiculos_con_contable
          ));

  RETURN jsonb_build_object(
    'periodo',            p_periodo,
    'estado',             'cerrado',
    'cobertura_contable', v_flota.cobertura_contable
  );
END;
$fin_cerrar_manual$;

REVOKE ALL ON FUNCTION financiera_cerrar_periodo(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION financiera_cerrar_periodo(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION financiera_consolidar_abiertos(TEXT) TO service_role;

-- ── 4. Reabrir lo que GEMA cerró sin archivo contable completo ───────────────
-- Idempotente: en una segunda corrida esos meses ya están reabiertos.

DO $fin_reabrir_incompletos$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.periodo
      FROM financiera_periodos p
      LEFT JOIN vw_financiera_flota_mes f ON f.periodo = p.periodo
     WHERE p.estado = 'cerrado'
       AND f.cobertura_contable IS DISTINCT FROM 'completo'
     ORDER BY p.periodo
  LOOP
    PERFORM financiera_reabrir_periodo(r.periodo, 'migracion',
      'Cierre pasa a manual: mes cerrado por GEMA sin archivo contable completo');
  END LOOP;
END;
$fin_reabrir_incompletos$;

-- ── 5. Documentación ─────────────────────────────────────────────────────────

COMMENT ON TABLE financiera_periodos IS
  'Estado de cada mes del módulo Financiera: abierto (se recalcula a diario), cerrado (congelado por el usuario de Datos de flota cuando terminó de cargar y revisar el archivo contable) o reabierto (por el administrador, con motivo; se recalcula hasta que el usuario lo cierre otra vez).';

COMMENT ON FUNCTION financiera_consolidar_abiertos(TEXT) IS
  'Corrida diaria y botón Consolidar ahora: consolida desde ingreso_tercero todos los meses no cerrados, desde el primero del espejo hasta el mes del marcador de GEMA. No cierra ningún mes: el cierre es manual (financiera_cerrar_periodo).';

COMMENT ON FUNCTION financiera_cerrar_periodo(TEXT, TEXT) IS
  'Cierre manual de un mes desde Datos de flota: exige que GEMA haya pasado su último día, lo consolida una última vez, lo congela y deja en la bitácora quién cerró y la cobertura del archivo contable.';

COMMIT;

-- Verificación: los cerrados deben tener archivo contable completo.
SELECT p.periodo, p.estado, f.cobertura_contable, p.cerrado_por, p.reabierto_por_email
  FROM financiera_periodos p
  LEFT JOIN vw_financiera_flota_mes f ON f.periodo = p.periodo
 ORDER BY p.periodo DESC;
