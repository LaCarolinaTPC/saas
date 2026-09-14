-- Parte 4 de 5 de la migracion 20260914161822: el retiro de los expedientes fuera de alcance.
--
-- Se parte en cinco porque el SQL Editor estaba ejecutando el texto viejo
-- guardado en la pestaña. Pegue cada parte en una pestaña NUEVA y en orden:
-- 1 funciones, 2 trigger, 3 vista, 4 limpieza, 5 comprobacion.
--
-- Que debe salir: El aviso (NOTICE) «Expedientes retirados por el umbral de la EPS: 24». Si dice 0, o ya se habia corrido o los trozos 1 y 2 no estan aplicados.
--
-- El archivo completo, con el contexto y el porque, esta en
-- supabase/migrations/20260914161822_incapacidades_umbral_de_entrada_eps_desde_3_dias_y_arl_todas.sql

SELECT 'parte 4 de 5 · migracion 20260914161822' AS ejecutando;
-- ── 5. Retiro de los expedientes que nacieron fuera del alcance ─────────────
-- Eliminacion logica con motivo, solo sobre lo que nadie ha trabajado: sin
-- liquidacion, sin radicacion, sin recaudo aplicado y sin soporte cargado. Lo
-- que RRHH incorporo a mano (alta manual) se respeta: fue una decision suya, y
-- tampoco se retira la incapacidad sin fecha de fin, que solo esta incompleta.
-- Medido el 2026-09-14 en produccion: 24 de 30 expedientes, todos de EPS de
-- uno o dos dias y todos en estado "recibido".
DO $limpieza$
DECLARE
  r RECORD;
  v_n INTEGER := 0;
  v_umbral INTEGER;
BEGIN
  FOR r IN
    SELECT e.id AS expediente_id, e.estado, a AS fila
      FROM incapacidad_expedientes e
      JOIN ausentismo a ON a.id = e.ausentismo_id
     WHERE e.eliminado_at IS NULL
       AND e.estado IN ('recibido', 'en_completar')
       AND e.recibido_desde <> 'alta_manual'
       AND upper(COALESCE(a.origen, '')) NOT IN ('AT', 'EL')
       AND a.dias_it_pagados IS NOT NULL
       AND a.dias_it_pagados < incapacidad_dias_min_entrada(a)
       AND NOT EXISTS (SELECT 1 FROM incapacidad_liquidaciones x WHERE x.expediente_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM incapacidad_radicaciones x WHERE x.expediente_id = e.id)
       AND NOT EXISTS (SELECT 1 FROM incapacidad_recaudo_aplicaciones x WHERE x.expediente_id = e.id AND x.anulada_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM incapacidad_adjuntos x WHERE x.expediente_id = e.id AND x.anulado_at IS NULL)
  LOOP
    v_umbral := incapacidad_dias_min_entrada(r.fila);

    UPDATE incapacidad_expedientes
       SET eliminado_at = now(),
           motivo_eliminacion = format(
             'Fuera del alcance: a %s se le reclama desde %s dias y esta incapacidad tiene %s.',
             COALESCE(incapacidad_pagador(r.fila), 'la EPS'),
             v_umbral,
             (r.fila).dias_it_pagados)
     WHERE id = r.expediente_id;

    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (
      r.expediente_id,
      'expediente_retirado_por_umbral',
      jsonb_build_object('estado', r.estado),
      jsonb_build_object(
        'dias_it_pagados', (r.fila).dias_it_pagados,
        'origen', (r.fila).origen,
        'umbral', v_umbral,
        'migracion', '20260914161822'),
      'migracion:20260914161822');

    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'Expedientes retirados por el umbral de la EPS: %', v_n;
END $limpieza$;
