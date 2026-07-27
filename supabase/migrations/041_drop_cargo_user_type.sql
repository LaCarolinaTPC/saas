-- 041: Eliminar cargo_user_type (mapeo cargo → tipo de usuario).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- La tabla se creó en la migración 016 como idea de asignación automática de
-- rol por cargo, pero nunca tuvo consumidores en la aplicación: el rol se
-- asigna siempre de forma explícita en Configuración → Usuarios. Se elimina
-- para que no quede superficie muerta con referencia a user_types.
DROP TABLE IF EXISTS cargo_user_type;
