# 2026-10-28 · Roles y permisos dinámicos — fase 2 (tablas, sincronización, sombra)

**Hecho.**

- Migración `20261028011725_roles_y_permisos_dinamicos.sql`. Crea `permisos`,
  `roles`, `rol_permisos`, `usuario_roles` (varios por usuario),
  `usuario_permisos` (individuales) y `permisos_discrepancias`, con GRANT a
  `service_role`. Deja `permisos.motor = sombra`. **No toca nada del sistema
  viejo.**
- Cambio respecto del plan: los datos **no** van en SQL generado. Los carga la
  aplicación con la misma traducción probada, y los vuelve a cargar si alguien
  cambia un rol en la pantalla vieja (huella del sistema viejo en
  `app_settings`). Así lo nuevo no se queda atrás durante la sombra.
- `src/lib/permisos/sincronizar.ts` (puro, con pruebas):
  - el catálogo pasa a la base: nuevos, cambiados, obsoletos, reactivados;
  - herencia de acciones nuevas por nivel;
  - reconstrucción mínima de roles y asignaciones.
- `src/lib/permisos/bd.ts` lee y escribe las tablas; `mantenerAlDia` corre como
  mucho una vez por minuto por proceso.
- `src/lib/permisos/sombra.ts`: `getCurrentPermissions` (que sigue decidiendo)
  agenda con `after()` la comparación viejo/nuevo del usuario, como mucho cada
  10 min. Si hay diferencia, reconstruye y repite antes de anotarla en
  `permisos_discrepancias`. Lo que gana el admin al ser super no se anota.
  Nunca lanza. Con `permisos.motor = viejo` (o sin migración) no hace nada.
- Comandos: `permisos:sincronizar`, `permisos:discrepancias` y
  `permisos:comparar -- <foto> --bd`.
- `docs/permisos.md`.

**Pruebas.** `npm run test:permisos`: 50 pruebas. `tsc`, `eslint` y `build`
pasan.

**Pendiente del usuario.**

1. Aplicar la migración en el SQL Editor.
2. Desplegar.
3. Opcional: `npm run permisos:sincronizar` y
   `npm run permisos:comparar -- <foto> --bd`. Si no, se sincroniza sola al
   primer uso.
4. Dejar unos días de uso y revisar `npm run permisos:discrepancias`.

**Sigue (fase 3).** Guardianes nuevos en proxy, menú, páginas, acciones y API;
botones de Nuevo, Editar y Eliminar por permiso; cierre de los huecos (las 44
acciones sin chequeo de `src/lib/actions.ts`, entre otros).
