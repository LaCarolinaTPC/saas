-- Selección: validar solas las cartas laborales que coinciden con la hoja de vida
--
-- Contexto: la IA ya lee sola la hoja de vida y las cartas laborales que llegan
-- por WhatsApp, pero la constatación de cada carta con la hoja de vida esperaba
-- a que Gestión Humana pulsara «Aceptar» en «Documentos leídos». Pedido del
-- 23-nov-2026: cuando la carta coincide (a nombre del aspirante, misma empresa,
-- fechas a ±2 meses y cargo de conducción, leída con confianza), el empleo queda
-- verificado solo. Lo que no coincide sigue esperando a una persona: nada se
-- pone en rojo sin que alguien lo confirme.
--
-- El código asume «sí» mientras esta fila no exista; la migración solo hace que
-- el ajuste aparezca en Selección › Tiempos y reglas para poder apagarlo.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('validar_cartas_auto', 'regla', 'Validar sola la carta laboral que coincide con la hoja de vida', 343,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Pedido del 23-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;
