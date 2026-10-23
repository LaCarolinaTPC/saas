-- accidentes exigen numero interno del vehiculo
--
-- El N.º interno es la llave con la que un accidente se imputa al bus
-- (mantenimiento, propietario, ruta, indicadores por vehículo). El formulario
-- lo pedía pero no lo exigía, y se guardaron 7 reportes de los 1.575 con
-- `vehiculo_codigo` nulo —todos recientes, y 6 de ellos CON placa escrita a
-- mano: la gente tecleaba la placa en vez de elegir del buscador, y el código,
-- que solo se llenaba al elegir una sugerencia, quedaba vacío—.
--
-- La aplicación ya lo bloquea en las tres capas (asistente, edición y
-- servidor, con la misma regla `faltantesVehiculoPropio`). Esto es la última:
-- lo que no se puede escribir desde la aplicación tampoco debería poder
-- escribirse desde un script o desde el SQL Editor.
--
-- `NOT VALID` es lo que hace esto aplicable HOY: la restricción rige para toda
-- fila nueva o modificada y **deja en paz las 7 históricas**. Un `NOT NULL`
-- normal fallaría al aplicarse, y "arreglar" esas filas con un valor inventado
-- sería peor que el problema: nadie sabe qué bus era.
--
-- Esas 7 se completan por el flujo normal: el revisor las devuelve a «falta de
-- información» y quien reporta elige el vehículo; con la placa que traen, el
-- formulario resuelve el código solo. Cuando no quede ninguna, se puede
-- validar con:
--     ALTER TABLE public.accidentes
--       VALIDATE CONSTRAINT accidentes_vehiculo_codigo_obligatorio;
--
-- NO se exige que el código exista en el maestro `vehiculos`: de los 159
-- códigos usados hay uno (903) que no está, y rechazarlo sería inventar un
-- bloqueo donde el dato es correcto.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.accidentes'::regclass
      AND conname = 'accidentes_vehiculo_codigo_obligatorio'
  ) THEN
    ALTER TABLE public.accidentes
      ADD CONSTRAINT accidentes_vehiculo_codigo_obligatorio
      CHECK (vehiculo_codigo IS NOT NULL AND btrim(vehiculo_codigo) <> '')
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT accidentes_vehiculo_codigo_obligatorio ON public.accidentes IS
  'N.º interno del vehículo de la empresa: obligatorio desde 2026-10-23. NOT VALID a propósito: las 7 filas anteriores sin el dato se completan a mano desde «falta de información».';
