-- 035: Registro EXTEMPORÁNEO de entregas (días ya cerrados).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- Caso real (21-jul-2026): un cajero entregó el efectivo del cierre del
-- 16-jul pero nunca registró las dos entregas en Gestivo. Su cuadre de ese
-- día quedó con un faltante y el disponible de la quincena de esos
-- conductores siguió arrastrándose en los reportes de pago.
--
-- Solución: SOLO un administrador puede registrar una entrega con fecha
-- contable pasada, a nombre del cajero que realmente entregó el dinero
-- (para que el cuadre de ESE día y ESE cajero cierre), con motivo
-- obligatorio y traza de quién la registró.

-- ── Trazabilidad del registro extemporáneo ──
ALTER TABLE devengados_entregas
  ADD COLUMN IF NOT EXISTS extemporanea BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registrada_por UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS registrada_por_email TEXT,
  ADD COLUMN IF NOT EXISTS registro_motivo TEXT,
  ADD COLUMN IF NOT EXISTS registro_at TIMESTAMPTZ;

COMMENT ON COLUMN devengados_entregas.extemporanea IS
  'Entrega registrada por un administrador con fecha contable de un día ya cerrado.';
COMMENT ON COLUMN devengados_entregas.registrada_por IS
  'Administrador que digitó el registro extemporáneo (aprobada_por sigue siendo el cajero que entregó el dinero).';

-- ── Entrega extemporánea, en una transacción ──
-- Misma serialización y mismas reglas de negocio que la entrega normal
-- (bloqueo del conductor, un pago por conductor por día con máximo un
-- segundo pago, tope liberado por la regla de oro). Lo que cambia es que la
-- fecha contable la fija el administrador y el cajero acreditado
-- (aprobada_por) es distinto de quien ejecuta la operación.
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
  p_rol TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entregado NUMERIC;
  v_pagos_dia INT;
  v_saldo_antes NUMERIC;
  v_id UUID;
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
  -- Este camino es exclusivamente para días ya cerrados: el día en curso
  -- se registra por la caja normal, con el cajero autenticado.
  IF p_fecha >= (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'fecha_no_cerrada';
  END IF;

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

  -- El tope lo calcula el servidor con el corte del día de la entrega Y el
  -- corte vigente de la quincena: una entrega atrasada nunca puede liberar
  -- más de lo que la regla de oro tenía liberado.
  SELECT COALESCE(SUM(valor_entregado), 0) INTO v_entregado
    FROM devengados_entregas
   WHERE cedula_conductor = p_cedula
     AND periodo = p_periodo
     AND quincena = p_quincena
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
    true, p_registrada_por, p_registrada_por_email, btrim(p_motivo), now()
  ) RETURNING id INTO v_id;

  INSERT INTO tesoreria_audit_log (
    user_id, user_email, accion, cedula_conductor, conductor_nombre, valor,
    ip, equipo, modulo, resultado, rol, valor_anterior, valor_nuevo, detalle
  ) VALUES (
    p_registrada_por, p_registrada_por_email, 'entrega_extemporanea',
    p_cedula, p_nombre, p_valor,
    p_ip, p_equipo, 'tesoreria', 'exitoso', p_rol,
    v_saldo_antes::text, (v_saldo_antes - p_valor)::text,
    jsonb_build_object(
      'entrega_id', v_id,
      'fecha', p_fecha,
      'periodo', p_periodo,
      'quincena', p_quincena,
      'cajero_acreditado', p_cajero_id,
      'motivo', btrim(p_motivo),
      'observacion', p_observacion,
      'tope_liberado', p_tope_liberado,
      'entregado_previo', v_entregado,
      'segundo_pago', COALESCE(p_segundo_pago, false)
    )
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION registrar_entrega_extemporanea(
  DATE, TEXT, INT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, UUID, TEXT, UUID,
  TEXT, BOOLEAN, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
