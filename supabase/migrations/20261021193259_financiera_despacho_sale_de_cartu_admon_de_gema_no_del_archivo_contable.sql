-- DESPACHO sale de GEMA (ingreso_tercero.cartu_admon), no del archivo contable.
--
-- Contexto (verificado el 2026-10-21 contra Supabase):
--   El rubro DESPACHO de Gestión Resultado Flota se modeló como columna del
--   archivo contable. En realidad coincide AL PESO con SUM(cartu_admon) de
--   ingreso_tercero, que ya viene de GEMA pero el consolidado ignoraba a
--   propósito ("ADMON = SUM(admon)... NUNCA cartu_admon").
--
--     | período | SUM(cartu_admon) deduplicado | despacho del archivo |
--     |---------|------------------------------|----------------------|
--     | 2026-07 | 550.784.000 (tras excluir el doble cierre del 26-jul) | 550.784.000 |
--     | 2026-08 | 545.792.000                  | 545.792.000 (igual)  |
--     | 2026-09 | 536.960.000                  | 0  (archivo sin la columna) |
--     | 2026-10 | 332.032.000                  | 0                    |
--
--   Por eso sep/oct 2026 mostraban Despacho en cero: el archivo contable llegó
--   con esa columna vacía, aunque el dato SÍ está en GEMA (cartu_admon).
--
--   admon (2,5 % del bruto) es OTRO campo: no hay doble conteo con cartu_admon,
--   que hoy no entra en ningún costo del consolidado.
--
-- Qué hace esta migración:
--   1. Agrega financiera_operativo_mes.despacho.
--   2. financiera_consolidar_periodo: lo llena con SUM(cartu_admon) (misma
--      deduplicación INDIVIDUAL/CU que el resto de rubros operativos).
--   3. vw_financiera_consolidado: despacho sale del operativo (GEMA) y pasa de
--      gastos_contables a gastos_gema. Deja de leer financiera_contable_mes.despacho.
--   4. Re-consolida todos los períodos para poblar el nuevo campo (idempotente).
--
--   El archivo contable sigue trayendo la columna despacho por ahora; el
--   consolidado ya NO la usa. Quitarla del parser es la Fase 2 (código).
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

BEGIN;

-- =============================================================================
-- 1. Columna nueva en el operativo
-- =============================================================================
ALTER TABLE financiera_operativo_mes
  ADD COLUMN IF NOT EXISTS despacho NUMERIC(16,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN financiera_operativo_mes.despacho IS
  'Despacho del vehículo-mes = SUM(ingreso_tercero.cartu_admon) de GEMA, deduplicando INDIVIDUAL/CU. Reemplaza al rubro despacho del archivo contable.';

-- =============================================================================
-- 2. Consolidación: despacho = SUM(cartu_admon)
-- =============================================================================
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
      COALESCE(i.cartu_admon, 0)      AS despacho,
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
      SUM(d.despacho)          AS despacho,
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
      fondo, poliza, prestamo, estudio, salario, combustible, rtica, admon, despacho, sitra,
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
      a.fondo, a.poliza, a.prestamo, a.estudio, a.salario, a.combustible, a.rtica, a.admon, a.despacho, a.sitra,
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
      despacho            = EXCLUDED.despacho,
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
                                       + combustible + rtica + admon + despacho + sitra), 0)
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
  'Consolida ingreso_tercero por vehículo, mes y propietario. despacho = SUM(cartu_admon). Si GEMA devuelve la misma operación en cierre INDIVIDUAL y CU, conserva CU para no duplicar viajes, timbradas, ingresos ni costos; el espejo crudo permanece intacto.';

GRANT EXECUTE ON FUNCTION financiera_consolidar_periodo(TEXT, BOOLEAN, TEXT) TO service_role;

