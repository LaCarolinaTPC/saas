---
type: session
title: "Continuidad Mantenimiento 2026-08-25"
created: 2026-08-25
updated: 2026-08-25
tags:
  - mantenimiento
  - supabase
  - continuidad
  - gestivo
status: developing
related:
  - "[[Estado de trabajo 2026-08-21]]"
sources: []
---

# Continuidad Mantenimiento 2026-08-25

## Estado del repositorio

- La rama local `main` coincide con `origin/main` en el commit `9ddab09` (`feat: agregar modulo de mantenimiento`). La rama `Desarrollo` ya está contenida en `main`.
- El árbol de trabajo conserva cambios ajenos que no deben sobrescribirse: `.env.example` modificado y `Wiki/` sin seguimiento previo.
- El módulo se incorporó en el commit del 24 de agosto mediante:
  - `src/app/(dashboard)/mantenimiento/page.tsx`
  - `src/app/(dashboard)/mantenimiento/mantenimiento-client.tsx`
  - `src/app/(dashboard)/mantenimiento/actions.ts`
  - `supabase/migrations/048_busetas_maestro_mantenimiento.sql`
  - `supabase/migrations/049_modulo_mantenimiento.sql`

## Diagnóstico y corrección confirmados

1. Los roles `mantenimiento` y `liquidacion_conductor_quincena` existen en Supabase, y el tipo `admin` tiene ambos módulos. Las migraciones 046, 047 y la parte de permisos de 049 están aplicadas.
2. Inicialmente, las consultas REST sobre `busetas` y las tablas de Mantenimiento devolvían `403`. La clave local configurada declara el rol JWT `service_role`.
3. Las migraciones 048 y 049 activan RLS, pero no conceden privilegios de tabla a `service_role`. En esta instalación dichos privilegios no se heredan para tablas nuevas. El `403` hace que la página reciba `data = null`.
4. La página original descartaba los errores y convertía los resultados en `[]`; por ello Busetas y Conceptos aparecían como opciones vacías sin explicar el problema.
5. La migración 050 se ejecutó manualmente en la instancia Supabase autoalojada configurada por Gestivo. Las consultas REST posteriores responden `200` para `mantenimiento_conceptos`, `busetas`, `mantenimiento_reportes`, `mantenimiento_alertas` y `mantenimiento_auditoria`.
6. `mantenimiento_conceptos` tiene los siete conceptos precargados. `busetas` sigue con cero registros; no se han inventado vehículos ni copiado movimientos históricos.

## Alcance del plan de Mantenimiento

El alcance registrado en el commit incluye:

- Maestro de busetas.
- Registro de daños: buseta, cédula del conductor, concepto, fecha/hora y descripción.
- Siete conceptos precargados: Carrocería/Golpes, Vidrios/Espejos, Motor/Mecánica, Llantas/Frenos, Sistema Eléctrico, Interior/Asientos y Otro.
- Historial reciente de reportes.
- Alerta recurrente al segundo reporte de la misma buseta y concepto dentro de 30 días.
- Cierre de alertas con orden de taller, notas, responsable y fecha; auditoría de las operaciones.

No se encontró un catálogo local de busetas ni el proyecto fuente `Da-o_Busetas`. No deben inventarse vehículos: el maestro se completa con información operacional validada.

## Cambios locales realizados y listos

### Migración nueva

- `supabase/migrations/050_mantenimiento_permisos_service_role.sql`
  - Otorga `USAGE` en `public` y `SELECT, INSERT, UPDATE, DELETE` sobre `busetas` y las cuatro tablas de Mantenimiento a `service_role`.
  - Amplía la restricción de auditoría para la acción `buseta_creada`.

### Aplicación

- `page.tsx` conserva las cargas en paralelo y entrega errores reales al cliente, en vez de ocultarlos como listas vacías.
- `mantenimiento-client.tsx` muestra el error de carga, permite agregar una buseta al maestro y permite cerrar cada alerta abierta con orden de taller y notas.
- `actions.ts` incorpora Server Actions autorizadas para crear busetas y cerrar alertas, con registro en `mantenimiento_auditoria` y `revalidatePath("/mantenimiento")`.
- `049_modulo_mantenimiento.sql` se actualizó para admitir la acción `buseta_creada` en instalaciones nuevas. La migración 050 actualiza instalaciones existentes.

## Validaciones realizadas

- `npx tsc --noEmit`: correcto.
- `npm run lint`: correcto.
- `npm run build`: quedó bloqueado por Windows sobre `.next/server/app/(dashboard)/mantenimiento`; no se eliminó caché ni se detuvo ningún proceso.
- `git diff --check`: correcto; solo hay advertencias de conversión LF/CRLF de Git.
- Acceso REST con `service_role` posterior a 050: correcto para todas las tablas de Mantenimiento.

## Conectividad Supabase

La aplicación apunta a una instancia Supabase autoalojada cuyo host tiene formato `supabasekong-...sslip.io`. No coincide con los proyectos mostrados por el token de Supabase Cloud. Se enlazó temporalmente el repositorio a un proyecto cloud durante la investigación, pero no se ejecutó `db push`: el historial remoto usa migraciones con fecha y no corresponde con las migraciones locales `001`–`050`. No usar `supabase db push --include-all` contra ese proyecto cloud.

Las credenciales y cadenas de conexión nunca se documentan en el wiki ni se comparten por chat.

## Migración de movimientos históricos

La base de destino ya está lista para operar, pero no contiene busetas ni reportes. La migración de movimientos debe hacerse por etapas:

1. Inventariar la fuente real: tablas o archivos, ID original, placa, número interno, conductor, categoría de daño, fecha, descripción y datos de cierre.
2. Cargar una tabla temporal de staging con los datos originales y una clave de origen; no insertar directamente en producción.
3. Normalizar placas, cédulas y fechas; homologar las categorías históricas a los siete conceptos; listar filas rechazadas.
4. Cargar primero `busetas`, validar los conductores existentes y solo después insertar `mantenimiento_reportes` con las fechas originales.
5. Reconstruir `mantenimiento_alertas` por placa, concepto y ventana de 30 días. Para históricos no conviene depender del trigger fila a fila, porque `created_at` de la alerta quedaría en la fecha de importación.
6. Conciliar conteos de fuente, staging y destino; revisar muestras; cargar el delta entre extracción y corte antes de activar el módulo.

Antes de la importación se recomienda una migración 051 que agregue `origen` y `source_key` textual con índice único. `mantenimiento_reportes.source_id` es UUID y no garantiza que un ID legado numérico o alfanumérico pueda reutilizarse; una clave de origen hace la carga repetible sin duplicados.

## Cobertura de requisitos y pendientes

- El registro de daño valida buseta activa, conductor existente, concepto activo y fecha; cumple el flujo nuevo.
- El historial reciente muestra 30 reportes; no dispone aún de filtros, búsqueda ni paginación de historial completo.
- La alerta al segundo reporte de la misma placa y concepto en 30 días funciona para registros nuevos mediante trigger.
- El cierre guarda orden de taller, notas, responsable y fecha. Orden y notas son opcionales en la interfaz y no existe una vista de alertas cerradas; definir si deben ser obligatorios antes de producción.
- La auditoría cubre reporte creado, alerta abierta, alerta cerrada y buseta creada. La importación debe registrar también su origen y resultado.
- Falta cargar el maestro validado de busetas y determinar la fuente de los movimientos históricos.

## Próxima acción exacta

1. Identificar y proporcionar la fuente de movimientos existentes: acceso de solo lectura a la base, export CSV/Excel o definición de tablas.
2. Preparar el mapeo de campos y conceptos y el reporte de calidad previo a carga.
3. Crear y aprobar la migración 051 de idempotencia antes de insertar históricos.
4. Cargar el maestro real de busetas, validar conductores y ejecutar una importación de prueba en staging.
5. Conciliar, ejecutar el corte y probar: dos reportes mismo concepto/buseta en 30 días, cierre con orden/notas y auditoría.

## Actualización 2026-09-01 — renumeración a 056

Al sincronizar con `origin/main` se trajeron 7 commits del módulo Rotación (`489d610`…`7027f7f`, de VictorSandovalDev) que ya ocupan los números **050 a 055** de migración:

- `050_mapa_calor_pasajeros.sql`
- `051_mapa_calor_filtro_punto.sql`
- `052_mapa_calor_puntos_sin_nombre.sql`
- `053_mapa_calor_nombre_direccion.sql`
- `054_alarmas_registradora.sql`
- `055_mapa_calor_top_por_ubicacion.sql`

Por eso la migración de permisos de Mantenimiento pasó de `050` a **`056_mantenimiento_permisos_service_role.sql`**, y su instructivo a `docs/migracion-056-mantenimiento.md`. El contenido SQL no cambió: es el mismo script que ya se ejecutó a mano en la instancia autoalojada, así que **no hay que volver a correrlo** en esa base; el renombrado solo ordena el historial local para instalaciones nuevas.

La migración de idempotencia que aquí se planeaba como `051` (columnas `origen` y `source_key` con índice único, previa a importar históricos) debe crearse ahora como **`057`**.

Estado tras la sincronización: `main` == `origin/main` en `7027f7f`, sin conflictos con el trabajo de Mantenimiento. Se instalaron las dependencias nuevas de Rotación (`leaflet`, `leaflet.heat`, `@types/leaflet`) y `npx tsc --noEmit` pasa sin errores.

## Verificación del repo origen 2026-09-01 y plan de enganche al maestro

### Qué cambió en origen

Entre el 31 de agosto y el 1 de septiembre `origin/main` avanzó 14 commits (`489d610`…`9af64c5`), todos de VictorSandovalDev. **Ningún commit ajeno tocó Mantenimiento**: `git log --all -- "*mantenimiento*" "*busetas*"` sigue devolviendo solo `9ddab09`. Pero tres de esos commits cambian el contexto del módulo:

- **`057_vehiculos_gema.sql`** crea el maestro `vehiculos` (PK `codigo`), sincronizado por el cron `/api/cron/sync-gema` desde la vista MySQL `vst_ext_get_vehiculos`. Incluye `placa`, `marca`, `clase`, `ruta`, capacidades, fechas de SOAT/tecno y `cedula_conductor` + `conductor_nombre`. El encabezado de la migración deja constancia de que `busetas` (048) se mantuvo aparte a propósito, como catálogo manual.
- **`059_grants_service_role.sql`** resuelve el mismo problema de privilegios que se diagnosticó aquí, pero solo para `geo_direcciones`, `vehiculos` y `velocidades`. Confirma el diagnóstico y deja claro que la migración de Mantenimiento sigue siendo necesaria.
- **`062_timeout_service_role.sql`** fija `statement_timeout = 60s` para `service_role`. Es global y también aplica a Mantenimiento.

La numeración volvió a chocar: Victor ocupó 056–062, así que la migración de permisos de Mantenimiento pasó de `056` a **`063_mantenimiento_permisos_service_role.sql`**, con su instructivo en `docs/migracion-063-mantenimiento.md`. Tras el pull, `npx tsc --noEmit` pasa sin errores.

### Estado real de la base

Consultado por REST el 2026-09-01:

