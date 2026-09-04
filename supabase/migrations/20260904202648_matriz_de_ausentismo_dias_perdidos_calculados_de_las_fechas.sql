-- Matriz de ausentismo: los días perdidos se calculan de las fechas.
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Regla: dias_it_pagados = fecha_fin - fecha_inicio + 1 (ambos días
-- incluidos). Antes el valor se digitaba (formulario) o venía escrito en el
-- Excel, y podía no cuadrar con las fechas. Desde ahora la base lo garantiza
-- con un trigger, y las filas viejas que no cuadraban se corrigen dejando
-- rastro en ausentismo_log.

-- ── 1. Trigger: calcula y valida los días en cada inserción o cambio ────────
CREATE OR REPLACE FUNCTION ausentismo_calcula_dias()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_calc INTEGER;
BEGIN
  IF NEW.fecha_inicio IS NULL OR NEW.fecha_fin IS NULL THEN
    -- Sin las dos fechas no hay nada que calcular; se conserva lo que venga.
    RETURN NEW;
  END IF;
  IF NEW.fecha_fin < NEW.fecha_inicio THEN
    RAISE EXCEPTION 'La fecha fin (%) no puede ser anterior al inicio (%).', NEW.fecha_fin, NEW.fecha_inicio
      USING ERRCODE = 'check_violation';
  END IF;
  v_calc := (NEW.fecha_fin - NEW.fecha_inicio) + 1;
  -- Formulario: si llega otro valor es un error de captura y se rechaza.
  -- Excel: se corrige en silencio, el lector ya avisa la discrepancia.
  IF COALESCE(NEW.origen_registro, 'excel') = 'formulario'
     AND NEW.dias_it_pagados IS NOT NULL
     AND NEW.dias_it_pagados <> v_calc THEN
    RAISE EXCEPTION 'Los días perdidos (%) no coinciden con las fechas: del % al % son % días.',
      NEW.dias_it_pagados, NEW.fecha_inicio, NEW.fecha_fin, v_calc
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.dias_it_pagados := v_calc;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ausentismo_calcula_dias ON ausentismo;
CREATE TRIGGER trg_ausentismo_calcula_dias
  BEFORE INSERT OR UPDATE OF fecha_inicio, fecha_fin, dias_it_pagados ON ausentismo
  FOR EACH ROW EXECUTE FUNCTION ausentismo_calcula_dias();

-- ── 2. Corrección de las filas existentes que no cuadran, con rastro ────────
-- Primero la bitácora (antes/después por fila), luego el UPDATE. El trigger de
-- IPS/profesional no se dispara porque aquí solo cambia dias_it_pagados.
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_id, user_email)
  SELECT
    a.id,
    'dias_recalculados',
    jsonb_build_object('dias_it_pagados', a.dias_it_pagados),
    jsonb_build_object(
      'dias_it_pagados', (a.fecha_fin - a.fecha_inicio) + 1,
      'fecha_inicio', a.fecha_inicio,
      'fecha_fin', a.fecha_fin,
      'motivo', 'Migración 20260904202648: días recalculados de las fechas'
    ),
    NULL,
    'migracion'
  FROM ausentismo a
  WHERE a.fecha_inicio IS NOT NULL
    AND a.fecha_fin IS NOT NULL
    AND a.fecha_fin >= a.fecha_inicio
    AND a.dias_it_pagados IS DISTINCT FROM (a.fecha_fin - a.fecha_inicio) + 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE ausentismo a
  SET dias_it_pagados = (a.fecha_fin - a.fecha_inicio) + 1
  WHERE a.fecha_inicio IS NOT NULL
    AND a.fecha_fin IS NOT NULL
    AND a.fecha_fin >= a.fecha_inicio
    AND a.dias_it_pagados IS DISTINCT FROM (a.fecha_fin - a.fecha_inicio) + 1;

  RAISE NOTICE 'Días recalculados en % fila(s) de la matriz.', v_n;
END $$;

-- Filas con fin anterior al inicio no se pueden corregir solas: se marcan
-- para revisión de RRHH (el trigger no las toca porque no cambian).
UPDATE ausentismo
SET revision = array_append(revision, 'fechas_invertidas')
WHERE fecha_inicio IS NOT NULL
  AND fecha_fin IS NOT NULL
  AND fecha_fin < fecha_inicio
  AND NOT ('fechas_invertidas' = ANY(revision));

-- ── 3. Consulta de comprobación (debe devolver 0) ───────────────────────────
SELECT count(*) AS filas_que_no_cuadran
FROM ausentismo
WHERE fecha_inicio IS NOT NULL
  AND fecha_fin IS NOT NULL
  AND fecha_fin >= fecha_inicio
  AND dias_it_pagados IS DISTINCT FROM (fecha_fin - fecha_inicio) + 1;
