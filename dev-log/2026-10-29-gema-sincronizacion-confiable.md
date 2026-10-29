# 2026-10-29 · Sincronización con GEMA: candado, bitácora y fallos visibles

## Revisión

- Los datos copiados están limpios: despacho desde septiembre 28.668 viajes sin
  número repetido; timbradas descontadas 19.800 filas sin duplicados.
- Contra GEMA (solo lectura): recaudo del 14-sep al 28-oct, 0 registros que
  GEMA ya no tenga (no borra recaudos); 5 recaudados hoy después de la última
  sincronización, que entran en la próxima. Puntos virtuales del 21 y el 27 de
  octubre: los mismos números en GEMA y en Supabase.
- Problemas encontrados: dos corridas a la vez podían duplicar filas de las
  tablas que se reemplazan por día (44 corridas manuales del 15 al 29 de
  octubre, dos con 14 s de diferencia); una tabla que fallaba seguía «ok»; no
  quedaba rastro de las corridas del cron.

## Cambios

- Migración `20261029181941_gema_bitacora_de_corridas_y_candados_de_sincronizacion.sql`
  (pendiente de aplicar a mano):
  - `gema_corridas`: una fila por corrida (cron o manual), con quién, rango,
    duración, estado y resultado por tabla.
  - `gema_abrir_corrida()`: abre una corrida solo si no hay otra en curso, de
    forma atómica; una «corriendo» de más de 6 min se marca «abandonada».
  - `gema_reemplazar_dia()`: candado por (tabla, día).
- `src/lib/gema/corridas.ts` (+ `test:gema`): abrir, cerrar y leer corridas;
  `cronAtrasado` (más de 26 h sin corrida automática).
- `src/lib/gema/sync.ts`: una tabla que falla queda `status = error` con el
  mensaje en `gema_sync_state` (sin tocar «sincronizado hasta»).
- Cron (`/api/cron/sync-gema`) y botón (`sincronizarGema`): abren y cierran
  corrida; si hay otra en curso, el botón avisa y el cron no corre encima (409).
- Tesorería › Parámetros: «Últimas corridas» y aviso si el cron no corre.
- Revisión cartulina: avisa si un día pasado tiene pocos eventos del terminal
  (sincronizado antes de que GEMA lo cerrara) y si hay viajes nocturnos cuyo día
  siguiente aún está a medias (`avisosPuntosVirtuales`, con prueba).

Sin la migración todo sigue funcionando como antes, sin bitácora ni candados.
