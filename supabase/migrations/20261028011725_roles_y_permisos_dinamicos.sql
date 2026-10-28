-- roles y permisos dinamicos
--
-- Contexto. El sistema de roles tenía cuatro capas (módulos del rol,
-- sub-funciones del rol, ajustes por usuario y un `puede_editar` global por
-- rol), un solo rol por persona y un catálogo de módulos escrito a mano en
-- varios lugares. Se pasa a roles con permisos por acción
-- (`modulo.accion`, `modulo.funcion.accion`), VARIOS roles por usuario y
-- permisos individuales (conceder o quitar uno puntual a una persona sin
-- crearle un rol). Ver docs/permisos.md y src/lib/permisos.
--
-- Qué hace: SOLO crea las tablas y deja el interruptor en «sombra».
--  · Los permisos (`permisos`) los escribe la aplicación desde el catálogo en
--    código y marca obsoletos los que se retiran (no se borran).
--  · Los roles y las asignaciones los llena la aplicación desde `user_types` y
--    `profiles` con la traducción probada (src/lib/permisos/equivalencia.ts),
--    y los vuelve a llenar si alguien cambia algo en la pantalla vieja: en
--    «sombra» la pantalla vieja sigue mandando.
--  · En «sombra» el sistema viejo DECIDE; el nuevo calcula en paralelo y anota
--    cualquier diferencia en `permisos_discrepancias`. Volver atrás: poner
--    `viejo` en app_settings → permisos.motor.
--
-- No toca `user_types`, `profiles.user_type`, `permisos_individuales` ni
-- `profiles.role`: se conservan hasta que el sistema nuevo quede confirmado.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero e
-- idempotente. Las tablas nuevas no heredan privilegios: GRANT a service_role.

-- Catálogo de permisos (lo sincroniza la aplicación).
CREATE TABLE IF NOT EXISTS permisos (
  clave TEXT PRIMARY KEY,
  modulo TEXT NOT NULL,
  funcion TEXT,
  accion TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('ver', 'editar', 'especial')),
  etiqueta TEXT NOT NULL,
  sensible BOOLEAN NOT NULL DEFAULT false,
  solo_super BOOLEAN NOT NULL DEFAULT false,
  -- Retirado del código: no da acceso ni sale en pantalla. Se puede purgar.
  obsoleto BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  clave TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  -- Todo, siempre (reemplaza agregarle cada módulo nuevo al admin a mano).
  es_super BOOLEAN NOT NULL DEFAULT false,
  es_sistema BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Sin llave foránea a `permisos` a propósito: un permiso retirado del código
-- queda obsoleto pero su asignación se conserva, por si vuelve.
CREATE TABLE IF NOT EXISTS rol_permisos (
  rol TEXT NOT NULL REFERENCES roles(clave) ON UPDATE CASCADE ON DELETE CASCADE,
  permiso TEXT NOT NULL,
  PRIMARY KEY (rol, permiso)
);

-- Varios roles por usuario.
CREATE TABLE IF NOT EXISTS usuario_roles (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rol TEXT NOT NULL REFERENCES roles(clave) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rol)
);

-- Permisos individuales: conceder (true) o quitar (false) uno puntual a una
-- persona, encima de sus roles.
CREATE TABLE IF NOT EXISTS usuario_permisos (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permiso TEXT NOT NULL,
  concedido BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  PRIMARY KEY (user_id, permiso)
);

-- Modo sombra: diferencias entre el sistema viejo y el nuevo, una fila por
-- usuario y día. Tiene que quedar vacía antes de pasar al sistema nuevo.
CREATE TABLE IF NOT EXISTS permisos_discrepancias (
  user_id UUID NOT NULL,
  dia DATE NOT NULL,
  email TEXT,
  perdidos TEXT[] NOT NULL DEFAULT '{}',
  ganados TEXT[] NOT NULL DEFAULT '{}',
  visto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dia)
);

CREATE INDEX IF NOT EXISTS idx_usuario_roles_rol ON usuario_roles (rol);
CREATE INDEX IF NOT EXISTS idx_rol_permisos_permiso ON rol_permisos (permiso);

ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rol_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos_discrepancias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON permisos, roles, rol_permisos, usuario_roles, usuario_permisos, permisos_discrepancias FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  permisos, roles, rol_permisos, usuario_roles, usuario_permisos, permisos_discrepancias
  TO service_role;

COMMENT ON TABLE permisos IS 'Catálogo de permisos (modulo.accion / modulo.funcion.accion). Lo sincroniza la aplicación desde src/lib/permisos/catalogo.ts.';
COMMENT ON TABLE roles IS 'Roles con permisos por acción. Un usuario puede tener varios (usuario_roles).';
COMMENT ON TABLE usuario_permisos IS 'Permisos individuales: conceder (true) o quitar (false) uno puntual a una persona, encima de sus roles.';
COMMENT ON TABLE permisos_discrepancias IS 'Modo sombra: diferencias entre el sistema de permisos viejo y el nuevo, por usuario y día.';

-- Interruptor: viejo | sombra | nuevo. Arranca en sombra (decide el viejo).
INSERT INTO app_settings (key, value) VALUES ('permisos.motor', 'sombra')
ON CONFLICT (key) DO NOTHING;

-- Verificación: las seis tablas y el modo.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('permisos', 'roles', 'rol_permisos', 'usuario_roles', 'usuario_permisos', 'permisos_discrepancias')
 ORDER BY table_name;
SELECT key, value FROM app_settings WHERE key = 'permisos.motor';
