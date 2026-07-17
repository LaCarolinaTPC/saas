-- 034: Definiciones confirmadas para la salida en vivo (validación 17-jul-2026).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- Cubre: devoluciones con reverso contable, regla de un pago por conductor
-- por día con segundo pago autorizado por un administrador, bloqueo manual
-- de conductores, saldos antes/después por entrega (reporte diario con
-- firma) y campos ampliados de auditoría (IP, equipo, módulo, resultado,
-- valor anterior/nuevo).

-- ── devengados_entregas: estado del movimiento y soporte de devolución ──
ALTER TABLE devengados_entregas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'devuelta', 'reverso')),
  ADD COLUMN IF NOT EXISTS devolucion_de UUID REFERENCES devengados_entregas(id),
  ADD COLUMN IF NOT EXISTS devolucion_motivo TEXT,
  ADD COLUMN IF NOT EXISTS devuelta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS devuelta_por UUID REFERENCES profiles(id),
  -- Segundo pago del día autorizado por un administrador.
  ADD COLUMN IF NOT EXISTS segundo_pago BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autorizado_por TEXT,
  ADD COLUMN IF NOT EXISTS autorizacion_motivo TEXT,
  ADD COLUMN IF NOT EXISTS autorizado_at TIMESTAMPTZ,
  -- Saldo disponible antes y después de la entrega (reporte diario con firma).
  ADD COLUMN IF NOT EXISTS saldo_antes NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS saldo_despues NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_dev_entregas_fecha_conductor
  ON devengados_entregas (cedula_conductor, fecha);

-- ── Bloqueo manual de conductores (solo administradores) ──
CREATE TABLE IF NOT EXISTS devengados_bloqueos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula_conductor TEXT NOT NULL,
  conductor_nombre TEXT,
  motivo TEXT NOT NULL,
  bloqueado_por UUID REFERENCES profiles(id),
  bloqueado_por_email TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  desbloqueado_por UUID REFERENCES profiles(id),
  desbloqueado_por_email TEXT,
  desbloqueo_motivo TEXT,
  desbloqueado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo bloqueo activo por conductor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_bloqueos_activo
  ON devengados_bloqueos (cedula_conductor) WHERE activo;

ALTER TABLE devengados_bloqueos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON devengados_bloqueos FROM anon, authenticated;

-- ── Auditoría ampliada: IP, equipo, módulo, resultado, valor ant./nuevo ──
ALTER TABLE tesoreria_audit_log
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS equipo TEXT,
  ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'tesoreria',
  ADD COLUMN IF NOT EXISTS resultado TEXT NOT NULL DEFAULT 'exitoso',
  ADD COLUMN IF NOT EXISTS rol TEXT,
  ADD COLUMN IF NOT EXISTS valor_anterior TEXT,
  ADD COLUMN IF NOT EXISTS valor_nuevo TEXT;

-- ── Entrega transaccional v2: bloqueos + un pago/día + segundo pago ──
DROP FUNCTION IF EXISTS registrar_entrega_devengado(
  DATE, TEXT, INT, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT, NUMERIC, UUID, TEXT
);

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
  p_user_email TEXT,
  p_segundo_pago BOOLEAN DEFAULT false,
  p_autorizado_por TEXT DEFAULT NULL,
  p_autorizacion_motivo TEXT DEFAULT NULL,
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

  PERFORM pg_advisory_xact_lock(
    hashtext(p_cedula || ':' || p_periodo || ':' || p_quincena::text)
  );

  -- Conductor bloqueado manualmente: ninguna entrega es válida.
  IF EXISTS (
    SELECT 1 FROM devengados_bloqueos
     WHERE cedula_conductor = p_cedula AND activo
  ) THEN
    RAISE EXCEPTION 'conductor_bloqueado';
  END IF;

  -- Política: un solo pago por conductor por día (entre todos los cajeros).
  -- Un segundo pago exige autorización de administrador; nunca hay tercero.
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
  IF COALESCE(p_segundo_pago, false)
     AND (p_autorizado_por IS NULL OR p_autorizacion_motivo IS NULL) THEN
    RAISE EXCEPTION 'autorizacion_requerida';
  END IF;

  -- Solo cuentan los pagos vigentes: las entregas devueltas liberan el cupo.
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
    saldo_antes, saldo_despues
  ) VALUES (
    p_fecha, p_periodo, p_quincena, p_cedula, p_codigo,
    p_nombre, p_viajes, p_valor, p_observacion, p_user_id,
    COALESCE(p_segundo_pago, false), p_autorizado_por, p_autorizacion_motivo,
    CASE WHEN COALESCE(p_segundo_pago, false) THEN now() ELSE NULL END,
    v_saldo_antes, v_saldo_antes - p_valor
  ) RETURNING id INTO v_id;

  INSERT INTO tesoreria_audit_log (
    user_id, user_email, accion, cedula_conductor, conductor_nombre, valor,
    ip, equipo, modulo, resultado, rol, valor_anterior, valor_nuevo, detalle
  ) VALUES (
    p_user_id, p_user_email,
    CASE WHEN COALESCE(p_segundo_pago, false)
         THEN 'segundo_pago_autorizado' ELSE 'entrega_registrada' END,
    p_cedula, p_nombre, p_valor,
    p_ip, p_equipo, 'tesoreria', 'exitoso', p_rol,
    v_saldo_antes::text, (v_saldo_antes - p_valor)::text,
    jsonb_build_object(
      'entrega_id', v_id,
      'fecha', p_fecha,
      'periodo', p_periodo,
      'quincena', p_quincena,
      'viajes', p_viajes,
      'observacion', p_observacion,
      'tope_liberado', p_tope_liberado,
      'entregado_previo', v_entregado,
      'segundo_pago', COALESCE(p_segundo_pago, false),
      'autorizado_por', p_autorizado_por,
      'autorizacion_motivo', p_autorizacion_motivo
    )
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION registrar_entrega_devengado(
  DATE, TEXT, INT, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT, NUMERIC, UUID, TEXT,
  BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

-- ── Devolución total con reverso contable, en una transacción ──
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
  INSERT INTO devengados_entregas (
    fecha, periodo, quincena, cedula_conductor, codigo_conductor,
    conductor_nombre, viajes, valor_entregado, cuenta_contable, movimiento,
    observacion, aprobada_por, estado, devolucion_de, devolucion_motivo
  ) VALUES (
    p_fecha, p_periodo, p_quincena, v_orig.cedula_conductor, v_orig.codigo_conductor,
    v_orig.conductor_nombre, '[]'::jsonb, v_orig.valor_entregado,
    v_orig.cuenta_contable, 'CREDITO',
    'Devolución total de la entrega ' || v_orig.id, p_user_id,
    'reverso', v_orig.id, btrim(p_motivo)
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
      'fecha_devolucion', p_fecha,
      'motivo', btrim(p_motivo)
    )
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION registrar_devolucion_devengado(
  UUID, DATE, TEXT, INT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

-- ── Seguridad: exigir cambio de contraseña al usuario de tesorería ──
-- (su clave inicial fue la cédula; en el primer ingreso deberá cambiarla).
UPDATE auth.users
   SET raw_user_meta_data =
       COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb
 WHERE email = 'tesoreria@lacarolina.com.co';
