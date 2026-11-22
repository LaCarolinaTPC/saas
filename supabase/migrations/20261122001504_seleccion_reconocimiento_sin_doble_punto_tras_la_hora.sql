-- Reconocimiento de ruta: sin doble punto después de la hora (22-nov-2026)
--
-- Contexto: en la prueba completa del 21-nov los mensajes del reconocimiento
-- decían «…a las 9:00 a. m..». La hora ya termina en punto («a. m.») y el
-- texto ponía otro después del asterisco del negrito, así que no se juntaban.
-- Se quita ese punto final, como en la citación a la prueba de manejo.
--
-- Solo toca «{hora}*.» al final de una línea (si alguien reescribió esa parte,
-- no cambia nada). Los saltos de línea pueden ser \n o \r\n (el SQL Editor
-- guarda \r\n). Las plantillas de Meta de estos tres mensajes se vuelven a
-- enviar con el texto nuevo.
--
-- Idempotente.

UPDATE seleccion_mensajes
SET texto = regexp_replace(texto, '\{hora\}\*\.(\r?\n)', '{hora}*\1', 'g'),
    texto_sugerido = regexp_replace(texto_sugerido, '\{hora\}\*\.(\r?\n)', '{hora}*\1', 'g'),
    updated_at = now()
WHERE clave IN ('reconocimiento_ruta', 'reconocimiento_siguiente', 'reconocimiento_reprogramado')
  AND (texto ~ '\{hora\}\*\.\r?\n' OR texto_sugerido ~ '\{hora\}\*\.\r?\n');
