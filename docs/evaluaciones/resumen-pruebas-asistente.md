# Pruebas del asistente de selección — resumen

13 de noviembre de 2026 · actualizado el 14 de noviembre

## Qué se probó

60 situaciones de aspirantes, armadas con frases reales de WhatsApp (sin datos personales):

- 15 aspirantes que cumplen;
- 10 que no cumplen;
- 11 que escriben mal, mandan audios, fotos o stickers, o no se les entiende;
- 15 con preguntas y objeciones (salario, dirección, multas, «¿cuándo me llaman?»);
- 9 casos que sí deben pasar a una persona.

Cada situación se corrió cuatro veces con conversaciones completas:

- **Corridas A y B:** con el texto de instrucciones propuesto, dos veces por separado para ver si el resultado es estable.
- **Corrida C:** con el texto de instrucciones que usa hoy Gestión Humana, para comparar.
- **Corrida H:** con el texto propuesto, pero con Claude Haiku, el modelo más barato de Claude, tanto en la conversación como en la lectura de datos. Es más parecido en capacidad al modelo económico de producción, así que la prueba es más exigente.
- **Corridas H4 y S2 (14 de noviembre):** las 60 situaciones otra vez, con las instrucciones y reglas de hoy, que incluyen lo que salió de las pruebas con modelos locales: la autorización con el texto legal exacto, la despedida a quien escribe por otro tema, la cédula enviada sola y el orden «primero la autorización, después los documentos». H4 con Claude Haiku 5.5 y S2 con Claude Sonnet 5.5, en la conversación y en la lectura de datos.

En cada conversación se revisó:

- si pasó el chat a una persona cuando no debía, o si no lo pasó cuando sí debía;
- si dio cifras de salario;
- si dejó notas para el equipo a la vista del aspirante;
- si leyó bien los datos;
- si el semáforo de preselección dio el resultado esperado.

Para no gastar crédito de la inteligencia artificial de producción, en estas corridas el asistente lo hizo otro modelo (Claude, y en la corrida H, Claude Haiku) con exactamente las mismas instrucciones. Eso valida las reglas y las instrucciones. Antes de publicar falta una verificación corta con el modelo que se usa en producción. Las corridas H4 y S2 se hicieron igual, con Claude Code: no gastaron crédito de OpenRouter.

## Resultados

| | Corrida A | Corrida B | Corrida C (instrucciones actuales) | Corrida H (Haiku) | Corrida H4 (Haiku, 14 nov) | Corrida S2 (Sonnet, 14 nov) |
|---|---|---|---|---|---|---|
| Situaciones correctas | 60 de 60 | 60 de 60 | 60 de 60 | 59 de 60 (60 de 60 tras el ajuste) | 60 de 60 | 60 de 60 |
| Pases a persona de más | 0 | 0 | 0 | 0 | 0 | 0 |
| Pases a persona que faltaron | 0 | 0 | 0 | 0 | 0 | 0 |
| Cifras de salario | 0 | 0 | 0 | 0 | 0 | 0 |
| Datos bien leídos | 100 % | 100 % | 100 % | 98,8 % (100 % tras el ajuste) | 100 % | 100 % |
| Mensajes del aspirante para completar (promedio) | 7,8 | 7,5 | 8,2 | 7,7 | 6,8 \* | 6,9 \* |
| Palabras por respuesta del asistente | 29 | 29 | 41 | 27 | 23 | 24 |
| Chats en que preguntó estudios o vigencia de la licencia | 0 | 0 | 21 | 0 | 0 | 0 |

\* Contado solo en los aspirantes que cumplen. Con ese mismo cálculo, las corridas A y H dan 8,1 y 8,0: con las reglas de hoy se necesita más o menos un mensaje menos.

En la corrida H falló una situación: el aspirante mandó su cédula sola («1002345678») cuando le preguntaban la ciudad. Haiku no la reconoció ni al conversar ni al leer los datos, y le dijo «quedaste registrado» sin tenerla. Se ajustaron las dos reglas: un número de 6 a 10 cifras es la cédula aunque no se haya pedido, salvo que parezca un celular (10 cifras que empiezan por 3), y en ese caso el asistente pregunta. Con Haiku de nuevo, la cédula suelta se lee bien y el celular no se confunde con la cédula.

