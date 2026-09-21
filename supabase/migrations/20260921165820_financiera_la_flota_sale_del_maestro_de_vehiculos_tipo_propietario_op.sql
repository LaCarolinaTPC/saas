-- financiera la flota sale del maestro de vehiculos tipo propietario op
--
-- Contexto: la clasificación AFILIADO / EMPRESA («Flota» en el aplicativo de
-- Lovable) se estaba tomando de `ingreso_tercero.tipo_propietario`, que es el
-- tipo con el que GEMA liquidó ese día. No es lo mismo que la condición
-- operativa del bus, y las cifras lo demuestran.
--
-- Cotejo del 2026-09-21 sobre los 2.882 vehículo-mes que el aplicativo y
-- Gestivo comparten (2025-01 → 2026-08), usando como referencia la columna
-- `flota` del propio aplicativo, que es lo que el negocio viene reportando:
--
--   vehiculos.tipo_propietario_op      coincide en 2.877  (99,8 %)  ← correcto
--   ingreso_tercero.tipo_propietario   coincide en 2.104  (73,0 %)  ← lo que usábamos
--   vehiculos.tipo_propietario         coincide en 2.007  (69,6 %)
--
-- En el maestro los dos campos difieren en 60 de 202 vehículos:
-- `tipo_propietario` dice 188 AFILIADO / 14 EMPRESA y `tipo_propietario_op`
-- dice 128 / 74. El bus 500, por ejemplo, es EMPRESA en la operación y
-- AFILIADO en el otro campo; el aplicativo siempre lo mostró como EMPRESA.
--
-- Esta migración cambia el origen en tres sitios y NO mueve ningún importe:
-- solo reclasifica. Los ingresos, los costos y la utilidad quedan idénticos.
--
--   1. La vista lee la flota del maestro (efecto inmediato en las pantallas).
--   2. La función de consolidación la guarda desde el maestro de aquí en más.
--   3. Se corrigen las filas ya consolidadas, sin re-consolidar: así los meses
--      cerrados no se recalculan contra el espejo de hoy y sus cifras de
--      dinero no se tocan.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING). Correrlo dos veces deja lo mismo.
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto. Aquí no se crea ninguna tabla; los GRANT de la
-- vista y la función ya están en 20260921140156 y CREATE OR REPLACE los
-- conserva.

-- ── 1. Corregir lo ya consolidado ────────────────────────────────────────────
-- Un UPDATE en vez de re-consolidar: reescribir desde `ingreso_tercero`
-- volvería a calcular los meses cerrados contra el espejo de hoy, que tras la
-- re-sincronización de 45 días puede no ser el de entonces. Aquí solo cambia
-- la etiqueta de flota. El COALESCE deja el valor anterior si el bus no está
-- en el maestro o el campo viene vacío, para no crear nulos.

UPDATE financiera_operativo_mes o
   SET tipo_propietario = COALESCE(v.tipo_propietario_op, o.tipo_propietario),
       updated_at       = now()
  FROM vehiculos v
 WHERE v.codigo = o.codigo_vehiculo
   AND v.tipo_propietario_op IS NOT NULL
   AND v.tipo_propietario_op IS DISTINCT FROM o.tipo_propietario;

-- ── 2. La consolidación toma la flota del maestro ────────────────────────────
-- Igual que 20260921140156 salvo `tipo_propietario`, que ya no sale del
-- movimiento diario sino de `vehiculos.tipo_propietario_op`, con el valor de
-- GEMA como respaldo cuando el bus no está en el maestro.

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
  v_tot      JSONB;
  v_carga    UUID;
BEGIN
  IF p_periodo IS NULL OR p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Periodo invalido: %. Use AAAA-MM.', p_periodo;
  END IF;

  v_ini := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  v_fin := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::date;

  INSERT INTO financiera_periodos (periodo) VALUES (p_periodo)
  ON CONFLICT (periodo) DO NOTHING;

  SELECT estado INTO v_estado FROM financiera_periodos WHERE periodo = p_periodo;

  IF v_estado = 'cerrado' AND NOT p_forzar THEN
    RETURN jsonb_build_object('periodo', p_periodo, 'omitido', true, 'motivo', 'cerrado');
  END IF;

  INSERT INTO financiera_cargas (tipo, periodo, usuario_email, detalle)
  VALUES ('consolidar_gema', p_periodo, p_email,
          jsonb_build_object('estado_previo', v_estado, 'forzado', p_forzar))
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
      -- La flota es un atributo del vehículo, no del movimiento del día.
      COALESCE(v.tipo_propietario_op, a.tipo_gema),
      a.placa, a.placa_cambio, v.modelo,
      a.viajes, a.timbradas, a.ingresos, a.dias_con_produccion,
      a.fondo, a.poliza, a.prestamo, a.estudio, a.salario, a.combustible, a.rtica, a.admon, a.sitra,
      a.fet, a.valor_camb, a.incentivo_c, a.valor_descuentos,
      a.filas_origen, 'gema', v_carga
    FROM agg a
    LEFT JOIN vehiculos v ON v.codigo = a.codigo_vehiculo
    ON CONFLICT (periodo, codigo_vehiculo, cedula_propietario) DO UPDATE SET
      propietario_nombre  = EXCLUDED.propietario_nombre,
      tipo_propietario    = EXCLUDED.tipo_propietario,
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

