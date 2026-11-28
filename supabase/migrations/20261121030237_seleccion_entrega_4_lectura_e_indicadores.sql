-- Selección, entrega 4: lectura de documentos, audios y día de contratación
--
-- Contexto: última de las cuatro entregas que aprobó la junta (requerimientos
-- A6, R1–R7, I1 y K1; capacitación el 25-nov-2026). Hasta ahora:
--   * solo se leía la foto de la cédula; la licencia, la hoja de vida y la
--     carta laboral (en foto o en PDF) llegaban y nadie las leía;
--   * los audios del aspirante no se escuchaban: el asistente le pedía que lo
--     escribiera;
--   * del día de contratación (psicotécnica, entrevista, inducción) no quedaba
--     registro en el proceso.
-- Los indicadores (K1) no necesitan tablas: se calculan con lo que ya existe.
--
-- Requiere las migraciones de las entregas 1 a 3 (20261113205625,
-- 20261118195923, 20261120195812). Idempotente: se puede volver a ejecutar.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.

-- ── 1. Ajustes ─────────────────────────────────────────────────────────────
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('lectura_activa', 'regla', 'Leer con IA los documentos que envía el aspirante (cédula, licencia, hoja de vida, carta laboral)', 340,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Requerimiento A6', 4),
  ('lectura_modelo', 'regla', 'Modelo con el que se leen los documentos', 341,
   '"preciso"'::jsonb, '"preciso"'::jsonb, 'opcion', 'Requerimiento R1', 4),
  ('transcribir_audios', 'regla', 'Transcribir los audios del aspirante para que el asistente los entienda', 342,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Requerimiento A6', 4)
ON CONFLICT (clave) DO NOTHING;

-- La psicotécnica pasa a ser condición para contratar (plan de la entrega 4),
-- salvo que alguien ya haya cambiado ese ajuste a mano.
UPDATE seleccion_ajustes
SET valor = 'true'::jsonb, valor_sugerido = 'true'::jsonb, origen = 'Requerimiento I1', updated_at = now()
WHERE clave = 'contratar_exige_psicotecnica'
  AND valor = 'false'::jsonb
  AND NOT EXISTS (SELECT 1 FROM seleccion_cambios c WHERE c.tipo = 'ajuste' AND c.clave = 'contratar_exige_psicotecnica');

-- ── 2. Lecturas de documentos ──────────────────────────────────────────────
-- Una fila por archivo leído. Los campos quedan como propuesta hasta que una
-- persona los acepta, corrige o rechaza en la ficha («Documentos leídos»).
CREATE TABLE IF NOT EXISTS seleccion_lecturas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cada archivo de WhatsApp se lee una sola vez.
  wa_mensaje_id   UUID UNIQUE,
  adjunto_id      UUID REFERENCES seleccion_adjuntos(id) ON DELETE SET NULL,
  conversacion_id UUID,
  proceso_id      UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  -- Las fotos de una misma ráfaga que son un solo documento comparten grupo.
  grupo           UUID,
  clase           TEXT NOT NULL DEFAULT 'otro' CHECK (clase IN ('cedula', 'licencia', 'hoja_vida', 'carta_laboral', 'otro')),
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'leido', 'ilegible', 'error', 'omitido')),
  -- [{campo, valor, confianza, evidencia, pagina, decision, valor_final}]
  campos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumen         TEXT,
  error           TEXT,
  modelo          TEXT,
  costo_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
  -- Se pidió repetir la foto (mensaje reenviar_archivo).
  reenvio_pedido_at TIMESTAMPTZ,
  revisado_por    TEXT,
  revisado_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_lecturas_proceso ON seleccion_lecturas (proceso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_lecturas_conversacion ON seleccion_lecturas (conversacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_lecturas_estado ON seleccion_lecturas (estado, created_at);

-- ── 3. Audios ──────────────────────────────────────────────────────────────
ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS transcripcion TEXT;
-- Cuándo se intentó (también si falló), para no repetirlo en cada mensaje.
ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS transcripcion_at TIMESTAMPTZ;

-- ── 4. Datos del proceso ───────────────────────────────────────────────────
-- Restricciones de la licencia (p. ej. «lentes»): alimentan la citación.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS licencia_restricciones TEXT;
-- De dónde salió cada dato: {"cedula": "verificado", "experiencia_meses": "leido", ...}
-- declarado (lo dijo el aspirante) | leido (de un documento, confirmado por una persona) | verificado (RUNT u otra fuente)
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS datos_origen JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Psicotécnica hecha fuera de Gestivo (una IPS). La de Gestivo vive en psico_intentos.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS psicotecnica_resultado TEXT;
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_psicotecnica_resultado_chk;
ALTER TABLE procesos_contratacion
  ADD CONSTRAINT procesos_contratacion_psicotecnica_resultado_chk CHECK (psicotecnica_resultado IN ('apto', 'apto_con_observaciones', 'no_apto'));
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS psicotecnica_fecha DATE;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS psicotecnica_puntaje NUMERIC(6, 2);
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS psicotecnica_entidad TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS psicotecnica_por TEXT;

-- Entrevista e inducción: solo registro.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS entrevista_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS entrevista_por TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS entrevista_nota TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS induccion_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS induccion_por TEXT;

-- Dónde es la cita (la psicotécnica puede ser en una IPS): va en el
-- recordatorio como {lugar}. Vacío = la dirección de la sede.
ALTER TABLE seleccion_citas ADD COLUMN IF NOT EXISTS lugar TEXT;

-- ── 5. Privilegios ─────────────────────────────────────────────────────────
ALTER TABLE seleccion_lecturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_lecturas FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE seleccion_lecturas TO service_role;

COMMENT ON TABLE seleccion_lecturas IS 'Lo que la IA leyó de cada documento del aspirante, a la espera de que una persona lo confirme.';
COMMENT ON COLUMN wa_mensajes.transcripcion IS 'Texto del audio (entrega 4 de selección). Lo dicho en audio cuenta como declarado.';
COMMENT ON COLUMN procesos_contratacion.datos_origen IS 'Origen de cada dato del aspirante: declarado | leido | verificado.';

-- ── 6. Aviso en tiempo real ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS seleccion_lecturas_aviso_insert ON public.seleccion_lecturas;
CREATE TRIGGER seleccion_lecturas_aviso_insert AFTER INSERT OR DELETE ON public.seleccion_lecturas
  FOR EACH ROW EXECUTE FUNCTION public.procesos_avisar_tablero();
DROP TRIGGER IF EXISTS seleccion_lecturas_aviso_update ON public.seleccion_lecturas;
CREATE TRIGGER seleccion_lecturas_aviso_update AFTER UPDATE ON public.seleccion_lecturas
  FOR EACH ROW WHEN (old.* IS DISTINCT FROM new.*) EXECUTE FUNCTION public.procesos_avisar_tablero();

SELECT to_regclass('public.seleccion_lecturas') AS lecturas,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'procesos_contratacion' AND column_name IN ('entrevista_at', 'induccion_at', 'psicotecnica_resultado', 'datos_origen')) AS columnas_nuevas,
       (SELECT valor FROM seleccion_ajustes WHERE clave = 'contratar_exige_psicotecnica') AS exige_psicotecnica;
