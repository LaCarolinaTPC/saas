-- Otros devengados: cierre de quincena.
--
-- Contexto: Tesorería pidió que, una vez entregados todos los valores de una
-- quincena, el corte se cierre, y que la quincena siguiente solo se pueda
-- entregar con la anterior cerrada. La opción arranca en la 1.ª quincena de
-- noviembre de 2026 (la primera no tiene anterior).
--
-- La aplicación exige para cerrar: nómina MGX cerrada, quincena anterior
-- cerrada, nada por entregar y ningún saldo negativo sin trasladar. Un corte
-- cerrado no admite entregas, anulaciones ni novedades. Solo un
-- administrador lo reabre, con motivo.
--
-- Idempotente: se puede correr entero de nuevo sin efecto.

CREATE TABLE IF NOT EXISTS otros_devengados_cortes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,                       -- 'YYYY-MM'
  quincena SMALLINT NOT NULL CHECK (quincena IN (1, 2)),
  cod_per TEXT,                                -- período de nómina MGX
  estado TEXT NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'reabierto')),
  -- Foto de los totales al cerrar (conductores, producción, nómina, otros
  -- devengados, descuentos, devoluciones, entregado, anticipo).
  totales JSONB NOT NULL DEFAULT '{}'::jsonb,
  cerrado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_por UUID REFERENCES profiles(id),
  cerrado_por_email TEXT,
  reabierto_at TIMESTAMPTZ,
  reabierto_por_email TEXT,
  reabierto_motivo TEXT,
  UNIQUE (periodo, quincena)
);

ALTER TABLE otros_devengados_cortes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otros_devengados_cortes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE otros_devengados_cortes TO service_role;

COMMENT ON TABLE otros_devengados_cortes IS
  'Cierre de cada quincena GEMA de Otros devengados. estado cerrado bloquea entregas, anulaciones y novedades del corte; la quincena siguiente solo se entrega con la anterior cerrada. Reabrir: solo administrador, con motivo (estado reabierto).';

-- La entrega se rechaza en un corte cerrado (además de la validación de la
-- aplicación). Misma firma y lógica que 20261104193749 más ese control.
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_otros_dev_reg4$
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

  IF EXISTS (
    SELECT 1 FROM otros_devengados_cortes c
     WHERE c.periodo = p_periodo AND c.quincena = p_quincena AND c.estado = 'cerrado'
  ) THEN
    RAISE EXCEPTION 'corte_cerrado';
  END IF;

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

  SELECT COALESCE(SUM(CASE WHEN n.tipo IN ('devolucion_viaje', 'ajuste_saldo') THEN n.valor ELSE -n.valor END), 0)
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
$fn_otros_dev_reg4$;

REVOKE ALL ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO service_role;
