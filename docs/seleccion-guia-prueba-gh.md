# Guía de prueba — Asistente de selección de conductores

Para: Gestión Humana · Entrega 1 · noviembre de 2026

## Qué cambió

El asistente de WhatsApp ahora lleva al aspirante de principio a fin en la primera etapa:

- Pide los 7 datos (nombre, cédula, edad, ciudad o traslado, licencia, experiencia y hoja de vida) y la autorización de datos.
- Con esos datos crea el proceso en Candidatos, sin duplicar a nadie, y calcula el semáforo de preselección (edad, residencia, licencia y SIMIT con Croma).
- Si alguien claramente no cumple (por ejemplo, licencia B1), se lo dice con amabilidad y no le pide más datos. El cierre queda propuesto para que ustedes lo confirmen.
- Pasa el chat a una persona solo cuando hace falta: si lo piden, si es una queja sobre su proceso o algo grave (acoso, accidente, amenaza, salud) o si después de tres intentos no se le entiende.
- Este número es solo para el proceso de selección: a quien escribe por otro tema (ofrece productos o servicios, es trabajador o pasajero, número equivocado) lo despide con amabilidad, sin pasar el chat.
- Cuando el aspirante completa todo, el chat queda marcado **«Listo para citar»** y el asistente sigue resolviendo dudas hasta que alguien de Gestión Humana escriba.
- Si el aspirante deja de responder, recibe un primer aviso a las 24 horas y un segundo a los 3 días (este lo revisan ustedes antes de enviarlo). Si sigue sin responder, el chat queda marcado **«Llamar»** y, a los 7 días, el proceso se cierra como «Incomunicado».

## Dónde probar

**Candidatos › Selección: mensajes y reglas › Probar el asistente.** Es un chat de prueba: no envía nada por WhatsApp ni guarda nada. Responde con la configuración real del asistente.

Cada mensaje que escriban usa una consulta a la inteligencia artificial, que tiene un costo pequeño. Prueben con calma, sin repetir mensajes de más.

| Parte de la pantalla | Para qué sirve |
|---|---|
| Caso listo + Reproducir | Corre un caso ya armado y dice si el asistente hizo lo esperado. Muestra cuántas consultas cuesta |
| Cuadro de texto | Escriban como lo haría un aspirante, con faltas, abreviaturas o en mayúsculas |
| Foto, Documento, Audio, Sticker, Video | Simulan que el aspirante manda un archivo. El texto escrito va como pie |
| Varios mensajes seguidos | Simula que el aspirante manda varios mensajes antes de que el asistente responda |
| Qué pasaría en Gestivo › Calcular | Muestra los datos que leyó, el semáforo, si crearía el proceso y si quedaría «Listo para citar» |
| SIMIT simulado / Consultar Croma de verdad | Prueba el semáforo con un valor de multas. «Consultar Croma» hace una consulta real con la cédula del chat |
| Si deja de responder | Muestra qué mensajes saldrían a las 24 horas, a los 4, 5 y 8 días, y con qué texto |

## Casos para probar

Para cada caso, escriban lo de la segunda columna (pueden cambiar las palabras) y revisen que pase lo de la tercera.

