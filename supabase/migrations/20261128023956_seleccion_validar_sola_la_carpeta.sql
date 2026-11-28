-- seleccion validar sola la carpeta
--
-- Contexto (27-nov-2026, pedido de GH: «que solo tengan que validar lo que sea
-- necesario»): Gestivo valida solos los documentos de la carpeta que la IA leyó
-- bien y coinciden con el aspirante (hoja de vida, cédula, licencia verificada,
-- certificado del Banco de Bogotá a su nombre, y la carta laboral que ya se
-- validaba sola). Lo que tenga dudas y las referencias siguen siendo de una
-- persona. Este ajuste lo apaga (Selección › Tiempos y reglas › Lectura de
-- documentos). Sin él, Gestivo lo hace (sí por defecto).
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('validar_documentos_auto', 'regla', 'Validar solos los documentos de la carpeta que coinciden con el aspirante', 344,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave IN ('validar_cartas_auto', 'validar_documentos_auto');
