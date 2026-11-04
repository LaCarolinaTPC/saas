-- Otros devengados: novedades que ajustan lo que se entrega en cada corte.
--
-- Contexto: la conciliación de la 1.ª quincena de octubre de 2026 mostró que
-- Tesorería descuenta a mano, sobre los otros devengados de la quincena, la
-- pérdida de viaje, la pérdida de turno y el casino (almuerzos), y suma la
-- devolución de viaje. 57 de 146 conductores tuvieron alguna. Para que la
-- opción Otros devengados entregue el neto:
--   * Operativo digita la pérdida de turno (y las otras novedades de viaje)
--     por corte en un formulario.
--   * Tesorería carga el casino de la quincena con una plantilla de Excel.
--
-- El corte es la quincena GEMA (periodo 'YYYY-MM' + quincena 1|2), no el
-- período MGX: Operativo registra mientras la nómina sigue abierta.
--
-- Idempotente: se puede correr entero de nuevo sin efecto.

CREATE TABLE IF NOT EXISTS otros_devengados_novedades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,                       -- 'YYYY-MM'
  quincena SMALLINT NOT NULL CHECK (quincena IN (1, 2)),
  cedula_conductor TEXT NOT NULL,
  codigo_conductor TEXT,
  conductor_nombre TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('perdida_viaje', 'perdida_turno', 'casino', 'devolucion_viaje')),
  -- Día de la novedad (opcional; el casino llega consolidado por quincena).
  fecha DATE,
  cantidad NUMERIC(10,2),
  -- Siempre positivo; el tipo dice si resta o suma (devolucion_viaje suma).
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  observacion TEXT,
  origen TEXT NOT NULL DEFAULT 'operativo' CHECK (origen IN ('operativo', 'excel', 'gema')),
  -- Cargue de Excel al que pertenece (para reemplazar o anular el cargue entero).
  carga_id UUID,
  archivo TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada')),
  anulada_motivo TEXT,
  anulada_at TIMESTAMPTZ,
  anulada_por_email TEXT,
  registrada_por UUID REFERENCES profiles(id),
  registrada_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otros_dev_novedades_quincena
  ON otros_devengados_novedades (periodo, quincena, cedula_conductor) WHERE estado = 'activa';
CREATE INDEX IF NOT EXISTS idx_otros_dev_novedades_carga
  ON otros_devengados_novedades (carga_id) WHERE carga_id IS NOT NULL;

ALTER TABLE otros_devengados_novedades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otros_devengados_novedades FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE otros_devengados_novedades TO service_role;

COMMENT ON TABLE otros_devengados_novedades IS
  'Novedades por conductor y quincena GEMA que ajustan Otros devengados: perdida_viaje, perdida_turno y casino restan; devolucion_viaje suma. Operativo las digita (/operativo/descuentos-conductores) y el casino llega por Excel desde Tesorería. Solo cuentan las de estado activa.';

-- ── La entrega descuenta las novedades bajo el mismo lock ────────────────
-- p_otros_devengados sigue siendo lo que el cruce dejó ANTES de novedades
-- (producción − nómina); aquí se restan los descuentos y se suma la
-- devolución de viaje vigentes, para que una novedad registrada mientras se
-- entrega no deje pasar un valor de más. La firma no cambia.
CREATE OR REPLACE FUNCTION registrar_entrega_otros_devengados(
  p_fecha DATE,
  p_cod_per TEXT,
  p_periodo TEXT,
  p_quincena INT,
  p_cedula TEXT,
  p_codigo TEXT,
  p_nombre TEXT,
  p_valor NUMERIC,
  p_otros_devengados NUMERIC,
  p_observacion TEXT,
  p_user_id UUID,
  p_user_email TEXT
) RETURNS TABLE (id UUID, saldo_antes NUMERIC, saldo_despues NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_otros_dev_reg2$
DECLARE
  v_otros NUMERIC;
  v_caja NUMERIC;
  v_ajuste NUMERIC;
  v_saldo NUMERIC;
  v_id UUID;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_cedula || ':' || p_periodo || ':' || p_quincena::text)
  );

  SELECT COALESCE(SUM(e.valor_entregado), 0) INTO v_otros
    FROM otros_devengados_entregas e
   WHERE e.cedula_conductor = p_cedula
     AND e.periodo = p_periodo
     AND e.quincena = p_quincena
     AND e.estado = 'activa';

  SELECT COALESCE(SUM(d.valor_entregado), 0) INTO v_caja
    FROM devengados_entregas d
   WHERE d.cedula_conductor = p_cedula
     AND d.periodo = p_periodo
     AND d.quincena = p_quincena
     AND d.movimiento = 'DEBITO'
     AND d.estado = 'activa';

  SELECT COALESCE(SUM(CASE WHEN n.tipo = 'devolucion_viaje' THEN n.valor ELSE -n.valor END), 0)
    INTO v_ajuste
    FROM otros_devengados_novedades n
   WHERE n.cedula_conductor = p_cedula
     AND n.periodo = p_periodo
     AND n.quincena = p_quincena
     AND n.estado = 'activa';

  v_saldo := GREATEST(0, GREATEST(0, COALESCE(p_otros_devengados, 0) + v_ajuste) - v_otros - v_caja);
  IF p_valor > v_saldo THEN
    RAISE EXCEPTION 'supera_disponible';
  END IF;

  INSERT INTO otros_devengados_entregas (
    fecha, cod_per, periodo, quincena, cedula_conductor, codigo_conductor,
    conductor_nombre, valor_entregado, otros_devengados, saldo_antes,
    saldo_despues, observacion, registrada_por, registrada_por_email
  ) VALUES (
    p_fecha, p_cod_per, p_periodo, p_quincena, p_cedula, p_codigo,
    p_nombre, p_valor, p_otros_devengados, v_saldo,
    v_saldo - p_valor, NULLIF(btrim(p_observacion), ''), p_user_id, p_user_email
  ) RETURNING otros_devengados_entregas.id INTO v_id;

  RETURN QUERY SELECT v_id, v_saldo, v_saldo - p_valor;
END;
$fn_otros_dev_reg2$;

REVOKE ALL ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO service_role;
