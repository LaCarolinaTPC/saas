-- Selección: RUNT obligatorio u opcional, y pausa de Croma
--
-- Contexto (24-nov-2026): cuando Croma está caído, el RUNT dejaba al aspirante
-- quieto en la preselección sin avisarle a nadie. Ahora:
--   * runt_obligatorio: como los de los antecedentes. En «no» (el valor de
--     siempre), sin el RUNT vale la licencia que dice el aspirante, con la
--     observación; en «sí», hace falta el RUNT o que una persona verifique la
--     licencia a mano (Lo revisé a mano › RUNT). Si el RUNT no responde, el
--     asistente le pide la categoría y una foto de la licencia.
--   * croma_pausado: no se consulta nada en Croma mientras está en «sí»; el
--     proceso sigue como si las verificaciones no fueran obligatorias y queda
--     para revisar a mano. Al quitarla, la revisión periódica retoma.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('runt_obligatorio', 'regla',
   'El RUNT es obligatorio para pasar a antecedentes (no: si Croma no responde, vale la licencia que dice el aspirante, con la observación)',
   245, 'false'::jsonb, 'false'::jsonb, 'si_no', 'Gestión Humana, 24-nov-2026', 4),
  ('croma_pausado', 'regla',
   'Pausar las consultas a Croma (por ejemplo, si está caído): todo queda para revisar a mano',
   244, 'false'::jsonb, 'false'::jsonb, 'si_no', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave IN ('runt_obligatorio', 'croma_pausado');
