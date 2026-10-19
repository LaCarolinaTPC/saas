-- Marcaciones del biométrico (ZKAccess 3.5) en Gestivo
--
-- El biométrico de la entrada corre sobre ZKAccess 3.5 con una base Access
-- (`Access.mdb`) en un PC de la red interna. Cada verificación válida de huella
-- queda en `acc_monitor_log` con `event_type = 14`: 215.698 desde 2022-06-23,
-- unas 120 por día hábil, de un solo punto («Entrada-1», sin distinguir entrada
-- de salida).
--
-- Hasta hoy Gestivo no sabía quién vino. El módulo de Ausentismo es por
-- excepción: una fila en `ausentismo_registros` existe solo porque alguien la
-- registró a mano. Con estas marcaciones, RRHH ve cada día quién debía venir y
-- no marcó, y registra la novedad desde ahí. **Nada se crea solo**: las rachas
-- de descargos (4 días) y terminación (5) cuentan días calendario, así que
-- convertir «no marcó» en falta automática inventaría ausencias en los
-- descansos.
--
-- Gestivo corre en Vercel y no alcanza la red interna, así que el PC **empuja**:
-- una aplicación de bandeja (ops/agente-biometrico) consulta
-- `GET /api/biometrico/estado`, lee de la base lo que tenga `id` mayor y lo
-- manda a `POST /api/biometrico/marcaciones`. La marca de avance vive aquí, no
-- en el PC: una corrida que muere a mitad no deja nada adelantado y la carga
-- histórica es reanudable.
--
-- Tres tablas:
--   biometrico_personas     espejo de USERINFO (pin -> cédula), para atribuir
--   biometrico_marcaciones  una fila por verificación, llave `id_zk`
--   biometrico_envios       bitácora de cada envío del agente
--
-- La cédula sale de `USERINFO.SSN`, que se llenó con la cédula de Gestivo en el
-- trabajo del 2026-10-19 (ver docs/biometrico-identificacion.md). El badge NO
-- sirve como llave entre sistemas: de 732 cruces seguros, cero coinciden con
-- `conductores.codigo` ni con `employees.gema_codigo`.
--
-- Se puede correr entero más de una vez.

-- =============================================================================
-- 1. Personas del equipo (espejo de USERINFO)
-- =============================================================================
CREATE TABLE IF NOT EXISTS biometrico_personas (
  -- USERINFO.Badgenumber: la llave del equipo. Texto porque en el MDB lo es.
  pin TEXT PRIMARY KEY,
  userid INTEGER,
  -- USERINFO.SSN normalizado a solo dígitos. NULL cuando el equipo trae "0"
  -- (46 personas que se descartaron a propósito por estar retiradas).
  cedula TEXT,
  nombre TEXT,
  apellido TEXT,
  -- USERINFO.DEFAULTDEPTID: 47 Administrativo, 48 Operativo.
  departamento_id INTEGER,
  -- false cuando el pin dejó de venir en el snapshot: lo borraron del equipo.
  activo_en_zk BOOLEAN NOT NULL DEFAULT true,
  visto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS biometrico_personas_cedula_idx
  ON biometrico_personas (cedula) WHERE cedula IS NOT NULL;

COMMENT ON TABLE biometrico_personas IS
  'Espejo de USERINFO del biométrico ZKAccess: traduce el pin del equipo a la cédula de Gestivo. Se reemplaza en cada envío del agente.';
COMMENT ON COLUMN biometrico_personas.cedula IS
  'USERINFO.SSN con solo dígitos; NULL si el equipo trae "0" o vacío. Diez cédulas están en dos pines (persona enrolada dos veces): es legítimo.';
COMMENT ON COLUMN biometrico_personas.activo_en_zk IS
  'false cuando el pin dejó de aparecer en el snapshot de USERINFO. Sirve para notar un badge reasignado a otra persona.';

-- =============================================================================
-- 2. Bitácora de envíos del agente
-- =============================================================================
CREATE TABLE IF NOT EXISTS biometrico_envios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Nombre del PC + versión del agente, como lo manda él mismo.
  agente TEXT,
  ip TEXT,
  desde_id BIGINT,
  hasta_id BIGINT,
  recibidas INTEGER NOT NULL DEFAULT 0,
  -- Las que de verdad se insertaron; el resto ya estaban (reenvío inofensivo).
  nuevas INTEGER NOT NULL DEFAULT 0,
  repetidas INTEGER NOT NULL DEFAULT 0,
  personas INTEGER NOT NULL DEFAULT 0,
  personas_cambiadas INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  duracion_ms INTEGER
);

