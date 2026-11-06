# Proceso de reclutamiento de conductores

> Levantado del código de Gestivo el 2026-11-06 (rama `main`, `1d89529`).
> Describe el proceso **tal como hoy lo soporta la aplicación**. Lo que ocurre
> fuera de Gestivo (la entrevista, los exámenes en la IPS, la prueba de manejo
> en la vía, la escuela) solo se registra aquí como estado y fecha; donde el
> código no dice quién lo ejecuta, el documento lo marca como **«por confirmar»**.

Fuentes: `src/lib/contratacion/{actions,constants}.ts`, `src/lib/actions.ts`,
`src/lib/padrino/servidor.ts`, `src/lib/permisos/catalogo.ts`,
`src/lib/mcp/catalogo/reclutamiento.ts`, `docs/plan-padrino.md` y las
migraciones 015, 017, 021, 025, 026, `20260904171240`,
`20261006145717` y las del Plan Padrino.

---

## 1. Vista general

```
 ATRACCIÓN            REGISTRO               SELECCIÓN                                      VINCULACIÓN
 ─────────            ────────               ─────────                                      ───────────
 Meta Ads ─┐
 WhatsApp ─┤                                 Pendiente → Citado → Exámenes F1 → Exámenes F2
 Computra- ├─► Candidato ─► Proceso de  ─►        → Prueba de manejo → Escuela             ─► Contratado ─► Alta automática
 bajo      │   (por cédula)  contratación         → Reconocimiento de ruta                     │           en Conductores
 Referido ─┤                 (+ vacante)                      │                                │           (provisional)
 ManyChat ─┤                                                  └─► Cierre de proceso (causa)    │                │
 Varylo   ─┘                                                                                   │     GEMA confirma la ficha
                                                                                               │     en el sync de las 3:00 a. m.
 Plan Padrino: prerregistro del referido ──── se enlaza solo ──── elegibilidad ────────────────┴─► hitos de bonificación
```

Un aspirante vive en **tres registros** que el sistema mantiene unidos por la cédula:

| Registro | Tabla | Para qué |
|---|---|---|
| Candidato | `candidates` | La persona: nombre, cédula, teléfono, canal de llegada (`source`). |
| Postulación | `candidate_vacancy` | La persona en una vacante, con su etapa en el tablero Kanban. |
| Proceso de contratación | `procesos_contratacion` | El seguimiento operativo: estado, SIMIT, antecedentes, licencia, fechas de cada paso y causa de no contratación. **Es el registro que manda.** Reemplazó al Excel «Procesos de reclutamiento». |

---

## 2. Quiénes intervienen

| Actor | Qué hace en el proceso | Dónde / permiso en Gestivo |
|---|---|---|
| **Gestión Humana – selección** (analista / auxiliar de Gestión Humana) | Publica vacantes, registra al aspirante, valida SIMIT, antecedentes y licencia, cita, avanza los estados y cierra el proceso con su causa. | Vacantes (`vacantes`), Candidatos (`candidatos` con edición), Comunicaciones (`comunicaciones`). |
| **Coordinadora de Gestión Humana** | Supervisa el embudo; en el Plan Padrino decide la elegibilidad, valida el certificado de experiencia, define el esquema A/B y aprueba los hitos. | Candidatos; sub-funciones `padrino_consulta` y `padrino_aprobacion`. |
| **Marketing / quien administra las campañas** | Pauta en Meta Ads y lleva las métricas del embudo por canal. | Campañas (`campanas`). |
| **Aspirante** | Escribe por WhatsApp o se postula por un portal; asiste a citación, exámenes, prueba, escuela y reconocimiento de ruta. | No entra a Gestivo. |
| **Padrino** (conductor activo o empleado autorizado) | Refiere al aspirante y entrega su hoja de vida. | No entra a Gestivo; lo registra Gestión Humana (`padrino_registro`). |
| **IPS / médico ocupacional** | Practica los exámenes médicos de ingreso (fases 1 y 2). | Externo; Gestivo solo guarda la fecha de citación de cada fase. |
| **Evaluador de la prueba de manejo** | Toma la prueba práctica. | **Por confirmar** (el código solo guarda la fecha). |
| **Instructor de conducción / Operativo** | Dicta la escuela y acompaña el reconocimiento de ruta. | **Por confirmar** (el código solo guarda el estado). |
| **GEMA** (sistema operativo) | Es el dueño del maestro de conductores: confirma la ficha provisional y asigna el código. | Sincronización diaria, 3:00 a. m. |
| **Nómina / Tesorería** | Paga los hitos del Plan Padrino aprobados. | `padrino_pago`. |
| **Control Interno** | Audita el Plan Padrino (bitácora de quién registró, aprobó y pagó). | `padrino_consulta` (solo lectura). |
| **Gerencia** | Aprueba por escrito cada versión de la política Plan Padrino. | `padrino_politica` la publica un administrador. |

> Gestivo no asigna un reclutador responsable por aspirante:
> `candidate_vacancy.assigned_to` existe pero ningún flujo lo llena.

---

## 3. Paso a paso

