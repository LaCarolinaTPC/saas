-- 033: Remediación auditoría Fase 0 (T-02, T-03, T-06).
-- Pegar en: Supabase → SQL Editor (idempotente).

-- T-06: RLS y revocación de acceso directo. La app opera con service role;
-- ningún otro rol debe leer/escribir movimientos de dinero.
ALTER TABLE devengados_entregas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON devengados_entregas FROM anon, authenticated;
REVOKE ALL ON tesoreria_audit_log FROM anon, authenticated;

-- T-03: la bitácora es inmutable incluso para la propia aplicación.
CREATE OR REPLACE FUNCTION tesoreria_audit_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tesoreria_audit_log es inmutable (solo INSERT)';
END $$;

DROP TRIGGER IF EXISTS trg_tesoreria_audit_inmutable ON tesoreria_audit_log;
CREATE TRIGGER trg_tesoreria_audit_inmutable
  BEFORE UPDATE OR DELETE ON tesoreria_audit_log
  FOR EACH ROW EXECUTE FUNCTION tesoreria_audit_inmutable();

-- T-02 + T-03: registrar la entrega y su auditoría en UNA transacción,
-- serializada por conductor+quincena con advisory lock. El tope liberado
-- (excedente acumulado de la quincena) lo calcula el servidor a partir de
-- los cierres GEMA y NO depende de las entregas, por lo que re-sumar lo
-- entregado dentro del lock cierra la condición de carrera.
CREATE OR REPLACE FUNCTION registrar_entrega_devengado(
  p_fecha DATE,
  p_periodo TEXT,
  p_quincena INT,
  p_cedula TEXT,
  p_codigo TEXT,
  p_nombre TEXT,
  p_viajes JSONB,
  p_valor NUMERIC,
  p_observacion TEXT,
  p_tope_liberado NUMERIC,
  p_user_id UUID,
  p_user_email TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entregado NUMERIC;
  v_id UUID;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_cedula || ':' || p_periodo || ':' || p_quincena::text)
  );

  SELECT COALESCE(SUM(valor_entregado), 0) INTO v_entregado
    FROM devengados_entregas
   WHERE cedula_conductor = p_cedula
     AND periodo = p_periodo
     AND quincena = p_quincena;

  IF v_entregado + p_valor > p_tope_liberado THEN
    RAISE EXCEPTION 'supera_disponible';
  END IF;

  INSERT INTO devengados_entregas (
    fecha, periodo, quincena, cedula_conductor, codigo_conductor,
    conductor_nombre, viajes, valor_entregado, observacion, aprobada_por
  ) VALUES (
    p_fecha, p_periodo, p_quincena, p_cedula, p_codigo,
    p_nombre, p_viajes, p_valor, p_observacion, p_user_id
  ) RETURNING id INTO v_id;

  INSERT INTO tesoreria_audit_log (
    user_id, user_email, accion, cedula_conductor, conductor_nombre, valor, detalle
  ) VALUES (
    p_user_id, p_user_email, 'entrega_registrada', p_cedula, p_nombre, p_valor,
    jsonb_build_object(
      'entrega_id', v_id,
      'fecha', p_fecha,
      'periodo', p_periodo,
      'quincena', p_quincena,
      'viajes', p_viajes,
      'observacion', p_observacion,
      'tope_liberado', p_tope_liberado,
      'entregado_previo', v_entregado
    )
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION registrar_entrega_devengado(
  DATE, TEXT, INT, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT, NUMERIC, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
