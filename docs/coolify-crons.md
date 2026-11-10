# Crons y tiempos de ejecución al pasar a Coolify

Qué cambia al desplegar Gestivo en Coolify (autoalojado, la aplicación corre como
un servidor de Node que no se apaga) y cómo recrear las tareas programadas.
**No hace falta cambiar código.**

## Qué cambia

| Tema | En Vercel | En Coolify |
|---|---|---|
| Tiempo máximo por petición | 300 s (`maxDuration`); al pasarlo, Vercel corta la función | Sin límite propio: `maxDuration` se ignora |
| Tiempo máximo por cron | El mismo de la petición | Campo **Timeout** de cada tarea: **300 s por defecto**, hay que subirlo |
| Crons | Los disparaba `vercel.json` (ya se quitaron) | **Hay que crearlos** como tareas programadas (abajo) |
| Hora de los crons | Siempre UTC, en algún momento de la hora (±59 min en Hobby) | A la hora exacta, en la zona horaria del **servidor** de Coolify (revísela) |
| Proxy delante | El de Vercel | Traefik de Coolify y, si se usa, Cloudflare: revisar sus tiempos de espera |

Los presupuestos de tiempo del código (dejar de empezar trabajo nuevo antes de
los 300 s) pueden quedarse como están. Se ajustan con variables de entorno:

| Variable | Por defecto | Qué controla |
|---|---|---|
| `GEMA_SYNC_BUDGET_MS` | 200000 | Días de `puntos_virtuales` por corrida de GEMA (cron y botón de Parámetros) |
| `GPS_CRON_BUDGET_MS` | 230000 | Cron del GPS |
| `MGX_CRON_BUDGET_MS` | 240000 | Cron de MGX |

**No suba `GEMA_SYNC_BUDGET_MS` por encima de 240000.** El candado de GEMA
(`gema_abrir_corrida`) da por muerta cualquier corrida de más de 6 minutos,
porque se escribió para el corte de 5 minutos de Vercel. Si una corrida viva pasa
de 6 minutos, otra podría arrancar encima. Para subirlo, primero hay que ampliar
ese umbral con una migración.

El presupuesto solo limita `puntos_virtuales`; el resto de los datasets corre
hasta terminar. Por eso, en las primeras noches conviene revisar la duración de
las corridas en `gema_corridas.duracion_ms`.

El botón «Sincronizar» de Tesorería › Parámetros le da 45 s al GPS y el resto
a GEMA; eso está en código (`src/lib/gema/actions.ts`) y también puede quedar
igual.

## Los crons que hay que crear

Este documento es la referencia de los horarios: los crons ya no están en
`vercel.json`. Todos son `GET` y llevan el encabezado
`Authorization: Bearer <CRON_SECRET>`.

| Nombre | Ruta | Cron si el servidor está en UTC | Cron si está en hora de Colombia | Qué hace |
|---|---|---|---|---|
| sync-gema | `/api/cron/sync-gema` | `0 8 * * *` | `0 3 * * *` | Datos de GEMA, consolida Financiera y evalúa hitos del Plan Padrino |
| riesgo-conductores | `/api/cron/riesgo-conductores` | `0 9 * * *` | `0 4 * * *` | Análisis de riesgo de conductores |
| revision-timbradas | `/api/cron/revision-timbradas` | `30 9 * * *` | `30 4 * * *` | Revisión de timbradas |
| sync-mgx | `/api/cron/sync-mgx` | `0 10 * * *` | `0 5 * * *` | Réplica de MGX |
| sync-gps | `/api/cron/sync-gps` | `0 11 * * *` | `0 6 * * *` | GPS de GEMA: kilometraje, bloqueos y eventos |
| seguimiento-whatsapp | `/api/cron/seguimiento-whatsapp` | `*/15 * * * *` | `*/15 * * * *` | «¿Sigues interesado?» de WhatsApp a quien no responde y marcar para GH. Es el único disparador: sin esta tarea no se envía nada. Comando con `-m 120` y Timeout `150` |

`/api/cron/financiera-consolidar` también existe, pero no va en el calendario:
la consolidación de Financiera ya corre dentro de `sync-gema`. Se puede llamar
a mano igual que los demás.

### Opción recomendada: tarea programada de Coolify

En la aplicación, pestaña **Scheduled Tasks** → **Add**, una tarea por fila de
la tabla:

| Campo | Valor |
|---|---|
| Name | El nombre de la tabla |
| Command | El de abajo, con la ruta de esa fila |
| Schedule | El cron de la tabla, según la zona horaria del servidor (hoy UTC) |
| Timeout | `960` |
| Container name | Vacío: la aplicación tiene un solo contenedor |

```sh
curl -sS --fail-with-body -m 900 -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-gema
```

