-- modulo financiera consolidado mensual y cargas
--
-- Contexto: el aplicativo `lacarolinagestionflota` (Lovable) calcula la
-- rentabilidad de la flota a partir de un Excel de 26 columnas por vehículo y
-- mes. Al homologarlo contra el espejo `ingreso_tercero` que Gestivo ya
-- sincroniza de GEMA (docs/Plan_desarrollo_financiera_GESTIVO.md, sección 3)
-- resultó que 18 columnas salen del espejo, 1 del maestro de vehículos y 6 no
-- existen en GEMA por ninguna vía (DESPACHO, INTERESES, OTROS GASTOS,
-- Repuestos, Mano de Obra y Desc. Fondo-conductor). Esas seis entran en el
-- gasto total, así que la utilidad NO se puede calcular solo con el espejo.
--
-- Esta migración es la Fase 2 del plan y fija el modelo de fuente dual:
--   * `financiera_operativo_mes`  producción y rubros de GEMA, una fila por
--                                 período + vehículo + propietario (acta
--                                 2026-09-18, puntos 9 y 11: el dueño se
--                                 conserva tal cual venía; los retirados entran).
--   * `financiera_contable_mes`   los seis rubros del archivo, una fila por
--                                 período + vehículo (punto 10: son del
--                                 vehículo, no del dueño; no se prorratean).
--   * `financiera_periodos`       estado del mes. El cierre lo marca GEMA, no
--                                 un usuario (punto 13): cuando el marcador del
--                                 sync pasó el último día del mes, se congela.
--   * `financiera_cargas`         bitácora de toda operación (sustituye a
--                                 `data_upload_audit` del aplicativo).
--   * `financiera_parametros`     umbrales de semáforo, hoy quemados en
--                                 `fleetUtils.ts` del aplicativo.
--   * `financiera_periodos_versiones`  copia de las cifras antes de reabrir.
--   * `vw_financiera_consolidado` vehículo-mes con los indicadores calculados
--                                 (no se guardan: punto 6.1-c del plan).
--   * `vw_financiera_flota_mes`   totales de flota por mes, promedio ponderado.
--   * funciones de consolidación día → mes (punto 14: función SQL, diaria,
--                                 solo meses abiertos) y de cierre/reapertura.
--
-- Decisiones del acta que el SQL fija y que NO deben cambiarse a la ligera:
--   * Ingresos = SUM(bruto).                                  (punto 1)
--   * ADMON = SUM(admon), el 2,5 % del bruto. NUNCA cartu_admon (punto 2):
--     difieren ~426 M al mes y es el error más caro posible aquí.
--   * TIM. = SUM(timbradas), no timbradas_cu.                  (punto 5)
--   * FONDO/POLIZA/PRESTA./ESTUD. = cartu_fondo/cartu_poliza/cartu_presta/
--     cartu_estudio. SALARIO, COMBS, RTICA, SITRA = su homónimo.
--   * fet, valor_camb, incentivo_c y valor_descuentos se guardan solo como
--     información: NO entran en la utilidad.                   (punto 6)
--   * `liquido` no se usa para nada: no es reproducible.       (3.6.3)
--   * DESPACHO va por archivo mientras la verificación 3.5.1 no diga otra cosa.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING). Cada función lleva su propia
-- etiqueta de dollar quoting para que un error señale el bloque exacto.
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── 1. Períodos ──────────────────────────────────────────────────────────────
-- `estado`: abierto (GEMA todavía no lo cerró; se recalcula a diario), cerrado
-- (congelado) o reabierto (por el administrador, con motivo; se recalcula
-- hasta que el cierre por GEMA lo congele de nuevo).

