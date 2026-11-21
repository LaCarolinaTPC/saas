-- Selección, entrega 2: agenda de citas y profesor de manejo
--
-- Contexto: la junta aprobó cuatro entregas de la selección de conductores; la
-- segunda (requerimientos D1–D4, E1, E2 y NF7) se prueba con el profesor el
-- 19-nov-2026. Hasta ahora la cita solo era una fecha suelta en el proceso
-- (sin hora, sin confirmación, sin llegada) y lo que el profesor veía en la
-- prueba de manejo, la escuela y el reconocimiento de ruta se quedaba en
-- papel. Aquí queda:
--   * la cita con fecha, hora y estado (sirve también para el laboratorio y la
--     psicotécnica de las entregas 3 y 4);
--   * lo que registra el profesor: prueba de manejo, clases de escuela (las que
--     hagan falta, una fila por clase), salidas de reconocimiento de ruta,
--     observaciones sueltas y su concepto final sobre el candidato;
--   * los días en que el profesor no puede o puede a otra hora, para que la
--     citación proponga otra fecha y se reprogramen las citas de ese día;
--   * el rol «Profesor de manejo», que solo abre su pantalla (/profesor).
--
-- Requiere las migraciones de la entrega 1 (20261113205625) y 20261118190946
-- (unidad si_no de los ajustes). Idempotente: se puede volver a ejecutar.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.

-- ── 1. Citas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seleccion_citas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id       UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL DEFAULT 'prueba_manejo'
                   CHECK (tipo IN ('prueba_manejo', 'examen_f1', 'examen_f2', 'psicotecnica')),
  fecha            DATE NOT NULL,
  hora             TIME NOT NULL,
  estado           TEXT NOT NULL DEFAULT 'programada'
                   CHECK (estado IN ('programada', 'confirmada', 'pide_otra_fecha', 'asistio', 'no_asistio', 'reprogramada', 'cancelada')),
  -- Quién pidió moverla: las de la empresa (el profesor no pudo) no cuentan
  -- contra el máximo de reprogramaciones del aspirante.
  reprogramada_por TEXT CHECK (reprogramada_por IN ('aspirante', 'empresa')),
  confirmada_at    TIMESTAMPTZ,
  llego_at         TIMESTAMPTZ,
  -- Pasos automáticos ya hechos (el cron los reserva con un UPDATE condicional).
  recordatorio_at  TIMESTAMPTZ,
  alerta_at        TIMESTAMPTZ,
  inasistencia_at  TIMESTAMPTZ,
  creada_por       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_citas_fecha ON seleccion_citas (fecha, tipo);
CREATE INDEX IF NOT EXISTS idx_sel_citas_proceso ON seleccion_citas (proceso_id, created_at DESC);

ALTER TABLE seleccion_citas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_citas FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE seleccion_citas TO service_role;
COMMENT ON TABLE seleccion_citas IS
  'Citas del proceso de selección (prueba de manejo; laboratorio y psicotécnica desde las entregas 3 y 4), con hora, confirmación y llegada.';