En las corridas H4 y S2 (14 de noviembre) los dos modelos fallaron al principio en la misma situación: el aspirante que dice que no tiene la hoja de vida a la mano. No fue un error del asistente. Con la regla nueva todavía no le estaba pidiendo la hoja de vida (primero va la autorización), así que no tenía por qué ofrecerle alternativas. La prueba se escribió antes de esa regla y se corrigió: ahora la conversación sigue hasta que el asistente pide la hoja de vida. Ahí los dos modelos ofrecen foto, PDF o audio y no pasan el chat. Además, en las dos corridas:

- pidieron la autorización siempre con el texto legal exacto (20 de 20 chats en que tocaba pedirla);
- ninguno pidió documentos antes de la autorización (en la corrida A pasó 2 veces);
- a quien escribe por otro tema (vende algo, número equivocado, trabajador o extrabajador con un tema laboral, pasajero) lo despidieron en un solo mensaje, sin pasar el chat.

En estas 60 situaciones Haiku y Sonnet dieron el mismo resultado. Con conversaciones reales no fue así (ver la sección siguiente).

Las corridas por OpenRouter con Haiku y Sonnet del 13 de noviembre a las 6:49 p. m. (48 % y 46 % de aciertos) no sirven para comparar: la clave se quedó sin crédito a mitad de la corrida («Insufficient credits») y la mayoría de las fallas son ese error.

Con las instrucciones actuales también se aprueba todo, porque las reglas nuevas mandan sobre las contradicciones. Pero las conversaciones son más largas, y un modelo menos capaz que Claude sí puede seguir las contradicciones. Eso ya pasó en producción: en 30 días hubo 242 pases a persona (unos 85 % evitables), el asistente dio el salario y escribió «Resumen:» a los aspirantes. Por eso se recomienda adoptar las instrucciones propuestas.

Con el modelo de producción (OpenRouter económico), una corrida anterior con las instrucciones propuestas dio 66 de 68 situaciones correctas. Las dos que fallaron se corrigieron después.

## Prueba con 200 conversaciones reales (14 de noviembre)

Las 60 situaciones están armadas a mano. Para ver qué pasa con lo que escriben de verdad los aspirantes, se tomaron 200 conversaciones de WhatsApp de la base (copia de producción, del 1 de septiembre al 13 de noviembre) y se repitieron con las reglas de hoy, con Haiku 5.5 y con Sonnet 5.5.

**Cómo se eligieron.** De las 1.745 conversaciones se sacó una muestra por tramos de largo: 40 de 1 o 2 mensajes del aspirante, 60 de 3 a 6, 60 de 7 a 15 y 40 de 16 o más. Dentro de cada tramo pesaron más las que terminaron transferidas sin respuesta y las que traen audios, fotos o documentos. Quedaron 40 transferidas sin respuesta, 37 atendidas solo por Gestión Humana, 69 mixtas y 53 solo del asistente; 86 traen algún archivo. Las cédulas, los teléfonos y los correos se cambiaron por números inventados, y los nombres por nombres inventados.

**Cómo se probaron.** De cada conversación real se armó un caso: los primeros mensajes del aspirante tal como los escribió, y un perfil con sus datos, lo que preguntó, cómo escribe y sus frases reales, para que un aspirante simulado siguiera la conversación como lo habría hecho esa persona. Luego Haiku y Sonnet hicieron de asistente, otro paso leyó los datos y cada conversación pasó por el revisor automático y por un juez (Sonnet) que la comparó con las reglas.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Conversaciones sin fallas graves (juez) | 187 de 200 (93,5 %) | 199 de 200 (99,5 %) |
| Sin ninguna falla (juez) | 169 | 193 |
| Pasan el revisor automático | 187 de 200 | 189 de 200 |
| Pases a persona de más / que faltaron | 0 / 0 | 0 / 0 |
| Cifras de salario | 0 | 0 |
| Datos bien leídos \* | 96 % | 96,8 % |
| Dijo «quedaste registrado» o «Gestión Humana te contactará» sin tener la autorización y la hoja de vida \*\* | 19 | 5 |
| Preguntó la fecha de vencimiento de la licencia | 30 | 8 |
| Palabras por respuesta | 19 | 21 |