- Copie el comando con las comillas dobles. Coolify lo ejecuta con `sh -c` dentro
  del contenedor, así que `$CRON_SECRET` se lee del entorno de la aplicación y el
  secreto no queda escrito en la tarea. Si el formulario ofrece la opción de no
  usar shell, déjela apagada: sin shell la variable no se expande y la ruta
  responde 401.
- Va por `localhost`, sin pasar por Traefik ni Cloudflare ni por sus tiempos de
  espera. El puerto 3000 es el que fija el `Dockerfile`.
- `-m 900` le da 15 minutos a `curl`, y el **Timeout** de 960 s deja que `curl`
  termine primero. Con los 300 s por defecto, Coolify mataría las corridas largas.
- Usa `curl` porque es lo que instala el `Dockerfile`; `wget` no está en la imagen.

### Cómo leer el resultado en Coolify

Coolify marca la ejecución según el código de salida de `curl`, y la respuesta
JSON queda en **Recent executions**:

| Respuesta | En Coolify | Qué significa |
|---|---|---|
| 200 | Correcta | Terminó. En `sync-mgx`, mire también el JSON: `omitida` (otra corrida en curso) y `estado: "parcial"` también responden 200 |
| 207 | **Correcta** | **Algún dataset falló.** Hay que leer el JSON: Coolify no lo marca como fallo |
| 401 | Fallida | `CRON_SECRET` falta o no coincide |
| 409 | Fallida | `sync-gema`: ya había otra corrida en curso. Se omitió sin hacer nada |
| 500 | Fallida | Error de la corrida; el detalle queda en el JSON |

### Opción alterna: cron externo

Cualquier servidor con `cron` puede llamar las mismas rutas por la URL pública:

```sh
0 8 * * * curl -sS --fail-with-body -m 900 -H "Authorization: Bearer <CRON_SECRET>" https://<dominio>/api/cron/sync-gema
```

En ese caso la petición sí pasa por el proxy: revise que no corte antes de que
termine (ver abajo).

## Orden del cambio

1. **Variables de entorno**: pasar todas a Coolify, incluido `CRON_SECRET`, y
   comprobar que esté disponible en ejecución, no solo al compilar. Las rutas
   rechazan todo con 401 si falta: no quedan abiertas, pero tampoco corren.
2. **Zona horaria**: confirmar la del servidor en Coolify y escoger la columna de
   la tabla. Colombia no cambia de hora, así que el desfase de 5 horas es fijo.
3. **Crear las cinco tareas.**
4. **Probar** cada una con **Execute Now**, de una en una y en el orden de la
   tabla, para no cargar la base de GEMA a la vez. Debe responder 200 (o 207, y
   entonces hay que leer qué dataset falló). Si los crons llevan días sin correr,
   estas corridas ponen los datos al día; `puntos_virtuales` puede tardar varias
   noches en alcanzar, porque avanza por presupuesto.
5. **Vercel**: los crons ya no están en `vercel.json`, pero Vercel solo se entera
   con un despliegue nuevo. Si el proyecto sigue activo allí, despliegue ese cambio
   o apáguelo. Si no, al reactivarse Vercel correrían dos veces: las
   sincronizaciones de GEMA y MGX se bloquearían entre sí, y el GPS repetiría el
   trabajo.
6. **Tiempos del proxy**: el botón «Sincronizar» de Parámetros y la vista
   previa con datos se piden desde el navegador y pasan por Traefik y, si se
   usa, Cloudflare. Cloudflare corta las respuestas que tardan más de 100 s en
   su plan normal; la sincronización puede tardar varios minutos. Si se usa
   Cloudflare delante, ese botón fallará en la pantalla aunque el servidor
   termine el trabajo (el avance queda guardado igual).

## Tener en cuenta

- **Un despliegue corta lo que esté corriendo.** Los crons corren dentro del mismo
  contenedor que la aplicación: si se reemplaza a mitad de una corrida, esa corrida
  muere y queda como «abandonada» o «corriendo» hasta que venza su candado. Evite
  desplegar entre las 3:00 y las 6:30 am de Colombia.
- **Comparten recursos con los usuarios.** En Vercel cada cron era una función
  aparte; aquí usan la misma memoria y CPU del servidor web. Por eso siguen de
  madrugada.

## Cómo comprobar que corren

- Tesorería › Parámetros muestra, por dataset, la última corrida y su estado
  (GEMA y GPS), y avisa si el cron de GEMA lleva más de 26 horas sin correr.
- MGX: la bitácora de corridas de su pantalla (`mgx_corridas`, origen «cron»).
- **Recent executions** de cada tarea en Coolify.

Ver también: `docs/gps-gema.md`, `docs/mgx-sincronizacion.md`.
