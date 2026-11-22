-- Selección: laboratorios, órdenes de exámenes, carta del banco y concepto «aplazado»
--
-- Contexto: en la llamada del 21-nov-2026 Salud Ocupacional explicó cómo
-- trabaja con los laboratorios:
--   * Son dos: Biobac (la orden va por correo a recepción y comercial, con la
--     orden de servicio en Word) y Rescate (por WhatsApp). Cada uno se puede
--     cambiar de canal; la fase 2 se hace en el mismo laboratorio de la fase 1.
--   * A todos los citan a las 6:30 a. m., por orden de llegada.
--   * Al aspirante se le entrega la orden de servicio y la carta del banco
--     (apertura de cuenta) con su nombre y cédula.
--   * En la fase 2 el laboratorio puede dejar el concepto «aplazado» (por
--     ejemplo, por el hemograma o la optometría), además de apto y no apto.
-- Hasta ahora había un solo laboratorio (un ajuste de texto), no se le enviaba
-- nada y solo existían apto y no apto.
--
-- Las plantillas en Word (orden y carta) se suben desde Candidatos ›
-- Selección › Laboratorios al bucket «seleccion». La tabla nueva necesita su
-- GRANT a service_role. Idempotente.

-- ── 1. Laboratorios ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seleccion_laboratorios (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                TEXT NOT NULL,
  direccion             TEXT,
  -- Teléfono que se imprime en la orden (no necesariamente WhatsApp).
  telefono_contacto     TEXT,
  -- Por dónde le llega la orden: whatsapp (al número de abajo) o correo.
  canal                 TEXT NOT NULL DEFAULT 'correo' CHECK (canal IN ('whatsapp', 'correo')),
  -- Número de WhatsApp del laboratorio (envía la orden y responde los resultados).
  whatsapp              TEXT,
  correos               TEXT[] NOT NULL DEFAULT '{}',
  correos_copia         TEXT[] NOT NULL DEFAULT '{}',
  asunto                TEXT,
  -- Orden de servicio en Word con las marcas {nombre}, {cedula}, {fecha}… (bucket «seleccion»).
  plantilla_orden_ruta  TEXT,
  activo                BOOLEAN NOT NULL DEFAULT true,
  predeterminado        BOOLEAN NOT NULL DEFAULT false,
  orden                 SMALLINT NOT NULL DEFAULT 0,
  actualizado_por       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sel_laboratorios_nombre ON seleccion_laboratorios (lower(nombre));
-- Uno solo predeterminado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sel_laboratorios_predeterminado ON seleccion_laboratorios (predeterminado) WHERE predeterminado;

ALTER TABLE seleccion_laboratorios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_laboratorios FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE seleccion_laboratorios TO service_role;
COMMENT ON TABLE seleccion_laboratorios IS
  'Laboratorios de los exámenes de ingreso: a cuál va cada aspirante, por dónde se le manda la orden y su plantilla.';

INSERT INTO seleccion_laboratorios (nombre, direccion, telefono_contacto, canal, correos, asunto, predeterminado, orden)
VALUES ('BIOBAC SST - IPS', 'CRA 62 # 74 - 198, Barranquilla', '3003897403', 'correo',
        ARRAY['recepcion@biobacips.com', 'comercial2@biobacips.com'],
        'ORDEN CONDUCTOR EXAMENES MEDICOS DE INGRESOS', true, 1)
ON CONFLICT DO NOTHING;
INSERT INTO seleccion_laboratorios (nombre, canal, orden)
VALUES ('Rescate', 'whatsapp', 2)
ON CONFLICT DO NOTHING;

-- El laboratorio del aspirante: se elige al citar la fase 1 y la fase 2 va al mismo.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS laboratorio_id UUID REFERENCES seleccion_laboratorios(id) ON DELETE SET NULL;
COMMENT ON COLUMN procesos_contratacion.laboratorio_id IS
  'Laboratorio de los exámenes de ingreso. La fase 2 se hace en el mismo de la fase 1.';

-- ── 2. Envío de la orden ─────────────────────────────────────────────────────
ALTER TABLE seleccion_citas ADD COLUMN IF NOT EXISTS orden_laboratorio_at TIMESTAMPTZ;
ALTER TABLE seleccion_citas ADD COLUMN IF NOT EXISTS orden_aspirante_at TIMESTAMPTZ;
COMMENT ON COLUMN seleccion_citas.orden_laboratorio_at IS 'Cuándo se le envió la orden al laboratorio (correo o WhatsApp). Evita enviarla dos veces.';
COMMENT ON COLUMN seleccion_citas.orden_aspirante_at IS 'Cuándo se le enviaron al aspirante la orden y la carta del banco. Si la ventana de 24 h estaba cerrada, salen cuando vuelva a escribir.';

-- Mensaje al laboratorio por WhatsApp. Lo inicia la empresa: necesita plantilla de Meta.
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado)
VALUES (
  'orden_laboratorio', 'Orden al laboratorio (WhatsApp)', 'Se envía la orden de exámenes a un laboratorio que la recibe por WhatsApp', 105,
  $t$Buen día. El {fecha} a las {hora} se acerca {nombre}, C.C. {cedula}, aspirante al cargo de {cargo}, para la fase {fase} de los exámenes médicos de ingreso de Transportes La Carolina. Quedamos atentos a los resultados por este medio.$t$,
  $t$Buen día. El {fecha} a las {hora} se acerca {nombre}, C.C. {cedula}, aspirante al cargo de {cargo}, para la fase {fase} de los exámenes médicos de ingreso de Transportes La Carolina. Quedamos atentos a los resultados por este medio.$t$,
  'automatico', ARRAY['fecha', 'hora', 'nombre', 'cedula', 'cargo', 'fase'],
  'sel_orden_laboratorio', ARRAY['fecha', 'hora', 'nombre', 'cedula', 'cargo', 'fase'], 'UTILITY', NULL
)
ON CONFLICT (clave) DO NOTHING;

