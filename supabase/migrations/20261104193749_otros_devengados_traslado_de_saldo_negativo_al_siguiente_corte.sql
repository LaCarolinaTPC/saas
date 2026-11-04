-- Otros devengados: traslado del saldo negativo al corte siguiente.
--
-- Contexto: cuando los descuentos del corte (pérdidas y casino) superan los
-- otros devengados, o se entregó más de lo que quedó disponible, el conductor
-- queda debiendo. Tesorería pidió poder llevar ese corte a cero con un
-- registro y descontar la diferencia en el corte siguiente. Se guarda como
-- dos novedades enlazadas por carga_id:
--   * ajuste_saldo   en el corte (suma: lo deja en cero)
--   * saldo_anterior en el corte siguiente (resta el mismo valor)
-- El origen de las dos es 'traslado'. Anular una anula la pareja.
--
-- La plantilla de pérdida de turno usa el origen 'excel' que ya existía.
--
-- Idempotente: se puede correr entero de nuevo sin efecto.

ALTER TABLE otros_devengados_novedades DROP CONSTRAINT IF EXISTS otros_devengados_novedades_tipo_check;
ALTER TABLE otros_devengados_novedades ADD CONSTRAINT otros_devengados_novedades_tipo_check
  CHECK (tipo IN ('perdida_viaje', 'perdida_turno', 'casino', 'devolucion_viaje', 'saldo_anterior', 'ajuste_saldo'));

ALTER TABLE otros_devengados_novedades DROP CONSTRAINT IF EXISTS otros_devengados_novedades_origen_check;
ALTER TABLE otros_devengados_novedades ADD CONSTRAINT otros_devengados_novedades_origen_check
  CHECK (origen IN ('operativo', 'excel', 'gema', 'traslado'));

COMMENT ON TABLE otros_devengados_novedades IS
  'Novedades por conductor y quincena GEMA que ajustan Otros devengados: perdida_viaje, perdida_turno, casino y saldo_anterior restan; devolucion_viaje y ajuste_saldo suman. Operativo digita o carga por Excel las pérdidas (/operativo/descuentos-conductores); el casino llega por Excel desde Tesorería; ajuste_saldo + saldo_anterior son el traslado de un saldo negativo al corte siguiente (mismo carga_id). Solo cuentan las de estado activa.';

-- La entrega suma también el ajuste a cero. Misma firma y misma lógica que
-- la versión de 20261104192201; solo cambia el CASE de las novedades.
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn_otros_dev_reg3$
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
$fn_otros_dev_reg3$;

REVOKE ALL ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_entrega_otros_devengados(DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO service_role;
