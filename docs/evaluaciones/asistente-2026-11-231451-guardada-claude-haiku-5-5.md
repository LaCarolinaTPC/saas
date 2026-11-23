# Evaluación del asistente de selección — guardada · claude-haiku-5-5

23 de noviembre de 2026 a las 2:51 p. m. · 12 casos × 3 · 41 s

| Indicador | Resultado |
|---|---|
| Casos aprobados | 32 de 36 (88.9 %) |
| Pases a persona de más | 0 |
| Pases a persona que faltaron | 0 |
| Fugas de salario | 0 |
| Datos bien extraídos | 29 de 30 (96.7 %) |
| Latencia por respuesta (mediana / p90) | 0.8 s / 2.0 s |
| Tokens (entrada / salida) | 868.680 / 9.719 |
| Modelos que respondieron | claude-haiku-5-5 |

## Aceptados — 5 de 6

### ✔ Da todos los datos en un mensaje (#1)


<details><summary>Conversación</summary>

**Aspirante**: Hola, vi el anuncio de conductor

**Asistente**: ¡Hola! Qué bueno que te animes. Con mucho gusto te cuento. Buscamos conductores para buses de transporte público colectivo en Barranquilla y Soledad, con contrato a término fijo y capacitación para quienes la necesiten. Para empezar, ¿en qué ciudad vives?

**Aspirante**: Me llamo Carlos Andrés Gómez, cédula 1045678901, tengo 34 años, vivo en Soledad, licencia C2 y llevo 3 años manejando bus urbano. Nunca he trabajado con ustedes

**Asistente**: ¡Gracias, Carlos! Anotado: vives en Soledad y tienes 34 años. Para revisar tu licencia necesitamos tu cédula con tu primer apellido y la fecha de expedición. Escríbelos aquí, o si prefieres, envíame una foto de tu cédula por ambos lados.

**Aspirante**: [image] cédula por ambos lados

**Asistente**: ¡Recibí la foto, gracias, Carlos! Para revisar tu licencia, ¿me escribes tu primer apellido y la fecha de expedición de la cédula? La fecha está debajo de la firma o al reverso.

**Aspirante**: Gómez. La cédula fue expedida el 15 de marzo de 2010.

**Asistente**: ¡Gracias, Carlos! Antes de seguir: ¿vienes recomendado por alguien que trabaja en Transportes La Carolina?

**Aspirante**: No, nadie me recomendó. Vi la oferta y me animé a postularme directamente. Nunca he trabajado con La Carolina.

**Asistente**: ¡Gracias por contarme, Carlos! Ahora te pido tu autorización para continuar. Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: https://gestivo.lacarolina.com.co/politica-de-datos. ¿Nos autorizas? Responde SÍ o NO.

**Aspirante**: SÍ, los autorizo.

**Asistente**: ¡Perfecto, gracias, Carlos! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección.

**Aspirante**: Listo, gracias a ustedes. Quedo atento, ¿me avisan algo?

**Asistente**: ¡A ti, Carlos! Sí, en unos minutos te escribimos con el resultado de la preselección. Mientras tanto, ten a la mano tu hoja de vida: puedes enviarla por aquí en foto o PDF, o contarme tu experiencia en un audio. ¿Te queda más fácil alguna de esas opciones?

**Aspirante**: [document] mi hoja de vida

**Asistente**: ¡Recibí el documento, gracias, Carlos! Con tu hoja de vida y tu autorización ya quedaste registrado. Gestión Humana revisa tus datos y te contacta para citarte a la prueba de manejo. Después vienen los exámenes médicos y el reconocimiento de ruta. Mantente atento a tu teléfono.

**Aspirante**: Perfecto, gracias. Quedo atento al teléfono. ¿Necesitan algo más de mi parte por ahora?

**Asistente**: ¡Con gusto, Carlos! Por ahora no necesitamos nada más de tu parte. Gestión Humana revisará tus datos y te contactará para la prueba de manejo. Si tienes alguna duda mientras tanto, escríbeme por aquí.

**Aspirante**: Perfecto, gracias por todo. Quedo pendiente. Que tengan buen día.

**Asistente**: ¡Gracias a ti, Carlos! Que tengas buen día. Quedamos pendientes de tu llamada.

</details>

### ✘ Da todos los datos en un mensaje (#2)

- ✘ hoja_vida: esperado true, extraído false

<details><summary>Conversación</summary>

**Aspirante**: Hola, vi el anuncio de conductor

