# Plantillas de WhatsApp para la selección de conductores

> **19 de noviembre de 2026.** Con el guion de Gestión Humana («Saludo inicial») se
> enviaron a Meta tres plantillas más, en revisión: `sel_citacion_v2` (agrega «Pregunta
> por» con la variable `{contacto}` y los beneficios), `sel_recordatorio_cita_v2` (la
> confirmación del día con los beneficios y «responde CONFIRMO») y `sel_no_seleccionado`
> (el aviso de que no continúa, para cuando la ventana de 24 horas está cerrada). Mientras
> Meta no aprueba las v2 se siguen usando las aprobadas. Por incluir beneficios, Meta podría
> pasar las dos primeras a la categoría Marketing (más costosa).


13 de noviembre de 2026 · **Las 11 se enviaron a Meta el 13 de noviembre y están
pendientes de aprobación.** Para cambiar un texto ya enviado hay que pedir una
versión nueva (por ejemplo `sel_citacion_v2`); Gestivo sigue usando la aprobada
mientras tanto.

Ejemplos usados en el envío (solo para la revisión de Meta; el valor real lo pone
Gestivo en cada mensaje): dirección «Calle 30 # 10-20, Barranquilla», laboratorio
«Laboratorio Clínico Central» y política «https://www.ejemplo.com/politica-datos».

Fuera de la ventana de 24 horas, WhatsApp solo deja escribirle a un aspirante con
plantillas que Meta haya aprobado. Las 8 plantillas principales cubren la
reactivación de aspirantes fríos (entrega 1) y los avisos de las entregas 2 y 3.
Al final hay una más recomendada (orden de exámenes de la fase 1) y dos
opcionales. Conviene pedirlas juntas porque la aprobación toma tiempo.

## Cómo revisarlas

- El estado de cada plantilla se ve en Business Manager (y en Gestivo cuando esté
  el catálogo de mensajes de la entrega 1).
- `{{1}}`, `{{2}}`… son variables: Gestivo las llena con los datos de cada aspirante.
  La columna «Ejemplo» muestra con qué se reemplazan.
- Reglas de Meta que limitan la redacción:
  - el texto no puede empezar ni terminar en una variable;
  - una variable no puede ir vacía (por eso «si tu licencia exige lentes, tráelos»
    va siempre, en lugar de agregar «y tus lentes» solo a quien los necesita);
  - no puede haber más variables que texto;
  - los botones de respuesta rápida tienen máximo 25 caracteres.
- **Categoría.** «Utilidad» es para mensajes sobre un proceso en curso y cuesta
  menos (unos USD 0,001). «Marketing» cuesta unos USD 0,015. Las de reactivación
  se piden como utilidad, pero es probable que Meta las reclasifique como marketing.
- **Idioma:** español (`es`).
- Cuando el aspirante toca un botón, Gestivo recibe el texto del botón como si lo
  hubiera escrito, y el asistente sigue la conversación.

## Las 8 plantillas

### 1. Reactivación, primer aviso

| Campo | Valor |
|---|---|
| Nombre | `sel_reactivacion_1` |
| Categoría | Marketing (probable) |
| Cuándo sale | 24 horas sin respuesta y sin hoja de vida (entrega 1) |
| Modo | Automático |

> Hola, {{1}}. Vimos que te interesó trabajar como conductor en La Carolina. ¿Sigues interesado? Solo nos falta tu hoja de vida para seguir con tu proceso.

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |

Botones: «Sí, sigo interesado» · «Ya no me interesa»

### 2. Reactivación, segundo aviso

| Campo | Valor |
|---|---|
| Nombre | `sel_reactivacion_2` |
| Categoría | Marketing (probable) |
| Cuándo sale | 72 horas después del primer aviso, si sigue sin responder (entrega 1) |
| Modo | Revisar antes de enviar |

> Hola, {{1}}. Todavía tenemos vacantes de conductor en La Carolina. Si tienes alguna duda, cuéntanos por aquí y te ayudamos.

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |

Botones: «Quiero continuar»

### 3. Citación a la prueba de manejo

| Campo | Valor |
|---|---|
| Nombre | `sel_citacion` |
| Categoría | Utilidad |
| Cuándo sale | Pasó la preselección y los antecedentes (entrega 2) |
| Modo | Revisar antes de enviar |

> Hola, {{1}}. Pasaste la primera revisión de tu proceso como conductor. Te esperamos el {{2}} a las {{3}} en La Carolina, {{4}}, para la prueba de manejo. Trae zapatos cerrados y tu hoja de vida impresa; si tu licencia exige lentes, tráelos. ¿Nos confirmas que vienes?

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Fecha de la cita | jueves 19 de noviembre |
| {{3}} | Hora de la cita | 1:00 p. m. |
| {{4}} | Dirección de la sede | *(por confirmar con GH)* |

Botones: «Sí, voy» · «Necesito otra fecha»

### 4. Recordatorio el día de la cita

| Campo | Valor |
|---|---|
| Nombre | `sel_recordatorio_cita` |
| Categoría | Utilidad |
| Cuándo sale | 8:00 a. m. del día de la cita (entrega 2) |
| Modo | Automático |