\* Casi todas las diferencias son del caso y no del asistente: el aspirante simulado no llegó a dar el dato, o la conversación terminó antes porque no cumplía.
\*\* Conteo automático. Incluye algunos cierres válidos, por ejemplo cuando el aspirante pregunta «¿cuándo me llaman?».

**Lo que falla con Haiku.** De las 13 fallas graves:

- 8 son cierres antes de tiempo: el aspirante escribe «ok gracias», responde algo confuso o dice que manda la hoja de vida después, y Haiku le dice que ya quedó registrado y que Gestión Humana lo contactará, sin tener la hoja de vida y a veces ni el nombre o la edad. Para Gestión Humana eso es un aspirante incompleto que cree que ya terminó.
- 2 veces pidió la autorización diciendo «cumples» sin saber la licencia o la edad.
- 1 vez pidió fotos de la licencia antes de las preguntas y de la autorización.
- 1 vez dio por hecho lo que había en una foto («recibí la foto de tu licencia») y 1 vez afirmó algo que no está en las instrucciones.

10 de las 13 son conversaciones con audios, fotos o documentos, y 8 son aspirantes que sí cumplen: es decir, se pierden justo los que interesan. Las fallas menores de Haiku son sobre todo preguntas repetidas (6) y cierres flojos (5).

**Lo que falla con Sonnet.** Una falla grave: ante una pregunta por vivienda insinuó que eso se ve más adelante en el proceso, en vez de decir que no tiene el dato. Entre las menores, 3 veces preguntó la vigencia de la licencia, que no hace falta.

**Qué significa.** Con las 60 situaciones armadas a mano los dos modelos parecían iguales; con conversaciones reales, largas y desordenadas, Sonnet es claramente más constante. Las dos fallas que más se repiten tienen arreglo en las reglas, y sirven para cualquier modelo:

1. No decir que quedó registrado ni que Gestión Humana lo va a contactar mientras falte un dato de los requisitos, la autorización o la hoja de vida. Si la persona se despide antes, decirle qué le falta y que puede escribir cuando quiera para terminar.
2. No preguntar la fecha de vencimiento de la licencia ni las multas: eso lo revisa Gestión Humana.

Límites de la prueba: después de los primeros mensajes, el aspirante es simulado, aunque sigue el perfil de la persona real. El juez es Sonnet, así que podría favorecer a Sonnet; pero la falla principal de Haiku (los cierres antes de tiempo) también aparece en el conteo automático, que no depende del juez. Las conversaciones completas no se guardan en el repositorio porque contienen partes de mensajes reales.

### Segunda vuelta, con las reglas corregidas

Se agregaron a las reglas las correcciones que dejó la prueba real:

- no dar por registrado al aspirante mientras le falte algo, y decirle qué le falta;
- no preguntar la vigencia de la licencia ni las multas;
- no decirle que cumple antes de saber su edad, dónde vive y su licencia;
- no suponer qué hay en una foto.

Después se repitieron todas las conversaciones reales en que cada modelo tuvo algún problema, más 30 que antes salieron bien, como control.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Conversaciones que antes tuvieron problemas | 58 | 27 |
| Fallas graves en ellas: antes → ahora | 13 → 7 | 1 → 0 |
| Fallas menores en ellas: antes → ahora | 18 → 12 | 6 → 4 |
| Control (30 que antes salieron bien): fallas graves | 0 | 0 |
| Dijo «quedaste registrado» sin la autorización y la hoja de vida (conteo automático) | 19 → 4 | 5 → 2 |
| Preguntó la vigencia de la licencia | 30 → 0 | 8 → 0 |
| Las 60 situaciones armadas | 60 de 60 | 60 de 60 |

