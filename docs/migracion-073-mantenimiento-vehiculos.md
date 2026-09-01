# Migración 073 — Mantenimiento se engancha al maestro de vehículos

Ejecute `supabase/migrations/073_mantenimiento_maestro_vehiculos.sql` en el **SQL Editor** de la instancia Supabase que utiliza Gestivo, con una cuenta con permisos administrativos. Requiere que ya estén aplicadas la **057** (crea `vehiculos`) y la **072** (permisos del módulo).

## Qué hace

Reemplaza la llave de vehículo del módulo. Hasta ahora `mantenimiento_reportes` y `mantenimiento_alertas` apuntaban con `placa_buseta` a `busetas(placa)`, un catálogo manual creado en la 048 que nunca se llenó. El maestro real ya está en Gestivo: la 057 trajo `vehiculos`, que el cron `/api/cron/sync-gema` sincroniza desde la vista `vst_ext_get_vehiculos` de GEMA.

En concreto:

1. Cambia `placa_buseta` por `codigo_vehiculo TEXT REFERENCES vehiculos(codigo)` en las dos tablas.
2. Reconstruye el índice único parcial de alerta abierta y el índice de recurrencia sobre la nueva columna.
3. Recrea `mantenimiento_detectar_recurrencia()` con la misma regla de negocio: al segundo reporte del mismo vehículo y concepto dentro de 30 días se abre o se actualiza la alerta.
4. Retira la acción de auditoría `buseta_creada`, que ya no se produce.
5. Hace `DROP TABLE busetas`.

Se usa `codigo` y no la placa porque es la llave primaria del maestro, sobrevive a un cambio de placa y es la misma clave que el módulo Rotación emplea en `velocidades` y en el mapa de calor.

## Antes de ejecutar

La migración **no homologa datos**: reconstruye la columna. Por eso arranca con una guarda que aborta con un mensaje explícito si `mantenimiento_reportes` o `mantenimiento_alertas` tienen filas.

Al 2026-09-01 ambas están en cero en la instancia de Gestivo, así que la migración corre limpia. Si en el futuro una instalación ya tiene reportes, primero hay que homologar cada `placa_buseta` contra `vehiculos.codigo` y convertir esta migración en una que copie datos en vez de recrear la columna.

## Después de ejecutar

Compruebe que:

- `mantenimiento_reportes` y `mantenimiento_alertas` tienen la columna `codigo_vehiculo` y ya no tienen `placa_buseta`.
- La tabla `busetas` ya no existe.
- La página `/mantenimiento` lista los vehículos activos del maestro (151 con `estado = 1` al 2026-09-01) y los conductores activos (193 con `estado = 'ACTIVO'`).
- Al registrar dos reportes del mismo vehículo y concepto con menos de 30 días de diferencia se abre una alerta, y al cerrarla quedan la orden de taller, las notas, el responsable y la fecha en `mantenimiento_auditoria`.

No hacen falta permisos nuevos: `vehiculos` recibió `SELECT` para `authenticated` en la 057 y `ALL` para `service_role` en la 059.