CREATE TABLE IF NOT EXISTS financiera_periodos (
  periodo             TEXT PRIMARY KEY CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  estado              TEXT NOT NULL DEFAULT 'abierto'
                      CHECK (estado IN ('abierto', 'cerrado', 'reabierto')),
  consolidado_at      TIMESTAMPTZ,
  cerrado_at          TIMESTAMPTZ,
  -- 'gema:<fecha del marcador>' cuando lo cierra la consolidación diaria.
  cerrado_por         TEXT,
  reabierto_at        TIMESTAMPTZ,
  reabierto_por_email TEXT,
  motivo_reapertura   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Bitácora de operaciones ───────────────────────────────────────────────
-- Va antes de las tablas de hechos porque estas la referencian por carga_id.

CREATE TABLE IF NOT EXISTS financiera_cargas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           TEXT NOT NULL CHECK (tipo IN (
                   'consolidar_gema', 'cerrar_periodo', 'reabrir_periodo',
                   'cargar_contable', 'reversar_contable', 'cambiar_parametro'
                 )),
  periodo        TEXT,
  usuario_email  TEXT,
  archivo_nombre TEXT,
  filas          INTEGER NOT NULL DEFAULT 0,
  -- Totales de ingresos, gastos y utilidad, vehículos tocados, filas
  -- rechazadas, celdas vacías tomadas como 0, motivo de reapertura, etc.
  detalle        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financiera_cargas_periodo
  ON financiera_cargas (periodo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financiera_cargas_created
  ON financiera_cargas (created_at DESC);

-- ── 3. Operativo mensual (GEMA) ──────────────────────────────────────────────
-- Una fila por período + vehículo + propietario. En el caso normal hay una por
-- vehículo-mes; si el bus cambió de dueño dentro del mes hay una por dueño,
-- cada una con la producción de sus días. `cedula_propietario` no admite NULL
-- porque forma parte de la llave (Postgres trataría los NULL como distintos y
-- duplicaría en cada corrida): el sin dato se guarda como ''.

CREATE TABLE IF NOT EXISTS financiera_operativo_mes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo             TEXT NOT NULL REFERENCES financiera_periodos (periodo),
  codigo_vehiculo     TEXT NOT NULL,
  cedula_propietario  TEXT NOT NULL DEFAULT '',
  propietario_nombre  TEXT,
  -- El `Flota` del Excel: AFILIADO o EMPRESA, tal como viene en el espejo.
  tipo_propietario    TEXT,
  -- La del último día con producción de la fila; `placa_cambio` si hubo más
  -- de una en el mes. Se agrupa SIEMPRE por codigo_vehiculo, nunca por placa.
  placa               TEXT,
  placa_cambio        BOOLEAN NOT NULL DEFAULT false,
  -- Del maestro `vehiculos` al momento de consolidar.
  modelo              TEXT,
  -- Producción.
  viajes              NUMERIC(12,2) NOT NULL DEFAULT 0,
  timbradas           NUMERIC(14,2) NOT NULL DEFAULT 0,
  ingresos            NUMERIC(16,2) NOT NULL DEFAULT 0,   -- = SUM(bruto)
  dias_con_produccion INTEGER       NOT NULL DEFAULT 0,
  -- Rubros de GEMA que SÍ entran en la utilidad (9 de las 15 partidas).
  fondo               NUMERIC(16,2) NOT NULL DEFAULT 0,   -- cartu_fondo
  poliza              NUMERIC(16,2) NOT NULL DEFAULT 0,   -- cartu_poliza
  prestamo            NUMERIC(16,2) NOT NULL DEFAULT 0,   -- cartu_presta
  estudio             NUMERIC(16,2) NOT NULL DEFAULT 0,   -- cartu_estudio
  salario             NUMERIC(16,2) NOT NULL DEFAULT 0,
  combustible         NUMERIC(16,2) NOT NULL DEFAULT 0,
  rtica               NUMERIC(16,2) NOT NULL DEFAULT 0,
  admon               NUMERIC(16,2) NOT NULL DEFAULT 0,   -- admon (2,5 %), NO cartu_admon
  sitra               NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- Informativos: deducciones de GEMA que el modelo del Excel ignora.
  fet                 NUMERIC(16,2) NOT NULL DEFAULT 0,
  valor_camb          NUMERIC(16,2) NOT NULL DEFAULT 0,
  incentivo_c         NUMERIC(16,2) NOT NULL DEFAULT 0,
  valor_descuentos    NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- Trazabilidad.
  filas_origen        INTEGER NOT NULL DEFAULT 0,   -- filas del espejo sumadas
  origen              TEXT NOT NULL DEFAULT 'gema' CHECK (origen IN ('gema', 'archivo')),
  carga_id            UUID REFERENCES financiera_cargas (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periodo, codigo_vehiculo, cedula_propietario)
);

CREATE INDEX IF NOT EXISTS idx_financiera_operativo_vehiculo
  ON financiera_operativo_mes (codigo_vehiculo, periodo);
CREATE INDEX IF NOT EXISTS idx_financiera_operativo_propietario
  ON financiera_operativo_mes (cedula_propietario, periodo);

-- ── 4. Contable mensual (archivo CSV o Excel) ────────────────────────────────
-- Una fila por período + vehículo. Los seis rubros son del vehículo, no del
-- dueño. Vacío en el archivo = 0 (igual que `Number(x) || 0` en excelParser.ts);
-- `celdas_vacias` cuenta cuántas de las seis llegaron así, para que nadie
-- confunda «sin dato» con «cero».

CREATE TABLE IF NOT EXISTS financiera_contable_mes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo              TEXT NOT NULL REFERENCES financiera_periodos (periodo),
  codigo_vehiculo      TEXT NOT NULL,
  despacho             NUMERIC(16,2) NOT NULL DEFAULT 0,
  intereses            NUMERIC(16,2) NOT NULL DEFAULT 0,
  otros_gastos         NUMERIC(16,2) NOT NULL DEFAULT 0,
  repuestos            NUMERIC(16,2) NOT NULL DEFAULT 0,
  mano_de_obra         NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- Se RESTA de repuestos, no se suma como gasto (excelParser.ts).
  desc_fondo_conductor NUMERIC(16,2) NOT NULL DEFAULT 0,
  celdas_vacias        INTEGER NOT NULL DEFAULT 0,
  carga_id             UUID REFERENCES financiera_cargas (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periodo, codigo_vehiculo)
);

