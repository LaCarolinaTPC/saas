-- Selección: el SIMIT deja de bloquear la preselección mientras Croma no responde
--
-- Contexto: el 18-nov-2026 el SIMIT de Croma dejó de completar consultas
-- nuevas (el trabajo queda en curso y termina a los ~190 s con «The job could
-- not be completed»; reportado a Croma). Sin el SIMIT el semáforo no da el
-- cuarto verde y ningún aspirante pasa a antecedentes. Con este ajuste en «no»,
-- si los otros tres requisitos están en verde y el SIMIT ya se intentó consultar
-- sin respuesta, el aspirante pasa a antecedentes con la observación «falta el
-- SIMIT» para que Gestión Humana lo revise a mano. Ese aspirante no se cita
-- solo: queda «Listo para citar» para una persona.
--
-- Si después el SIMIT responde y supera el tope, el semáforo de la ficha queda
-- en rojo, pero el proceso no se cierra solo (ya salió de la preselección).
--
-- Lo sugerido es que sea obligatorio (sí): vuelva a ponerlo en «sí» en
-- Candidatos › Selección › Tiempos y reglas cuando Croma lo resuelva.
--
-- Requiere 20261118190946 (unidad si_no). Idempotente: se puede volver a
-- ejecutar. Esta instancia de Supabase es autoalojada y las migraciones se
-- aplican a mano en el SQL Editor del Studio: ejecute el script entero.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES (
  'simit_obligatorio', 'regla',
  'El SIMIT es obligatorio para pasar a antecedentes (no: si Croma no responde el SIMIT, pasa con la observación de que falta)',
  246, 'false'::jsonb, 'true'::jsonb, 'si_no',
  'Mientras Croma no responde el SIMIT (18-nov-2026); lo sugerido es que sea obligatorio', 2
)
ON CONFLICT (clave) DO NOTHING;
