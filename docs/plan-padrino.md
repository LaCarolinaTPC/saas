# Plan Padrino — Condiciones y flujo de trabajo

Módulo de referidos de conductores con bonificación al padrino (y, desde la
política v3, también al referido). Fuente: Política de Bonificación Plan Padrino v2
(Gerencia General / Control Interno), la Política Plan Padrino actualizada
(2026-11-03, «v3») y `work/Plan Padrino/Spec_Gestivo_Plan_Padrino.md`.

- **Rutas**: `/candidatos/plan-padrino` (referidos), `/candidatos/plan-padrino/hitos` (pagos), `/candidatos/plan-padrino/tablero` (indicadores).
- **Código**: `src/lib/padrino/` (`politica.ts` parámetros, `reglas.ts` y `hitos.ts` reglas puras, datos y acciones), `src/app/(dashboard)/candidatos/plan-padrino/`.
- **Tablas**: `padrino_politicas`, `padrino_referidos`, `padrino_hitos`, `padrino_eventos` (bitácora), `padrino_empleados_autorizados`, `padrino_pagos_historicos`. Bucket privado `plan-padrino` para certificados.

---

## 0. Versiones de la política y parámetros (desde 2026-11-03)

Cada versión de `padrino_politicas` guarda sus **parámetros** en `parametros` (jsonb,
validado con zod en `src/lib/padrino/politica.ts`). Ahí está lo que antes estaba fijo
en el código:

- los esquemas, sus hitos y el pago de cada hito a **padrino** y a **referido**;
- las ventanas (sanciones, faltas graves, hoja de vida) y la antigüedad mínima;
- las listas: áreas y cargos excluidos, accidente grave, categorías de licencia y causas de retiro;
- por cada requisito, si está **activo**, si **bloquea** y en qué **momento** se verifica (al registrar o al contratar).

El catálogo de reglas sigue en código (`reglas.ts`). Cambiar un monto, un plazo o una lista
no exige programar; agregar un requisito que mire un dato nuevo, sí.

**Estados de una versión:**
- **borrador**: se edita y nunca rige, aunque tenga fecha.
- **publicada**: rige entre `vigente_desde` y `vigente_hasta`. Un trigger impide editarla;
  lo único permitido es cerrar su `vigente_hasta` una vez. Cambiar la política = crear otra versión.

**Situación al 2026-11-03:**
- **v2** está publicada, con parámetros que reproducen exactamente el comportamiento
  anterior. Lo verifica la prueba de regresión, y también se comprobó con los 5 referidos reales.
- **v3** está en **borrador**, con los valores del documento.

### Qué versión aplica a cada referido

- **Al registrar:** la vigente ese día, para poder validar.
- **Al pasar a Contratado:** la vigente en la **fecha de ingreso**, porque la política aplica a los
  «referidos que ingresen a partir de la fecha de vigencia». Si es distinta de la que tenía, se
  reasigna (bitácora `version_ajustada`). Además:
  - se recalcula el esquema;
  - se verifican otra vez todos los requisitos, incluidos los de contratación. El resultado
    queda en `validacion_contratacion`.
  - Si uno que **bloquea** no se cumple, no se crean hitos y el motivo queda en `hitos_bloqueados_motivo`.

### Lo que cambia con la v3

