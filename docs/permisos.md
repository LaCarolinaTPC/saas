# Roles y permisos

> Estado (2026-11-10): **un solo sistema**. El sistema anterior (`user_types`,
> un rol por usuario) decidió hasta el 2026-10-29 y su código se retiró el
> 2026-11-10: ya no hay modo sombra, ni interruptor `permisos.motor`, ni vuelta
> atrás. Historia: dev-logs `2026-10-27-roles-permisos-fase-1.md` y
> `2026-10-28-roles-permisos-fase-2.md`.

## El modelo

- **Permiso** = `modulo.accion` o `modulo.funcion.accion`, por ejemplo
  `ausentismo.ver`, `ausentismo.editar` o `tesoreria.caja.editar`.
- **Rol** = un conjunto de permisos. Un usuario puede tener **varios roles**, y
  sus permisos se suman.
- **Permisos individuales**: a una persona se le puede conceder o quitar un
  permiso puntual sin crearle un rol. Concedido gana sobre quitado.
- **Rol super** (`es_super`): lo tiene todo, siempre. Reemplaza tener que
  agregarle cada módulo nuevo al admin con una migración.
- **Funciones sensibles** (auditorías, simulador, Plan Padrino, cuentas de
  afiliados…): un rol no las recibe por tener el módulo. Hay que marcarlas.
- **Reservadas al super** (`incapacidades.parametros`, `financiera.parametros`):
  nadie más las recibe.
- **Ver implícito**: tener cualquier permiso de un módulo deja entrar a él. La
  excepción son las acciones especiales: `accidentabilidad.evaluar` no abre la
  pantalla.

## Cómo se revisa un permiso en el código

| Dónde | Cómo |
|---|---|
| Server Action que lanza | `await exigirPermiso("vacantes.editar")` |
| Server Action que devuelve `{ success, error }` | `const e = await faltaPermiso("accidentabilidad.editar"); if (e) return { success: false, error: e };` |
| Página o acción con `perms` | `tienePermiso(perms, "riesgo.ver")`, `puedeEditarEn(perms, "ausentismo")`, `canAccess(perms, "ausentismo")` |
| Ruta de API | `const r = await exigirPermisoApi("rotacion.editar"); if (r) return r;` |
| Botón en el cliente | `const puede = usePermisos(); puede("documentos.editar")` o `<SiPuede permiso="…">` |

- Ocultar un botón es comodidad: **la acción de servidor tiene que exigir el
  mismo permiso**.
- Una prueba falla si una Server Action exportada no revisa nada, o si se exige
  un permiso que no está en el catálogo.
- Editar es por módulo o función: `puedeEditarEn`.
- `perms.roles` son las claves de sus roles; `perms.rol` las une en un texto
  («tesoreria, rrhh») para auditorías y etiquetas.
- Para saber quién tiene un permiso fuera de una petición (por ejemplo, a quién
  notificar): `usuariosConPermiso(db, "accidentabilidad.evaluar")` en
  `fuente.ts`; para todos a la vez, `efectivosDeTodos(db)`.

El proxy, el servidor, el menú, el MCP y la Data API leen los permisos de la
misma fuente (`src/lib/permisos/fuente.ts`).

## Acciones por módulo

Todo módulo de pantalla tiene `ver`, `editar` y `exportar` (este último de
nivel `ver`). Algunos tienen acciones propias:

| Módulo | Acciones |
|---|---|
| Vacantes | crear · editar · eliminar |
| Candidatos | editar · eliminar |
| Empleados | editar · eliminar |
| Documentos | editar · eliminar |
| Ausentismo | crear · editar · eliminar |
| Accidentabilidad | editar · aprobar · eliminar · evaluar (especial) |
| Procesos disciplinarios | crear · editar · anular |
| Accidentes de trabajo (SST) | crear · editar · anular |
| Exámenes periódicos (SST) | crear · editar · anular |

Exportar se revisa en el cliente por el módulo de la ruta
(`usePuedeExportar()`, `<SiExporta>`, y `BotonesExportar` lo hace solo).

## El catálogo: un solo lugar

`src/lib/permisos/catalogo.ts` declara los módulos, sus rutas, sus funciones y
sus acciones. De ahí salen la ruta → permiso (gana el prefijo más largo) y,
según el plan, el menú.

Para agregar un módulo, una función o una acción, **solo se toca el catálogo**:

- La aplicación crea los permisos nuevos en la base (`permisos`) sola, como
  mucho una vez por minuto mientras alguien la usa.
- Lo que se retira del código queda **obsoleto**: no da acceso y no se borra.
- Una acción nueva de nivel `ver` o `editar` en un módulo que ya existía la
  **heredan** los roles que ya tenían ese nivel ahí. Afinar un módulo en más
  acciones no le quita nada a nadie.
- Una acción de nivel `especial` se concede a propósito, nunca por herencia.

## Tablas

Migración `20261028011725_roles_y_permisos_dinamicos.sql`:

- `permisos`: el catálogo, igual al código (lo mantiene `bd.ts`).
- `roles`, `rol_permisos`, `usuario_roles`, `usuario_permisos`.
- `api_keys.user_type`: la clave del rol de cada llave `sk_live_…` (el nombre
  de la columna es del sistema anterior; el valor es un rol de `roles`).

Sin uso desde el 2026-11-10, se conservan como histórico (no se borraron):
`user_types`, `profiles.user_type`, `profiles.role`,
`profiles.permisos_individuales`, `profiles.scope_departments`,
`permisos_discrepancias`, `permisos_incidencias`, `permisos_metricas_dia` y
`app_settings` → `permisos.motor`. Si se decide borrarlos, con una migración
nueva y después de sacar un respaldo.

## Pantalla

Configuración › Usuarios, solo para el administrador:

- **Usuarios:** varios roles por persona y permisos individuales marcando o
  desmarcando sobre lo que dan sus roles. Incluye la vista previa del menú.
  Desde ahí se restablece la contraseña (se copia sola al portapapeles) y se
  activa o desactiva a la persona; nunca sobre el propio usuario.
- **Roles:** atajos por módulo y casillas por acción, y al final los permisos
  retirados del catálogo.
- **¿Quién tiene?**

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run permisos:sincronizar` | Escribe. Deja la tabla `permisos` igual al catálogo ya mismo (la aplicación también lo hace sola). |
| `npm run test:permisos` | Pruebas: catálogo, rutas reales del panel, motor, sincronización del catálogo, Server Actions con guardia. |

## Módulo nuevo: cómo se da acceso

Ya no se inserta en `user_types`. Se declara el módulo en el catálogo
(`src/lib/permisos/catalogo.ts`) y, al desplegar, la aplicación crea sus
permisos. Después se asignan a los roles en Configuración › Usuarios › Roles (o
en la migración del módulo, con `INSERT INTO rol_permisos`). El administrador
lo tiene desde el primer momento por ser super.
