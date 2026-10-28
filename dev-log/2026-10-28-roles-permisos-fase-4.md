# 2026-10-28 · Roles y permisos dinámicos — fase 4 (pantalla nueva de usuarios y roles)

**Dónde.** Configuración › Usuarios (`/configuracion/usuarios`).

- **Modo `sombra`:** se ve la pantalla de siempre, con un aviso y el enlace «Ver
  el sistema nuevo» (`?vista=nuevo`). Esa es una vista previa de **solo
  lectura** con los datos reales de las tablas nuevas.
- **Modo `nuevo`:** solo se ve la pantalla nueva, que es la que edita.

**La pantalla nueva** (`sistema-roles-client.tsx`, `arbol-permisos.tsx`):

- **Usuarios**
  - Lista con roles (chips), permisos individuales (+/−) y estado.
  - Panel por persona:
    - varios roles con casillas;
    - árbol de permisos donde lo que dan sus roles viene marcado, y lo que se
      marca o desmarca queda como **permiso individual** (sin crear un rol);
    - **vista previa de su menú**;
    - restablecer contraseña y activar/desactivar.
  - Antes de guardar, si la persona pierde permisos, se listan y hay que
    confirmar.
  - Nuevo usuario con roles.
- **Roles**
  - Tarjetas con usuarios y permisos; crear, editar, duplicar, borrar si nadie
    lo usa y desactivar.
  - Editor con el árbol agrupado como el menú: atajo por módulo (Sin acceso ·
    Ver · Editar · Todo, o «Personalizado»), casillas por acción y por función,
    y candado en las sensibles (los atajos Ver/Editar no las marcan).
  - El administrador (super) no se edita: lo tiene todo.
- **¿Quién tiene?** Buscar un permiso y ver quién lo tiene y por qué (qué rol o
  si es individual).
- **Sistema**
  - Quién decide, personas que perderían o ganarían acceso en los últimos 7
    días según la sombra, y permisos retirados.
  - Botón para pasar al sistema nuevo o volver.

**Servidor** (`roles-actions.ts`, solo super):
- Acciones: `cambiarMotorPermisos`, `guardarRol`, `eliminarRolNuevo`,
  `asignarRolesUsuario`, `guardarPermisosIndividuales` y
  `crearUsuarioConRoles`.
- Lo que escribe exige modo `nuevo`: en sombra se perdería con la siguiente
  reconstrucción.
- Pasar a `nuevo` primero pone las tablas al día con lo último del viejo, y se
  niega si la sombra anotó alguien que pierde acceso o si no queda ningún super
  activo.
- No se puede quitar el rol super al último administrador activo.
- Todo queda en la auditoría.
- `setUserActive` reconoce al administrador también en el sistema nuevo.

**Lógica pura con pruebas** (`src/lib/permisos/arbol.ts`): árbol, niveles,
quién tiene y qué pierde. `test:permisos`: 55.

**Verificado.**
- `tsc`, `eslint` y `build` pasan.
- Capturas de las pestañas Usuarios (con el panel), Roles y Sistema con datos
  reales, mediante una página temporal ya borrada.

**Pendiente.**
- Pasar a `nuevo` desde la pestaña Sistema cuando el usuario lo decida.
- Fase 5:
  - las llaves de API (`api_keys.user_type`) y el MCP siguen leyendo
    `user_types`;
  - retirar `user_types`, `permisos_individuales`, `profiles.role` y la
    pantalla vieja;
  - afinar acciones (crear, eliminar, exportar…) módulo por módulo.