| Tema | v2 | v3 |
|---|---|---|
| Esquemas | A $700.000 y B $200.000, todo al padrino | A $700.000 (padrino $500.000 + referido $200.000), B $200.000 (solo padrino), **C reintegro** $400.000 (padrino $200.000 + referido $200.000) |
| Hitos A | 150k / 200k / 350k | Mes 1: P 100k · Mes 2: P 200k + R 100k · Mes 3: P 200k + R 100k |
| Hito 2 de B | Exige desempeño satisfactorio | Solo contrato activo del referido |
| Padrino | Conductores + empleados en lista blanca | Igual: conductores y los empleados de `padrino_empleados_autorizados`. Gestión Humana (2026-11-07): ningún cargo administrativo puede ser padrino, salvo el instructor de conducción (CAUSADO LOPEZ WILSON JOSE, cc 72189317). Además, ≥ 3 meses de antigüedad (**P4**) |
| Sanciones | Cualquier descargo o correctivo en 6 meses (**P3**) | Proceso disciplinario abierto (**P5**: descargos vigentes → revisar, porque Gestivo no registra el cierre) o falta grave en 12 meses (**P6**: accidente con responsabilidad directa nivel III-IV → no cumple; alcohol y fraude no tienen fuente → revisar) |
| Retiro del padrino | El hito no se causa | El padrino pierde lo suyo; **el referido conserva sus pagos**. Si se retira y lo recontratan, pierde lo que no se había causado: su parte exige contrato **sin interrupción** desde el ingreso del referido (el paso de conductor a empleado sin hueco sí vale) |
| Hoja de vida previa | 12 meses | 6 meses (**R2**) |
| Referido | R1-R5 | R2-R3 y: licencia C2/C3 (**R6**), antecedentes (**R7**), exámenes (**R8**), inducción y PESV (**R9**), certificado para A (**R10**), **una bonificación por cédula** (**R11**: hitos pagados en Gestivo + `padrino_pagos_historicos`), tipo de ingreso (**R12**), hoja de vida registrada antes de la selección (**R13**). R6-R9 se verifican **al contratar** y **bloquean** los hitos: si no se cumplen, no se paga (R8 queda en «no cumple» si el proceso ya está contratado sin las fechas de exámenes). R1 (antecedentes internos), R4 y R5 salen |
| Reintegros | No se distinguen | Menos de 6 meses fuera: **sin bonificación** (`sin_bonificacion_motivo`, no se crean hitos). 6 meses o más: **C**, salvo despido con justa causa (Gestión Humana, 2026-11-07): cuentan como justa causa `JUSTA_CAUSA`, `ABANDONO_CARGO`, `BAJO_RENDIMIENTO`, `ACCIDENTALIDAD` y `PERIODO_PRUEBA`. Un fin de contrato sí da derecho. Sin causa registrada: C en revisión. Nunca A. Es reintegro aunque GEMA ya lo muestre ACTIVO por el reingreso (se toma el retiro anterior de GEMA o de `conductores_retiro`), y también quien trabajó antes como empleado (`employees.end_date`) |

**Semántica de la decisión de elegibilidad:**
- Un «no cumple» de un requisito que **bloquea** exige excepción documentada.
- Un «no cumple» que no bloquea, o un «revisar», solo exige observación.
- Los requisitos que se verifican al contratar no cuentan todavía.

### Hitos por beneficiario y pago

- `padrino_hitos` tiene una fila por hito y **beneficiario** con pago mayor que cero
  (`beneficiario`, `cedula_beneficiario`, `nombre_beneficiario`). La clave única es
  `(referido_id, numero, beneficiario)`. Los hitos de la v2 son todos del padrino.
- **Fila del referido:** solo exige la permanencia del referido.
- **Fila del padrino:** exige además que el padrino siga vigente.
- Si el referido se retira, no se causa lo de ninguno y se cancelan los hitos siguientes de los dos.
- **Exportación a nómina y `incentivos`**, con la cédula del **beneficiario**:
  - padrino: `PLAN PADRINO B1 - REFERIDO <cédula>`;
  - referido: `PLAN PADRINO A2 - BONO REFERIDO`.
  - El Excel trae al principio «Beneficiario», «Cédula a pagar» y «Nombre a pagar».
- Quien cobra un hito no lo gestiona (RQ-07): esto vale también para el referido.

### Registro antes de la selección (prerregistro, F4)

La política v3 pide que el padrino registre la hoja de vida **antes** de que el candidato empiece
el proceso de selección. Por eso «Registrar referido» tiene dos modos:

- **Antes de la selección (prerregistro).** Se registra con la cédula y el nombre del candidato,
  más el padrino, sin proceso de contratación. Queda en «Registrado» con la etiqueta
  «Prerregistro». No se deja si el candidato ya está en un proceso en curso. La elegibilidad no se
  decide hasta que haya proceso.
- **Desde un proceso existente.** Es para la transición. Si el proceso empezó antes del registro,
  el requisito **R13** queda en «no cumple» y la lista lo marca como **registro tardío**.

**Enlace automático.** Cuando Selección crea o guarda un proceso de contratación con la cédula de un
prerregistro (`createProceso` / `updateProceso` → `enlazarPrerregistro`):
- el registro se enlaza solo con el proceso;
- se revalida con su versión de la política y pasa a «En validación»;
- queda en la bitácora como `enlazado_proceso`.

**R13: hoja de vida registrada antes de iniciar la selección.** Compara la fecha de registro en el
plan con la de creación del proceso. Los días de gracia son el parámetro
`referido.tolerancia_registro_dias` (en la v3 son 0).
- En la v3 del código está activo y bloquea.
- El borrador v3 que ya está en la base se creó antes de R13, así que allí está apagado. Se
  enciende en «Editar parámetros».

### Pagos del plan antes de Gestivo (F6)

En `/candidatos/plan-padrino`, la sección **«Pagos del plan antes de Gestivo»** es solo para quien
administra la política (ver «Quién administra la política»), porque trae cédulas de personas. Sirve para:

- **Cargar** el listado que entregue Nómina o Gestión Humana, en Excel .xlsx o CSV, de máximo 5 MB.
  - Solo exige una columna de **cédula**; el **año** (o una fecha) y el **valor** son opcionales.
  - Detecta el encabezado aunque haya un título encima, limpia las cédulas con puntos y descarta las filas repetidas.
  - Lo lee `leerTablaHistorico` (`historico.ts`), que es puro y tiene pruebas.
- **Previsualizar** antes de cargar: filas válidas, errores por fila, cédulas que ya estaban cargadas
  y referidos de Gestivo que aparecen en el listado.
- **Etiquetar la carga con su fuente** (quién la entregó y cuándo), que no se puede repetir.
- **Reversar** una carga entera por su fuente.
- Ver los **referidos registrados cuya cédula ya tenía un pago**. Esto verifica los 8 casos de doble
  pago que cita la política: para ellos R11 queda en «no cumple».

Los datos van a `padrino_pagos_historicos`, que tiene RLS sin políticas, y nunca a git ni a una migración.

### Tablero: lo nuevo de la v3 (F7)

- **Por esquema y beneficiario:** lo causado y lo pagado por esquema (A, B, C), separando padrino
  y referido.
- **Costo por conductor que cumplió 3 meses:** lo causado de los referidos contratados en el rango,
  dividido entre los que llegaron a los 3 meses y seguían activos. Es el indicador de la política
  ($1.109.000 en 2026).
- **La misma cohorte con cada versión:** lo que habría causado la cohorte del rango con las reglas de
  cada versión (v2, v3), con los mismos ingresos, retiros y esquemas, hasta hoy, suponiendo al
  padrino activo (`costoComparado`).

### Quién administra la política

Editar el borrador, crear o descartar borradores, publicar versiones y cargar o reversar el
histórico de pagos lo puede hacer:
- el **administrador**, o
- quien tenga la sub-función **«Plan Padrino · política»** (`candidatos.padrino_politica`) con
  permiso de edición.

La sub-función es sensible: no la tiene nadie hasta que se asigna usuario a usuario en
Configuración › Usuarios. La regla está en `puedeAdministrarPoliticaPadrino` (`src/lib/permissions.ts`).

El **simulador** lo usan también quienes tienen **aprobación** en Plan Padrino.

### Simulador y publicación desde la página

