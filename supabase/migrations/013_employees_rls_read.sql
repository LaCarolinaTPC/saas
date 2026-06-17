-- Fix: la pantalla RRHH → Empleados se veía vacía aunque el sync insertó 308
-- filas. Causa: RLS activado en `employees` sin policy de SELECT, por lo que
-- la lectura con la sesión del usuario devolvía [] (el sync usa service-role,
-- que ignora RLS, por eso sí escribía).
--
-- Dejamos `employees` consistente con las demás tablas de datos (conductores,
-- cierres, etc.), que operan sin RLS. La app ya protege el acceso vía la
-- sesión de Supabase en el proxy/middleware.

ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

-- Por consistencia, garantizamos lo mismo en las tablas nuevas de GEMA.
ALTER TABLE propietarios       DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingreso_tercero    DISABLE ROW LEVEL SECURITY;
ALTER TABLE viajes_recaudados  DISABLE ROW LEVEL SECURITY;
ALTER TABLE gema_sync_state    DISABLE ROW LEVEL SECURITY;
