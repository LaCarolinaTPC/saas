-- ============================================================
-- Separar departamentos organizacionales (GEMA) de los de vacantes.
-- Los sincronizados desde GEMA (empleados/permisos) no deben aparecer
-- en el selector de departamento del formulario de vacantes; ahí solo
-- van los creados manualmente por el usuario.
-- ============================================================

ALTER TABLE departments ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';

-- Todos los existentes vienen de GEMA o del seed organizacional.
UPDATE departments SET origen = 'gema';