Las reglas funcionan con los dos modelos. Con Sonnet ya no queda ninguna falla grave. Con Haiku quedan 7, sobre todo pedir la hoja de vida o fotos antes de la autorización (5) y algún cierre antes de tiempo. La recomendación sigue siendo Sonnet.

### Prueba amplia: 216 conversaciones de noviembre con Sonnet

Para confirmar con más casos se tomaron todas las conversaciones del 1 al 13 de noviembre en que intervino una persona de Gestión Humana, quitando:

- las que ya estaban en la muestra de 200 o son idénticas a una de ellas (por ejemplo, los muchos «Hola, quiero más información»);
- las repetidas exactas;
- las cortas que solo saludan.

Quedaron 216 conversaciones distintas, 58 con audios, fotos o documentos. Se corrieron con Sonnet 5.5 y las reglas corregidas.

| | Resultado |
|---|---|
| Sin fallas graves | 214 de 216 (99,1 %) |
| Sin ninguna falla | 204 |
| Fallas menores | 10 |
| Pases a persona que faltaron | 0 |
| Cifras de salario | 0 |
| Preguntó la vigencia de la licencia | 0 |
| «Quedaste registrado» sin la autorización y la hoja de vida (conteo automático) | 2 |

Las dos fallas graves:

- un aspirante que no cumplía se despidió molesto y el asistente no le dijo qué le faltaba para dejarlo registrado;
- otro caso en que pidió la autorización antes de tener el nombre completo.

Las menores son detalles de redacción: pedir tres o cuatro datos en un mismo mensaje, frases como «hay posibilidades» o «eso también cuenta» que insinúan algo que las instrucciones no dicen, o no preguntar qué contenían dos fotos.

### Tercera y cuarta vuelta: corregir las fallas que quedaron

Con las 12 fallas de noviembre (y las que le quedaban a Haiku) se ajustaron las reglas en dos rondas. La primera ronda:

- la autorización se pide solo con todas las respuestas, incluidos el nombre completo y la cédula;
- máximo dos datos por mensaje (cada dato cuenta por separado) y los documentos de a uno;
- no anticipar resultados ni opinar («hay posibilidades», «eso también cuenta», «tienes toda la razón»);
- a quien cree que no cumple o se despide sin terminar se le dice qué dato le falta;
- preguntar siempre qué es un archivo que llega sin texto.

La segunda ronda:

- si ya dijo que se muda o viaja a diario, el traslado está respondido y no se repite la pregunta;
- no preguntar si un número es la fecha de vencimiento;
- si manda un enlace con la hoja de vida, pedirla por el chat;
- si dice que ya le informaron un resultado y reclama, pasar a una persona.

| | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|
| Las 12 fallas de noviembre (2 graves, 10 menores) | 10 corregidas; quedan 2 menores | 9 bien en la tercera vuelta; quedan 3 menores |
| Fallas graves pendientes de Haiku (7) | — | quedan 2 en la tercera vuelta y 1 en la cuarta |
| Control (conversaciones que antes salieron bien) | 10 de 10 bien en la cuarta vuelta | 7 de 10 bien en la cuarta vuelta |

Con Sonnet ya no quedan fallas graves. Las dos menores que persisten son de redacción: decir «solo me falta tu edad y tu nombre» cuando también faltaba la cédula, o un «¡qué experiencia!». Con Haiku, cerca de un tercio de las conversaciones difíciles siguen con alguna falla menor (sobre todo repetir preguntas) y queda una grave: dio por recibida la hoja de vida sin confirmar qué documento era.

Parte de las fallas menores cambia de una corrida a otra sin tocar las reglas, porque el aspirante simulado escribe distinto y el juez también varía: conversaciones que antes salieron bien a veces salen ahora con un detalle. Por eso no tiene sentido perseguir cero fallas menores. Lo que sí se logró es que las graves bajaran a cero con Sonnet y a casi cero con Haiku.

### Comparación final: los 216 casos de noviembre con cada modelo