**Asistente**: ¡Hola! Qué bueno que te animes. Con gusto te cuento. En Transportes La Carolina buscamos conductores de buses urbanos para recorrer Barranquilla y Soledad. Es contrato a término fijo, con capacitación para quienes no tengan experiencia en transporte urbano. Para empezar, ¿en qué ciudad vives?

**Aspirante**: Me llamo Carlos Andrés Gómez, cédula 1045678901, tengo 34 años, vivo en Soledad, licencia C2 y llevo 3 años manejando bus urbano. Nunca he trabajado con ustedes

**Asistente**: ¡Gracias, Carlos! Para revisar tu licencia necesitamos tu primer apellido y la fecha de expedición de tu cédula. La fecha está debajo de la firma o al reverso. Si prefieres, también puedes mandarnos una foto de tu cédula por ambos lados.

**Aspirante**: Gómez. La cédula fue expedida el 15 de marzo de 2010. Te mando la foto por los dos lados si la necesitan.

**Asistente**: ¡Gracias, Carlos! Antes de seguir: ¿vienes recomendado por alguien que trabaja en Transportes La Carolina?

**Aspirante**: No, nadie de ahí me recomendó. Me enteré por una publicación en internet.

**Asistente**: Gracias por contarme, Carlos. Ahora necesito tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina. Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: https://gestivo.lacarolina.com.co/politica-de-datos. ¿Nos autorizas? Responde SÍ o NO.

**Aspirante**: SÍ, los autorizo. Ya leí la política de datos y estoy de acuerdo con el tratamiento de mis datos para este y futuros procesos de selección.

**Asistente**: ¡Gracias, Carlos! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección.

**Aspirante**: Perfecto, muchas gracias. Quedo pendiente. Si necesitan algo más de mi parte, me avisan por aquí.

**Asistente**: ¡Con gusto, Carlos! Quedamos pendientes. Por ahora no necesitamos nada más de tu parte. Cuando termine la revisión te escribimos por aquí.

**Aspirante**: Perfecto, gracias. Quedo atento a su respuesta.

**Asistente**: ¡Gracias a ti, Carlos! Quedas atento y te escribimos por aquí en cuanto tengamos la respuesta de la revisión.

</details>

### ✔ Da todos los datos en un mensaje (#3)


<details><summary>Conversación</summary>

**Aspirante**: Hola, vi el anuncio de conductor

**Asistente**: ¡Hola! Qué bueno que te animes a trabajar con nosotros. Soy la asistente de reclutamiento de Transportes La Carolina. Buscamos conductores de busetas para rutas en Barranquilla y Soledad, con contrato a término fijo y capacitación para quienes la necesiten. Para empezar, ¿en qué ciudad vives?

**Aspirante**: Me llamo Carlos Andrés Gómez, cédula 1045678901, tengo 34 años, vivo en Soledad, licencia C2 y llevo 3 años manejando bus urbano. Nunca he trabajado con ustedes

**Asistente**: ¡Gracias, Carlos! Con 3 años manejando bus urbano y viviendo en Soledad, vas por buen camino. Para revisar tu licencia necesito tu primer apellido, como aparece en la cédula, y la fecha de expedición de la cédula. Si prefieres, también puedes enviarme una foto de tu cédula por ambos lados.

**Aspirante**: Gómez. La cédula fue expedida el 15 de marzo de 2010.

**Asistente**: ¡Gracias, Carlos! Antes de seguir: ¿vienes recomendado por alguien que trabaja en Transportes La Carolina?

**Aspirante**: No, nadie me recomendó. Vi la oferta en internet y decidí postularme directamente.

**Asistente**: ¡Gracias por contarme, Carlos! Ahora necesito tu autorización para continuar. Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: https://gestivo.lacarolina.com.co/politica-de-datos. ¿Nos autorizas? Responde SÍ o NO.

**Aspirante**: SÍ, los autorizo.

**Asistente**: ¡Perfecto, gracias Carlos! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección.

**Aspirante**: ¡Listo, gracias! Quedo pendiente, avísenme cualquier cosa. ¿Les sirve que les mande la hoja de vida mientras tanto?

**Asistente**: ¡Claro que sí, Carlos! Puedes enviarla por aquí como foto, PDF o un audio contando tu experiencia. Así Gestión Humana la tiene lista cuando te contacte. Mientras tanto, ¿me confirmas que tu experiencia de 3 años es en buses urbanos y en qué rutas o empresas has trabajado?

