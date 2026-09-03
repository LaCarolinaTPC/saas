-- Matriz de Ausentismo: IPS y profesional validados en la base
--
-- Contexto. Desde la migración 20260902220946 la IPS y el profesional
-- responsable de cada incapacidad deben existir en `ausentismo_catalogos`,
-- pero esa regla vivía solo en la aplicación: el formulario la exige y la
-- carga por Excel la ignora. Con cada carga podían entrar IPS o profesionales
-- nuevos que después el formulario no dejaba editar ("no está en el
-- catálogo"), y cualquier escritura directa en la tabla se saltaba la regla.
--
-- Este trigger lleva la validación a la base:
--   * Normaliza los dos campos a la escritura canónica del catálogo, usando
--     la misma clave sin tildes ni mayúsculas (`ausentismo_clave`).
--   * Si la fila viene del formulario y el valor no existe o está inactivo,
--     rechaza la operación con un mensaje que el formulario muestra tal cual.
--   * Si la fila viene del Excel y el valor no existe, lo da de alta en el
--     catálogo marcado "por verificar", igual que lo que se crea desde el
--     selector, para que RRHH lo revise sin frenar la carga. Al profesional
--     nuevo se le liga la IPS de esa fila; a uno existente sin IPS habitual
--     se le asigna la primera con la que aparece.
--   * Solo valida valores no nulos: las filas históricas sin dato no se rompen.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda.
--
-- No crea tablas: no hacen falta GRANT nuevos. La función corre con los
-- privilegios de quien escribe en `ausentismo` (service_role desde la app),
-- que ya tiene acceso a `ausentismo_catalogos`.

-- ── 1. Catálogo al día con la matriz ─────────────────────────────────────────
-- Por si una carga entró entre la migración anterior y esta: lo que la matriz
-- ya tiene y el catálogo no, se registra por verificar.
INSERT INTO ausentismo_catalogos (tipo, nombre, verificado, usos, ultimo_uso)
SELECT 'IPS', ausentismo_limpio(a.ips), false, count(*), max(a.fecha_inicio)
FROM ausentismo a
WHERE a.ips IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ausentismo_catalogos c
    WHERE c.tipo = 'IPS' AND ausentismo_clave(c.nombre) = ausentismo_clave(a.ips)
  )
GROUP BY ausentismo_limpio(a.ips), ausentismo_clave(a.ips)
ON CONFLICT DO NOTHING;

INSERT INTO ausentismo_catalogos (tipo, nombre, relacionado, verificado, usos, ultimo_uso)
SELECT 'PROFESIONAL', ausentismo_limpio(a.profesional_responsable),
       (SELECT ausentismo_limpio(b.ips) FROM ausentismo b
         WHERE ausentismo_clave(b.profesional_responsable) = ausentismo_clave(a.profesional_responsable)
           AND b.ips IS NOT NULL
         GROUP BY ausentismo_limpio(b.ips) ORDER BY count(*) DESC LIMIT 1),
       false, count(*), max(a.fecha_inicio)
FROM ausentismo a
WHERE a.profesional_responsable IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ausentismo_catalogos c
    WHERE c.tipo = 'PROFESIONAL'
      AND ausentismo_clave(c.nombre) = ausentismo_clave(a.profesional_responsable)
  )
GROUP BY ausentismo_limpio(a.profesional_responsable), ausentismo_clave(a.profesional_responsable)
ON CONFLICT DO NOTHING;

-- ── 2. Función del trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ausentismo_valida_ips_profesional()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_formulario BOOLEAN := COALESCE(NEW.origen_registro, 'excel') = 'formulario';
  v_ips ausentismo_catalogos%ROWTYPE;
  v_prof ausentismo_catalogos%ROWTYPE;
