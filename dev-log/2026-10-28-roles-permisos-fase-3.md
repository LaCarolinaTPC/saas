# 2026-10-28 · Roles y permisos dinámicos — fase 3 (un solo motor en todo el sistema)

**Idea central.** `src/lib/permisos/fuente.ts` da los permisos de un usuario
según `permisos.motor`:
- en `viejo`/`sombra` los traduce del sistema anterior con la equivalencia
  probada, así que quién entra no cambia;
- en `nuevo` los lee de las tablas nuevas.

Así todos los guardianes usan ya el motor nuevo, y el cambio final es solo el
interruptor.

**Hecho.**

- **`getCurrentPermissions`** (lo usan 143 archivos) sale de la fuente.
  - Agrega `efectivos` y `roles`.
  - `canAccess`/`canAccessSub` pasan por el motor.
  - Helpers nuevos: `tienePermiso`, `puedeEditarEn(perms, ...ámbitos)`,
    `exigirPermiso` (lanza) y `faltaPermiso` (devuelve el mensaje).
  - El super tiene todos los módulos: se acaba el caso del admin al que
    `canAccess` le negaba un módulo que su fila no listaba.
- **Proxy**: misma fuente y motor (`rutaPermitida`, `inicioDe`). El caso
  especial de Tesorería pasa a `INICIO_POR_ROL`.
- **Menú** (`sidebar.tsx`): `menuVisible` con los permisos efectivos.
- **Cliente**: `PermisosProvider`, `usePermisos()` y `<SiPuede>` en el layout
  del panel.
- **`puedeEditar` global → por módulo o función** (`puedeEditarEn`), en
  pantallas Y acciones a la vez, en ~55 archivos: ausentismo, conductores,
  incapacidades, mantenimiento, cámaras, combustible, operativo, preoperacional,
  riesgo, cartulina, solicitudes a cámaras, padrino, devengados, accidentes,
  contratación y API (departamentos, adjuntos, combustible, documentos). Ya no
  queda ningún `perms.puedeEditar` en el código.
- **Huecos cerrados:**
  - `src/lib/actions.ts`: las 44 acciones sin chequeo ahora exigen
    `modulo.ver`/`modulo.editar` (vacantes, candidatos, empleados, documentos,
    integraciones, accidentes). Antes de exigirlo se verificó que todo rol con
    usuarios que tiene esos módulos puede editar: nadie pierde nada.
  - Dictamen de accidentes: `accidentabilidad.evaluar` en vez de
    `profiles.role`.
  - Ausentismo y Disciplinarios: escribir exige `.editar` (antes bastaba ver el
    módulo).
  - Carga de Rotación: `rotacion.editar`.
  - `getEstadoMgx`/`getUltimasCorridasMgx`: solo el super;
    `getEstadoSyncGema`: `tesoreria.parametros.ver`.
  - Crons (`sync-gema`, `financiera-consolidar`, `revision-timbradas`,
    `riesgo-conductores`, `campanas/sync-meta`): fallan cerrado sin
    `CRON_SECRET`.
- **Botones según permiso** (se ocultan a quien no puede; el servidor exige lo
  mismo):
  - estados y eliminar de vacantes; Nueva vacante;
  - asignar/eliminar candidato; eliminar empleado;
  - estados/eliminar documentos;
  - integraciones;
  - revisar/eliminar accidente;
  - Disciplinarios (nuevo, editar, anular).
- **Pruebas nuevas** (`test:permisos`, 52):
  - toda Server Action exportada revisa permisos, con excepciones justificadas
    (las públicas y las que delegan);
  - todo permiso que se exige en el código existe en el catálogo.

**Verificado contra la base real (solo lectura).**
- La fuente nueva da a los 45 usuarios exactamente los mismos módulos y rutas
  del menú que el cálculo viejo.
- La migración ya está aplicada, en modo sombra. La aplicación llenó las tablas
  (119 permisos, 15 roles, 45 asignaciones) y
  `permisos:comparar -- <foto> --bd` da «Nadie pierde acceso».
- Sin discrepancias anotadas.

**Pendiente.**
- Fase 4: la pantalla nueva de usuarios y roles (varios roles por persona,
  permisos individuales, vista previa del menú). Después, pasar a `nuevo`.
- Afinar acciones (`crear`, `eliminar`, `exportar`…) módulo por módulo: la
  infraestructura y la herencia por nivel ya están.
- Sin tocar todavía: los botones internos del detalle de empleado y de
  candidato (el servidor ya los rechaza sin `.editar`); `auth/evento` (correo
  que manda el navegador); `GET /api/departments` sin sesión.
