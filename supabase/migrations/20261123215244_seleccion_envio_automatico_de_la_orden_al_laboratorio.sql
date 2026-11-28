-- Selección: la orden de exámenes sale sola al laboratorio (configurable)
--
-- Contexto: pedido del 23-nov-2026. Hasta ahora la orden la mandaba Gestión
-- Humana a mano con «Enviar» en «Orden del día al laboratorio». Ahora, con el
-- ajuste en «sí» (lo sugerido), al laboratorio por WhatsApp le llega apenas se
-- cita al aspirante (fase 1 o fase 2), y al laboratorio por correo le llega un
-- solo correo al día con todos los citados del siguiente día hábil, a la hora
-- de este ajuste (lo manda el cron). En «no», todo sigue a mano. El botón
-- «Enviar» sigue sirviendo para mandarla antes o reenviarla.
--
-- El código asume «sí» y las 17:00 mientras estas filas no existan; la
-- migración solo hace que los ajustes aparezcan en Selección › Tiempos y reglas.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('orden_laboratorio_automatica', 'regla', 'Enviar la orden al laboratorio automáticamente', 312,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Pedido del 23-nov-2026', 3),
  ('orden_laboratorio_hora', 'tiempo', 'Hora del correo diario con las órdenes', 313,
   '"17:00"'::jsonb, '"17:00"'::jsonb, 'hora', 'Pedido del 23-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;
