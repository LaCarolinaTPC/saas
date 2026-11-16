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

La reactivación, el estado de las plantillas y las consultas pendientes del
SIMIT corren en el cron `seguimiento-whatsapp` (cada 15 minutos, Vercel). Los
avisos solo salen en el horario permitido de Comunicaciones › Configuración.

## Pruebas

`npm run test:seleccion` (semáforo, extracción, mensajes, ajustes, reactivación
y respuestas de Croma) y `npm run test:comunicaciones` (reglas del asistente).

El chat de prueba de Comunicaciones › Agente de IA muestra, debajo de la
conversación, los datos que quedarían en el proceso.