| Tabla | Filas |
|---|---|
| `vehiculos` | 202 (111 BUS, 91 BUSETA; 151 con `estado = 1`; placas únicas y sin nulos) |
| `conductores` | 1256 |
| `busetas` | 0 |
| `mantenimiento_conceptos` | 7 |
| `mantenimiento_reportes` | 0 |
| `mantenimiento_alertas` | 0 |

`gema_sync_state` reporta `vehiculos` y `conductores` sincronizados el 2026-09-01 a las 16:23 UTC con estado `ok`.

### Conclusión

El pendiente "cargar el maestro real de busetas" queda sin efecto: el maestro ya existe en Gestivo, tiene 202 vehículos reales y se refresca solo. El módulo apunta a la tabla equivocada. `cedula_conductor` ya referencia correctamente a `conductores`; solo falta corregir el lado de vehículos. Como `mantenimiento_reportes` y `mantenimiento_alertas` están vacías, el cambio de llave foránea no requiere migrar datos, pero esa ventana se cierra con el primer reporte.

### Decisiones tomadas

1. La llave será **`vehiculos.codigo`**, no la placa: es el PK del maestro, sobrevive a un cambio de placa y es la misma clave que Rotación ya usa (`codigo_vehiculo` en `velocidades` y en el mapa de calor). La placa queda como dato de despliegue.
2. Se **elimina `busetas`** junto con el alta manual: la sección "Agregar buseta al maestro", la Server Action `crearBusetaMantenimiento` y la acción de auditoría `buseta_creada`. Mantener un segundo maestro a mano solo lo desincroniza de GEMA.

### Plan por fases

**Fase 0 — cerrar lo abierto.** Commitear el bloque ya preparado (migración 063, propagación de errores de carga, cierre de alertas con orden y notas). Definir si `Wiki/` entra al repositorio.

**Fase 1 — migración 064, enganche al maestro.** Reemplazar `placa_buseta TEXT REFERENCES busetas(placa)` por `codigo_vehiculo TEXT REFERENCES vehiculos(codigo)` en `mantenimiento_reportes` y `mantenimiento_alertas`; reconstruir el índice único parcial de alerta abierta y el trigger `mantenimiento_detectar_recurrencia()` sobre la nueva columna; retirar la acción `buseta_creada` y hacer `DROP TABLE busetas`. No hacen falta GRANT nuevos: `vehiculos` ya los recibió en 057 y 059.

**Fase 2 — interfaz.** Selector de vehículo contra `vehiculos`, reutilizando el patrón de Rotación (`.from("vehiculos").select("codigo, placa").order("codigo")`). Retirar el alta manual. Autocompletar el conductor desde `vehiculos.cedula_conductor` del vehículo elegido, editable y con buscador contra `conductores`. Mostrar marca, clase y ruta como contexto al registrar el daño.

**Fase 3 — históricos.** Sigue bloqueada por falta de fuente. La migración de idempotencia (`origen` y `source_key` con índice único) pasa a ser la **065**. La homologación ahora se hace contra 202 placas reales y verificables.

**Fase 4 — endurecimiento.** Definir si `orden_taller` y `notas_cierre` son obligatorios; vista de alertas cerradas; filtros y paginación del historial; lograr que `npm run build` termine.

### Semántica de `vehiculos.estado` (confirmada 2026-09-01)

La migración 057 guarda `estado` tal como llega de GEMA y advierte que la vista no documenta su significado. Queda confirmado por el área: **`estado = 1` identifica que el vehículo está activo para su gestión**. Hay 151 vehículos en ese estado y 51 con `estado = 0`.

Por lo tanto el selector de vehículos del módulo debe filtrar por `estado = 1`. Conviene dejar el criterio escrito en el código, porque el campo no se autoexplica y la migración 057 no lo documenta.

## Fases 0, 1 y 2 ejecutadas 2026-09-01

**Fase 0.** Commit `be45cdb` (`fix(mantenimiento): dar acceso a service_role y exponer errores de carga`): migración 063, corrección de la 049, propagación de errores en `page.tsx`, cierre de alertas y `supabase/.temp/` ignorado. Sin push todavía. `Wiki/` quedó fuera del commit porque falta decidir si entra al repositorio.

**Fase 1.** Nueva migración `064_mantenimiento_maestro_vehiculos.sql` con su instructivo en `docs/migracion-064-mantenimiento-vehiculos.md`. Reemplaza `placa_buseta → busetas(placa)` por `codigo_vehiculo → vehiculos(codigo)` en `mantenimiento_reportes` y `mantenimiento_alertas`, reconstruye el índice único parcial de alerta abierta, el índice de recurrencia y la función `mantenimiento_detectar_recurrencia()` con la misma regla de 30 días, retira la acción de auditoría `buseta_creada` y hace `DROP TABLE busetas`. Arranca con una guarda que aborta si las tablas tienen filas, porque reconstruye la columna en vez de homologar datos. **Ejecutada en el SQL Editor de la instancia autoalojada el 2026-09-01.**

**Fase 2.** La aplicación ya consume el maestro:

- `page.tsx` carga `vehiculos` filtrando `estado = 1` y `conductores` filtrando `estado = 'ACTIVO'`, y hace los joins de los listados contra `vehiculos(placa)`.
- `actions.ts` valida el vehículo contra el maestro, registra `codigo_vehiculo` y guarda también la placa en el detalle de auditoría para que el registro se lea sin cruzar tablas. Se eliminaron `crearBusetaMantenimiento` y su tipo.
- `mantenimiento-client.tsx` reemplaza el selector de busetas por uno de vehículos etiquetado `código — placa`, cambia el campo libre de cédula por un selector de conductores activos, propone automáticamente el conductor asignado al vehículo en GEMA dejándolo editable, muestra clase, marca y ruta como contexto, y retira la sección de alta manual. El indicador pasó a llamarse "Vehículos activos".

