-- source_id para la importación del sistema origen
--
-- El módulo se migra desde Da-o_Busetas (proyecto Supabase lqeddrpbwunzcyjxuiei),
-- que sigue en producción. La carga tiene que poder repetirse sin duplicar:
-- primero un ensayo, después el corte, y posiblemente un delta con lo que se
-- reportó entre medias.
--
-- `mantenimiento_reportes` ya tenía `source_id UUID UNIQUE` desde la 049 y las
-- llaves del origen son UUID, así que sirve tal cual. Faltan las otras dos
-- tablas.

ALTER TABLE mantenimiento_alertas
  ADD COLUMN IF NOT EXISTS source_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mantenimiento_alertas_source_id
  ON mantenimiento_alertas (source_id);

ALTER TABLE mantenimiento_frenos
  ADD COLUMN IF NOT EXISTS source_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mantenimiento_frenos_source_id
  ON mantenimiento_frenos (source_id);

-- El índice no necesita ser parcial: Postgres considera distintos entre sí a
-- los nulos, así que todo lo que se registre desde Gestivo, con `source_id`
-- nulo, convive sin competir por unicidad. Es el mismo comportamiento del
-- UNIQUE que la 049 ya puso en mantenimiento_reportes, y permite escribir
-- ON CONFLICT (source_id) sin repetir el predicado.

COMMENT ON COLUMN mantenimiento_alertas.source_id IS
  'Llave de la alerta en el sistema origen Da-o_Busetas. Nulo si nació en Gestivo.';
COMMENT ON COLUMN mantenimiento_frenos.source_id IS
  'Llave del registro en el sistema origen Da-o_Busetas. Nulo si nació en Gestivo.';
COMMENT ON COLUMN mantenimiento_reportes.source_id IS
  'Llave del reporte en el sistema origen Da-o_Busetas. Nulo si nació en Gestivo.';