-- ── 2. Lo que registra el profesor ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seleccion_pruebas_manejo (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id          UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  cita_id             UUID REFERENCES seleccion_citas(id) ON DELETE SET NULL,
  fecha               DATE NOT NULL,
  resultado           TEXT NOT NULL CHECK (resultado IN ('aprobo', 'escuela', 'no_continua')),
  prueba_ruta_escrita TEXT CHECK (prueba_ruta_escrita IN ('si', 'no', 'sin_tomar')),
  prueba_partes_motor TEXT CHECK (prueba_partes_motor IN ('si', 'no', 'sin_tomar')),
  clases_sugeridas    SMALLINT,
  observacion         TEXT,
  profesor_id         UUID,
  profesor_email      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_pruebas_proceso ON seleccion_pruebas_manejo (proceso_id, created_at DESC);

-- Una fila por clase, sin tope: un aspirante puede tener varias, incluso el mismo día.
CREATE TABLE IF NOT EXISTS seleccion_clases_escuela (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id     UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL,
  resultado      TEXT NOT NULL CHECK (resultado IN ('sigue', 'listo', 'no_continua')),
  observacion    TEXT,
  profesor_id    UUID,
  profesor_email TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_clases_proceso ON seleccion_clases_escuela (proceso_id, created_at DESC);

-- Salidas de reconocimiento de ruta: varias por aspirante y por ruta. La ruta
-- cuenta como aprendida con al menos una salida «aprendida».
CREATE TABLE IF NOT EXISTS seleccion_reconocimientos_ruta (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id     UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL,
  ruta           TEXT NOT NULL,
  resultado      TEXT NOT NULL CHECK (resultado IN ('aprendida', 'repetir', 'no_continua')),
  observacion    TEXT,
  profesor_id    UUID,
  profesor_email TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_rutas_proceso ON seleccion_reconocimientos_ruta (proceso_id, created_at DESC);

-- Notas libres del profesor sobre el candidato, en cualquier momento.
CREATE TABLE IF NOT EXISTS seleccion_observaciones_profesor (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proceso_id     UUID NOT NULL REFERENCES procesos_contratacion(id) ON DELETE CASCADE,
  texto          TEXT NOT NULL,
  profesor_id    UUID,
  profesor_email TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_obs_proceso ON seleccion_observaciones_profesor (proceso_id, created_at DESC);

-- Días en que el profesor no puede o puede a otra hora. Sin fila = día normal.
CREATE TABLE IF NOT EXISTS seleccion_disponibilidad_profesor (
  fecha          DATE PRIMARY KEY,
  disponible     BOOLEAN NOT NULL DEFAULT false,
  -- Con disponible = true: la hora a la que puede ese día (en vez de la normal).
  hora           TIME,
  motivo         TEXT NOT NULL DEFAULT 'otro' CHECK (motivo IN ('enfermedad', 'permiso', 'otra_hora', 'otro')),
  nota           TEXT,
  registrado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'seleccion_pruebas_manejo', 'seleccion_clases_escuela', 'seleccion_reconocimientos_ruta',
    'seleccion_observaciones_profesor', 'seleccion_disponibilidad_profesor'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', t);
  END LOOP;
END $$;

-- ── 3. Columnas del proceso ────────────────────────────────────────────────
-- Concepto final del profesor sobre el candidato.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS profesor_concepto TEXT;
ALTER TABLE procesos_contratacion DROP CONSTRAINT IF EXISTS procesos_contratacion_profesor_concepto_chk;
ALTER TABLE procesos_contratacion
  ADD CONSTRAINT procesos_contratacion_profesor_concepto_chk CHECK (profesor_concepto IN ('acepta', 'rechaza'));
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS profesor_concepto_nota TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS profesor_concepto_por TEXT;
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS profesor_concepto_at TIMESTAMPTZ;
-- Día del último recordatorio de escuela, para no repetirlo.
ALTER TABLE procesos_contratacion ADD COLUMN IF NOT EXISTS escuela_recordatorio_fecha DATE;

-- ── 4. Etapa «Antecedentes» del tablero antiguo ────────────────────────────
-- vincularCandidatoVacante ya escribe esa etapa; faltaba la fila.
UPDATE pipeline_stages SET orden = orden + 1
WHERE orden >= 2 AND NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE key = 'antecedentes');
INSERT INTO pipeline_stages (key, label, color, text_color, orden, tipo, activo)
VALUES ('antecedentes', 'Antecedentes', '#E0F2FE', '#0369A1', 2, 'normal', true)
ON CONFLICT (key) DO NOTHING;

-- ── 5. Rol del profesor ────────────────────────────────────────────────────
INSERT INTO roles (clave, nombre, descripcion, es_super, es_sistema, activo)
VALUES ('profesor_manejo', 'Profesor de manejo',
        'Registra la prueba de manejo, las clases de escuela y el reconocimiento de ruta de los aspirantes. Solo ve su pantalla.',
        false, false, true)
ON CONFLICT (clave) DO NOTHING;
INSERT INTO rol_permisos (rol, permiso) VALUES
  ('profesor_manejo', 'profesor.ver'),
  ('profesor_manejo', 'profesor.editar')
ON CONFLICT (rol, permiso) DO NOTHING;

-- ── 6. Ajustes ─────────────────────────────────────────────────────────────
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('citar_exige_antecedentes', 'regla', 'Para citar hay que tener los antecedentes resueltos', 250,
   'false'::jsonb, 'false'::jsonb, 'si_no', 'Se enciende con la entrega 3', 2),
  ('rutas_minimas', 'regla', 'Rutas que debe aprender en el reconocimiento de ruta', 255,
   '2'::jsonb, '2'::jsonb, 'numero', 'Reunión', 2)
ON CONFLICT (clave) DO NOTHING;

-- ── 7. Aviso en tiempo real ────────────────────────────────────────────────
-- El mismo canal del tablero («procesos»): la agenda, la vista del profesor y
-- el tablero se refrescan cuando cambia una cita o un registro del profesor.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'seleccion_citas', 'seleccion_pruebas_manejo', 'seleccion_clases_escuela',
    'seleccion_reconocimientos_ruta', 'seleccion_observaciones_profesor', 'seleccion_disponibilidad_profesor'
  ] LOOP
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
