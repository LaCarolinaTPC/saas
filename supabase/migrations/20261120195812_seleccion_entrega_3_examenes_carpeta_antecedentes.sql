-- Selección, entrega 3: reglas de antecedentes, exámenes, carpeta y costo
--
-- Contexto: tercera de las cuatro entregas que aprobó la junta (requerimientos
-- C1–C3, M1–M3, G1, H1, H2 y NF1; demostración el 23-nov-2026). Hasta ahora:
--   * cualquier hallazgo de antecedentes iba a revisión de una persona, porque
--     Gestión Humana no había dicho qué se tolera. Las preguntas que se le
--     hicieron (docs/seleccion-antecedentes-croma.pdf, sección 9) quedan aquí
--     como ajustes editables, con valores de prueba mientras responde;
--   * nadie registraba el resultado de los exámenes ni pasaba al aspirante de
--     la fase 1 a la fase 2;
--   * los documentos del aspirante solo existían como archivos sueltos del
--     chat: no había carpeta, referencias ni dónde subir un archivo a mano;
--   * pasar a «Contratado» no exigía nada;
--   * no se sabía cuánto cuesta el asistente ni había tope mensual;
--   * los mensajes del laboratorio no se distinguían de los de un aspirante.
--
-- Requiere las migraciones de las entregas 1 (20261113205625) y 2
-- (20261118195923). Idempotente: se puede volver a ejecutar.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.

