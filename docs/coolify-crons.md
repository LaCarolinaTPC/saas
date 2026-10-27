# Crons y tiempos de ejecución al pasar a Coolify

Gestivo corre hoy en Vercel. Este documento dice qué cambia si se despliega en
Coolify (autoalojado, la aplicación corre como un servidor de Node que no se
apaga) y cómo recrear las tareas programadas. **No hace falta cambiar código.**

## Qué cambia

| Tema | En Vercel | En Coolify |
|---|---|---|
| Tiempo máximo por petición | 300 s (`maxDuration`); al pasarlo, Vercel corta la función | Sin límite propio: `maxDuration` se ignora |
| Crons | `vercel.json` los dispara solo | **Hay que crearlos** como tareas programadas (abajo) |
| Hora de los crons | Siempre UTC | La zona horaria de la instancia de Coolify (revísela) |
| Proxy delante | El de Vercel | Traefik de Coolify y, si se usa, Cloudflare: revisar sus tiempos de espera |

Los presupuestos de tiempo del código (dejar de empezar trabajo nuevo antes de
los 300 s) pueden quedarse como están: no estorban. Si se quiere que cada
corrida haga más trabajo, se suben con variables de entorno:

| Variable | Por defecto | Qué controla |
|---|---|---|
| `GEMA_SYNC_BUDGET_MS` | 200000 | Sincronización de GEMA (cron y botón de Parámetros) |
| `GPS_CRON_BUDGET_MS` | 230000 | Cron del GPS |
| `MGX_CRON_BUDGET_MS` | 240000 | Cron de MGX |

El botón «Sincronizar» de Tesorería › Parámetros le da 45 s al GPS y el resto
a GEMA; eso está en código (`src/lib/gema/actions.ts`) y también puede quedar
igual.

## Los crons que hay que crear

Son los de `vercel.json`. Todos son `GET` y llevan el encabezado
`Authorization: Bearer <CRON_SECRET>`.

| Nombre sugerido | Ruta | Cron (UTC) | Hora Colombia | Qué hace |
|---|---|---|---|---|
| sync-gema | `/api/cron/sync-gema` | `0 8 * * *` | 3:00 am | Datos de GEMA, consolida Financiera y evalúa hitos del Plan Padrino |
| riesgo-conductores | `/api/cron/riesgo-conductores` | `0 9 * * *` | 4:00 am | Análisis de riesgo de conductores |
| sync-mgx | `/api/cron/sync-mgx` | `0 9 * * *` | 4:00 am | Réplica de MGX |
| revision-timbradas | `/api/cron/revision-timbradas` | `30 9 * * *` | 4:30 am | Revisión de timbradas |
| sync-gps | `/api/cron/sync-gps` | `0 10 * * *` | 5:00 am | GPS de GEMA: kilometraje, bloqueos y eventos |

`/api/cron/financiera-consolidar` también existe, pero no va en el calendario:
la consolidación de Financiera ya corre dentro de `sync-gema`. Se puede llamar
a mano igual que los demás.

Si la instancia de Coolify está en hora de Colombia (UTC-5), reste 5 horas a
los horarios: por ejemplo `sync-gema` sería `0 3 * * *`.

### Opción recomendada: tarea programada de Coolify

En la aplicación, pestaña **Scheduled Tasks** → **Add**, una tarea por fila de
la tabla. El comando corre **dentro del contenedor** de la aplicación, así que
llama al servidor por `localhost` (no pasa por Traefik ni por Cloudflare, sin
sus tiempos de espera) y puede leer `CRON_SECRET` del entorno:

```sh
wget -qO- -T 900 --header="Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-gema
```

- Cambie la ruta en cada tarea y el puerto si la aplicación no escucha en el
  3000 (es el que figura en **Ports Exposes** de la aplicación).
- `-T 900` da 15 minutos antes de rendirse: las rutas responden al terminar
  todo su trabajo.
- Si la imagen trae `curl` en vez de `wget`:

  ```sh
  curl -fsS -m 900 -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-gema
  ```

- La respuesta (JSON con filas y errores por dataset) queda en el historial de
  ejecuciones de la tarea en Coolify.

### Opción alterna: cron externo

Cualquier servidor con `cron` puede llamar las mismas rutas por la URL pública:

```sh
0 8 * * * curl -fsS -m 900 -H "Authorization: Bearer <CRON_SECRET>" https://<dominio>/api/cron/sync-gema
```

En ese caso la petición sí pasa por el proxy: revise que no corte antes de que
termine (ver abajo).

## Antes de apagar Vercel

1. **Variables de entorno**: pasar todas a Coolify, incluido `CRON_SECRET`.
   Ojo: `sync-gema`, `riesgo-conductores`, `revision-timbradas` y
   `financiera-consolidar` quedan abiertas a cualquiera si `CRON_SECRET` no
   está definida (`sync-gps` y `sync-mgx` rechazan). Con la aplicación
   expuesta en internet, la variable es obligatoria.
2. **Crear las cinco tareas** y correr cada una una vez con **Execute now**
   para ver que responden 200 (o 207 si algún dataset falló).
3. **Quitar los crons de Vercel** (o apagar el proyecto) para que no corran
   dos veces: dos sincronizaciones de MGX a la vez se bloquean entre sí, y GEMA
   y el GPS repetirían el trabajo.
4. **Tiempos del proxy**: el botón «Sincronizar» de Parámetros y la vista
   previa con datos se piden desde el navegador y pasan por Traefik y, si se
   usa, Cloudflare. Cloudflare corta las respuestas que tardan más de 100 s en
   su plan normal; la sincronización puede tardar varios minutos. Si se usa
   Cloudflare delante, ese botón fallará en la pantalla aunque el servidor
   termine el trabajo (el avance queda guardado igual).
5. **Zona horaria**: confirmar la de la instancia de Coolify y ajustar los
   horarios de la tabla.

## Cómo comprobar que corren

- Tesorería › Parámetros muestra, por dataset, la última corrida y su estado
  (GEMA y GPS).
- MGX: la bitácora de corridas de su pantalla (`mgx_corridas`, origen «cron»).
- Historial de ejecuciones de cada tarea en Coolify.

Ver también: `docs/gps-gema.md`, `docs/mgx-sincronizacion.md`.
