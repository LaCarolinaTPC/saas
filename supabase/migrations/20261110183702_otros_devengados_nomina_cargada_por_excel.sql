-- Otros devengados: nómina cargada por Excel.
--
-- Contexto: la nómina de conductores llega a MGX (y de ahí a Gestivo) días
-- después de terminar la quincena, y Tesorería necesita entregar antes. Se
-- pidió poder cargar el listado de nómina que exporta MGX (una fila por
-- empleado y concepto) para calcular y entregar los otros devengados con esos
-- valores, y que cuando la nómina de ese período cierre en MGX se pueda
-- comparar concepto por concepto contra lo cargado. Desde el cierre en MGX
-- manda MGX; el cargue queda guardado para la comparación.
--
-- Cada cargue de un corte reemplaza al anterior (queda como 'reemplazada', no
-- se borra). Solo hay un cargue activo por corte.
--
-- Idempotente: se puede correr entero de nuevo sin efecto.

CREATE TABLE IF NOT EXISTS otros_devengados_nomina_cargas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,                       -- 'YYYY-MM'
  quincena SMALLINT NOT NULL CHECK (quincena IN (1, 2)),
  cod_per TEXT NOT NULL,                       -- período de nómina MGX que trae el archivo
  nom_per TEXT,
  archivo TEXT,
  lineas INT NOT NULL DEFAULT 0,
  empleados INT NOT NULL DEFAULT 0,
  -- 'incompleta' mientras se insertan las líneas; nunca se usa para calcular.
  estado TEXT NOT NULL DEFAULT 'incompleta' CHECK (estado IN ('incompleta', 'activa', 'reemplazada')),
  cargada_por UUID REFERENCES profiles(id),
  cargada_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reemplazada_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS otros_devengados_nomina_cargas_activa_uq
  ON otros_devengados_nomina_cargas (periodo, quincena) WHERE estado = 'activa';
CREATE INDEX IF NOT EXISTS otros_devengados_nomina_cargas_cod_per_idx
  ON otros_devengados_nomina_cargas (cod_per) WHERE estado = 'activa';

CREATE TABLE IF NOT EXISTS otros_devengados_nomina_lineas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  carga_id UUID NOT NULL REFERENCES otros_devengados_nomina_cargas(id) ON DELETE CASCADE,
  cod_epl TEXT NOT NULL,                       -- cédula del empleado
  nom_epl TEXT,
  cod_con TEXT NOT NULL,                       -- concepto de nómina
  nom_con TEXT,
  cantidad NUMERIC,
  valor NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS otros_devengados_nomina_lineas_carga_idx
  ON otros_devengados_nomina_lineas (carga_id, cod_con, cod_epl);

ALTER TABLE otros_devengados_nomina_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE otros_devengados_nomina_lineas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE otros_devengados_nomina_cargas FROM anon, authenticated;
REVOKE ALL ON TABLE otros_devengados_nomina_lineas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE otros_devengados_nomina_cargas TO service_role;
GRANT SELECT, INSERT ON TABLE otros_devengados_nomina_lineas TO service_role;

COMMENT ON TABLE otros_devengados_nomina_cargas IS
  'Cargues del listado de nómina de conductores exportado de MGX, por corte de Otros devengados. El activo se usa para calcular mientras la nómina del período no esté cerrada en MGX; después queda para comparar.';
COMMENT ON TABLE otros_devengados_nomina_lineas IS
  'Líneas (empleado × concepto) de cada cargue de nómina por Excel de Otros devengados.';
