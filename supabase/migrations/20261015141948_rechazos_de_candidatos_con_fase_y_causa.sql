-- rechazos de candidatos con fase y causa
--
-- Contexto: un candidato podía pasar a "Rechazado" (Kanban, tabla) o a
-- "Cierre de proceso" (Procesos de contratación) sin causa, y la fase en que
-- estaba solo quedaba, a veces, en stage_history: Procesos no escribe
-- historial y contratar o borrar un candidato lo destruye. Reclutamiento
-- necesita saber en qué fase se pierde a los candidatos y por qué.
--
-- causas_rechazo: catálogo vivo. Las 9 causas que ya usaba Procesos son la
-- base; al elegir "Otra" la persona escribe una causa nueva que queda en el
-- catálogo para los rechazos siguientes. nombre_normalizado (minúsculas, sin
-- tildes ni espacios repetidos) evita duplicados como "Desistió"/"desistio".
-- La aplicación normaliza igual (src/lib/rechazos/causas.ts).
--
-- rechazos_candidato: una fila por rechazo, con la fase de origen, la causa
-- y una copia de nombre, cédula y vacante para que el registro sobreviva si
-- el candidato se contrata o se borra. Si el candidato se reactiva, la fila
-- no se borra: se marca revertido_at y deja de contar en el reporte.
--
-- Al final se cargan los rechazos que ya existían (origen 'historico'): la
-- fase sale de stage_history cuando hay rastro; si no, queda en null y el
-- reporte la muestra como "Sin dato". No se infiere de las fechas.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

