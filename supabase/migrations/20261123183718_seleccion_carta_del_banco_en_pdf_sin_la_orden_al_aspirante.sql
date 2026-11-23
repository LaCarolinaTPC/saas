-- Selección: al aspirante solo le va la carta del banco (en PDF), no la orden
--
-- Contexto: pedido del 23-nov-2026. La orden de exámenes trae los datos del
-- laboratorio y es para el laboratorio (se le manda en la «Orden del día»); al
-- aspirante ya no se le envía. La carta del banco sale en PDF para que la
-- imprima. El mensaje de la cita de la fase 1 decía «te enviamos la orden de
-- exámenes y la carta para el banco: llévalas»; ahora solo habla de la carta.
-- Solo cambia el texto si nadie lo editó a mano (el sugerido cambia siempre).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

UPDATE seleccion_mensajes
SET texto = $t$Hola, {nombre}. Aprobaste la prueba de manejo. El {fecha} te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Por aquí te enviamos la carta para abrir tu cuenta en el banco: imprímela y llévala.$t$,
    updated_at = now()
WHERE clave = 'examenes_fase1'
  AND texto = $t$Hola, {nombre}. Aprobaste la prueba de manejo. El {fecha} te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Por aquí te enviamos la orden de exámenes y la carta para el banco: llévalas.$t$;

UPDATE seleccion_mensajes
SET texto_sugerido = $t$Hola, {nombre}. Aprobaste la prueba de manejo. El {fecha} te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Por aquí te enviamos la carta para abrir tu cuenta en el banco: imprímela y llévala.$t$
WHERE clave = 'examenes_fase1';