CREATE INDEX IF NOT EXISTS idx_financiera_contable_vehiculo
  ON financiera_contable_mes (codigo_vehiculo, periodo);

-- ── 5. Parámetros: umbrales de semáforo ──────────────────────────────────────
-- Semilla = los cortes quemados en fleetUtils.ts del aplicativo
-- (getRentabilidadStatus, getGastoTimbradaStatus, getProductividadStatus).
-- Excelente si el valor es >= umbral_excelente (o <= cuando menor es mejor);
-- Aceptable si alcanza umbral_aceptable; Crítico en otro caso. La
-- reevaluación con datos reales (plan 6.3.1) mostró que el 90/80 de
-- productividad es inalcanzable para la flota (77 viajes/bus-mes); se conserva
-- por paridad y se cambia desde Parámetros cuando Subgerencia lo confirme.

CREATE TABLE IF NOT EXISTS financiera_parametros (
  indicador             TEXT PRIMARY KEY
                        CHECK (indicador IN ('rentabilidad', 'gasto_timbrada', 'productividad')),
  etiqueta              TEXT NOT NULL,
  unidad                TEXT NOT NULL,
  mayor_es_mejor        BOOLEAN NOT NULL,
  umbral_excelente      NUMERIC(12,2) NOT NULL,
  umbral_aceptable      NUMERIC(12,2) NOT NULL,
  actualizado_por_email TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (mayor_es_mejor AND umbral_excelente >= umbral_aceptable) OR
    (NOT mayor_es_mejor AND umbral_excelente <= umbral_aceptable)
  )
);

INSERT INTO financiera_parametros
  (indicador, etiqueta, unidad, mayor_es_mejor, umbral_excelente, umbral_aceptable)
VALUES
  ('rentabilidad',   'Rentabilidad',                          '%',      true,  15,   5),
  ('gasto_timbrada', 'Gasto por timbrada',                    'COP',    false, 2500, 3200),
  ('productividad',  'Productividad (viajes por vehículo-mes)', 'viajes', true,  90,   80)
ON CONFLICT (indicador) DO NOTHING;

-- ── 6. Versiones de un período (copia antes de reabrir) ──────────────────────

CREATE TABLE IF NOT EXISTS financiera_periodos_versiones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo          TEXT NOT NULL REFERENCES financiera_periodos (periodo),
  motivo           TEXT NOT NULL,
  tomada_por_email TEXT,
  tomada_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Totales de flota del período en ese momento (fila de vw_financiera_flota_mes).
  resumen          JSONB NOT NULL,
  -- Filas completas de las dos tablas de hechos.
  operativo        JSONB NOT NULL,
  contable         JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_financiera_versiones_periodo
  ON financiera_periodos_versiones (periodo, tomada_at DESC);

-- ── 7. updated_at ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION financiera_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fin_touch$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fin_touch$;

DROP TRIGGER IF EXISTS trg_financiera_periodos_touch ON financiera_periodos;
CREATE TRIGGER trg_financiera_periodos_touch
  BEFORE UPDATE ON financiera_periodos
  FOR EACH ROW EXECUTE FUNCTION financiera_touch();

