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
3. En **Candidatos › Selección: mensajes y reglas**, llenar la dirección de la
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

## Entrega 2: agenda y profesor

Migración `20261118195923_seleccion_entrega_2_agenda_y_profesor.sql`. Diseño en
`docs/seleccion-entregas-2-4.md`.

| Pieza | Qué hace | Código |
|---|---|---|
| Citar | Desde la ficha (sección «Citas») o la bandeja (botón «Citar»). Propone la fecha: hoy a la hora de la prueba si es antes del límite; si no, el siguiente día hábil (el sábado tiene su hora). Muestra el mensaje y **lo envía de una vez**: texto con la ventana de 24 h abierta, plantilla `sel_citacion` si no. El proceso pasa a «Citado» y el asistente sigue activo | `src/lib/seleccion/agenda.ts`, `agenda-servidor.ts`, `components/seleccion/citar-dialog.tsx` |
| SIMIT opcional | Ajuste `simit_obligatorio` (migración `20261118221044`, hoy en «no»; sin la fila vale «sí»): si Croma no responde el SIMIT y los otros tres requisitos están en verde, el aspirante pasa a antecedentes con la observación «falta el SIMIT». No se cita solo. Volver a «sí» cuando Croma lo resuelva | `servidor.ts` › `reevaluarPreseleccion`, `preseleccion.ts` › `debeAvanzarAAntecedentes` |
| Fuentes opcionales y caché | Migración `20261118230056`. Policía, Procuraduría y Contraloría tienen su ajuste «es obligatoria» (como RNMC y SIMIT): en «no», si la fuente no responde, el aspirante queda «Listo para citar» con la lista de lo que falta revisar a mano y no se cita solo; si responde, su resultado cuenta. Sin el RUNT el semáforo usa la licencia declarada y queda la observación. `croma_cache_dias` (3): una respuesta buena de Croma para la misma cédula se reutiliza esos días en vez de consultar otra vez (también tras reiniciar un candidato de prueba); las que dieron error no. En el chat de prueba ya no existe «Reconsultar en Croma» y «Consultar Croma de verdad» arranca apagada | `antecedentes.ts`, `seleccion/servidor.ts` › `fuentesOpcionales`, `verificacion/servidor.ts` › `consultaReciente` |
| Croma falla: reintentos y revisión manual | Una consulta que falla por algo pasajero se reintenta hasta dos veces en el mismo turno (si queda tiempo) y después la retoma el cron (antecedentes con freno; el SIMIT con `relanzarSimitFallidos`). Mientras una fuente obligatoria no responda, el asistente le dice al aspirante que seguimos verificando. En la ficha la fuente aparece «Error en Croma» con el enlace al portal oficial y el botón «Lo revisé a mano»: la persona da el visto bueno (sin novedad, con hallazgo o el valor del SIMIT), con nota y el certificado en PDF si lo adjunta (por ejemplo, el del RNMC). Desde ahí la fuente cuenta como respondida y no se vuelve a consultar en Croma para ese proceso | `verificacion/servidor.ts` › `conReintentos`, `verificacionEnCurso`; `contratacion/actions.ts` › `revisarFuenteAMano`; `components/seleccion/revision-manual.tsx` |
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
