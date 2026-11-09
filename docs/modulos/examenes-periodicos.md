# Exámenes periódicos (SST)

Módulo de Recursos Humanos – SST para controlar los **exámenes médicos
ocupacionales periódicos**:

- registra cada atención;
- calcula el próximo examen;
- alerta los vencidos y los que están por vencer.

Reemplaza el Excel «LISTADO PERSONAL EXAMEN PERIODICO».

- **Ruta**: `/examenes-periodicos` (menú Recursos Humanos, debajo de «Accidentes de trabajo»).
- **Código**:
  - `src/lib/sst/examenes.ts`: reglas puras;
  - `src/lib/sst/examenes-historico.ts`: lector del Excel, puro;
  - `src/lib/sst/examenes-data.ts`: acceso y lectura;
  - `src/app/(dashboard)/examenes-periodicos/`: página, acciones y formularios.
- **Migración**: `20261105161614_sst_examenes_periodicos.sql`.
- **Pruebas**: `npm run test:sst`.

---

## 1. Modelo

| Tabla o vista | Una fila es | Notas |
|---|---|---|
| `sst_examenes_personas` | una persona en control (PK `cedula`) | Equivale a las hojas de control del Excel. Guarda `grupo`, `fecha_ingreso`, `periodicidad_meses` y si sigue en control (`activo`, `motivo_inactivo`, `inactivo_desde`). |
| `sst_examenes_periodicos` | una atención | Guarda `fecha_atencion`, `fecha_entrega`, `periodicidad_meses`, `proximo_examen`, `recomendaciones` y `observaciones`. Se anula con motivo: nada se borra. Hay una sola atención vigente por cédula y fecha. |
| `sst_examenes_estado` (vista) | una persona **activa** | El semáforo de hoy. **Sin datos de salud.** La usa el MCP. |
| `sst_examenes_atenciones` (vista) | una atención no anulada | Trae `tiene_recomendaciones` en lugar del texto. **Sin datos de salud.** La usa el MCP. |

Las dos tablas tienen RLS sin políticas y `GRANT` solo a `service_role`, como el resto de RRHH.

**Grupos de control**: son las cinco hojas de control del Excel.

| Clave | Grupo |
|---|---|
| `conductores` | Conductores de La Carolina |
| `administrativos` | Administrativos de La Carolina |
| `reubicados` | Reubicados de La Carolina |
| `metrorecaudo` | Metrorecaudo |
| `anaya_giraldo` | Anaya Giraldo |

## 2. Reglas de vencimiento

- **Próximo examen** = fecha de atención + periodicidad, en meses calendario. Si el día no existe en el mes de llegada, se toma el último del mes (31-ene + 1 = 28/29-feb).
  - La periodicidad es de 12 meses por defecto y se cambia en cada examen según el concepto médico. Algunos administrativos y Metrorecaudo tienen 24 o 36.
  - El próximo examen lo calcula la aplicación al guardar y queda en `proximo_examen`.
- **Persona sin exámenes periódicos**: el primer examen vence a **fecha de ingreso + periodicidad de la persona**, porque el examen de ingreso cuenta como el primero. Así lo calculaba el Excel: se comprobó en 122 de 124 conductores y en los administrativos de 24 o 36 meses. En pantalla aparece como «desde el ingreso».
- **Estado** a la fecha de Bogotá. La regla está en `estadoExamen`:

  | Estado | Cuándo |
  |---|---|
  | `vencido` | El próximo examen ya pasó. |
  | `por_vencer` | Faltan 30 días o menos, hoy incluido (`POR_VENCER_DIAS`). |
  | `vigente` | Faltan más de 30 días. |
  | `sin_examen` | No hay examen ni fecha de ingreso. |

- **Quién cuenta**: solo las personas **activas** en control. Sacar a alguien del control (retirado u otro motivo) lo quita de los vencimientos, pero conserva su historial.
  - La pantalla marca «Retirado en el maestro» cuando GEMA (`conductores.estado`) o Empleados (`employees.status`) lo dan por retirado y sigue activo en el control. Si alguno de los dos maestros lo tiene activo, gana el activo.
  - Si a una persona inactiva se le registra un examen posterior a su salida, vuelve al control.
- **Reingreso**: si el último examen es anterior a la fecha de ingreso (se retiró y volvió), el próximo se cuenta desde el ingreso.

## 2.1 Profesiograma

El profesiograma de la ARL da la periodicidad por empresa y cargo, y el **proceso** del cargo: administrativo cada 36 meses, administrativo-operativo cada 24 y operativo cada 12 (Conductor-cobrador, Auxiliar de ruta, mantenimiento, oficios varios, Vigilante, Escolta).