### Verificación de integridad previa

Antes de escribir la migración se comprobó contra la base que los 135 conductores distintos asignados a vehículos con `estado = 1` existen todos en `conductores` y que todos están en estado `ACTIVO`. El autocompletado no puede violar la llave foránea `mantenimiento_reportes.cedula_conductor → conductores(cedula)`.

### Validaciones

`npx tsc --noEmit` sin errores y `npm run lint` sin hallazgos en los archivos del módulo. Los 45 errores de lint que reporta el repositorio son previos y están en Rotación y en `src/lib`.

## Verificación posterior a la 064

Comprobado por REST contra la instancia autoalojada el 2026-09-01, después de ejecutar la migración:

- `busetas` responde `404`: la tabla ya no existe.
- `codigo_vehiculo` responde `200` en `mantenimiento_reportes` y en `mantenimiento_alertas`; `placa_buseta` responde `400` en ambas, es decir que la columna desapareció.
- PostgREST reconoce la nueva llave foránea: los embebidos `vehiculos(placa)` funcionan desde reportes y desde alertas.
- Las cinco consultas exactas que hace `page.tsx` responden correctamente: 151 vehículos activos, 193 conductores activos, 7 conceptos, 0 reportes y 0 alertas.

El trigger de recurrencia se probó de punta a punta el 2026-09-01 con datos marcados como prueba, que se borraron al terminar.

## Acceso a la base para DDL

Quedó documentado que desde la sesión de Claude Code no hay forma de ejecutar DDL contra la instancia autoalojada: no hay `psql` ni Supabase CLI instalados, `.env` no trae cadena de conexión Postgres (solo la URL de Kong y las llaves JWT) y no existe ninguna función RPC que ejecute SQL. El MCP de Supabase y `supabase/.temp/` apuntan al proyecto cloud `lqeddrpbwunzcyjxuiei`, que **no** es la base de Gestivo. Las migraciones se ejecutan pegando el script en el SQL Editor del Studio autoalojado.

## Prueba del trigger de recurrencia 2026-09-01

Ejecutada contra la instancia autoalojada con el vehículo `1022` (placa LJO712), el concepto "Otro" y su conductor asignado. Los cuatro reportes llevaban la descripción `PRUEBA TRIGGER 064 - borrar`.

| Paso | Resultado |
|---|---|
| Primer reporte | No abre alerta y queda con `alerta_id` nulo, como corresponde |
| Segundo reporte | Abre la alerta con `cantidad = 2`, marca los dos reportes con su `alerta_id` y registra `alerta_abierta` en la auditoría |
| Tercer reporte | Sube `cantidad` a 3 sobre la misma alerta; el índice único parcial impide una segunda alerta abierta |
| Cierre de la alerta | Guarda estado, orden de taller y notas |
| Cuarto reporte tras el cierre | Abre una alerta nueva y deja la anterior cerrada, que es el comportamiento buscado del índice parcial |

Después se borraron los cuatro reportes y las dos alertas. Las eliminaciones en cascada dejaron la auditoría vacía: `mantenimiento_reportes`, `mantenimiento_alertas` y `mantenimiento_auditoria` quedaron en cero, y `mantenimiento_conceptos` (7), `vehiculos` (202) y `conductores` (1256) intactos.

### Detalle de negocio por definir

Al cerrar una alerta el contador no se reinicia: el cuarto reporte abrió una alerta que dice `cantidad = 4` aunque tres de esos reportes ya se habían atendido y cerrado. El conteo es el total de reportes del vehículo y concepto en la ventana de 30 días, no los pendientes desde el último cierre. Viene así desde la 049 y se conservó a propósito. Conviene decidir en la fase de endurecimiento si la alerta nueva debe contar solo desde el cierre anterior.

## Corrección: los embebidos de PostgREST no son arreglos

La prueba destapó un error heredado del commit `9ddab09`. `page.tsx` embebe `mantenimiento_conceptos(nombre)`, `conductores(nombre)` y ahora `vehiculos(placa)`, y el cliente los leía como arreglo con `[0]?.nombre`. PostgREST devuelve un **objeto** cuando la relación es de muchos a uno, así que esos accesos siempre daban `undefined`: la tabla de reportes habría mostrado la cédula cruda en vez del nombre del conductor y un guion en vez del concepto. Nunca se notó porque las tablas estaban vacías.

Corregido: los tipos `Reporte` y `Alerta` declaran objeto anulable, los accesos usan `?.` y `page.tsx` aplica `.returns<Reporte[]>()` y `.returns<Alerta[]>()`, porque sin tipos generados supabase-js infiere arreglo y contradice lo que llega en tiempo de ejecución.

## Publicación y tercera renumeración 2026-09-01

Al ir a subir los tres commits, `origin/main` había avanzado otros 12 commits de Rotación (`7ad5d1d`…`6540151`), que no tocan ningún archivo de Mantenimiento pero **volvieron a ocupar los números 063 y 064**, los mismos que usaban las dos migraciones del módulo. Es la tercera colisión de numeración en la misma jornada: 050 → 056 → 063 → 072.

Se hizo rebase de los tres commits sobre `origin/main` (limpio, sin conflictos de archivo) y las migraciones pasaron a:

- `072_mantenimiento_permisos_service_role.sql` con `docs/migracion-072-mantenimiento.md`
- `073_mantenimiento_maestro_vehiculos.sql` con `docs/migracion-073-mantenimiento-vehiculos.md`

