-- sst profesiograma editable
--
-- Contexto. La periodicidad de los exámenes periódicos por cargo (el
-- profesiograma de la ARL) estaba fija en el código
-- (src/lib/sst/profesiograma.ts). SST necesita actualizarla cuando la ARL
-- entregue un profesiograma nuevo o cuando cambie un cargo, sin esperar un
-- despliegue. Se pidió poder subir el Excel nuevo y editar cargos a mano.
--
-- Qué hace:
--   1. sst_profesiograma: un cargo por empresa con su periodicidad (meses) y
--      su proceso (admon = administrativo, admon_oper = administrativo-
--      operativo, oper = operativo). Se siembra con el profesiograma del
--      05/10/2025 (el mismo de la constante del código).
--   2. sst_profesiograma_cargas: bitácora de cada versión guardada (archivo
--      subido o edición a mano, quién, cuándo y qué cambió).
--   3. sst_reemplazar_profesiograma(): reemplaza la tabla completa en una sola
--      transacción y anota la carga.
--
-- Sin esta migración el módulo sigue usando la constante del código.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

-- ── 1. Cargos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sst_profesiograma (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa     TEXT NOT NULL CHECK (empresa IN ('la_carolina', 'metrorecaudo', 'anaya_giraldo')),
  cargo       TEXT NOT NULL CHECK (length(cargo) BETWEEN 1 AND 150),
  -- Cargo normalizado por la aplicación (sin tildes, signos ni erratas): evita repetidos.
  clave       TEXT NOT NULL,
  meses       INTEGER NOT NULL CHECK (meses BETWEEN 6 AND 60),
  tipo        TEXT NOT NULL CHECK (tipo IN ('admon', 'admon_oper', 'oper')),
  orden       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_sst_profesiograma_cargo UNIQUE (empresa, clave)
);

ALTER TABLE sst_profesiograma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sst_profesiograma FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sst_profesiograma TO service_role;

COMMENT ON TABLE sst_profesiograma IS
  'Profesiograma vigente: periodicidad del examen médico periódico por empresa y cargo. Se edita en Exámenes periódicos › Profesiograma.';

