-- Graduación de frenos
--
-- Bitácora de graduación de frenos por vehículo, que el supervisor registra.
-- Es independiente de los reportes de daños: alimenta el formato controlado
-- CPA-R-31 del SGC y el indicador de vehículos sin graduación reciente.
--
-- Portado del sistema Da-o_Busetas (migración 014 de ese proyecto). Allá la
-- llave era la placa; aquí es `vehiculos.codigo`, igual que el resto del módulo
-- de Mantenimiento. Ese código es además el número interno con el que el
-- formato en papel identifica cada vehículo, así que desaparece el problema de
-- los vehículos sin número interno: la llave primaria del maestro siempre está.

CREATE TABLE IF NOT EXISTS mantenimiento_frenos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  codigo_vehiculo TEXT NOT NULL REFERENCES vehiculos(codigo),
  graduacion      BOOLEAN NOT NULL DEFAULT false,
  observacion     TEXT,
  registrado_por  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  registrado_por_email TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Si NO se realizó la graduación hay que explicar por qué. La validación del
  -- formulario se puede saltar; esta restricción no.
  CONSTRAINT chk_frenos_obs_si_no_graduo
    CHECK (graduacion = true OR observacion IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_frenos_vehiculo_fecha
  ON mantenimiento_frenos (codigo_vehiculo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_frenos_fecha
  ON mantenimiento_frenos (fecha DESC);

-- Se permite más de un registro por vehículo y día a propósito: el formulario
-- avisa sin bloquear. Si algún día estorba:
--   CREATE UNIQUE INDEX idx_frenos_unico_dia
--     ON mantenimiento_frenos (codigo_vehiculo, fecha);

-- RLS activo: la tabla se usa solo desde Server Components y Server Actions con
-- service_role, que valida antes los permisos de Gestivo. En esta instalación
-- las tablas nuevas no le conceden privilegios por defecto, hay que darlos.
ALTER TABLE mantenimiento_frenos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE mantenimiento_frenos TO service_role;

-- ── Resumen por vehículo ─────────────────────────────────────────────────────
-- Un renglón por vehículo activo, tenga o no registros. Los que nunca se han
-- graduado salen con `ultima_graduacion` y `dias_desde_ultima` en NULL: son
-- justo los que debe listar "sin graduación reciente", así que quien consuma la
-- vista tiene que tratar ese NULL como infinito, no como cero.
DROP VIEW IF EXISTS vw_frenos_resumen_vehiculo;
CREATE VIEW vw_frenos_resumen_vehiculo
WITH (security_invoker = on) AS
SELECT
  v.codigo,
  v.placa,
  COUNT(f.id)                                              AS total_registros,
  COUNT(f.id) FILTER (WHERE f.graduacion)                  AS total_graduaciones,
  MAX(f.fecha) FILTER (WHERE f.graduacion)                 AS ultima_graduacion,
  CURRENT_DATE - MAX(f.fecha) FILTER (WHERE f.graduacion)  AS dias_desde_ultima,
  COUNT(f.id) FILTER (WHERE f.observacion IS NOT NULL)     AS con_observacion
FROM vehiculos v
LEFT JOIN mantenimiento_frenos f ON f.codigo_vehiculo = v.codigo
WHERE v.estado = 1
GROUP BY v.codigo, v.placa;

REVOKE ALL   ON vw_frenos_resumen_vehiculo FROM anon, authenticated;
GRANT SELECT ON vw_frenos_resumen_vehiculo TO service_role;

-- Las fechas futuras se bloquean en el formulario y en la Server Action, no con
-- un CHECK: CURRENT_DATE no es inmutable y rompería un restore.