### Paso 0 — Abrir la vacante

- **Quién:** Gestión Humana.
- **Dónde:** Recursos Humanos › Vacantes.
- La vacante debe llamarse con la palabra **«Conductor»** (p. ej. «Conductor de bus»). De ese título depende que, al contratar, la persona se cree en **Conductores** y no en Empleados (la comparación ignora tildes y mayúsculas).

### Paso 1 — Atracción y llegada del aspirante

- **Quién:** Marketing / Gestión Humana; el aspirante.
- **Canales registrados** (`medio_postulacion`): WhatsApp, Computrabajo, Referido, Varylo, ManyChat, Voluntario, Reingreso, Otro.
- **Campañas:** el gasto de Meta Ads se sincroniza y el embudo diario por canal (conversaciones → postulantes → pasan filtro → continúan → evaluaciones médicas → aptos → contratados, con el motivo de fuga) se lleva en el módulo Campañas.
- **Tres puertas de entrada al sistema:**
  1. **Formulario de proceso de contratación** en Candidatos (la vía normal).
  2. **Desde una conversación de WhatsApp** en Comunicaciones: el panel del contacto abre el mismo formulario, prellenado con el celular; la conversación queda marcada como «Candidato» y enlazada a la ficha.
  3. **Webhooks** de plataformas externas (Integraciones, `POST /api/webhooks/<slug>`): crean o actualizan el candidato buscando por teléfono, documento o correo. Estos llegan sin proceso de contratación: Gestión Humana debe crearlo.

### Paso 2 — Registro del proceso de contratación

- **Quién:** Gestión Humana – selección.
- **Dónde:** Recursos Humanos › Candidatos › nuevo proceso.
- **Obligatorios:** nombre y cédula (el nombre se guarda en MAYÚSCULAS).
- **Se diligencia:** celular, vacante, medio de postulación, si es **reingreso**, categoría de licencia (A1…C3), observación.
- **Lo que hace el sistema solo:**
  - Si la cédula no existe como candidato, lo crea (`source` = medio de postulación).
  - Si hay vacante, inscribe al candidato en ella y pone su tarjeta del Kanban en la etapa equivalente.
  - **Plan Padrino:** si un padrino había prerregistrado esa cédula, el referido se enlaza al proceso y pasa a *En validación* (ver §5).
- Estado inicial: **Pendiente por citar** (en el Kanban: «Recibido»).

### Paso 3 — Validaciones previas

- **Quién:** Gestión Humana – selección.
- Se registran en el mismo proceso:

| Validación | Valores | Nota |
|---|---|---|
| **SIMIT** | OK (sin deuda) · Deuda · Acuerdo de pago · Pendiente verificar | Con deuda se anota el valor en COP. «Deuda SIMIT» es causa de cierre. |
| **Antecedentes** | Sin antecedentes · Con antecedentes · Pendiente verificar | |
| **Licencia** | Categoría A1…C3 | |

- Si no pasa el filtro, se va directo a **Cierre de proceso** (Paso 9).

### Paso 4 — Citación

- **Quién:** Gestión Humana – selección.
- Estado **Citado** + **fecha de citación**. La lista se puede filtrar por fecha de creación o por fecha de citación.

### Paso 5 — Exámenes médicos (dos fases)

- **Quién:** Gestión Humana cita; la IPS los practica.
- Estados **Exámenes médicos · fase 1** y **fase 2**, cada uno con su fecha de citación (`fecha_examenes`, `fecha_examenes_fase2`; la fase 2 existe desde 2026-10-06).
- Resultado no apto → cierre con causa «Exámenes médicos» o «Proceso psicotécnico».

### Paso 6 — Prueba de manejo

- **Quién:** evaluador **por confirmar**; Gestión Humana registra.
- Estado **Prueba de manejo** + **fecha de prueba**.
- Si no aprueba → cierre con causa «No pasó prueba de manejo».

### Paso 7 — Escuela

- **Quién:** instructor de conducción (**por confirmar**).
- Estado **En escuela**. No tiene fecha propia en el sistema.

### Paso 8 — Reconocimiento de ruta

- **Quién:** Operativo / instructor (**por confirmar**).
- Estado **Reconocimiento de ruta**. No tiene fecha propia en el sistema.

### Paso 9 — Resultado

**A. Contratado**

- **Quién:** Gestión Humana – selección (con la aprobación de los jefes que autorizan la contratación, fuera del sistema).
- Estado **Contratado** + **fecha de contrato**.
- **Alta automática** (no bloquea el guardado si falla):
  - Vacante de conductor y cédula nueva → se crea la ficha en **Conductores** en estado ACTIVO, marcada como **provisional** (`solo_informativo`) con la observación «Creado automáticamente al contratar (módulo Candidatos)».
  - Si la cédula ya existía como conductor retirado → **reingreso**: se reactiva con `fecha_reingreso` = fecha de contrato.
  - Si la cédula se parece a la de un conductor conocido, la ficha nace con un aviso de la cédula que probablemente era la correcta (`npm run conductores:revisar-altas` las lista).
