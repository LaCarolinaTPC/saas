-- Permite sincronizar TODOS los empleados de GEMA, incluidos los que no
-- tienen fecha de ingreso registrada (antes se descartaban porque hire_date
-- era NOT NULL).

ALTER TABLE employees ALTER COLUMN hire_date DROP NOT NULL;