En `/candidatos/plan-padrino`, el recuadro **«Política v3 en borrador · aún no rige»** muestra los
esquemas del borrador y tiene dos herramientas:

- **Simulador** (aprobación del Plan Padrino o administrador). Evalúa a las mismas personas, con los
  datos de hoy, con la versión vigente y con el borrador, lado a lado:
  - esquema y tipo de ingreso;
  - pagos a padrino y a referido, con sus fechas;
  - requisitos;
  - el veredicto: se aprueba directo, con observación, solo por excepción o sin bonificación.

  Sirve para un referido registrado o para otra persona (proceso de contratación + padrino). Se
  puede suponer el certificado de experiencia validado o no. No guarda nada.

  **Pagos simulados.** Cada versión muestra el calendario de pagos: fecha, hito, a quién se le paga,
  valor, resultado y acumulado. Un escenario común permite comparar:
  - los dos permanecen todo el plan;
  - el referido se retira antes de cumplir el mes N;
  - el padrino se retira antes de cumplir el mes N.

  Se calcula con `pagosSimulados` (`hitos.ts`), que pasa cada hito por `evaluarHito`, la misma regla de
  la evaluación diaria.
- **Editar parámetros** (quien administra la política). Edita el borrador por secciones:
  - esquemas, con nombre, condición, a quién aplica, si exige certificado, y por cada hito el mes,
    la descripción, el pago al padrino y al referido, y si exige desempeño;
  - padrino: quién puede serlo, antigüedad, ventanas, accidente grave, áreas y cargos excluidos;
  - referido y reintegros: licencias, ventana de hoja de vida, meses mínimos, tipos y causas de retiro;
  - requisitos: activo, bloquea y si se verifica al registrar o al contratar.

  Muestra en vivo los **cambios frente a la versión vigente** (`diferencias`). Al guardar se valida
  con el mismo esquema zod que al leer. También se puede **descartar** el borrador si ningún referido
  está amarrado a él.
- **Versiones de la política** (desplegable debajo). Es el historial: estado (vigente, programada,
  histórica o borrador), vigencia, quién aprobó y publicó, y el soporte con su documento.
  Desde ahí un administrador **crea un borrador nuevo** copiando la vigente; solo puede haber uno
  abierto a la vez.
- **Simulación con todos los referidos actuales.** Se elige la fecha desde la que regiría el
  borrador (puede ser pasada, desde el inicio de la versión vigente) y muestra, por referido y en
  total, qué pasaría: esquema, requisitos que bloquean, hitos de hoy y con la versión nueva
  (proyectados a hoy con los datos reales de GEMA), lo comprometido, lo causado, los ajustes y los
  sobrepagos. Es el mismo cálculo que aplica la publicación retroactiva (`calcularRetroactivo` en
  `retroactivo-servidor.ts`, sobre las funciones puras de `retroactivo.ts`). No guarda nada.
- **Publicar la v3** (quien administra la política). Pide:
  - la fecha desde la que rige, que tiene que ser hoy o futura, salvo que se marque
    **«Aplicar retroactivamente»** (ver abajo);
  - quién aprobó y el soporte, y opcionalmente el **documento firmado** (PDF, JPG o PNG, máximo 8 MB,
    con verificación de la firma binaria). Se guarda en el bucket `plan-padrino` (`politicas/<id>/…`)
    y se abre desde el historial;
  - una confirmación.

  Publica el borrador y cierra la versión abierta el día anterior. No deja fechas que se crucen
  con otra versión (`validarPublicacion` en `politica.ts`).

### Publicación retroactiva

Con «Aplicar retroactivamente», la fecha puede ser pasada, desde el inicio de la versión
abierta. Si es **el mismo día** en que empezó la abierta, esa versión queda **reemplazada**:
`vigente_hasta = vigente_desde − 1`, un rango vacío que nunca rige (el CHECK
`padrino_politicas_vigencia` lo admite desde la migración 20261108023206). Antes de publicar hay que
correr la simulación para esa fecha y confirmar que se revisó.

