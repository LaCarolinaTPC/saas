-- Conceptos reales de mantenimiento
--
-- La migración 049 precargó siete conceptos inventados (Carrocería/Golpes,
-- Vidrios/Espejos, Motor/Mecánica, Llantas/Frenos, Sistema Eléctrico,
-- Interior/Asientos y Otro) que no corresponden a cómo reporta la operación.
--
-- El sistema en producción del que sale este módulo (Da-o_Busetas, proyecto
-- Supabase lqeddrpbwunzcyjxuiei) usa quince categorías mecánicas, y así se han
-- clasificado los 55 reportes existentes. No homologan con las siete: por
-- ejemplo "Llantas/Frenos" mezclaría FRENOS, que es casi la mitad de los
-- reportes y tiene su propio módulo de graduación, con LLANTAS, que tiene uno.
--
-- Se reemplazan por los quince reales. Es seguro hacerlo por sustitución
-- porque mantenimiento_reportes y mantenimiento_alertas están vacías; una vez
-- haya reportes, cambiar un concepto exige homologar sus filas.

-- Guarda: si ya hay reportes, la sustitución perdería su clasificación.
DO $$
DECLARE
  n_reportes BIGINT;
  n_alertas BIGINT;
BEGIN
  SELECT count(*) INTO n_reportes FROM mantenimiento_reportes;
  SELECT count(*) INTO n_alertas FROM mantenimiento_alertas;
  IF n_reportes > 0 OR n_alertas > 0 THEN
    RAISE EXCEPTION
      'Hay reportes (%) o alertas (%) que referencian los conceptos actuales. Homologue sus concepto_id antes de sustituir el catálogo.',
      n_reportes, n_alertas;
  END IF;
END $$;

DELETE FROM mantenimiento_conceptos;

INSERT INTO mantenimiento_conceptos (nombre, descripcion) VALUES
  ('CAJA DE VELOCIDADES',  'Problemas en ingreso de cambios y ruidos anormales'),
  ('DIRECCION',            'Sistema de dirección'),
  ('ELECTRICO (Otros)',    'Toda falla eléctrica diferente a luces'),
  ('EMBRAGUE',             'Anomalías en sistema de embrague'),
  ('FRENOS',               'Sistema de frenos'),
  ('FUGA DE AIRE',         'Fugas de aire por mangueras y diafragmas'),
  ('FUGAS DE ACEITE',      'Reporte de fugas de aceite'),
  ('LLANTAS',              'Desgaste en llantas y daños'),
  ('LUCES DELANTERAS',     'Fallas en luces delanteras'),
  ('LUCES DIRECCIONALES',  'Falla en luces direccionales'),
  ('LUCES INTERNAS',       'Fallas en luces internas'),
  ('LUCES TRASERAS',       'Fallas en luces traseras'),
  ('MOTOR',                'Ruidos anormales y perdida de potencia'),
  ('SUSPENSION',           'Muelles, barras estabilizadoras y amortiguadores'),
  ('TRANSMISION',          'Ruidos anormales en transmisión')
ON CONFLICT (nombre) DO UPDATE
  SET descripcion = EXCLUDED.descripcion,
      activo = true;
