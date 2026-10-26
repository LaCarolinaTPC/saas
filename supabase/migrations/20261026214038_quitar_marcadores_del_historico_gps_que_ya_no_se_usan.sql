-- quitar marcadores del historico gps que ya no se usan
--
-- Contexto: 20261026205632 creó en gema_sync_state tres marcadores para que el
-- cron del GPS cargara el histórico de a pocos cada noche
-- (gps_*_historico). Se cambió el diseño: el cron solo trae lo reciente y el
-- histórico se carga una vez desde un equipo con `npm run gps:carga-inicial`,
-- que no usa marcadores. Sin esta limpieza aparecerían para siempre como
-- «idle» en Tesorería › Parámetros.
--
-- No crea tablas. Idempotente: se puede correr de nuevo sin efecto.

DELETE FROM gema_sync_state
 WHERE dataset IN ('gps_kilometraje_historico', 'gps_bloqueos_historico', 'gps_eventos_historico');

-- Verificación: deben quedar solo gps_kilometraje, gps_bloqueos y gps_eventos.
SELECT dataset, last_synced_date, status
  FROM gema_sync_state
 WHERE dataset LIKE 'gps\_%'
 ORDER BY dataset;