Con las reglas finales se corrieron los mismos 216 casos de noviembre con Haiku 5.5 y, en un PC de la empresa con LM Studio (RTX 3050 de 8 GB, 16.384 tokens de contexto), con Gemma 4 E4B y Qwen3.5 9B.

| | Sonnet 5.5 | Haiku 5.5 | Gemma 4 E4B (local) | Qwen3.5 9B (local) |
|---|---|---|---|---|
| Sin fallas graves | 214 de 216 (99,1 %) | 214 de 216 (99,1 %) | 115 de 202 (56,9 %) | Se detuvo en 26 casos: 15 pasan el revisor automático |
| Sin ninguna falla | 204 | 184 | 37 | — |
| Fallas menores | 10 | 30 | 78 | — |
| Pasan el revisor automático | 196 | 194 | 120 | 15 de 26 |
| Tiempo por respuesta | unos 3 s | unos 2 s | 2,2 s (p90 5,1 s) | 5 s (p90 15 s; una respuesta pasó de 3 minutos) |
| Costo al mes (unas 1.600 conversaciones) | US$75 a 95 | US$4 a 6 | Equipo, luz y desarrollo | Equipo, luz y desarrollo |

La corrida de Sonnet de esta tabla se hizo con las reglas de la segunda vuelta; con las reglas finales, sus fallas pendientes bajaron a 2 menores (ver arriba).

- **Haiku** iguala a Sonnet en fallas graves. Las suyas fueron dos: siguió preguntando por el traslado a alguien que dijo que no se traslada, en vez de decirle que no cumple, y pidió la autorización sin tener la cédula. Tiene el triple de fallas menores, sobre todo preguntas repetidas.
- **Gemma** falla gravemente en más de 4 de cada 10 conversaciones: pide documentos antes de la autorización, repite preguntas y no le dice con claridad a quien no cumple que no cumple.
- **Qwen** va algo mejor que Gemma, pero es lento: unos 80 segundos por conversación, con cortes por tiempo. La prueba se detuvo para dar paso a Haiku.

En las pruebas locales, el aspirante simulado y la lectura de datos también los hace el modelo pequeño, lo que lo perjudica algo. Aun así, la diferencia es demasiado grande para explicarla por eso. La prueba también mostró problemas de operación que en producción serían caídas del asistente: se perdió la conexión con el PC en 94 casos seguidos, el PC cambió de dirección IP y la red perdía paquetes.

## Licencia verificada en el RUNT con Croma

La consulta RUNT de personas de Croma trae cada licencia con sus categorías, la fecha de vencimiento de cada una y si está activa, cancelada, suspendida o retenida. Con la autorización de datos y la cédula, Gestivo la consulta solo, antes del SIMIT, y:

- marca sola «licencia verificada en el RUNT» (ya no la marca una persona);
- deja en la ficha las categorías de la licencia activa;
- pone la licencia en rojo si no tiene, si está vencida, si no es C2 o C3, o si está suspendida o cancelada. En ese caso el chat no se marca para citar, no se gasta la consulta del SIMIT y el asistente se lo dice con amabilidad en su siguiente respuesta. El cierre lo sigue confirmando una persona;
- si la cédula no aparece en el RUNT, no descarta: deja la licencia pendiente y el asistente le pide que confirme el número. Si lo corrige, se vuelve a consultar.

Por eso el asistente ya no pregunta la vigencia de la licencia. Hay un ajuste en *Tiempos y reglas* para exigir meses mínimos de vigencia; por defecto es 0, que pide solo que no esté vencida.

Se probó con dos cédulas reales autorizadas. En la primera, la persona está en el RUNT sin licencia: salió en rojo. En la segunda, la persona tiene cinco licencias en el historial y una activa, con A2, B3 y C3: salió verde, «C3 vigente hasta el 13 de enero de 2028». Las inactivas no cuentan aunque su fecha no haya vencido. Croma respondió como trabajo asíncrono en unos 20 a 35 segundos; si tarda más, el cron de seguimiento termina la consulta.

