# Roles y permisos

> Estado (2026-10-28): **en transición**. Decide el sistema anterior
> (`user_types`, un rol por usuario); el nuevo corre en **modo sombra** y anota
> las diferencias. Plan completo: fases 1–5 (ver los dev-logs
> `2026-10-27-roles-permisos-fase-1.md` y `2026-10-28-roles-permisos-fase-2.md`).

## El modelo nuevo

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
- Ya no se usa `perms.puedeEditar` (global). Editar es por módulo o función:
  `puedeEditarEn`.

El proxy, el servidor y el menú leen los permisos de la misma fuente
(`src/lib/permisos/fuente.ts`), según el interruptor `permisos.motor`.

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

- `permisos`
- `roles`
- `rol_permisos`
- `usuario_roles`
- `usuario_permisos`
- `permisos_discrepancias`
- `app_settings` → `permisos.motor` = `viejo | sombra | nuevo`

## Transición (sin que nadie pierda acceso)

1. **Traducción probada.** `src/lib/permisos/equivalencia.ts` traduce el
   sistema viejo al nuevo:
   - cada `user_types` pasa a rol con la misma clave;
   - `puede_editar` pasa a las acciones de nivel `editar` de sus módulos;
   - las sub-funciones pasan a funciones;
   - `profiles.role` admin/rrhh pasa a `accidentabilidad.evaluar`;
   - lo propio de cada persona queda como permiso individual.
2. **Modo sombra.** El viejo decide. La aplicación reconstruye roles y
   asignaciones nuevos desde los viejos cada vez que estos cambian, y compara a
   cada usuario que entra (cada 10 minutos como mucho). Las diferencias quedan
   en `permisos_discrepancias`.
3. **Vuelta atrás.** Poner `viejo` en `app_settings` → `permisos.motor`.

## Pantalla

Configuración › Usuarios:

- **Modo `sombra`:** la pantalla de siempre, más «Ver el sistema nuevo», una
  vista previa de solo lectura.
- **Modo `nuevo`:** la pantalla nueva, con estas pestañas:
  - **Usuarios:** varios roles por persona y permisos individuales marcando o
    desmarcando sobre lo que dan sus roles. Incluye la vista previa del menú.
  - **Roles:** atajos por módulo y casillas por acción.
  - **¿Quién tiene?**
  - **Sistema:** pasar al sistema nuevo o volver, discrepancias y permisos
    retirados.

Mientras mande el viejo, la pantalla nueva no escribe: lo nuevo se reconstruye
desde el viejo y se perdería.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run permisos:foto [archivo]` | Solo lectura. Guarda el acceso de hoy de cada usuario (fuera del repositorio; tiene correos). |
| `npm run permisos:comparar -- <foto> [--bd]` | Solo lectura. Compara la foto con el sistema nuevo, en memoria o leyendo las tablas (`--bd`). Sale con error si alguien pierde algo. |
| `npm run permisos:sincronizar` | Escribe. Catálogo y roles al día ya mismo (la aplicación también lo hace sola). |
| `npm run permisos:discrepancias [días]` | Solo lectura. Lo que anotó la sombra. |
| `npm run test:permisos` | Pruebas: catálogo, rutas reales del panel, motor, equivalencia, sincronización. |

## Retiro del sistema viejo (cuando ya se use el nuevo)

Solo después de pasar a `nuevo` desde Configuración › Usuarios › Sistema, y de
unos días sin problemas. Hasta entonces el viejo es la vuelta atrás.

1. **Migración nueva** (`npm run migracion:nueva -- "retiro del sistema viejo de permisos"`):
   - agregar `api_keys.rol` (FK a `roles`) y llenarla con `user_type`, para
     poder dar a una llave de API un rol creado en el sistema nuevo;
   - después, retirar `profiles.permisos_individuales`, `user_types.submodulos`,
     `user_types.alcance` y `profiles.scope_departments`;
   - más adelante, `user_types` y `profiles.user_type`/`profiles.role`. Antes
     hay que quitar sus usos (`ROLES_REVISORES` de las notificaciones de
     accidentes, `createUser` viejo, `configuracion/api`).
2. **Código:**
   - quitar la pantalla vieja (`usuarios-client.tsx`,
     `permisos-individuales-panel.tsx`, `buscar-permisos.tsx` y sus acciones);
   - quitar la rama vieja de `fuente.ts` y de `external/acceso.ts`;
   - quitar la sombra (`sombra.ts`, `reconstruirDesdeViejo`) y la fachada de
     `permissions-shared.ts`.
3. **Sin vuelta atrás desde aquí:** antes de borrar columnas o tablas, sacar un
   respaldo de `user_types` y `profiles`.
