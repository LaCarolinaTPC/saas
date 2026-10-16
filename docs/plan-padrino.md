# Plan Padrino — Condiciones y flujo de trabajo

Módulo de referidos de conductores con bonificación al padrino.
Fuente: Política de Bonificación Plan Padrino v2 (Gerencia General / Control
Interno) y `work/Plan Padrino/Spec_Gestivo_Plan_Padrino.md`.

- **Rutas**: `/candidatos/plan-padrino` (referidos), `/candidatos/plan-padrino/hitos` (pagos), `/candidatos/plan-padrino/tablero` (indicadores).
- **Código**: `src/lib/padrino/` (reglas puras + datos + acciones), `src/app/(dashboard)/candidatos/plan-padrino/`.
- **Tablas**: `padrino_politicas`, `padrino_referidos`, `padrino_hitos`, `padrino_eventos` (bitácora), `padrino_empleados_autorizados`. Bucket privado `plan-padrino` para certificados.

---

## 1. Condiciones (requisitos)

La validación se **congela al registrar** el referido (columna `validacion`) y
puede revalidarse. Cada requisito queda en semáforo: **Cumple / No cumple /
Requiere revisión**.

### Requisitos del padrino (P1–P3)

| Código | Requisito | Regla aplicada |
|---|---|---|
| **P1** | Contrato vigente en el área operativa | Conductor `ACTIVO` en GEMA cumple siempre. Empleado activo/periodo de prueba cumple **solo si está en `padrino_empleados_autorizados`** (decisión GH 2026-10-15). |
| **P2** | No es administrativo ni interviene en selección, nómina, tesorería o auditoría | Conductor cumple. Empleado: cumple solo si está autorizado por Gestión Humana. |
| **P3** | Sin sanciones ni procesos disciplinarios en los **últimos 6 meses** | Se revisan descargos de ausentismo y correctivos por accidentes (nivel I–IV). Si no hay nada queda en **"revisar"**: Gestivo no tiene registro disciplinario general, la coordinadora lo confirma. |

> Un P1 en "no cumple" **bloquea el registro** del referido (RQ-01).

### Requisitos del referido (R1–R5)

| Código | Requisito | Regla aplicada |
|---|---|---|
| **R1** | Sin procesos disciplinarios o laborales con la compañía | No cumple con notificaciones de ausentismo. "Revisar" si trabajó antes como conductor (se muestra causa de retiro). |
| **R2** | Sin hoja de vida en la base de selección en los **12 meses** anteriores | No cumple con otro proceso de contratación en ese lapso. "Revisar" si la hoja de vida entró más de 1 mes antes de este proceso. |
| **R3** | Sin otro proceso de selección en curso | No cumple si tiene otro proceso en estados en curso (pendiente, citado, exámenes, prueba de manejo, escuela, reconocimiento de ruta). |
| **R4** | No haberse retirado antes de cumplir **1 mes** en una contratación anterior | No cumple si ingreso→retiro anterior < 1 mes calendario. "Revisar" si GEMA registra un **reingreso** (la vinculación anterior ya no se ve en Gestivo). |
| **R5** | Sin accidentes de tránsito anteriores | No cumple con accidentes registrados con la empresa. "Revisar" si el SIMIT del proceso está pendiente, con deuda o acuerdo de pago. |

### Decisión de elegibilidad

- Si hay un **certificado adjunto sin validar**, no se puede aprobar la elegibilidad: hay que validarlo o rechazarlo primero (evita congelar el esquema en B cuando el proceso ya está contratado).
- `no_elegible`: exige observación.
- `elegible` con algún **"no cumple"**: solo como **excepción documentada** (check + observación obligatoria).
- `elegible` con algún "revisar": observación obligatoria.
- Observación máxima: 2000 caracteres.

### Esquemas de bonificación (política v2, vigente desde 2026-10-01)

El esquema depende del **certificado de experiencia validado** por la coordinadora
(`esquemaPara`): se puede cambiar hasta antes de crear los hitos.

| Esquema | Condición | Hitos |
|---|---|---|
| **A — Con experiencia** | Experiencia certificada en transporte público urbano de Barranquilla | Mes 1: $150.000 · Mes 2: $200.000 · Mes 3: $350.000 — **Total $700.000** |
| **B — Sin experiencia** | Sin experiencia urbana, o experiencia en otras ciudades | Mes 1: $100.000 · Mes 3 (permanencia continua + **desempeño satisfactorio**): $100.000 — **Total $200.000** |

- El mes de permanencia es **mes calendario desde la fecha de ingreso** (Q1).
- Cada referido queda amarrado a la **versión de política vigente** en su fecha de registro; cambiar montos = nueva versión (solo administrador, con aprobación escrita de Gerencia).

### Condiciones de causación de cada hito (RQ-05/06)

Un hito se causa en su fecha (ingreso + N meses) solo si en esa fecha:

1. **(a)** El referido conserva **permanencia efectiva** (ACTIVO en GEMA, o retiro posterior a la causación). Retiro antes de la fecha → hito `no_causado` **y se cancelan los siguientes**.
2. **(b)** El padrino mantiene **contrato vigente** a esa fecha, por **cualquiera de sus vínculos** (conductor o empleado autorizado): un conductor que pasó a empleado autorizado no pierde el hito. La autorización del empleado se evalúa **a la fecha de causación**: una revocación posterior no tumba un hito ya causado. Si no hay vínculo vigente → `no_causado`, pero no cancela los siguientes.

Datos de GEMA sincronizados a diario (cron 3:00 a. m.).

### Controles (RQ-07/08)

- **Segregación de funciones**: quien registró el referido **no puede aprobar** sus hitos.
- El padrino, si es usuario de Gestivo, no ve sus propios referidos (cruce por `profiles.cedula`).
- Nada se borra: todo se **anula con motivo** y queda en la bitácora `padrino_eventos`. Si el referido tiene **hitos aprobados** (posiblemente ya exportados a nómina), la anulación exige una confirmación expresa antes de cancelarlos.
- El pago por lote se marca con **un solo UPDATE**: o se pagan todos los hitos del lote o ninguno.
- Las exportaciones a Excel dejan constancia en la bitácora en **lotes de una sola inserción**.
- Un referido (cédula) solo puede tener **un registro no anulado**.
- Permisos: `padrino_consulta`, `padrino_registro`, `padrino_aprobacion`, `padrino_pago`.

---

## 2. Flujo de trabajo

### Estados del referido

```
registrado → en_validacion → elegible → contratado → en_seguimiento → completado
                           ↘ no_elegible          ↘ no_contratado   ↘ terminado (sin completar)
(anulación con motivo posible mientras esté abierto)
```

### Estados del hito

```
pendiente → por_aprobar → aprobado → pagado
          ↘ no_causado   ↘ rechazado
(cancelado: cuando el referido se retira y caen los hitos siguientes)
```

### Paso a paso

1. **Registro** (`padrino_registro`)
   - Se registra el referido desde su proceso de contratación, indicando el padrino (cédula).
   - Gestivo evalúa P1–P3 y R1–R5 y **congela** el resultado. P1 "no cumple" bloquea.
   - Se adjunta el certificado de experiencia (bucket privado, URL firmada).

2. **Validación y elegibilidad** (`padrino_aprobacion`)
   - La coordinadora revisa los semáforos (puede revalidar) y confirma los "revisar".
   - Decide `elegible` / `no_elegible` con las reglas de observación/excepción.
   - Define el esquema (A/B) según el certificado; se puede cambiar hasta la contratación.

3. **Contratación**
   - Al contratarse el referido (fecha de ingreso en GEMA), se crean los **hitos**
     del esquema con fecha de causación = ingreso + N meses calendario.
   - El referido pasa a `contratado` → `en_seguimiento`.

4. **Evaluación automática de hitos**
   - Con los datos diarios de GEMA se evalúa cada hito pendiente al llegar su fecha:
     permanencia del referido (a) y contrato del padrino (b) → `por_aprobar` o `no_causado`.

5. **Aprobación** (`padrino_aprobacion`)
   - Alguien **distinto de quien registró** aprueba o rechaza (rechazo con observación obligatoria).
   - El hito B2 exige marcar **desempeño satisfactorio** para aprobar.

6. **Pago** (`padrino_pago`)
   - Se exportan los hitos aprobados a Excel para nómina (`/hitos/export`).
   - Se marcan como pagados con fecha (no futura) y **referencia obligatoria** (concepto de nómina, comprobante o planilla, ≤120 caracteres).
   - El pago se refleja en `incentivos` con `source_file = gestivo-plan-padrino`
     (concepto `PLAN PADRINO <esquema><n> - REFERIDO <cédula>`); la carga del Excel de incentivos no las borra.

7. **Cierre**
   - Todos los hitos pagados → referido `completado`.
   - Hitos terminados sin todos pagados → `terminado sin completar`.

### Tablero y seguimiento (RQ-09 a RQ-11)

- **Tablero**: referidos por estado, hitos próximos a **30 días exactos** (mismo corte en el indicador y en la bandeja), por aprobar, por pagar,
  pagado total, serie mensual causado/pagado (12 meses) y top 10 padrinos.
- **Permanencia por fuente**: tasa a 30/60/90 días del Plan Padrino vs. otras fuentes
  de postulación, y costo por contratado. La fuente "Plan Padrino" se atribuye **por proceso** (no por cédula): una recontratación posterior por otro medio no se cuenta al plan, y los contratados sin `fecha_contrato` entran a la cohorte con la fecha de ingreso del conductor.
- **Alertas**: referidos en seguimiento con faltas no justificadas o accidentes desde
  el ingreso mientras tengan un hito por causar, para que la coordinadora los revise antes de que venza. Las faltas con `fecha_inicio`/`fecha_fin` cuentan **cada día del rango** (las rachas de días seguidos se miden bien).
