-- Selección: reparto entre laboratorios y días de atención
--
-- Contexto: además de Biobac, Gestión Humana suele mandar a Rescate los sábados
-- porque entrega los resultados más rápido. Pidieron poder definir cómo se
-- reparten los aspirantes (siempre a uno, o un porcentaje a cada uno) y los
-- días que atiende cada laboratorio, para no citar a nadie un día que no
-- atiende (21-nov-2026).
--
-- Reglas (src/lib/seleccion/laboratorios.ts › elegirLaboratorio):
--   1. Solo los laboratorios activos que atienden ese día.
--   2. Si alguno lo tiene como día preferido (Rescate los sábados), va a ese.
--   3. Si no, según el reparto: siempre el predeterminado, o por porcentaje
--      (al que más lejos esté de su porcentaje en los últimos 30 días).
--   Si ese día no atiende ninguno, la cita pasa al siguiente día que alguno
--   atienda. La fase 2 va al mismo laboratorio, en un día que atienda.
-- Días: 0 = domingo … 6 = sábado. Idempotente.

ALTER TABLE seleccion_laboratorios ADD COLUMN IF NOT EXISTS dias_atencion SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6}';
ALTER TABLE seleccion_laboratorios ADD COLUMN IF NOT EXISTS dias_preferidos SMALLINT[] NOT NULL DEFAULT '{}';
ALTER TABLE seleccion_laboratorios ADD COLUMN IF NOT EXISTS porcentaje SMALLINT NOT NULL DEFAULT 0 CHECK (porcentaje BETWEEN 0 AND 100);
COMMENT ON COLUMN seleccion_laboratorios.dias_atencion IS 'Días en que atiende (0 = domingo … 6 = sábado). Nunca se cita a un aspirante un día que no atiende.';
COMMENT ON COLUMN seleccion_laboratorios.dias_preferidos IS 'Días en que se prefiere este laboratorio sobre el reparto (p. ej. Rescate los sábados, porque entrega más rápido).';
COMMENT ON COLUMN seleccion_laboratorios.porcentaje IS 'Parte de los aspirantes que recibe cuando el reparto es por porcentaje.';

-- Rescate los sábados (lo que hace hoy Gestión Humana). Solo si nadie lo cambió.
UPDATE seleccion_laboratorios SET dias_preferidos = '{6}' WHERE lower(nombre) = 'rescate' AND dias_preferidos = '{}';

-- Cómo se reparten: predeterminado (siempre el marcado) o porcentaje.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('laboratorio_reparto', 'regla', 'Reparto de aspirantes entre laboratorios', 330, '"predeterminado"'::jsonb, '"predeterminado"'::jsonb, 'texto', 'Gestión Humana, 21-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;
