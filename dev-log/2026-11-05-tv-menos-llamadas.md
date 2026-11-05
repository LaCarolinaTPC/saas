# 2026-11-05 · Pantalla TV: menos llamadas al servidor

Contexto: Vercel pausó el equipo `desarrollo-mtcs-projects` por usar el 174 % de
las invocaciones de función gratuitas (1.000.000 al mes). Eso equivale a unas
58.000 al día. Se pidió revisar el «cron» del TV.

## Qué hacía el TV

| Situación | Antes | Llamadas al día por TV (con el proxy) |
|---|---|---|
| Vinculado | `/api/display` cada 60 s, y cada llamada pasaba también por el proxy | ~2.900 |
| En la pantalla del código | `/api/display/vincular/estado` cada 4 s y un código nuevo cada 10 min, sin fin | ~43.000 |
| «Cron» (tareas programadas) | Cada sondeo corría las tareas vencidas, incluida la copia del GPS de GEMA cada 5 min, día y noche | 288 consultas a GEMA |

## Cambios

- **Sondeo del TV vinculado**:
  - cada 5 minutos de 04:00 a 23:00 (hora de Colombia) y cada 30 minutos de noche (`esperaSondeoDisplay` en `src/lib/pantalla/tipos-display.ts`);
  - los datos de los widgets ya se cacheaban de 5 a 60 minutos, así que no se pierde frescura;
  - una presentación publicada, un cambio de presentación o un TV revocado se notan en unos 5 minutos (de noche, hasta 30). Los avisos de Pantalla TV ya lo dicen.
- **Pantalla del código**:
  - sondea cada 5 s;
  - después de 3 códigos vencidos sin vincular (30 minutos) deja de consultar y pide tocar la pantalla o pulsar el control (`MAX_CODIGOS_SEGUIDOS`).
- **Tareas desde el TV**: la copia del GPS (`gps.ultimas_posiciones`) queda marcada `soloConUsuarios`, así que solo la corre el latido de quien tiene Gestivo abierto. El TV sigue corriendo las demás, como los pendientes de Marcaciones.
- **Proxy**: `/api/*` y `/display` salen del `matcher`. El proxy ya los dejaba pasar sin hacer nada, así que no cambia el comportamiento y cada llamada deja de costar una invocación extra.

Resultado: un TV vinculado pasa de ~2.900 a ~240 llamadas al día. Uno olvidado en la pantalla del código pasa de ~43.000 a ~370 y luego se detiene.

## Otras fuentes de llamadas (sin tocar)

- Comunicaciones › Bandeja: `router.refresh()` cada 7 s con la pestaña visible. Con la bandeja abierta 8 horas son ~4.100 recargas (~8.200 invocaciones con el proxy) por persona al día.
- Operativo › GPS: se recarga cada 60 s con la pestaña visible.
