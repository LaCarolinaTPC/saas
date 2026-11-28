-- seleccion reporte diario por correo
--
-- Contexto (24-nov-2026): Gestión Humana quiere recibir cada día, por correo,
-- los indicadores de la selección (cuántos van en cada fase, cuántos pasaron
-- todas, cuántos se cerraron y por qué, por qué canal llegaron, mensajes
-- recibidos y enviados) para mejorar las campañas. El cron
-- /api/cron/reporte-seleccion (7:00 de Bogotá) arma el correo con las mismas
-- cifras de Candidatos › Indicadores. Aquí van los destinatarios, editables en
-- esa pantalla y en Selección › Tiempos y reglas. No crea tablas.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('reporte_diario_activo', 'regla', 'Enviar el reporte diario de selección por correo', 260,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 24-nov-2026', 4),
  ('reporte_diario_correos', 'dato', 'Correos que reciben el reporte diario de selección', 261,
   '["drrhumanos@lacarolina.com.co"]'::jsonb, '["drrhumanos@lacarolina.com.co"]'::jsonb, 'lista', 'Gestión Humana, 24-nov-2026', 4),
  ('reporte_diario_copia', 'dato', 'Con copia a (reporte diario de selección)', 262,
   '["soporte@lacarolina.com.co"]'::jsonb, '["soporte@lacarolina.com.co"]'::jsonb, 'lista', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave LIKE 'reporte\_diario\_%' ORDER BY orden;