Los demás casos se simularon con respuestas del mismo formato, sobre procesos temporales en la base de desarrollo que después se borraron. Salieron como se esperaba: vigente, vencida, sin licencia, sin registro, otra categoría, suspendida, inactiva con otra activa y respuesta asíncrona.

## Modelos locales (LM Studio en un PC con RTX 3050 de 8 GB)

Para saber si el asistente puede correr en un equipo propio, sin servicio externo, se probaron dos modelos pequeños con las mismas 60 situaciones y las instrucciones propuestas. El razonamiento previo se apaga desde Gestivo (`reasoning_effort: "none"`), porque si no cada respuesta tarda de 12 a 37 segundos.

| | Gemma 4 E4B | Qwen3.5 9B |
|---|---|---|
| Situaciones correctas | 52 de 60 | 54 de 60 (56 tras el último ajuste) |
| Pases a persona de más / cifras de salario | 0 / 0 | 0 / 0 |
| Tiempo por respuesta (mediana / más lentas) | 1,8 s / 4,3 s | 3,2 s / 8,7 s |
| Fallas graves | Despidió una queja de acoso como «otro tema»; dijo haber escuchado un audio | Ninguna |

Qwen3.5 9B sirve para un piloto local, pero es menos constante que los modelos en la nube: a veces pide confirmar la licencia en vez de decirle a quien tiene B1 que no cumple. En LM Studio hay que cargarlo desde la pantalla con la GPU al máximo y de 16.000 a 32.000 tokens de contexto: con el máximo (262.000) no cabe en la tarjeta y se vuelve muy lento.

Las pruebas con modelos pequeños dejaron dos mejoras que sirven con cualquier modelo:

- **Autorización de datos con el texto legal exacto.** El asistente escribe una marca y el sistema pone el texto del catálogo. Si el modelo la pide con sus palabras, el sistema cambia esa parte por el texto completo, para que no falte lo de conservar los datos para futuros procesos.
- **Pedir una persona.** Se detecta aunque se escriba sin h («ablar con un asesor») o pidiendo una llamada («llámenme»).

## Nube frente a equipo local

| | Claude Haiku 5.5 | Claude Sonnet 5.5 | OpenRouter económico (producción hoy) | Qwen3.5 9B (local) | Gemma 4 E4B (local) |
|---|---|---|---|---|---|
| Situaciones correctas | 60 de 60 | 60 de 60 | 66 de 68 (versión anterior; las 2 fallas se corrigieron) | 54 de 60 (56 tras el último ajuste) | 52 de 60 |
| 200 conversaciones reales sin fallas graves | 187 (93,5 %) | 199 (99,5 %) | No se probó | No se probó | No se probó |
| Fallas graves | Ninguna | Ninguna | Ninguna | Ninguna; a veces pide confirmar la licencia en vez de decir que no cumple | Despidió una queja de acoso; dijo haber escuchado un audio |
| Siempre el mismo modelo | Sí | Sí | No: alterna entre gpt-6-luna, deepseek y gemini | Sí | Sí |
| Tiempo por respuesta (mediana / más lentas) | 2,0 s / 3,7 s | 3,3 s / 4,5 s | 3,5 s / 5,8 s | 3,2 s / 8,7 s | 1,8 s / 4,3 s |
| Costo de uso al mes (estimado) | US$4 a 6 | US$75 a 95 (menos con caché) | Bajo; depende del modelo que toque | Luz del equipo | Luz del equipo |
| Los datos de los aspirantes salen de la empresa | Sí | Sí | Sí, a varios proveedores | No | No |

Cómo se estimó el costo: unas 1.600 conversaciones al mes (1.633 entre el 16 de octubre y el 14 de noviembre; el volumen creció desde septiembre), con unos 20.000 tokens de entrada y 850 de salida por conversación, medidos en las corridas del 13 de noviembre. Precios de lista de Anthropic: Haiku 5.5 cuesta US$0,10 por millón de tokens de entrada y US$0,50 de salida, y Sonnet 5.5, US$2 y US$10. Por OpenRouter el costo es parecido, más su comisión. Los tiempos de Haiku y Sonnet salen de la corrida por OpenRouter del 13 de noviembre (antes de que se acabara el crédito); los de los modelos locales, del PC con RTX 3050.

