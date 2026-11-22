# Selección de conductores en Gestivo — entrega 1

Asistente de WhatsApp, preselección automática, reactivación de aspirantes
fríos y mensajes y tiempos editables. Requerimientos A1–A5, B1–B3, J1, N1–N5 y
NF2, NF5, NF6 y NF8 de `docs/Requerimientos — Selección de conductores.md`.

## Para activarlo

1. Aplicar la migración `supabase/migrations/20261113205625_seleccion_entrega_1_asistente_y_preseleccion.sql`
   en el SQL Editor (primero en desarrollo, después en producción). Es
   idempotente. Si avisa que hay cédulas con más de un proceso abierto, hay que
   cerrarlas y volver a ejecutarla para que se cree el índice que impide duplicados.
2. Dar el permiso **Candidatos › Selección · mensajes, tiempos y reglas de
   preselección** a quien configure (es sensible: no se hereda).
3. En **Candidatos › Selección: mensajes, reglas e IA**, llenar la dirección de la
   sede, el laboratorio y el enlace a la política de datos.
4. En **Comunicaciones › Agente de IA**: cargar las preguntas sugeridas (los 7
   datos), revisar el prompt sugerido y elegir el modelo.
5. Opcional: `CROMA_API_KEY` en `.env.local` y en Vercel para consultar el SIMIT
   y la licencia en el RUNT con Croma. Sin la clave, Gestión Humana registra el
   SIMIT y verifica la licencia a mano.

Las 11 plantillas de Meta se enviaron a aprobación el 13 de noviembre de 2026
(`docs/seleccion-plantillas-whatsapp.md`). Hasta que Meta las apruebe, la
reactivación fuera de la ventana de 24 horas no envía nada; el resto funciona.

## Cómo funciona

| Pieza | Qué hace | Código |
|---|---|---|
| Embudo | Estados en el orden real: preselección (`pendiente`) → antecedentes → citado → prueba de manejo → escuela → fase 1 → fase 2 y rutas → reconocimiento de ruta → contratado / cierre | `src/lib/contratacion/constants.ts` |
| Historial | Cada cambio de estado, dato, semáforo y autorización queda con quién (usuario, asistente o sistema) y cuándo | `procesos_contratacion_eventos`, `src/lib/contratacion/servidor.ts` |
| Tablero | Candidatos › Tablero: una columna por estado; arrastrar cambia el estado del proceso y pide la causa al cerrar. Se actualiza solo por un aviso en tiempo real (solo el id) | `src/components/candidatos/kanban-procesos.tsx` |
| Asistente | Pide los 7 datos y la hoja de vida, la autorización de datos y no habla de salario ni horarios | `src/lib/comunicaciones/agente/motor.ts` |
| Extracción | En paralelo con cada respuesta, otra llamada al modelo lee el chat y devuelve los datos en JSON. Se guardan en la conversación y, con cédula y nombre, se crea o completa el proceso sin duplicar por cédula ni por celular | `src/lib/seleccion/extraccion.ts`, `proceso-desde-chat.ts` |
| Semáforo | Edad, residencia o traslado, licencia C2/C3 y SIMIT. Con los 4 en verde y la autorización, pasa solo a antecedentes. Con uno en rojo propone cerrar, pero lo confirma una persona. La experiencia no bloquea (queda «carta laboral pendiente») | `src/lib/seleccion/preseleccion.ts`, `servidor.ts` |
| Licencia (RUNT) | Con autorización y cédula, consulta Croma (`POST /co/runt/citizen-by-document/v1`): categorías, vencimiento de cada una y si está cancelada, suspendida o retenida. Marca sola «licencia verificada en el RUNT» y manda sobre lo declarado: sin licencia, vencida (o con menos meses de los del ajuste `licencia_vigencia_minima_meses`) o sin C2/C3 queda en rojo enseguida, y el asistente se lo dice en su siguiente respuesta. Por eso el asistente ya no pregunta la vigencia. Va antes del SIMIT: si la licencia descarta, no se gasta esa consulta | `src/lib/verificacion/`, `preseleccion.ts` |
| SIMIT | Con autorización, cédula y nada declarado en rojo, consulta Croma (`POST /co/simit/account-status/v1`). Si Croma responde como trabajo asíncrono, el cron lo termina | `src/lib/verificacion/` |
| Reactivación | 24 h sin respuesta y sin hoja de vida: primer aviso. 72 h después: segundo aviso (por defecto «revisar antes de enviar»). 24 h después: marca «Llamar». A los 7 días: cierre como «Incomunicado». Si responde, vuelve a empezar | `src/lib/seleccion/reactivacion.ts`, `reactivacion-ejecutar.ts` |
| Mensajes y tiempos | Texto, vista previa, historial, volver al sugerido, modo de envío y envío de una versión nueva a Meta. Tiempos y reglas con su valor sugerido | `src/app/(dashboard)/candidatos/seleccion/` |
| Revisar antes de enviar | El mensaje queda sugerido en el chat de la bandeja: «Usar y editar» con la ventana abierta, o «Enviar como plantilla» con la ventana cerrada | `BandejaClient.tsx` › `BorradorSugerido` |

Si un proceso se cerró solo (no pasó la preselección a los 30 minutos, o quedó
«Incomunicado») y la persona vuelve a escribir, aunque sea días después, se
reabre en «Preselección» y el chat queda marcado para que una persona la llame.
«Incomunicado» se reabre con cualquier mensaje; un requisito, solo si cambió
justo esa respuesta (ahora sí se traslada, va a renovar la licencia, corrige la
edad o ahora autoriza). Los cierres por antecedentes, «Ya trabaja en la empresa»
y los que hizo una persona no se reabren solos
(`proceso-desde-chat.ts` › `cierreAutomatico`, `actualizacion-chat.ts` › `cambioQueReabre`).

