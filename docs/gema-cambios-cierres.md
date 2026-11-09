# Cambios de GEMA en cierres de días anteriores

## Por qué

Cada sincronización con GEMA (cron de las 03:00 y botón de Parámetros) vuelve a
leer los últimos 45 días de cierres, hace upsert sobre `cierres_diarios` y el
espejo borra lo que GEMA ya no reporta. Si GEMA cambiaba un cierre viejo, Gestivo
lo sobrescribía sin dejar el valor anterior y nadie se enteraba hasta que el
conductor reclamaba (caso del 27–28 oct 2026, ver
`src/lib/devengados/antes-correccion.ts`).

## Qué hace

Antes de escribir, `syncCierres` compara lo guardado con lo que trae GEMA
(`src/lib/gema/cambios-cierres.ts`) y registra cada diferencia en
`gema_cambios_cierres` (migración `20261109151810`):

| Vigila | Detalle |
|---|---|
| Antigüedad | Cierres con más de 2 días (`GEMA_CAMBIOS_GRACIA_DIAS`, por defecto 2). Ayer y hoy GEMA los corrige normalmente. |
| Campos | Viajes, timbradas, bruto, salario bruto, salario neto, ahorro, ahorro obligatorio, anticipo. Diferencias de menos de 1 se ignoran; nulo y 0 cuentan igual. |
| Filas | **Modificado** (cambió algún campo), **nuevo** (GEMA agregó una fila a un día viejo), **borrado** (el espejo la quitó). Un cambio de ruta sale como un borrado y un nuevo. |

Si la migración no está aplicada, la sincronización sigue igual y solo deja un
aviso en el log. El registro nunca cambia el estado de la corrida (sigue «ok»).

## Dónde se ve

- **Tesorería › Devengados › Parámetros** → «Cambios de GEMA en días anteriores»:
  pendientes con antes → después y Δ neto. Un administrador los marca
  revisados (queda en la auditoría como «Cambios GEMA revisados»).
- **Bitácora de corridas**: la corrida que los detectó dice cuántos cierres cambiaron.
- **Liquidación conductor** y **Liquidación Producción**: aviso amarillo cuando el
  conductor consultado tiene cambios pendientes en el rango, con el detalle.

## Límites

- Solo se registra desde que se despliega: lo que GEMA cambió antes no se puede
  reconstruir (salvo `cierres_diarios_respaldo_20261106`, del caso de octubre).
- La liquidación usa siempre los valores nuevos de GEMA; el registro es para
  revisar y explicar la diferencia, no para revertirla.