-- ── 3. La vista lee la flota del maestro ─────────────────────────────────────
-- Con el maestro por delante, un cambio de clasificación se ve al instante en
-- las pantallas sin esperar a la consolidación. El valor consolidado queda de
-- respaldo para los buses que no estén en el maestro. Como la flota es del
-- vehículo, deja de existir el caso 'MIXTO'.
--
-- Definición vigente: copia de 20260921154738 con ese único cambio.

CREATE OR REPLACE VIEW vw_financiera_consolidado AS
WITH op AS (
  SELECT
    o.periodo,
    o.codigo_vehiculo,
    COUNT(*)::integer                              AS propietarios,
    CASE WHEN COUNT(*) = 1 THEN MAX(o.cedula_propietario) END AS cedula_propietario,
    CASE WHEN COUNT(*) = 1 THEN MAX(o.propietario_nombre) ELSE 'VARIOS' END AS propietario_nombre,
    CASE WHEN COUNT(DISTINCT o.tipo_propietario) = 1 THEN MAX(o.tipo_propietario) ELSE 'MIXTO' END AS tipo_consolidado,
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
    SUM(o.sitra)                                   AS sitra,
    SUM(o.fet)                                     AS fet,
    SUM(o.valor_camb)                              AS valor_camb,
    SUM(o.incentivo_c)                             AS incentivo_c,
    SUM(o.valor_descuentos)                        AS valor_descuentos,
    SUM(o.filas_origen)::integer                   AS filas_origen,
    MAX(o.updated_at)                              AS operativo_updated_at
  FROM financiera_operativo_mes o
  GROUP BY o.periodo, o.codigo_vehiculo
),
base AS (
  SELECT
    op.*,
    v.placa                                   AS placa_maestro,
    COALESCE(op.modelo, v.modelo)             AS modelo_efectivo,
    v.estado                                  AS estado_vehiculo,
    (v.estado = 1)                            AS vehiculo_activo,
    -- La flota sale del maestro; el consolidado es el respaldo.
    COALESCE(v.tipo_propietario_op, op.tipo_consolidado) AS tipo_propietario,
    p.estado                                  AS estado_periodo,
    p.cerrado_at,
    c.id IS NOT NULL                          AS tiene_contable,
    COALESCE(c.despacho, 0)                   AS despacho,
    COALESCE(c.intereses, 0)                  AS intereses,
    COALESCE(c.otros_gastos, 0)               AS otros_gastos,
    COALESCE(c.repuestos, 0)                  AS repuestos,
    COALESCE(c.mano_de_obra, 0)               AS mano_de_obra,
    COALESCE(c.desc_fondo_conductor, 0)       AS desc_fondo_conductor,
    COALESCE(c.celdas_vacias, 0)              AS celdas_vacias,
    c.updated_at                              AS contable_updated_at,
    (op.fondo + op.poliza + op.prestamo + op.estudio + op.salario
       + op.combustible + op.rtica + op.admon + op.sitra) AS gastos_gema,
    (COALESCE(c.despacho, 0) + COALESCE(c.intereses, 0) + COALESCE(c.otros_gastos, 0)
       + (COALESCE(c.repuestos, 0) - COALESCE(c.desc_fondo_conductor, 0))
       + COALESCE(c.mano_de_obra, 0))                    AS gastos_contables
  FROM op
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
  CASE WHEN c.tiene_contable THEN 'archivo' ELSE 'sin_dato' END AS origen_contable,
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
  (c.periodo || '|' || c.codigo_vehiculo)             AS id
FROM calc c;

COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados: gastos_operativos_totales, utilidad_neta, rentabilidad y gastos_por_timbrada, más la vista operativa (sin intereses). origen_contable = sin_dato marca la fila incompleta: su utilidad es un techo. tipo_propietario (la «Flota» AFILIADO/EMPRESA) sale de vehiculos.tipo_propietario_op, no del movimiento diario. `id` = periodo|codigo_vehiculo para el endpoint de detalle.';

COMMENT ON COLUMN financiera_operativo_mes.tipo_propietario IS
  'Flota del vehículo (AFILIADO/EMPRESA), tomada de vehiculos.tipo_propietario_op. No es el tipo con el que GEMA liquidó el día: ese difiere en el 27 % de los casos y no es lo que el negocio reporta.';

-- ── 4. Comprobación ──────────────────────────────────────────────────────────
-- El reparto debe acercarse al del maestro (128 AFILIADO / 74 EMPRESA sobre
-- 202 buses) y no al que había antes (~90 % AFILIADO). Ninguna cifra de
-- dinero cambia: el total de ingresos debe ser el mismo de antes de correr
-- esto.

SELECT tipo_propietario, COUNT(*) AS vehiculo_mes
  FROM vw_financiera_consolidado
 GROUP BY tipo_propietario
 ORDER BY vehiculo_mes DESC;

SELECT COUNT(*)            AS filas,
       SUM(ingresos)::bigint  AS ingresos_totales,
       SUM(utilidad_neta)::bigint AS utilidad_total
  FROM vw_financiera_consolidado;

SELECT o.tipo_propietario, COUNT(*) AS filas_operativo
  FROM financiera_operativo_mes o
 GROUP BY o.tipo_propietario
 ORDER BY filas_operativo DESC;
