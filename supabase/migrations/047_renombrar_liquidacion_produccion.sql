-- 047: Renombra el módulo existente sin cambiar su clave ni sus permisos.
-- Pegar en Supabase → SQL Editor (idempotente).

UPDATE user_types
SET
  nombre = 'Liquidacion Producción',
  descripcion = 'Consulta por código de la producción quincenal, sin descuentos aplicados.'
WHERE key = 'liquidacion_conductor_quincena';
