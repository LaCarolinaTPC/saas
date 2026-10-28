# 2026-10-27 · Tareas programadas estilo wp-cron

**Pedido.** Un cron «estilo WordPress» que corra al abrir cualquier página y
revise horas y opciones, empezando por la hora de Marcaciones (registrar a los
ausentes), sin depender del cron de Vercel; que no repita si ya corrió salvo que
cambien la hora o se haga a mano; un botón manual; y que revise cada ciertos
minutos con la página abierta.

**Hecho.**

- `src/lib/tareas/`: `reglas.ts` (puro: ranura día@hora, vencimiento, ranura
  tras correr; `npm run test:tareas`), `estado.ts`, `ejecutor.ts` (candado en
  base, reintento con error) y `registro.ts` (la tarea `ausentismo.pendientes`).
- Migración `20261027234405_tareas_programadas_estilo_wp_cron.sql`: tabla
  `tareas_programadas` con GRANT a `service_role`. **Hay que aplicarla.**
- Latido: `POST /api/tareas/latido` + `LatidoTareas` en el layout del panel
  (al abrir y cada 5 min con la pestaña visible; relee la página si la tarea
  cambió datos). El televisor también late desde `/api/display` con `after()`.
- Marcaciones: leer la pantalla ya no escribe pendientes (sí sigue limpiando
  los que sobran); los escribe la tarea. `registrarPendientesDelDia` en
  `biometrico/data.ts`. Botón **«Registrar ahora»** (acción
  `registrarPendientesAhora`). La caja gris dice cuándo corrió, cuántos y si fue
  a mano. Tras la pasada del día, las filas «sin rastro» sin registro vuelven a
  tener «Registrar novedad».
- Sin la migración: Marcaciones vuelve a escribir al leer (como antes).

**Cambio de comportamiento.** Antes, cada lectura de Marcaciones pasada la hora
volvía a crear pendientes para quien apareciera sin rastro (por ejemplo, un
turno que nunca salió). Ahora corre una vez por día y hora; los que aparezcan
después se registran con «Registrar ahora» o con el botón de la fila.

Docs: `docs/tareas-programadas.md`, sección actualizada en
`docs/biometrico-marcaciones.md`.
