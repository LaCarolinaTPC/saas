-- Selección: citar automáticamente al quedar «Listo para citar»
--
-- Contexto: pedido de Gestión Humana del 18-nov-2026. Hasta ahora, cuando el
-- aspirante quedaba «Listo para citar» (prefiltro completo, preselección sin
-- rojos y antecedentes limpios), una persona tenía que abrir el chat y pulsar
-- «Citar». Con este ajuste encendido Gestivo lo cita solo al siguiente cupo de
-- la prueba de manejo y le envía la citación; si el aspirante no puede, el
-- asistente le pregunta qué día puede y mueve la cita.
--
-- No se cita solo (queda «Listo para citar» para una persona, como antes) si
-- falta la dirección de la sede, si falta la respuesta del RNMC o si es un
-- reingreso. Sin esta fila el código toma el valor «sí».
--
-- Requiere 20261118190946 (unidad si_no). Idempotente: se puede volver a
-- ejecutar. Esta instancia de Supabase es autoalojada y las migraciones se
-- aplican a mano en el SQL Editor del Studio: ejecute el script entero.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES (
  'cita_automatica', 'regla',
  'Citar automáticamente a la prueba de manejo al quedar «Listo para citar» (no: lo cita una persona)',
  248, 'true'::jsonb, 'true'::jsonb, 'si_no',
  'Pedido de Gestión Humana del 18-nov-2026', 2
)
ON CONFLICT (clave) DO NOTHING;
