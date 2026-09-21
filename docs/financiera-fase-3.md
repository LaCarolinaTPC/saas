# Financiera · Gestión de flota — Fase 3: consolidación desde GEMA

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 9, fase 3.
**Migración:** la de la fase 2 (`20260921140156_…`), aplicada el 2026-09-21; esta fase no añade SQL.
**Código:** `src/lib/financiera/consolidacion.ts` · `src/app/api/cron/financiera-consolidar/route.ts` ·
`src/app/api/cron/sync-gema/route.ts` (enganche) · `src/app/(dashboard)/financiera/flota/datos/`.
**Pantalla:** `/financiera/flota/datos` (sub-función `fin_datos`). `/financiera` y `/financiera/flota`
redirigen ahí mientras no exista el tablero (fase 5). Menú: grupo **Financiera → Datos de flota**.

## Qué hace la corrida

`financiera_consolidar_abiertos(email)` (SQL, fase 2) recorre todos los meses del espejo desde 2025-01
hasta el mes del marcador de GEMA, **salta los cerrados**, reemplaza la parte operativa de los demás
(upsert por período + vehículo + propietario, borra las filas GEMA que ya no están en el espejo) y al
final cierra los meses cuyo último día ya pasó el marcador `gema_sync_state.last_synced_date` del
dataset `ingreso_tercero`. Nunca toca `financiera_contable_mes`. Es idempotente.

## Cuándo corre

| Disparador | Quién | Cuándo |
|---|---|---|
| Cron `sync-gema` | Vercel (`vercel.json`, `0 8 * * *` UTC = 03:00 Colombia) | Al terminar el sync, en la misma ejecución. La respuesta del cron trae un bloque `financiera` con los meses consolidados y cerrados; un fallo suyo no oculta el resultado del sync. |
| `GET /api/cron/financiera-consolidar` | A mano o desde otro programador, con `Authorization: Bearer $CRON_SECRET` | Cuando haga falta. Misma corrida. |
| «Consolidar ahora» | Usuario con `fin_datos`, desde Datos de flota | A demanda. Deja su correo en `financiera_cargas`. |

**Por qué no tiene cron propio.** El plan decía 04:00; el proyecto está en el plan Hobby de Vercel, que
admite dos crons y ya están ocupados (`sync-gema` y `riesgo-conductores`). Encadenarla al final del
sync es además el orden correcto: el ingreso de tercero es el cierre del día de GEMA y esa corrida es
la que lo trae. Si el proyecto sube de plan, basta añadir la ruta a `vercel.json` con `0 9 * * *`.

## Primera corrida (2026-09-21)

Se disparó por RPC desde la máquina de trabajo (`work/fin-consolidar-ahora.mts`) con el marcador de
GEMA en 2026-09-16:

| | |
|---|---|
| Meses consolidados | 21 (2025-01 → 2026-09) |
| Cerrados | 20 · abierto: 2026-09 |
| Filas operativas | 3.052 en 21 meses; en 9 meses hay más filas que vehículos (buses con dos dueños en el mes: 3 en 2026-08, 1 en 2025-03) |
| Marzo 2026 | 137 vehículos, bruto 2.878.276.257, timbradas 875.411, viajes 11.060, admon 71.956.905: **igual a la referencia del plan** (sección 10) |

Cotejo vista ↔ motor TypeScript (`work/fin-cotejar-consolidado.mts`): 2026-03, 2026-08 y 2025-03,
**0 diferencias** en producción, rubros GEMA, gastos y utilidad, vehículo a vehículo, incluidos los
buses con dos propietarios.

## Pantalla Datos de flota

- Tarjetas: marcador de GEMA, meses consolidados, meses abiertos, meses sin archivo contable completo.
- Tabla de períodos desde `vw_financiera_flota_mes`: estado (abierto / cerrado / reabierto, con el
  motivo al pasar el ratón), vehículos, viajes, timbradas, ingresos, gastos GEMA, viajes por bus,
  cobertura del archivo contable y rentabilidad. **Mientras el archivo contable del mes no esté
  cargado la rentabilidad se muestra en gris y con «≤»: es un techo, no una cifra.**
- Últimas 25 operaciones de `financiera_cargas`. La bitácora completa irá en Auditoría (fase 5).
- «Consolidar ahora» refresca la tabla y avisa qué meses se consolidaron y cuáles se cerraron.

Verificada sin sesión con la vista previa temporal bajo `/docs` + Playwright a 1440 y 800 px (método
del proyecto); la vista previa se borró antes del commit. A 800 px la tabla desplaza en horizontal,
como las demás tablas anchas de la aplicación.

## Qué queda

- **Fase 4**: carga del archivo contable (CSV o Excel de 8 columnas) en esta misma pantalla, con
  previsualización, filas rechazadas, reversión por período y plantilla descargable.
- **Reabrir período** (`financiera_reabrir_periodo`, ya en SQL y en `consolidacion.ts`): la pantalla
  del administrador llega con Parámetros en la fase 5.
- Fase 0 sigue esperando las credenciales de GEMA (`DESPACHO`, subconteo).
