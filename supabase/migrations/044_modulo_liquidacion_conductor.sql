-- 044: Módulo "liquidacion" (Liquidación consolidada del conductor).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- Ruta /liquidacion: reporte pedido por Nestor/Helmut (reunión 29-jul-2026):
-- una sola línea por día con el saldo neto (todas las rutas/vehículos del
-- día sumados), transacciones explícitas de RETIRO entre los días y el
-- DISPONIBLE del rango destacado. Consulta SOLO por código de conductor,
-- con fecha inicial y final — "adicional, igual como el de rendimiento".

-- El módulo queda visible para administración.
UPDATE user_types
  SET modulos = modulos || '["liquidacion"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'liquidacion');

-- Rol restringido: SOLO ve la liquidación del conductor.
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema) VALUES
  ('liquidacion_conductor', 'Liquidación conductor', 'Consulta de la liquidación consolidada por código de conductor (una línea por día, retiros y disponible)',
   '["liquidacion"]'::jsonb, 'all', false, false)
ON CONFLICT (key) DO NOTHING;