La reactivación, el estado de las plantillas y las consultas pendientes del
SIMIT corren en el cron `seguimiento-whatsapp` (cada 15 minutos, Vercel). Los
avisos solo salen en el horario permitido de Comunicaciones › Configuración.

## Pruebas

`npm run test:seleccion` (semáforo, extracción, mensajes, ajustes, reactivación
y respuestas de Croma) y `npm run test:comunicaciones` (reglas del asistente).

El chat de prueba de Comunicaciones › Agente de IA muestra, debajo de la
conversación, los datos que quedarían en el proceso.

## Pregunta «¿vienes recomendado?» y apadrinados (21-nov-2026)

Migración `20261121181420_seleccion_pregunta_recomendado_y_apadrinados.sql` (columnas `recomendado`, `recomendado_at`
y `recomendado_por` en el proceso, `registrado_el` en `padrino_referidos`, y el saludo y la lista de preguntas
sugeridas si nadie los había editado). La `20261121190711_seleccion_recomendado_despues_de_la_cedula.sql` pasa la
pregunta a después de la cédula: devuelve el saludo a la pregunta de la ciudad y reordena la lista sugerida.

- **Cuándo se pregunta.** Después del saludo y de la cédula (con el primer apellido y la fecha de expedición), en
  un mensaje solo para eso; la autorización va en el mensaje siguiente. Primero se probó como primera pregunta,
  pero chocaba con quien escribe por otro tema; el usuario pidió moverla el 21-nov-2026. Como va antes de la
  autorización, el «sí» sigue siendo anterior al proceso. Sale con botones «Sí» y «No» (`enviarBotones` en
  `comunicaciones/whatsapp.ts`): el asistente cierra el mensaje con la marca `[[SI_NO]]` y el sistema la cambia
  por los botones. No necesita plantilla de Meta.
- **No se pregunta quién lo recomendó** (Salud Ocupacional, 21-nov-2026): basta el sí o el no; el padrino lo
  asigna Gestión Humana en el Plan Padrino. La extracción guarda `recomendado` y la hora de la respuesta
  (`recomendado_at`, sea sí o no) en el prefiltro y, cuando hay proceso, en el candidato (`guardarRecomendado` en
  `proceso-desde-chat.ts`). Si dice el nombre por su cuenta, queda en `recomendado_por` como pista.
- **Un «No» es definitivo desde el chat.** Un «sí» posterior no lo cambia; el asistente le dice que Gestión
  Humana lo revisará. Solo quien tiene «Plan Padrino · aprobación» lo corrige en el formulario del proceso, con
  motivo obligatorio, y queda en el historial. Migración `20261121194016_seleccion_recomendado_sin_nombre_y_respuesta_fija.sql`.
- **En Candidatos** queda la etiqueta «APADRINADO» (con «SIN PADRINO» mientras no tenga registro en el plan) y
  el filtro «Apadrinados sin padrino». No es un estado del embudo: el candidato sigue su proceso.
- **En el Plan Padrino** aparece en «Apadrinados sin padrino» para asignarle el padrino. Ver `docs/plan-padrino.md`.
- **Pruebas.** `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-recomendado.mts`
  (guardado desde el chat, lista de pendientes, R13 con la v3 y la v2; borra lo que crea) y los casos `rec-*` de
  `npm run evaluar:asistente`. Si la clave de OpenRouter no tiene saldo, el aspirante simulado de la evaluación
  sigue con el proveedor del asistente (antes cortaba la conversación sin avisar).

## Laboratorios, órdenes de exámenes y carta del banco (21-nov-2026)

Lo pidió Salud Ocupacional en la llamada del 21-nov-2026. Migración
`20261121194842_seleccion_laboratorios_ordenes_y_aplazado.sql`. Se configura en **Candidatos › Selección ›
Laboratorios**.

- **Laboratorios** (`seleccion_laboratorios`): Biobac (orden por correo a recepcion@biobacips.com y
  comercial2@biobacips.com, con copia configurable) y Rescate (por WhatsApp). Cualquiera puede cambiar de canal.
  Cada aspirante tiene su laboratorio (`procesos_contratacion.laboratorio_id`): al citar la fase 1 se le asigna el
  predeterminado y se puede cambiar en la ficha (Exámenes médicos). La fase 2 va al mismo. `{laboratorio}` en los
  mensajes es el nombre y la dirección del laboratorio del aspirante; el ajuste `laboratorio_nombre` queda de respaldo.
  El número de WhatsApp de un laboratorio queda marcado como laboratorio: lo que escriba se lee como resultados.
- **Reparto y días de atención** (migración `20261121202736_seleccion_reparto_de_laboratorios_y_dias_de_atencion.sql`,
  `elegirLaboratorio` en `laboratorios.ts`). Cada laboratorio tiene sus días de atención y sus días preferidos (Rescate
  los sábados, porque entrega más rápido). Al citar la fase 1: solo cuentan los activos que atienden ese día; si
  alguno lo tiene como preferido, va a ese; si no, según el reparto (ajuste `laboratorio_reparto`): siempre el
  predeterminado o por porcentaje (al que más lejos esté de su parte en los últimos 30 días). Si ese día no atiende
  ninguno, la cita pasa al siguiente día que alguno atienda; la fase 2 va al mismo laboratorio en un día que atienda.
  No se deja asignar a mano un laboratorio que no atiende el día de la cita. En el simulador, «¿A qué laboratorio
  iría?» muestra la elección para una fecha sin asignar nada.
- **Hora de exámenes:** 6:30 a. m., por orden de llegada. Los mensajes de fase 1 y fase 2 dicen la fecha real (antes,
  «Mañana») y que la orden llega por el chat; la fase 1 no es en ayunas y la fase 2 sí.