| # | Qué escribir | Qué debe pasar |
|---|---|---|
| 1 | Todos los datos en un mensaje: nombre, cédula, edad, Soledad o Barranquilla, licencia C2 y años de experiencia | Pide la hoja de vida y la autorización. En «Calcular»: datos completos, semáforo en verde, proceso en Antecedentes, «Listo para citar» |
| 2 | Los datos de a uno, con respuestas cortas («c2», «34», «soledad») | Entiende cada respuesta y no repite preguntas |
| 3 | «Vivo en Cartagena pero me puedo trasladar» | Lo toma como requisito cumplido y sigue. No pasa el chat |
| 4 | Licencia B1 | Le explica con amabilidad que se pide C2 o C3. No pide más datos ni pasa el chat. Semáforo: se propone cerrar |
| 5 | «Tengo 60 años» | Le explica el rango de edad (20 a 57). No pasa el chat |
| 6 | Vive en Santa Marta y no se puede mudar | Le explica el requisito de residencia. No pasa el chat |
| 7 | No acepta la autorización | Le explica para qué es, pregunta una vez si lo reconsidera y se despide. No pasa el chat |
| 8 | Con faltas: «ola tng licensia c2 k nomas piden» | Le entiende sin decir «no te entendí» |
| 9 | Manda un audio | Le pide con amabilidad que lo escriba. No pasa el chat |
| 10 | «¿Cuánto pagan?» e insiste | No da cifras. Responde que eso se trata en la llamada o en la empresa |
| 11 | «¿Dónde quedan? ¿Dónde llevo la hoja de vida?» | La hoja de vida se manda por el chat; la dirección se da con la cita |
| 12 | «Ya hice el proceso, ¿cuándo me llaman?» | Gestión Humana lo contactará. No pasa el chat |
| 13 | «Tengo un comparendo, ¿me descartan?» | No necesariamente; el total no debe pasar de $3.000.000 |
| 14 | «Quiero hablar con una persona» | Pasa el chat a una persona |
| 15 | «Ya trabajo con ustedes y no me han pagado» | Le explica con amabilidad que este número es solo para el proceso de selección y que use los canales habituales. No pasa el chat ni le hace las preguntas de selección |
| 15b | «Les ofrezco llantas y repuestos para la flota» | Lo despide con amabilidad: este número es solo para selección. No pasa el chat |
| 15c | «Un supervisor me está acosando» | Pasa el chat a una persona |
| 16 | «Si deja de responder» › 8 días | Primer aviso a las 24 h, borrador del segundo a las 96 h, «Llamar» a las 120 h y cierre a las 168 h |

Si algo no pasa como dice la tabla, repórtenlo (ver abajo).

## Instrucciones del asistente: lo que cambió

Las instrucciones propuestas (el «prompt») están aprobadas y son las que usa el asistente por defecto, con Claude Haiku 5.5 como modelo fijo. Conservan la forma de hablar de Angie y corrigen esto:

| Tema | Antes | Ahora |
|---|---|---|
| Edad | 20 a 55 años | 20 a 57 años, como en los requerimientos |
| Salario | Daba el salario mínimo si insistían | No da cifras: «eso se trata en la llamada o en la empresa» |
| Tipo de contrato | Decía fijo en un lugar e indefinido en otro | A término fijo |
| Dirección de la empresa | Pasaba el chat a una persona | «La sede está en Soledad; la dirección exacta te la damos con la cita» |
| Traslado, poca experiencia, licencia en trámite, multas | Pasaba el chat a una persona | Sigue el proceso y Gestión Humana lo revisa |
| Estudios, vigencia de la licencia y disponibilidad | Se preguntaban | No se preguntan (no están entre los requisitos) |
| «Resumen» para el equipo | El asistente lo escribía en el chat y el aspirante lo veía | Se quitó: ustedes ven la conversación completa |

## Qué falta antes de publicar

Decidir si se siguen pidiendo las fotos de la licencia y de la cédula, y llenar en **Selección › Tiempos y reglas › Datos de los mensajes**:

- la dirección de la sede (para la citación);
- el nombre del laboratorio (para los exámenes);
- los datos de la empresa para la política de tratamiento de datos: razón social, NIT, domicilio, correo y teléfono para consultas y reclamos, y fecha de vigencia. La política ya está publicada en Gestivo (`/politica-de-datos`) y el mensaje de autorización la enlaza; el área jurídica debe revisar el texto antes de publicar.

## Cómo reportar fallas

Por cada falla envíen:

1. El número del caso de la tabla, o lo que escribieron.
2. Una captura de pantalla del chat de prueba.
3. Qué esperaban que pasara.

## Después: prueba con WhatsApp real

Cuando aprueben la prueba en el chat, se publica en producción y se prueba con 2 o 3 celulares de Gestión Humana escribiendo al número de la empresa. Ahí se revisa también:

- **Candidatos › Tablero:** el aspirante aparece en Preselección y se mueve solo a Antecedentes cuando cumple.
- **La ficha del proceso:** el semáforo, la autorización, las postulaciones anteriores y el historial de cambios.
- **Comunicaciones:** las etiquetas «Listo para citar» y «Llamar», y el mensaje sugerido del segundo aviso para revisar y enviar.