-- Siembra con el profesiograma del 05/10/2025 (solo si la tabla está vacía).
INSERT INTO sst_profesiograma (empresa, cargo, clave, meses, tipo, orden)
SELECT * FROM (VALUES
  ('la_carolina', 'Gerente General', 'gerente general', 36, 'admon', 1),
  ('la_carolina', 'Gerente Administrativo y Financiero', 'gerente administrativo financiero', 36, 'admon', 2),
  ('la_carolina', 'Gerente Operativo', 'gerente operativo', 36, 'admon', 3),
  ('la_carolina', 'Subgerente General', 'subgerente general', 36, 'admon', 4),
  ('la_carolina', 'Subgerente Administrativa y financiera', 'subgerente administrativo financiero', 36, 'admon', 5),
  ('la_carolina', 'Director Administrativo y Financiero', 'director administrativo financiero', 36, 'admon', 6),
  ('la_carolina', 'Director de Contabilidad', 'director contabilidad', 36, 'admon', 7),
  ('la_carolina', 'Director de analisis de datos estrategicos', 'director analisis datos estrategicos', 36, 'admon', 8),
  ('la_carolina', 'Asistente de gerencia', 'asistente gerencia', 36, 'admon', 9),
  ('la_carolina', 'Asistente Contable', 'asistente contable', 36, 'admon', 10),
  ('la_carolina', 'Gestor de Control Interno', 'gestor control interno', 36, 'admon', 11),
  ('la_carolina', 'Auxiliar de Gestion Humana', 'auxiliar gestion humana', 36, 'admon', 12),
  ('la_carolina', 'Cajero', 'cajero', 36, 'admon', 13),
  ('la_carolina', 'Asistente de Tesoreria', 'asistente tesoreria', 36, 'admon', 14),
  ('la_carolina', 'Abogado', 'abogado', 36, 'admon', 15),
  ('la_carolina', 'Auxliar de Tesoreria', 'auxiliar tesoreria', 36, 'admon', 16),
  ('la_carolina', 'Director de Getión Humana', 'director gestion humana', 36, 'admon', 17),
  ('la_carolina', 'Coordinador de Compras', 'coordinador compras', 36, 'admon', 18),
  ('la_carolina', 'Coordinador Contable', 'coordinador contable', 36, 'admon', 19),
  ('la_carolina', 'Auxiliar contable', 'auxiliar contable', 36, 'admon', 20),
  ('la_carolina', 'Coordinadora de bienestar y comunicaciones', 'coordinador bienestar comunicaciones', 36, 'admon', 21),
  ('la_carolina', 'Instructor de Conduccion', 'instructor conduccion', 36, 'admon', 22),
  ('la_carolina', 'Liquidador de Nomina', 'liquidador nomina', 36, 'admon', 23),
  ('la_carolina', 'Recepcionista', 'recepcionista', 36, 'admon', 24),
  ('la_carolina', 'Coordinadora SST', 'coordinador sst', 36, 'admon', 25),
  ('la_carolina', 'Aprendiz Sena', 'aprendiz sena', 36, 'admon', 26),
  ('la_carolina', 'Mensajero', 'mensajero', 24, 'admon_oper', 27),
  ('la_carolina', 'Inspector de Patio', 'inspector patio', 24, 'admon_oper', 28),
  ('la_carolina', 'Supervisor de Mantenimiento', 'supervisor mantenimiento', 24, 'admon_oper', 29),
  ('la_carolina', 'Inspector de lavado de busetas', 'inspector lavado busetas', 24, 'admon_oper', 30),
  ('la_carolina', 'Auxiliar de ruta', 'auxiliar ruta', 12, 'oper', 31),
  ('la_carolina', 'Director Operativo', 'director operativo', 24, 'admon_oper', 32),
  ('la_carolina', 'Coordinador Operativo', 'coordinador operativo', 24, 'admon_oper', 33),
  ('la_carolina', 'Auxiliar Operativo', 'auxiliar operativo', 24, 'admon_oper', 34),
  ('la_carolina', 'Auxiliar de almacen', 'auxiliar almacen', 24, 'admon_oper', 35),
  ('la_carolina', 'Asistente Operativo', 'asistente operativo', 36, 'admon', 36),
  ('la_carolina', 'Auxiliar de Mantenimiento', 'auxiliar mantenimiento', 12, 'oper', 37),
  ('la_carolina', 'Tecnico electrico de Sensor y camaras', 'tecnico electrico sensor camaras', 12, 'oper', 38),
  ('la_carolina', 'Tecnico electrico de Sensor', 'tecnico electrico sensor', 12, 'oper', 39),
  ('la_carolina', 'Aprendiz sistemas', 'aprendiz sistemas', 12, 'oper', 40),
  ('la_carolina', 'Director de mantenimiento', 'director mantenimiento', 12, 'oper', 41),
  ('la_carolina', 'Conductor -  Cobrador', 'conductor cobrador', 12, 'oper', 42),
  ('la_carolina', 'Auxliar de Oficios Varios -oficina', 'auxiliar oficios varios oficina', 12, 'oper', 43),
  ('la_carolina', 'Auxliar de oficios Varios-Patio', 'auxiliar oficios varios patio', 12, 'oper', 44),
  ('metrorecaudo', 'Gerente General', 'gerente general', 36, 'admon', 1),
  ('metrorecaudo', 'Gerente Administrativo', 'gerente administrativo', 36, 'admon', 2),
  ('metrorecaudo', 'Director administrativo y financiero', 'director administrativo financiero', 36, 'admon', 3),
  ('metrorecaudo', 'Cajero', 'cajero', 36, 'admon', 4),
  ('metrorecaudo', 'Asistente de Tesoreria', 'asistente tesoreria', 36, 'admon', 5),
  ('metrorecaudo', 'Auxliar de Tesoreria', 'auxiliar tesoreria', 36, 'admon', 6),
  ('anaya_giraldo', 'Gerente General', 'gerente general', 36, 'admon', 1),
  ('anaya_giraldo', 'Gerente Administrativo', 'gerente administrativo', 36, 'admon', 2),
  ('anaya_giraldo', 'Asistente administrativa y contable', 'asistente administrativo contable', 36, 'admon', 3),
  ('anaya_giraldo', 'Vigilante', 'vigilante', 12, 'oper', 4),
  ('anaya_giraldo', 'Escolta', 'escolta', 12, 'oper', 5)
) AS v(empresa, cargo, clave, meses, tipo, orden)
WHERE NOT EXISTS (SELECT 1 FROM sst_profesiograma);

