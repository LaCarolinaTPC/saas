-- Fix: el upsert de Supabase (PostgREST) no puede usar ON CONFLICT con un
-- índice único PARCIAL. La migración 011 creó `uq_employees_gema_codigo` como
-- índice parcial (WHERE gema_codigo IS NOT NULL), lo que hacía fallar
-- syncEmpleados. Lo reemplazamos por una restricción UNIQUE normal: en
-- Postgres los múltiples NULL siguen permitidos (empleados manuales), y
-- ON CONFLICT (gema_codigo) sí funciona.
--
-- Idempotente: cubre tanto el caso de índice parcial como el de constraint
-- ya creada.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS uq_employees_gema_codigo;
DROP INDEX IF EXISTS uq_employees_gema_codigo;

ALTER TABLE employees
  ADD CONSTRAINT uq_employees_gema_codigo UNIQUE (gema_codigo);
