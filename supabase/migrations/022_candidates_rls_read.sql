-- Fix: RRHH → Candidatos se ve vacío aunque hay 3.015 candidatos (creados
-- desde Procesos de contratación con service-role). Misma causa que la
-- migración 013 con `employees`: RLS activado sin policy de SELECT, por lo
-- que la lectura/escritura con la sesión del usuario devuelve [] o falla.
--
-- Dejamos las tablas del módulo de reclutamiento consistentes con el resto
-- de tablas de datos (employees, conductores, cierres, ...), que operan sin
-- RLS. La app protege el acceso vía la sesión de Supabase en el proxy y el
-- sistema de permisos por módulo.

ALTER TABLE candidates        DISABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_vacancy DISABLE ROW LEVEL SECURITY;
ALTER TABLE vacancies         DISABLE ROW LEVEL SECURITY;
ALTER TABLE stage_history     DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE procesos_contratacion DISABLE ROW LEVEL SECURITY;
