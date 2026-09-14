-- Incapacidades: la EPS se gestiona desde 3 dias; la ARL, toda incapacidad
--
-- Los bloques llevan etiqueta propia ($defecto$, $entrada$, $corte$, $matriz$,
-- $limpieza$) en vez de la etiqueta vacia. Si el editor devuelve un error en
-- un DECLARE, es que esta corriendo un texto viejo: aqui ya no queda ninguna.
--
-- Contexto: hasta hoy el modulo recibia TODA incapacidad que iniciara en el
-- corte o despues, sin mirar cuantos dias dura. La bandeja del piloto acabo
-- con 30 expedientes de los cuales 24 eran de EPS de uno o dos dias, que no se
-- le reclaman a nadie: en una incapacidad inicial de origen comun el empleador
-- asume los dos primeros dias y la EPS paga desde el tercero, asi que por
-- debajo de tres dias no hay nada que cobrar. Administracion de Datos fijo el
-- 2026-09-14 el criterio definitivo:
--
--   * EPS (origen distinto de AT/EL): entra la incapacidad de MAS DE 2 DIAS.
--   * ARL (AT/EL): entran todas, sin condicion de dias, porque la ARL responde
--     desde el primer dia (regla operativa gestivo-cobro-dias).
--
-- El criterio es uno solo para entrar y para cobrar: el umbral por entidad
-- (`ausentismo_catalogos.dias_min_cobro`, decision 12.17) baja de 4 a 3 en las
-- EPS, de modo que lo que entra se puede radicar sin excepcion escrita. El
-- umbral sigue siendo editable por entidad desde Incapacidades > Parametros:
-- si una EPS exige mas dias, se le sube ahi y la puerta de entrada lo respeta.
--
-- Esta migracion tambien retira los expedientes que ya nacieron fuera del
-- alcance. Es una eliminacion logica con motivo: no se borra nada, siguen en
-- la auditoria y se pueden reingresar uno a uno por alta manual.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, asi que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).

SELECT 'migracion 20260914161822 · version con etiquetas' AS ejecutando;

