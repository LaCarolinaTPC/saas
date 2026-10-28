# Tareas programadas (estilo wp-cron)

## Por qué

En el plan Hobby de Vercel un cron corre **una vez al día** y en algún momento
de su hora (±59 min). Eso sirve para la sincronización nocturna, pero no para
«a las 09:00 registra a los que no vinieron». Antes eso se hacía al abrir la
pantalla de Marcaciones, y cada lectura volvía a escribir.

Ahora funciona como el `wp-cron` de WordPress: las páginas abiertas **laten** y
el servidor corre las tareas cuya hora ya pasó.

## Cómo funciona

- **Latido.** `LatidoTareas` (en el layout del panel) llama a
  `POST /api/tareas/latido` al abrir cualquier página y cada 5 minutos mientras
  la pestaña esté visible. El televisor también late: `/api/display` corre las
  tareas con `after()` después de responder, así que basta un TV encendido.
- **Ranura.** Cada tarea corre **una vez por ranura** = día + hora configurada
  (`2026-10-27@09:00`). Si cambian la hora, la ranura cambia y vuelve a correr;
  si ya corrió, no repite. Reglas puras en `src/lib/tareas/reglas.ts`
  (`npm run test:tareas`).
- **Candado.** La tarea se toma con un `UPDATE` condicionado sobre
  `bloqueada_hasta` (4 min): de varias pestañas que laten al mismo segundo solo
  una la corre.
- **Errores.** Si la tarea lanza, el error queda en `ultimo_error` y la ranura
  **no** se gasta: el siguiente latido la reintenta.
- **Manual.** `correrTareaManual` corre aunque ya hubiera corrido. Si se usa
  antes de la hora, no gasta la ranura del día: la automática igual corre a la
  hora.

Estado en la tabla `tareas_programadas` (migración
`20261027234405_tareas_programadas_estilo_wp_cron.sql`): última ranura, cuándo,
si fue automática o manual y quién, resultado y error.

## Tareas

| id | Qué hace | Hora y encendido | Botón manual |
|---|---|---|---|
| `ausentismo.pendientes` | Registra como «pendiente por clasificar» a quien hoy no tiene viaje ni huella (ver [biometrico-marcaciones.md](biometrico-marcaciones.md)) | Ausentismo › Marcaciones (`ausentismo.pendientes_auto_hora` / `_activo` en `app_settings`) | «Registrar ahora» en Marcaciones |

## Agregar una tarea

En `src/lib/tareas/registro.ts`, un objeto con:

- `id` estable (es la llave en `tareas_programadas`; la fila se crea sola);
- `programacion()`: `{ hora: "HH:MM", activa }`, normalmente de `app_settings`;
- `ejecutar({ hoy, manual })`: hace el trabajo y devuelve un objeto con el
  resumen (queda en `ultimo_resultado`; si trae `creados` o `eliminados` > 0 la
  página abierta se relee). Debe ser idempotente y tardar menos de ~2 minutos
  (`maxDuration` del latido).

## Límites

- Si nadie tiene Gestivo abierto ni hay un televisor encendido, no corre hasta
  que alguien abra una página. Es el mismo trato que `wp-cron`.
- No reemplaza los crons pesados (`sync-gema`, `sync-gps`): esos siguen en
  Vercel/Coolify (ver [coolify-crons.md](coolify-crons.md)).
