-- novedades mensuales del conductor accidentes viajes perdidos y ausencias
--
-- Contexto: el Análisis de liquidación predice la deserción solo con lo que
-- el conductor trabaja, vende y gana. Se pidió sumar los accidentes, los
-- viajes perdidos sin justificación y las ausencias. Van en una vista aparte
-- de liquidacion_conductor_mes porque un conductor que faltó todo el mes no
-- tiene cierres pero sí ausencias y viajes perdidos: unirlas a los cierres
-- borraría justo esos meses.
--
-- Qué cuenta cada columna, por cédula y mes calendario:
--   * vp_injustificados: viajes perdidos imputables al conductor según GEMA
--     (novedad AUSENCIA CONDUCTOR, PERDIDA TURNO, PERDIDA DE VIAJE o
--     INJUSTIFICADO). No cuentan taller, varado, aprovechamiento ni "sin
--     conductor fijo", que no dependen de él, ni los de accidente, que van
--     en sus propias columnas. Desde enero de 2025.
--   * ausencias / ausencias_nj / suspensiones: registros de Ausentismo
--     (desde enero de 2026). "ausencias" son las que dependen del conductor
--     o de su salud (no justificada, permiso, incapacidad, cita EPS,
--     calamidad, suspensión, otra); no cuentan vacaciones, descansos,
--     licencias, vehículo en taller ni "renuncia" —esa es el propio retiro y
--     usarla para predecirlo sería hacer trampa—.
--   * accidentes / accidentes_responsable: accidentes de Accidentabilidad
--     (desde enero de 2024, histórico GO-R-22 incluido). Responsable si el
--     dictamen —o, a falta de dictamen, lo reportado— es directo o compartido.
--     El mes se toma en hora de Colombia.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor, así que el script debe poder ejecutarse entero de
-- una sola vez y es idempotente.

CREATE OR REPLACE VIEW novedades_conductor_mes AS
WITH vp AS (
  SELECT
    regexp_replace(cedula_conductor, '\D', '', 'g') AS cedula,
    date_trunc('month', fecha)::date AS mes,
    count(*) FILTER (
      WHERE upper(trim(novedad)) IN ('AUSENCIA CONDUCTOR', 'PERDIDA TURNO', 'PERDIDA DE VIAJE', 'INJUSTIFICADO')
    )::int AS vp_injustificados
  FROM viajes_perdidos
  WHERE cedula_conductor IS NOT NULL
  GROUP BY 1, 2
),
au AS (
  SELECT
    regexp_replace(cedula, '\D', '', 'g') AS cedula,
    date_trunc('month', fecha)::date AS mes,
    count(*) FILTER (
      WHERE tipo IN ('no_justificada', 'permiso', 'incapacidad', 'eps', 'calamidad', 'suspension', 'otra')
    )::int AS ausencias,
    count(*) FILTER (WHERE tipo = 'no_justificada')::int AS ausencias_nj,
    count(*) FILTER (WHERE tipo = 'suspension')::int AS suspensiones
  FROM ausentismo_registros
  GROUP BY 1, 2
),
ac AS (
  SELECT
    regexp_replace(a.conductor_cedula, '\D', '', 'g') AS cedula,
    date_trunc('month', a.fecha_accidente AT TIME ZONE 'America/Bogota')::date AS mes,
    count(*)::int AS accidentes,
    count(*) FILTER (
      WHERE COALESCE(e.responsabilidad::text, a.responsabilidad_reportada::text) IN ('directo', 'compartido')
    )::int AS accidentes_responsable
  FROM accidentes a
  LEFT JOIN accidente_evaluaciones e ON e.accidente_id = a.id
  WHERE a.conductor_cedula IS NOT NULL
  GROUP BY 1, 2
),
todo AS (
  SELECT cedula, mes, vp_injustificados, 0 AS ausencias, 0 AS ausencias_nj, 0 AS suspensiones, 0 AS accidentes, 0 AS accidentes_responsable FROM vp
  UNION ALL
  SELECT cedula, mes, 0, ausencias, ausencias_nj, suspensiones, 0, 0 FROM au
  UNION ALL
  SELECT cedula, mes, 0, 0, 0, 0, accidentes, accidentes_responsable FROM ac
)
SELECT
  cedula,
  mes,
  sum(vp_injustificados)::int AS vp_injustificados,
  sum(ausencias)::int AS ausencias,
  sum(ausencias_nj)::int AS ausencias_nj,
  sum(suspensiones)::int AS suspensiones,
  sum(accidentes)::int AS accidentes,
  sum(accidentes_responsable)::int AS accidentes_responsable
FROM todo
WHERE cedula <> ''
GROUP BY cedula, mes
HAVING sum(vp_injustificados) + sum(ausencias) + sum(accidentes) > 0;

COMMENT ON VIEW novedades_conductor_mes IS
  'Novedades por conductor (cédula) y mes: viajes perdidos imputables al conductor (desde 2025), ausencias de Ausentismo (desde 2026) y accidentes (desde 2024). Fuente del Análisis de liquidación.';

REVOKE ALL ON novedades_conductor_mes FROM anon, authenticated, public;
GRANT SELECT ON novedades_conductor_mes TO service_role;
