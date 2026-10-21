-- biometrico normalizar device_sn y completar sn por device_id
--
-- Contexto: la identidad de una huella es (device_sn, pin, momento), y el
-- agente ahora puede correr también en un PC sin el Access.mdb, leyendo solo el
-- lector. Que la misma huella llegue por dos caminos es lo normal, y se colapsa
-- por esa llave. Pero la llave solo colapsa si las dos vías escriben el SN
-- EXACTAMENTE igual, y el servidor hasta hoy solo le quitaba los espacios:
--
--   · «ahid222860036» y «AHID222860036» eran dos lectores distintos;
--   · una fila de la vía Access que llegara SIN serie se guardaba con '' y no
--     colapsaba con la misma huella traída por la vía equipo, que siempre la
--     trae. La migración 20261020164817 dedujo la serie del device_id una sola
--     vez, sobre el histórico; lo que llegara después sin serie quedaba suelto.
--
-- Esta migración:
--   1. normaliza lo guardado (sin espacios, en mayúsculas),
--   2. completa la serie de las filas que no la tienen con la que ya se conoce
--      para su device_id,
--   3. y deja la RPC de ingreso aplicando esas dos reglas a todo lo que llegue,
--      también desde agentes viejos.
--
-- No se toca el pin: en ZKAccess es texto y «027» y «27» son dos personas
-- distintas. Ver docs/biometrico-marcaciones.md › Verificación.
--
-- Si normalizar juntara dos filas que hoy son distintas, el script se DETIENE
-- sin cambiar nada (todo va en una transacción): serían duplicados reales que
-- hay que mirar antes de borrar nada. Lo esperable es que no haya ninguno: el
-- equipo y ZKAccess escriben la serie en mayúsculas.
--
-- Idempotente: correrla dos veces no cambia nada la segunda.

BEGIN;

-- =============================================================================
-- 1. Guarda: ¿normalizar juntaría filas?
-- =============================================================================
DO $$
DECLARE
  v_choques INTEGER;
BEGIN
  SELECT count(*) INTO v_choques
    FROM (
      SELECT 1
        FROM biometrico_marcaciones
       GROUP BY upper(btrim(device_sn)), pin, momento
      HAVING count(*) > 1
    ) g;
  IF v_choques > 0 THEN
    RAISE EXCEPTION
      'Normalizar device_sn juntaría % huella(s) que hoy están en filas distintas. No se cambió nada. '
      'Revise: SELECT upper(btrim(device_sn)), pin, momento, count(*) FROM biometrico_marcaciones '
      'GROUP BY 1, 2, 3 HAVING count(*) > 1;', v_choques;
  END IF;
END $$;

-- =============================================================================
-- 2. Normalizar lo guardado
-- =============================================================================
UPDATE biometrico_marcaciones
   SET device_sn = upper(btrim(device_sn))
 WHERE device_sn <> upper(btrim(device_sn));

-- =============================================================================
-- 3. Completar la serie de las filas que no la tienen
-- =============================================================================
-- Para buscar «la serie de este device_id» sin recorrer la tabla. Parcial: las
-- filas sin serie no sirven para responder eso.
CREATE INDEX IF NOT EXISTS biometrico_marcaciones_device_id_momento_idx
  ON biometrico_marcaciones (device_id, momento DESC)
  WHERE device_sn <> '';

-- La serie vigente de cada device_id: la de su huella más reciente.
CREATE TEMP TABLE _sn_por_device ON COMMIT DROP AS
  SELECT DISTINCT ON (device_id) device_id, device_sn
    FROM biometrico_marcaciones
   WHERE device_sn <> '' AND device_id IS NOT NULL
   ORDER BY device_id, momento DESC;

DO $$
DECLARE
  v_choques INTEGER;
BEGIN
  -- Una fila sin serie que, al completarla, coincide con otra que ya la tiene
  -- es la MISMA huella guardada dos veces. Tampoco se borra a ciegas.
  SELECT count(*) INTO v_choques
    FROM biometrico_marcaciones s
    JOIN _sn_por_device k ON k.device_id = s.device_id
    JOIN biometrico_marcaciones o
      ON o.device_sn = k.device_sn AND o.pin = s.pin AND o.momento = s.momento
   WHERE s.device_sn = '';
  IF v_choques > 0 THEN
    RAISE EXCEPTION
      'Completar la serie juntaría % fila(s) sin serie con la misma huella ya guardada con serie. '
      'No se cambió nada. Son duplicados: revíselos antes de borrar.', v_choques;
  END IF;
END $$;

UPDATE biometrico_marcaciones s
   SET device_sn = k.device_sn
  FROM _sn_por_device k
 WHERE s.device_sn = ''
   AND k.device_id = s.device_id;

