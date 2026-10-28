-- Métricas e incidencias de permisos
--
-- Mientras el sistema viejo y el nuevo de roles corren en paralelo, la única
-- evidencia de que el nuevo funciona era `permisos_discrepancias`: una foto
-- por usuario y día, por muestreo y de la teoría (menú y módulos). Para decidir
-- con datos cuándo apagar el viejo hace falta:
--
--  - `permisos_incidencias`: cada problema distinto (divergencia en un chequeo
--    real, denegación, error leyendo permisos, usuario sin perfil o sin rol),
--    deduplicado por huella, con cuántas veces pasó y un estado de revisión.
--    Si algo marcado como resuelto vuelve a pasar, se reabre solo.
--  - `permisos_metricas_dia`: contadores por día, motor, origen y permiso
--    (chequeos, coincidencias, perdidos, ganados, denegados) para el % de
--    coincidencia sin guardar cada chequeo.
--  - `registrar_permisos_eventos(jsonb)`: la aplicación vuelca todo lo de una
--    petición en una sola llamada, con incrementos atómicos.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero e
-- idempotente. Las tablas nuevas no heredan privilegios: GRANT a service_role.

CREATE TABLE IF NOT EXISTS permisos_incidencias (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  huella TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'divergencia_perdido', 'divergencia_ganado', 'denegado',
    'error_lectura', 'error_lectura_nuevo', 'sin_perfil', 'sin_tipo', 'sombra_teorica'
  )),
  severidad TEXT NOT NULL CHECK (severidad IN ('alta', 'media', 'baja')),
  user_id UUID,
  email TEXT,
  rol_viejo TEXT,
  roles_nuevos TEXT[] NOT NULL DEFAULT '{}',
  clave TEXT NOT NULL,
  origen TEXT NOT NULL,
  ruta TEXT,
  viejo BOOLEAN,
  nuevo BOOLEAN,
  motor TEXT,
  primera_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
  veces BIGINT NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'revisada', 'resuelta', 'ignorada')),
  nota TEXT,
  revisado_por TEXT,
  revisado_at TIMESTAMPTZ,
  detalle JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_permisos_incidencias_ultima ON permisos_incidencias (ultima_vez DESC);
CREATE INDEX IF NOT EXISTS idx_permisos_incidencias_tipo_estado ON permisos_incidencias (tipo, estado);
CREATE INDEX IF NOT EXISTS idx_permisos_incidencias_user ON permisos_incidencias (user_id);

CREATE TABLE IF NOT EXISTS permisos_metricas_dia (
  dia DATE NOT NULL,
  motor TEXT NOT NULL,
  origen TEXT NOT NULL,
  clave TEXT NOT NULL,
  chequeos BIGINT NOT NULL DEFAULT 0,
  -- Chequeos en los que también se evaluó el otro sistema.
  comparados BIGINT NOT NULL DEFAULT 0,
  coinciden BIGINT NOT NULL DEFAULT 0,
  perdidos BIGINT NOT NULL DEFAULT 0,
  ganados BIGINT NOT NULL DEFAULT 0,
  denegados BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, motor, origen, clave)
);

CREATE INDEX IF NOT EXISTS idx_permisos_metricas_dia ON permisos_metricas_dia (dia);

-- Totales por día y motor, para la tendencia de la pantalla Sistema.
CREATE OR REPLACE VIEW permisos_metricas_por_dia AS
SELECT
  dia,
  motor,
  SUM(chequeos)::BIGINT AS chequeos,
  SUM(comparados)::BIGINT AS comparados,
  SUM(coinciden)::BIGINT AS coinciden,
  SUM(perdidos)::BIGINT AS perdidos,
  SUM(ganados)::BIGINT AS ganados,
  SUM(denegados)::BIGINT AS denegados
FROM permisos_metricas_dia
GROUP BY dia, motor;

ALTER TABLE permisos_incidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos_metricas_dia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON permisos_incidencias, permisos_metricas_dia, permisos_metricas_por_dia FROM anon, authenticated, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE permisos_incidencias, permisos_metricas_dia TO service_role;
GRANT SELECT ON permisos_metricas_por_dia TO service_role;

-- Vuelca lo de una petición: {"incidencias": [...], "metricas": [...]}.
-- Las filas ya vienen agrupadas por la aplicación (src/lib/permisos/incidencias.ts).
CREATE OR REPLACE FUNCTION registrar_permisos_eventos(eventos JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO permisos_incidencias AS i (
    huella, tipo, severidad, user_id, email, rol_viejo, roles_nuevos, clave, origen, ruta,
    viejo, nuevo, motor, primera_vez, ultima_vez, veces, detalle
  )
  SELECT
    e->>'huella',
    e->>'tipo',
    e->>'severidad',
    NULLIF(e->>'user_id', '')::UUID,
    e->>'email',
    e->>'rol_viejo',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(e->'roles_nuevos', '[]'::JSONB))), '{}'),
    e->>'clave',
    e->>'origen',
    e->>'ruta',
    (e->>'viejo')::BOOLEAN,
    (e->>'nuevo')::BOOLEAN,
    e->>'motor',
    now(),
    now(),
    GREATEST(COALESCE((e->>'veces')::BIGINT, 1), 1),
    COALESCE(e->'detalle', '{}'::JSONB)
  FROM jsonb_array_elements(COALESCE(eventos->'incidencias', '[]'::JSONB)) AS e
  ON CONFLICT (huella) DO UPDATE SET
    veces = i.veces + EXCLUDED.veces,
    ultima_vez = now(),
    email = COALESCE(EXCLUDED.email, i.email),
    rol_viejo = COALESCE(EXCLUDED.rol_viejo, i.rol_viejo),
    roles_nuevos = EXCLUDED.roles_nuevos,
    ruta = COALESCE(EXCLUDED.ruta, i.ruta),
    viejo = EXCLUDED.viejo,
    nuevo = EXCLUDED.nuevo,
    motor = EXCLUDED.motor,
    detalle = EXCLUDED.detalle,
    -- Lo resuelto que vuelve a pasar se reabre; lo ignorado sigue ignorado.
    estado = CASE WHEN i.estado = 'resuelta' THEN 'abierta' ELSE i.estado END;

  INSERT INTO permisos_metricas_dia AS m (dia, motor, origen, clave, chequeos, comparados, coinciden, perdidos, ganados, denegados)
  SELECT
    (e->>'dia')::DATE,
    e->>'motor',
    e->>'origen',
    e->>'clave',
    COALESCE((e->>'chequeos')::BIGINT, 0),
    COALESCE((e->>'comparados')::BIGINT, 0),
    COALESCE((e->>'coinciden')::BIGINT, 0),
    COALESCE((e->>'perdidos')::BIGINT, 0),
    COALESCE((e->>'ganados')::BIGINT, 0),
    COALESCE((e->>'denegados')::BIGINT, 0)
  FROM jsonb_array_elements(COALESCE(eventos->'metricas', '[]'::JSONB)) AS e
  ON CONFLICT (dia, motor, origen, clave) DO UPDATE SET
    chequeos = m.chequeos + EXCLUDED.chequeos,
    comparados = m.comparados + EXCLUDED.comparados,
    coinciden = m.coinciden + EXCLUDED.coinciden,
    perdidos = m.perdidos + EXCLUDED.perdidos,
    ganados = m.ganados + EXCLUDED.ganados,
    denegados = m.denegados + EXCLUDED.denegados;
END;
$$;

REVOKE ALL ON FUNCTION registrar_permisos_eventos(JSONB) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION registrar_permisos_eventos(JSONB) TO service_role;