Solo cambiaron el nombre del archivo y las referencias cruzadas del texto; el SQL es idéntico. Las dos ya estaban aplicadas en la instancia autoalojada, donde las migraciones se ejecutan a mano en el SQL Editor y no hay tabla que registre el nombre del archivo, así que la renumeración no obliga a reejecutar nada.

Publicado en `origin/main` como `6540151..0bef4d7`, cuatro commits:

- `9ca4128` permisos de `service_role` y errores de carga visibles
- `c671b02` enganche al maestro de vehículos de GEMA
- `f222462` embebidos de PostgREST leídos como objeto
- `0bef4d7` renumeración a 072 y 073

### Problema de proceso, resuelto el mismo día

Tres colisiones en un día no son casualidad: dos personas numeraban migraciones a mano sobre la misma secuencia y quien llegaba segundo siempre renumeraba. Se implementó un sistema para que no vuelva a pasar; ver la sección siguiente.

## Sistema contra colisiones de migraciones 2026-09-01

Publicado en `fb1acb5`. Las migraciones nuevas se crean con marca de tiempo UTC en segundos, así que dos personas trabajando en paralelo ya no pueden tomar el mismo nombre.

| Pieza | Qué hace |
|---|---|
| `npm run migracion:nueva -- "descripcion"` | Crea `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql` con una plantilla que recuerda las reglas de esta instalación. Normaliza tildes y mayúsculas, y avanza un segundo si el nombre ya existe |
| `npm run migracion:verificar` | Valida la carpeta entera, sin dependencias |
| `.githooks/pre-commit` | Corre el verificador antes de cada commit. Se activa con `npm run hooks:instalar`, una vez por clon |
| `.github/workflows/migraciones.yml` | Corre el verificador en cada push y pull request que toque migraciones. Es la red que cubre a todo el equipo sin que nadie configure nada |
| `docs/migraciones.md` y `AGENTS.md` | La convención escrita, y la regla para las sesiones de agentes |

### Por qué el verificador tiene dos niveles

Mientras se implementaba, Victor subió `074`, `075` y `076` secuenciales. Un verificador que rechazara toda migración numerada a mano le habría roto CI a alguien que ni siquiera conocía la convención todavía, así que se separó lo objetivo de lo social:

- **Error, siempre:** dos archivos con el mismo prefijo, o un nombre fuera de las dos formas válidas. Es el daño concreto, porque dos migraciones con el mismo prefijo no tienen orden de ejecución definido.
- **Aviso, por ahora:** una migración secuencial nueva. Recuerda usar el generador pero no bloquea.

El aviso se convierte en error poniendo `SECUENCIAL_NUEVA_ES_ERROR = true` en `scripts/verificar-migraciones.mjs`. **Está pendiente acordarlo con Victor antes de activarlo.**

### Orden de ejecución preservado

Como `0` es menor que `2`, el histórico `001`–`076` sigue ordenándose antes que cualquier archivo `2026…`. No hubo que renombrar ninguna de las 77 migraciones existentes.

### Comprobaciones hechas

El verificador se probó con los cuatro casos: estado limpio, secuencial nueva por encima de 076, prefijo repetido y nombre fuera de convención. El hook se probó intentando commitear una migración inválida: el commit quedó detenido y `HEAD` no se movió. El generador se probó con una descripción con tildes y mayúsculas, y el archivo resultante ordena después de las secuenciales.

## Análisis del sistema origen Da-o_Busetas 2026-09-01

Repositorio: `https://github.com/administradordatos-mtc/Da-o_Busetas.git`. Base de datos: el proyecto Supabase Cloud **`lqeddrpbwunzcyjxuiei`**, el mismo al que apuntaba `supabase/.temp/` y que se había descartado por no ser la base de Gestivo. Es la base origen y se puede leer desde aquí.

Es una aplicación web estática (HTML, CSS y JavaScript sin framework) sobre Supabase, con Edge Functions para crear usuarios y cambiar contraseñas, desplegada en Vercel.

### Cobertura real de Gestivo frente al legado

| Módulo del legado | Estado en Gestivo |
|---|---|
| Formulario público del conductor, sin login, identificándose por cédula | **No existe.** Es la puerta de entrada de los datos |
| Reportes con filtros de vehículo, concepto y rango de fechas, más exportación CSV | Parcial: una tabla fija de los últimos 30, sin filtros ni exportación |
| Alertas: cierre con orden de taller y notas, y ver los registros que la originaron | Parcial: falta ver los registros de la alerta y la vista de alertas cerradas |
| Conductores: catálogo y carga masiva por CSV | Cubierto por el maestro de GEMA |
| Busetas: catálogo con número interno | Cubierto por el maestro de GEMA |
| Conceptos de daño: administración | **No existe** |
| Graduación de frenos: bitácora por vehículo | **No existe** |
| Reportes de frenos: indicadores del mes, vehículos vencidos, resumen por vehículo, historial filtrable con CSV y PDF del formato CPA-R-31 | **No existe** |
| Usuarios y roles | Cubierto por los permisos de Gestivo |
| Tablero: cinco contadores y las alertas abiertas más frecuentes | Parcial: tres indicadores |

### Los siete conceptos de Gestivo no corresponden a la operación

El origen tiene **quince categorías mecánicas** y así se ha venido reportando:

| Concepto | Reportes |
|---|---|
| FRENOS | 27 |
| ELECTRICO (Otros) | 8 |
| FUGA DE AIRE | 6 |
| EMBRAGUE | 3 |
| SUSPENSION | 3 |
| LUCES DIRECCIONALES | 2 |
| DIRECCION, LLANTAS, LUCES INTERNAS, LUCES TRASERAS, MOTOR, TRANSMISION | 1 cada uno |
| CAJA DE VELOCIDADES, FUGAS DE ACEITE, LUCES DELANTERAS | 0 |