Al publicar, `aplicarRetroactivo` hace exactamente lo que mostró la simulación:
- **Contratados que ingresaron desde la fecha:** pasan a la versión nueva (`politica_id`), se
  recalculan el esquema y los requisitos al contratar (`validacion_contratacion`,
  `hitos_bloqueados_motivo`) y se concilian los hitos (`conciliarHitos`):
  - lo **aprobado, pagado o rechazado** no se toca;
  - lo aprobado o pagado es un saldo a favor que cubre los hitos nuevos en orden: un hito cubierto
    no se crea y uno cubierto en parte queda por la diferencia;
  - si la versión nueva paga **más** por un hito ya pagado, la diferencia va en un hito de
    **ajuste** («Ajuste v3: …», con otro número y la misma fecha);
  - si paga **menos**, lo que no alcance a descontarse de los hitos siguientes queda como
    **sobrepago** en la bitácora, para revisión manual (no hay hitos negativos);
  - las filas pendientes, por aprobar, no causadas o canceladas se reescriben con la versión nueva
    (misma clave, de nuevo pendientes); las que sobran quedan canceladas («Reemplazado»). No se
    borran porque la bitácora las referencia.
- **Abiertos sin contratar:** se revalidan con la versión nueva.
- Los demás (contratados antes de la fecha, anulados y cerrados) no cambian.
- Al final corre la evaluación de hitos, que causa lo que ya venció.

Cada referido ajustado deja el evento `politica_retroactiva` en la bitácora, con lo que había antes,
lo que queda y las notas. Si algo falla, la versión queda publicada: en el historial de versiones,
**«Reaplicar a los referidos»** vuelve a correrlo (es idempotente).

### Publicar desde el SQL Editor (alternativa)

Si no se usa el botón, lo hace un administrador en el SQL Editor, con la aprobación escrita de Gerencia.

**Antes de publicar:**
- Aplicar la migración 20261108023206, que lleva al borrador las respuestas de Gestión Humana.
- Se define la **fecha de vigencia**. El SQL no aplica la parte retroactiva a los referidos: para una
  fecha pasada use el botón, o después «Reaplicar a los referidos».

```sql
-- Publicar: cerrar la v2 el día anterior y abrir la v3 (todo junto).
BEGIN;
UPDATE padrino_politicas SET vigente_hasta = DATE '2026-11-30' WHERE version = 'v2' AND vigente_hasta IS NULL;
UPDATE padrino_politicas
SET estado = 'publicada',
    vigente_desde = DATE '2026-12-01',
    aprobada_por = 'Gerencia General',
    soporte = 'Política Plan Padrino actualizada, firmada el …',
    publicada_por_email = '<correo de quien publica>',
    publicada_at = now()
WHERE version = 'v3' AND estado = 'borrador';
COMMIT;
```

Desde esa fecha, los registros nuevos y los referidos que **ingresen** desde ese día usan la v3.
Los referidos que ya están en seguimiento con la v2 siguen con la v2.

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
- Cada referido queda amarrado a la **versión de política vigente en su fecha de ingreso**: al registrar se usa la vigente ese día y al contratar se ajusta (ver la sección 0). Cambiar montos = nueva versión (solo administrador, con aprobación escrita de Gerencia).

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
- Permisos: `padrino_consulta`, `padrino_registro`, `padrino_aprobacion`, `padrino_pago`. Las búsquedas que alimentan el registro exigen además **rol con edición** (un rol de solo lectura no puede enumerar personas).
- **Certificados**: además del MIME y el tamaño (≤8 MB), se valida la **firma binaria** (magic bytes) del PDF/JPG/PNG; la descarga va siempre como `attachment` con `nosniff`.
- **Exportes a Excel**: los campos de texto se escapan contra **inyección de fórmulas** (`=`, `+`, `-`, `@`).

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