-- =============================================================================
-- 4. La RPC de ingreso, con las mismas dos reglas
-- =============================================================================
-- Igual a la de 20261020164817 salvo por la serie: se normaliza y, si viene
-- vacía, se completa con la vigente de su device_id. La subconsulta solo se
-- evalúa para las filas sin serie (COALESCE se detiene en el primer valor) y
-- va por el índice de arriba, así que no encarece el envío normal.
CREATE OR REPLACE FUNCTION biometrico_ingresar_marcaciones(p_filas JSONB, p_envio_id UUID)
RETURNS TABLE (nuevas INTEGER, completadas INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH crudas AS (
    SELECT x.id_zk,
           x.pin,
           x.momento,
           x.fecha,
           x.device_id,
           x.device_name,
           COALESCE(
             NULLIF(upper(btrim(x.device_sn)), ''),
             (SELECT m.device_sn
                FROM biometrico_marcaciones m
               WHERE m.device_id = x.device_id
                 AND m.device_sn <> ''
               ORDER BY m.momento DESC
               LIMIT 1),
             '') AS device_sn,
           x.verificado,
           x.punto,
           COALESCE(x.origen, 'access') AS origen,
           x.recibido_at
      FROM jsonb_to_recordset(p_filas) AS x(
             id_zk       BIGINT,
             pin         TEXT,
             momento     TIMESTAMPTZ,
             fecha       DATE,
             device_id   INTEGER,
             device_name TEXT,
             device_sn   TEXT,
             verificado  INTEGER,
             punto       TEXT,
             origen      TEXT,
             recibido_at TIMESTAMPTZ)
  ), entrada AS (
    -- El DISTINCT ON va DESPUÉS de completar la serie: dos filas del lote que
    -- solo se diferenciaban en eso son la misma huella.
    SELECT DISTINCT ON (c.device_sn, c.pin, c.momento) c.*
      FROM crudas c
     ORDER BY c.device_sn, c.pin, c.momento, c.id_zk NULLS LAST
  ), ins AS (
    INSERT INTO biometrico_marcaciones
           (id_zk, pin, momento, fecha, device_id, device_name, device_sn,
            verificado, punto, cedula, envio_id, origen, recibido_at)
    SELECT e.id_zk, e.pin, e.momento, e.fecha, e.device_id, e.device_name, e.device_sn,
           e.verificado, e.punto, p.cedula, p_envio_id, e.origen, e.recibido_at
      FROM entrada e
      LEFT JOIN biometrico_personas p ON p.pin = e.pin
    ON CONFLICT (device_sn, pin, momento) DO UPDATE
       SET id_zk       = EXCLUDED.id_zk,
           verificado  = EXCLUDED.verificado,
           punto       = EXCLUDED.punto,
           device_id   = EXCLUDED.device_id,
           device_name = EXCLUDED.device_name,
           cedula      = COALESCE(biometrico_marcaciones.cedula, EXCLUDED.cedula)
     WHERE biometrico_marcaciones.id_zk IS NULL
       AND EXCLUDED.id_zk IS NOT NULL
    RETURNING (xmax = 0) AS insertada
  )
  SELECT count(*) FILTER (WHERE insertada)::int,
         count(*) FILTER (WHERE NOT insertada)::int
    FROM ins;
END;
$$;

COMMENT ON FUNCTION biometrico_ingresar_marcaciones(JSONB, UUID) IS
  'Ingresa un lote fusionando las dos vías por (device_sn, pin, momento). La serie se normaliza (sin espacios, mayúsculas) y, si falta, se completa con la vigente de su device_id. Devuelve cuántas se insertaron y a cuántas existentes se les completó el id_zk.';
COMMENT ON COLUMN biometrico_marcaciones.device_sn IS
  'Número de serie del lector, sin espacios y en mayúsculas. Parte de la llave natural, así que nunca NULL; si una fila llega sin él, la RPC de ingreso lo completa con el vigente de su device_id.';

GRANT EXECUTE ON FUNCTION biometrico_ingresar_marcaciones(JSONB, UUID) TO service_role;

-- =============================================================================
-- 5. Comprobación
-- =============================================================================
DO $$
DECLARE
  v_sin_normalizar INTEGER;
  v_sin_serie      INTEGER;
BEGIN
  SELECT count(*) INTO v_sin_normalizar
    FROM biometrico_marcaciones WHERE device_sn <> upper(btrim(device_sn));
  SELECT count(*) INTO v_sin_serie
    FROM biometrico_marcaciones WHERE device_sn = '';
  RAISE NOTICE 'device_sn sin normalizar: % (debe ser 0) · filas sin serie: % (las de un device_id que nunca tuvo serie)',
    v_sin_normalizar, v_sin_serie;
  IF v_sin_normalizar > 0 THEN
    RAISE EXCEPTION 'Quedaron % filas con device_sn sin normalizar.', v_sin_normalizar;
  END IF;
END $$;

COMMIT;
