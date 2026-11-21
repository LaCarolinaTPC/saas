-- Selección: costo de las consultas a Croma en el gasto del mes
--
-- Contexto: el tope mensual de la entrega 3 (NF1) solo sumaba lo que cobra el
-- modelo del asistente; las consultas a Croma (RUNT, SIMIT, Policía,
-- Procuraduría, Contraloría, RNMC) no tenían precio en Gestivo. Este ajuste es
-- el valor en pesos de una consulta: el gasto del mes cuenta cada consulta
-- real (no las reutilizadas de la caché ni las simuladas del chat de prueba)
-- y la multiplica por él. En 0 hasta que se conozca la tarifa de Croma.
--
-- Requiere la migración de la entrega 3 (20261120195812). Idempotente.
-- Esta instancia de Supabase es autoalojada: ejecute el script entero en el SQL Editor.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('croma_costo_consulta', 'dato', 'Valor de una consulta a Croma', 332,
   '0'::jsonb, '0'::jsonb, 'pesos', 'Falta la tarifa de Croma', 3)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave = 'croma_costo_consulta';
