-- Accidentabilidad — Criterios objetivos capturados al reportar
-- =============================================================================
-- Datos que permiten clasificar la gravedad y poblar la matriz automáticamente,
-- además de la ciudad donde ocurrió el hecho.

CREATE TYPE accidente_lesionados AS ENUM ('ninguno', 'leves', 'incapacitantes', 'fatal');
CREATE TYPE accidente_danos AS ENUM ('menores', 'significativos', 'altos', 'perdida_total');

ALTER TABLE accidentes
  ADD COLUMN ciudad TEXT,
  ADD COLUMN lesionados accidente_lesionados,
  ADD COLUMN danos_materiales accidente_danos,
  ADD COLUMN fact_exceso_velocidad BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN fact_uso_celular BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN fact_no_distancia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN fact_fatiga BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN responsabilidad_reportada accidente_responsabilidad;
