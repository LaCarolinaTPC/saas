-- Selección: experiencia laboral del aspirante, con su verificación
--
-- Contexto: la lectura de la hoja de vida (entrega 4) sacaba los empleos del
-- aspirante pero solo guardaba los meses manejando. Desde el 21-nov-2026 la
-- lista queda en el proceso y cada empleo empieza «sin verificar», a la
-- espera de una carta laboral de esa empresa o de que alguien llame a una
-- referencia de ahí. Se verifica solo al aceptar la carta o al validar la
-- referencia, y también a mano desde la ficha.
--
-- Cada elemento: {id, empresa, cargo, desde, hasta, vehiculo, conduccion,
-- origen (hoja_vida | manual), verificacion (sin_verificar | verificada |
-- no_confirmada), como (carta_laboral | referencia | otro), nota,
-- verificada_por, verificada_at}.
--
-- Requiere la migración de la entrega 4 (20261121030237). Idempotente.
-- Esta instancia es autoalojada: ejecute el script entero en el SQL Editor.

ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS experiencia_laboral JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN procesos_contratacion.experiencia_laboral IS
  'Empleos del aspirante (de la hoja de vida o a mano), cada uno sin verificar, verificado (carta laboral o referencia) o no confirmado.';

SELECT count(*) AS columna FROM information_schema.columns
WHERE table_name = 'procesos_contratacion' AND column_name = 'experiencia_laboral';