- **Dónde vive**: tabla `sst_profesiograma` (migración `20261109213335`), sembrada con el documento de Chess Consultorías del 05/10/2025. Cada versión guardada queda en `sst_profesiograma_cargas` (archivo o edición, quién, cuándo, qué cambió y a cuántas personas se aplicó). Sin la migración se usa la constante de `src/lib/sst/profesiograma.ts` (la misma versión) y no se puede editar.
- **Cómo se actualiza** (pestaña **Profesiograma**, permiso editar):
  - **Subir Excel nuevo**: `src/lib/sst/profesiograma-excel.ts` lee las hojas LA CAROLINA, METRORECAUDOS y ANAYA GIRALDO (columna «CARGO», «Tipo Proceso» y «Periodicidad del EMO (Res 1843)»; la fecha sale de «FECHA DE ACTUALIZACION»). Muestra los cambios y los avisos antes de guardar. Una empresa cuya hoja no viene conserva sus cargos.
  - **Editar cargos**: agregar, quitar o cambiar nombre, proceso y meses.
  - Se guarda la versión completa en una transacción (`sst_reemplazar_profesiograma`).
- **Personas afectadas**: al guardar, se listan las personas activas del control a las que el profesiograma nuevo les cambia la periodicidad (`personasAfectadas`). Vienen marcadas las que tenían la del profesiograma anterior; las que tienen una periodicidad ajustada (concepto médico) vienen sin marcar. Se aplica solo a las elegidas. Los exámenes ya registrados no cambian: afecta el vencimiento de quien aún no tiene exámenes y la periodicidad que se propone en el próximo examen.
- `periodicidadPorCargo(cargo, grupo, tabla)` busca el cargo sin tildes ni erratas; conductores y reubicados son «Conductor - Cobrador». Un cargo que no está toma 12 meses y se marca «fuera del profesiograma».
- Se usa al entrar al control (sincronización, «Agregar al control» y el primer examen de alguien nuevo) y en el filtro **Proceso**. Es una sugerencia: el concepto médico de cada examen la puede cambiar.

## 2.2 Sincronización con GEMA (GMAS)

Cada noche, después del sync de GEMA (`/api/cron/sync-gema`), y con el botón «Sincronizar ahora» de la pestaña Control, `sincronizarControlExamenes` (`src/lib/sst/examenes-sincronizar.ts`, reglas en `examenes-sincronizacion.ts`) cruza el control con `conductores` y `employees`:

| Novedad | Cuándo | Qué hace |
|---|---|---|
| Ingreso | Activo en GEMA y no está en el control (y su fecha de ingreso ya llegó) | Entra con grupo (reubicado → Reubicados, conductor → Conductores, empleado → Administrativos), cargo, fecha de ingreso y periodicidad del profesiograma. Su primer examen vence a ingreso + periodicidad. `origen = 'gema'`. |
| Retiro | Activo en el control (grupos de La Carolina) y retirado en GEMA | Sale del control: motivo «retirado», desde la fecha de retiro de GEMA. |
| Reingreso | Salió por retiro y GEMA lo tiene activo con ingreso posterior | Vuelve con la nueva fecha de ingreso. |
| Completar | Le falta fecha de ingreso o cargo en el control | Se toman de GEMA. Lo que SST escribió no se cambia. |

- Cada novedad queda en `sst_examenes_novedades` y se ve en «Novedades de GEMA» (últimos 30 días).
- Metrorecaudo y Anaya Giraldo no están en GEMA: se siguen llevando a mano.
- Si GEMA trae 0 conductores o 0 empleados no se hace nada (lectura fallida, no retiro masivo).
- **Arranque**: la sincronización solo escribe si existe `sst_examenes_novedades` (migración `20261109211226`). Antes de aplicarla: `npm run sst:examenes-sincronizar -- --ensayo` deja el informe (con cédulas, no va al repositorio) en `<tmp>/sst-examenes-sincronizacion/`. El ensayo del 2026-11-09 dio 14 ingresos, 53 retiros y un cargo fuera del profesiograma.

## 3. Pantalla

- **Control**:
  - filtros: **Situación** (activos por defecto, inactivos o todos), estado, grupo, **proceso** (administrativo, administrativo-operativo, operativo o fuera del profesiograma, según el cargo), texto y **rango del próximo examen** (año o Desde/Hasta; vacío por defecto);
  - cifras: en control, vencidos, por vencer, sin examen y vigentes; al hacer clic en una se filtra por ese estado;
  - «Novedades de GEMA» y «Sincronizar ahora» (quien tenga crear);
  - una fila por persona con el semáforo («Vencido hace N días» o «Faltan N días»), ordenadas con lo urgente primero;
  - el historial de exámenes al expandir la fila;
  - exportación a xlsx o csv **sin** recomendaciones.
- **Atenciones**: cada examen con su entrega y sus recomendaciones. Se filtra por **rango de fecha de atención** (año actual por defecto), grupo, proceso, texto e **Información** (con pendientes, sin fecha de entrega, sin recomendaciones, sin cargo); la columna «Pendiente» dice qué falta. No muestra el próximo examen (es dato del control). Su exportación **sí** incluye las recomendaciones: quien tenga «exportar» del módulo puede sacarlas.
- **Registrar examen**:
  - se busca a la persona en el control o en el maestro;
  - si no estaba en el control, entra con el grupo elegido y la periodicidad del profesiograma;
  - el próximo examen se ve en vivo mientras se llena el formulario.