-- =============================================================================
-- 3. Vista consolidada: despacho desde el operativo (GEMA), en gastos_gema
-- =============================================================================
CREATE OR REPLACE VIEW vw_financiera_consolidado AS
WITH op AS (
  SELECT
    o.periodo,
    o.codigo_vehiculo,
    COUNT(*)::integer                              AS propietarios,
    CASE WHEN COUNT(*) = 1 THEN MAX(o.cedula_propietario) END AS cedula_propietario,
    CASE WHEN COUNT(*) = 1 THEN MAX(o.propietario_nombre) ELSE 'VARIOS' END AS propietario_nombre,
    CASE WHEN COUNT(DISTINCT o.tipo_propietario) = 1 THEN MAX(o.tipo_propietario) ELSE 'MIXTO' END AS tipo_propietario,
    (array_agg(o.placa ORDER BY o.dias_con_produccion DESC, o.updated_at DESC))[1] AS placa,
    (BOOL_OR(o.placa_cambio) OR COUNT(DISTINCT o.placa) > 1)  AS placa_cambio,
    MAX(o.modelo)                                  AS modelo,
    SUM(o.viajes)                                  AS viajes,
    SUM(o.timbradas)                               AS timbradas,
    SUM(o.ingresos)                                AS ingresos,
    SUM(o.dias_con_produccion)::integer            AS dias_con_produccion,
    SUM(o.fondo)                                   AS fondo,
    SUM(o.poliza)                                  AS poliza,
    SUM(o.prestamo)                                AS prestamo,
    SUM(o.estudio)                                 AS estudio,
    SUM(o.salario)                                 AS salario,
    SUM(o.combustible)                             AS combustible,
    SUM(o.rtica)                                   AS rtica,
    SUM(o.admon)                                   AS admon,
    SUM(o.despacho)                                AS despacho,
    SUM(o.sitra)                                   AS sitra,
    SUM(o.fet)                                     AS fet,
    SUM(o.valor_camb)                              AS valor_camb,
    SUM(o.incentivo_c)                             AS incentivo_c,
    SUM(o.valor_descuentos)                        AS valor_descuentos,
    SUM(o.filas_origen)::integer                   AS filas_origen,
    MAX(o.updated_at)                              AS operativo_updated_at,
    false                                          AS sin_operacion
  FROM financiera_operativo_mes o
  GROUP BY o.periodo, o.codigo_vehiculo
),
-- Filas contables sin fila en GEMA: mismas columnas que `op`, en el mismo orden.
solo_contable AS (
  SELECT
    c.periodo,
    c.codigo_vehiculo,
    1                                              AS propietarios,
    d.cedula_propietario,
    d.propietario_nombre,
    COALESCE(v.tipo_propietario_op, d.tipo_propietario) AS tipo_propietario,
    COALESCE(v.placa, d.placa)                     AS placa,
    false                                          AS placa_cambio,
    d.modelo,
    0::numeric                                     AS viajes,
    0::numeric                                     AS timbradas,
    0::numeric                                     AS ingresos,
    0                                              AS dias_con_produccion,
    0::numeric AS fondo, 0::numeric AS poliza, 0::numeric AS prestamo, 0::numeric AS estudio,
    0::numeric AS salario, 0::numeric AS combustible, 0::numeric AS rtica, 0::numeric AS admon,
    0::numeric AS despacho,
    0::numeric AS sitra, 0::numeric AS fet, 0::numeric AS valor_camb, 0::numeric AS incentivo_c,
    0::numeric AS valor_descuentos,
    0                                              AS filas_origen,
    NULL::timestamptz                              AS operativo_updated_at,
    true                                           AS sin_operacion
  FROM financiera_contable_mes c
  LEFT JOIN vehiculos v ON v.codigo = c.codigo_vehiculo
  LEFT JOIN LATERAL (
    -- El dueño del último mes en que operó; si nunca operó antes, el del primero después.
    SELECT o.cedula_propietario, o.propietario_nombre, o.tipo_propietario, o.placa, o.modelo
      FROM financiera_operativo_mes o
     WHERE o.codigo_vehiculo = c.codigo_vehiculo
     ORDER BY (o.periodo > c.periodo),
              CASE WHEN o.periodo < c.periodo THEN o.periodo END DESC,
              o.periodo,
              o.dias_con_produccion DESC,
              o.updated_at DESC
     LIMIT 1
  ) d ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM financiera_operativo_mes o
     WHERE o.periodo = c.periodo AND o.codigo_vehiculo = c.codigo_vehiculo
  )
),
filas AS (
  SELECT * FROM op
  UNION ALL
  SELECT * FROM solo_contable
),
base AS (
  SELECT
    op.*,
    v.placa                                   AS placa_maestro,
    COALESCE(op.modelo, v.modelo)             AS modelo_efectivo,
    v.estado                                  AS estado_vehiculo,
    (v.estado = 1)                            AS vehiculo_activo,
    p.estado                                  AS estado_periodo,
    p.cerrado_at,
    c.id IS NOT NULL                          AS tiene_contable,
    BOOL_OR(c.id IS NOT NULL) OVER (PARTITION BY op.periodo) AS mes_con_archivo,
    COALESCE(c.intereses, 0)                  AS intereses,
    COALESCE(c.otros_gastos, 0)               AS otros_gastos,
    COALESCE(c.repuestos, 0)                  AS repuestos,
    COALESCE(c.mano_de_obra, 0)               AS mano_de_obra,
    COALESCE(c.desc_fondo_conductor, 0)       AS desc_fondo_conductor,
    COALESCE(c.combustible_vehiculos_nuevos, 0) AS combustible_vehiculos_nuevos,
    COALESCE(c.poliza_vehiculos_nuevos, 0)      AS poliza_vehiculos_nuevos,
    COALESCE(c.recuperacion_combustible_gn, 0)  AS recuperacion_combustible_gn,
    COALESCE(c.celdas_vacias, 0)              AS celdas_vacias,
    c.updated_at                              AS contable_updated_at,
    -- despacho ahora es GEMA (op.despacho = SUM(cartu_admon)): entra en gastos_gema.
    (op.fondo + op.poliza + op.prestamo + op.estudio + op.salario
       + op.combustible + op.rtica + op.admon + op.despacho + op.sitra) AS gastos_gema,
    (COALESCE(c.intereses, 0) + COALESCE(c.otros_gastos, 0)
       + (COALESCE(c.repuestos, 0) - COALESCE(c.desc_fondo_conductor, 0))
       + COALESCE(c.mano_de_obra, 0)
       + COALESCE(c.combustible_vehiculos_nuevos, 0)
       + COALESCE(c.poliza_vehiculos_nuevos, 0)
       - COALESCE(c.recuperacion_combustible_gn, 0))     AS gastos_contables
  FROM filas op
  LEFT JOIN financiera_contable_mes c
         ON c.periodo = op.periodo AND c.codigo_vehiculo = op.codigo_vehiculo
  LEFT JOIN vehiculos v ON v.codigo = op.codigo_vehiculo
  LEFT JOIN financiera_periodos p ON p.periodo = op.periodo
),
calc AS (
  SELECT
    b.*,
    (b.gastos_gema + b.gastos_contables)              AS gastos_operativos_totales,
    (b.ingresos - b.gastos_gema - b.gastos_contables)  AS utilidad_neta
  FROM base b
)
SELECT
  c.periodo,
  c.codigo_vehiculo,
  c.propietarios,
  c.cedula_propietario,
  c.propietario_nombre,
  c.tipo_propietario,
  c.placa,
  c.placa_cambio,
  c.placa_maestro,
  c.modelo_efectivo                                   AS modelo,
  c.estado_vehiculo,
  c.vehiculo_activo,
  c.estado_periodo,
  c.cerrado_at,
  c.viajes,
  c.timbradas,
  c.ingresos,
  c.dias_con_produccion,
  c.fondo, c.poliza, c.prestamo, c.estudio, c.salario,
  c.combustible, c.rtica, c.admon, c.sitra,
  c.fet, c.valor_camb, c.incentivo_c, c.valor_descuentos,
  c.despacho, c.intereses, c.otros_gastos, c.repuestos,
  c.mano_de_obra, c.desc_fondo_conductor,
  (c.repuestos - c.desc_fondo_conductor)              AS repuestos_netos,
  c.celdas_vacias,
  CASE WHEN c.sin_operacion THEN 'solo_contable'
       WHEN c.tiene_contable THEN 'archivo'
       WHEN c.mes_con_archivo AND c.viajes = 0 AND c.ingresos = 0 AND c.timbradas = 0
            THEN 'sin_movimiento'
       ELSE 'sin_dato' END                            AS origen_contable,
  c.gastos_gema,
  c.gastos_contables,
  c.gastos_operativos_totales,
  c.utilidad_neta,
  CASE WHEN c.ingresos > 0
       THEN c.utilidad_neta / c.ingresos * 100 ELSE 0 END      AS rentabilidad,
  CASE WHEN c.timbradas > 0
       THEN c.gastos_operativos_totales / c.timbradas ELSE 0 END AS gastos_por_timbrada,
  (c.utilidad_neta + c.intereses)                              AS utilidad_operativa,
  CASE WHEN c.ingresos > 0
       THEN (c.utilidad_neta + c.intereses) / c.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN c.timbradas > 0
       THEN (c.gastos_operativos_totales - c.intereses) / c.timbradas ELSE 0 END AS gastos_por_timbrada_operativo,
  c.filas_origen,
  c.operativo_updated_at,
  c.contable_updated_at,
  (c.periodo || '|' || c.codigo_vehiculo)             AS id,
  -- Al final, que CREATE OR REPLACE VIEW solo admite columnas nuevas ahí.
  c.combustible_vehiculos_nuevos,
  c.poliza_vehiculos_nuevos,
  c.sin_operacion,
  c.recuperacion_combustible_gn
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados. despacho sale de GEMA (SUM(cartu_admon) de ingreso_tercero) y entra en gastos_gema. origen_contable: archivo = fila contable con GEMA; solo_contable = fila contable sin GEMA; sin_movimiento = no vino en el archivo del mes pero no hizo viajes ni tuvo ingresos; sin_dato = falta el archivo. sin_operacion = true si no hay fila en GEMA. gastos_contables incluye combustible y póliza de vehículos nuevos y RESTA recuperacion_combustible_gn. id = periodo|codigo_vehiculo.';