DROP TRIGGER IF EXISTS trg_financiera_operativo_touch ON financiera_operativo_mes;
CREATE TRIGGER trg_financiera_operativo_touch
  BEFORE UPDATE ON financiera_operativo_mes
  FOR EACH ROW EXECUTE FUNCTION financiera_touch();

DROP TRIGGER IF EXISTS trg_financiera_contable_touch ON financiera_contable_mes;
CREATE TRIGGER trg_financiera_contable_touch
  BEFORE UPDATE ON financiera_contable_mes
  FOR EACH ROW EXECUTE FUNCTION financiera_touch();

DROP TRIGGER IF EXISTS trg_financiera_parametros_touch ON financiera_parametros;
CREATE TRIGGER trg_financiera_parametros_touch
  BEFORE UPDATE ON financiera_parametros
  FOR EACH ROW EXECUTE FUNCTION financiera_touch();

-- ── 8. Vista vehículo-mes con indicadores ────────────────────────────────────
-- Suma la operativa de todos los dueños del bus en el mes y le resta la
-- contable del vehículo. Fórmulas transcritas de excelParser.ts:
--   gastos_operativos_totales = despacho + fondo + poliza + prestamo + salario
--       + intereses + estudio + sitra + combustible + rtica + admon
--       + otros_gastos + (repuestos - desc_fondo_conductor) + mano_de_obra
--   utilidad_neta       = ingresos - gastos_operativos_totales
--   rentabilidad        = ingresos > 0 ? utilidad_neta / ingresos * 100 : 0
--   gastos_por_timbrada = timbradas > 0 ? gastos_operativos_totales / timbradas : 0
-- y de fleetUtils.ts la vista «operativa» (sin intereses): los intereses son
-- el único rubro tratado como financiero.
-- `origen_contable = 'sin_dato'` marca la fila incompleta: su utilidad es un
-- techo, no una cifra. La pantalla debe advertirlo.

DROP VIEW IF EXISTS vw_financiera_consolidado;
CREATE VIEW vw_financiera_consolidado AS
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
  -- Vista operativa (sin intereses), fleetUtils.ts.
  (c.utilidad_neta + c.intereses)                              AS utilidad_operativa,
  CASE WHEN c.ingresos > 0
       THEN (c.utilidad_neta + c.intereses) / c.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN c.timbradas > 0
       THEN (c.gastos_operativos_totales - c.intereses) / c.timbradas ELSE 0 END AS gastos_por_timbrada_operativo,
  c.filas_origen,
  c.operativo_updated_at,
  c.contable_updated_at
FROM calc c;

-- ── 9. Vista de flota por mes (promedio ponderado, nunca promedio de columna) ─

DROP VIEW IF EXISTS vw_financiera_flota_mes;
CREATE VIEW vw_financiera_flota_mes AS
WITH t AS (
  SELECT
    periodo,
    MAX(estado_periodo)                                      AS estado_periodo,
    COUNT(*)::integer                                        AS vehiculos,
    COUNT(*) FILTER (WHERE vehiculo_activo)::integer         AS vehiculos_activos,
    COUNT(*) FILTER (WHERE origen_contable = 'archivo')::integer AS vehiculos_con_contable,
    SUM(viajes)                                              AS viajes,
    SUM(timbradas)                                           AS timbradas,
    SUM(ingresos)                                            AS ingresos,
    SUM(gastos_gema)                                         AS gastos_gema,
    SUM(gastos_contables)                                    AS gastos_contables,
    SUM(gastos_operativos_totales)                           AS gastos_operativos_totales,
    SUM(utilidad_neta)                                       AS utilidad_neta,
    SUM(intereses)                                           AS intereses,
    SUM(fet)                                                 AS fet,
    SUM(valor_camb)                                          AS valor_camb,
    SUM(incentivo_c)                                         AS incentivo_c,
    SUM(valor_descuentos)                                    AS valor_descuentos
  FROM vw_financiera_consolidado
  GROUP BY periodo
)
SELECT
  t.*,
  CASE WHEN t.vehiculos = t.vehiculos_con_contable THEN 'completo'
       WHEN t.vehiculos_con_contable = 0            THEN 'sin_dato'
       ELSE 'parcial' END                                    AS cobertura_contable,
  CASE WHEN t.ingresos > 0 THEN t.utilidad_neta / t.ingresos * 100 ELSE 0 END AS rentabilidad,
  CASE WHEN t.timbradas > 0 THEN t.gastos_operativos_totales / t.timbradas ELSE 0 END AS gastos_por_timbrada,
  CASE WHEN t.vehiculos > 0 THEN t.viajes / t.vehiculos ELSE 0 END AS productividad,
  CASE WHEN t.ingresos > 0 THEN (t.utilidad_neta + t.intereses) / t.ingresos * 100 ELSE 0 END AS rentabilidad_operativa,
  CASE WHEN t.timbradas > 0 THEN (t.gastos_operativos_totales - t.intereses) / t.timbradas ELSE 0 END AS gastos_por_timbrada_operativo