-- ── 1. Reglas de antecedentes y demás ajustes ──────────────────────────────
-- unidad «opcion»: se elige entre tolera | revision | descarta
-- (src/lib/seleccion/ajustes.ts). El valor sugerido es el valor de prueba.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('ant_policia_accion', 'regla', '¿Qué pasa si tiene asuntos pendientes con las autoridades judiciales (Policía)?', 300,
   '"revision"'::jsonb, '"revision"'::jsonb, 'opcion', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_procuraduria_accion', 'regla', '¿Qué pasa si tiene antecedentes disciplinarios (Procuraduría)?', 301,
   '"revision"'::jsonb, '"revision"'::jsonb, 'opcion', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_contraloria_accion', 'regla', '¿Qué pasa si es responsable fiscal (Contraloría)?', 302,
   '"descarta"'::jsonb, '"descarta"'::jsonb, 'opcion', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_contraloria_valor_tolerado', 'regla', 'Contraloría: valor del fallo hasta el que se tolera (0 = no importa el valor)', 303,
   '0'::jsonb, '0'::jsonb, 'pesos', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_contraloria_anios_tolerado', 'regla', 'Contraloría: años desde el fallo a partir de los cuales se tolera (0 = no importa la fecha)', 304,
   '0'::jsonb, '0'::jsonb, 'numero', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_rnmc_max_toleradas', 'regla', 'RNMC: medidas correctivas pendientes que se toleran como máximo', 305,
   '2'::jsonb, '2'::jsonb, 'numero', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_rnmc_accion_exceso', 'regla', '¿Qué pasa si tiene más medidas correctivas que ese máximo (RNMC)?', 306,
   '"revision"'::jsonb, '"revision"'::jsonb, 'opcion', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('ant_rnmc_palabras_revision', 'regla', 'RNMC: palabras de las medidas que nunca se toleran', 307,
   '[]'::jsonb, '[]'::jsonb, 'lista', 'Valor de prueba: falta la respuesta de Gestión Humana', 3),
  ('carpeta_items', 'regla', 'Documentos que debe tener la carpeta para contratar', 320,
   '["Hoja de vida", "Fotocopia de la cédula", "Fotocopia de la licencia", "Carta laboral", "Referencia laboral", "Referencia personal"]'::jsonb,
   '["Hoja de vida", "Fotocopia de la cédula", "Fotocopia de la licencia", "Carta laboral", "Referencia laboral", "Referencia personal"]'::jsonb,
   'lista', 'Valor de prueba: falta la lista de Gestión Humana', 3),
  ('contratar_exige_condiciones', 'regla', 'Para contratar hay que cumplir las condiciones (exámenes, rutas, carpeta y aprobación)', 321,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Requerimiento H2', 3),
  ('contratar_exige_psicotecnica', 'regla', 'Para contratar hay que tener la prueba psicosensotécnica apta', 322,
   'false'::jsonb, 'false'::jsonb, 'si_no', 'Se enciende cuando la junta decida', 3),
  ('tope_mensual_cop', 'regla', 'Tope mensual del gasto del asistente', 330,
   '500000'::jsonb, '500000'::jsonb, 'pesos', 'Requerimiento NF1', 3),
  ('trm', 'dato', 'Pesos por dólar para convertir el gasto', 331,
   '3270'::jsonb, '3270'::jsonb, 'numero', 'Requerimiento NF1', 3)
ON CONFLICT (clave) DO NOTHING;

-- ── 2. Decisión de antecedentes y aprobación para contratar ────────────────
-- Lo que dicen las reglas (limpio | tolerable | revision | descarta | pendiente).
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS antecedentes_resultado TEXT;
-- Lo que decidió una persona sobre un hallazgo (permiso candidatos.decidir_antecedentes).
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS antecedentes_decision TEXT;
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_antecedentes_decision_chk;
ALTER TABLE procesos_contratacion
  ADD CONSTRAINT procesos_contratacion_antecedentes_decision_chk CHECK (antecedentes_decision IN ('aprobado', 'rechazado'));
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS antecedentes_decision_por TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS antecedentes_decision_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS antecedentes_decision_justificacion TEXT;
-- Visto bueno de la directora para contratar (permiso candidatos.aprobar_contratacion).
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS aprobacion_contratacion_at TIMESTAMPTZ;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS aprobacion_contratacion_por TEXT;
-- Último recordatorio de documentos pendientes, para no repetirlo antes de tiempo.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS documentos_recordatorio_at TIMESTAMPTZ;

-- ── 3. Archivos del proceso ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('seleccion', 'seleccion', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS seleccion_adjuntos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id     UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  -- hoja_vida | cedula | licencia | carta_laboral | certificado_<fuente> | radiografia | examen | psicotecnica | otro
  tipo           TEXT NOT NULL,
  ruta           TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  mime           TEXT NOT NULL,
  tamano         INTEGER NOT NULL,
  origen         TEXT NOT NULL DEFAULT 'subido' CHECK (origen IN ('subido', 'whatsapp', 'proveedor')),
  wa_mensaje_id  UUID,
  subido_por     TEXT,
  -- No se borra: se anula con motivo.
  anulado_at     TIMESTAMPTZ,
  anulado_por    TEXT,
  anulado_motivo TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_adjuntos_proceso ON seleccion_adjuntos (proceso_id, created_at DESC);

-- ── 4. Exámenes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seleccion_examenes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id                UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  fase                      SMALLINT NOT NULL CHECK (fase IN (1, 2)),
  fecha                     DATE,
  resultado                 TEXT NOT NULL DEFAULT 'pendiente' CHECK (resultado IN ('pendiente', 'apto', 'no_apto')),
  -- Para «apto con restricciones» y lo que diga el laboratorio.
  observacion               TEXT,
  propuesto_por_laboratorio BOOLEAN NOT NULL DEFAULT false,
  confirmado_por            TEXT,
  confirmado_at             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proceso_id, fase)
);

-- ── 5. Carpeta y referencias ───────────────────────────────────────────────
-- Un ítem por documento de la lista `carpeta_items`. Sin fila = pendiente.
CREATE TABLE IF NOT EXISTS seleccion_carpeta_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id   UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  item         TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recibido', 'validado')),
  nota         TEXT,
  validado_por TEXT,
  validado_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proceso_id, item)
);

CREATE TABLE IF NOT EXISTS seleccion_referencias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id   UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('laboral', 'personal')),
  nombre       TEXT NOT NULL,
  telefono     TEXT,
  empresa      TEXT,
  -- De dónde salió: «hoja de vida», «carta laboral», «la dio por WhatsApp»…
  origen       TEXT,
  -- Con quién se habló al validarla y qué dijo.
  hablo_con    TEXT,
  resultado    TEXT,
  validada_at  TIMESTAMPTZ,
  validada_por TEXT,
  registrada_por TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_referencias_proceso ON seleccion_referencias (proceso_id, created_at);