Gestivo precargó otros siete inventados: Carrocería/Golpes, Vidrios/Espejos, Motor/Mecánica, Llantas/Frenos, Sistema Eléctrico, Interior/Asientos y Otro. No homologan: "Llantas/Frenos" mezclaría FRENOS, que es casi la mitad de los reportes y tiene su propio módulo, con LLANTAS, que tiene uno. Los conceptos de Gestivo deben reemplazarse por los quince reales antes de que se registre cualquier reporte de verdad.

### El sistema legado está en producción

El último reporte es del **2026-09-01**, hoy. Hay 55 reportes desde el 2026-06-02, sobre 32 vehículos y 35 conductores, y 5 alertas. No es un archivo histórico que se importa una vez: hay que planear un corte.

### La homologación no tiene pérdidas

- Las 60 placas activas del origen **existen todas** en `vehiculos` de GEMA. 57 con `estado = 1` y 3 con `estado = 0`.
- Las 35 cédulas con reportes **existen todas** en `conductores` de Gestivo. Nueve están `RETIRADO`, así que la importación debe validar contra el maestro completo y no contra los activos: estaban vigentes cuando se hizo el reporte.

### Formato controlado del SGC

El módulo de frenos genera el PDF del formato **CPA-R-31**, con logo, código, versión y fecha en cada página. Es cumplimiento documental, no un adorno, y hay que replicarlo tal cual.

### Detalles de diseño del legado que conviene conservar

- `graduaciones_frenos` obliga por restricción de base de datos a escribir la observación cuando **no** se graduó.
- La vista `vw_frenos_resumen_vehiculo` trata "nunca graduado" como el caso más grave, no como cero días.
- La sincronización masiva de conductores desactiva a quien desaparece del archivo pero tiene historial, y solo borra a quien no lo tiene. Esa política vale para cualquier carga masiva futura.
- El formulario público identifica al conductor por cédula y le muestra el vehículo por **número interno**, no por placa. En Gestivo el equivalente es `vehiculos.codigo`.

## Fases A, B y D ejecutadas 2026-09-01

**Fase A — conceptos reales.** Los siete conceptos inventados se reemplazaron por los quince de la operación, aplicados en la instancia autoalojada y recogidos en la migración `20260901201601_conceptos_reales_de_mantenimiento.sql`, la primera creada con el generador nuevo. Durante la sustitución el catálogo quedó vacío unos segundos: el primer intento borró los siete y su inserción falló por la codificación de las tildes en la línea de comandos. Se reintentó escribiendo el JSON a un archivo y entró completo. No hubo daño porque nada referenciaba los conceptos, con reportes y alertas en cero.

**Fase B — formulario público.** Ruta `/reportar-dano`, en un grupo `(publico)` nuevo. Como el proyecto protege página por página y no existe middleware, basta con no pedir permisos. El flujo replica el legado: cédula, confirmación del nombre, vehículo, tipo de daño y descripción opcional.

Diferencias de seguridad frente al legado, que exponía `conductores` entero con la clave anónima:

- El maestro de conductores nunca sale al navegador; se valida una cédula a la vez contra el servidor.
- Los vehículos y los conceptos solo se entregan cuando la cédula resulta válida.
- La Server Action revalida cédula, vehículo y concepto al guardar.
- La fecha la pone el servidor y la auditoría marca `origen: formulario_publico`.
- La página va con `robots: noindex`.

Queda pendiente decidir si se limita la enumeración de cédulas. Cualquiera con la URL puede probar números y ver si existen, igual que en el legado, pero ahora bajo el dominio de Gestivo.

**Fase D — graduación de frenos.** Migración `20260901202556_graduacion_de_frenos.sql`, aplicada y verificada. Tres piezas: la captura en `/mantenimiento/frenos`, los reportes en `/mantenimiento/frenos/reportes` y el PDF del formato CPA-R-31. Mantenimiento pasó a ser un grupo de tres páginas en el menú.

Al portarlo, la llave dejó de ser la placa y pasó a `vehiculos.codigo`. Ese código **es** el número interno con el que el formato en papel identifica cada vehículo, y es la llave primaria del maestro, así que desaparece el problema de las busetas sin número interno y sobra la nota de advertencia que imprimía el PDF original.

`jspdf` y `jspdf-autotable` son dependencias nuevas: el proyecto no tenía librería de PDF y su patrón `(print)` no produce "Página N de M" de forma fiable en Chrome. Se importan dinámicamente, así que solo pesan cuando alguien pide el formato.

### Verificación de la migración de frenos

Comprobado por REST tras aplicarla: la tabla y el embebido `vehiculos(placa)` responden `200`, y la vista devuelve los 151 vehículos activos.

La restricción de negocio quedó probada con datos, que después se borraron:

| Caso | Resultado |
|---|---|
| Sin graduar y sin observación | Rechazado con `23514`, el código que la Server Action traduce a un mensaje claro |
| Sin graduar con observación | Aceptado |
| Graduado | Aceptado, y la vista muestra `dias_desde_ultima = 0` |

Detalle que confirma la regla portada: el vehículo con un registro de **no** graduación sigue contando como nunca graduado, con `ultima_graduacion` y `dias_desde_ultima` en NULL. Un registro no es una graduación.

Publicado en `origin/main` como `4090794`.

## Fase C ejecutada 2026-09-01

Publicada en `54f67b9`. Completa lo que el sistema origen ya tenía y aquí faltaba, siguiendo su estructura: registro, historial y alertas en páginas propias en vez de amontonarlo todo en una.

