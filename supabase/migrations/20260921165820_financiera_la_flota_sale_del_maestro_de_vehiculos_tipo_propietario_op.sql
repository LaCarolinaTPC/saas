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
--   vehiculos.tipo_propietario_op      coincide en 2.877  (99,8 %)
--   ingreso_tercero.tipo_propietario   coincide en 2.104  (73,0 %)  ← lo que usábamos
--   vehiculos.tipo_propietario         coincide en 2.007  (69,6 %)
--
-- En el maestro los dos campos difieren en 60 de 202 vehículos:
-- `tipo_propietario` dice 188 AFILIADO / 14 EMPRESA y `tipo_propietario_op`
-- dice 128 / 74. El bus 500, por ejemplo, es EMPRESA en la operación y
-- AFILIADO en el otro campo; el aplicativo siempre lo mostró como EMPRESA.
--
-- PERO el maestro solo guarda el estado de HOY. Entre 2025 y 2026 cambiaron de
-- propietario 25 de los 167 buses que han operado, así que aplicar la
-- clasificación de hoy a toda la historia reclasificaría meses en los que el
-- bus era de otra persona. De ahí el corte que fija esta migración:
--
--   · Desde 2026-09 (parámetro `financiera_flota_desde_maestro`): la flota sale
--     de `vehiculos.tipo_propietario_op`. Es el presente, y el maestro lo tiene
--     al día.
--   · Hasta 2026-08: se respeta lo que ya está guardado. Esos meses los
--     corrige `npm run financiera:historico -- --api --flota` con la columna
--     `flota` del aplicativo, que es la clasificación que regía entonces.
--
-- Esta migración NO mueve ningún importe: solo cambia de dónde sale una
-- etiqueta. Ingresos, costos y utilidad quedan idénticos.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING). Correrlo dos veces deja lo mismo.
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto. Aquí no se crea ninguna tabla; los GRANT de la
-- función ya están en 20260921140156 y CREATE OR REPLACE los conserva. La
-- vista no se toca: sigue leyendo la flota de lo consolidado, que es donde
-- ahora vive la regla.

-- ── 1. El corte, en un solo sitio ────────────────────────────────────────────
-- Primer período cuya flota se toma del maestro. Cambiarlo aquí cambia el
-- comportamiento de la consolidación sin tocar nada más. Es el mes siguiente
-- al último que trae el aplicativo de Lovable (2026-08).

CREATE OR REPLACE FUNCTION financiera_flota_desde_maestro()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fin_corte$
  SELECT '2026-09'::text;
$fin_corte$;

COMMENT ON FUNCTION financiera_flota_desde_maestro() IS
  'Primer período (AAAA-MM) cuya flota AFILIADO/EMPRESA se toma de vehiculos.tipo_propietario_op. Los anteriores conservan la clasificación que regía entonces, traída del aplicativo de Lovable: el maestro solo guarda el estado de hoy y 25 de 167 buses cambiaron de dueño entre 2025 y 2026.';

-- ── 2. La consolidación aplica el maestro solo desde el corte ────────────────
-- Igual que 20260921140156 salvo `tipo_propietario`. En los períodos
-- anteriores al corte, el ON CONFLICT conserva a propósito el valor guardado:
-- así, si alguien fuerza la re-consolidación de un mes viejo, no se le borra
-- la clasificación histórica.

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

-- ── 3. Corregir los períodos desde el corte ──────────────────────────────────
-- Solo de 2026-09 en adelante. Los anteriores los corrige el importador con
-- los datos del aplicativo; tocarlos aquí sería justo el error que se quiere
-- evitar.

UPDATE financiera_operativo_mes o
   SET tipo_propietario = COALESCE(v.tipo_propietario_op, o.tipo_propietario),
       updated_at       = now()
  FROM vehiculos v
 WHERE v.codigo = o.codigo_vehiculo
   AND o.periodo >= financiera_flota_desde_maestro()
   AND v.tipo_propietario_op IS NOT NULL
   AND v.tipo_propietario_op IS DISTINCT FROM o.tipo_propietario;

COMMENT ON COLUMN financiera_operativo_mes.tipo_propietario IS
  'Flota del vehículo (AFILIADO/EMPRESA). Desde el período que devuelve financiera_flota_desde_maestro() sale de vehiculos.tipo_propietario_op; en los meses anteriores es la clasificación que regía entonces, importada del aplicativo de Lovable. Nunca es el tipo con el que GEMA liquidó el día: ese difiere en el 27 % de los casos.';

-- ── 4. Comprobación ──────────────────────────────────────────────────────────
-- Lo esperado justo después de aplicar esto, antes de correr el importador:
-- los meses desde 2026-09 siguen al maestro y los anteriores todavía no. El
-- total de ingresos debe ser exactamente el de antes: aquí no se mueve dinero.

SELECT financiera_flota_desde_maestro() AS corte;

SELECT CASE WHEN o.periodo >= financiera_flota_desde_maestro() THEN 'desde el corte' ELSE 'histórico' END AS tramo,
       o.tipo_propietario,
       COUNT(*) AS filas
  FROM financiera_operativo_mes o
 GROUP BY 1, 2
 ORDER BY 1 DESC, 3 DESC;

SELECT COUNT(*) AS filas, SUM(ingresos)::bigint AS ingresos_totales
  FROM vw_financiera_consolidado;
