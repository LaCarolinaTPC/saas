-- permisos de service_role y rls en las tablas de campanas
--
-- Contexto: la migración 015_campanas_reclutamiento.sql se aplicó en producción
-- recién el 2026-09-11, y es anterior a la regla de conceder GRANT a
-- service_role. En esta instancia autoalojada las tablas creadas por
-- supabase_admin no heredan privilegios, así que el sync de Meta Ads
-- (src/lib/meta/sync.ts), la pantalla de Campañas, la Data API y el servidor
-- MCP fallaban con "permission denied for table meta_spend_daily".
--
-- Además las tres tablas quedaron sin RLS. Hoy ningún rol distinto de
-- service_role tiene privilegios sobre ellas, pero se activa RLS sin políticas
-- como las demás tablas de la aplicación: si alguien concede privilegios a
-- anon o authenticated por error, siguen sin poder leerlas.
--
-- Idempotente: GRANT y ENABLE ROW LEVEL SECURITY se pueden repetir.

GRANT ALL ON recruitment_daily_metrics TO service_role;
GRANT ALL ON meta_campaigns TO service_role;
GRANT ALL ON meta_spend_daily TO service_role;

ALTER TABLE recruitment_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_spend_daily ENABLE ROW LEVEL SECURITY;
