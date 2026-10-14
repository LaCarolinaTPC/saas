-- Permisos individuales por usuario (Configuración → Usuarios)
--
-- Contexto: hasta hoy el rol (profiles.user_type -> user_types) es la UNICA
-- fuente de permisos. Para darle una pantalla a una sola persona hay que
-- crearle un rol propio o abrirsela a todos los que comparten su rol. Ese
-- costo ya se pago: el simulador de Tesoreria se pidio "para asignarlo a los
-- usuarios que lo necesiten" y hubo que resolverlo tipo por tipo porque no
-- existian permisos individuales (docs/informe-2026-07-29-simulador-asignable.md).
-- De ahi tambien la proliferacion de roles de una sola persona
-- (inspector_patio, tecnico_camaras, auxiliar_ruta, rendimiento_dia...).
--
-- Esta columna guarda los AJUSTES del rol de UN usuario: que modulos y que
-- sub-funciones se le conceden o se le niegan por encima de lo que da su rol.
--   {"modulos":    {"tesoreria": true, "conductores": false},
--    "submodulos": {"auditoria": true, "simulador": false},
--    "meta": {"por": "<uuid>", "email": "...", "at": "2026-10-14T16:45:06Z"}}
--
-- Clave ausente = hereda del rol; true = conceder; false = denegar. Los
-- nombres de sub-funcion son unicos en toda la aplicacion (de ahi los
-- prefijos incap_/fin_ en src/lib/permissions-shared.ts), asi que
-- "submodulos" es un mapa plano, igual que ya se indexan SUBS_SENSIBLES,
-- SUBS_SOLO_ADMIN, SUB_HOME y SUBMODULE_LABELS.
--
-- Reglas que esta columna NO puede romper, y por eso viven en codigo
-- (src/lib/permissions-shared.ts, compartido por el middleware, el menu y el
-- servidor):
--   - Lo reservado al administrador (SUBS_SOLO_ADMIN: incap_parametros,
--     fin_parametros) no se concede ni por aqui.
--   - El rol admin no admite ajustes: siempre tiene acceso total, para que un
--     descuido no deje al sistema sin nadie que lo administre.
--   - Un usuario no puede quedar sin ningun modulo efectivo: para retirarle el
--     acceso se lo desactiva, no se le niega todo (quedaria en un rebote
--     permanente contra /login).
--
-- "meta" es informativo (quien lo toco por ultima vez, para mostrarlo en la
-- pantalla). La bitacora completa de cada cambio vive en tesoreria_audit_log,
-- accion 'cambio_permisos_individuales', modulo 'seguridad'.
--
-- Sin ajustes se guarda '{}', para que "permisos_individuales <> '{}'"
-- signifique exactamente "usuario con permisos a la medida".
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, asi que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- No crea tablas: los GRANT son por tabla y profiles ya los tiene, asi que la
-- columna nueva los hereda. No hace falta GRANT nuevo.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS permisos_individuales JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.permisos_individuales IS
  'Ajustes de permisos de este usuario sobre lo que le da su rol: {"modulos":{"<clave>":true|false},"submodulos":{"<sub>":true|false},"meta":{...}}. Clave ausente = hereda del rol, true = conceder, false = denegar; {} = sin ajustes. Las sub-funciones reservadas al administrador no se conceden ni aqui, y el rol admin no admite ajustes. Se resuelve con modulosEfectivos/subAllowed en src/lib/permissions-shared.ts. Cada cambio queda en tesoreria_audit_log (accion cambio_permisos_individuales).';

-- Forma minima garantizada: objeto JSON, y si vienen las claves, tambien
-- objetos. Evita que un error de codigo deje un array o un escalar donde el
-- resolvedor de permisos espera un mapa.
DO $permisos_individuales_forma$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_permisos_individuales_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_permisos_individuales_check
      CHECK (
        jsonb_typeof(permisos_individuales) = 'object'
        AND (NOT permisos_individuales ? 'modulos'
             OR jsonb_typeof(permisos_individuales -> 'modulos') = 'object')
        AND (NOT permisos_individuales ? 'submodulos'
             OR jsonb_typeof(permisos_individuales -> 'submodulos') = 'object')
      );
  END IF;
END
$permisos_individuales_forma$;

-- "Quien tiene concedida esta sub-funcion" se resuelve por contencion
-- (permisos_individuales @> '{"submodulos":{"caja":true}}'), que es lo que
-- necesita la lista de cajeros de Tesoreria. Parcial: solo indexa a los
-- usuarios con ajustes, que son pocos.
CREATE INDEX IF NOT EXISTS idx_profiles_permisos_individuales
  ON profiles USING gin (permisos_individuales)
  WHERE permisos_individuales <> '{}'::jsonb;

-- Normaliza por si alguna fila quedo con NULL antes del NOT NULL.
UPDATE profiles SET permisos_individuales = '{}'::jsonb
WHERE permisos_individuales IS NULL;

-- ============================================================
-- Comprobacion (solo lectura)
-- ============================================================
-- Las filas de 'authenticated' y 'anon' DEBEN salir en false: si alguna sale
-- true, cualquier usuario autenticado podria escribir su propio perfil y
-- concederse permisos (o cambiarse user_type, que ya seria posible hoy). Es un
-- hueco anterior a esta migracion, pero hay que cerrarlo antes de confiar en
-- esta columna.
SELECT 'columna permisos_individuales' AS objeto,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'profiles'
                 AND column_name = 'permisos_individuales')::text AS valor
UNION ALL
SELECT 'default de la columna',
       coalesce((SELECT column_default FROM information_schema.columns
                 WHERE table_name = 'profiles'
                   AND column_name = 'permisos_individuales'), 'sin default')
UNION ALL
SELECT 'restriccion de forma',
       EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'profiles_permisos_individuales_check')::text
UNION ALL
SELECT 'indice gin',
       EXISTS (SELECT 1 FROM pg_indexes
               WHERE tablename = 'profiles'
                 AND indexname = 'idx_profiles_permisos_individuales')::text
UNION ALL
SELECT 'service_role puede escribir profiles',
       has_table_privilege('service_role', 'public.profiles', 'UPDATE')::text
UNION ALL
SELECT 'authenticated puede escribir profiles (debe ser false)',
       has_table_privilege('authenticated', 'public.profiles', 'UPDATE')::text
UNION ALL
SELECT 'anon puede escribir profiles (debe ser false)',
       has_table_privilege('anon', 'public.profiles', 'UPDATE')::text
UNION ALL
SELECT 'usuarios con ajustes individuales (0 recien aplicada)',
       (SELECT count(*)::text FROM profiles
        WHERE permisos_individuales <> '{}'::jsonb);