- **Agregar al control / Editar persona**: grupo, cargo, fecha de ingreso, periodicidad (sugerida por el profesiograma, con el próximo examen calculado) y la salida del control.
- **Profesiograma**: los cargos por empresa con su proceso y periodicidad; subir el Excel nuevo, editar cargos, aplicar a las personas afectadas y ver las versiones guardadas (ver §2.1).

## 4. Permisos

Módulo `examenes_periodicos`, con las acciones ver · crear · editar · anular · exportar (`src/lib/permisos/catalogo.ts`).

- En el sistema anterior, la migración se lo da al admin.
- A los demás se les asigna en Configuración › Usuarios.

## 5. MCP y Data API

Se exponen **solo las dos vistas**: `sst_examenes_estado` y `sst_examenes_atenciones`.

- Las recomendaciones y observaciones del médico son datos de salud y **no salen del módulo**. Fue decisión del usuario, el 2026-11-05. Por eso las tablas no están en `EXTERNAL_RESOURCES`.
- Las ve quien tenga el módulo `examenes_periodicos` (`MODULOS_POR_RECURSO` en `src/lib/external/acceso.ts`).
- La documentación semántica está en `src/lib/mcp/catalogo/sst.ts` (dominio `rrhh`), y el término «Examen periódico» está en el glosario.
- Preguntas típicas: «¿quién tiene el examen vencido?» y «¿cuántos vencen este mes por grupo?».

## 6. Carga del histórico (Excel)

```bash
npm run sst:examenes-historico -- "<ruta>/LISTADO PERSONAL EXAMEN PERIODICO 2026.xlsx" --ensayo
npm run sst:examenes-historico -- "<ruta>/LISTADO PERSONAL EXAMEN PERIODICO 2026.xlsx" --escribir
npm run sst:examenes-historico -- --reversar
```

- **`--ensayo`** escribe el informe en `<tmp>/migracion-sst-examenes/`: `resumen.txt`, `rechazadas.csv`, `avisos.csv` y `comparacion.csv`, que compara el próximo examen y la alerta del Excel con lo calculado. El informe lleva cédulas y datos de salud: **no se copia al repositorio**.
- **`--escribir`** es idempotente: no toca a las personas que ya están y salta los exámenes ya cargados (`historico_ref`) o con la misma cédula y fecha.
- **`--reversar`** borra los exámenes con `origen = 'historico'` y las personas históricas que se quedan sin exámenes.

**Hojas mensuales** («ENERO 25» … «NOVIEMBRE 26»):

- Cada fila es una atención. El encabezado está en la fila 1 o en la 2.
- En «DICIEMBRE 25», la columna de la entrega se llama «OBSERVACION».
- Lo que no es fecha en la entrega va a `observaciones` como «Entrega: …» («REPETIR OPTOMETRIA», «PENDIENTE HC», «OK»).
- Un año truncado («27/05/202») se completa con el año de la hoja, con aviso.
- Una fila sin fecha de atención o con fecha futura es una cita, no un examen: se rechaza.
- La marca «PROTEGER» de la columna A queda en `observaciones`.
- La misma atención repetida en dos meses se funde en una.

**Hojas de control** («COND LA CAROLINA.», «ADMON CAROLINA.», «REUBICADOS.», «METRORECAUDO», «ANAYA GIRALDO.»):

- Encabezado en la fila 2, los años en la 3 y los datos desde la 5.
- Cada fecha de un año es un examen.
- «RETIRADO» saca a la persona del control desde ese año.
- «INCAP» genera un aviso y no crea examen.

**Fusión y periodicidad**:

- Un examen de control a 45 días o menos de uno mensual de la misma cédula es el mismo; gana el mensual, que trae la entrega y las recomendaciones.
- La periodicidad sale del próximo examen escrito en el Excel y se ajusta a 12, 24 o 36 meses:
  - para el último examen de cada persona, desde ese examen;
  - para quien no tiene exámenes, desde su fecha de ingreso.
- Quien solo aparece en las hojas mensuales entra al control por su área: «REUBICADO…» va a reubicados, «CONDUCTOR…» a conductores, vigilante o escolta a Anaya Giraldo, cajero a Metrorecaudo y lo demás a administrativos.

**Resultado del ensayo** con el Excel de noviembre de 2026:

- 405 personas: 303 en control y 102 retiradas.
- 564 exámenes de 2021 a 2026: 189 con recomendaciones y 160 con fecha de entrega.
- 60 filas rechazadas, casi todas citas sin atender. Están en `rechazadas.csv`.
- Contra las alertas del Excel al 2026-11-03, coinciden 294 de 297 estados. Las 3 diferencias son personas con una atención mensual más reciente que la hoja de control no reflejaba.
- 134 próximos exámenes difieren del Excel en un mes o menos: el Excel los escribía a mano y el módulo los calcula.