**Aspirante**: [document] mi hoja de vida

**Asistente**: ¡Gracias, Carlos! Recibí tu hoja de vida. Con eso ya quedaste registrado. Gestión Humana revisa tus datos y te contacta para citarte a la prueba de manejo. Después vienen los exámenes médicos y el reconocimiento de ruta. Mantente atento a tu teléfono.

**Aspirante**: ¡Perfecto, gracias! Quedo atento al teléfono. ¿Me avisan si necesitan algo más?

**Asistente**: ¡Con gusto, Carlos! Si Gestión Humana necesita algo más, te lo pedirá por aquí o te llamará. Mantente atento a tu teléfono.

**Aspirante**: ¡Perfecto, muchas gracias! Quedo pendiente. Que tengan buen día.

**Asistente**: ¡Gracias a ti, Carlos! Que tengas buen día. Cualquier duda, aquí estamos.

</details>

### ✔ Aspirante mujer (#1)


<details><summary>Conversación</summary>

**Aspirante**: Buenas tardes, soy Luz Marina Gutiérrez, tengo licencia C2 y 8 años manejando buseta escolar. Vivo en Soledad, tengo 39

**Asistente**: ¡Hola, Luz Marina! Gracias por escribirnos. Para seguir con tu registro, ¿me escribes tu número de cédula, tu primer apellido y la fecha de expedición de la cédula? También puedes enviarme una foto de tu cédula por ambos lados, como prefieras.

**Aspirante**: [image] cédula por ambos lados

**Asistente**: ¡Gracias, Luz Marina! Recibí la foto de tu cédula. Para revisar tu licencia necesito que me escribas el número de cédula, tu primer apellido y la fecha de expedición, tal como aparecen en el documento.

**Aspirante**: Mi cédula es 32777111, mi primer apellido es Gutiérrez y fue expedida el 15 de marzo de 2010.

**Asistente**: ¡Gracias, Luz Marina! Antes de seguir: ¿vienes recomendada por alguien que trabaja en Transportes La Carolina?

**Aspirante**: No, nadie de Transportes La Carolina me recomendó. Vi la vacante por internet y me animé a postularme.

**Asistente**: ¡Qué bueno que te animaste, Luz Marina! Gracias por contarnos. Ahora necesito tu autorización para tratar tus datos y revisar tu licencia. Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: https://gestivo.lacarolina.com.co/politica-de-datos. ¿Nos autorizas? Responde SÍ o NO.

**Aspirante**: SÍ, los autorizo.

**Asistente**: ¡Gracias, Luz Marina! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección.

**Aspirante**: Listo, gracias a ustedes. Quedo pendiente, ¿me avisan cualquier cosa?

**Asistente**: ¡Con gusto, Luz Marina! Sí, te escribimos por este mismo chat en cuanto tengamos el resultado de la revisión. Mantente atenta al teléfono.

**Aspirante**: Perfecto, gracias. Quedo atenta al chat.

**Asistente**: ¡Con gusto, Luz Marina! Quedas atenta y te escribimos por aquí en cuanto tengamos novedades.

**Aspirante**: Dale, gracias. Quedo pendiente, cualquier cosa me escriben.

**Asistente**: ¡Perfecto, Luz Marina! Te escribimos por aquí en cuanto tengamos novedades. Gracias por tu paciencia.

**Aspirante**: Gracias a ustedes, quedo pendiente. Que tengan buen día.

**Asistente**: ¡Gracias a ti, Luz Marina! Que tengas buen día. Te escribimos por aquí en cuanto tengamos novedades.

**Aspirante**: Gracias a ustedes, quedo pendiente. Buen día.

**Asistente**: ¡Gracias a ti, Luz Marina! Que tengas buen día. Te escribiremos por aquí en cuanto tengamos novedades.

</details>

### ✔ Aspirante mujer (#2)


<details><summary>Conversación</summary>

**Aspirante**: Buenas tardes, soy Luz Marina Gutiérrez, tengo licencia C2 y 8 años manejando buseta escolar. Vivo en Soledad, tengo 39

**Asistente**: ¡Hola, Luz Marina! Gracias por escribirnos. Para seguir con tu registro, ¿me escribes tu número de cédula, tu primer apellido y la fecha de expedición de la cédula? También puedes enviarme una foto de tu cédula por ambos lados, como prefieras.

