-- Otros devengados: entregas contra la nómina de conductores cerrada en MGX.
--
-- Contexto: Tesorería pidió una opción nueva, aparte de Caja devengados, en la
-- que lo que se entrega a cada conductor no depende de la base diaria exigida
-- sino de lo que la nómina ya le pagó en el corte:
--
--   otros devengados = producción GEMA de la quincena
--                      − conceptos de devengo de la nómina MGX cerrada
--                        (003, 006, 010, 013, 202, 208, 209)
--
-- El cálculo se hace en la aplicación (src/lib/otros-devengados/calculo.ts) y
-- solo se registra la entrega. Caja devengados (devengados_entregas) no se
-- toca; sus entregas vigentes de la misma quincena se descuentan también aquí
-- para que un conductor nunca reciba dos veces lo mismo por las dos opciones.
--
-- Idempotente: se puede correr entero de nuevo sin efecto.

CREATE TABLE IF NOT EXISTS otros_devengados_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Día en que se entregó el dinero (hora Colombia).
  fecha DATE NOT NULL,
  -- Período de nómina MGX del cruce (p. ej. '01043') y su quincena GEMA.
  cod_per TEXT NOT NULL,
  periodo TEXT NOT NULL,                       -- 'YYYY-MM'
  quincena SMALLINT NOT NULL CHECK (quincena IN (1, 2)),
  cedula_conductor TEXT NOT NULL,
  codigo_conductor TEXT,
  conductor_nombre TEXT,
  valor_entregado NUMERIC(14,2) NOT NULL CHECK (valor_entregado > 0),
  -- Foto del cruce al momento de la entrega (para auditoría).
  otros_devengados NUMERIC(14,2) NOT NULL,
  saldo_antes NUMERIC(14,2) NOT NULL,
  saldo_despues NUMERIC(14,2) NOT NULL,
  observacion TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada')),
  anulada_motivo TEXT,
  anulada_at TIMESTAMPTZ,
  anulada_por UUID REFERENCES profiles(id),
  anulada_por_email TEXT,
  registrada_por UUID REFERENCES profiles(id),
  registrada_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otros_dev_entregas_quincena
  ON otros_devengados_entregas (periodo, quincena, cedula_conductor);
CREATE INDEX IF NOT EXISTS idx_otros_dev_entregas_cod_per
  ON otros_devengados_entregas (cod_per);
CREATE INDEX IF NOT EXISTS idx_otros_dev_entregas_fecha
  ON otros_devengados_entregas (fecha);

ALTER TABLE otros_devengados_entregas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otros_devengados_entregas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE otros_devengados_entregas TO service_role;

-- ── Registrar una entrega ────────────────────────────────────────────────
-- p_otros_devengados es lo que el cruce dejó para el conductor en la quincena
-- (ya calculado contra la nómina cerrada). La función vuelve a sumar bajo
-- lock lo entregado por las dos opciones y rechaza si se pasa.
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_otros_dev_reg$
DECLARE
  v_otros NUMERIC;
  v_caja NUMERIC;
  v_saldo NUMERIC;
  v_id UUID;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;

  -- La misma llave que usa Caja devengados: las dos opciones se esperan.
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

  v_saldo := GREATEST(0, COALESCE(p_otros_devengados, 0) - v_otros - v_caja);
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
$fn_otros_dev_reg$;

-- ── Anular una entrega (vuelve a quedar disponible el valor) ─────────────
CREATE OR REPLACE FUNCTION anular_entrega_otros_devengados(
  p_id UUID,
  p_motivo TEXT,
  p_user_id UUID,
  p_user_email TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_otros_dev_anu$
DECLARE
  v_row otros_devengados_entregas%ROWTYPE;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido';
  END IF;

  SELECT * INTO v_row FROM otros_devengados_entregas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_no_existe';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_row.cedula_conductor || ':' || v_row.periodo || ':' || v_row.quincena::text)
  );

  UPDATE otros_devengados_entregas
     SET estado = 'anulada',
         anulada_motivo = btrim(p_motivo),
         anulada_at = now(),
         anulada_por = p_user_id,
         anulada_por_email = p_user_email
   WHERE id = p_id AND estado = 'activa';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_ya_anulada';
  END IF;
END;
$fn_otros_dev_anu$;

REVOKE ALL ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION anular_entrega_otros_devengados(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION anular_entrega_otros_devengados(UUID, TEXT, UUID, TEXT) TO service_role;
