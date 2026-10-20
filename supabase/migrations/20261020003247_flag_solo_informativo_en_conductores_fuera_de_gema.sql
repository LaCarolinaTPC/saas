-- Flag «solo informativo» en conductores que no están en GEMA
--
-- GEMA es el dueño del maestro de conductores: Gestivo lo refresca a diario
-- desde la vista `vst_ext_get_conductores`. Pero Contratación también crea la
-- ficha al contratar, con la cédula escrita en el proceso, contando con que
-- GEMA la complete en el siguiente sync.
--
-- Si esa cédula va mal digitada, GEMA nunca la reconoce —el upsert es por
-- cédula— y la ficha se queda en ACTIVO para siempre: un conductor que no
-- existe, indistinguible de uno real para cualquier pantalla. El 2026-10-19
-- había 19 así, ninguna con un viaje despachado desde junio. Ejemplo: la cédula
-- 100191507 («ALEJANDRO GONZALEZ») es 1001915077 («GONZALEZ GONZALEZ ALEJANDRO
-- ARNALDO», retirado desde febrero) sin el último dígito.
--
-- Hasta ahora se deducía por `codigo IS NULL` (el `codigo_personal` de GEMA, que
-- el sync siempre escribe). Funciona, pero es implícito: nadie que mire la tabla
-- o la Data API entiende qué significa. Esta columna lo dice en voz alta.
--
-- Qué significa `solo_informativo = true`: la ficha **no está en GEMA**, así que
-- está solo para no perder lo que ya cuelga de ella —había 10 registros de
-- ausentismo y 594 marcaciones del biométrico a nombre de tres de esas cédulas,
-- que son ausencias y huellas de personas REALES mal archivadas— y **no debe
-- usarse en ningún proceso de la compañía**: ni plantilla de ausentismo, ni base
-- de la tasa, ni candidatos a ausencia en Marcaciones.
--
-- Quién la mantiene: el sync de GEMA. Pone `false` en todo lo que la vista trae
-- y `true` en lo que sobrevive al espejo porque tiene historial colgando (una
-- ficha sin historial se borra). Contratación crea sus altas con `true`, y pasan
-- a `false` solas cuando GEMA confirma la cédula.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a mano
-- en el SQL Editor del Studio, así que el script corre entero de una sola vez y
-- es idempotente.

ALTER TABLE conductores
  ADD COLUMN IF NOT EXISTS solo_informativo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN conductores.solo_informativo IS
  'true = la ficha NO está en GEMA (cédula mal digitada al contratar). Se conserva '
  'solo para no perder el historial que cuelga de ella y NO debe usarse en procesos '
  'de la compañía: queda fuera de la plantilla de ausentismo, de la base de la tasa '
  'y de los candidatos a ausencia. Lo mantiene el sync de GEMA; ver '
  'src/lib/conductores/confirmacion.ts y npm run conductores:revisar-altas.';

-- Backfill con la señal que se venía usando: sin `codigo` de GEMA, la ficha
-- nunca pasó por el sync. Se escribe solo donde hace falta para que volver a
-- correr el script no toque filas de más.
UPDATE conductores
   SET solo_informativo = true
 WHERE (codigo IS NULL OR btrim(codigo) = '')
   AND solo_informativo = false;

UPDATE conductores
   SET solo_informativo = false
 WHERE codigo IS NOT NULL
   AND btrim(codigo) <> ''
   AND solo_informativo = true;

-- Las consultas de las pantallas filtran por este flag sobre el maestro
-- completo, así que conviene el índice parcial: las informativas son dos
-- docenas contra 1.289 filas.
CREATE INDEX IF NOT EXISTS conductores_solo_informativo_idx
  ON conductores (solo_informativo)
  WHERE solo_informativo;

-- Comprobación: debe listar las fichas fuera de GEMA y cuadrar con `codigo`.
SELECT
  count(*) FILTER (WHERE solo_informativo)                        AS solo_informativo,
  count(*) FILTER (WHERE NOT solo_informativo)                    AS en_gema,
  count(*) FILTER (WHERE solo_informativo AND estado = 'ACTIVO')  AS informativas_activas,
  count(*) FILTER (
    WHERE solo_informativo <> (codigo IS NULL OR btrim(codigo) = '')
  )                                                               AS descuadres,
  count(*)                                                        AS total
FROM conductores;