- **Orden de servicio y carta del banco** (plantillas en Word con marcas `{nombre}`, `{cedula}`, `{cargo}`, `{fecha}`,
  `{fecha_larga}`, `{laboratorio}`, `{laboratorio_direccion}`, `{laboratorio_telefono}`; `documento-word.ts`). Se
  suben en la pestaña Laboratorios (bucket `seleccion`). Al citar la fase 1, después del mensaje, al aspirante se le
  envían las dos por WhatsApp como documentos; con la ventana de 24 h cerrada salen cuando vuelva a escribir
  (`enviarDocumentosPendientes`, desde el webhook). En la ficha se pueden descargar y reenviar.
- **Orden al laboratorio:** en la pestaña Laboratorios, por día y laboratorio, con vista previa. Por correo, un solo
  correo con la lista de citados (como el que escribe Salud Ocupacional) y la orden de cada uno adjunta; se envía por
  SMTP (`src/lib/correo/enviar.ts`, variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Por
  WhatsApp, un mensaje por aspirante con la plantilla `sel_orden_laboratorio` (hay que enviarla a aprobación de Meta
  en la pestaña Mensajes). Cada cita guarda cuándo se envió (`orden_laboratorio_at`, `orden_aspirante_at`) para no
  repetirla.
- **Concepto «aplazado»** en los exámenes (además de apto y no apto), con motivo obligatorio: no cierra ni avanza; el
  proceso queda en su etapa hasta el resultado definitivo. Lo lee también el modelo en los mensajes del laboratorio
  («puede continuar a segunda fase» = apto en fase 1).
- **Simulador** (pestaña Laboratorios): documentos al aspirante (generar y simular el envío), orden al laboratorio
  (simular el envío) y respuesta del laboratorio (texto, PDF o foto que pasa por la misma lectura que un WhatsApp real
  y deja el aviso marcado «Simulado» en la Agenda). Con candidatos del chat de prueba nunca sale nada de verdad.
- **Chat de prueba › pestaña «Laboratorios»:** la conversación con cada laboratorio, solo con candidatos de prueba.
  Muestra los citados sin la orden enviada (botón «Enviar la orden», simulado), las órdenes que habrían salido (correo
  con destinatarios, asunto, cuerpo y adjuntos para descargar, o el WhatsApp) y lo que responde el laboratorio. Desde
  ahí se escribe como el laboratorio (texto, PDF o foto): pasa por la misma lectura que un WhatsApp real y se confirma
  ahí mismo; al confirmar, el mensaje de fase 2 le llega al chat del aspirante. Cada orden queda en
  `seleccion_envios_laboratorio` (migración `20261121204148`), simulada o real, como constancia; lo que responde el
  laboratorio, en `seleccion_avisos_laboratorio`. Al aspirante le llegan en su chat la orden y la carta como documentos.
- **Los chats de prueba se guardan** en el navegador de cada usuario (la lista y la conversación de cada uno, lo leído
  y el candidato guardado): al volver a la página siguen donde quedaron, y la página abre en la última pestaña usada.
  Al cerrar un chat se borra lo suyo. La conversación con los laboratorios queda en la base, no en el navegador.
- **Pruebas:** `npm run test:seleccion` (incluye `documento-word.test.ts` y `laboratorios.test.ts`) y la batería
  `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-laboratorios.mts [--orden <docx>] [--carta <docx>]`
  (una llamada real al modelo; borra lo que crea).

## Entrega 2: agenda y profesor

Migración `20261118195923_seleccion_entrega_2_agenda_y_profesor.sql`. Diseño en
`docs/seleccion-entregas-2-4.md`.

| Pieza | Qué hace | Código |
|---|---|---|
| Citar | Desde la ficha (sección «Citas») o la bandeja (botón «Citar»). Propone la fecha: hoy a la hora de la prueba si es antes del límite; si no, el siguiente día hábil (el sábado tiene su hora). Muestra el mensaje y **lo envía de una vez**: texto con la ventana de 24 h abierta, plantilla `sel_citacion` si no. El proceso pasa a «Citado» y el asistente sigue activo | `src/lib/seleccion/agenda.ts`, `agenda-servidor.ts`, `components/seleccion/citar-dialog.tsx` |
| SIMIT opcional | Ajuste `simit_obligatorio` (migración `20261118221044`, hoy en «no»; sin la fila vale «sí»): si Croma no responde el SIMIT y los otros tres requisitos están en verde, el aspirante pasa a antecedentes con la observación «falta el SIMIT». No se cita solo. Volver a «sí» cuando Croma lo resuelva | `servidor.ts` › `reevaluarPreseleccion`, `preseleccion.ts` › `debeAvanzarAAntecedentes` |
| Fuentes opcionales y caché | Migración `20261118230056`. Policía, Procuraduría y Contraloría tienen su ajuste «es obligatoria» (como RNMC y SIMIT): en «no», si la fuente no responde, el aspirante queda «Listo para citar» con la lista de lo que falta revisar a mano y no se cita solo; si responde, su resultado cuenta. Sin el RUNT el semáforo usa la licencia declarada y queda la observación. `croma_cache_dias` (3): una respuesta buena de Croma para la misma cédula se reutiliza esos días en vez de consultar otra vez (también tras reiniciar un candidato de prueba); las que dieron error no. En el chat de prueba ya no existe «Reconsultar en Croma» y «Consultar Croma de verdad» arranca apagada | `antecedentes.ts`, `seleccion/servidor.ts` › `fuentesOpcionales`, `verificacion/servidor.ts` › `consultaReciente` |
| Croma falla: reintentos y revisión manual | Una consulta que falla por algo pasajero se reintenta hasta dos veces en el mismo turno (si queda tiempo) y después la retoma el cron (antecedentes con freno; el SIMIT con `relanzarSimitFallidos`). Mientras una fuente obligatoria no responda, el asistente le dice al aspirante que seguimos verificando. En la ficha la fuente aparece «Error en Croma» con el enlace al portal oficial y el botón «Lo revisé a mano»: la persona da el visto bueno (sin novedad, con hallazgo o el valor del SIMIT), con nota y el certificado en PDF si lo adjunta (por ejemplo, el del RNMC). Desde ahí la fuente cuenta como respondida y no se vuelve a consultar en Croma para ese proceso | `verificacion/servidor.ts` › `conReintentos`, `verificacionEnCurso`; `contratacion/actions.ts` › `revisarFuenteAMano`; `components/seleccion/revision-manual.tsx` |
| Ficha y perfil del candidato | El proceso de selección se ve en el perfil (`/candidatos/[id]`) y en la ficha de la lista, en pestañas: Resumen (semáforo, antecedentes, vínculo, postulaciones anteriores), Citas y profesor, Croma (con «Error en Croma» y revisión manual), Documentos e Historial. La lista y el perfil se actualizan solos. La columna «Antecedentes» del proceso se llena con lo que respondió Croma. Al cerrar o contratar se cancelan las citas en pie | `components/seleccion/panel-seleccion.tsx`, `proceso-del-candidato.tsx` |
| Varios chats de prueba | Probar el asistente se ve como la bandeja de Comunicaciones: lista de chats, chat y panel lateral (Candidato, Profesor, Simular). Cada chat se abre con «Nuevo chat»: Guardar en Candidatos (sí por defecto), Consultar Croma de verdad (no por defecto) y, si no, el escenario de Croma simulado. Cada mensaje del profesor o de la agenda llega solo al chat de su candidato | `components/seleccion/chats-prueba.tsx`, `chat-prueba.tsx`, `lib/seleccion/escenario-croma.ts` |
| Croma simulado en el chat de prueba | Con «Consultar Croma de verdad» apagada y «Guardar en Candidatos» encendida, el candidato queda con lo que responde el escenario elegido (por defecto: la licencia que dijo, vigente; SIMIT en $0; antecedentes limpios; también licencia vencida o menor, cédula que no aparece, multas, hallazgos o Croma que no responde, por fuente), marcado «Simulado». Cada fuente se simula una vez por candidato. No gastan consultas ni se usan como caché. Reiniciar un candidato de prueba borra sus citas y lo que registró el profesor | `verificacion/servidor.ts` › `simularCromaProceso` |
| Cita automática | Ajuste `cita_automatica` (migración `20261118212803`; sin la fila vale «sí»): al quedar «Listo para citar», Gestivo cita solo al siguiente cupo y envía la citación. No lo hace (queda para una persona) si falta la dirección de la sede, falta el RNMC o es un reingreso | `agenda-servidor.ts` › `citarAutomaticamente`, `servidor.ts` › `marcarListoParaCitar` |
| Agenda | Candidatos › Agenda: citados del día con Llegó · No asistió · Confirmó · Reprogramar · Llamar. «Llegó» pasa el proceso a «Prueba de manejo» | `components/seleccion/agenda-dia.tsx`, `candidatos/agenda-actions.ts` |
| Reprogramar | La cita anterior queda «reprogramada» por el aspirante o por la empresa. Solo las del aspirante cuentan contra `reprogramaciones_max`; al superarlo se **propone** cerrar por «Desistimiento» (lo decide una persona). `cita_reprogramada` no tiene plantilla: con la ventana cerrada queda como borrador | `agenda-servidor.ts` |
| Días del profesor | Por día: «No puede» (enfermedad, permiso, otro) o «Puede a otra hora». La citación salta esos días o usa esa hora. «Reprogramar las N citas» mueve las de ese día al siguiente cupo y avisa a cada aspirante sin contarle la reprogramación. Lo marca el profesor o Gestión Humana | `seleccion_disponibilidad_profesor`, `components/seleccion/disponibilidad-profesor.tsx` |
| Profesor | `/profesor` (módulo `profesor`, rol «Profesor de manejo»), pensada para el celular: llegada, prueba de manejo (ruta escrita, partes del motor, resultado), clases de escuela (una fila por clase, sin tope), salidas de reconocimiento de ruta, observaciones y concepto final. «Pasa a exámenes» crea la cita del laboratorio y envía `examenes_fase1`; «No continúa» y «No lo acepto» cierran el proceso (decisión del profesor) | `src/lib/seleccion/profesor-servidor.ts`, `components/seleccion/profesor-vista.tsx`, `app/(dashboard)/profesor/` |
| Clases de escuela | Por cada clase el profesor marca si el aspirante llegó. «No llegó» queda como falta, no cuenta como clase dictada y sigue en escuela (o «No continúa»). Si llegó y necesita más clases, puede decir cuántas le faltan; ese cálculo se va descontando con cada clase dictada y el profesor lo puede subir o bajar. Migración `20261118222930` (sin ella una clase normal se guarda, pero no la falta) | `profesor-servidor.ts` › `registrarClase`, `clasesPendientes` |
| Automáticos | En el cron `seguimiento-whatsapp`: 8:00 recordatorio de la cita; 11:00 sin confirmar → chat para una persona y «Llamar» en la agenda; hora + tolerancia sin llegada → «No asistió» y el aviso como borrador (reversible); 7:30 recordatorio de escuela, solo a quien el profesor mandó a escuela con el registro nuevo. Si el profesor no puede ese día, no sale nada para las citas sin reprogramar | `src/lib/seleccion/agenda-ejecutar.ts` |
| Respuesta a la cita | El webhook lee «Sí, voy» y «Necesito otra fecha» antes del asistente, esté o no pausado: confirma, o deja la cita como «Pide otra fecha». El asistente conoce la cita y, **solo si la persona dice que no puede o no llegó**, le pregunta qué día puede, le ofrece los próximos días con prueba (la hora de cada día es fija) y mueve la cita con la marca `[[REPROGRAMAR:AAAA-MM-DD]]`, que el sistema valida y quita del mensaje. Pasa a una persona como último recurso: ningún día le sirve, ya gastó las reprogramaciones o el asistente está pausado en ese chat. Enviar desde la bandeja un mensaje sugerido de la agenda (citación, inasistencia…) no pausa al asistente | `agenda-ejecutar.ts` › `procesarRespuestaCita`, `agente/motor.ts` › `reglasCita`, `agenda-servidor.ts` › `reprogramarPorAsistente`, `comunicaciones/actions.ts` |
| Probar | Candidatos › Selección › Probar el asistente: el chat de prueba y, al lado, la pantalla del profesor en un marco de celular. Solo ve candidatos del chat de prueba (`origen = chat_prueba`) y **no sale nada por WhatsApp**: la citación y los demás mensajes aparecen en el chat de prueba. Quien puede editar la configuración de Selección lo prueba sin tener el rol de profesor. Los días del profesor sí son los reales | `src/lib/seleccion/prueba-profesor-actions.ts`, `components/seleccion/marco-profesor-prueba.tsx` |

Un mensaje automático al que le falta un dato (por ejemplo, el laboratorio sin
configurar) no sale a medias: queda como borrador en la bandeja. Antes de usarlo
con aspirantes reales hay que llenar la dirección de la sede y el laboratorio en
Candidatos › Selección, y asignar el rol «Profesor de manejo» al usuario del
profesor en Configuración › Usuarios.

Batería simulada de la entrega 2 (contra la base de desarrollo, con candidatos ficticios que borra al terminar): `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-entrega-2.mts`.

## Entrega 3: antecedentes, exámenes, carpeta y contratación

Migración `20261120195812_seleccion_entrega_3_examenes_carpeta_antecedentes.sql`. Diseño en
`docs/seleccion-entregas-2-4.md`.

| Pieza | Qué hace | Código |
|---|---|---|
| Reglas de antecedentes | Las preguntas que se le hicieron a Gestión Humana (`docs/seleccion-antecedentes-croma.pdf`, sección 9) son ajustes en Selección › Tiempos y reglas › «Antecedentes: qué se tolera»: qué hacer con un hallazgo de cada fuente (se tolera, lo revisa una persona o descarta), valor y antigüedad del fallo fiscal que se toleran, medidas del RNMC que se toleran y palabras de medidas que nunca se toleran. Valores de prueba: Policía y Procuraduría a revisión, Contraloría descarta, RNMC hasta 2. El veredicto (`limpio`, `tolerable`, `revision`, `descarta`, `pendiente`) queda en `antecedentes_resultado`. Lo tolerable sigue solo; «descarta» solo **propone** el cierre. Cambiar una regla no reevalúa los procesos ya evaluados: «Volver a evaluar» en la ficha | `src/lib/seleccion/antecedentes.ts`, `servidor.ts` › `evaluarAntecedentesProceso` |
| Decisión de antecedentes | Pestaña «Antecedentes» de la ficha: por fuente, la regla que se aplicó y por qué; «Aprobar y seguir» o «Rechazar y cerrar», con justificación. Permiso especial `candidatos.decidir_antecedentes`. Filtro «Antecedentes por revisar» en Candidatos. «Lo revisé a mano» sirve también para corregir un hallazgo de Croma. «Consultar antecedentes» para los procesos creados a mano | `components/seleccion/seccion-antecedentes.tsx`, `contratacion/actions.ts` › `decidirAntecedentes` |
| Exámenes médicos | Pestaña «Citas y profesor»: resultado de cada fase con observación y el PDF. Fase 1 apta → fase 2, cita en el laboratorio el siguiente día hábil y `examenes_fase2`. Fase 2 apta → reconocimiento de ruta. No apta → se propone cerrar con «Exámenes médicos» y lo confirma una persona | `examenes.ts`, `examenes-servidor.ts`, `components/seleccion/seccion-entrega3.tsx` |
| Rutas | La ficha muestra «X de 2» y permite registrar una salida (la misma del profesor). El profesor ve en su lista de rutas a quien ya está en exámenes. Los reingresos no necesitan rutas | `profesor-servidor.ts`, `seccion-entrega3.tsx` |
| Carpeta | Pestaña «Carpeta»: los documentos del ajuste `carpeta_items` (lista de prueba) con estado pendiente, recibido o validado; subir archivos (bucket privado `seleccion`, por `/api/seleccion/adjuntos`, hasta 10 MB) y anularlos con motivo; referencias con la llamada (con quién se habló y qué dijo). Desde la prueba de manejo, cada `documentos_pendientes_dias` queda como borrador el recordatorio `documentos_pendientes` | `carpeta-servidor.ts`, `documentos-ejecutar.ts` |
| Condiciones para contratar | Exámenes de las dos fases aptos, rutas mínimas (salvo reingreso), carpeta validada, visto bueno de la directora (permiso `candidatos.aprobar_contratacion`) y, con `contratar_exige_psicotecnica`, el concepto apto de la prueba psicosensotécnica. Se exigen en `cambiarEstadoProceso`, así que valen desde la ficha, el tablero y el formulario; un proceso nuevo no puede crearse «Contratado». Quien tiene `candidatos.contratar_con_excepcion` contrata con justificación (queda en el historial). Ajuste `contratar_exige_condiciones` para apagarlo | `contratacion.ts`, `contratacion-servidor.ts` |
| Costo y tope | Cada respuesta del asistente queda en `seleccion_consumos` con su costo. Las consultas reales a Croma (no las reutilizadas, simuladas ni a mano; las que dieron error tampoco) se cuentan y se multiplican por `croma_costo_consulta` (migración `20261121025317`, en 0 hasta conocer la tarifa). Selección › Tiempos y reglas › «Costo del asistente» muestra el gasto del mes frente al tope (`tope_mensual_cop`, `trm`). Al 100 % se detienen el asistente (el chat pasa a una persona), el seguimiento, la reactivación, el recordatorio de documentos y las consultas automáticas de Croma | `consumos.ts`, `consumos-servidor.ts` |
| Laboratorio | En la bandeja, «Es el laboratorio» en los datos del contacto: el asistente, el seguimiento y la reactivación lo saltan. Cada mensaje suyo (texto o foto) lo lee el modelo del asistente y queda como aviso en Candidatos › Agenda, asociado al aspirante por cédula o nombre; al confirmarlo se registra el examen y el archivo pasa a la carpeta. Los PDF (hasta 8 MB) también se leen: van al modelo como documento; uno más pesado queda para asignar a mano. Arriba en la Agenda también salen los exámenes de los próximos 7 días | `laboratorio.ts`, `laboratorio-lectura.ts`, `laboratorio-servidor.ts`, `components/seleccion/agenda-examenes.tsx`, `comunicaciones/TipoContacto.tsx` |

Batería simulada de la entrega 3: `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-entrega-3.mts` (no contrata a nadie de verdad).

## Entrega 4: lectura con IA, audios, día de contratación e indicadores

Migración `20261121030237_seleccion_entrega_4_lectura_e_indicadores.sql` (enciende `contratar_exige_psicotecnica` si
nadie lo había cambiado). Diseño en `docs/seleccion-entregas-2-4.md`.

| Pieza | Qué hace | Código |
|---|---|---|
| Lectura de documentos | Las fotos y PDF que manda el aspirante (cédula, licencia, hoja de vida, carta laboral) se leen en **una sola llamada por ráfaga** (máx. 8 archivos) con la IA de «Documentos» de la pestaña IA de Selección (Haiku 5.5 por defecto desde el 21-nov-2026; antes, el ajuste `lectura_modelo`, que queda sin uso). El modelo clasifica, junta las páginas de un mismo documento y extrae cada campo con su confianza y lo que vio. Gestivo calcula los meses de experiencia en conducción (avisa los periodos sin fecha), la edad y si la cédula coincide con la del proceso. Corre en `responderConAgente` después de la lectura de la cédula, dentro del límite de 25 s; lo que no alcance lo termina el cron. La cédula que ya leyó la lectura de la entrega 1 no se vuelve a mandar al modelo. Ajuste `lectura_activa` para apagarlo. El costo queda en `seleccion_consumos` (concepto `lectura`) | `src/lib/seleccion/lectura/` (`esquema`, `interpretar`, `leer`, `ejecutar`), `proveedores.ts` › `generarConAdjuntos` |
| Word y varias fotos | Las hojas de vida en Word (.docx) se leen sacando el texto (párrafos y tablas) y hasta 3 imágenes pegadas, sin convertirlas a PDF (`lectura/docx.ts`, con `jszip`). Varias fotos de una misma hoja de vida que llegan seguidas van en la misma llamada (hasta 12 archivos) y salen como un solo documento con todas sus páginas | `lectura/docx.ts`, `lectura/ejecutar.ts` |
| Experiencia y referencias | Bloque en el Resumen de la ficha. Al aceptar la hoja de vida, sus empleos quedan en `procesos_contratacion.experiencia_laboral` (migración `20261121064208`) **sin verificar**. Se verifican solos al aceptar la carta laboral de esa empresa (si el empleo no estaba, se agrega ya verificado) o al validar una referencia laboral de ahí; a mano: «Verificada con carta», «Verificada con referencia», «No se confirmó» (con nota) o «Deshacer». Muestra los meses de conducción declarados y los verificados, el estado (sin verificar, en parte, verificada, con problema) y las referencias con su llamada. Se pueden agregar empleos a mano | `experiencia.ts`, `experiencia-servidor.ts`, `components/seleccion/seccion-experiencia.tsx` |
| Lo que ve el asistente | Junto a cada archivo, una línea con lo leído («licencia de conducción; categorías: C2…; pendiente de revisión»). Si no se pudo leer, el asistente pide repetir la foto con buena luz | `ejecutar.ts` › `lecturasDocumentosDeConversacion`, `responder.ts` |
| Documentos leídos | Pestaña «Carpeta» de la ficha: la imagen a un lado y los campos al otro para aceptar, corregir o rechazar (los calculados siguen al campo del que salen); se puede cambiar el tipo de documento. Aceptar **solo llena los datos vacíos** del proceso (fecha de nacimiento, edad, expedición, experiencia, restricciones de la licencia) y marca su origen en `datos_origen` («leido»), crea las referencias sin repetirlas, deja el documento «recibido» en la carpeta (validar sigue siendo de una persona) y copia el archivo a la carpeta. Nada leído pone un requisito en rojo sin esa revisión | `lectura/revision-servidor.ts`, `components/seleccion/seccion-entrega4.tsx` |
| Lentes en la citación | La restricción de lentes aceptada de la foto de la licencia también agrega la nota «tráelos a la prueba» de la citación (antes solo la del RUNT) | `preseleccion.ts` › `notaCitacion` |
| Audios | Los audios del aspirante se transcriben al llegar con la IA de «Voz» de la pestaña IA de Selección (OpenRouter con GPT-4o mini Transcribe por defecto, o Whisper; antes, el ajuste `transcripcion_modelo`, que queda sin uso) y, si ese proveedor no está o falla, con el otro (OpenAI u OpenRouter) y quedan en `wa_mensajes.transcripcion`: el asistente y la extracción los leen como si estuvieran escritos (cuenta como declarado) y la bandeja muestra el texto bajo el audio. Sin ninguna de las dos claves, o sin saldo, no se transcribe y el asistente pide escribirlo, como antes. El costo es el que devuelve OpenRouter. Ajuste `transcribir_audios`. La ruta de accidentes usa la misma función | `src/lib/ia/transcripcion.ts`, `src/lib/seleccion/audios.ts` |
| Día de contratación | Pestaña «Día de contratación» de la ficha. Psicotécnica: la de Gestivo (concepto de la psicóloga, con enlace al informe) o el resultado de una IPS registrado a mano con su PDF; para contratar vale la más reciente y «apto con observaciones» cuenta como apto. Cita de psicotécnica con lugar (vacío = la sede): ese día, a la hora del recordatorio de citas, sale `recordatorio_psicotecnica`. Entrevista (fecha y nota) e inducción. Solo registro: no cambia la etapa | `dia-contratacion.ts`, `dia-contratacion-servidor.ts`, `agenda-ejecutar.ts` |
| Indicadores | Candidatos › «Indicadores» (`/candidatos/indicadores`): los cinco de la junta (% que envía hoja de vida entre los que llegaron por el asistente, % de citados a la prueba de manejo que asisten, días del primer mensaje a la contratación, consultas de antecedentes automáticas frente a manuales, costo por aspirante), el embudo y dónde están hoy, cuánto tardan en cada etapa (de `procesos_contratacion_eventos`, desde el 13-nov), causas de cierre, por semana, por canal, asistencia por tipo de cita y el costo por concepto frente al tope. La base son los procesos creados en el periodo, sin los del chat de prueba | `indicadores.ts`, `indicadores-servidor.ts`, `app/(dashboard)/candidatos/indicadores/page.tsx` |

| Respuesta de los aspirantes | En la misma vista (21-nov-2026): cuántos nos responden y hasta qué pregunta llegan, cuánto tardan (en responder, hasta quedar registrados, hasta la primera cita), si los recordatorios por silencio funcionan (por número de recordatorio) y los de cita, y los recomendados (sí, no, sin responder; apadrinados con y sin padrino). Sale de los mensajes y las conversaciones: no necesita migración | `indicadores-respuesta.ts`, `indicadores-servidor.ts` › `leerIndicadoresRespuesta` |

Comprobación de los indicadores contra conteos directos en la base (solo lee; termina con error si alguna cifra no
coincide): `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-verificar-indicadores.mts [días…]`.
El 21-nov-2026 dio 46 cifras sin diferencias para 30 y 90 días en desarrollo.

Calibración con documentos reales (carpeta fuera del repositorio, con `esperado.json` opcional):
`npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/evaluar-lectura.mts <carpeta>`. Meta: clase correcta
en 9 de cada 10. No se hizo la lectura del código de barras de la cédula (primer recorte del plan).

Batería de la entrega 4: `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-entrega-4.mts`
(hace una llamada real al modelo con dos PDF ficticios).

## IA por separado: chat, documentos y voz (21-nov-2026)

La IA se configura en la pestaña **IA** de Candidatos › Selección (`/candidatos/seleccion?pestana=ia`, solo administrador). Antes estaba en Comunicaciones › Agente IA y en dos ajustes de Tiempos y reglas; `/comunicaciones/agente` y `/candidatos/ia` redirigen a la pestaña.

Comunicaciones queda solo con la bandeja y «Nuevo mensaje» (más los indicadores de quién atiende cada chat y el botón para tomar el control de uno). Lo que se movió:

| Estaba en Comunicaciones | Ahora |
|---|---|
| Agente IA (chat, prompt, preguntas, paso a una persona, últimas respuestas) | Selección › IA |
| Seguimiento a quien no responde (Configurar canal) | Solo en Selección › Tiempos y reglas › Conversación, donde ya estaba |
| Indicadores «Asistente de IA» y semáforo de «Selección de conductores» | Candidatos › Indicadores («Asistente de IA» y «Preselección del asistente») |
| Indicador «Reactivación» | Ya lo cubre «¿Sirven los recordatorios?» en Candidatos › Indicadores |
| Configurar canal (credenciales de Meta y webhook) | Selección › Canal de WhatsApp (solo administrador; `/comunicaciones/configuracion` redirige) |
| Indicadores de atención (volumen, quién atiende, pases, primera respuesta) | Candidatos › Indicadores › Atención del WhatsApp (`/candidatos/indicadores/whatsapp`; `/comunicaciones/indicadores` redirige) |

En la pestaña IA tampoco se repite lo de las otras pestañas: la respuesta sobre salario u horario es el mensaje «Salario u horario» de Mensajes (el campo del agente queda de respaldo, sin mostrarse) y el chat de prueba es «Probar el asistente». La barra de pestañas de Selección tiene también el enlace a Indicadores.

| Uso | Qué hace | Por defecto | Dónde se guarda |
|---|---|---|---|
| Chat | Conversa con el aspirante y extrae los datos al proceso | Claude Haiku 5.5 | `wa_agente.proveedor`, `modelo` |
| Documentos | Lee cédula, licencia, hoja de vida, cartas laborales y resultados del laboratorio (foto, PDF o Word) | Claude Haiku 5.5 (Sonnet, si se quiere más precisión con fotos malas) | `wa_agente.documentos_proveedor`, `documentos_modelo` |
| Voz | Transcribe las notas de voz | OpenRouter, GPT-4o mini Transcribe | `wa_agente.voz_proveedor`, `voz_modelo` |

- Las claves siguen en Configuración › Proveedores de IA. La migración `20261121213622` pone Haiku por Anthropic si su clave está guardada allí y, si no, por OpenRouter (`anthropic/claude-haiku-5.5`).
- Los documentos siempre usan un modelo fijo (`configDocumentos` en `opciones.ts`; `generarConAdjuntos` la aplica sola). La voz intenta primero el proveedor elegido y luego el otro.
- Sin la migración, los documentos se leen con el proveedor del chat y la voz va por OpenRouter con GPT-4o mini; al guardar la pantalla avisa que falta.
- Encender o apagar la lectura y la transcripción sigue en Selección › Tiempos y reglas (`lectura_activa`, `transcribir_audios`).
- Prueba con el modelo real: `scripts/seleccion-probar-hoja-vida.mts` (hoja de vida en Word y tres cartas en PDF; con Haiku, 26/26 el 21-nov-2026). Calibración con documentos reales: `scripts/evaluar-lectura.mts <carpeta> [--preciso]`.

**Prompt sin nombre ni saludo (21-nov-2026).** El prompt sugerido ya no trae «Eres Angie» ni el bloque «Saludo»: el nombre es el ajuste «Nombre del asistente» (Tiempos y reglas) y el saludo, el mensaje «Bienvenida» (Mensajes), que el motor le pasa al asistente aparte y que mandan sobre el prompt. La migración `20261121213622` quita esos dos trozos del prompt guardado si siguen como los dejó el sugerido. En la bandeja de Comunicaciones ya no están los botones «Agente IA», «Indicadores» ni «Configurar canal».

## Rutas del reconocimiento de ruta (21-nov-2026)

En Selección › Tiempos y reglas › «Escuela, exámenes y contratación», debajo de «Rutas del reconocimiento de ruta» (cuántas debe aprender), está la lista de rutas: se agregan, se corrigen, se quitan y se marcan las **obligatorias**. Tabla `seleccion_rutas_reconocimiento` (migración `20261121230433`, sembrada con las rutas de GEMA de los últimos 45 días y las que ya tenían salidas); botón para traer las rutas nuevas de GEMA.

- Cada nombre es una ruta distinta: las variaciones («A - 16 MIRAMAR», «A - 16 MIRAMAR - GAVIOTAS») cuentan aparte. La misma ruta registrada dos veces cuenta una.
- Para contratar: al menos `rutas_minimas` rutas aprendidas, entre ellas todas las obligatorias; si hay más obligatorias que ese número, se exigen todas (`avanceRutas` en `src/lib/seleccion/rutas.ts`). Reingreso: no aplica.
- El profesor y la ficha eligen de esta lista (obligatorias primero) y ven las obligatorias que faltan. La condición de la ficha dice «1 de 2 (B-17 MALLORQUIN) · falta la obligatoria A - 16 MIRAMAR».
- Al corregir un nombre se corrige también en las salidas ya registradas; al quitar una ruta, quien ya la aprendió la sigue teniendo como aprendida.

**Mensaje de reconocimiento de ruta (21-nov-2026).** Al registrar la fase 2 de exámenes como apta (desde la ficha o al confirmar el aviso del laboratorio), el proceso pasa a «Reconocimiento de ruta» y sale automático el mensaje «reconocimiento_ruta» del catálogo: «¡Felicitaciones, {nombre}! 🎉 Tus exámenes médicos salieron aptos. El siguiente paso es el reconocimiento de ruta: vas a salir con nuestro profesor a aprender {rutas} rutas. Acércate a {direccion} y pregunta por {contacto}.» ({rutas} es el ajuste o el número de obligatorias, si son más). A los reingresos no se les envía. Migración `20261121231903`; necesita la plantilla de Meta `sel_reconocimiento_ruta` para salir fuera de la ventana de 24 horas (si no está aprobada, queda como borrador en el chat, como los demás).

## Citas del reconocimiento de ruta (21-nov-2026)

El reconocimiento funciona como la prueba de manejo (decisiones de Gestión Humana del 21-nov):

- **Primera salida:** al registrar la fase 2 apta (salvo reingresos o quien ya completó las rutas), se crea una cita `reconocimiento` el siguiente día hábil en que el profesor puede, a la hora del ajuste «Hora del reconocimiento de ruta» (`reconocimiento_hora`, 9:00), y sale «reconocimiento_ruta» con el día, la hora y los botones «Sí, voy» / «Necesito otra fecha».
- **Siguientes salidas:** cada salida que registra el profesor marca la cita de hoy como «Llegó». Si todavía le faltan rutas, se cita la siguiente con «reconocimiento_siguiente» («Llevas 1 de 2 rutas…»), hasta que las aprenda. Al completarlas, o si «no continúa», se cancelan las salidas en pie.
- **Recordatorio y confirmación:** el cron recuerda el día de la salida con «recordatorio_reconocimiento» (a la hora del recordatorio de citas, si es antes), lee la respuesta (confirma o pide otra fecha) y, pasada la tolerancia sin llegada, marca «No asistió» con «inasistencia_reconocimiento» como borrador. Si pide otra fecha, el chat pasa a una persona (el asistente no mueve el reconocimiento).
- **Profesor:** en su pantalla ve «Reconocimiento de ruta · N» con «Llegó», «No asistió», «Sí vino (deshacer)» y «Registrar la salida».
- **Agenda de Gestión Humana (día):** muestra las salidas con su etiqueta; «Reprogramar» abre su propio formulario (día, hora, quién lo pidió) y envía «reconocimiento_reprogramado». Las reprogramaciones del aspirante se cuentan aparte de las de la prueba, con el mismo máximo.
- Si el profesor marca que un día no puede, las salidas de ese día quedan por reprogramar; si solo cambia la hora de la prueba, no las afecta.
- Migración `20261121235034` (tipo de cita, ajuste y los cinco mensajes con plantilla de Meta: `sel_reconocimiento_ruta`, `sel_reconocimiento_siguiente`, `sel_recordatorio_reconocimiento`, `sel_inasistencia_reconocimiento`, `sel_reconocimiento_reprogramado`).

**Si no puede ir a la cita (22-nov-2026).** Cuando el aspirante dice que no puede ir a la prueba de manejo o a la salida de reconocimiento de ruta (o no llegó), el asistente: 1) le pregunta por qué; 2) intenta una sola vez que mantenga la cita (es un paso corto; un permiso, el transporte, organizarse con la hora); 3) si aun así no puede, le ofrece **solo el siguiente día hábil con cita** (prueba: el siguiente día con prueba, a su hora; reconocimiento: el siguiente día hábil en que el profesor puede, a la hora del reconocimiento). Si pide un día más lejano, le explica que para que el proceso avance solo se puede mover a ese día. 4) Si ese día tampoco puede, no propone más fechas: pasa a Gestión Humana. El servidor solo acepta mover la cita a ese día (`reprogramarPorAsistente` › `siguienteDiaParaMover`). Gestión Humana, desde la agenda, sí puede moverla a cualquier día. Batería con el modelo real: `scripts/seleccion-probar-no-puede.mts` (8/8 con Haiku).