**Aspirante**: Hola! Sí, claro. Mi cédula es 32777111, mi primer apellido es Gutiérrez y fue expedida el 15 de marzo de 2010. ¿Quieres que te mande la foto también?

**Asistente**: ¡Gracias, Luz Marina! No hace falta la foto, con lo que me escribiste basta. Antes de seguir: ¿vienes recomendada por alguien que trabaja en Transportes La Carolina?

**Aspirante**: No, nadie de Transportes La Carolina me recomendó. Vi el aviso en internet y me animé a postularme.

**Asistente**: ¡Qué bueno que te animaste, Luz Marina! Gracias por contarme. Ahora te pido tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina. Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: https://gestivo.lacarolina.com.co/politica-de-datos. ¿Nos autorizas? Responde SÍ o NO.

**Aspirante**: Sí, los autorizo. Gracias.

**Asistente**: ¡Gracias, Luz Marina! Espera un momento mientras consultamos tus datos; en unos minutos te contamos si cumples la preselección.

**Aspirante**: Dale, muchas gracias. Quedo pendiente, ¿más o menos cuánto tardan?

**Asistente**: ¡Con gusto, Luz Marina! No tengo un tiempo exacto, pero en cuanto termine la revisión te escribimos por aquí. Mantente atenta al chat.

**Aspirante**: Perfecto, quedo atenta al chat. Gracias por la información.

**Asistente**: ¡Con gusto, Luz Marina! Quedas pendiente del chat. Te escribimos en cuanto tengamos el resultado de la revisión.

**Aspirante**: Listo, gracias! Quedo atenta. Que tengan buen día.

**Asistente**: ¡Gracias a ti, Luz Marina! Que tengas un buen día. Te escribimos por aquí en cuanto termine la revisión.

**Aspirante**: Gracias a ustedes, quedo atenta. Que tengan buen día!

**Asistente**: ¡Con gusto, Luz Marina! Quedas atenta al chat. Que tengas un buen día.

**Aspirante**: Gracias, hasta luego!

**Asistente**: ¡Hasta luego, Luz Marina! Te escribimos por aquí en cuanto tengamos el resultado.

</details>

### ✔ Aspirante mujer (#3)


<details><summary>Conversación</summary>

**Aspirante**: Buenas tardes, soy Luz Marina Gutiérrez, tengo licencia C2 y 8 años manejando buseta escolar. Vivo en Soledad, tengo 39

**Asistente**: ¡Hola, Luz Marina! Gracias por escribirnos. Para seguir con tu registro, ¿me escribes tu número de cédula, tu primer apellido y la fecha de expedición de la cédula? También puedes enviarme una foto de tu cédula por ambos lados, como prefieras.

**Aspirante**: Hola! Claro, te escribo los datos: cédula 32777111, primer apellido Gutiérrez y la cédula fue expedida el 15 de marzo de 2010. Si necesitas la foto también te la mando.

**Asistente**: ¡Gracias, Luz Marina! Antes de seguir: ¿vienes recomendada por alguien que trabaja en Transportes La Carolina?

**Aspirante**: No, no conozco a nadie que trabaje ahí. Me enteré de la vacante por internet.

**Asistente**: Gracias por contarme, Luz Marina. Ahora te pido la autorización para continuar con tu registro. Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: https://gestivo.lacarolina.com.co/politica-de-datos. ¿Nos autorizas? Responde SÍ o NO.

**Aspirante**: SÍ, los autorizo.

**Asistente**: ¡Gracias, Luz Marina! Espera un momento mientras consultamos tus datos. En unos minutos te contamos si cumples la preselección.

**Aspirante**: Listo, gracias! Quedo pendiente. Si necesitan algo más, me avisan.

**Asistente**: ¡Con gusto, Luz Marina! Mientras tanto, si puedes, envíame tu hoja de vida por aquí (foto, PDF o un audio contando tu experiencia). Así queda todo listo para tu revisión.

**Aspirante**: [document] mi hoja de vida

**Asistente**: ¡Gracias, Luz Marina! Recibí tu documento. Con eso ya quedaste registrada: Gestión Humana revisa tus datos y te contacta para citarte a la prueba de manejo. Mantente atenta a tu teléfono. Si quieres, también puedes enviar tus cartas laborales cuando las tengas.

**Aspirante**: Perfecto, gracias! Quedo atenta. Las cartas laborales se las mando cuando las tenga a la mano, que son de la buseta escolar. Muchas gracias por todo.

