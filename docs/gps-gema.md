# GPS de GEMA: kilometraje, bloqueos y eventos

Gestivo trae del GPS de la flota, una vez al día, tres datasets de GEMA. Lo
hace el cron `/api/cron/sync-gps` (`vercel.json`, 10:00 UTC = 5:00 am de
Colombia), aparte del cron de GEMA, que ya gasta casi todos sus 300 s.

| Tabla | Procedimiento de GEMA | Volumen | Cómo se guarda |
|---|---|---|---|
| `gps_kilometraje` | `pa_ext_get_KilometrajeByFecha(desde, hasta)` (máx. 31 días) | ~150 filas/día | upsert por `(codigo_vehiculo, fecha)` |
| `gps_bloqueos` | `pa_ext_get_HistoricoBloqueosByFecha(fecha)` | ~1.000 filas/día | reemplazo del día completo |
| `gps_eventos` | `pa_ext_get_HistoricoEventosByFecha(fecha, hora_ini, hora_fin)` | ~200.000 filas/día, se guardan ~4.400 | reemplazo del día completo |

`pa_ext_get_RecorridoByFecha` no se guarda: es para consultar en vivo el
recorrido de un bus en una hora.

## Últimas posiciones de la flota

`pa_ext_get_UltimasPosiciones()` (sin parámetros, ~154 filas, ~1 s) da la
última posición de cada bus, al minuto.

- **En vivo:** Operativo › GPS de la flota (`/operativo/gps`) lo consulta
  directo en GEMA (`ultimasPosicionesEnVivo` en `src/lib/gema/gps.ts`, 30 s
  de caché por proceso) y se relee cada minuto. Si GEMA no responde, muestra
  la copia y dice de cuándo es.
- **Copia en el espejo:** `gps_ultimas_posiciones`, una fila por bus
  (migración `20261028210048`). La refrescan la tarea `gps.ultimas_posiciones`
  del cron local cada 5 minutos ([tareas-programadas.md](tareas-programadas.md))
  y cada corrida del cron del GPS. Marcador en `gema_sync_state`
  (`gps_ultimas_posiciones`). `fecha_hora` es el último reporte del bus;
  `actualizado_at`, cuándo se copió.
- **Estado de reporte** (`src/lib/gema/gps-reglas.ts`): al día hasta 15 min,
  atrasado hasta 2 h, sin reportar hasta 24 h, caído después.

## Indicadores (Operativo › GPS de la flota)

La función SQL `gps_kpis(desde, hasta)` agrega en la base:

- kilómetros sin odómetros sospechosos, buses y km por bus al día;
- conducción brusca por 100 km (códigos 46, 47, 48 y 49) y frenadas por 100 km;
- botón de pánico (42) y batería desconectada (45);
- eventos críticos del sensor de pasajeros (`es_critico`: BLOQUEO P1/P2, RESET);
- la serie por día y los buses con más eventos (solo los de 100 km o más).

Los códigos se verificaron el 2026-10-28 sobre una semana real de
`gps_eventos`.

## Qué trae cada tabla

- **Kilometraje**: km inicial, final y total por bus y día. `sospechoso = true`
  cuando el total pasa de 600 km o es negativo: es un salto del odómetro, no un
  recorrido. Hay que excluirlos de los indicadores por kilómetro. El día de hoy
  suele llegar al día siguiente.
- **Bloqueos**: eventos del sensor de pasajeros: BLOQUEO P1 y P2, sensor
  obstruido, modo antisalto, antiagache, tapa de caja abierta, reset,
  corto circuito… con `es_critico` según GEMA.
- **Eventos**: todo lo del GPS **menos** los códigos 0 (estacionamiento), 1
  (ping de conducción, el 94 % del día), 100 y 101 (geocerca de velocidad; los
  excesos ya están en `velocidades`). Quedan frenadas y aceleraciones bruscas,
  giros bruscos, botón de pánico, colisión, batería desconectada, encendido y
  apagado, entrada a modo de manejo y parqueo. Es una lista de descarte: si
  GEMA agrega un código nuevo, se guarda. Ver `src/lib/gema/gps-reglas.ts`.