**`/mantenimiento/reportes`.** Historial con filtros de vehículo, concepto y rango de fechas, más un filtro de solo los que generaron alerta. Exportación CSV y contador de cuántos quedan visibles. Carga hasta mil reportes y filtra en el cliente, el mismo tope del sistema origen: a unos veinte reportes al mes cubre varios años y cambiar de filtro no cuesta un viaje al servidor.

**`/mantenimiento/alertas`.** Abiertas y cerradas, que antes no se podían consultar. Cada alerta despliega los reportes que la originaron, para poder revisarla antes de cerrarla; ese detalle se pide una sola vez y se conserva mientras dure la página. El cierre con orden de taller y notas se movió aquí desde la portada. Exportación CSV.

**`/mantenimiento`.** Queda en lo suyo: capturar el daño y ver lo reciente. Los indicadores llevan a su página y las alertas se muestran sin el formulario de cierre, igual que el tablero del sistema origen.

El helper de CSV se extrajo a `src/lib/mantenimiento/csv.ts` y lo comparten las cuatro páginas que exportan; estaba duplicado en el módulo de frenos. El punto y coma como separador y el BOM al inicio hacen que Excel en español abra el archivo sin asistente de importación.

Mantenimiento pasó a cinco entradas en el menú: Registrar daño, Reportes de daños, Alertas, Graduación de frenos y Reportes de frenos.

`npx tsc --noEmit` y ESLint sin hallazgos, y las tres consultas nuevas verificadas por REST contra la instancia.

## Estado del plan al cierre del 2026-09-01

| Fase | Estado |
|---|---|
| A — conceptos reales | Hecha y aplicada |
| B — formulario público del conductor | Hecha |
| C — historial filtrable y gestión de alertas | Hecha |
| D — graduación de frenos y formato CPA-R-31 | Hecha y aplicada |
| E — corte y migración desde el sistema origen | Pendiente |

Pendientes menores: decidir si `Wiki/` entra al repositorio, si se limita la enumeración de cédulas en el formulario público, si el contador de una alerta nueva debe partir del cierre anterior en vez de contar toda la ventana de 30 días, y lograr que `npm run build` termine, que sigue sin comprobarse desde el 2026-08-25.

## El build sí pasa, y destapó un fallo del formulario público 2026-09-01

`npm run build` termina correctamente. El bloqueo de Windows que lo impedía desde el 2026-08-25 es un `EPERM` al borrar la salida del build anterior en `.next\serverpp\(dashboard)\mantenimiento`, y se resuelve borrando `.next` antes de compilar. Ocurre porque el repositorio vive dentro de una carpeta sincronizada por OneDrive, que mantiene abiertos los archivos que está subiendo. La primera compilación de la jornada pasa; la siguiente falla hasta limpiar.

### Next 16 renombró `middleware.ts` a `proxy.ts`

Al montar el formulario público se buscó `middleware.ts`, no apareció nada y se concluyó que Gestivo protegía solo página por página. Es falso: existe **`src/proxy.ts`** y redirige a `/login` todo lo que no esté en su lista de rutas públicas, que hasta ahora era `/login`, `/recuperar-contrasena`, `/nueva-contrasena`, `/_next`, `/api`, `/docs` y `/favicon.ico`.

Es decir, `/reportar-dano` **no era alcanzable**: el conductor terminaba en una pantalla de acceso que no puede usar. El módulo se habría dado por entregado sin que el formulario sirviera.

Corregido en `85a9cd5` agregando la ruta a esa lista. La excepción cubre también sus Server Actions, que se envían a la misma ruta.

Comprobado contra el servidor de producción levantado desde el build:

| Ruta | Respuesta |
|---|---|
| `/reportar-dano` | `200`, y el HTML trae el formulario y la marca `noindex` |
| `/mantenimiento` | `307` a `/login` |
| `/mantenimiento/alertas` | `307` a `/login` |
| `/login` | `200` |

El build lista las cinco rutas de Mantenimiento como dinámicas y `/reportar-dano` como estática, que es lo deseable: el armazón se sirve prerenderizado y todo el trabajo lo hacen las Server Actions.

**Lección para el resto del proyecto.** `AGENTS.md` advierte que esta versión de Next no es la conocida y que hay que leer las guías de `node_modules/next/dist/docs/` antes de escribir código. Este fallo es exactamente lo que esa advertencia previene: buscar por el nombre viejo de un archivo y deducir arquitectura de un resultado vacío. Conviene comprobar cualquier conclusión sobre enrutado o protección contra la aplicación levantada, no solo contra el árbol de archivos.

## Patrones de interacción del sistema origen 2026-09-01

Publicados en `7cfb754` y `7adc36e`. Se replican los **comportamientos** de Da-o_Busetas, no su paleta: el sistema origen usa la identidad corporativa (rojo `#C22219`, dorado `#DCBE61`, Bebas Neue), pero pintar de rojo un solo módulo de Gestivo chocaría con los otros veinte. La decisión del área fue traer la interfaz de funcionamiento, no la de colores.

### Cierre de alertas con selección de reportes

Era el hueco grande. Antes se cerraba desde la tarjeta con dos campos sueltos. Ahora abre un panel con el contexto de la alerta —vehículo, concepto, cuántos reportes, fecha del último— y la lista de los que la originaron, y se elige cuáles cierra esa intervención.

Los que se desmarcan quedan **desvinculados**: siguen en el historial pero sueltos, y pueden generar una alerta nueva. No es un adorno: es el caso "no es reproceso" que aparece literalmente en las notas de cierre reales del origen, por ejemplo *"El primer ingreso por fuga de aire fue por diafragma chillón, el segundo por una bombona, no es reproceso"*.

