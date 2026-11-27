-- seleccion alerta de antecedentes por revisar
--
-- Contexto (reunión de soporte, 27-nov-2026): cuando un aspirante necesita que
-- una persona revise sus antecedentes (una fuente trae una anotación, Croma no
-- respondió una fuente que las reglas mandan a revisión, un requisito en rojo
-- que va a revisión manual, o un resultado que llega tarde con una anotación
-- después del aval), Gestión Humana no se enteraba: había que entrar a
-- Candidatos a mirar. Desde ahora llega un correo por aspirante y causa, con su
-- nombre, cédula, la causa y el enlace. Aquí van el interruptor y los
-- destinatarios (Selección › Tiempos y reglas › Alerta de antecedentes). Con la
-- lista vacía se usan los destinatarios del reporte diario. No crea tablas.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('antecedentes_alerta_activo', 'regla', 'Avisar por correo los antecedentes por revisar', 270,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4),
  ('antecedentes_alerta_correos', 'dato', 'Correos que reciben la alerta de antecedentes por revisar', 271,
   '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('antecedentes_alerta_copia', 'dato', 'Con copia a (alerta de antecedentes por revisar)', 272,
   '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave LIKE 'antecedentes\_alerta\_%' ORDER BY orden;