-- ── 6. Laboratorio ─────────────────────────────────────────────────────────
-- Un contacto «laboratorio» no es un aspirante: el asistente, el seguimiento y
-- la reactivación lo saltan, y lo que escribe se lee como aviso de resultados.
ALTER TABLE wa_contactos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'persona';
ALTER TABLE wa_contactos DROP CONSTRAINT IF EXISTS wa_contactos_tipo_chk;
ALTER TABLE wa_contactos ADD CONSTRAINT wa_contactos_tipo_chk CHECK (tipo IN ('persona', 'laboratorio'));

CREATE TABLE IF NOT EXISTS seleccion_avisos_laboratorio (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_mensaje_id      UUID,
  -- Nulo si no se pudo asociar a un aspirante: se asigna a mano.
  proceso_id         UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  texto              TEXT,
  nombre_leido       TEXT,
  cedula_leida       TEXT,
  fase               SMALLINT CHECK (fase IN (1, 2)),
  resultado_propuesto TEXT CHECK (resultado_propuesto IN ('apto', 'no_apto')),
  media_path         TEXT,
  estado             TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'descartado')),
  resuelto_por       TEXT,
  resuelto_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_avisos_lab_estado ON seleccion_avisos_laboratorio (estado, created_at DESC);

-- ── 7. Consumos (costo del asistente) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS seleccion_consumos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id      UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  conversacion_id UUID,
  concepto        TEXT NOT NULL CHECK (concepto IN ('asistente', 'extraccion', 'lectura', 'transcripcion', 'antecedentes', 'laboratorio', 'whatsapp')),
  proveedor       TEXT,
  modelo          TEXT,
  tokens_entrada  INTEGER NOT NULL DEFAULT 0,
  tokens_salida   INTEGER NOT NULL DEFAULT 0,
  costo_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_consumos_fecha ON seleccion_consumos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_consumos_proceso ON seleccion_consumos (proceso_id);

-- ── 8. Privilegios ─────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'seleccion_adjuntos', 'seleccion_examenes', 'seleccion_carpeta_items', 'seleccion_referencias',
    'seleccion_avisos_laboratorio', 'seleccion_consumos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

COMMENT ON TABLE seleccion_adjuntos IS 'Archivos del proceso de selección (bucket privado «seleccion»): carpeta, certificados, exámenes.';
COMMENT ON TABLE seleccion_examenes IS 'Resultado de los exámenes médicos del aspirante, por fase.';
COMMENT ON TABLE seleccion_carpeta_items IS 'Estado de cada documento de la carpeta del aspirante (lista del ajuste carpeta_items).';
COMMENT ON TABLE seleccion_referencias IS 'Referencias laborales y personales del aspirante y su validación.';
COMMENT ON TABLE seleccion_avisos_laboratorio IS 'Lo que escribe el laboratorio por WhatsApp, leído y a la espera de que una persona lo confirme.';
COMMENT ON TABLE seleccion_consumos IS 'Costo de cada llamada al modelo y de cada consulta, para el tope mensual (NF1).';

-- ── 9. Aviso en tiempo real ────────────────────────────────────────────────
-- El mismo canal del tablero: la ficha se refresca al registrar un examen, un
-- documento de la carpeta o un adjunto.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['seleccion_adjuntos', 'seleccion_examenes', 'seleccion_carpeta_items', 'seleccion_referencias'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_aviso_insert', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.procesos_avisar_tablero()',
      t || '_aviso_insert', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_aviso_update', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER UPDATE ON public.%I FOR EACH ROW WHEN (old.* IS DISTINCT FROM new.*) EXECUTE FUNCTION public.procesos_avisar_tablero()',
      t || '_aviso_update', t);
  END LOOP;
END $$;

SELECT to_regclass('public.seleccion_adjuntos') AS adjuntos,
       to_regclass('public.seleccion_examenes') AS examenes,
       to_regclass('public.seleccion_carpeta_items') AS carpeta,
       to_regclass('public.seleccion_consumos') AS consumos,
       (SELECT count(*) FROM seleccion_ajustes WHERE clave LIKE 'ant\_%') AS reglas_de_antecedentes;