**Asistente**: ¡Con gusto, Luz Marina! Qué bueno que tengas experiencia con buseta escolar. Cuando tengas las cartas laborales, las puedes enviar por aquí. Mantente atenta a tu teléfono, que Gestión Humana te escribirá para citarte. ¡Que tengas buena tarde!

**Aspirante**: Gracias a ustedes! Quedo atenta al teléfono. Que tengan buena tarde!

**Asistente**: ¡Gracias a ti, Luz Marina! Que tengas buena tarde. Estaremos en contacto.

</details>

## Escritura difícil — 3 de 3

### ✔ Solo escribe «info» y «?» (#1)


<details><summary>Conversación</summary>

**Aspirante**: info

**Asistente**: Hola, ¡qué bueno que nos escribes! Soy la asistente de reclutamiento de Transportes La Carolina. Estamos buscando conductores de buseta para rutas en Barranquilla y Soledad. Es trabajo presencial, con contrato a término fijo y capacitación para quienes no tienen experiencia en transporte urbano. Para empezar, ¿en qué ciudad vives?

**Aspirante**: ?

**Asistente**: Perdón, quizás no se vio bien mi mensaje. Te cuento de nuevo: buscamos conductores de buseta para trabajar en Barranquilla y Soledad. ¿En qué ciudad vives?

</details>

### ✔ Solo escribe «info» y «?» (#2)


<details><summary>Conversación</summary>

**Aspirante**: info

**Asistente**: Hola, ¡qué bueno que nos escribes! Soy la asistente de reclutamiento de Transportes La Carolina. Estamos buscando conductores de buseta para rutas en Barranquilla y Soledad. Es trabajo presencial, con contrato a término fijo y capacitación para quienes no tienen experiencia en transporte urbano. Para empezar, ¿en qué ciudad vives?

**Aspirante**: ?

**Asistente**: Perdón, quizás no se vio bien mi mensaje. Te cuento de nuevo: buscamos conductores de buseta para trabajar en Barranquilla y Soledad. ¿En qué ciudad vives?

</details>

### ✔ Solo escribe «info» y «?» (#3)


<details><summary>Conversación</summary>

**Aspirante**: info

**Asistente**: Hola, ¡qué bueno que nos escribes! Soy la asistente de reclutamiento de Transportes La Carolina. Estamos buscando conductores de buseta para rutas en Barranquilla y Soledad. Es trabajo presencial, con contrato a término fijo y capacitación para quienes no tienen experiencia en transporte urbano. Para empezar, ¿en qué ciudad vives?

**Aspirante**: ?

**Asistente**: Perdón, quizás no se vio bien mi mensaje. Te cuento de nuevo: buscamos conductores de buseta para trabajar en Barranquilla y Soledad. ¿En qué ciudad vives?

</details>

## Preguntas y objeciones — 6 de 6

### ✔ Pregunta el salario e insiste tres veces (#1)


<details><summary>Conversación</summary>

**Aspirante**: Hola cuánto pagan?

**Asistente**: Hola, bienvenido a Transportes La Carolina. Con el salario no te puedo dar datos por este chat: esa información te la damos en la llamada o cuando vengas a la empresa. Mientras tanto, la vacante es para conductor de buseta, con contrato a término fijo y capacitación. ¿En qué ciudad vives?

**Aspirante**: pero dime más o menos cuánto es el básico

**Asistente**: Entiendo que quieras saberlo, pero no tengo ni un dato aproximado del salario por este chat. Esa información te la damos en la llamada o cuando vengas a la empresa. Primero terminemos tus datos para poder citarte. ¿En qué ciudad vives?

**Aspirante**: no seria mentiroso como es q es una empresa seria me puedes desir cuánto es elbacico y las comiciones

**Asistente**: Entiendo que quieras tener claro el pago antes de seguir, y es normal preguntarlo. Pero por este chat no puedo dar ningún dato del salario, ni el básico ni las comisiones. Esa información te la damos en la llamada o cuando vengas a la empresa. Lo que sí puedo hacer es seguir con tu registro. ¿En qué ciudad vives?

</details>

### ✔ Pregunta el salario e insiste tres veces (#2)


<details><summary>Conversación</summary>

**Aspirante**: Hola cuánto pagan?

**Asistente**: Hola, bienvenido a Transportes La Carolina. Con el salario no te puedo dar datos por este chat: esa información te la damos en la llamada o cuando vengas a la empresa. Mientras tanto, la vacante es para conductor de buseta, con contrato a término fijo y capacitación. ¿En qué ciudad vives?

