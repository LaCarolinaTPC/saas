-- ============================================================
-- El tipo "Recursos Humanos" solo ve el módulo de Recursos Humanos
-- (vacantes, candidatos/contratación, empleados, conductores,
--  documentos y campañas). Se le quitan dashboard y accidentabilidad.
-- ============================================================

UPDATE user_types
SET modulos = '["vacantes","candidatos","empleados","conductores","documentos","campanas"]'::jsonb
WHERE key = 'rrhh';
