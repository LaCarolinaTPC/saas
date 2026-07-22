-- 040: Registrar una entrega a nombre de otro cajero también en el día EN CURSO.
-- Pegar en: Supabase → SQL Editor (idempotente). Reemplaza la función de 036.
--
-- Por qué: cuando un cajero no alcanza a digitar un pago que ya entregó, un
-- administrador puede registrarlo acreditándolo a su caja. Eso ya existía,
-- pero solo para días CERRADOS: para el día en curso había que mover la fecha
-- operativa, que es un parámetro GLOBAL y sella con esa fecha lo que registren
-- todos los demás. Ese rodeo fue justo lo que descuadró el cierre del 18-jul
-- (22 pagos por $1.246.301 quedaron sellados con el 21).
--
-- Qué cambia:
--   · Se elimina la restricción 'fecha_no_cerrada'. Se acepta cualquier fecha
--     hasta hoy; el futuro se sigue rechazando ('fecha_futura').
--   · `extemporanea` deja de ser fijo y se deriva de la fecha: true solo si el
--     día ya estaba cerrado. Un registro del día en curso NO es extemporáneo,
--     pero igual queda como novedad, porque lo delata `registrada_por`
--     (distinto de `aprobada_por`): quien digitó no es quien entregó.
--   · La acción de auditoría distingue los dos casos:
--     'entrega_extemporanea' (día cerrado) y 'entrega_a_nombre_de' (día en curso).
--
-- Se conservan intactos todos los controles: solo administradores (validado en
-- la capa de aplicación), cajero acreditado obligatorio, motivo obligatorio,
-- bloqueo del conductor, un pago por conductor por día con máximo un segundo
-- pago, y la regla de oro validada contra el tope liberado al corte de la
-- fecha de la entrega.

CREATE OR REPLACE FUNCTION registrar_entrega_extemporanea(
  p_fecha DATE,
  p_periodo TEXT,
  p_quincena INT,
  p_cedula TEXT,
  p_codigo TEXT,
  p_nombre TEXT,
  p_valor NUMERIC,
  p_observacion TEXT,
  p_tope_liberado NUMERIC,
  p_cajero_id UUID,
  p_motivo TEXT,
  p_registrada_por UUID,
  p_registrada_por_email TEXT,
  p_segundo_pago BOOLEAN DEFAULT false,
  p_ip TEXT DEFAULT NULL,
  p_equipo TEXT DEFAULT NULL,
  p_rol TEXT DEFAULT NULL,
  p_sobre_entrega NUMERIC DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entregado NUMERIC;
  v_pagos_dia INT;
  v_saldo_antes NUMERIC;
  v_id UUID;
  v_hoy DATE := (now() AT TIME ZONE 'America/Bogota')::date;
  v_extemporanea BOOLEAN;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_requerido';
  END IF;
  IF p_cajero_id IS NULL THEN
    RAISE EXCEPTION 'cajero_requerido';
  END IF;
  -- El día en curso sí se admite; el futuro no existe como día contable.
  IF p_fecha > v_hoy THEN
    RAISE EXCEPTION 'fecha_futura';
  END IF;
  v_extemporanea := p_fecha < v_hoy;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_cedula || ':' || p_periodo || ':' || p_quincena::text)
  );

  IF EXISTS (
    SELECT 1 FROM devengados_bloqueos
     WHERE cedula_conductor = p_cedula AND activo
  ) THEN
    RAISE EXCEPTION 'conductor_bloqueado';
  END IF;

  SELECT COUNT(*) INTO v_pagos_dia
    FROM devengados_entregas
   WHERE cedula_conductor = p_cedula
     AND fecha = p_fecha
     AND movimiento = 'DEBITO'
     AND estado = 'activa';

  IF v_pagos_dia >= 2 THEN
    RAISE EXCEPTION 'limite_pagos_dia';
  END IF;
  IF v_pagos_dia >= 1 AND NOT COALESCE(p_segundo_pago, false) THEN
    RAISE EXCEPTION 'pago_duplicado';
  END IF;

  -- Corte a corte: solo lo entregado HASTA la fecha de esta entrega compite
  -- por el excedente liberado a esa fecha (p_tope_liberado).
  SELECT COALESCE(SUM(valor_entregado), 0) INTO v_entregado
    FROM devengados_entregas
   WHERE cedula_conductor = p_cedula
     AND periodo = p_periodo
     AND quincena = p_quincena
     AND fecha <= p_fecha
     AND movimiento = 'DEBITO'
     AND estado = 'activa';

  IF v_entregado + p_valor > p_tope_liberado THEN
    RAISE EXCEPTION 'supera_disponible';
  END IF;

  v_saldo_antes := GREATEST(0, p_tope_liberado - v_entregado);

  INSERT INTO devengados_entregas (
    fecha, periodo, quincena, cedula_conductor, codigo_conductor,
    conductor_nombre, viajes, valor_entregado, observacion, aprobada_por,
    segundo_pago, autorizado_por, autorizacion_motivo, autorizado_at,
    saldo_antes, saldo_despues,
    extemporanea, registrada_por, registrada_por_email, registro_motivo, registro_at
  ) VALUES (
    p_fecha, p_periodo, p_quincena, p_cedula, p_codigo,
    p_nombre, '[]'::jsonb, p_valor, p_observacion, p_cajero_id,
    COALESCE(p_segundo_pago, false),
    CASE WHEN COALESCE(p_segundo_pago, false) THEN p_registrada_por_email ELSE NULL END,
    CASE WHEN COALESCE(p_segundo_pago, false) THEN btrim(p_motivo) ELSE NULL END,
    CASE WHEN COALESCE(p_segundo_pago, false) THEN now() ELSE NULL END,
    v_saldo_antes, v_saldo_antes - p_valor,
    v_extemporanea, p_registrada_por, p_registrada_por_email, btrim(p_motivo), now()
  ) RETURNING id INTO v_id;

  INSERT INTO tesoreria_audit_log (
    user_id, user_email, accion, cedula_conductor, conductor_nombre, valor,
    ip, equipo, modulo, resultado, rol, valor_anterior, valor_nuevo, detalle
  ) VALUES (
    p_registrada_por, p_registrada_por_email,
    CASE WHEN v_extemporanea THEN 'entrega_extemporanea' ELSE 'entrega_a_nombre_de' END,
    p_cedula, p_nombre, p_valor,
    p_ip, p_equipo, 'tesoreria', 'exitoso', p_rol,
    v_saldo_antes::text, (v_saldo_antes - p_valor)::text,
    jsonb_build_object(
      'entrega_id', v_id,
      'fecha', p_fecha,
      'periodo', p_periodo,
      'quincena', p_quincena,
      'cajero_acreditado', p_cajero_id,
      'dia_cerrado', v_extemporanea,
      'motivo', btrim(p_motivo),
      'observacion', p_observacion,
      'tope_liberado_dia', p_tope_liberado,
      'entregado_previo_al_dia', v_entregado,
      'segundo_pago', COALESCE(p_segundo_pago, false),
      -- Cuánto queda sobre-entregada la quincena al corte de hoy por
      -- haberse registrado tarde (0 = ninguna).
      'sobre_entrega_quincena', COALESCE(p_sobre_entrega, 0)
    )
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION registrar_entrega_extemporanea(
  DATE, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, UUID, TEXT, UUID,
  TEXT, BOOLEAN, TEXT, TEXT, TEXT, NUMERIC
) FROM PUBLIC, anon, authenticated;
