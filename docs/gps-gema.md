# GPS de GEMA: kilometraje, bloqueos y eventos

Gestivo trae del GPS de la flota, una vez al día, tres datasets de GEMA. Lo
hace el cron `/api/cron/sync-gps` (`vercel.json`, 10:00 UTC = 5:00 am de
Colombia), aparte del cron de GEMA, que ya gasta casi todos sus 300 s.

| Tabla | Procedimiento de GEMA | Volumen | Cómo se guarda |
|---|---|---|---|
| `gps_kilometraje` | `pa_ext_get_KilometrajeByFecha(desde, hasta)` (máx. 31 días) | ~150 filas/día | upsert por `(codigo_vehiculo, fecha)` |
| `gps_bloqueos` | `pa_ext_get_HistoricoBloqueosByFecha(fecha)` | ~1.000 filas/día | reemplazo del día completo |
| `gps_eventos` | `pa_ext_get_HistoricoEventosByFecha(fecha, hora_ini, hora_fin)` | ~200.000 filas/día, se guardan ~4.400 | reemplazo del día completo |

`pa_ext_get_UltimasPosiciones` y `pa_ext_get_RecorridoByFecha` no se guardan:
son para consultar en vivo (mapa de flota, recorrido de un bus en una hora).

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
