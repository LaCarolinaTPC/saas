-- 045: Módulo "produccion_conductor" (Producción del conductor, sin saldos).
-- Pegar en: Supabase → SQL Editor (idempotente).
--
-- Ruta /produccion-conductor: el mismo reporte de /liquidacion (044) pero sin
-- base, saldo del día, saldo corriente, retiros ni disponible — solo lo
-- producido por día. Va en módulo aparte a propósito: así se puede entregar a
-- quien NO debe ver la deuda del conductor. Quien tenga ambos módulos ve los
-- dos reportes; quien tenga solo este, nunca ve un saldo.

-- El módulo queda visible para administración.
UPDATE user_types
  SET modulos = modulos || '["produccion_conductor"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'produccion_conductor');

-- Rol restringido: SOLO ve la producción del conductor (sin saldos).
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema) VALUES
  ('produccion_conductor', 'Producción conductor', 'Consulta de lo producido por código de conductor (una línea por día, sin base, saldos ni retiros)',
   '["produccion_conductor"]'::jsonb, 'all', false, false)
ON CONFLICT (key) DO NOTHING;
