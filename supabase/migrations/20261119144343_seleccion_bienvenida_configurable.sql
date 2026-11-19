-- Selección: la bienvenida del catálogo de mensajes pasa a ser el saludo real
--
-- Contexto: el mensaje «bienvenida» de Selección → Mensajes no se usaba en
-- ninguna parte; el asistente saludaba con la sección «Saludo» de su prompt.
-- Desde ahora el asistente usa el texto del catálogo en su primera respuesta,
-- así que Gestión Humana lo puede cambiar sin tocar el prompt. El texto
-- sembrado en la entrega 1 quedó viejo (pedía edad, ciudad, licencia y hoja de
-- vida de una vez, antes de la cédula): se reemplaza por el saludo que el
-- asistente ya usa hoy, para que nada cambie al aplicar esto.
--
-- No necesita plantilla de Meta: el saludo siempre responde a un mensaje del
-- aspirante, con la ventana de 24 horas abierta.
--
-- Solo cambia el texto si nadie lo ha editado (sigue igual al sembrado).
-- Idempotente.

UPDATE seleccion_mensajes
SET texto = CASE
      WHEN texto = 'Hola, {nombre}. Gracias por escribir a La Carolina. Para seguir con tu proceso como conductor cuéntanos: ¿cuántos años tienes?, ¿en qué ciudad vives?, ¿qué categoría de licencia tienes? y ¿cuánto tiempo llevas manejando? Envíanos también tu hoja de vida, puede ser en foto o PDF.'
      THEN $txt$¡Hola! Te saluda Angie, del área de Reclutamiento de Transportes La Carolina. 😊
Gracias por tu interés en nuestra vacante de conductor de busetas en Barranquilla y Soledad.
Para empezar, envíame una foto de tu cédula por ambos lados (frente y reverso). Si prefieres, escríbeme tu número de cédula, tu primer apellido y la fecha de expedición. Con eso revisamos enseguida tu licencia.$txt$
      ELSE texto
    END,
    texto_sugerido = $txt$¡Hola! Te saluda Angie, del área de Reclutamiento de Transportes La Carolina. 😊
Gracias por tu interés en nuestra vacante de conductor de busetas en Barranquilla y Soledad.
Para empezar, envíame una foto de tu cédula por ambos lados (frente y reverso). Si prefieres, escríbeme tu número de cédula, tu primer apellido y la fecha de expedición. Con eso revisamos enseguida tu licencia.$txt$,
    cuando = 'Primera respuesta del asistente a quien escribe',
    modo = 'automatico',
    updated_at = now()
WHERE clave = 'bienvenida';
