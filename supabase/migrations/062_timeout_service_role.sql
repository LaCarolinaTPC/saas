-- ============================================================
-- statement_timeout propio para service_role
--
-- La API entra como authenticator (statement_timeout = 8s) y
-- PostgREST aplica luego la configuración del rol impersonado.
-- service_role no tenía ninguna, así que heredaba los 8s y
-- get_mapa_calor con 30 días (~6.5s, 1.5M deltas) quedaba al
-- borde o moría. Solo se amplía el rol del servidor; anon (3s) y
-- authenticated (8s) conservan sus límites.
-- ============================================================

ALTER ROLE service_role SET statement_timeout = '60s';

-- Que PostgREST recargue la configuración de roles sin reiniciar.
NOTIFY pgrst, 'reload config';