- **GEMA confirma** la ficha en el sync de las 3:00 a. m. y le asigna código. Si nunca la reconoce, la cédula quedó mal digitada: hay que corregirla.
- **Plan Padrino:** si el contratado es un referido elegible, pasa a *Contratado* y se crean sus hitos de bonificación (§5).

**B. Cierre de proceso**

- **Quién:** Gestión Humana – selección.
- Estado **Cierre de proceso** con **causa de no contratación** (lista o texto libre):

| Causa |
|---|
| No se ajusta al perfil |
| Desistimiento |
| Incomunicado |
| Exámenes médicos |
| No aprobado reintegro |
| Proceso psicotécnico |
| No pasó prueba de manejo |
| Laborando en otra empresa |
| Deuda SIMIT |

- En el Kanban la tarjeta pasa a «Rechazado».

---

## 4. Estados y su equivalencia

| # | Estado del proceso | Etapa en el Kanban | Fecha que se registra | ¿En curso? |
|---|---|---|---|---|
| 1 | Pendiente por citar | Recibido | fecha de creación | Sí |
| 2 | Citado | Citado | fecha de citación | Sí |
| 3 | Exámenes médicos · fase 1 | Exámenes médicos · fase 1 | fecha de exámenes F1 | Sí |
| 4 | Exámenes médicos · fase 2 | Exámenes médicos · fase 2 | fecha de exámenes F2 | Sí |
| 5 | Prueba de manejo | Prueba de manejo | fecha de prueba | Sí |
| 6 | En escuela | En escuela | — | Sí |
| 7 | Reconocimiento de ruta | Reconocimiento de ruta | — | Sí |
| 8 | Contratado | Contratado (ganado) | fecha de contrato | No |
| 9 | Cierre de proceso | Rechazado (perdido) | — (causa obligatoria en el uso) | No |

El sistema **no obliga el orden**: se puede saltar de cualquier estado a cualquier otro.

---

## 5. Subproceso: Plan Padrino (aspirante referido)

Detalle completo en `docs/plan-padrino.md`.

| Paso | Quién | Qué pasa |
|---|---|---|
| 1. Prerregistro / registro | Gestión Humana (`padrino_registro`) | Se registra el referido con la cédula del padrino; puede ser antes de que exista el proceso. Gestivo evalúa P1–P3 (padrino) y R1–R5 (referido) y congela el resultado. P1 «no cumple» bloquea. Se adjunta el certificado de experiencia. |
| 2. Enlace con el proceso | Automático | Al crear o guardar el proceso de contratación con esa cédula, el referido se enlaza y pasa a *En validación*. |
| 3. Elegibilidad | Coordinadora de GH (`padrino_aprobacion`) | Revisa los semáforos, valida o rechaza el certificado, decide *elegible* / *no elegible* y el esquema (A con experiencia urbana en Barranquilla, B sin ella). |
| 4. Contratación | Automático al pasar el proceso a Contratado | Se ajusta la versión de la política vigente a la fecha de ingreso, se revalidan requisitos y se crean los hitos (ingreso + N meses). |
| 5. Causación | Automático (cron diario, después del sync de GEMA) | Cada hito se causa si el referido sigue activo y el padrino tiene contrato vigente. |
| 6. Aprobación | Coordinadora de GH, **distinta de quien registró** | Aprueba o rechaza cada hito; el último del esquema B exige «desempeño satisfactorio». |
| 7. Pago | Nómina / Tesorería (`padrino_pago`) | Exporta los hitos aprobados a Excel, los marca pagados con referencia; quedan en `incentivos`. |
| 8. Auditoría | Control Interno | Consulta la bitácora `padrino_eventos`. |

---

## 6. Puntos a tener en cuenta (hallazgos del levantamiento)

1. **El Kanban no actualiza el proceso.** Mover una tarjeta en el tablero cambia solo la etapa de la postulación (`candidate_vacancy`) y su historial; **no** cambia el estado en `procesos_contratacion` ni dispara el alta automática. Llevarla a «Contratado» desde el Kanban **no crea al conductor**. El estado debe cambiarse siempre desde el proceso de contratación.
2. **El historial de etapas está incompleto.** Los cambios hechos desde el proceso de contratación no se escriben en `stage_history`, así que los tiempos entre etapas no se pueden medir con esa tabla.
3. **Sin responsable por aspirante.** No hay reclutador asignado; tampoco se guarda quién movió cada estado del proceso (solo `created_by` al crearlo).
4. **Escuela y reconocimiento de ruta sin fecha**, y prueba de manejo sin resultado: solo el estado.
5. **Los candidatos que llegan por webhook** no tienen proceso de contratación hasta que alguien lo crea.
6. **Fichas provisionales:** un error en la cédula al contratar deja un conductor ACTIVO que GEMA nunca confirma (había 18 así el 2026-10-19).
7. **Por confirmar con Gestión Humana:** quién toma la prueba de manejo, quién dicta la escuela, quién acompaña el reconocimiento de ruta, quién aprueba la contratación final y qué contienen las fases 1 y 2 de los exámenes.