-- ── 1. Umbral por defecto: 3 dias la EPS, 1 la ARL ──────────────────────────
-- Un solo lugar para el valor que aplica cuando la entidad no tiene umbral
-- propio (o cuando el expediente aun no esta homologado).
CREATE OR REPLACE FUNCTION incapacidad_dias_min_defecto(p_origen TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $defecto$
  SELECT CASE WHEN upper(COALESCE(p_origen, '')) IN ('AT', 'EL') THEN 1 ELSE 3 END;
$defecto$;

COMMENT ON FUNCTION incapacidad_dias_min_defecto(TEXT) IS
  'Dias minimos que hacen cobrable una incapacidad cuando la entidad no tiene umbral propio: 1 para AT/EL (ARL, responde desde el primer dia) y 3 para el resto (EPS, paga desde el tercer dia).';

-- Las EPS que seguian en la semilla de 4 bajan a 3. No se tocan las que RRHH
-- haya ajustado a otro valor a proposito.
UPDATE ausentismo_catalogos
   SET dias_min_cobro = 3
 WHERE tipo = 'EPS' AND (dias_min_cobro = 4 OR dias_min_cobro IS NULL);

UPDATE ausentismo_catalogos
   SET dias_min_cobro = 1
 WHERE tipo = 'ARL' AND dias_min_cobro IS NULL;

-- ── 2. La puerta de entrada al modulo ───────────────────────────────────────
-- Umbral que aplica a una fila de la matriz antes de que exista expediente:
-- el de su pagador en el catalogo activo, o el de su clase por defecto. Misma
-- homologacion por nombre que usa incapacidad_expediente_desde_matriz.
CREATE OR REPLACE FUNCTION incapacidad_dias_min_entrada(a ausentismo)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $entrada$
  SELECT COALESCE(
    (SELECT c.dias_min_cobro
       FROM ausentismo_catalogos c
      WHERE c.tipo IN ('EPS', 'ARL') AND c.activo
        AND ausentismo_clave(c.nombre) = ausentismo_clave(ausentismo_limpio(incapacidad_pagador(a)))
      ORDER BY (c.tipo = CASE WHEN upper(a.origen) IN ('AT', 'EL') THEN 'ARL' ELSE 'EPS' END) DESC
      LIMIT 1),
    incapacidad_dias_min_defecto(a.origen));
$entrada$;

-- Vigente, con inicio en el corte o despues y con dias suficientes para que
-- haya algo que reclamar. La ARL no mira dias: responde por todos, incluida
-- la incapacidad de un dia y la que todavia no tiene fecha de fin.
CREATE OR REPLACE FUNCTION incapacidad_entra_por_corte(a ausentismo)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $corte$
  SELECT a.eliminado_at IS NULL
     AND a.fecha_inicio IS NOT NULL
     AND a.fecha_inicio >= incapacidad_corte()
     AND (
       upper(COALESCE(a.origen, '')) IN ('AT', 'EL')
       OR (a.dias_it_pagados IS NOT NULL
           AND a.dias_it_pagados >= incapacidad_dias_min_entrada(a))
     );
$corte$;

COMMENT ON FUNCTION incapacidad_entra_por_corte(ausentismo) IS
  'Regla de ingreso al modulo de recuperacion: vigente, iniciada en el corte o despues y, si la paga una EPS, de mas de 2 dias. La ARL entra siempre.';

-- ── 3. El trigger devuelve al alcance lo que vuelve a estar dentro ──────────
-- Misma funcion de la migracion 20260911201033, con un bloque nuevo al
-- principio: si el expediente esta retirado y la matriz lo devuelve al alcance,
-- se reingresa en vez de quedarse fuera de la bandeja para siempre. Se copia
-- entera porque CREATE OR REPLACE FUNCTION exige el cuerpo completo.
CREATE OR REPLACE FUNCTION incapacidad_matriz_actualizada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $matriz$
DECLARE
  v_exp incapacidad_expedientes%ROWTYPE;
  v_cambios JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_exp FROM incapacidad_expedientes WHERE ausentismo_id = NEW.id;

  -- Retirado por el umbral y la matriz lo devuelve al alcance: una incapacidad
  -- de EPS de 2 dias que se corrige a 5, por ejemplo. Sin esto el expediente
  -- se quedaria fuera de la bandeja para siempre, porque mas abajo la funcion
  -- solo crea expediente cuando NO existe ninguno.
  IF v_exp.eliminado_at IS NOT NULL THEN
    IF incapacidad_entra_por_corte(NEW) AND NOT incapacidad_entra_por_corte(OLD) THEN
      UPDATE incapacidad_expedientes
         SET eliminado_at = NULL,
             eliminado_por_email = NULL,
             motivo_eliminacion = NULL,
             matriz_cambio_pendiente = true,
             matriz_updated_at = NEW.updated_at
       WHERE id = v_exp.id;
      INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
      VALUES (v_exp.id, 'expediente_reingresado',
              jsonb_build_object('motivo_eliminacion', v_exp.motivo_eliminacion),
              jsonb_build_object('dias_it_pagados', NEW.dias_it_pagados, 'origen', NEW.origen),
              NEW.modificado_por_email);
    END IF;
    RETURN NEW;
  END IF;

  IF v_exp.id IS NULL THEN
    IF incapacidad_entra_por_corte(NEW) AND NOT incapacidad_entra_por_corte(OLD) THEN
      PERFORM incapacidad_expediente_desde_matriz(
        NEW,
        CASE WHEN NEW.origen_registro = 'formulario' THEN 'matriz_formulario' ELSE 'matriz_excel' END
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Eliminada en la matriz → excepción. Restaurada → vuelve a recibido.
  IF NEW.eliminado_at IS NOT NULL AND OLD.eliminado_at IS NULL THEN
    UPDATE incapacidad_expedientes
       SET estado = 'excepcion',
           motivo_excepcion = 'La incapacidad fue eliminada en la matriz EPS' ||
                              COALESCE(': ' || NEW.motivo_eliminacion, ''),
           matriz_updated_at = NEW.updated_at
     WHERE id = v_exp.id;
    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (v_exp.id, 'expediente_excepcion',
            jsonb_build_object('estado', v_exp.estado),
            jsonb_build_object('estado', 'excepcion', 'motivo', NEW.motivo_eliminacion),
            NEW.eliminado_por_email);
    RETURN NEW;
  END IF;

  IF NEW.eliminado_at IS NULL AND OLD.eliminado_at IS NOT NULL THEN
    UPDATE incapacidad_expedientes
       SET estado = CASE WHEN estado = 'excepcion' THEN 'recibido' ELSE estado END,
           motivo_excepcion = NULL,
           matriz_cambio_pendiente = true,
           matriz_updated_at = NEW.updated_at
     WHERE id = v_exp.id;
    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (v_exp.id, 'expediente_restaurado',
            jsonb_build_object('estado', v_exp.estado),
            jsonb_build_object('estado', 'recibido'),
            NEW.modificado_por_email);
    RETURN NEW;
  END IF;

  -- Campos que alimentan la liquidación o la identidad del expediente.
  IF NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio THEN v_cambios := v_cambios || jsonb_build_object('fecha_inicio', jsonb_build_array(OLD.fecha_inicio, NEW.fecha_inicio)); END IF;
  IF NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin THEN v_cambios := v_cambios || jsonb_build_object('fecha_fin', jsonb_build_array(OLD.fecha_fin, NEW.fecha_fin)); END IF;
  IF NEW.dias_it_pagados IS DISTINCT FROM OLD.dias_it_pagados THEN v_cambios := v_cambios || jsonb_build_object('dias_it_pagados', jsonb_build_array(OLD.dias_it_pagados, NEW.dias_it_pagados)); END IF;
  IF NEW.origen IS DISTINCT FROM OLD.origen THEN v_cambios := v_cambios || jsonb_build_object('origen', jsonb_build_array(OLD.origen, NEW.origen)); END IF;
  IF NEW.indicador_prorroga IS DISTINCT FROM OLD.indicador_prorroga THEN v_cambios := v_cambios || jsonb_build_object('indicador_prorroga', jsonb_build_array(OLD.indicador_prorroga, NEW.indicador_prorroga)); END IF;
  IF NEW.eps IS DISTINCT FROM OLD.eps THEN v_cambios := v_cambios || jsonb_build_object('eps', jsonb_build_array(OLD.eps, NEW.eps)); END IF;
  IF NEW.arl IS DISTINCT FROM OLD.arl THEN v_cambios := v_cambios || jsonb_build_object('arl', jsonb_build_array(OLD.arl, NEW.arl)); END IF;
  IF NEW.cedula IS DISTINCT FROM OLD.cedula THEN v_cambios := v_cambios || jsonb_build_object('cedula', jsonb_build_array(OLD.cedula, NEW.cedula)); END IF;
  IF NEW.nombre IS DISTINCT FROM OLD.nombre THEN v_cambios := v_cambios || jsonb_build_object('nombre', jsonb_build_array(OLD.nombre, NEW.nombre)); END IF;
  IF NEW.cargo IS DISTINCT FROM OLD.cargo THEN v_cambios := v_cambios || jsonb_build_object('cargo', jsonb_build_array(OLD.cargo, NEW.cargo)); END IF;
  IF NEW.tipo_conductor IS DISTINCT FROM OLD.tipo_conductor THEN v_cambios := v_cambios || jsonb_build_object('tipo_conductor', jsonb_build_array(OLD.tipo_conductor, NEW.tipo_conductor)); END IF;
  IF NEW.cie10 IS DISTINCT FROM OLD.cie10 THEN v_cambios := v_cambios || jsonb_build_object('cie10', jsonb_build_array(OLD.cie10, NEW.cie10)); END IF;
  IF NEW.diagnostico IS DISTINCT FROM OLD.diagnostico THEN v_cambios := v_cambios || jsonb_build_object('diagnostico', jsonb_build_array(OLD.diagnostico, NEW.diagnostico)); END IF;

  IF v_cambios <> '{}'::jsonb THEN
    UPDATE incapacidad_expedientes
       SET matriz_cambio_pendiente = true,
           matriz_updated_at = NEW.updated_at
     WHERE id = v_exp.id;
    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (v_exp.id, 'expediente_matriz_cambiada', NULL, v_cambios, NEW.modificado_por_email);
  END IF;

  RETURN NEW;
END;
$matriz$;

-- El trigger en si no cambia; se vuelve a declarar por si la funcion se
-- hubiera recreado con otra firma.
DROP TRIGGER IF EXISTS trg_incapacidad_matriz_actualizada ON ausentismo;
CREATE TRIGGER trg_incapacidad_matriz_actualizada
  AFTER UPDATE ON ausentismo
  FOR EACH ROW EXECUTE FUNCTION incapacidad_matriz_actualizada();

-- ── 4. La vista: el umbral por defecto sale ahora de la funcion ─────────────
-- Se recrea entera (misma definicion de la migracion de recaudos, cambiando
-- solo el calculo de `cobrable`); al recrearla se pierden los permisos, por
-- eso se vuelven a conceder mas abajo.
DROP VIEW IF EXISTS vw_incapacidad_expedientes;
CREATE VIEW vw_incapacidad_expedientes AS
SELECT
  e.id,
  e.ausentismo_id,
  e.recibido_at,
  e.recibido_desde,
  e.matriz_cambio_pendiente,
  e.persona_fuente,
  e.salario_base,
  e.salario_vigencia_desde,
  e.salario_fuente,
  e.tipo_homologado,
  e.entidad_catalogo_id,
  e.entidad_nombre_recibido,
  e.pendiente_homologacion,
  e.modalidad_ajustada,
  e.dias_entidad_ajustados,
  e.valor_reclamado_ajustado,
  e.responsable_email,
  e.estado,
  e.motivo_excepcion,
  e.valor_reclamado,
  e.proxima_accion,
  e.proxima_accion_fecha,
  e.observaciones,
  e.alta_manual_motivo,
  e.cerrado_at,
  e.cerrado_por_email,
  e.motivo_cierre,
  e.cierre_por_excepcion,
  e.version,
  e.updated_at,
  -- De la matriz (solo lectura).
  a.cedula,
  a.nombre,
  a.cargo,
  a.tipo_conductor,
  a.consecutivo_incapacidad,
  a.fecha_inicio,
  a.fecha_fin,
  a.dias_it_pagados            AS dias_incapacidad,
  a.origen,
  a.indicador_prorroga,
  incapacidad_pagador(a)       AS pagador_recibido,
  a.cie10,
  a.diagnostico,
  a.origen_registro,
  a.eliminado_at               AS matriz_eliminada_at,
  -- Entidad homologada.
  c.nombre                     AS entidad_nombre,
  c.clase                      AS entidad_clase,
  c.nit                        AS entidad_nit,
  c.dias_min_cobro             AS entidad_dias_min_cobro,
  (a.dias_it_pagados IS NOT NULL AND a.dias_it_pagados >= COALESCE(
      c.dias_min_cobro,
      incapacidad_dias_min_defecto(a.origen))) AS cobrable,
  -- Liquidación vigente.
  l.id                         AS liquidacion_id,
  l.regla_codigo,
  l.dias_entidad,
  l.dias_empresa,
  l.valor_total,
  l.valor_entidad,
  l.valor_empresa,
  l.calculado_at,
  (SELECT count(*) FROM incapacidad_ajustes_liquidacion j WHERE j.expediente_id = e.id) AS ajustes,
  (SELECT count(*) FROM incapacidad_adjuntos d WHERE d.expediente_id = e.id AND d.anulado_at IS NULL) AS adjuntos,
  -- Radicación activa (solicitada o radicada).
  r.id                         AS radicacion_id,
  r.estado                     AS radicacion_estado,
  r.codigo_radicacion          AS radicacion_codigo,
  r.fecha_solicitud            AS radicacion_fecha_solicitud,
  r.fecha_radicacion           AS radicacion_fecha,
  r.valor_reclamado            AS radicacion_valor,
  r.bajo_umbral                AS radicacion_bajo_umbral,
  (r.estado = 'radicada')      AS cobrada,
  (SELECT count(*) FROM incapacidad_radicaciones x WHERE x.expediente_id = e.id AND x.estado = 'devuelta') AS devoluciones,
  -- Componentes del saldo (base exigible = valor_reclamado, 12.5 por confirmar).
  COALESCE(ab.abonos, 0)       AS abonos_aplicados,
  ab.ultimo_giro,
  COALESCE(aj.ajustes, 0)      AS ajustes_saldo,
  CASE WHEN e.valor_reclamado IS NULL THEN NULL
       ELSE e.valor_reclamado - COALESCE(ab.abonos, 0) - COALESCE(aj.ajustes, 0) END AS saldo_operativo
FROM incapacidad_expedientes e
JOIN ausentismo a ON a.id = e.ausentismo_id
LEFT JOIN ausentismo_catalogos c ON c.id = e.entidad_catalogo_id
LEFT JOIN incapacidad_liquidaciones l ON l.expediente_id = e.id AND l.es_vigente
LEFT JOIN incapacidad_radicaciones r ON r.expediente_id = e.id AND r.estado IN ('solicitada', 'radicada')
LEFT JOIN LATERAL (
  SELECT sum(ap.valor_aplicado) AS abonos, max(rc.fecha_giro) AS ultimo_giro
  FROM incapacidad_recaudo_aplicaciones ap
  JOIN incapacidad_recaudos rc ON rc.id = ap.recaudo_id
  WHERE ap.expediente_id = e.id AND ap.anulada_at IS NULL AND rc.anulado_at IS NULL
) ab ON true
LEFT JOIN LATERAL (
  SELECT sum(valor) AS ajustes
  FROM incapacidad_ajustes x
  WHERE x.expediente_id = e.id AND x.extingue_saldo AND x.anulado_at IS NULL
) aj ON true
WHERE e.eliminado_at IS NULL;

REVOKE ALL ON vw_incapacidad_expedientes FROM anon, authenticated, public;
GRANT SELECT ON vw_incapacidad_expedientes TO service_role;

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

-- ── 6. Comprobacion ─────────────────────────────────────────────────────────
-- Lo que queda en la bandeja y con que umbral. Esperado tras aplicar: ningun
-- expediente vigente de EPS por debajo de su umbral.
SELECT
  CASE WHEN upper(COALESCE(origen, '')) IN ('AT', 'EL') THEN 'ARL' ELSE 'EPS' END AS clase,
  count(*) FILTER (WHERE cobrable)     AS cobrables,
  count(*) FILTER (WHERE NOT cobrable) AS bajo_umbral,
  count(*)                             AS total
FROM vw_incapacidad_expedientes
GROUP BY 1
ORDER BY 1;

SELECT tipo, nombre, dias_min_cobro
  FROM ausentismo_catalogos
 WHERE tipo IN ('EPS', 'ARL') AND activo
 ORDER BY tipo, nombre;