FROM t;

-- ── 10. Consolidar un período desde el espejo ────────────────────────────────
-- Idempotente: volver a correrla sobre el mismo mes da el mismo resultado.
-- Reemplaza la parte operativa (upsert por la llave) y borra las filas de
-- origen GEMA que ya no aparecen en el espejo; NO toca la contable. Respeta
-- los períodos cerrados salvo p_forzar (solo debería usarlo el administrador
-- desde una reapertura consciente).

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
      (array_agg(d.tipo_propietario   ORDER BY d.fecha DESC))[1] AS tipo_propietario,
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
      a.tipo_propietario, a.placa, a.placa_cambio, v.modelo,
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

  -- Filas de GEMA que ya no están en el espejo (por ejemplo, un dueño que la
  -- re-sincronización corrigió): se retiran para que dos corridas den lo mismo.
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

-- ── 11. Cierre automático por el marcador de GEMA ────────────────────────────
-- Un mes se cierra cuando `gema_sync_state.last_synced_date` del dataset
-- ingreso_tercero es >= su último día. Aplica también a los reabiertos: el
-- ciclo es reabrir → la siguiente corrida recalcula → este cierre lo congela.

CREATE OR REPLACE FUNCTION financiera_cerrar_periodos_por_gema()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fin_cerrar$
DECLARE
  v_marca    DATE;
  v_cerrados TEXT[] := '{}';
BEGIN
  SELECT last_synced_date INTO v_marca
    FROM gema_sync_state WHERE dataset = 'ingreso_tercero';

  IF v_marca IS NULL THEN
    RETURN jsonb_build_object('marca_gema', NULL, 'cerrados', '[]'::jsonb);
  END IF;

  WITH c AS (
    UPDATE financiera_periodos p
       SET estado     = 'cerrado',
           cerrado_at = now(),
           cerrado_por = 'gema:' || v_marca::text
     WHERE p.estado IN ('abierto', 'reabierto')
       AND (to_date(p.periodo || '-01', 'YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date <= v_marca
    RETURNING p.periodo
  )
  SELECT COALESCE(array_agg(periodo ORDER BY periodo), '{}') INTO v_cerrados FROM c;

  INSERT INTO financiera_cargas (tipo, periodo, detalle)
  SELECT 'cerrar_periodo', x, jsonb_build_object('marca_gema', v_marca)
    FROM unnest(v_cerrados) AS x;

  RETURN jsonb_build_object('marca_gema', v_marca, 'cerrados', to_jsonb(v_cerrados));
END;
$fin_cerrar$;

-- ── 12. Corrida diaria: consolidar los meses abiertos y cerrar los que GEMA pasó
-- Es lo que llama el cron de las 04:00 y el botón «Consolidar ahora». Recorre
-- todos los meses del espejo (desde 2025-01) hasta el mes del marcador y
-- salta los cerrados, así que la primera corrida llena el histórico completo.

CREATE OR REPLACE FUNCTION financiera_consolidar_abiertos(p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fin_abiertos$
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

  RETURN jsonb_build_object(
    'marca_gema', v_marca,
    'periodos',   v_res,
    'cierre',     financiera_cerrar_periodos_por_gema()
  );
END;
$fin_abiertos$;

-- ── 13. Copia de las cifras de un período ────────────────────────────────────

CREATE OR REPLACE FUNCTION financiera_tomar_version(
  p_periodo TEXT,
  p_email   TEXT,
  p_motivo  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $fin_version$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO financiera_periodos_versiones (periodo, motivo, tomada_por_email, resumen, operativo, contable)
  SELECT
    p_periodo,
    p_motivo,
    p_email,
    COALESCE((SELECT to_jsonb(f) FROM vw_financiera_flota_mes f WHERE f.periodo = p_periodo), '{}'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.codigo_vehiculo, o.cedula_propietario)
                FROM financiera_operativo_mes o WHERE o.periodo = p_periodo), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.codigo_vehiculo)
                FROM financiera_contable_mes c WHERE c.periodo = p_periodo), '[]'::jsonb)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fin_version$;