-- =============================================================================
-- 4. Re-consolidar todos los períodos para poblar despacho (idempotente)
--    forzar=true: repasa meses cerrados sin cambiar su estado; el espejo manda.
-- =============================================================================
DO $reconsolidar$
DECLARE
  v_periodo text;
BEGIN
  FOR v_periodo IN
    SELECT DISTINCT periodo FROM financiera_operativo_mes ORDER BY periodo
  LOOP
    PERFORM financiera_consolidar_periodo(v_periodo, true, 'migracion:despacho_cartu_admon');
  END LOOP;
END;
$reconsolidar$;

COMMIT;

-- ── Comprobación ─────────────────────────────────────────────────────────────
-- despacho del consolidado vs. el que traía el archivo contable (debe cuadrar
-- donde el archivo tenía dato; sep/oct pasan de 0 al valor de GEMA).
SELECT o.periodo,
       SUM(o.despacho)                    AS despacho_gema,
       COALESCE(c.despacho_archivo, 0)    AS despacho_archivo
  FROM financiera_operativo_mes o
  LEFT JOIN (
    SELECT periodo, SUM(despacho) AS despacho_archivo
      FROM financiera_contable_mes GROUP BY periodo
  ) c ON c.periodo = o.periodo
 GROUP BY o.periodo, c.despacho_archivo
 ORDER BY o.periodo;
