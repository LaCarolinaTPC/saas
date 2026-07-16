-- Devengados v2: la producción neta del día es el campo salarioNetoDia del
-- cierre de GEMA (pa_ext_get_IngresoConductorByFecha), NO la suma de netos
-- de viajes_recaudados. El procedimiento ya exponía estos campos; el sync
-- no los mapeaba. Son por fila de cierre (ruta): el día = suma de filas.

ALTER TABLE cierres_diarios
  ADD COLUMN IF NOT EXISTS cedula_conductor TEXT,
  ADD COLUMN IF NOT EXISTS bruto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS salario_bruto_dia NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS salario_neto_dia NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS ahorro NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS ahorro_obli NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS anticipo NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_cierres_cedula ON cierres_diarios(cedula_conductor);

-- Rol para la nueva funcionalidad de Tesorería (caja de devengados).
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema) VALUES
  ('tesoreria', 'Tesorería', 'Caja de devengados: entregas diarias, análisis quincenal y parámetros',
   '["dashboard","tesoreria"]'::jsonb, 'all', true, false)
ON CONFLICT (key) DO NOTHING;
