-- ── Devoluciones: el reverso pertenece al día de la entrega original ──
--
-- Hasta ahora el crédito de reverso se fechaba con la fecha operativa del día
-- en que se registraba la devolución. Un pago del 16 devuelto el 21 quedaba
-- partido: el débito en el 16 y el crédito en el 21, sin compensarse nunca.
--
-- La fecha contable de un movimiento es la de la operación que corrige, no la
-- del momento en que se digita. `created_at` sigue guardando cuándo se
-- registró, así que la trazabilidad no se pierde: el reverso se ve en el día
-- que afecta y la auditoría muestra el día en que se hizo.
--
-- Consecuencia deseada: débito y crédito quedan siempre en el mismo día, se
-- anulan entre sí y el cuadre del día cierra sin arrastres a otras fechas.

CREATE OR REPLACE FUNCTION registrar_devolucion_devengado(
  p_entrega_id UUID,
  p_fecha DATE,
  p_periodo TEXT,
  p_quincena INT,
  p_motivo TEXT,
  p_user_id UUID,
  p_user_email TEXT,
  p_ip TEXT DEFAULT NULL,
  p_equipo TEXT DEFAULT NULL,
  p_rol TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orig devengados_entregas%ROWTYPE;
  v_id UUID;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido';
  END IF;

  SELECT * INTO v_orig FROM devengados_entregas
   WHERE id = p_entrega_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_no_encontrada';
  END IF;
  IF v_orig.movimiento <> 'DEBITO' OR v_orig.estado <> 'activa' THEN
    RAISE EXCEPTION 'entrega_no_reversible';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_orig.cedula_conductor || ':' || v_orig.periodo || ':' || v_orig.quincena::text)
  );

  UPDATE devengados_entregas
     SET estado = 'devuelta',
         devolucion_motivo = btrim(p_motivo),
         devuelta_at = now(),
         devuelta_por = p_user_id
   WHERE id = p_entrega_id;

  -- Reverso contable automático del movimiento original (crédito).
  -- Fecha, periodo y quincena se toman de la ENTREGA ORIGINAL (v_orig), no de
  -- la fecha operativa del día en que se registra: el reverso corrige un hecho
  -- de aquel día y debe liquidarse en su misma quincena.
  INSERT INTO devengados_entregas (
    fecha, periodo, quincena, cedula_conductor, codigo_conductor,
    conductor_nombre, viajes, valor_entregado, cuenta_contable, movimiento,
    observacion, aprobada_por, estado, devolucion_de, devolucion_motivo
  ) VALUES (
    v_orig.fecha, v_orig.periodo, v_orig.quincena, v_orig.cedula_conductor, v_orig.codigo_conductor,
    v_orig.conductor_nombre, '[]'::jsonb, v_orig.valor_entregado,
    v_orig.cuenta_contable, 'CREDITO',
    'Devolución total de la entrega ' || v_orig.id ||
      CASE WHEN p_fecha IS DISTINCT FROM v_orig.fecha
           THEN ' (registrada el ' || p_fecha || ')' ELSE '' END,
    p_user_id, 'reverso', v_orig.id, btrim(p_motivo)
  ) RETURNING id INTO v_id;

  INSERT INTO tesoreria_audit_log (
    user_id, user_email, accion, cedula_conductor, conductor_nombre, valor,
    ip, equipo, modulo, resultado, rol, valor_anterior, valor_nuevo, detalle
  ) VALUES (
    p_user_id, p_user_email, 'devolucion',
    v_orig.cedula_conductor, v_orig.conductor_nombre, v_orig.valor_entregado,
    p_ip, p_equipo, 'tesoreria', 'exitoso', p_rol, 'activa', 'devuelta',
    jsonb_build_object(
      'entrega_id', v_orig.id,
      'reverso_id', v_id,
      'fecha_entrega', v_orig.fecha,
      'fecha_contable_reverso', v_orig.fecha,
      'fecha_devolucion', p_fecha,
      'motivo', btrim(p_motivo)
    )
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION registrar_devolucion_devengado(
  UUID, DATE, TEXT, INT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