> Buenos días, {{1}}. Te recordamos que hoy a las {{2}} tienes la prueba de manejo en La Carolina, {{3}}. ¿Nos confirmas que vienes?

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Hora de la cita | 1:00 p. m. |
| {{3}} | Dirección de la sede | *(por confirmar con GH)* |

Botones: «Sí, voy» · «Necesito otra fecha»

### 5. Inasistencia

| Campo | Valor |
|---|---|
| Nombre | `sel_inasistencia` |
| Categoría | Utilidad |
| Cuándo sale | No llegó a la cita (entrega 2) |
| Modo | Revisar antes de enviar |

> Hola, {{1}}. Te esperábamos hoy a las {{2}} para la prueba de manejo. ¿Quieres que la reprogramemos para el próximo día hábil?

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Hora de la cita | 1:00 p. m. |

Botones: «Sí, reprogramar» · «Ya no me interesa»

### 6. Recordatorio de escuela

| Campo | Valor |
|---|---|
| Nombre | `sel_escuela` |
| Categoría | Utilidad |
| Cuándo sale | 7:30 a. m., cada día mientras siga en escuela (entrega 2) |
| Modo | Automático |

> Buenos días, {{1}}. Hoy sigues con la clase de refuerzo con el profesor a las {{2}} en La Carolina. ¡Te esperamos!

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Hora de la clase | 1:00 p. m. |

Sin botones.

### 7. Paso a la fase 2 de exámenes

| Campo | Valor |
|---|---|
| Nombre | `sel_examenes_fase2` |
| Categoría | Utilidad |
| Cuándo sale | Se registra la fase 1 apta (entrega 3) |
| Modo | Automático |

> Hola, {{1}}. Pasaste la primera fase de exámenes. Mañana te presentas a las {{2}} en {{3}}, esta vez en ayunas. Al salir, vienes a la empresa para el reconocimiento de ruta.

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Hora de presentación | 6:00 a. m. |
| {{3}} | Laboratorio | *(nombre del laboratorio, por confirmar con GH)* |

Sin botones.

### 8. Documentos pendientes de la carpeta

| Campo | Valor |
|---|---|
| Nombre | `sel_documentos_pendientes` |
| Categoría | Utilidad |
| Cuándo sale | Falta algo en la carpeta de contratación (entrega 3) |
| Modo | Revisar antes de enviar |

> Hola, {{1}}. Para tu contratación nos falta: {{2}}. ¿Nos lo puedes traer o enviar por aquí?

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Lo que falta | cartas laborales y referencias |

Sin botones.

## Plantillas adicionales propuestas

Se revisaron todos los mensajes del proceso para ver cuáles pueden salir con la
ventana de 24 horas cerrada. Las 8 de arriba cubren los casos obligatorios. Estas
tres faltaban: una recomendada y dos opcionales.

### 9. Orden de exámenes, fase 1 (recomendada)

| Campo | Valor |
|---|---|
| Nombre | `sel_examenes_fase1` |
| Categoría | Utilidad |
| Cuándo sale | El profesor registra que aprobó la prueba de manejo (entregas 2 y 3) |
| Modo | Automático |

Por qué hace falta: la fase 1 es al día siguiente a las 6:00 a. m. Si el aspirante
confirmó la cita por llamada y no por WhatsApp, la ventana puede estar cerrada, y
este aviso no puede fallar.

> Hola, {{1}}. Aprobaste la prueba de manejo. Mañana te presentas a las {{2}} en {{3}} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Recuerda llevar la orden que te entregamos en recepción.

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Hora de presentación | 6:00 a. m. |
| {{3}} | Laboratorio | *(nombre del laboratorio, por confirmar con GH)* |

Botones: «Ahí estaré»

### 10. Autorización de datos con botones (opcional)

| Campo | Valor |
|---|---|
| Nombre | `sel_autorizacion_datos` |
| Categoría | Utilidad |
| Cuándo sale | Antes de consultar antecedentes, si el aspirante dejó de responder sin autorizar (entrega 1) |
| Modo | Revisar antes de enviar |

Por qué podría servir: normalmente la autorización se pide dentro de la
conversación, sin plantilla. Esta versión sirve si la ventana ya cerró, y sus
botones dejan una respuesta inequívoca como evidencia.

> Hola, {{1}}. Para seguir con tu proceso como conductor necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Política de datos: {{2}}. ¿Nos autorizas?

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Enlace a la política de datos | *(por confirmar)* |

Botones: «Sí, autorizo» · «No autorizo»

### 11. Recordatorio de las pruebas psicosensotécnicas (opcional, después)

| Campo | Valor |
|---|---|
| Nombre | `sel_recordatorio_psicotecnica` |
| Categoría | Utilidad |
| Cuándo sale | El día de la prueba, si se agenda aparte del día de contratación (entrega 4) |
| Modo | Automático |