BEGIN
  NEW.ips := ausentismo_limpio(NEW.ips);
  NEW.profesional_responsable := ausentismo_limpio(NEW.profesional_responsable);

  -- IPS
  IF NEW.ips IS NOT NULL THEN
    SELECT * INTO v_ips
    FROM ausentismo_catalogos
    WHERE tipo = 'IPS' AND ausentismo_clave(nombre) = ausentismo_clave(NEW.ips)
    LIMIT 1;

    IF FOUND THEN
      IF v_formulario AND NOT v_ips.activo THEN
        RAISE EXCEPTION 'La IPS "%" está inactiva en el catálogo.', v_ips.nombre
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.ips := v_ips.nombre;
    ELSIF v_formulario THEN
      RAISE EXCEPTION 'La IPS "%" no está en el catálogo. Elígela de la lista o créala.', NEW.ips
        USING ERRCODE = 'check_violation';
    ELSE
      INSERT INTO ausentismo_catalogos (tipo, nombre, verificado, usos, ultimo_uso)
      VALUES ('IPS', NEW.ips, false, 1, NEW.fecha_inicio)
      ON CONFLICT (tipo, (ausentismo_clave(nombre))) WHERE tipo NOT IN ('CIE10','CIE10_LETRA')
      DO NOTHING;
    END IF;
  END IF;

  -- Profesional responsable
  IF NEW.profesional_responsable IS NOT NULL THEN
    SELECT * INTO v_prof
    FROM ausentismo_catalogos
    WHERE tipo = 'PROFESIONAL'
      AND ausentismo_clave(nombre) = ausentismo_clave(NEW.profesional_responsable)
    LIMIT 1;

    IF FOUND THEN
      IF v_formulario AND NOT v_prof.activo THEN
        RAISE EXCEPTION 'El profesional "%" está inactivo en el catálogo.', v_prof.nombre
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.profesional_responsable := v_prof.nombre;
      -- Sin IPS habitual: se le asigna la primera con la que aparece.
      IF v_prof.relacionado IS NULL AND NEW.ips IS NOT NULL THEN
        UPDATE ausentismo_catalogos SET relacionado = NEW.ips WHERE id = v_prof.id;
      END IF;
    ELSIF v_formulario THEN
      RAISE EXCEPTION 'El profesional "%" no está en el catálogo. Elígelo de la lista o créalo.',
        NEW.profesional_responsable
        USING ERRCODE = 'check_violation';
    ELSE
      INSERT INTO ausentismo_catalogos (tipo, nombre, relacionado, verificado, usos, ultimo_uso)
      VALUES ('PROFESIONAL', NEW.profesional_responsable, NEW.ips, false, 1, NEW.fecha_inicio)
      ON CONFLICT (tipo, (ausentismo_clave(nombre))) WHERE tipo NOT IN ('CIE10','CIE10_LETRA')
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Trigger ───────────────────────────────────────────────────────────────
-- BEFORE, para poder reescribir los campos con la forma canónica. Se dispara
-- también en el UPDATE que hace el upsert de la carga cuando la fila ya existe.
DROP TRIGGER IF EXISTS trg_ausentismo_valida_ips_profesional ON ausentismo;
CREATE TRIGGER trg_ausentismo_valida_ips_profesional
  BEFORE INSERT OR UPDATE OF ips, profesional_responsable, origen_registro ON ausentismo
  FOR EACH ROW EXECUTE FUNCTION ausentismo_valida_ips_profesional();

-- ── 4. Homologar la escritura de lo ya cargado ───────────────────────────────
-- Fuerza el trigger sobre las filas cuyo texto difiere del catálogo solo en
-- tildes, mayúsculas o espacios, para que la matriz quede con una sola forma.
UPDATE ausentismo a
SET ips = a.ips
WHERE a.ips IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM ausentismo_catalogos c
    WHERE c.tipo = 'IPS'
      AND ausentismo_clave(c.nombre) = ausentismo_clave(a.ips)
      AND c.nombre <> a.ips
  );

UPDATE ausentismo a
SET profesional_responsable = a.profesional_responsable
WHERE a.profesional_responsable IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM ausentismo_catalogos c
    WHERE c.tipo = 'PROFESIONAL'
      AND ausentismo_clave(c.nombre) = ausentismo_clave(a.profesional_responsable)
      AND c.nombre <> a.profesional_responsable
  );