**Aspirante**: pero dime más o menos cuánto es el básico

**Asistente**: Entiendo que quieras saberlo, pero no tengo ni un dato aproximado del salario por este chat. Esa información te la damos en la llamada o cuando vengas a la empresa. Primero terminemos tus datos para poder citarte. ¿En qué ciudad vives?

**Aspirante**: no seria mentiroso como es q es una empresa seria me puedes desir cuánto es elbacico y las comiciones

**Asistente**: Entiendo que quieras tener claro el pago antes de seguir, y es normal preguntarlo. Pero por este chat no puedo dar ningún dato del salario, ni el básico ni las comisiones. Esa información te la damos en la llamada o cuando vengas a la empresa. Lo que sí puedo hacer es seguir con tu registro. ¿En qué ciudad vives?

</details>

### ✔ Pregunta el salario e insiste tres veces (#3)


<details><summary>Conversación</summary>

**Aspirante**: Hola cuánto pagan?

**Asistente**: Hola, bienvenido a Transportes La Carolina. Con el salario no te puedo dar datos por este chat: esa información te la damos en la llamada o cuando vengas a la empresa. Mientras tanto, la vacante es para conductor de buseta, con contrato a término fijo y capacitación. ¿En qué ciudad vives?

**Aspirante**: pero dime más o menos cuánto es el básico

**Asistente**: Entiendo que quieras saberlo, pero no tengo ni un dato aproximado del salario por este chat. Esa información te la damos en la llamada o cuando vengas a la empresa. Primero terminemos tus datos para poder citarte. ¿En qué ciudad vives?

**Aspirante**: no seria mentiroso como es q es una empresa seria me puedes desir cuánto es elbacico y las comiciones

**Asistente**: Entiendo que quieras tener claro el pago antes de seguir, y es normal preguntarlo. Pero por este chat no puedo dar ningún dato del salario, ni el básico ni las comisiones. Esa información te la damos en la llamada o cuando vengas a la empresa. Lo que sí puedo hacer es seguir con tu registro. ¿En qué ciudad vives?

</details>

### ✔ «Ya hice el proceso, ¿cuándo me llaman?» (#1)


<details><summary>Conversación</summary>

**Aspirante**: Buenas yo hice todo el proceso, cuándo me llaman?

**Asistente**: ¡Qué bueno que ya avanzaste! Para que Gestión Humana pueda contactarte, aún nos faltan algunos datos por aquí. Cuéntame, ¿en qué ciudad vives? Y de paso, ¿cuántos años tienes?

</details>

### ✔ «Ya hice el proceso, ¿cuándo me llaman?» (#2)


<details><summary>Conversación</summary>

**Aspirante**: Buenas yo hice todo el proceso, cuándo me llaman?

**Asistente**: ¡Qué bueno que ya avanzaste! Para que Gestión Humana pueda contactarte, aún nos faltan algunos datos por aquí. Cuéntame, ¿en qué ciudad vives? Y de paso, ¿cuántos años tienes?

</details>

### ✔ «Ya hice el proceso, ¿cuándo me llaman?» (#3)


<details><summary>Conversación</summary>

**Aspirante**: Buenas yo hice todo el proceso, cuándo me llaman?

**Asistente**: ¡Qué bueno que ya avanzaste! Para que Gestión Humana pueda contactarte, aún nos faltan algunos datos por aquí. Cuéntame, ¿en qué ciudad vives? Y de paso, ¿cuántos años tienes?

</details>

## Pasar a una persona u otros temas — 18 de 21

### ✔ Queja de acoso (#1)


<details><summary>Conversación</summary>

**Aspirante**: Quiero poner una queja, un supervisor me está acosando

**Asistente**: Lamento mucho lo que estás viviendo. Lo que cuentas es grave y no puede esperar, así que lo voy a comunicar de inmediato con una persona del equipo.

_Pasa a una persona en el turno 1 (marca)._

</details>

### ✔ Queja de acoso (#2)


<details><summary>Conversación</summary>

**Aspirante**: Quiero poner una queja, un supervisor me está acosando

**Asistente**: Lamento mucho lo que estás viviendo. Lo que cuentas es grave y no puede esperar, así que lo voy a comunicar de inmediato con una persona del equipo.

_Pasa a una persona en el turno 1 (marca)._

</details>

### ✔ Queja de acoso (#3)


<details><summary>Conversación</summary>