Depende de la decisión de la junta sobre cómo se aplican las pruebas (fecha
límite: 23 de noviembre). Si se hacen el mismo día de la contratación, en la
empresa, no hace falta. Meta suele aprobar las plantillas de utilidad en horas,
así que puede pedirse después de esa decisión.

> Buenos días, {{1}}. Te recordamos que hoy a las {{2}} tienes las pruebas psicosensotécnicas en {{3}}. ¿Nos confirmas que vienes?

| Variable | Qué es | Ejemplo |
|---|---|---|
| {{1}} | Primer nombre | Carlos |
| {{2}} | Hora | 8:00 a. m. |
| {{3}} | Lugar | La Carolina |

Botones: «Sí, voy» · «Necesito otra fecha»

### Lo que no necesita plantilla

Estos mensajes siempre salen con la ventana abierta, porque responden a algo que
el aspirante acaba de escribir o tocar. Van en el catálogo de mensajes de Gestivo
como texto normal:

- Bienvenida, respuesta sobre salario u horario y reenvío de un archivo ilegible.
- **Cita reprogramada:** cuando el aspirante toca «Sí, reprogramar» o «Necesito
  otra fecha», la ventana se abre y la nueva fecha sale como texto. *No está en el
  catálogo del documento de requerimientos; hay que agregarla.* Texto sugerido:
  «Listo, {nombre}. Te esperamos el {fecha} a las {hora} en La Carolina,
  {dirección}, para la prueba de manejo. Trae zapatos cerrados y tu hoja de vida
  impresa; si tu licencia exige lentes, tráelos.»
- El seguimiento a las 2 horas que ya existe.
- **La pregunta «¿vienes recomendado por alguien que trabaja en la empresa?»** (desde el
  21-nov-2026): el asistente la hace apenas el aspirante da la cédula, antes de la autorización,
  y sale con los botones «Sí» y «No». Son botones de respuesta dentro de la conversación (mensaje interactivo),
  no una plantilla: no hay nada que enviar a Meta. Si Meta rechazara el mensaje con botones, la
  pregunta sale como texto con «Responde Sí o No».

**Desde el 21-nov-2026 (laboratorios):**

- **Plantilla nueva `sel_orden_laboratorio`** (UTILITY): la orden de exámenes al laboratorio que la recibe por
  WhatsApp. Lo inicia la empresa, así que necesita aprobación. Texto: «Buen día. El {fecha} a las {hora} se acerca
  {nombre}, C.C. {cedula}, aspirante al cargo de {cargo}, para la fase {fase} de los exámenes médicos de ingreso de
  Transportes La Carolina. Quedamos atentos a los resultados por este medio.» Se envía a Meta desde la pestaña
  Mensajes (la primera vez sale con su nombre, sin «_v2»).
- **`sel_examenes_fase1` y `sel_examenes_fase2`** cambian de texto (la fecha real en vez de «Mañana» y la orden por
  el chat). Mientras Meta no aprueba la versión nueva se usa la aprobada.
- **Enviadas a Meta el 21-nov-2026** desde desarrollo (que usa la misma cuenta de WhatsApp que producción):
  `sel_orden_laboratorio`, `sel_examenes_fase1_v2` y `sel_examenes_fase2_v2`, las tres en revisión. En producción no
  hay que volver a enviarlas: después de aplicar las migraciones, «Actualizar estado de las plantillas con Meta»
  adopta las `_vN` que ya existen en Meta con el mismo texto del mensaje (`versionNuevaEnMeta` en `plantillas.ts`).
- La orden de exámenes y la carta del banco que se le envían al aspirante son documentos dentro de la ventana de
  24 horas: no llevan plantilla. Si la ventana está cerrada, salen cuando el aspirante escriba.

Tampoco llevan plantilla los avisos internos (la alerta de las 11:00 a. m. para
llamar a quien no confirmó, o el «llamar» de la reactivación): son marcas para
Gestión Humana dentro de Gestivo, no mensajes al aspirante.

## Autorización de tratamiento de datos

No es una plantilla: el asistente la envía dentro de la conversación, antes de
consultar antecedentes (requerimiento A4). Se incluye aquí porque también necesita
revisión.

El texto del documento de requerimientos no dice que los datos se conservan para
futuros procesos, y Gestión Humana decidió no borrar los datos de quien no es
contratado (NF3). Por eso se propone este texto:

> Para continuar necesitamos tu autorización para tratar tus datos personales, consultar tus antecedentes y conservar tu información para este y futuros procesos de selección de La Carolina, según la Ley 1581 de 2012. Puedes leer nuestra política de tratamiento de datos aquí: {enlace_politica}. ¿Nos autorizas? Responde SÍ o NO.

## Lo que falta confirmar

- [x] Texto de las 11 plantillas, enviadas a Meta el 13 de noviembre.
- [ ] Aprobación de Meta (revisar categoría: las de reactivación van como marketing).
- [ ] Dirección de la sede para la citación y el recordatorio.
- [ ] Nombre del laboratorio para el aviso de la fase 2.
- [ ] Texto de la autorización, validado por Gestión Humana o el área jurídica.
- [ ] Enlace a la política de tratamiento de datos de La Carolina.
