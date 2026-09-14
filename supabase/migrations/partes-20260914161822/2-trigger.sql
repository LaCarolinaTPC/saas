-- Parte 2 de 5 de la migracion 20260914161822: el trigger que reingresa lo que vuelve al alcance.
--
-- Se parte en cinco porque el SQL Editor estaba ejecutando el texto viejo
-- guardado en la pestaña. Pegue cada parte en una pestaña NUEVA y en orden:
-- 1 funciones, 2 trigger, 3 vista, 4 limpieza, 5 comprobacion.
--
-- Que debe salir: CREATE FUNCTION y CREATE TRIGGER. Es el trozo largo: casi todo es la funcion existente, copiada sin cambios salvo el bloque del principio.
--
-- El archivo completo, con el contexto y el porque, esta en
-- supabase/migrations/20260914161822_incapacidades_umbral_de_entrada_eps_desde_3_dias_y_arl_todas.sql

SELECT 'parte 2 de 5 · migracion 20260914161822' AS ejecutando;
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
