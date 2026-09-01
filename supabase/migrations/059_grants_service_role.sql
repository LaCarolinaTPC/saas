-- ============================================================
-- Permisos de service_role en las tablas nuevas (056-058)
--
-- En este Supabase self-hosted las tablas creadas por
-- supabase_admin no otorgan privilegios por defecto a
-- service_role, así que el cron de sincronización fallaba con
-- "permission denied" al upsertear vehiculos y velocidades (y el
-- caché geo_direcciones no podría escribirse).
-- ============================================================

GRANT ALL ON geo_direcciones TO service_role;
GRANT ALL ON vehiculos TO service_role;
GRANT ALL ON velocidades TO service_role;