Las horas (`fecha_hora`) son de Colombia tal cual las entrega GEMA, sin zona.

## Acceso desde el MCP y la Data API

Las tablas del GPS (también `gps_ultimas_posiciones`) están en la lista blanca (`src/lib/external/resources.ts`) y
documentadas en el catálogo del MCP (`src/lib/mcp/catalogo/operativo.ts`).
Las ven quienes tienen Operativo, Rotación o Mantenimiento; `gps_bloqueos`
también Cámaras (`src/lib/external/acceso.ts`).

## Carga inicial (una vez) y cron (cada noche)

**Carga inicial del histórico**, desde un equipo con `.env.local`, sin el
límite de 300 s de Vercel:

```bash
npm run gps:carga-inicial                                   # 2026-01-01 hasta ayer, los tres
npm run gps:carga-inicial -- 2026-01-01 2026-06-30          # un rango
npm run gps:carga-inicial -- 2026-03-14 --solo=eventos      # un dataset, o retomar
```

Tarda ~30-50 min desde enero, casi todo en eventos (~6 s por día). Reemplaza
cada día completo (el kilometraje hace upsert), así que se puede repetir sin
duplicar. Si se corta, imprime el comando para seguir desde el último día
guardado. No toca los marcadores del cron.

**El cron** (`/api/cron/sync-gps`) trae **solo lo reciente**: repasa los
últimos días (kilometraje 7, bloqueos 3, eventos 2) porque GEMA completa el día
anterior. Si estuvo caído, sigue desde el último día que cargó, día por día,
hasta agotar su tiempo; la noche siguiente continúa. Una noche normal tarda
menos de un minuto.

El botón «Sincronizar» de Tesorería › Parámetros también corre esto mismo
(primero el GPS, con un tope de 45 s, y después GEMA con el tiempo que quede).

Estado en `gema_sync_state`, visible en Tesorería › Parámetros:

| Dataset | Fecha | Filas |
|---|---|---|
| `gps_kilometraje`, `gps_bloqueos`, `gps_eventos` | último día reciente cargado | las de la última corrida |
| `gps_*_historico` | desde cuándo hay datos («desde 2026-01-01») | total de la tabla |

Las filas `_historico` las actualizan el cron, el botón y la carga inicial.

Guardas:

- En lo reciente, un día pasado sin ninguna fila de bloqueos o eventos se toma
  como falla de GEMA: no se borra lo guardado y el error queda en el estado.
  En la carga inicial un día vacío se acepta.
- El reemplazo del día (`gema_reemplazar_dia`) es atómico y revierte si llega
  una fila de otro día.

## Variables de entorno (opcionales)

| Variable | Por defecto | Para qué |
|---|---|---|
| `GPS_HISTORICO_DESDE` | `2026-01-01` | desde dónde arranca la carga inicial |
| `GPS_CRON_BUDGET_MS` | `230000` | tiempo del cron para empezar días nuevos |
| `GPS_KM_REPASO_DIAS` / `GPS_BLOQUEOS_REPASO_DIAS` / `GPS_EVENTOS_REPASO_DIAS` | 7 / 3 / 2 | días recientes que repasa el cron |

## Probar el cron

Exige `CRON_SECRET` siempre (sin él responde 401). En PowerShell, con la
aplicación corriendo:

```powershell
$h = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod "https://<dominio>/api/cron/sync-gps" -Headers $h
# Un solo dataset:
Invoke-RestMethod "https://<dominio>/api/cron/sync-gps?solo=km" -Headers $h
```

Responde 200 (o 207 si algún dataset falló) con, por dataset, desde qué día
repasó y cuántas filas guardó.

## Pruebas

`npm run test:gps` (reglas puras: eventos descartados, km sospechoso, franjas
de horas, días recientes, tramos de 31 días).
