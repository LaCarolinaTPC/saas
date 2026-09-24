-- El reporte GEMA enero-agosto de 2026 difiere del consolidado de Gestivo
-- exactamente en 32.752.687 de bruto, 9.690 timbradas y 181 viajes.
-- El 2026-07-26, pa_ext_get_IngresoTerceroByFecha entregó 150 cierres
-- INDIVIDUAL y 150 cierres CU de las mismas operaciones. El reporte de GEMA
-- toma CU; Gestivo sumaba ambos porque la llave del espejo incluye grupo.
-- Se conserva ingreso_tercero intacto y se excluye INDIVIDUAL solo cuando
-- existe la contraparte CU de ese mismo día, vehículo, conductor, propietario,
-- ruta, viajes y timbradas. La regla protege futuras consolidaciones.
--
-- El bloque correctivo toma versión, reabre y recalcula julio de 2026 y lo
-- devuelve a cerrado. Solo actúa cuando su ingreso operativo no coincide con
-- el bruto deduplicado del espejo. Si la fuente cambió desde la verificación,
-- aborta antes de tocar un período reportado para exigir una nueva revisión.

BEGIN;

CREATE OR REPLACE FUNCTION financiera_consolidar_periodo(
  p_periodo TEXT,
  p_forzar  BOOLEAN DEFAULT false,
  p_email   TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fin_consolidar$
DECLARE
  v_estado   TEXT;
  v_ini      DATE;
  v_fin      DATE;
  v_filas    INTEGER := 0;
  v_borradas INTEGER := 0;
  v_maestro  BOOLEAN;
  v_tot      JSONB;
  v_carga    UUID;
BEGIN
  IF p_periodo IS NULL OR p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Periodo invalido: %. Use AAAA-MM.', p_periodo;
  END IF;

  v_ini := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  v_fin := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_maestro := p_periodo >= financiera_flota_desde_maestro();

  INSERT INTO financiera_periodos (periodo) VALUES (p_periodo)
  ON CONFLICT (periodo) DO NOTHING;

  SELECT estado INTO v_estado FROM financiera_periodos WHERE periodo = p_periodo;

  IF v_estado = 'cerrado' AND NOT p_forzar THEN
    RETURN jsonb_build_object('periodo', p_periodo, 'omitido', true, 'motivo', 'cerrado');
  END IF;

  INSERT INTO financiera_cargas (tipo, periodo, usuario_email, detalle)
  VALUES ('consolidar_gema', p_periodo, p_email,
          jsonb_build_object('estado_previo', v_estado, 'forzado', p_forzar,
                             'flota_desde_maestro', v_maestro))
  RETURNING id INTO v_carga;

  WITH dias AS (
    SELECT
      i.codigo_vehiculo,
      COALESCE(i.cedula_propietario, '') AS cedula_propietario,
      i.fecha, i.placa, i.propietario_nombre, i.tipo_propietario,
      COALESCE(i.viajes, 0)           AS viajes,
      COALESCE(i.timbradas, 0)        AS timbradas,
      COALESCE(i.bruto, 0)            AS bruto,
      COALESCE(i.cartu_fondo, 0)      AS fondo,
      COALESCE(i.cartu_poliza, 0)     AS poliza,
      COALESCE(i.cartu_presta, 0)     AS prestamo,
      COALESCE(i.cartu_estudio, 0)    AS estudio,
      COALESCE(i.salario, 0)          AS salario,
      COALESCE(i.combustible, 0)      AS combustible,
      COALESCE(i.rtica, 0)            AS rtica,
      COALESCE(i.admon, 0)            AS admon,
      COALESCE(i.sitra, 0)            AS sitra,
      COALESCE(i.fet, 0)              AS fet,
      COALESCE(i.valor_camb, 0)       AS valor_camb,
      COALESCE(i.incentivo_c, 0)      AS incentivo_c,
      COALESCE(i.valor_descuentos, 0) AS valor_descuentos
    FROM ingreso_tercero i
    WHERE i.fecha BETWEEN v_ini AND v_fin
      AND i.codigo_vehiculo IS NOT NULL
      AND i.codigo_vehiculo <> ''
      -- GEMA puede devolver la misma operación en cierre INDIVIDUAL y CU.
      -- Cuando coinciden día, vehículo, conductor, propietario, ruta, viajes
      -- y timbradas, el reporte de GEMA conserva CU; sumar ambos duplica
      -- ingresos y todos los rubros operativos. El espejo crudo se conserva.
      AND NOT (
        COALESCE(i.tipo_cierre, '') = 'INDIVIDUAL'
        AND EXISTS (
          SELECT 1 FROM ingreso_tercero cu
           WHERE cu.fecha = i.fecha
             AND cu.codigo_vehiculo = i.codigo_vehiculo
             AND cu.cedula_conductor IS NOT DISTINCT FROM i.cedula_conductor
             AND cu.cedula_propietario IS NOT DISTINCT FROM i.cedula_propietario
             AND cu.ruta IS NOT DISTINCT FROM i.ruta
             AND cu.viajes IS NOT DISTINCT FROM i.viajes
             AND cu.timbradas IS NOT DISTINCT FROM i.timbradas
             AND cu.tipo_cierre LIKE 'CU (%'
        )
      )
  ),
  agg AS (
    SELECT
      d.codigo_vehiculo,
      d.cedula_propietario,
      (array_agg(d.propietario_nombre ORDER BY d.fecha DESC))[1] AS propietario_nombre,
      (array_agg(d.tipo_propietario   ORDER BY d.fecha DESC))[1] AS tipo_gema,
      (array_agg(d.placa              ORDER BY d.fecha DESC))[1] AS placa,
      (COUNT(DISTINCT d.placa) > 1)                             AS placa_cambio,
      SUM(d.viajes)            AS viajes,
      SUM(d.timbradas)         AS timbradas,
      SUM(d.bruto)             AS ingresos,
      COUNT(DISTINCT d.fecha)::integer AS dias_con_produccion,
      SUM(d.fondo)             AS fondo,
      SUM(d.poliza)            AS poliza,
      SUM(d.prestamo)          AS prestamo,
      SUM(d.estudio)           AS estudio,
      SUM(d.salario)           AS salario,
      SUM(d.combustible)       AS combustible,
      SUM(d.rtica)             AS rtica,
      SUM(d.admon)             AS admon,
      SUM(d.sitra)             AS sitra,
      SUM(d.fet)               AS fet,
      SUM(d.valor_camb)        AS valor_camb,
      SUM(d.incentivo_c)       AS incentivo_c,
      SUM(d.valor_descuentos)  AS valor_descuentos,
      COUNT(*)::integer        AS filas_origen
    FROM dias d
    GROUP BY d.codigo_vehiculo, d.cedula_propietario
  ),
  up AS (
    INSERT INTO financiera_operativo_mes (
      periodo, codigo_vehiculo, cedula_propietario, propietario_nombre,
      tipo_propietario, placa, placa_cambio, modelo,
      viajes, timbradas, ingresos, dias_con_produccion,
      fondo, poliza, prestamo, estudio, salario, combustible, rtica, admon, sitra,
      fet, valor_camb, incentivo_c, valor_descuentos,
      filas_origen, origen, carga_id
    )
    SELECT
      p_periodo, a.codigo_vehiculo, a.cedula_propietario, a.propietario_nombre,
      -- Desde el corte, la flota es el atributo operativo del vehículo en el
      -- maestro. Antes del corte se usa lo que dijo GEMA ese día como punto de
      -- partida; el histórico real lo escribe el importador del aplicativo.
      CASE WHEN v_maestro THEN COALESCE(v.tipo_propietario_op, a.tipo_gema) ELSE a.tipo_gema END,
      a.placa, a.placa_cambio, v.modelo,
      a.viajes, a.timbradas, a.ingresos, a.dias_con_produccion,
      a.fondo, a.poliza, a.prestamo, a.estudio, a.salario, a.combustible, a.rtica, a.admon, a.sitra,
      a.fet, a.valor_camb, a.incentivo_c, a.valor_descuentos,
      a.filas_origen, 'gema', v_carga
    FROM agg a
    LEFT JOIN vehiculos v ON v.codigo = a.codigo_vehiculo
    ON CONFLICT (periodo, codigo_vehiculo, cedula_propietario) DO UPDATE SET
      propietario_nombre  = EXCLUDED.propietario_nombre,
      -- Antes del corte NO se pisa: la clasificación histórica vino del
      -- aplicativo y una re-consolidación no debe borrarla.
      tipo_propietario    = CASE WHEN v_maestro THEN EXCLUDED.tipo_propietario
                                 ELSE financiera_operativo_mes.tipo_propietario END,
      placa               = EXCLUDED.placa,
      placa_cambio        = EXCLUDED.placa_cambio,
      modelo              = COALESCE(EXCLUDED.modelo, financiera_operativo_mes.modelo),
      viajes              = EXCLUDED.viajes,
      timbradas           = EXCLUDED.timbradas,
      ingresos            = EXCLUDED.ingresos,
      dias_con_produccion = EXCLUDED.dias_con_produccion,
      fondo               = EXCLUDED.fondo,
      poliza              = EXCLUDED.poliza,
      prestamo            = EXCLUDED.prestamo,
      estudio             = EXCLUDED.estudio,
      salario             = EXCLUDED.salario,
      combustible         = EXCLUDED.combustible,
      rtica               = EXCLUDED.rtica,
      admon               = EXCLUDED.admon,
      sitra               = EXCLUDED.sitra,
      fet                 = EXCLUDED.fet,
      valor_camb          = EXCLUDED.valor_camb,
      incentivo_c         = EXCLUDED.incentivo_c,
      valor_descuentos    = EXCLUDED.valor_descuentos,
      filas_origen        = EXCLUDED.filas_origen,
      origen              = 'gema',
      carga_id            = EXCLUDED.carga_id,
      updated_at          = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_filas FROM up;

  DELETE FROM financiera_operativo_mes o
  WHERE o.periodo = p_periodo
    AND o.origen = 'gema'
    AND NOT EXISTS (
      SELECT 1 FROM ingreso_tercero i
      WHERE i.fecha BETWEEN v_ini AND v_fin
        AND i.codigo_vehiculo = o.codigo_vehiculo
        AND COALESCE(i.cedula_propietario, '') = o.cedula_propietario
    );
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  UPDATE financiera_periodos
     SET consolidado_at = now()
   WHERE periodo = p_periodo;

  SELECT jsonb_build_object(
           'vehiculos',   COUNT(DISTINCT codigo_vehiculo),
           'filas',       COUNT(*),
           'viajes',      COALESCE(SUM(viajes), 0),
           'timbradas',   COALESCE(SUM(timbradas), 0),
           'ingresos',    COALESCE(SUM(ingresos), 0),
           'gastos_gema', COALESCE(SUM(fondo + poliza + prestamo + estudio + salario
                                       + combustible + rtica + admon + sitra), 0)
         )
    INTO v_tot
    FROM financiera_operativo_mes
   WHERE periodo = p_periodo;

  UPDATE financiera_cargas
     SET filas   = v_filas,
         detalle = detalle || v_tot || jsonb_build_object('borradas', v_borradas)
   WHERE id = v_carga;

  RETURN jsonb_build_object('periodo', p_periodo, 'omitido', false,
                            'filas', v_filas, 'borradas', v_borradas, 'carga_id', v_carga)
         || v_tot;
END;
$fin_consolidar$;

COMMENT ON FUNCTION financiera_consolidar_periodo(TEXT, BOOLEAN, TEXT) IS
  'Consolida ingreso_tercero por vehículo, mes y propietario. Si GEMA devuelve la misma operación en cierre INDIVIDUAL y CU, conserva CU para no duplicar viajes, timbradas, ingresos ni costos; el espejo crudo permanece intacto.';

DO $fin_corregir$
DECLARE
  v_filas integer;
  v_bruto numeric;
  v_timbradas numeric;
  v_viajes numeric;
  v_actual numeric;
  v_esperado numeric;
  v_despues numeric;
  v_viajes_despues numeric;
  v_timbradas_despues numeric;
  v_estado text;
  v_resultado jsonb;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(i.bruto), 0), COALESCE(SUM(i.timbradas), 0), COALESCE(SUM(i.viajes), 0)
    INTO v_filas, v_bruto, v_timbradas, v_viajes
    FROM ingreso_tercero i
   WHERE i.fecha = DATE '2026-07-26'
     AND i.tipo_cierre = 'INDIVIDUAL'
     AND EXISTS (
       SELECT 1 FROM ingreso_tercero cu
        WHERE cu.fecha = i.fecha
          AND cu.codigo_vehiculo = i.codigo_vehiculo
          AND cu.cedula_conductor IS NOT DISTINCT FROM i.cedula_conductor
          AND cu.cedula_propietario IS NOT DISTINCT FROM i.cedula_propietario
          AND cu.ruta IS NOT DISTINCT FROM i.ruta
          AND cu.viajes IS NOT DISTINCT FROM i.viajes
          AND cu.timbradas IS NOT DISTINCT FROM i.timbradas
          AND cu.tipo_cierre LIKE 'CU (%'
     );
  IF (v_filas, v_bruto, v_timbradas, v_viajes) IS DISTINCT FROM
     (150, 32752687::numeric, 9690::numeric, 181::numeric) THEN
    RAISE EXCEPTION 'La fuente del 26 de julio cambió: % filas, % bruto, % timbradas, % viajes. Revisar antes de corregir.',
      v_filas, v_bruto, v_timbradas, v_viajes;
  END IF;

  SELECT COALESCE(SUM(ingresos), 0) INTO v_actual
    FROM financiera_operativo_mes WHERE periodo = '2026-07';
  SELECT COALESCE(SUM(COALESCE(i.bruto, 0)), 0) INTO v_esperado
    FROM ingreso_tercero i
   WHERE i.fecha BETWEEN DATE '2026-07-01' AND DATE '2026-07-31'
     AND i.codigo_vehiculo IS NOT NULL AND i.codigo_vehiculo <> ''
     AND NOT (
       COALESCE(i.tipo_cierre, '') = 'INDIVIDUAL'
       AND EXISTS (
         SELECT 1 FROM ingreso_tercero cu
          WHERE cu.fecha = i.fecha
            AND cu.codigo_vehiculo = i.codigo_vehiculo
            AND cu.cedula_conductor IS NOT DISTINCT FROM i.cedula_conductor
            AND cu.cedula_propietario IS NOT DISTINCT FROM i.cedula_propietario
            AND cu.ruta IS NOT DISTINCT FROM i.ruta
            AND cu.viajes IS NOT DISTINCT FROM i.viajes
            AND cu.timbradas IS NOT DISTINCT FROM i.timbradas
            AND cu.tipo_cierre LIKE 'CU (%'
       )
     );
  IF v_esperado <> 2520513895 THEN
    RAISE EXCEPTION 'El bruto deduplicado de julio cambió: %, esperado: 2520513895. Revisar antes de corregir.', v_esperado;
  END IF;
  IF v_actual = v_esperado THEN RETURN; END IF;
  IF v_actual <> 2553266582 THEN
    RAISE EXCEPTION 'El ingreso consolidado de julio cambió: %, esperado antes: 2553266582. Revisar antes de corregir.', v_actual;
  END IF;

  SELECT estado INTO v_estado FROM financiera_periodos WHERE periodo = '2026-07';
  IF v_estado IS NULL THEN RAISE EXCEPTION 'No existe el período 2026-07 en Financiera'; END IF;
  IF v_estado = 'cerrado' THEN
    PERFORM financiera_reabrir_periodo('2026-07', 'migracion',
      'Excluir cierre INDIVIDUAL duplicado del 26 de julio de 2026; conciliación con reporte GEMA');
  END IF;

  v_resultado := financiera_consolidar_periodo('2026-07', false, 'migracion');
  IF COALESCE((v_resultado->>'omitido')::boolean, false) THEN
    RAISE EXCEPTION 'La consolidación de 2026-07 fue omitida: %', v_resultado;
  END IF;
  SELECT COALESCE(SUM(ingresos), 0), COALESCE(SUM(viajes), 0), COALESCE(SUM(timbradas), 0)
    INTO v_despues, v_viajes_despues, v_timbradas_despues
    FROM financiera_operativo_mes WHERE periodo = '2026-07';
  IF (v_despues, v_viajes_despues, v_timbradas_despues) IS DISTINCT FROM
     (v_esperado, 10641::numeric, 766710::numeric) THEN
    RAISE EXCEPTION 'Julio después de consolidar: ingresos %, viajes %, timbradas %. Esperados: %, 10641, 766710.',
      v_despues, v_viajes_despues, v_timbradas_despues, v_esperado;
  END IF;

  IF v_estado = 'cerrado' THEN
    UPDATE financiera_periodos
       SET estado = 'cerrado', cerrado_at = now(), cerrado_por = 'migracion:duplicado_2026-07-26'
     WHERE periodo = '2026-07';
    INSERT INTO financiera_cargas (tipo, periodo, usuario_email, detalle)
    VALUES ('cerrar_periodo', '2026-07', 'migracion',
      jsonb_build_object('motivo', 'Corrección de doble cierre GEMA 2026-07-26',
                         'ingresos_antes', v_actual, 'ingresos_despues', v_despues,
                         'filas_individual_excluidas', v_filas));
  END IF;
END;
$fin_corregir$;

GRANT EXECUTE ON FUNCTION financiera_consolidar_periodo(TEXT, BOOLEAN, TEXT) TO service_role;

COMMIT;

SELECT periodo, estado, cerrado_at FROM financiera_periodos WHERE periodo = '2026-07';
SELECT periodo, viajes, timbradas, ingresos, gastos_gema, gastos_contables, utilidad_neta
  FROM vw_financiera_flota_mes WHERE periodo = '2026-07';
SELECT SUM(viajes) AS viajes_enero_agosto,
       SUM(timbradas) AS timbradas_enero_agosto,
       SUM(ingresos) AS ingresos_enero_agosto
  FROM vw_financiera_flota_mes
 WHERE periodo BETWEEN '2026-01' AND '2026-08';
