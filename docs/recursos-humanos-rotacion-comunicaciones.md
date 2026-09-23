# Gestivo · Recursos Humanos, Rotación y Comunicaciones

Documento funcional y de gestión de los tres grupos del menú que atienden al personal de La Carolina:
qué hace cada pantalla, quién la usa, cómo fluye la información entre módulos, qué corre solo y qué
queda pendiente.

- **Fecha de corte:** 2026-09-23 (commit `2830b18`).
- **Fuente:** lectura del código, las migraciones y los documentos de `docs/`. No es un manual de
  usuario con capturas; describe el comportamiento real del sistema, incluidas sus limitaciones.
- **Convenciones:** las rutas de archivo son relativas a la raíz del repositorio. «No existe» significa
  que se buscó en el código y no se encontró.

---

## Contenido

1. [Mapa del menú](#1-mapa-del-menú)
2. [Acceso y permisos](#2-acceso-y-permisos)
3. [Cómo se conectan los módulos](#3-cómo-se-conectan-los-módulos)
4. [Recursos Humanos](#4-recursos-humanos)
   - 4.1 [Vacantes](#41-vacantes)
   - 4.2 [Candidatos y procesos de contratación](#42-candidatos-y-procesos-de-contratación)
   - 4.3 [Empleados](#43-empleados)
   - 4.4 [Conductores](#44-conductores)
   - 4.5 [Documentos](#45-documentos)
   - 4.6 [Campañas (embudo de reclutamiento)](#46-campañas-embudo-de-reclutamiento)
   - 4.7 [Ausentismo](#47-ausentismo)
   - 4.8 [Incapacidades (recuperación)](#48-incapacidades-recuperación)
   - 4.9 [Riesgo predictivo](#49-riesgo-predictivo)
5. [Rotación](#5-rotación)
6. [Comunicaciones (WhatsApp)](#6-comunicaciones-whatsapp)
7. [Tareas automáticas e integraciones](#7-tareas-automáticas-e-integraciones)
8. [Gestión: rutina de operación](#8-gestión-rutina-de-operación)
9. [Hallazgos y pendientes](#9-hallazgos-y-pendientes)
10. [Referencia de archivos](#10-referencia-de-archivos)

---

## 1. Mapa del menú

Definido en `src/lib/constants.ts` (`NAV_TREE`).

| Grupo | Pantalla | Ruta | Clave de módulo |
|---|---|---|---|
| **Recursos Humanos** | Vacantes | `/vacantes` | `vacantes` |
| | Candidatos (incluye Procesos) | `/candidatos` | `candidatos` |
| | Empleados | `/empleados` | `empleados` |
| | Conductores | `/conductores` | `conductores` |
| | Ausentismo | `/ausentismo` | `ausentismo` |
| | Incapacidades | `/incapacidades` | `incapacidades` |
| | Riesgo | `/riesgo` | `riesgo` |
| | Documentos | `/documentos` | `documentos` |
| | Campañas | `/campanas` | `campanas` |
| **Rotación** | Conductores | `/rotacion/conductores` | `rotacion` |
| | Rendimiento | `/rotacion/rendimiento` | `rotacion` |
| | Mapa de calor | `/rotacion/mapa-calor` | `rotacion` |
| | Alarmas | `/rotacion/alarmas` | `rotacion` |
| | Datos | `/rotacion/datos` | `rotacion` |
| **Comunicaciones** | Bandeja de WhatsApp | `/comunicaciones` | `comunicaciones` |

> `/contratacion` ya no es un módulo: se fusionó con Candidatos y la ruta solo redirige a
> `/candidatos` para no romper enlaces antiguos (`src/app/(dashboard)/contratacion/page.tsx`).

---

## 2. Acceso y permisos

### 2.1 Modelo

- Cada usuario tiene un **tipo de usuario** (`profiles.user_type` → tabla `user_types`) con cuatro campos:
  - `modulos`: los módulos a los que entra.
  - `submodulos`: restricciones finas; en estos grupos solo las usa Incapacidades.
  - `puede_editar`: separa a quien opera de quien solo consulta.
  - `alcance`: `all` o `departamentos`. Se configura, pero **ninguna pantalla de estos grupos lo aplica**.
- **Es cerrado por defecto:** un usuario sin tipo asignado no entra a nada. El tipo `admin` entra a todo.
- **Dos barreras:**
  1. `src/proxy.ts` redirige cuando la ruta pertenece a un módulo que el tipo no tiene.
  2. Las páginas y acciones del servidor vuelven a comprobar el permiso. Esto se cumple en Ausentismo,
     Incapacidades, Riesgo, Procesos de contratación y Comunicaciones, pero no en todos los módulos
     (ver [9.1](#91-seguridad-y-control-de-acceso)).
- Los tipos se crean y editan en **Configuración → Usuarios**, sin tocar código.
- Los roles `reclutador` y `coordinador` del enum `profiles.role` **no controlan ningún permiso**. El
  acceso lo da solo el tipo de usuario.

### 2.2 Tipos de usuario sembrados

| Tipo | Módulos de estos grupos |
|---|---|
| `admin` | Todos |
| `rrhh` | vacantes, candidatos, empleados, conductores, documentos, campanas, ausentismo, incapacidades, riesgo |
| `operaciones` | conductores, rotacion (además de dashboard y accidentabilidad) |
| `consulta`, `conductor` | Ninguno (solo dashboard) |

El módulo `comunicaciones` no aparece en ninguna semilla: se asigna a mano en Configuración → Usuarios.

### 2.3 Qué exige `puede_editar`

| Acción | ¿Exige edición? |
|---|---|
| Crear, editar o eliminar procesos de contratación | Sí |
| Crear conceptos de ausencia; registrar, editar o eliminar en la Matriz EPS | Sí |
| Registrar, editar o eliminar ausencias del día | **No**: basta con tener el módulo |
| Operar expedientes de incapacidad (completar, liquidar, radicar, recaudar, cerrar) | Sí |
| Recalcular el riesgo | Sí |
| Enviar mensajes de WhatsApp | No |
| Crear un candidato desde una conversación | Sí (y además el módulo `candidatos`) |
| Vacantes, candidatos (ficha, Kanban), empleados, documentos | **No se valida** (ver 9.1) |

### 2.4 Acciones reservadas al administrador

- Gestionar las etapas del Kanban de candidatos.
- Parámetros de Incapacidades (fecha de corte, tolerancia, entidades pagadoras).
- Configurar el canal de WhatsApp.

---

## 3. Cómo se conectan los módulos

```
 WhatsApp ──► Comunicaciones ──(crear candidato)──┐
 Webhooks de integraciones ──(candidato + documentos)──┤
                                                  ▼
                        Candidatos / Procesos de contratación
                                                  │  estado «contratado»
                       ┌──────────────────────────┴──────────────────────────┐
                vacante con «conductor»                              otra vacante
                       ▼                                                     ▼
                 conductores ◄──── sync diario GEMA ────► employees (Empleados)
                       │
     ┌─────────────────┼──────────────────┬──────────────────────┐
     ▼                 ▼                  ▼                      ▼
  Rotación        Ausentismo ──(Matriz EPS)──► Incapacidades   Riesgo predictivo
 (ficha, rendi-   (registro del día,          (expediente,     (lee conductores,
  miento, mapa,    reincidentes,               liquidación,     ausentismo, cierres
  alarmas)         indicadores)                cobro, recaudo)  y viajes perdidos)
```

Hechos clave de la integración:

1. **GEMA es la fuente maestra de conductores y empleados.** El sync diario sobrescribe nombre, cargo,
   estado y fechas; lo que se edite a mano en esos campos se pierde en la siguiente corrida.
2. **Contratar en Procesos da de alta sola a la persona:**
   - si el título de la vacante contiene «conductor», en `conductores`;
   - si no, en `employees`.
   GEMA completa los datos después.
3. **La Matriz EPS de Ausentismo alimenta Incapacidades.** Un trigger de la base crea el expediente de
   cobro cuando una incapacidad cumple la regla de entrada.
4. **Riesgo y Rotación leen los mismos datos:** `conductores`, `cierres_diarios`, `viajes_perdidos`,
   `ausentismo_registros` y `ausentismo`.
5. **Comunicaciones cruza el teléfono del contacto** con conductores, propietarios y procesos, y enlaza
   a la ficha de Rotación y al proceso del candidato.

---

## 4. Recursos Humanos

### 4.1 Vacantes

**Propósito:** definir los cargos abiertos a los que se vinculan candidatos y procesos.

**Pantallas**

| Pantalla | Qué muestra y qué permite |
|---|---|
| Listado `/vacantes` | Tarjetas con título, departamento, estado, ubicación, contrato, modalidad, rango salarial, número de candidatos y antigüedad. Pestañas Todas, Activas, Borrador, Cerradas y Archivadas. |
| Nueva `/vacantes/nueva` | Título y departamento (obligatorios), descripción, requisitos, ubicación, modalidad (presencial, remoto, híbrido), tipo de contrato (indefinido, fijo, obra o labor, prestación de servicios) y salario mínimo y máximo en COP. Botones «Guardar como borrador» y «Publicar vacante». Desde aquí también se crean y eliminan departamentos. |
| Detalle `/vacantes/[id]` | Datos de la vacante, últimos candidatos y botones de cambio de estado; siempre permite eliminar. |

**Ciclo de vida:** `borrador → activa → cerrada → archivada`, y «Reactivar» vuelve a `activa`. Todas las
transiciones son manuales; no hay cierre automático aunque exista la columna `closes_at`.

**Reglas de negocio**

- Solo las vacantes **activas**:
  - aparecen en los selectores de Candidatos y Procesos;
  - participan en el emparejamiento automático del webhook.
- Si el título contiene **«conductor»** (sin importar mayúsculas ni tildes), contratar en ella crea al
  conductor; si no, crea un empleado.
- Los departamentos que llegan de GEMA no se muestran en el selector; solo los creados a mano. Un
  departamento con vacantes o empleados asociados no se puede eliminar.
- Eliminar una vacante borra sus postulaciones y su historial de etapas; los procesos quedan sin vacante.

**Tablas:** `vacancies`, `departments`, `candidate_vacancy`.

### 4.2 Candidatos y procesos de contratación

**Propósito:** seguir a cada aspirante, sobre todo conductores, desde el primer contacto hasta la
contratación o el cierre. Reemplaza el Excel «Procesos de reclutamiento».

**Vistas** (conmutador en el encabezado de `/candidatos`)

**A. Procesos** (vista por defecto, la operativa)

- **Tarjetas:** Postulaciones, En curso, Contratados y Cierre de proceso.
- **Filtros** (viajan en la URL): búsqueda por nombre, cédula o celular; estado; medio de postulación;
  segmentación por fecha de creación o de citación; mes; rango de fechas.
- **Tabla** paginada de 50 en 50. El estado se cambia en línea y se ven las validaciones (SIMIT,
  antecedentes, licencia), la fecha de contrato y la observación.
- **Exportar Excel:** la relación completa con los filtros aplicados, hasta 5.000 filas y 18 columnas.
- **Formulario del proceso:**
  - nombre y cédula (obligatorios; el nombre se guarda en mayúsculas), celular;
  - vacante activa, fecha de creación, medio de postulación, estado;
  - causa de no contrato (solo en cierre), marca de reingreso;
  - SIMIT (ok, deuda, acuerdo de pago, pendiente; con valor si hay deuda o acuerdo), antecedentes y
    categoría de licencia RUNT;
  - fechas de citación, exámenes, prueba de manejo y contrato, y observación.

| Estados del proceso | |
|---|---|
| En curso | `pendiente` (por citar) → `citado` → `en_examenes` → `prueba_manejo` → `en_escuela` → `reconocimiento_ruta` |
| Finales | `contratado` · `cierre` (con causa) |

- **Transiciones manuales y libres:** se puede saltar de un estado a cualquier otro.
- **Causas sugeridas de no contrato:** no se ajusta al perfil, desistimiento, incomunicado, exámenes
  médicos, no aprobado reintegro, psicotécnico, no pasó prueba de manejo, laborando en otra empresa y
  deuda SIMIT.
- **Medios de postulación:** WhatsApp, Computrabajo, referido, Varylo, ManyChat, voluntario, reingreso y
  otro.

**Automatismos al guardar un proceso**

1. **Todo proceso es un candidato.** Busca el candidato por cédula y, si no existe, lo crea. Si falla,
   el proceso se guarda igual, pero sin enlace a la ficha.
2. **Vincula a la vacante.** Si el proceso tiene vacante, crea o actualiza la postulación y fija su
   etapa según el estado del proceso: `pendiente` pasa a `recibido` y `cierre` a `rechazado`.
3. **Da de alta al contratado.** En estado `contratado`:
   - Vacante de conductor: crea el conductor en ACTIVO, o lo reactiva con `fecha_reingreso`.
   - Otra vacante: crea el empleado activo, o lo reactiva.
   - Un error aquí no bloquea el guardado; solo queda en la consola.

**B. Todos:** lista de candidatos con búsqueda, «Asignar a vacante» (crea la postulación en `recibido`)
y eliminar. Eliminar borra notas, historial y postulaciones, y desvincula documentos y empleados.

**C. Pipeline (Kanban):** columnas según las etapas activas de `pipeline_stages`:

`recibido → citado → en_examenes → prueba_manejo → en_escuela → reconocimiento_ruta → contratado | rechazado`

- Arrastrar una tarjeta cambia la etapa y deja rastro en `stage_history`.
- Solo el administrador crea, edita, reordena o elimina etapas. Una etapa con candidatos no se puede
  eliminar.

**D. Tabla:** postulaciones con acciones de avanzar, rechazar y contratar.

**Ficha del candidato `/candidatos/[id]`**

- Pestañas: Perfil, Documentos, Notas y Línea de tiempo.
- Permite editar los datos básicos.
- **«Contratar» desde la ficha** tiene un comportamiento propio:
  - crea siempre un **empleado**, aunque la vacante sea de conductor;
  - traslada documentos y notas;
  - **borra el candidato** con sus postulaciones e historial.

**Ingreso automático por webhook** (`POST /api/webhooks/[slug]`, configurado en Configuración →
Integraciones)

1. Busca el candidato por teléfono, cédula o email; lo crea o lo actualiza.
2. Intenta asignarle una vacante activa por coincidencia de palabras con el título (umbral de 3 puntos).
3. Descarga los adjuntos como documentos pendientes de revisión.

**Tablas:** `candidates`, `candidate_vacancy`, `stage_history`, `pipeline_stages`,
`procesos_contratacion`, `notes`, `documents`, `webhook_configs`, `webhook_logs`.

**Para contar bien**

- Contratados: usar `procesos_contratacion.estado = 'contratado'` y agrupar por cédula (un mismo
  aspirante puede tener varios procesos).
- El Kanban subcuenta: no ve los procesos sin vacante ni los contratados desde la ficha, porque esos se
  borran.

### 4.3 Empleados

**Propósito:** maestro del personal administrativo y no conductor, con su historia laboral.

**Pantallas**

| Pantalla | Qué muestra y qué permite |
|---|---|
| Listado `/empleados` | Búsqueda (nombre, cédula, email, cargo), filtros por departamento y estado, tabla paginada en el navegador. Menú de fila: ver perfil y eliminar. |
| Perfil `/empleados/[id]` | Encabezado con estado, cargo, departamento y antigüedad. «Editar» (datos, salario, contrato, EPS, AFP, ARL, caja de compensación), «Retirar» o «Reactivar». |

Pestañas del perfil:

- **Información.**
- **Documentos.**
- **Novedades:** incapacidad, permiso, vacaciones, llamado de atención, sanción, cambio de cargo o de
  salario, retiro y otro; cada una con estado.
- **Descargos:** avanzan en un solo sentido, `abierto → en_proceso → resuelto → cerrado`, con resolución
  al final.
- **Historial:** observaciones internas y la auditoría de cambios.

**Auditoría** (`employee_audit_log`): registra cambios de datos campo por campo, novedades y descargos
creados, y contrataciones. No registra cambios de estado de descargos, eliminaciones ni lo que cambia
GEMA.

**Estados:** `activo`, `permiso`, `inactivo`, `periodo_prueba`, `retirado`. La interfaz solo retira o
reactiva; GEMA fija activo o retirado.

**Origen de los registros**

- Sync de GEMA: excluye los cargos «CONDUCTOR» y crea los departamentos que falten.
- Alta automática desde Procesos.
- «Contratar» desde la ficha del candidato.

**Tablas:** `employees`, `employee_events`, `disciplinary_records`, `notes`, `documents`,
`employee_audit_log`.

> Las novedades de Empleados (`employee_events`) son **independientes** de Ausentismo e Incapacidades.
> No se cruzan.

### 4.4 Conductores

**Propósito:** consulta del maestro de conductores que llega de GEMA. **Es solo lectura.**

- **Listado:** búsqueda por nombre, cédula, tipo o código; filtro de estado (ACTIVO en verde, RETIRADO
  en rojo); paginación.
- **Ficha `/conductores/[cedula]`:** contacto, información laboral (ingreso, retiro, vencimiento de
  contrato, reubicado), licencia y vencimiento, seguridad social, datos personales y observaciones.
- **Estado:** en GEMA `estado = 1` es ACTIVO; cualquier otro valor es RETIRADO.
- **Origen:** sync de GEMA (upsert por cédula) y alta automática desde Procesos.
- **Relación con Rotación:** la ficha operativa completa (producción, vueltas perdidas, ausentismo,
  familia, incentivos) está en **Rotación → Conductores** (ver [5](#5-rotación)).

### 4.5 Documentos

**Propósito:** repositorio de documentos de candidatos y empleados, con control de estado.

**Pantalla**

- **Tarjetas:** total, firmas pendientes y por vencer.
- **Filtros:** pestañas por categoría (Contratos, Políticas, Vinculación, Nómina), búsqueda y tipo de
  persona (candidatos, empleados, sin asignar).
- **Agrupación por persona**, con acciones por documento: ver, descargar, aprobar, marcar como revisado
  o firmado, dejar pendiente, rechazar y eliminar.

**Estados:** `pendiente`, `revisado` (se muestra como «Vigente»), `aprobado`, `firmado`, `vencido` y
`rechazado`. Todos se cambian a mano y en cualquier orden.

**Origen:** hoy los documentos **solo entran por el webhook de integraciones**, con los adjuntos del
payload. Los botones «Subir documento» y «Nueva carpeta» todavía no funcionan. «Contratar» traslada los
documentos del candidato al empleado.

**Almacenamiento:** bucket `documents` de Supabase Storage.

### 4.6 Campañas (embudo de reclutamiento)

**Propósito:** tablero de solo lectura del embudo (conversaciones → hojas de vida → contrataciones) y
del costo por contratación frente a la inversión en Meta Ads.

**Contenido**

- **Filtros:** mes y canal.
- **Tarjetas:** conversaciones, CVs registrados, contrataciones y costo por contratación (Meta).
- **Conversión por fuente**, con semáforo: verde desde 8 %, ámbar desde 4 %.
- **Eficiencia del embudo**, gráfico diario y tabla de métricas diarias con semáforo por día.

**De dónde salen los datos**

- **Embudo:** se deriva en vivo de las postulaciones (`candidate_vacancy`) y del origen del candidato
  (`candidates.source`), clasificados con las etapas del pipeline.
- **Canal según el origen:** WhatsApp (incluye Meta, Facebook e Instagram), Referido, Computrabajo,
  ManyChat, Varylo y Otros.
- **Conversaciones y gasto:** de Meta Ads. El sync `GET /api/campanas/sync-meta` escribe
  `meta_campaigns` y `meta_spend_daily`.
  - Credenciales en variables de entorno: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_API_VERSION`.
  - Protegido con `CRON_SECRET`.
  - **No tiene cron programado:** hay que dispararlo a mano o desde fuera.
- **Costo por contratación** = gasto total de Meta ÷ contratados de WhatsApp, ManyChat y Varylo.

### 4.7 Ausentismo

**Propósito:** reemplaza el Excel diario «AUSENTES DE 2026» de Recepción. También es la **Matriz EPS**
de incapacidades, que antes se cargaba por Excel.

**Pestañas**

**1. Registro del día** (la de uso diario)

- Selector de fecha; por defecto, hoy en hora de Bogotá.
- Tabla con conductor, vehículo, tipo, periodo, justificación, incapacidad, reintegro y soporte.
- Aviso de color con los reincidentes en alerta del mes.
- Exporta en PDF, Excel y CSV.
- **Formulario:**
  - conductor (por código, cédula o nombre) y vehículo (maestro de GEMA);
  - tipo de ausencia, del catálogo de conceptos;
  - contacto: apagado, no contesta, desvía llamadas o localizado;
  - justificación, fechas de incapacidad y de reintegro;
  - soporte: no aplica, debe traerlo o presentado;
  - rango de fechas. Al editar se exige un motivo.

**2. Historial:** rango de fechas (por defecto, 30 días), tipo, búsqueda, resumen por concepto y
exportación; lee hasta 20.000 filas.

**3. Reincidentes**

- Filtros: ventana (mes en curso, 30, 60 o 90 días), mínimo de ausencias, categoría y criterio.
- Chips con la acción que corresponde a RRHH.
- Marca de «notificado» para descargos y terminación, que se puede anular con motivo.
- Incluye un reporte histórico mes a mes.

**4. Matriz EPS**

- Registro, edición, eliminación lógica y restauración de incapacidades.
- Filtros por pagador, IPS, origen, estado, cobro, días mínimos y revisión.
- **Exportar Excel** con las 20 columnas del formato original («BASE DE AUSENTISMO»).
- **Informe de cobro** por pagador en PDF, Excel y CSV.

**5. Indicadores**

- Siete cortes: mensual, EPS, IPS, médico, diagnóstico CIE10, trabajador y GRD.
- Muestra eventos, días, promedio, participación y tasa mensual. Tasa = días perdidos ÷ (conductores
  activos × días del mes).
- Informe PDF y Excel con una hoja por corte.

**Reglas de negocio**

- **Registro del día**
  - Un conductor tiene un solo registro por fecha.
  - El vehículo debe existir en el maestro.
- **Conceptos que cubren un rango** (hoy solo Vacaciones)
  - Exigen fecha de fin.
  - El registro aparece todos los días entre inicio y fin, con **una sola fila**: contar filas no es
    contar días.
  - Un cruce con el mismo concepto se rechaza; con otro concepto se avisa y se guarda si el usuario
    confirma.
- **Reincidencia:** 3 o más ausencias en la ventana, contando solo los conceptos marcados para ello
  (vacaciones y descanso no cuentan). Niveles de alerta, del más grave al menos grave:

  | Nivel | Condición |
  |---|---|
  | Terminación | 5 o más días seguidos sin justificar |
  | Descargos | Racha de 4 días |
  | Crítica | 2 o más «No justificada» en la ventana |
  | Alta | 1 «No justificada» o soportes pendientes |

- **Matriz EPS**
  - Días perdidos = fin − inicio + 1, calculados por la base.
  - Una prórroga exige una incapacidad previa que termine el día anterior, y hereda su consecutivo.
  - Los orígenes AT y EL van a la ARL; el resto, a la EPS.
  - El CIE10 debe existir en el catálogo.
  - **Días a cargo del pagador:** ARL, todos; EPS inicial, días − 2 (los dos primeros los asume la
    empresa); EPS prórroga, todos.
- **Trazabilidad**
  - En la Matriz, la eliminación es **lógica** (`eliminado_at`, con motivo y responsable) y se puede
    restaurar. Todo lector de `ausentismo` debe filtrar `eliminado_at IS NULL`.
  - En el Registro del día, eliminar **borra la fila**; el rastro queda en `ausentismo_log`.

**Tablas:** `ausentismo_registros`, `ausentismo_log`, `ausentismo_conceptos`,
`ausentismo_notificaciones`, `ausentismo` (la matriz), `ausentismo_catalogos`.

### 4.8 Incapacidades (recuperación)

**Propósito:** cobrar a la EPS o la ARL cada incapacidad de la matriz: expediente, liquidación,
radicación, recaudo, conciliación y cierre. La gestión arranca con las incapacidades que inician desde
el **2026-09-01**.

**Sub-funciones**, asignables por separado en el tipo de usuario:

| Sub-función | Ruta | Contenido |
|---|---|---|
| Expedientes | `/incapacidades` | Bandeja, expediente, alta manual |
| Radicación | `/incapacidades/radicacion` | Bandeja de cobro por entidad |
| Recaudos | `/incapacidades/recaudos` | Giros y su aplicación |
| Conciliación | `/incapacidades/conciliacion` | Saldos y cierres |
| Consulta | `/incapacidades/consulta` | Solo lectura (pensada para Revisoría) |
| Parámetros | `/incapacidades/parametros` | Solo administrador |

**Pantallas principales**

- **Bandeja:** filtros por estado, entidad y cobrables; leyenda del origen de cada dato (recibido,
  homologado, calculado, completado por RRHH); exportación.
- **Expediente:** ficha, gestión (completar datos, homologar, sobrescribir, liquidar), radicación,
  soportes (PDF o imagen hasta 10 MB) y saldo.
- **Bandeja de cobro:** seis pestañas (por radicar, solicitadas, radicadas, devueltas, con incidencias,
  no cobrables por umbral), agrupadas por entidad.
- **Tablero:** embudo reclamado → radicado → recaudado, con una tabla por entidad.

**Ciclo de vida del expediente**

```
recibido → en_completar → liquidado → radicado → con_recaudo → conciliado → cerrado
                              ▲           │
                              └─ devuelta/anulada
(eliminada en la matriz) → excepcion ── (restaurada) → recibido
```

1. **Nace solo.** Un trigger lo crea cuando entra a la Matriz una incapacidad que cumple la regla de
   entrada:
   - **EPS:** solo las de más de 2 días.
   - **ARL:** todas.
   - El **alta manual** (con motivo) manda sobre la regla.
2. **Completar y homologar:** responsable, salario con vigencia, entidad y tipo. Cambiar un dato ya
   diligenciado exige motivo.
3. **Liquidar:**
   - Salario diario = salario / 30.
   - Factor = 1 para AT y EG; 0,67 para el resto.
   - Valor a reclamar = salario diario × días a cargo de la entidad × factor.
   - Nunca liquida en cero y exige que los días coincidan con la matriz.
4. **Radicar:**
   - Primero se registra como solicitada y luego como radicada, con código único por entidad.
   - Una devolución o anulación regresa el expediente a `liquidado`.
5. **Recaudar:** se registra el giro y se aplica a los expedientes. El saldo decide si el expediente
   queda con recaudo o conciliado. Los ajustes posibles son glosa, descuento, redondeo, corrección y
   nota informativa.
6. **Cerrar:** con saldo dentro de la tolerancia (hoy 0) o por excepción justificada. Se puede reabrir
   con motivo.

**Control y auditoría**

- **Control de concurrencia:** si otra persona modificó el expediente mientras usted lo tenía abierto,
  la escritura se rechaza.
- **Auditoría:** cada consulta, cambio y exportación se registra en `tesoreria_audit_log`, módulo
  `incapacidades`.

**Tablas:** `incapacidad_expedientes`, `incapacidad_liquidaciones`, `incapacidad_radicaciones`,
`incapacidad_recaudos`, `incapacidad_recaudo_aplicaciones`, `incapacidad_ajustes`,
`incapacidad_adjuntos`, `incapacidad_parametros`, `incapacidad_reglas`. Los soportes van en el bucket
privado `incapacidades`.

### 4.9 Riesgo predictivo

**Propósito:** lista de prioridad para RRHH, no un diagnóstico, con dos predicciones por conductor
activo:

- **Retiro en 60 días.**
- **Falta no justificada en 30 días** (incluye «sin contacto»).

**Pantalla `/riesgo`**

- Selector de corte (últimas 24 corridas) y botón **Recalcular** (exige edición).
- Tarjetas por nivel y calidad de cada modelo: AUC, tasa base, precisión y lift del top 10 %.
- Pesos de las variables y tasas por tramo.
- **Tabla:** probabilidad, nivel, los tres factores que más pesan, ausencias, faltas no justificadas y
  viajes perdidos en 90 días, y antigüedad.
- Oculta por defecto a quien ya no está activo.
- Exporta en CSV, Excel y PDF.

**Niveles:** Alto si la probabilidad es al menos 3 veces la tasa base; Medio entre 1,5 y 3 veces; Bajo
por debajo.

**Cómo se calcula** (`src/lib/riesgo/`)

1. **Lee** conductores, ausentismo, viajes perdidos y cierres. Si detecta el sync de GEMA en curso,
   aborta en lugar de guardar datos a medias.
2. **Depura** el maestro: cédulas comodín, fichas sin código y duplicados.
3. **Arma un panel** conductor × mes con 7 cortes y 24 variables de perfil, ausentismo, salud,
   operación y producción.
4. **Entrena** una regresión logística. Publica las métricas del modelo validado en los meses más
   recientes y puntúa hoy con el modelo entrenado sobre todo el histórico.
5. **Guarda** cada corrida sin sobrescribir las anteriores, para comprobar después si el modelo acertó.

**Resultados documentados** (corte 2026-09-14): AUC de retiro 0,812 y de falta 0,739; el top 10 % de
retiro acierta el 61,3 %, 3,1 veces la tasa base. La antigüedad es el primer factor.

**Automático:** cron diario `/api/cron/riesgo-conductores`, a las 09:00 UTC (04:00 en Colombia).

---

## 5. Rotación

> **Aclaraciones previas**
> - El módulo **no calcula una tasa de rotación** de personal. Es la consulta operativa del conductor.
> - Las **Alarmas** son eventos técnicos de las registradoras de los buses, no alertas de personal.
> - **Datos** ya no carga conductores, cierres ni viajes perdidos, que llegan solos desde GEMA. Por
>   Excel solo se cargan Núcleo familiar e Incentivos.

**Usuarios:** tipos con el módulo `rotacion` (`admin` y `operaciones` por semilla). Las cinco pantallas
van juntas.

### 5.1 Conductores `/rotacion/conductores`

- **Buscador** por nombre, cédula o código (mínimo 2 caracteres), con franja de color por estado.
- **Ficha `/rotacion/conductores/[cedula]`:**
  - **Encabezado:** antigüedad, grupo (0-3 m, 3-6 m, 6-12 m, +1 año), retiro y reingreso.
  - **KPIs:**
    - días trabajados (fechas con cierre);
    - timbradas netas;
    - vueltas perdidas imputables (`tipologia = CONDUCTOR`);
    - accidentes (vueltas perdidas cuya novedad dice «ACCIDENTE»);
    - incapacidades.
  - **Análisis por quincena** (Q1 = días 1-15, Q2 = día 16 a fin de mes), con la evolución entre
    quincenas.
  - **Detalle:** rendimiento por cierre, vueltas perdidas, historial de accidentes, datos personales,
    ausentismo, núcleo familiar e incentivos.
  - **Reingreso:** si el conductor tiene fecha de reingreso, todo el historial se corta desde esa fecha.
  - Es solo consulta.

### 5.2 Rendimiento `/rotacion/rendimiento`

**Filtro de periodo:** todo, por mes, por quincena o un rango.

**Pestañas**

- **Resumen:** conductores activos, vueltas perdidas totales e imputables, conductores sin vueltas
  perdidas y con accidente, timbradas promedio, y gráficos por grupo de antigüedad.
- **Por grupo** (0-3 m, 3-6 m, 6-12 m, +1 año): top 10 de productividad, top 10 de vueltas perdidas y
  una tabla ordenable.
- **Accidentalidad**, **Tabla completa** y **Quincenas** (matriz conductor × quincena).
- **Evolución:** penúltima frente a última quincena. Muestra quién mejoró o retrocedió en timbradas por
  día.

**Definiciones**

- Universo: conductores ACTIVOS.
- Timbradas = Σ(timbradas − diferencia) de `cierres_diarios`.
- Vuelta perdida imputable = `viajes_perdidos` con `tipologia = CONDUCTOR`. Es por accidente si la
  novedad contiene «ACCIDENTE»; si no, por ausencia.

### 5.3 Mapa de calor `/rotacion/mapa-calor`

- **Qué muestra:** subidas y bajadas de pasajeros por punto, según la telemetría GEMA
  (`puntos_virtuales`), en celdas de unos 11 m.
- **Filtros:** periodo, ruta, vehículo, viaje (con vehículo y un solo día), franja horaria y punto.
- **KPIs:** pasajeros que suben y bajan, timbradas netas, hora pico y puntos con actividad.
- **Capas:** calor, puntos virtuales, alarmas y trazado GPS ajustado a las calles.
- **Alerta «Verificación de timbrada»:** aparece cuando la registradora se reinició a mitad del viaje.
  Compara lo liquidado por GEMA con la reconstrucción del contador.
- La misma pantalla se usa en **Tesorería → Revisión cartulina**.

### 5.4 Alarmas `/rotacion/alarmas`

- **Eventos:** bloqueos de puerta (P1, P2, P3), puerta abierta o cerrada y fallas de comunicación.
- **Filtros:** periodo, tipo y ruta.
- **Contenido:** KPIs por tipo, top 10 de vehículos y de conductores con más alarmas, distribución por
  hora y los últimos 500 eventos.
- **Solo consulta:** no hay estados, asignación ni cierre.

### 5.5 Datos `/rotacion/datos`

- **Estado de la sincronización con GEMA** para conductores, empleados, propietarios, cierres, viajes
  perdidos, `ingreso_tercero` y `viajes_recaudados`: punto verde (ok), rojo (error) o gris, con las
  filas y la hora de la última corrida.
- **Cargas manuales en Excel:**
  - **Núcleo familiar:** «Hijos y Conyugues *.xlsx».
  - **Incentivos:** «Incentivos entregados *.xlsx».
  - **Cada carga reemplaza la tabla entera:** hay que subir siempre el archivo completo.
- **Historial** de las últimas 30 cargas, con usuario, filas y errores.

**Tablas:** `conductores`, `cierres_diarios`, `viajes_perdidos`, `ausentismo`, `familia`, `incentivos`,
`data_uploads`, `gema_sync_state`, `puntos_virtuales`, `pv_deltas`, `viajes_recaudados`.

---

## 6. Comunicaciones (WhatsApp)

**Propósito:** la bandeja del WhatsApp de la empresa dentro de Gestivo, para uso interno de RRHH. Viene
de la herramienta anterior, Varylo, recortada a **un solo número**, sin multiempresa y sin agentes de
IA.

### 6.1 Canal

- **Canal único:** WhatsApp Business Cloud API oficial de Meta. No hay SMS, correo ni Teams en el
  módulo.
- **Configuración** en Comunicaciones → «Configurar canal», solo el administrador:
  - Phone number ID, Access token, WABA ID (necesario para leer plantillas), App secret y Verify token.
  - «Probar conexión y guardar» valida contra Meta antes de guardar.
  - El token y el app secret se guardan cifrados (AES-256-GCM) si existe `ENCRYPTION_KEY`.
- **Webhook** `/api/webhook/whatsapp`:
  - En Meta se registra con el verify token y se suscribe el campo `messages`.
  - Exige la firma HMAC con el app secret. **Sin app secret configurado, rechaza todos los mensajes.**
  - Al apuntarlo a Gestivo, los mensajes dejan de llegar a Varylo.

### 6.2 Bandeja `/comunicaciones`

**Lista**

- Las 200 conversaciones más recientes.
- Búsqueda por nombre o teléfono; filtros Todas y Sin leer.
- Contador de no leídos, etiqueta «Candidato» y opción «Marcar como no leída».

**Hilo**

- Mensajes por día, con imágenes, video, audio y documentos en línea.
- Estado de cada mensaje enviado (enviado, entregado, leído, fallido) y el usuario que lo envió.

**Redactor**

- Texto de hasta 4.096 caracteres y adjuntos (imagen, video, audio, PDF, Office, texto).
- Queda **deshabilitado cuando la ventana de 24 h está cerrada**.

**Plantillas**

- Solo las aprobadas en el Business Manager de Meta, leídas en vivo.
- Pide las variables y muestra una vista previa.
- Solo se envían plantillas con encabezado de texto.

**Nuevo mensaje:** para iniciar un chat con un número nuevo; solo se puede con plantilla.

**Panel del contacto**

- Estado de la ventana de 24 h.
- Candidato vinculado, o el botón **«Crear como candidato»**, que abre el formulario de proceso
  precargado.
- Ficha del conductor (con enlace a Rotación) o del propietario, cruzados por teléfono.
- Estadísticas del contacto.

### 6.3 Reglas

- **Una conversación por contacto** y un contacto por teléfono.
- **Ventana de 24 h:** solo se puede escribir libremente si el contacto escribió en las últimas 24 horas.
  Fuera de ella solo sirven las plantillas, y enviar una plantilla no abre la ventana: la abre la
  respuesta del contacto.
- **Confirmación de lectura:** al recibir un mensaje, Gestivo confirma la lectura a Meta de inmediato.
  El contacto ve los chulos azules aunque nadie haya abierto el hilo.
- **Leído:** abrir el hilo pone los no leídos en cero. El contador es compartido entre todos los
  usuarios; no hay asignación por persona.
- **Registro de salientes:** todo mensaje enviado se guarda, también los fallidos, con el error
  traducido: ventana cerrada, plantilla inexistente en ese idioma o número sin WhatsApp.
- **Medios:** los entrantes se copian al bucket privado `whatsapp`, porque Meta los borra a los 30 días.
- **Actualización:** la bandeja se refresca cada 7 segundos mientras la pestaña está visible. No usa
  tiempo real.

**Tablas:** `wa_canal` (una sola fila), `wa_contactos`, `wa_conversaciones` (con `proceso_id` hacia la
contratación) y `wa_mensajes`. Solo las lee el servidor, con la clave de servicio.

**No existe hoy:** asignación de conversaciones, etiquetas, respuestas rápidas, envíos masivos, notas
internas, cierre o archivo de conversaciones, bots ni IA.

---

## 7. Tareas automáticas e integraciones

| Tarea | Cuándo | Qué hace | Protección |
|---|---|---|---|
| `/api/cron/sync-gema` | Diario 08:00 UTC (03:00 Colombia) | Maestros de conductores, empleados, propietarios y vehículos; cierres, viajes perdidos, telemetría y otros datos operativos. Vuelve a sincronizar los últimos 45 días. Al final consolida Financiera. | `CRON_SECRET` |
| `/api/cron/riesgo-conductores` | Diario 09:00 UTC (04:00 Colombia) | Nueva corrida del riesgo predictivo | `CRON_SECRET`, solo si la variable está definida |
| `/api/campanas/sync-meta` | **Sin cron** (manual o externo) | Gasto y leads de Meta Ads | `CRON_SECRET` |
| Triggers de `ausentismo` | Al insertar o actualizar la matriz | Crean y actualizan los expedientes de incapacidad | Base de datos |
| `/api/webhook/whatsapp` | Cada mensaje | Recibe mensajes y estados de entrega | Firma HMAC |
| `/api/webhooks/[slug]` | Cada llamada | Crea candidatos y documentos | **Ninguna** (ver 9.1) |

**Integraciones externas**

- **GEMA** (MySQL): vistas `vst_ext_get_conductores`, `vst_ext_get_empleados` y `vst_ext_get_personal`,
  y procedimientos de cierres y viajes.
- **Meta:** WhatsApp Cloud API y Meta Ads Graph API.
- **Mapas:** OpenStreetMap Nominatim para direcciones y OSRM para ajustar el trazado a las calles.
  Ambos son servicios públicos.
- **Correo SMTP** (Microsoft 365): solo para recuperar contraseñas, no para estos módulos. **Microsoft
  deshabilitará la autenticación básica después de diciembre de 2026**; habrá que migrar a otro relay
  (`docs/correo-smtp.md`).

**Notificaciones:** ninguno de estos módulos envía avisos, correos ni notificaciones internas. Las
alertas (reincidentes, próxima acción de un expediente, vencimientos) solo se ven al entrar a la
pantalla.

---

## 8. Gestión: rutina de operación

Rutina sugerida a partir de cómo está construido el sistema. Los responsables son los tipos de usuario
que tienen cada módulo.

### Diario

| Quién | Qué | Dónde |
|---|---|---|
| Recepción / RRHH | Registrar las ausencias del día, con soporte y contacto | Ausentismo → Registro del día |
| RRHH | Revisar el aviso de reincidentes; marcar notificados los descargos o terminaciones | Ausentismo → Reincidentes |
| RRHH | Registrar las incapacidades que llegan | Ausentismo → Matriz EPS |
| RRHH | Atender la bandeja: responder dentro de las 24 h; usar plantilla si la ventana cerró | Comunicaciones |
| RRHH / reclutamiento | Crear o avanzar los procesos de los aspirantes; crear el candidato desde el hilo cuando llega por WhatsApp | Candidatos → Procesos |
| Operaciones / datos | Confirmar que el sync de GEMA quedó en verde; si hay error, revisar los logs del cron | Rotación → Datos |

### Semanal

| Quién | Qué | Dónde |
|---|---|---|
| RRHH | Completar, homologar y liquidar los expedientes nuevos; radicar los liquidados | Incapacidades → Bandeja y Bandeja de cobro |
| RRHH / Tesorería | Registrar los giros recibidos y aplicarlos | Incapacidades → Recaudos |
| RRHH | Revisar la lista de riesgo (nivel Alto) y priorizar el acompañamiento | Riesgo |
| Operaciones | Revisar vehículos y conductores con más alarmas | Rotación → Alarmas |

### Quincenal y mensual

| Quién | Qué | Dónde |
|---|---|---|
| Operaciones / RRHH | Rendimiento por quincena: evolución, vueltas perdidas por grupo de antigüedad | Rotación → Rendimiento |
| RRHH | Informe de cobro por pagador e indicadores de ausentismo del mes | Ausentismo → Matriz EPS e Indicadores |
| RRHH / Tesorería | Conciliar saldos y cerrar expedientes | Incapacidades → Conciliación y Tablero |
| RRHH | Disparar el sync de Meta Ads y revisar el costo por contratación | Campañas |
| RRHH | Cargar núcleo familiar e incentivos (siempre el archivo completo) | Rotación → Datos |
| Admin | Revisar tipos de usuario y permisos; cerrar vacantes vencidas | Configuración → Usuarios, Vacantes |

---

## 9. Hallazgos y pendientes

Hallazgos verificados en el código al 2026-09-23. Están ordenados por impacto.

### 9.1 Seguridad y control de acceso

| # | Hallazgo | Impacto |
|---|---|---|
| S1 | `src/proxy.ts` deja pasar todo `/api`. `GET /api/rotacion/conductores/search` consulta con la clave de servicio **sin verificar sesión** (lo mismo reporta el análisis para `/api/rotacion/conductor/[cedula]` y `/api/rotacion/rendimiento`). | Datos personales de conductores expuestos a quien conozca la URL. |
| S2 | `POST /api/webhooks/[slug]` **no valida `auth_secret`**, aunque el campo existe en la tabla y en el formulario. | Cualquiera puede crear candidatos y subir documentos. |
| S3 | Las acciones del servidor de `src/lib/actions.ts` **no comprueban permisos ni `puede_editar`**. Afecta a vacantes, candidatos (ficha y Kanban), empleados y documentos. | Un usuario de «solo consulta» con el módulo puede editar y eliminar. La única barrera es el proxy por módulo. |
| S4 | El bucket `documents` es **de lectura pública**. | Hojas de vida y documentos de identidad accesibles por URL. |
| S5 | El cron de riesgo solo exige `CRON_SECRET` **si la variable está definida**. | Si falta en producción, cualquiera puede disparar corridas. |
| S6 | El registro del día de Ausentismo se puede crear, editar y borrar sin `puede_editar`. | Confirmar si es intencional (Recepción). |

### 9.2 Inconsistencias funcionales

- **Candidatos:** conviven dos catálogos de etapas.
  - La ficha y la vista Tabla usan la lista antigua (`en_revision`… `aprobado`).
  - El Kanban y los Procesos usan la nueva.
  - Por eso el botón «Contratar» de la ficha solo aparece en la etapa `aprobado`, que está desactivada.
- **Candidatos:** la sincronización va en un solo sentido, del proceso al pipeline. Mover una tarjeta en
  el Kanban no cambia el estado del proceso, y los cambios hechos desde Procesos no quedan en
  `stage_history`.
- **Candidatos:** «Contratar» desde la ficha borra al candidato y crea siempre un empleado, aunque la
  vacante sea de conductor. Esto subcuenta los contratados en el pipeline y en Campañas.
- **Empleados:** los registros creados a mano no tienen `gema_codigo`. Cuando GEMA trae a la misma
  persona, puede quedar duplicada la cédula.
- **Conductores:** el sync de GEMA sobrescribe el estado, y una reactivación hecha desde Procesos se
  puede revertir si GEMA todavía no refleja el reingreso.
- **Campañas:**
  - el filtro de mes no filtra el gasto de Meta, así que el costo mensual por contratación queda
    sobreestimado;
  - las columnas «Fuga» y «Diagnóstico de calidad» siempre salen vacías;
  - no hay atribución de candidatos a campañas.
- **Incapacidades:** no hay acción que apague la marca «la matriz cambió después» (`matriz_cambio_pendiente`).
  El expediente queda en «Con incidencias» sin forma aparente de salir.
- **Rotación → Rendimiento, pestaña Quincenas:** los meses solo tienen etiqueta de enero a junio, y los
  KPIs comparan las dos **primeras** quincenas del conjunto, no las dos últimas.
- **Rotación → Ficha:** el botón «Volver al buscador» apunta a `/dashboard/conductores`.
- **Accidentabilidad:** remite a Rotación → Datos para cargar conductores, pero esa carga ya no existe;
  los conductores llegan de GEMA o de Contratación.
- **Riesgo:** la variable «Días de incapacidad EPS · 90 días» también suma las incapacidades de ARL.

### 9.3 Funciones visibles sin implementar

- Vacantes: botón «Filtros»; no se puede editar el contenido de una vacante existente.
- Empleados: «Editar» y «Cambiar estado» del menú de fila; «Subir documento» en el perfil.
- Documentos: «Subir documento», «Nueva carpeta» y la tarjeta «Almacenamiento».
- Documentos: nada marca los documentos como «vencido» automáticamente; `expires_at` no se usa.
- Candidato: las secciones Experiencia y Educación son fijas.
- Conductores: no hay alertas de vencimiento de licencia ni de contrato.
- Rotación: no hay exportaciones ni indicadores de rotación de personal (tasa de retiros e ingresos
  por periodo).
- Comunicaciones: no hay asignación, etiquetas, envíos masivos ni cierre de conversaciones.

### 9.4 Decisiones de negocio por confirmar (Incapacidades, piloto)

Del plan de desarrollo, sección 12 (`docs/Plan_desarrollo_incapacidades_GESTIVO.md`):

- 12.1: factor para EL, LM y LP.
- 12.3: vínculo entre episodio y prórroga.
- 12.5: base exigible.
- 12.6: tolerancia 0 y tipos de ajuste.
- 12.7: redondeo.
- 12.8: revisión de Control Interno.
- 12.10: una sola radicación activa por expediente.
- 12.12: qué manda si la matriz cambia después de radicar.
- 12.13: catálogo de estados y plazos.
- 12.14: si Seguros Bolívar equivale a ARL Bolívar.

### 9.5 Límites técnicos que conviene conocer

- Lecturas sin paginar, que se cortan en 1.000 filas (límite de PostgREST): listado de Empleados y
  Documentos.
- Comunicaciones muestra 200 conversaciones y 500 mensajes por hilo.
- Alarmas y eventos del mapa de calor se limitan a 500.
- En Rotación, núcleo familiar e incentivos borran la tabla entera en cada carga.
- El mapa de calor depende de Nominatim y OSRM públicos.

---

## 10. Referencia de archivos

| Área | Pantallas | Lógica | Migraciones y documentos |
|---|---|---|---|
| Permisos y menú | — | `src/lib/constants.ts`, `src/lib/permissions*.ts`, `src/proxy.ts` | `016_user_types_permissions.sql`, `023_rrhh_solo_rrhh.sql` |
| Vacantes | `src/app/(dashboard)/vacantes/**` | `src/lib/actions.ts` | `001`, `024` |
| Candidatos y procesos | `src/app/(dashboard)/candidatos/**`, `src/components/contratacion/`, `src/components/candidatos/` | `src/lib/contratacion/`, `src/lib/actions.ts`, `src/app/api/webhooks/[slug]/route.ts` | `021`, `022`, `025`, `026`; catálogo `src/lib/mcp/catalogo/reclutamiento.ts` |
| Empleados | `src/app/(dashboard)/empleados/**` | `src/lib/actions.ts`, `src/lib/gema/sync.ts` | `013`, `014` |
| Conductores | `src/app/(dashboard)/conductores/**` | `src/lib/gema/sync.ts`, `src/lib/gema/map.ts` | `005`, `006` |
| Documentos | `src/app/(dashboard)/documentos/**` | `src/lib/actions.ts` | `004_documents_storage.sql` |
| Campañas | `src/app/(dashboard)/campanas/**` | `src/lib/recruitment/`, `src/lib/meta/sync.ts` | `015`, `20260911160357` |
| Ausentismo | `src/app/(dashboard)/ausentismo/**` | `src/lib/ausentismo/` | `042`, `20260902*`–`20260904*`, `20260917184357`; `docs/ausentismo-vacaciones-por-rango.md`, `docs/migracion-ausentismo-registros-2026.md` |
| Incapacidades | `src/app/(dashboard)/incapacidades/**` | `src/lib/incapacidades/` | `20260911201033`, `205408`, `211305`, `215045`, `20260914161822`; `docs/incapacidades-*.md`, `docs/Plan_desarrollo_incapacidades_GESTIVO.md` |
| Riesgo | `src/app/(dashboard)/riesgo/**` | `src/lib/riesgo/`, `src/app/api/cron/riesgo-conductores/` | `20260910155217`; `docs/analisis-riesgo-conductores.md` |
| Rotación | `src/app/(dashboard)/rotacion/**`, `src/components/rotacion/` | `src/lib/rotacion/`, `src/app/api/rotacion/**` | `005`–`007`, `011`, `027`, `050`–`076`; catálogo `src/lib/mcp/catalogo/rotacion.ts` |
| Comunicaciones | `src/app/(dashboard)/comunicaciones/**` | `src/lib/comunicaciones/`, `src/app/api/webhook/whatsapp/`, `src/app/api/comunicaciones/adjuntos/` | `20260901200651`, `20260901201838`, `20260902194525`, `20260904171240` |
| Crons | — | `vercel.json`, `src/app/api/cron/**` | — |
| Diccionario de datos | — | — | `docs/diccionario-datos-gestivo.md` |
