-- Selección: ajuste «El RNMC es obligatorio para Listo para citar»
--
-- Contexto: pedido de Gestión Humana del 18-nov-2026. Desde esa mañana la
-- consulta del RNMC en Croma se cuelga (502 a los ~180 s) o responde de forma
-- intermitente, aunque el portal de la Policía funciona; se reportó a Croma.
-- Mientras tanto, el RNMC no debe frenar a los aspirantes: con este ajuste en
-- «no», si Policía, Procuraduría y Contraloría salen limpias y el RNMC no tiene
-- respuesta, el proceso queda «Listo para citar» con la observación de que
-- falta el RNMC (Gestión Humana lo revisa a mano). Si el RNMC llega después con
-- un hallazgo, va a revisión de una persona como siempre. El valor sugerido es
-- «sí» (obligatorio); se deja en «no» por ahora, como lo pidió GH. Se cambia en
-- Candidatos › Selección › Reglas del semáforo.
--
-- Unidad nueva «si_no» (valor true/false). Se puede correr varias veces.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES (
  'rnmc_obligatorio', 'regla',
  'El RNMC es obligatorio para «Listo para citar» (no: sin respuesta del RNMC queda «Listo para citar» con la observación de que falta)',
  245, 'false'::jsonb, 'true'::jsonb, 'si_no',
  'Mientras Croma no responde el RNMC (18-nov-2026); lo sugerido es que sea obligatorio', 1
)
ON CONFLICT (clave) DO NOTHING;