-- ── 14. Reabrir un período cerrado (solo administrador, con motivo) ──────────
-- Guarda una versión antes de tocar nada, para comparar «lo que se reportó»
-- con «lo que quedó». El período vuelve a recalcularse en la siguiente corrida
-- y el cierre por GEMA lo congela otra vez.

CREATE OR REPLACE FUNCTION financiera_reabrir_periodo(
  p_periodo TEXT,
  p_email   TEXT,
  p_motivo  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $fin_reabrir$
DECLARE
  v_estado  TEXT;
  v_version UUID;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de la reapertura es obligatorio.';
  END IF;

  SELECT estado INTO v_estado FROM financiera_periodos WHERE periodo = p_periodo;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El periodo % no existe en Financiera.', p_periodo;
  END IF;
  IF v_estado <> 'cerrado' THEN
    RAISE EXCEPTION 'El periodo % no esta cerrado (estado: %).', p_periodo, v_estado;
  END IF;

  v_version := financiera_tomar_version(p_periodo, p_email, 'reapertura: ' || btrim(p_motivo));

  UPDATE financiera_periodos
     SET estado              = 'reabierto',
         reabierto_at        = now(),
         reabierto_por_email = p_email,
         motivo_reapertura   = btrim(p_motivo)
   WHERE periodo = p_periodo;

  INSERT INTO financiera_cargas (tipo, periodo, usuario_email, detalle)
  VALUES ('reabrir_periodo', p_periodo, p_email,
          jsonb_build_object('motivo', btrim(p_motivo), 'version_id', v_version));

  RETURN jsonb_build_object('periodo', p_periodo, 'estado', 'reabierto', 'version_id', v_version);
END;
$fin_reabrir$;

-- ── 15. Accesos ──────────────────────────────────────────────────────────────
-- RLS habilitada y sin políticas: solo el service role entra. No se concede
-- SELECT a `authenticated`: la vista une cédulas y nombres de propietarios con
-- sus ingresos, y un usuario con sesión podría leerla por PostgREST saltándose
-- el permiso del módulo. Todo pasa por el servidor.

ALTER TABLE financiera_periodos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiera_cargas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiera_operativo_mes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiera_contable_mes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiera_parametros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiera_periodos_versiones  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON financiera_periodos, financiera_cargas, financiera_operativo_mes,
              financiera_contable_mes, financiera_parametros, financiera_periodos_versiones
  FROM anon, authenticated, public;
GRANT ALL ON financiera_periodos, financiera_cargas, financiera_operativo_mes,
             financiera_contable_mes, financiera_parametros, financiera_periodos_versiones
  TO service_role;

REVOKE ALL ON vw_financiera_consolidado, vw_financiera_flota_mes FROM anon, authenticated, public;
GRANT SELECT ON vw_financiera_consolidado, vw_financiera_flota_mes TO service_role;

REVOKE ALL ON FUNCTION financiera_consolidar_periodo(TEXT, BOOLEAN, TEXT)   FROM public;
REVOKE ALL ON FUNCTION financiera_cerrar_periodos_por_gema()                FROM public;
REVOKE ALL ON FUNCTION financiera_consolidar_abiertos(TEXT)                 FROM public;
REVOKE ALL ON FUNCTION financiera_tomar_version(TEXT, TEXT, TEXT)           FROM public;
REVOKE ALL ON FUNCTION financiera_reabrir_periodo(TEXT, TEXT, TEXT)         FROM public;
GRANT EXECUTE ON FUNCTION financiera_consolidar_periodo(TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION financiera_cerrar_periodos_por_gema()              TO service_role;
GRANT EXECUTE ON FUNCTION financiera_consolidar_abiertos(TEXT)               TO service_role;
GRANT EXECUTE ON FUNCTION financiera_tomar_version(TEXT, TEXT, TEXT)         TO service_role;
GRANT EXECUTE ON FUNCTION financiera_reabrir_periodo(TEXT, TEXT, TEXT)       TO service_role;

-- ── 16. El módulo ────────────────────────────────────────────────────────────
-- Solo Administración lo recibe de entrada. El mapa de las 8 cuentas del
-- aplicativo (contabilidad, subgerencia financiera, tesorería) es el punto 13
-- del plan y se resuelve desde Configuración → Usuarios, sin tocar código:
-- Visualizador → fin_tablero + fin_analisis; Editor → + fin_datos;
-- Administrador → todas (fin_auditoria es sensible y fin_parametros solo admin).

UPDATE user_types
   SET modulos = modulos || '["financiera"]'::jsonb
 WHERE key = 'admin' AND NOT (modulos ? 'financiera');

-- ── 17. Documentación en el esquema ──────────────────────────────────────────

COMMENT ON TABLE financiera_periodos IS
  'Estado de cada mes del módulo Financiera: abierto (GEMA no lo ha cerrado; se recalcula a diario), cerrado (congelado cuando el marcador del sync de ingreso_tercero pasó su último día) o reabierto (por el administrador, con motivo).';
COMMENT ON TABLE financiera_operativo_mes IS
  'Producción y rubros de GEMA por período + vehículo + propietario, consolidados desde ingreso_tercero. Ingresos = SUM(bruto); admon es el 2,5 % del bruto (nunca cartu_admon); fondo/poliza/prestamo/estudio son las cartulinas. fet, valor_camb, incentivo_c y valor_descuentos son informativos y no entran en la utilidad.';
COMMENT ON TABLE financiera_contable_mes IS
  'Los seis rubros que no existen en GEMA (despacho, intereses, otros gastos, repuestos, mano de obra y descuento fondo-conductor), por período + vehículo, cargados por archivo CSV o Excel. Son del vehículo, no del dueño. desc_fondo_conductor se resta de repuestos.';
COMMENT ON TABLE financiera_cargas IS
  'Bitácora de toda operación del módulo Financiera: consolidaciones desde GEMA, cierres, reaperturas, cargas y reversiones del archivo contable y cambios de parámetros.';
COMMENT ON TABLE financiera_parametros IS
  'Umbrales de semáforo (Excelente / Aceptable / Crítico) de rentabilidad, gasto por timbrada y productividad. Semilla tomada de fleetUtils.ts del aplicativo de Lovable; solo el administrador los cambia.';
COMMENT ON TABLE financiera_periodos_versiones IS
  'Copia de las cifras de un período tomada antes de reabrirlo, para comparar lo reportado con lo que quedó.';
COMMENT ON VIEW vw_financiera_consolidado IS
  'Vehículo-mes con los indicadores del Excel de flota calculados: gastos_operativos_totales, utilidad_neta, rentabilidad y gastos_por_timbrada, más la vista operativa (sin intereses). origen_contable = sin_dato marca la fila incompleta: su utilidad es un techo.';
COMMENT ON VIEW vw_financiera_flota_mes IS
  'Totales de flota por mes con rentabilidad y gasto por timbrada ponderados (sumas, no promedio de columna) y productividad = viajes / vehículos con movimiento.';
COMMENT ON FUNCTION financiera_consolidar_abiertos(TEXT) IS
  'Corrida diaria (04:00) y botón Consolidar ahora: consolida desde ingreso_tercero todos los meses no cerrados, desde el primero del espejo hasta el mes del marcador de GEMA, y luego cierra los que GEMA ya pasó.';

-- ── 18. Comprobación ─────────────────────────────────────────────────────────
-- Debe devolver las 6 tablas, las 2 vistas, las 5 funciones, 3 parámetros y
-- `admin` con tiene_financiera = true. Las tablas de hechos quedan vacías: la
-- primera consolidación la dispara la Fase 3 (cron) o, a mano,
--   SELECT financiera_consolidar_abiertos('sql-editor');

SELECT table_name, table_type
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND (table_name LIKE 'financiera_%' OR table_name LIKE 'vw_financiera_%')
 ORDER BY table_type, table_name;

SELECT routine_name
  FROM information_schema.routines
 WHERE routine_schema = 'public' AND routine_name LIKE 'financiera_%'
 ORDER BY routine_name;

SELECT indicador, mayor_es_mejor, umbral_excelente, umbral_aceptable FROM financiera_parametros ORDER BY indicador;

SELECT key, modulos ? 'financiera' AS tiene_financiera FROM user_types ORDER BY key;
