-- ============================================================
-- Vincular cada proceso de contratación a una vacante.
-- Al asignar la vacante también se crea el vínculo en
-- candidate_vacancy (pipeline de candidatos por vacante).
-- ============================================================

ALTER TABLE procesos_contratacion
  ADD COLUMN IF NOT EXISTS vacancy_id UUID REFERENCES vacancies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_procesos_contratacion_vacancy
  ON procesos_contratacion(vacancy_id);