Los modelos locales se probaron la noche del 13 de noviembre, antes de los últimos ajustes. Para compararlos exactamente con H4 y S2 hay que repetirlos con la versión de hoy (no gasta crédito).

## Equipo para correr el asistente en local

**Carga:** unas 54 conversaciones al día, más o menos 250 respuestas del asistente. Una sola tarjeta gráfica alcanza: atiende de a una consulta, pero la fila es corta.

**Por qué el PC actual no basta:** la RTX 3050 de 8 GB solo carga modelos de 4.000 a 9.000 millones de parámetros, y esos fallan de 4 a 8 situaciones de 60. Para acercarse a la nube hace falta un modelo de unos 26.000 a 35.000 millones (por ejemplo Gemma 4 26B, Qwen3.5 27B o Qwen3.5 35B-A3B), y eso pide de 16 a 24 GB en la tarjeta.

| | Opción básica | Opción recomendada |
|---|---|---|
| Tarjeta gráfica | RTX 5060 Ti de 16 GB, nueva | RTX 3090 de 24 GB, usada (o RTX 4090 de 24 GB si se consigue a buen precio) |
| Modelo que cabe | Gemma 4 26B en 4 bits. Qwen3.5 35B-A3B solo pasando parte a la memoria del PC (más lento) | Qwen3.5 27B o 35B-A3B en 4 bits, con 32.000 tokens de contexto |
| Precio de la tarjeta (referencia) | De 2 a 3,3 millones de pesos en tiendas colombianas | Usadas en EE. UU., agosto y septiembre de 2026: RTX 3090 de US$1.250 a 1.550; RTX 4090 de US$2.200 a 2.500 |
| Resto del equipo | Ryzen 7 o Core i7 reciente, 64 GB de RAM, disco SSD de 1 TB, fuente de 750 W y UPS | Igual, con fuente de 1.000 W |

Los precios de tarjetas y memorias subieron mucho en 2026: hay que cotizar el día de la compra. Antes de comprar conviene probar el modelo elegido con las 60 situaciones, porque los modelos de ese tamaño todavía no se han probado aquí.

Además del equipo hace falta:

- **Conexión segura con Gestivo.** Gestivo corre en Vercel, así que el equipo tiene que poder recibir consultas desde internet por un túnel seguro (Cloudflare Tunnel o Tailscale) y con clave. Debe estar prendido todo el día, con UPS e internet estable.
- **Desarrollo.** Hoy la conexión con un modelo local solo existe para pruebas. Para usarla en producción hay que agregarla como proveedor y hacer que, si el equipo no responde, el asistente pase solo a un modelo en la nube.
- **Luz.** Un PC con tarjeta gráfica prendido todo el mes gasta del orden de 100 a 150 kWh. Según la tarifa, eso cuesta más que usar Haiku en la nube.

**Recomendación.** Por costo, el equipo local no se justifica: un modelo en la nube cuesta entre US$4 y 95 al mes, y el mejor modelo local probado acierta 54 a 56 de 60 situaciones armadas, menos que cualquiera de los de la nube. El equipo local tiene sentido solo si la prioridad es que los datos de los aspirantes no salgan de la empresa, o no depender de un proveedor externo. En ese caso conviene la opción recomendada de 24 GB, con una prueba previa del modelo.

Para producción hay dos opciones buenas, ambas como **modelo fijo** en vez del modo automático de OpenRouter. Con las reglas finales, en los 216 casos de noviembre, **Haiku 5.5** y **Sonnet 5.5** tuvieron las mismas fallas graves (2). Haiku tuvo el triple de fallas menores (30 contra 10), como repetir una pregunta o una redacción torpe, y cuesta unos US$75 menos al mes. **La recomendación es arrancar con Haiku 5.5** y vigilar en Comunicaciones › Indicadores los pases a persona y las conversaciones que quedan sin respuesta. Si los detalles de redacción molestan a Gestión Humana, se cambia a Sonnet 5.5 sin tocar nada más. Los modelos locales quedan descartados.