-- ── 3. Concepto «aplazado» ───────────────────────────────────────────────────
ALTER TABLE seleccion_examenes DROP CONSTRAINT IF EXISTS seleccion_examenes_resultado_check;
ALTER TABLE seleccion_examenes ADD CONSTRAINT seleccion_examenes_resultado_check
  CHECK (resultado IN ('pendiente', 'apto', 'no_apto', 'aplazado'));
ALTER TABLE seleccion_avisos_laboratorio DROP CONSTRAINT IF EXISTS seleccion_avisos_laboratorio_resultado_propuesto_check;
ALTER TABLE seleccion_avisos_laboratorio ADD CONSTRAINT seleccion_avisos_laboratorio_resultado_propuesto_check
  CHECK (resultado_propuesto IN ('apto', 'no_apto', 'aplazado'));
-- Avisos creados desde el simulador de Selección (no vienen de WhatsApp).
ALTER TABLE seleccion_avisos_laboratorio ADD COLUMN IF NOT EXISTS simulado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE seleccion_avisos_laboratorio ADD COLUMN IF NOT EXISTS laboratorio_id UUID REFERENCES seleccion_laboratorios(id) ON DELETE SET NULL;

-- ── 4. Hora de exámenes y textos ─────────────────────────────────────────────
-- 6:30 a. m., por orden de llegada (solo si sigue en la sembrada).
UPDATE seleccion_ajustes SET valor = '"06:30"'::jsonb WHERE clave = 'laboratorio_hora' AND valor = '"06:00"'::jsonb;
UPDATE seleccion_ajustes SET valor_sugerido = '"06:30"'::jsonb WHERE clave = 'laboratorio_hora';

-- Fecha real en lugar de «Mañana» (la cita es el siguiente día hábil) y la orden
-- llega por este chat. Solo si nadie editó los textos sembrados.
UPDATE seleccion_mensajes
SET texto = $t$Hola, {nombre}. Aprobaste la prueba de manejo. El {fecha} te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Por aquí te enviamos la orden de exámenes y la carta para el banco: llévalas.$t$,
    variables = ARRAY['nombre', 'fecha', 'hora', 'laboratorio'],
    updated_at = now()
WHERE clave = 'examenes_fase1'
  AND texto = 'Hola, {nombre}. Aprobaste la prueba de manejo. Mañana te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Recuerda llevar la orden que te entregamos en recepción.';
UPDATE seleccion_mensajes
SET texto_sugerido = $t$Hola, {nombre}. Aprobaste la prueba de manejo. El {fecha} te presentas a las {hora} en {laboratorio} para la primera fase de exámenes médicos. Esta fase no es en ayunas. Por aquí te enviamos la orden de exámenes y la carta para el banco: llévalas.$t$
WHERE clave = 'examenes_fase1';

UPDATE seleccion_mensajes
SET texto = $t$Hola, {nombre}. Pasaste la primera fase de exámenes. El {fecha} te presentas a las {hora} en {laboratorio}, esta vez en ayunas. Al salir, vienes a la empresa para el reconocimiento de ruta.$t$,
    variables = ARRAY['nombre', 'fecha', 'hora', 'laboratorio'],
    updated_at = now()
WHERE clave = 'examenes_fase2'
  AND texto = 'Hola, {nombre}. Pasaste la primera fase de exámenes. Mañana te presentas a las {hora} en {laboratorio}, esta vez en ayunas. Al salir, vienes a la empresa para el reconocimiento de ruta.';
UPDATE seleccion_mensajes
SET texto_sugerido = $t$Hola, {nombre}. Pasaste la primera fase de exámenes. El {fecha} te presentas a las {hora} en {laboratorio}, esta vez en ayunas. Al salir, vienes a la empresa para el reconocimiento de ruta.$t$
WHERE clave = 'examenes_fase2';

-- Plantilla de la carta del banco (Word en el bucket «seleccion»).
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('carta_banco_ruta', 'dato', 'Plantilla de la carta del banco (Word)', 320, '""'::jsonb, '""'::jsonb, 'texto', 'Salud Ocupacional, 21-nov-2026', 3)
ON CONFLICT (clave) DO NOTHING;
