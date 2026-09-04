-- ============================================================
-- Comunicaciones: candidato creado desde la conversación
--
-- Desde el panel del contacto se puede abrir el formulario de
-- procesos de contratación (el mismo del módulo Candidatos) y
-- crear al contacto como candidato sin salir de la bandeja. La
-- conversación guarda el proceso creado para mostrar la etiqueta
-- "Candidato" y enlazar a su ficha.
-- ============================================================

ALTER TABLE wa_conversaciones
  ADD COLUMN IF NOT EXISTS proceso_id UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_conv_proceso ON wa_conversaciones(proceso_id);
