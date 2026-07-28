-- 043: Módulo "rendimiento" (Rendimiento del día para conductores).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- Ruta /rendimiento: la misma consulta del simulador pero solo esa vista,
-- sin listado inicial (solo al digitar el código). El simulador completo
-- sigue reservado al administrador; este módulo se concede con un rol
-- propio para el usuario que se proyecta en pantalla (pedido de Nestor,
-- 28-jul-2026).

-- El módulo queda visible para administración.
UPDATE user_types
  SET modulos = modulos || '["rendimiento"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'rendimiento');

-- Rol restringido: SOLO ve el rendimiento del día (sin dashboard ni nada más).
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema) VALUES
  ('rendimiento_dia', 'Rendimiento del día', 'Consulta del rendimiento diario por código de conductor (pantalla para conductores)',
   '["rendimiento"]'::jsonb, 'all', false, false)
ON CONFLICT (key) DO NOTHING;
