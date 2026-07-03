-- ============================================================
-- El pipeline de candidatos usa los estados del proceso de
-- contratación. "Recibido" = pendientes por citar; "Rechazado"
-- = cierre de proceso. Las etapas genéricas anteriores se
-- desactivan (se conservan por el historial).
-- ============================================================

UPDATE pipeline_stages SET activo = false
WHERE key IN ('en_revision','validacion_documental','preseleccionado','entrevistado','en_pruebas','aprobado');

INSERT INTO pipeline_stages (key, label, color, text_color, orden, tipo, activo) VALUES
  ('recibido',            'Recibido',               '#F1F5F9', '#64748B', 1, 'normal',  true),
  ('citado',              'Citado',                 '#DBEAFE', '#2563EB', 2, 'normal',  true),
  ('en_examenes',         'En exámenes médicos',    '#FEF3C7', '#D97706', 3, 'normal',  true),
  ('prueba_manejo',       'Prueba de manejo',       '#E0E7FF', '#4F46E5', 4, 'normal',  true),
  ('en_escuela',          'En escuela',             '#F3E8FF', '#7C3AED', 5, 'normal',  true),
  ('reconocimiento_ruta', 'Reconocimiento de ruta', '#CFFAFE', '#0891B2', 6, 'normal',  true),
  ('contratado',          'Contratado',             '#D1FAE5', '#059669', 7, 'ganado',  true),
  ('rechazado',           'Rechazado',              '#FEE2E2', '#EF4444', 8, 'perdido', true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  color = EXCLUDED.color,
  text_color = EXCLUDED.text_color,
  orden = EXCLUDED.orden,
  tipo = EXCLUDED.tipo,
  activo = true;
