-- Selección: el cargo que va en la carta del banco y en la orden de exámenes
--
-- Contexto: pedido del 23-nov-2026. La carta y la orden tomaban el título de la
-- vacante del proceso, y todos los procesos reales tienen «Conductor de
-- transporte público colectivo»: la carta habría dicho ese cargo. Gestión
-- Humana quiere «CONDUCTOR - COBRADOR» por defecto y poder cambiarlo en
-- Selección › Tiempos y reglas. El código usa ese valor mientras esta fila no
-- exista; la migración solo hace que el ajuste aparezca para editarlo.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('cargo_documentos', 'dato', 'Cargo en la carta del banco y la orden de exámenes', 311,
   '"CONDUCTOR - COBRADOR"'::jsonb, '"CONDUCTOR - COBRADOR"'::jsonb, 'texto', 'Pedido del 23-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;