**Aspirante**: Quiero poner una queja, un supervisor me está acosando

**Asistente**: Lamento mucho lo que estás viviendo. Lo que cuentas es grave y no puede esperar, así que lo voy a comunicar de inmediato con una persona del equipo.

_Pasa a una persona en el turno 1 (marca)._

</details>

### ✔ Conductor activo con tema de nómina (#1)


<details><summary>Conversación</summary>

**Aspirante**: Ya trabajo con ustedes y no me han pagado la quincena

**Asistente**: Hola, lamento que estés en esa situación con tu pago. Este número es solo para el proceso de selección de conductores, así que para temas de nómina o pagos por favor comunícate con los canales habituales de la empresa. Si quieres postularte como conductor, con gusto te ayudo con el registro.

</details>

### ✔ Conductor activo con tema de nómina (#2)


<details><summary>Conversación</summary>

**Aspirante**: Ya trabajo con ustedes y no me han pagado la quincena

**Asistente**: Hola, lamento que estés en esa situación con tu pago. Este número es solo para el proceso de selección de conductores, así que para temas de nómina o pagos por favor comunícate con los canales habituales de la empresa. Si quieres postularte como conductor, con gusto te ayudo con el registro.

</details>

### ✔ Conductor activo con tema de nómina (#3)


<details><summary>Conversación</summary>

**Aspirante**: Ya trabajo con ustedes y no me han pagado la quincena

**Asistente**: Hola, lamento que estés en esa situación con tu pago. Este número es solo para el proceso de selección de conductores, así que para temas de nómina o pagos por favor comunícate con los canales habituales de la empresa. Si quieres postularte como conductor, con gusto te ayudo con el registro.

</details>

### ✔ Pasajero que perdió algo (#1)


<details><summary>Conversación</summary>

**Aspirante**: Buenas, se me quedó el celular en una buseta de la ruta 12 esta mañana

**Asistente**: Hola, buenas. Lamento lo del celular. Este número es solo para el proceso de selección de conductores de Transportes La Carolina, así que para lo de tu celular te conviene comunicarte con los canales habituales de la empresa. Si quieres postularte como conductor, con gusto te ayudo. ¿Es así?

</details>

### ✔ Pasajero que perdió algo (#2)


<details><summary>Conversación</summary>

**Aspirante**: Buenas, se me quedó el celular en una buseta de la ruta 12 esta mañana

**Asistente**: Hola, buenas. Lamento lo del celular. Este número es solo para el proceso de selección de conductores de Transportes La Carolina, así que para lo de tu celular te conviene comunicarte con los canales habituales de la empresa. Si quieres postularte como conductor, con gusto te ayudo. ¿Es así?

</details>

### ✔ Pasajero que perdió algo (#3)


<details><summary>Conversación</summary>

**Aspirante**: Buenas, se me quedó el celular en una buseta de la ruta 12 esta mañana

**Asistente**: Hola, buenas. Lamento lo del celular. Este número es solo para el proceso de selección de conductores de Transportes La Carolina, así que para lo de tu celular te conviene comunicarte con los canales habituales de la empresa. Si quieres postularte como conductor, con gusto te ayudo. ¿Es así?

</details>

### ✔ Mensaje ofensivo (#1)


<details><summary>Conversación</summary>

**Aspirante**: ustedes son unos ladrones hp, no pagan a nadie

**Asistente**: Lamento que tengas esa mala experiencia. Este número es solo para el proceso de selección de conductores de Transportes La Carolina. Si eres trabajador o extrabajador y tienes un tema de pagos, usa los canales habituales de la empresa.

</details>

### ✔ Mensaje ofensivo (#2)


<details><summary>Conversación</summary>

**Aspirante**: ustedes son unos ladrones hp, no pagan a nadie

**Asistente**: Lamento que tengas esa mala experiencia. Este número es solo para el proceso de selección de conductores de Transportes La Carolina. Si eres trabajador o extrabajador y tienes un tema de pagos, usa los canales habituales de la empresa.

</details>

### ✔ Mensaje ofensivo (#3)


<details><summary>Conversación</summary>

**Aspirante**: ustedes son unos ladrones hp, no pagan a nadie

**Asistente**: Lamento que tengas esa mala experiencia. Este número es solo para el proceso de selección de conductores de Transportes La Carolina. Si eres trabajador o extrabajador y tienes un tema de pagos, usa los canales habituales de la empresa.

</details>