Referencias de precios y memoria: [Lowpi, RTX 5060 Ti 16 GB en Colombia](https://lowpi.com/colombia/rtx-5060-ti-16gb), [runaihome, RTX 3090 usada en 2026](https://runaihome.com/blog/used-rtx-3090-ai-value-king-2026/), [runaihome, RTX 5090, 4090 y 3090 para IA local](https://runaihome.com/blog/rtx-5090-vs-rtx-4090-vs-used-3090-local-ai-2026/), [GPU Poet, mercado de tarjetas en noviembre de 2026](https://gpupoet.com/gpu/market-report/gpu-market-report-november-2026), [InsiderLLM, qué modelo de Qwen 3.5 cabe en cada tarjeta](https://insiderllm.com/guides/qwen35-local-guide-which-model-fits-your-gpu/), [localairig, requisitos de Gemma 4](https://localairig.pages.dev/models/gemma4-hardware-requirements-deployment-guide).

## Lo que se corrigió gracias a las pruebas

- Quien vive fuera pero se traslada ya no pasa a una persona: cumple el requisito.
- A quien no cumple se le dice con amabilidad y se le pide nombre y cédula para dejarlo registrado, sin pasar el chat.
- Si no autoriza el tratamiento de datos, se le explica una vez y se despide, sin pasar el chat.
- Las faltas de ortografía, los audios y las fotos ya no cuentan como «no te entendí». Si de verdad no se entiende, el asistente aclara por pasos antes de pasar el chat.
- Cuando dice que no tiene la hoja de vida a la mano, se le ofrecen alternativas (foto, PDF o audio).
- Las ciudades mal escritas («soleda») se reconocen.
- La cédula enviada sola, sin que se haya pedido, se reconoce.
- Si el aspirante no da su nombre, la plantilla de reactivación sale igual: «Hola, qué tal…».

## Pendiente

1. Verificación corta con el modelo de producción, cuando haya crédito o una clave aparte para pruebas: unos 5 casos, cerca de 50 consultas. También se puede probar sin costo con un modelo local (LM Studio en un PC de la red): `npm run evaluar:asistente -- --afinada --prompt docs/seleccion-prompt-propuesto.txt --local http://<ip>:1234/v1`.
2. Que Gestión Humana apruebe las instrucciones propuestas (ver `docs/seleccion-guia-prueba-gh.md`).
3. Decidir si se siguen pidiendo las fotos de la licencia y la cédula además de la hoja de vida.
4. Decidir el modelo de producción. Hoy es OpenRouter en modo automático, que cambia de modelo entre una llamada y otra; la recomendación es Claude Haiku 5.5 fijo, con Sonnet 5.5 como alternativa si se quiere una redacción más pulida (ver «Comparación final: los 216 casos de noviembre»).
5. Revisar el crédito de la clave de OpenRouter: se agotó el 13 de noviembre durante las pruebas. Si es la misma clave de producción, el asistente de WhatsApp puede estar fallando.
6. Confirmar con Croma el costo de cada consulta del RUNT y si Gestión Humana quiere exigir meses mínimos de vigencia.

Decidido el 13 de noviembre: este número es solo para el proceso de selección. A quien escribe por otro tema (ofrece productos o servicios, es trabajador o extrabajador con un tema laboral, es pasajero, número equivocado) el asistente lo despide con amabilidad y no pasa el chat. Siguen pasando a una persona las quejas sobre el proceso y lo grave (acoso, accidente, amenaza, salud).

Los reportes completos, con cada conversación, están en esta carpeta: `asistente-…-corrida-a-propuesto.md`, `…-corrida-b-propuesto.md`, `…-corrida-c-prompt-gh.md`, `…-corrida-h-haiku-propuesto.md`, `…-corrida-haiku-cambios-14nov.md` (H4), `…-corrida-sonnet-cambios-14nov.md` (S2), `…-corrida-haiku-reglas-runt.md` y `…-corrida-sonnet-reglas-runt.md` (las 60 situaciones con las reglas corregidas).