CREATE TABLE IF NOT EXISTS causas_rechazo (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             text NOT NULL,
  nombre_normalizado text NOT NULL,
  base               boolean NOT NULL DEFAULT false,
  orden              int NOT NULL DEFAULT 1000,
  activo             boolean NOT NULL DEFAULT true,
  creado_por_email   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT causas_rechazo_nombre_largo CHECK (length(nombre) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_causas_rechazo_normalizado
  ON causas_rechazo (nombre_normalizado);

COMMENT ON TABLE causas_rechazo IS
  'Catálogo de causas de rechazo de candidatos. base=true son las 9 iniciales; las demás las crean los usuarios con "Otra" y quedan disponibles para los rechazos siguientes.';

CREATE TABLE IF NOT EXISTS rechazos_candidato (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id         uuid REFERENCES candidates(id) ON DELETE SET NULL,
  vacancy_id           uuid REFERENCES vacancies(id) ON DELETE SET NULL,
  candidate_vacancy_id uuid REFERENCES candidate_vacancy(id) ON DELETE SET NULL,
  proceso_id           uuid REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  -- Copia al momento del rechazo: sobrevive a contratar o borrar el candidato.
  nombre               text,
  cedula               text,
  vacante              text,
  -- Clave y nombre de la etapa del pipeline en que estaba; null = sin dato.
  fase_origen          text,
  fase_origen_label    text,
  causa_id             uuid REFERENCES causas_rechazo(id),
  causa                text,
  nota                 text,
  origen               text NOT NULL,
  registrado_por_email text,
  registrado_at        timestamptz NOT NULL DEFAULT now(),
  revertido_at         timestamptz,
  revertido_por_email  text,
  revertido_a_fase     text,
  CONSTRAINT rechazos_candidato_origen CHECK (origen IN ('pipeline', 'tabla', 'procesos', 'historico')),
  -- Todo rechazo nuevo lleva causa; solo los cargados del histórico pueden no tenerla.
  CONSTRAINT rechazos_candidato_causa CHECK (causa_id IS NOT NULL OR origen = 'historico'),
  CONSTRAINT rechazos_candidato_nota_largo CHECK (nota IS NULL OR length(nota) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_rechazos_candidato_fecha ON rechazos_candidato (registrado_at);
CREATE INDEX IF NOT EXISTS idx_rechazos_candidato_cand_vac ON rechazos_candidato (candidate_id, vacancy_id);
CREATE INDEX IF NOT EXISTS idx_rechazos_candidato_causa ON rechazos_candidato (causa_id);

COMMENT ON TABLE rechazos_candidato IS
  'Un registro por rechazo de candidato: fase del pipeline en que estaba, causa, nota, quién y por dónde. revertido_at marca los que se reactivaron.';

ALTER TABLE causas_rechazo ENABLE ROW LEVEL SECURITY;
ALTER TABLE rechazos_candidato ENABLE ROW LEVEL SECURITY;
GRANT ALL ON causas_rechazo TO service_role;
GRANT ALL ON rechazos_candidato TO service_role;

-- ── Causas base ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.norm_causa(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $norm$
  SELECT regexp_replace(
    translate(lower(btrim(t)), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
    '\s+', ' ', 'g')
$norm$;

INSERT INTO causas_rechazo (nombre, nombre_normalizado, base, orden, creado_por_email)
SELECT c.nombre, pg_temp.norm_causa(c.nombre), true, c.orden, 'migracion'
FROM (VALUES
  ('No se ajusta al perfil', 1),
  ('Desistimiento', 2),
  ('Incomunicado', 3),
  ('Exámenes médicos', 4),
  ('No aprobado reintegro', 5),
  ('Proceso psicotécnico', 6),
  ('No pasó prueba de manejo', 7),
  ('Laborando en otra empresa', 8),
  ('Deuda SIMIT', 9)
) AS c(nombre, orden)
ON CONFLICT (nombre_normalizado) DO NOTHING;

-- Las causas escritas a mano en Procesos entran al catálogo tal cual.
INSERT INTO causas_rechazo (nombre, nombre_normalizado, base, creado_por_email)
SELECT min(left(btrim(p.causa_no_contrato), 80)), pg_temp.norm_causa(left(p.causa_no_contrato, 80)), false, 'migracion'
FROM procesos_contratacion p
WHERE p.estado = 'cierre' AND btrim(coalesce(p.causa_no_contrato, '')) <> ''
GROUP BY pg_temp.norm_causa(left(p.causa_no_contrato, 80))
ON CONFLICT (nombre_normalizado) DO NOTHING;

-- ── Histórico ───────────────────────────────────────────────────────────────

-- Último paso a una etapa "perdido" de cada candidato-vacante, con la fase de la que venía.
DROP TABLE IF EXISTS tmp_ultimo_rechazo;
CREATE TEMP TABLE tmp_ultimo_rechazo AS
SELECT DISTINCT ON (sh.candidate_vacancy_id)
  sh.candidate_vacancy_id, sh.from_stage, sh.created_at
FROM stage_history sh
JOIN pipeline_stages ps ON ps.key = sh.to_stage AND ps.tipo = 'perdido'
ORDER BY sh.candidate_vacancy_id, sh.created_at DESC;

-- 1) Procesos en cierre.
INSERT INTO rechazos_candidato (
  candidate_id, vacancy_id, candidate_vacancy_id, proceso_id, nombre, cedula, vacante,
  fase_origen, fase_origen_label, causa_id, causa, origen, registrado_por_email, registrado_at
)
SELECT
  p.candidate_id, p.vacancy_id, cv.id, p.id, p.nombre, p.cedula, v.title,
  ur.from_stage, fs.label, cr.id, cr.nombre, 'historico', 'migracion',
  coalesce(ur.created_at, p.updated_at)
FROM procesos_contratacion p
LEFT JOIN candidate_vacancy cv ON cv.candidate_id = p.candidate_id AND cv.vacancy_id = p.vacancy_id
LEFT JOIN tmp_ultimo_rechazo ur ON ur.candidate_vacancy_id = cv.id
LEFT JOIN pipeline_stages fs ON fs.key = ur.from_stage
LEFT JOIN vacancies v ON v.id = p.vacancy_id
LEFT JOIN causas_rechazo cr
  ON btrim(coalesce(p.causa_no_contrato, '')) <> ''
 AND cr.nombre_normalizado = pg_temp.norm_causa(left(p.causa_no_contrato, 80))
WHERE p.estado = 'cierre'
  AND NOT EXISTS (SELECT 1 FROM rechazos_candidato r WHERE r.proceso_id = p.id);

-- 2) Candidatos en una etapa "perdido" del pipeline que no vienen de un proceso ya cargado.
INSERT INTO rechazos_candidato (
  candidate_id, vacancy_id, candidate_vacancy_id, nombre, cedula, vacante,
  fase_origen, fase_origen_label, origen, registrado_por_email, registrado_at
)
SELECT
  cv.candidate_id, cv.vacancy_id, cv.id, c.full_name, c.document_number, v.title,
  ur.from_stage, fs.label, 'historico', 'migracion',
  coalesce(ur.created_at, cv.updated_at)
FROM candidate_vacancy cv
JOIN pipeline_stages ps ON ps.key = cv.current_stage AND ps.tipo = 'perdido'
LEFT JOIN candidates c ON c.id = cv.candidate_id
LEFT JOIN vacancies v ON v.id = cv.vacancy_id
LEFT JOIN tmp_ultimo_rechazo ur ON ur.candidate_vacancy_id = cv.id
LEFT JOIN pipeline_stages fs ON fs.key = ur.from_stage
WHERE NOT EXISTS (
  SELECT 1 FROM rechazos_candidato r
  WHERE r.candidate_id = cv.candidate_id AND r.vacancy_id IS NOT DISTINCT FROM cv.vacancy_id
);

-- Verificación: cuántos quedaron y cuántos sin fase o sin causa.
SELECT
  count(*)                                        AS rechazos_historicos,
  count(*) FILTER (WHERE fase_origen IS NULL)     AS sin_fase,
  count(*) FILTER (WHERE causa_id IS NULL)        AS sin_causa,
  (SELECT count(*) FROM causas_rechazo)           AS causas_en_catalogo
FROM rechazos_candidato
WHERE origen = 'historico';
