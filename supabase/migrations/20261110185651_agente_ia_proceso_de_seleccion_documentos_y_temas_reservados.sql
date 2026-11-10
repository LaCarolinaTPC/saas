-- agente ia proceso de seleccion documentos y temas reservados
--
-- Contexto: el agente de WhatsApp pasaba demasiados chats a una persona:
-- cuando le preguntaban salario u horario (no están en su prompt) o cuando no
-- entendía una respuesta. Gestión Humana quiere que el agente haga el trabajo
-- de persuasión: que pregunte los requisitos, pida los documentos que falten
-- y solo pase el chat cuando el aspirante completó todo, lo pide expresamente,
-- el tema es delicado o no se le entiende tras varias aclaraciones. Salario y
-- horarios no se informan por chat: los da un representante después.
--
-- Todo queda editable en Comunicaciones › Agente IA (listas una por línea).
-- La tabla wa_agente ya existe y tiene sus GRANT, así que solo se agregan
-- columnas.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).

-- Preguntas de requisitos que el agente hace al aspirante (una por línea).
ALTER TABLE wa_agente ADD COLUMN IF NOT EXISTS preguntas_requisitos TEXT NOT NULL DEFAULT
  E'Nombre completo\nEdad\nCategoría de la licencia de conducción y fecha de vencimiento\nCiudad y barrio donde vive\nExperiencia como conductor (años y tipo de vehículo)\nSi ha trabajado antes en La Carolina';

-- Documentos que el agente pide (uno por línea).
ALTER TABLE wa_agente ADD COLUMN IF NOT EXISTS documentos_requeridos TEXT NOT NULL DEFAULT
  E'Hoja de vida (foto, PDF o un audio contando tu experiencia)\nFoto de la licencia de conducción por ambos lados\nFoto de la cédula por ambos lados\nCartas laborales (si aún no las tienes, puedes ir consiguiéndolas)';

-- Temas sobre los que el agente no da información (uno por línea) y lo que
-- responde en su lugar, sin pasar el chat a una persona.
ALTER TABLE wa_agente ADD COLUMN IF NOT EXISTS temas_reservados TEXT NOT NULL DEFAULT
  E'Salario o sueldo\nHorarios y turnos\nForma y fechas de pago';
ALTER TABLE wa_agente ADD COLUMN IF NOT EXISTS respuesta_reservada TEXT NOT NULL DEFAULT
  'Esa información te la da directamente uno de nuestros representantes cuando te contactemos.';

-- Al completar preguntas y documentos, el agente avisa que lo contactarán y
-- pasa el chat a una persona.
ALTER TABLE wa_agente ADD COLUMN IF NOT EXISTS transferir_al_completar BOOLEAN NOT NULL DEFAULT true;

-- Cuántas veces seguidas pide aclarar un mensaje que no entiende antes de
-- pasar el chat a una persona.
ALTER TABLE wa_agente ADD COLUMN IF NOT EXISTS intentos_sin_entender INTEGER NOT NULL DEFAULT 2
  CHECK (intentos_sin_entender BETWEEN 1 AND 5);
