-- seleccion etapa listo para contratar
--
-- Contexto: Gestión Humana pidió (25-nov-2026) que quien ya cumple todo para
-- contratar quede identificado en el tablero, en una etapa propia «Listo para
-- contratar», para revisarlo, darle el visto bueno y pasarlo a «Contratado».
-- El proceso entra solo cuando cumple todas las condiciones menos el visto
-- bueno, y vuelve solo a la etapa anterior si deja de cumplir alguna.
--
-- La etapa es el valor 'listo_contratar' de procesos_contratacion.estado, que
-- es texto sin CHECK: no hay que tocar la tabla. Esta migración solo siembra
-- los dos ajustes del correo que avisa a Gestión Humana cuando alguien entra.
-- Sin ella todo funciona igual: el correo va a los destinatarios del reporte
-- diario.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entera.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('listo_contratar_avisar', 'regla', 'Avisar por correo cuando un aspirante queda listo para contratar', 263,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 25-nov-2026', 4),
  ('listo_contratar_correos', 'dato', 'Correos que reciben el aviso de «Listo para contratar» (vacío: los del reporte diario)', 264,
   '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 25-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave LIKE 'listo\_contratar\_%' ORDER BY orden;
