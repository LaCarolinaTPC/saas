# Crons de Gestivo

Producción corre en **Vercel Pro** desde el 13 de noviembre de 2026 (antes estuvo
unas semanas en Coolify). La base de datos sigue en el Supabase autoalojado en
Coolify. Los crons los dispara Vercel según `vercel.json`.

## Los crons

Todos son `GET`. Vercel los llama con el encabezado
`Authorization: Bearer <CRON_SECRET>`, que toma de la variable `CRON_SECRET` del
proyecto. Las rutas fallan cerrado: si la variable falta o no coincide, responden
401 y no hacen nada.

Los horarios de `vercel.json` están en **UTC**. Colombia no cambia de hora, así que
el desfase es siempre de 5 horas.

| Nombre | Ruta | Cron (UTC) | Hora de Colombia | `maxDuration` | Qué hace |
|---|---|---|---|---|---|
| sync-gema | `/api/cron/sync-gema` | `0 8 * * *` | 3:00 a. m. | 300 s | Datos de GEMA, consolida Financiera y evalúa hitos del Plan Padrino |
| riesgo-conductores | `/api/cron/riesgo-conductores` | `0 9 * * *` | 4:00 a. m. | 300 s | Análisis de riesgo de conductores |
| revision-timbradas | `/api/cron/revision-timbradas` | `30 9 * * *` | 4:30 a. m. | 300 s | Revisión de timbradas |
| sync-mgx | `/api/cron/sync-mgx` | `0 10 * * *` | 5:00 a. m. | 300 s | Réplica de MGX |
| sync-gps | `/api/cron/sync-gps` | `0 11 * * *` | 6:00 a. m. | 300 s | GPS de GEMA: kilometraje, bloqueos y eventos |
| seguimiento-whatsapp | `/api/cron/seguimiento-whatsapp` | `*/15 * * * *` | cada 15 min | 120 s | «¿Sigues interesado?» de WhatsApp a quien no responde y marcar para GH. Es el único disparador: sin este cron no se envía nada |

`/api/cron/financiera-consolidar` también existe, pero no va en el calendario: la
consolidación de Financiera ya corre dentro de `sync-gema`. Se puede llamar a mano
igual que los demás.

## Agregar o cambiar un cron

1. Cree la ruta en `src/app/api/cron/<nombre>/route.ts`. Debe exportar `GET`,
   `dynamic = "force-dynamic"` y un `maxDuration`, y debe validar `CRON_SECRET`
   como las demás.
2. Agréguela a `crons` en `vercel.json` con su horario en UTC.
3. Actualice la tabla de arriba.
4. Vercel solo registra los crons al desplegar a **producción**. Los despliegues
   de vista previa no corren crons.

## Límites que hay que respetar

- **Tiempo.** Vercel corta la función al llegar a `maxDuration`. Por eso el código
  deja de empezar trabajo nuevo antes de los 300 s. Los presupuestos se ajustan con
  variables de entorno:

  | Variable | Por defecto | Qué controla |
  |---|---|---|
  | `GEMA_SYNC_BUDGET_MS` | 200000 | Días de `puntos_virtuales` por corrida de GEMA (cron y botón de Parámetros) |
  | `GPS_CRON_BUDGET_MS` | 230000 | Cron del GPS |
  | `MGX_CRON_BUDGET_MS` | 240000 | Cron de MGX |

  **No suba `GEMA_SYNC_BUDGET_MS` por encima de 240000.** El candado de GEMA
  (`gema_abrir_corrida`) da por muerta cualquier corrida de más de 6 minutos. Si
  una corrida viva pasa de 6 minutos, otra podría arrancar encima. Para subirlo,
  primero hay que ampliar ese umbral con una migración.

- **Sin reintentos.** Si un cron falla, Vercel no lo repite: corre en el siguiente
  horario. Las sincronizaciones retoman desde su marcador, así que una noche
  perdida se recupera en la siguiente.
- **Puede haber corridas superpuestas.** Vercel no espera a que termine la
  anterior. GEMA y MGX tienen candado propio (409 u `omitida` si ya hay una
  corrida), y el seguimiento de WhatsApp reserva cada conversación antes de
  enviar.
- **Un solo disparador.** No deje tareas programadas en otro servidor (por ejemplo,
  las que hubo en Coolify) llamando las mismas rutas. Los envíos de WhatsApp no se
  duplicarían, pero las sincronizaciones sí trabajarían doble.

## Cómo comprobar que corren

- **Vercel › proyecto `saas` › Settings › Cron Jobs:** lista los crons, permite
  correr uno a mano y lleva a sus registros.
- **Por línea de comandos:**

  ```sh
  vercel logs requests --environment production --since 24h --limit 10000 --json
  ```

  Filtre por `requestPath` que empiece por `/api/cron`. Cada registro trae el
  `httpStatus`.
- **Tesorería › Parámetros:** muestra, por dataset, la última corrida y su estado
  (GEMA y GPS), y avisa si el cron de GEMA lleva más de 26 horas sin correr.
- **MGX:** la bitácora de corridas de su pantalla (`mgx_corridas`, origen «cron»).

### Qué significa cada respuesta

| Respuesta | Qué significa |
|---|---|
| 200 | Terminó. En `sync-mgx`, mire también el JSON: `omitida` (otra corrida en curso) y `estado: "parcial"` también responden 200 |
| 207 | **Algún dataset falló.** Vercel lo cuenta como correcto: hay que leer el JSON en los registros |
| 401 | `CRON_SECRET` falta o no coincide |
| 409 | `sync-gema`: ya había otra corrida en curso. Se omitió sin hacer nada |
| 500 | Error de la corrida; el detalle queda en los registros |
| 504 | Vercel cortó la función por tiempo (`maxDuration`) |

## Llamar un cron a mano

```sh
curl -sS --fail-with-body -m 330 -H "Authorization: Bearer <CRON_SECRET>" https://gestivo.lacarolina.com.co/api/cron/sync-gema
```

Hágalo de uno en uno y en el orden de la tabla, para no cargar la base de GEMA a la
vez.

## Si producción vuelve a Coolify

El `Dockerfile` sigue sirviendo para Coolify. Allí `maxDuration` se ignora y los
crons hay que crearlos como **Scheduled Tasks** de la aplicación, una por fila de la
tabla, con el horario según la zona horaria del servidor:

| Campo | Valor |
|---|---|
| Command | `curl -sS --fail-with-body -m 900 -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/<ruta>` (con las comillas dobles, para que `sh -c` expanda la variable) |
| Timeout | `960` (seguimiento-whatsapp: `-m 120` y Timeout `150`) |
| Container name | Vacío |

En ese caso hay que quitar los crons de `vercel.json` y desplegar ese cambio, o
apagar el proyecto en Vercel, para que no corran dos veces. Además, los crons
comparten memoria y CPU con los usuarios, y un despliegue corta la corrida en
curso: evite desplegar entre las 3:00 y las 6:30 a. m. de Colombia.

Ver también: `docs/gps-gema.md`, `docs/mgx-sincronizacion.md`,
`docs/tareas-programadas.md`.