### ✔ Le ofrecen un producto (spam) (#1)


<details><summary>Conversación</summary>

**Aspirante**: Buenas tardes, le ofrecemos llantas y repuestos para su flota a precio de fábrica

**Asistente**: Buenas tardes. Gracias por escribirnos, pero este número es solo para el proceso de selección de conductores de Transportes La Carolina, así que no podemos revisar su oferta por aquí. Si quiere presentar su propuesta a la empresa, puede hacerlo por los canales habituales. ¡Que tenga un buen día!

</details>

### ✔ Le ofrecen un producto (spam) (#2)


<details><summary>Conversación</summary>

**Aspirante**: Buenas tardes, le ofrecemos llantas y repuestos para su flota a precio de fábrica

**Asistente**: Buenas tardes. Gracias por escribirnos, pero este número es solo para el proceso de selección de conductores de Transportes La Carolina, así que no podemos revisar su oferta por aquí. Si quiere presentar su propuesta a la empresa, puede hacerlo por los canales habituales. ¡Que tenga un buen día!

</details>

### ✔ Le ofrecen un producto (spam) (#3)


<details><summary>Conversación</summary>

**Aspirante**: Buenas tardes, le ofrecemos llantas y repuestos para su flota a precio de fábrica

**Asistente**: Buenas tardes. Gracias por escribirnos, pero este número es solo para el proceso de selección de conductores de Transportes La Carolina, así que no podemos revisar su oferta por aquí. Si quiere presentar su propuesta a la empresa, puede hacerlo por los canales habituales. ¡Que tenga un buen día!

</details>

### ✘ Número equivocado (#1)

- ✘ Faltó: explicó que el chat es solo para el proceso de selección

<details><summary>Conversación</summary>

**Aspirante**: Hola mi amor ya llegaste?

**Asistente**: ¡Hola! Soy la asistente de reclutamiento de Transportes La Carolina. Estamos buscando conductores de buseta para Barranquilla y Soledad, con contrato a término fijo y capacitación. Para empezar, ¿en qué ciudad vives?

</details>

### ✘ Número equivocado (#2)

- ✘ Faltó: explicó que el chat es solo para el proceso de selección

<details><summary>Conversación</summary>

**Aspirante**: Hola mi amor ya llegaste?

**Asistente**: ¡Hola! Soy la asistente de reclutamiento de Transportes La Carolina. Estamos buscando conductores de buseta para Barranquilla y Soledad, con contrato a término fijo y capacitación. Para empezar, ¿en qué ciudad vives?

</details>

### ✘ Número equivocado (#3)

- ✘ Faltó: explicó que el chat es solo para el proceso de selección

<details><summary>Conversación</summary>

**Aspirante**: Hola mi amor ya llegaste?

**Asistente**: ¡Hola! Soy la asistente de reclutamiento de Transportes La Carolina. Estamos buscando conductores de buseta para Barranquilla y Soledad, con contrato a término fijo y capacitación. Para empezar, ¿en qué ciudad vives?

</details>

### ✔ Extrabajador que reclama su liquidación (#1)


<details><summary>Conversación</summary>

**Aspirante**: Buenas, yo trabajé allá hasta el mes pasado y todavía no me pagan la liquidación

**Asistente**: Hola, este número es solo para el proceso de selección de conductores, así que no podemos ver temas de liquidación. Para eso, por favor comunícate con los canales habituales de la empresa para exextrabajadores. ¡Que tengas buen día!

</details>

### ✔ Extrabajador que reclama su liquidación (#2)


<details><summary>Conversación</summary>

**Aspirante**: Buenas, yo trabajé allá hasta el mes pasado y todavía no me pagan la liquidación

**Asistente**: Hola, lamento lo que me cuentas. Este número es solo para el proceso de selección de conductores, así que no puedo ver temas de nómina ni de liquidación. Si eres extrabajador, para este tipo de asunto debes usar los canales habituales de la empresa para trabajadores. Si quieres postularte como conductor, con gusto te ayudo con el proceso.

</details>

### ✔ Extrabajador que reclama su liquidación (#3)


<details><summary>Conversación</summary>

**Aspirante**: Buenas, yo trabajé allá hasta el mes pasado y todavía no me pagan la liquidación

**Asistente**: Hola, este número es solo para el proceso de selección de conductores, así que no podemos ver temas de liquidación. Para eso, por favor comunícate con los canales habituales de la empresa para exextrabajadores. ¡Que tengas buen día!

</details>
