-- 046: Módulo "liquidacion_conductor_quincena".
-- Consulta por código de la liquidación quincenal sin tarjetas, base, saldos
-- ni retiros. Pegar en Supabase → SQL Editor (idempotente).

UPDATE user_types
  SET modulos = modulos || '["liquidacion_conductor_quincena"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'liquidacion_conductor_quincena');

INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema) VALUES
  ('liquidacion_conductor_quincena', 'Liquidación conductor Quincena',
   'Consulta quincenal por código sin tarjetas, base, saldos ni retiros.',
   '["liquidacion_conductor_quincena"]'::jsonb, 'all', false, false)
ON CONFLICT (key) DO NOTHING;