-- ── 2. Bitácora de cargas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sst_profesiograma_cargas (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origen              TEXT NOT NULL CHECK (origen IN ('archivo', 'edicion', 'siembra')),
  archivo             TEXT,
  -- Fecha de actualización que trae el documento (FECHA DE ACTUALIZACION).
  fecha_documento     DATE,
  cargos              INTEGER NOT NULL,
  -- [{empresa, cargo, antes, despues}] de compararProfesiogramas.
  cambios             JSONB NOT NULL DEFAULT '[]'::jsonb,
  personas_aplicadas  INTEGER NOT NULL DEFAULT 0,
  usuario_email       TEXT,
  cargado_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sst_profesiograma_cargas_fecha ON sst_profesiograma_cargas (cargado_at DESC);

ALTER TABLE sst_profesiograma_cargas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sst_profesiograma_cargas FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sst_profesiograma_cargas TO service_role;

INSERT INTO sst_profesiograma_cargas (origen, archivo, fecha_documento, cargos, usuario_email)
SELECT 'siembra', 'PROFESIOGRAMA DE METROPO TRANSP-METRORECAUDOS-ANAYA GIRALDO ALINEADO A PROC REINTEGRO LAB.xlsx', DATE '2025-10-05',
       (SELECT count(*) FROM sst_profesiograma), 'migracion'
WHERE NOT EXISTS (SELECT 1 FROM sst_profesiograma_cargas);

-- ── 3. Reemplazo atómico ───────────────────────────────────────────────────
-- p_filas: [{empresa, cargo, clave, meses, tipo, orden}, …]. Borra y vuelve a
-- insertar todo en la misma transacción: o queda la versión nueva completa o
-- queda la anterior. Devuelve el id de la carga.
CREATE OR REPLACE FUNCTION sst_reemplazar_profesiograma(
  p_filas     JSONB,
  p_origen    TEXT,
  p_archivo   TEXT,
  p_fecha     DATE,
  p_cambios   JSONB,
  p_usuario   TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'El profesiograma no tiene cargos.';
  END IF;
  DELETE FROM sst_profesiograma;
  INSERT INTO sst_profesiograma (empresa, cargo, clave, meses, tipo, orden)
  SELECT f->>'empresa', f->>'cargo', f->>'clave', (f->>'meses')::int, f->>'tipo', COALESCE((f->>'orden')::int, 0)
    FROM jsonb_array_elements(p_filas) AS f;
  INSERT INTO sst_profesiograma_cargas (origen, archivo, fecha_documento, cargos, cambios, usuario_email)
  VALUES (p_origen, p_archivo, p_fecha, jsonb_array_length(p_filas), COALESCE(p_cambios, '[]'::jsonb), p_usuario)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION sst_reemplazar_profesiograma(JSONB, TEXT, TEXT, DATE, JSONB, TEXT) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION sst_reemplazar_profesiograma(JSONB, TEXT, TEXT, DATE, JSONB, TEXT) TO service_role;
