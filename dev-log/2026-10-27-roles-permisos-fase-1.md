# 2026-10-27 · Roles y permisos dinámicos — fase 1 (sin cambios visibles)

Plan aprobado: roles con permisos por acción, varios roles por usuario, permisos
individuales por persona, catálogo único en código que se sincroniza solo, y
pruebas para que nadie pierda acceso. Esta fase no cambia nada de lo que se ve.

**Hecho.**

- `src/lib/permisos/catalogo.ts`: catálogo único (33 módulos, 27 funciones
  —las antiguas sub-funciones—, acciones `ver`/`editar` y `accidentabilidad.evaluar`,
  que antes decidía `profiles.role`). Claves `modulo.accion` / `modulo.funcion.accion`.
- `src/lib/permisos/motor.ts`: permisos efectivos (unión de roles + concedidos −
  quitados, super, reservados al super, `ver` implícito), ruta → permiso por
  prefijo más largo, menú visible e inicio.
- `src/lib/permisos/equivalencia.ts`: traducción sin pérdida del sistema viejo.
  Cada `user_types` pasa a rol con la misma clave; lo propio de cada persona
  queda como permiso individual (concedido/quitado).
- `src/lib/permisos/comparar.ts` y pruebas (`npm run test:permisos`, 46): el
  catálogo cuadra con `ALL_MODULES`, `MODULE_SUBS`, sensibles, reservadas e
  inicios; **cada página real del panel** cae en el mismo módulo y función que
  con `hrefToModule`/`hrefToSubmodule`; y la equivalencia no pierde ni gana nada
  en casos armados (ajustes individuales, sub-funciones, sensibles, sin rol…).
- Scripts de solo lectura: `npm run permisos:foto [archivo]` y
  `npm run permisos:comparar -- <archivo>`.

**Resultado contra la base real (2026-10-27).** 45 usuarios, 15 roles (7 sin
usuarios), ningún permiso individual. **Nadie pierde acceso.** Lo único ganado:
los 19 administradores ven «Producción conductor» en el menú (su fila de
`user_types` no lo tenía: el problema de parchar el rol admin a mano).

**Sigue (fase 2).** Migración de las tablas nuevas y de los datos (generada
desde la equivalencia), sincronización automática del catálogo y modo sombra.