CREATE INDEX IF NOT EXISTS biometrico_envios_recibido_idx
  ON biometrico_envios (recibido_at DESC);

COMMENT ON TABLE biometrico_envios IS
  'Un registro por llamada del agente del biométrico. La pantalla de Marcaciones lo usa para avisar si el agente dejó de reportar.';

-- =============================================================================
-- 3. Marcaciones
-- =============================================================================
CREATE TABLE IF NOT EXISTS biometrico_marcaciones (
  -- acc_monitor_log.id: autonumérico, monótono y nunca reutilizado. Es la llave
  -- natural y la marca de avance del agente: reenviar no duplica.
  id_zk BIGINT PRIMARY KEY,
  pin TEXT NOT NULL,
  -- Hora local del equipo (Bogotá, UTC-5 sin horario de verano) con su offset.
  momento TIMESTAMPTZ NOT NULL,
  -- Día operativo = fecha local de la marcación. No es columna generada porque
  -- `AT TIME ZONE` no es IMMUTABLE; se calcula al ingresar.
  fecha DATE NOT NULL,
  device_id INTEGER,
  device_name TEXT,
  device_sn TEXT,
  -- acc_monitor_log.verified: 6 = huella.
  verificado INTEGER,
  -- acc_monitor_log.event_point_name, p. ej. "Entrada-1".
  punto TEXT,
  -- Resuelta por pin al ingresar y re-resuelta cuando cambia el espejo de
  -- personas (el SSN del equipo se llenó después de las primeras marcaciones).
  cedula TEXT,
  envio_id UUID REFERENCES biometrico_envios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La consulta de la pantalla: las marcaciones de un día por persona.
CREATE INDEX IF NOT EXISTS biometrico_marcaciones_fecha_cedula_idx
  ON biometrico_marcaciones (fecha, cedula);
CREATE INDEX IF NOT EXISTS biometrico_marcaciones_pin_momento_idx
  ON biometrico_marcaciones (pin, momento);
-- «Última marcación conocida» de quien no marcó hoy.
CREATE INDEX IF NOT EXISTS biometrico_marcaciones_cedula_momento_idx
  ON biometrico_marcaciones (cedula, momento DESC) WHERE cedula IS NOT NULL;

COMMENT ON TABLE biometrico_marcaciones IS
  'Una fila por verificación válida de huella en el biométrico (acc_monitor_log con event_type = 14). Solo lectura desde Gestivo: las escribe el agente del PC de ZKAccess.';
COMMENT ON COLUMN biometrico_marcaciones.id_zk IS
  'acc_monitor_log.id. Llave natural: el agente pide a Gestivo el máximo y manda lo que siga, así que reenviar es inofensivo.';
COMMENT ON COLUMN biometrico_marcaciones.fecha IS
  'Día operativo: la fecha local de `momento`. Se guarda aparte porque convertir zona horaria no es inmutable y no puede ser columna generada.';
COMMENT ON COLUMN biometrico_marcaciones.cedula IS
  'Cédula de Gestivo del pin, copiada de biometrico_personas al ingresar. NULL si el equipo no tiene identificación para ese pin (o el pin ya se borró).';

-- =============================================================================
-- 4. Funciones de apoyo
-- =============================================================================

-- Re-resuelve la cédula de las marcaciones cuyo pin ahora apunta a otra (o a
-- una donde antes no había). Acotada por `IS DISTINCT FROM`: en régimen no
-- toca ninguna fila. La llama el endpoint cuando el snapshot de personas trae
-- cédulas distintas de las que había.
CREATE OR REPLACE FUNCTION biometrico_reresolver_cedulas()
RETURNS INTEGER
LANGUAGE sql
AS $$
  WITH u AS (
    UPDATE biometrico_marcaciones m
       SET cedula = p.cedula
      FROM biometrico_personas p
     WHERE m.pin = p.pin
       AND m.cedula IS DISTINCT FROM p.cedula
    RETURNING 1
  )
  SELECT count(*)::int FROM u;
$$;

COMMENT ON FUNCTION biometrico_reresolver_cedulas() IS
  'Reatribuye marcaciones cuando cambia la cédula de un pin en biometrico_personas (p. ej. al llenar el SSN en el equipo). Devuelve cuántas filas cambió.';

-- Última marcación de cada cédula de una lista. Para la columna «última
-- marcación conocida» de la pantalla, sin traer todas las filas.
CREATE OR REPLACE FUNCTION biometrico_ultima_marcacion(p_cedulas TEXT[])
RETURNS TABLE (cedula TEXT, momento TIMESTAMPTZ)
LANGUAGE sql
STABLE
AS $$
  SELECT m.cedula, max(m.momento)
    FROM biometrico_marcaciones m
   WHERE m.cedula = ANY (p_cedulas)
   GROUP BY m.cedula;
$$;

COMMENT ON FUNCTION biometrico_ultima_marcacion(TEXT[]) IS
  'Última marcación por cédula, para saber cuántos días lleva sin aparecer quien no marcó hoy.';

-- =============================================================================
-- 5. Seguridad
-- =============================================================================
-- RLS sin políticas: solo service_role. Las tres tablas llevan cédulas y
-- nombres, y en esta instancia autoalojada los privilegios no se heredan.
ALTER TABLE biometrico_personas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometrico_envios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometrico_marcaciones ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE biometrico_personas    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE biometrico_envios      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE biometrico_marcaciones TO service_role;
GRANT EXECUTE ON FUNCTION biometrico_reresolver_cedulas()          TO service_role;
GRANT EXECUTE ON FUNCTION biometrico_ultima_marcacion(TEXT[])      TO service_role;

-- No se crea clave de módulo: la pantalla vive dentro de Ausentismo, que ya
-- tiene su permiso.

-- =============================================================================
-- Comprobación (solo lectura)
-- =============================================================================
SELECT c.relname AS tabla,
       c.relrowsecurity::text AS rls,
       has_table_privilege('service_role', c.oid, 'SELECT')::text AS puede_leer,
       has_table_privilege('service_role', c.oid, 'INSERT')::text AS puede_insertar
  FROM pg_class c
 WHERE c.relname IN ('biometrico_personas', 'biometrico_envios', 'biometrico_marcaciones')
UNION ALL
SELECT 'funcion biometrico_reresolver_cedulas',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'biometrico_reresolver_cedulas')::text,
       has_function_privilege('service_role', 'biometrico_reresolver_cedulas()', 'EXECUTE')::text,
       NULL
UNION ALL
SELECT 'funcion biometrico_ultima_marcacion',
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'biometrico_ultima_marcacion')::text,
       has_function_privilege('service_role', 'biometrico_ultima_marcacion(text[])', 'EXECUTE')::text,
       NULL
UNION ALL
SELECT 'marcaciones cargadas', (SELECT count(*)::text FROM biometrico_marcaciones), NULL, NULL
UNION ALL
SELECT 'personas del equipo', (SELECT count(*)::text FROM biometrico_personas), NULL, NULL;