**Orden de taller y notas pasan a ser obligatorias.** Eso resuelve la duda que quedaba abierta desde el 2026-08-25: la respuesta estaba en el sistema en producción, donde ya lo eran.

La desvinculación filtra por `alerta_id` además de por `id`, para que un cliente manipulado no pueda soltar reportes de otra alerta. `cantidad` no se recalcula: registra cuántos reportes dispararon la alerta, y además la tabla exige `cantidad >= 2`.

### Reportes de frenos

Las tres secciones se pliegan y recuerdan cómo las dejó cada quien, en `localStorage` por navegador. Solo el título pliega, para poder usar el selector de umbral sin cerrar la sección. El resumen por vehículo se ordena por cualquier columna, con "nunca graduado" al final en ascendente.

### Los cinco contadores del tablero

El tablero mostraba tres y uno engañaba: "Reportes recientes" contaba las filas que cupieron en la tabla de la página, no los reportes que hay. Ahora son cinco, contados en la base: Reportes, Alertas abiertas, Frenos vencidos, Vehículos activos y Conductores activos. Los tres primeros llevan a su página.

La carga masiva de conductores por CSV que tiene el origen **no se porta**: ese maestro ya llega sincronizado desde GEMA. Decisión del área.

### Comprobado con datos reales

Tres reportes abren la alerta con `cantidad = 3`. Se cierra desvinculando uno: los dos marcados quedan ligados a la alerta cerrada y el tercero con `alerta_id` nulo. Un reporte nuevo abre una alerta nueva. Todo se borró al terminar y las tablas quedaron en cero.

Los contadores responden 151 vehículos activos, 193 conductores activos y 151 vencidos con la bitácora de frenos aún vacía.

`npm run build` termina correctamente con las cinco rutas del módulo como dinámicas y `/reportar-dano` como estática.

### Sutileza que sigue abierta

El trigger solo engancha reportes con `alerta_id` nulo **anteriores** al que lo dispara. Un reporte ya ligado a una alerta cerrada nunca se re-engancha, pero sí sigue contando para la recurrencia. Es la misma raíz del asunto ya anotado: el contador no parte del último cierre, cuenta toda la ventana de 30 días. El cierre selectivo lo alivia, porque ahora se puede soltar lo que no era reproceso, pero no lo resuelve del todo.

## Corte ejecutado 2026-09-01

El módulo de Mantenimiento de Gestivo reemplaza a Da-o_Busetas desde hoy.

### Congelamiento del sistema anterior

En el proyecto origen `lqeddrpbwunzcyjxuiei` se revocó toda la escritura a `anon` y `authenticated` sobre `registros_danos`, `alertas_recurrencia` y `graduaciones_frenos`. Quedan con solo `SELECT`: la base sigue consultable como archivo y nadie puede escribir. Es reversible con un `GRANT`.

El primer `REVOKE` de INSERT, UPDATE y DELETE resultó insuficiente: `anon` conservaba **`TRUNCATE`**, heredado de los grants por defecto del schema `public` de Supabase. Es decir que cualquiera con la clave anónima —que va en el JavaScript del navegador, o sea pública— podía vaciar las tablas. Se cerró con `REVOKE ALL` seguido de `GRANT SELECT`. **Conviene revisar si el resto de tablas de ese proyecto tienen la misma sobre-concesión**, aunque ya solo sea un archivo.

### Carga

Se aplicó la migración de `source_id` y después el script `supabase/imports/2026-09-01-da-o-busetas.sql`. En el primer intento el script falló con `42703: column "source_id" of relation "mantenimiento_alertas" does not exist`, porque se corrió antes que la migración; el editor hizo rollback y no quedó nada a medias.

No hubo delta: el origen seguía en 55, 5 y 1 desde la extracción, así que la foto del script era exacta.

### Verificación posterior

| Comprobación | Resultado |
|---|---|
| `mantenimiento_reportes` | 55, todos con `source_id` |
| `mantenimiento_alertas` | 5, todas con `source_id` |
| `mantenimiento_frenos` | 1, con `source_id` |
| `mantenimiento_auditoria` | 55 filas, una por reporte importado |
| Reportes enlazados a una alerta | 10, los mismos del origen |
| Rango de fechas | 2026-06-02 a 2026-09-01, intacto |

Las cinco alertas conservaron su estado y su cierre, y la homologación de placa a código del maestro funcionó en todas:

| Placa | Código | Concepto | Estado |
|---|---|---|---|
| TZM643 | 548 | LUCES DIRECCIONALES | cerrada, OTD-PRUEBA CONTROL |
| WPW127 | 564 | ELECTRICO (Otros) | cerrada, orden "1" |
| TDU373 | 514 | FRENOS | cerrada, OTD-2026060081 |
| TDU372 | 507 | FRENOS | cerrada, OTD-2026060305 |
| TDV340 | 529 | FRENOS | **abierta**, pendiente de gestionar |

Los dos registros nacidos de la prueba de auditoría se conservaron, por decisión del área: el reporte `278b9fba` y la alerta `0aed2ae2`.

### Lo que queda por hacer fuera del código

1. Anunciar a los conductores la dirección nueva del formulario, `/reportar-dano`, y retirar la del legado.
2. Bajar o pausar el despliegue del legado en Vercel. La base ya no acepta escrituras, pero el sitio sigue en pie y un conductor que entre verá un error al guardar en vez de una indicación clara.
3. Gestionar la alerta abierta del vehículo 529 por FRENOS, que llegó viva desde el origen.
4. Probar el formulario público de punta a punta desde un celular con una cédula real. Está verificado que la página carga y que las Server Actions están bien construidas, pero nadie ha completado un reporte por ahí.
