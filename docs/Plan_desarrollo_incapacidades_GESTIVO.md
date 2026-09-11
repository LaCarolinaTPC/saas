# Plan de desarrollo — Recuperación, cobro y recaudo de incapacidades ante entidades (GESTIVO)

**Fuente leída completa:** `docs/Especificacion_aplicacion_incapacidades_2024.md` (1.923 líneas, secciones 1–15 y anexos A–I con las 1.027 fórmulas de los 79 registros completos). **Fecha del plan:** 2026-09-10. **Fase 0 resuelta:** 2026-09-11 (sección 0). **Estado al 2026-09-11:** las siete fases están en `main`; las migraciones `20260911201033`, `20260911205408` y `20260911211305` aplicadas y cotejadas por el usuario (23 expedientes del backfill, 0 anteriores, 0 pendientes de homologación); la de la fase 7 (`20260911215045`, índices y retención) aplicada también el 2026-09-11: las cuatro migraciones del módulo están en la base. Lo que sigue es el piloto y confirmar los supuestos de 12.5, 12.6, 12.10, 12.1 y 12.13 (ver `docs/incapacidades-fase-7.md`). Nada de lo que aquí se llama tabla, columna, ruta o rol nuevo existe todavía en GESTIVO salvo que se marque **OBSERVADO en GESTIVO**.

**Alcance temporal confirmado por el usuario (2026-09-10):** el proceso de gestión **inicia con las incapacidades que empiezan el 1 de septiembre de 2026 o después**. No se toma el histórico. El libro `Incapacidades 2024_V1.xlsm` sigue siendo la **evidencia de las reglas** del motor (79 registros, 1.027 fórmulas), pero **no es una fuente de datos a importar**.

## Cómo leer este plan

Tres etiquetas, las mismas de la especificación, aplicadas ahora a los dos lados:

- **OBSERVADO (Excel):** fórmula, validación o metadato extraído del libro. Autoridad: el texto de las fórmulas de las 79 filas completas (I, M, N, O, P, Q, S, T, U, V, W, Y, C) y la variante Q70. Los valores manuales del libro **no son reglas ni excepciones**.
- **OBSERVADO (GESTIVO):** lo que existe hoy en el repositorio y en la base autoalojada, verificado el 2026-09-10 leyendo migraciones, código y dos consultas de solo lectura a la base (columnas efectivas, catálogos, distribución de valores, efecto del corte).
- **PROPUESTO:** diseño que este plan recomienda. No existe en Excel ni en GESTIVO.
- **POR CONFIRMAR:** decisión que no se puede tomar con el archivo ni con el código; queda en la lista de decisiones pendientes y **el plan no la resuelve por su cuenta**.

Las decisiones de producto de la sección 1.1 de la especificación **prevalecen** sobre cualquier recomendación de este plan y se reproducen en la sección 2. Las respuestas del acta de la sección 0 prevalecen a su vez sobre 1.1 donde la contradicen (roles).

---

## 0. Acta de decisiones de Fase 0 (2026-09-11)

Respuestas dadas por Administración de Datos el 2026-09-11 a las seis decisiones que bloqueaban el arranque. Quedan **RESUELTAS**; las secciones afectadas llevan la marca «Resuelto 2026-09-11». Queda pendiente de Fase 0, sin bloquear código, completar clase/NIT/vigencia y umbral de las 10 entidades activas del catálogo.

| # | Decisión | Respuesta literal | Cómo queda en el plan |
|---|---|---|---|
| **12.2** | Días a cargo de la ARL | «Cualquier número de días.» | La ARL responde por **todos** los días desde el primero. Se adopta la regla de GESTIVO (`diasACargoPagador`). La rama literal del Excel (ARL SURA −1, otras −2) queda solo en el motor de compatibilidad para pruebas; la liquidación **no** la muestra como alternativa. |
| **12.4** | Fuente y vigencia del salario | «Esto va a ser diligenciado por el siguiente funcionario de información complementaria.» | El salario lo captura en la **etapa 2** el funcionario de RRHH que completa el expediente: `salario_fuente = manual` por defecto, con vigencia y quién lo diligenció. `employees.salary` se muestra solo como sugerencia; nunca se toma solo. Liquidar exige salario diligenciado. |
| **12.9** | Tipos de usuario para Contabilidad y Revisoría | «No, esto va a ser desplegado desde RRHH.» | **No se crean tipos de usuario nuevos.** El módulo `incapacidades` se asigna a `rrhh` y `admin`; RRHH ejecuta también recaudos, aplicaciones, ajustes y conciliación. Los submódulos se conservan como organización de pantallas, no como frontera de permisos; solo `parametros` queda en `SUBS_SENSIBLES`. Si después Contabilidad o Revisoría necesitan entrar, se les asigna el módulo o un submódulo desde Configuración, sin migración. |
| **12.11** | Disparador de la etapa 1 | «Sí. Ojo: esto es con la información que diligencian en la matriz EPS, que es insumo de esta segunda parte.» | **Trigger** `AFTER INSERT` sobre `ausentismo` con el corte, más backfill de las 23. La matriz EPS es la **única** entrada de la etapa 1; ningún dato que ya está en la matriz se vuelve a capturar en el expediente. |
| **12.16** | Casos de borde del corte | «Esto por lo general es licencia de maternidad.» | Las incapacidades largas que cruzan el corte son, por regla general, licencias de maternidad. Entran por **alta manual con motivo** cuando RRHH esté gestionando su cobro (recomendación mantenida). Interpretación del plan, a validar en la primera LM real: la licencia de maternidad necesita regla propia en `incapacidad_reglas` (días a cargo y factor por tipo) y el umbral por entidad la cubre con 0 días mínimos. El factor de LM/LP/EL sigue en 12.1. |
| **12.17** | Umbral de días cobrables | «Ese dato colócalo como parámetro para configurar de acuerdo a la EPS.» | Columna **`dias_min_cobro`** en `ausentismo_catalogos` para cada EPS y ARL (6.2), editable en Parámetros por `admin`, auditada. Semilla: 4 para las EPS (el valor actual de `COBRO_EPS_DIAS_MIN`), 1 para la ARL. El informe de cobro actual sigue con su constante hasta la fase 4, donde pasa a leer el catálogo. |
| **12.18** (requisito nuevo, 2026-09-11) | El expediente debe permitir ajustar el salario y otros datos de la liquidación | «Estos expedientes deben permitir la regla de ajustar salario y otros.» · «Colócalos ajustables; luego en el piloto miramos cuál es la mejor forma.» | **RESUELTA:** los seis campos son ajustables por RRHH en el piloto, con motivo obligatorio, quién y cuándo; cada ajuste genera una **liquidación nueva** (6.4) sin borrar la anterior y la matriz EPS no se toca. En **dos niveles**: (1) **datos de entrada** —salario y vigencia, entidad, tipo, modalidad— cambiar uno recalcula todo; (2) **sobrescrituras del resultado** —días a cargo de la entidad y valor reclamado— no cambian ninguna entrada, pisan lo calculado y la pantalla muestra calculado y ajustado lado a lado con la marca «ajustado a mano»; días a cargo nunca por encima de los días totales; valor reclamado por encima del valor total avisa sin bloquear. Cada ajuste guarda campo, valor anterior, valor nuevo y motivo, para que al cierre del piloto se cuente por campo y por entidad: si las sobrescrituras se repiten para una misma EPS o tipo, se corrige el parámetro (6.2/6.3), no se sigue ajustando a mano. Detalle en 6.1 y 7.3. |
| **12.19** (requisito nuevo, 2026-09-11) | Los días calculados deben ser los mismos de la información inicial | «Ojo: debes validar que los días calculados sean los mismos de la información inicial.» | **Implementado en el motor (fase 1):** `liquidar` recibe `diasInformados` (el `dias_it_pagados` de la matriz) y, si los días calculados desde `fecha_inicio`/`fecha_fin` no coinciden, lanza la incidencia `dias_no_coinciden` y **no liquida** con ninguno de los dos valores. Los **días totales de incapacidad no son ajustables** en el expediente: vienen de las fechas de la matriz; si están mal, se corrigen en la matriz y el expediente recibe el cambio (7.2). Un ajuste de días a cargo (12.18) nunca puede superar los días totales. |

---

## 1. Resumen ejecutivo

GESTIVO ya tiene la mitad de la incapacidad y ninguna parte del cobro. La **matriz EPS** (`ausentismo`, 649 filas vigentes, formulario en producción desde el 2026-09-02) captura la incapacidad con cédula, fechas, días, origen, tipo inicial/prórroga, pagador, diagnóstico, catálogos validados en la base, auditoría, eliminación lógica y exportación. Existe además un **informe de cobro por pagador** que reparte días entre empleador y entidad. No existe nada de lo que la especificación llama gestión de recuperación: ni radicación, ni recaudo, ni abonos, ni saldo, ni salario histórico, ni soportes por incapacidad, ni roles de Contabilidad o Revisoría.

El plan reutiliza la matriz como **la incapacidad** (una fila de `ausentismo` = una incapacidad) y construye encima el **expediente de recuperación** en tablas nuevas, con la captura en dos etapas que exige 1.1: el expediente nace solo cuando existe la incapacidad en la matriz, con únicamente lo que la matriz aporta, y RRHH, Contabilidad y Revisoría lo completan o consultan después según su responsabilidad. El motor de cálculo reproduce las 13 fórmulas observadas como **compatibilidad versionada**, y mantiene separados —en datos, en pantalla y en nombre— los tres conceptos que el Excel mezcla: el importe calculado **Q**, los indicadores del legado **PAGADA/V/Y**, y el **saldo operativo** que resulta de valor reclamado menos abonos aplicados menos ajustes, cuya base exigible queda POR CONFIRMAR.

**El corte del 1 de septiembre de 2026 simplifica el plan.** Medido en la base: de 649 incapacidades vigentes, **23** inician en o después del corte y 626 quedan fuera. Desaparecen la migración histórica del libro, las tablas y columnas de legado importado, la pantalla de importación, la equivalencia con entidades que solo existían en el pasado (COOMEVA, MEDIMÁS, AXA, ADRES…) y varias decisiones que solo importaban para el histórico. Entran, en cambio, tres cosas que el corte obliga a definir: **cómo se aplica el corte** (por `fecha_inicio`, no por fecha de registro: las 626 históricas se cargaron a GESTIVO el 2026-09-02 y por `created_at` parecerían de septiembre), **qué pasa con las cuatro incapacidades que cruzan el corte** (una de 180 días, del 2026-04-21 al 2026-10-17, seguramente en cobro hoy), y **qué umbral de días hace cobrable una incapacidad**, porque las 23 del arranque duran entre 1 y 3 días y con la regla de GESTIVO (EPS desde 4 días) el módulo nacería sin ninguna EPS cobrable.

Siete fases, cada una con su migración aplicada a mano y su verificación. La primera es puramente de decisión, porque la comprobación contra la base real dejó puntos que **no se pueden resolver desde el código** (sección 12): el tipo `EP` del Excel no existe en GESTIVO (existe `EL`); `ARL SURA`, la única entidad con regla propia en las fórmulas, no está en el catálogo ni tiene datos; la regla de días a cargo que GESTIVO ya aplica **difiere** de la fórmula N del Excel para las ARL; el salario existe solo en `employees` y no en `conductores`; no hay roles de Contabilidad ni de Revisoría; y el corte tiene casos de borde.

---

## 2. Decisiones de producto confirmadas (sección 1.1 y corte) y cómo las respeta el plan

| Decisión confirmada | Cómo la aplica el plan |
|---|---|
| **Alcance exclusivo:** recuperación, cobro y recaudo ante entidades. Fuera: pagos al trabajador y nómina. | Ninguna tabla, pantalla ni acción produce un desembolso. `P` (valor empresa) y `M` (días empresa) se calculan y guardan **solo como distribución histórica**, rotulados así, y no alimentan ningún flujo. |
| **Arranque el 2026-09-01, sin histórico.** | Parámetro `fecha_corte_gestion = 2026-09-01`; el expediente se crea solo para incapacidades con `fecha_inicio >= corte`; las anteriores siguen en la matriz sin expediente. El libro Excel no se importa. |
| **RRHH** completa el expediente y sigue solicitud y radicación. | Submódulos `expedientes` + `radicacion` con permiso de edición para el tipo `rrhh` (OBSERVADO: `rrhh` ya tiene el módulo `ausentismo`). |
| **Contabilidad** registra recaudos y aplicaciones, concilia, controla saldos. | Submódulos `recaudos` + `conciliacion`. **Resuelto 2026-09-11 (12.9):** los ejecuta `rrhh`; no se crea tipo `contabilidad`. Las pantallas quedan separadas para que Contabilidad pueda recibirlas después desde Configuración. |
| **Revisoría Fiscal** consulta soportes, historial y observaciones; no modifica, no aprueba, no cierra. | Submódulo `consulta`, solo lectura por construcción: ninguna acción de servidor acepta ese permiso. **Resuelto 2026-09-11 (12.9):** no se crea tipo `revisoria`; la consulta la hace `rrhh`/`admin` hasta que se asigne otro tipo desde Configuración. |
| **Expediente por incapacidad:** responsable, estado, valor reclamado, abonos, saldo pendiente, próxima acción, trazabilidad, soportes. | Tabla `incapacidad_expedientes` 1:1 con `ausentismo`, más radicaciones, recaudos, aplicaciones, ajustes, adjuntos y bitácora. **Catálogo de estados, transiciones, plazos y cierre: POR CONFIRMAR**; el plan propone un borrador mínimo y lo marca. |
| **Captura en dos etapas.** | Etapa 1: el expediente se crea con los campos de la matriz y **ningún campo de gestión obligatorio**. Etapa 2: cada grupo de datos se habilita por operación (liquidar, radicar, recaudar), no por "completar todo". Detalle en 7. |
| **Homologaciones pendientes** deben verificarse contra la matriz y el esquema real. | Verificadas en la sección 5 con la base real y **acotadas a lo que aparece desde el corte**; lo que no cierra queda POR CONFIRMAR con nombre y apellido. |
| **Evidencia Excel:** solo 79 registros / 1.027 fórmulas; valores manuales no son reglas. | El motor implementa exactamente los 14 patrones del anexo B como versión de compatibilidad; las pruebas usan esas 79 filas como fixtures sintéticos. Ningún dato del libro entra a la base. |

«Pago» en la aplicación significa **recaudo recibido de una entidad y aplicado a una incapacidad**. `PAGADA`, `V` e `Y` del legado **no** sustituyen el estado del expediente ni su saldo; con el corte, además, **no habrá filas con esos indicadores** porque no se importa el libro: se conservan solo como salidas del motor de compatibilidad para pruebas y para explicar diferencias.

---

## 3. Diagnóstico del proyecto GESTIVO (OBSERVADO)

### 3.1 Lo que existe y sirve

| Pieza | Dónde | Qué aporta al alcance |
|---|---|---|
| Tabla `ausentismo` (matriz EPS): 45 columnas reales, 649 filas vigentes, 100 % `estado_registro = cerrado` | `supabase/migrations/005_rotacion_tables.sql` + siete migraciones de 2026-09 | **Es la incapacidad.** Trae cédula, nombre, cargo, `indicador_prorroga` (INICIAL 609 / PRORROGA 40), `dias_it_pagados` (calculado por trigger = fin − inicio + 1), `origen` (EG 614, AT 33, LP 1, EL 1), `fecha_inicio`/`fecha_fin`, `eps`/`arl` (pagador), CIE10/diagnóstico/GRD, IPS, profesional, `estado_registro`, `origen_registro` (excel/formulario), `revision[]`, eliminación lógica con motivo, `consecutivo_llave` (índice único cédula + inicio + consecutivo), `lote_carga`, rastro de quién abrió/cerró/modificó. |
| **Las 23 incapacidades del arranque** (`fecha_inicio >= 2026-09-01`, última 2026-09-10) | misma tabla | 22 del formulario, 1 de la última carga Excel; todas INICIAL; EG 21, AT 2; pagadores EPS SURA 9, SALUD TOTAL 6, NUEVA EPS 3, SANITAS 3, ARL BOLIVAR 2; días 1–3 (mediana 2). **Es la población real del piloto.** |
| Formulario de la matriz: registrar, editar, eliminar, restaurar; prórroga exige una incapacidad previa que termine el día anterior; duplicados y cruces detectados | `src/app/(dashboard)/ausentismo/matriz/actions.ts` | Fuente de la **etapa 1**. Ya valida catálogos en el servidor y en la base (triggers). Ya existe la noción de "prórroga encadenada" que la especificación propone como episodio. |
| Catálogos validados en la base | `ausentismo_catalogos` (tipos ORIGEN 5, EPS 9, ARL 1, IPS 90, PROFESIONAL 354, CIE10 182, GRD 16) | Maestro de entidades pagadoras **parcial**: solo EPS y ARL como texto, sin clase ni NIT ni vigencia (ver 5.3). Los cinco pagadores del arranque **ya están** en él. |
| Reglas puras de cobro | `src/lib/ausentismo/matriz-reglas.ts`: `diasACargoPagador`, `ORIGENES_ARL = {AT, EL}`, `COBRO_EPS_DIAS_MIN = 4`, `DIAS_EMPLEADOR_EPS = 2` | Reparto de **días** (no de dinero). Coincide con la fórmula N del Excel para entidades distintas de ARL SURA y para prórrogas; **difiere** para ARL (ver 5.4). El umbral "más de 3 días" es regla de GESTIVO, no del Excel, y **decide si las 23 del arranque son cobrables** (ver 12.17). |
| Informe de cobro por pagador (PDF/Excel/CSV, una hoja por pagador) | `src/lib/ausentismo/cobro.ts` | Base para la **bandeja de cobro**: ya agrupa por entidad y suma días a cargo. No lleva importes. |
| Auditoría general con módulo | `tesoreria_audit_log` vía `logTesoreriaAudit` (`src/lib/devengados/audit.ts`), bitácora `ausentismo_log`, pantalla Tesorería › Auditoría | Rastro de operaciones por persona, rol, IP; filtro por módulo. Se reutiliza tal cual. |
| Permisos por módulo y por submódulo | `user_types.modulos` (jsonb), `user_types.submodulos`, `MODULE_SUBS` (hoy solo `tesoreria`), `SUBS_SENSIBLES`, `puede_editar`, `proxy.ts` + guard en cada página | Mecanismo suficiente para separar RRHH / Contabilidad / Revisoría **dentro de un mismo módulo**. |
| Soportes en Storage | Buckets privados `operativo`, `accidentes`, `documents`; columnas `archivo_ruta/nombre/mime/tamano` (`20260904191056_…`) | Patrón para los adjuntos del expediente. |
| Dinero | `NUMERIC(14,2)` con `CHECK > 0` (`030_devengados.sql`) | Tipo monetario de la casa. |
| Exportación | `BotonesExportar`, `descargarCsv`, `descargarPdfTabla`, `xlsx` en cliente; PDF con gráficos vectoriales (`src/lib/riesgo/riesgo-pdf.ts`) | Descargas con contexto, aviso de datos personales y auditoría. |
| Salario | `employees.salary` + `salary_currency`, `hire_date`, `document_number`, `eps`, `arl`. **`conductores` no tiene salario.** | Entrada **F** del cálculo, con la reserva de vigencia de la especificación (ver 5.2). |
| Convenciones | Migraciones con marca de tiempo (`npm run migracion:nueva`), aplicadas a mano, idempotentes, `GRANT` a `service_role`; RLS sin políticas para datos personales; paginar con `.range()` y `ORDER BY` estable (PostgREST corta en 1.000); `PageHeader`; vista previa temporal bajo `/docs` para verificar UX sin sesión | Todo el plan se ciñe a ellas. |

### 3.2 Lo que no existe (brechas)

| Brecha | Consecuencia | Tratamiento |
|---|---|---|
| Ningún dato de **cobro** (R), **radicación** (AA/AB/AC), **recaudo** (X, AE), **revisión CI** (Z), **observaciones de gestión** (AD) | Toda la gestión de recuperación es nueva | Tablas nuevas de la sección 6 |
| Ningún **importe**: la matriz reparte días, no pesos | No hay O/Q/P/T/U/V | Motor de cálculo nuevo, versionado |
| **Salario** no está en la incapacidad ni en el maestro de conductores | F no se puede tomar de la matriz; `employees.salary` es el actual, no el vigente al evento | Snapshot de salario en el expediente con vigencia; resolución manual cuando no haya fuente (POR CONFIRMAR 12.4) |
| **Entidad pagadora** es texto (`eps`/`arl`) validado contra un catálogo sin clase, NIT ni vigencia | Radicar exige entidad con identidad | Extender `ausentismo_catalogos` (PROPUESTO 6.2), no crear maestro paralelo |
| No hay **episodio** explícito | La especificación lo propone; GESTIVO solo tiene el encadenamiento por fecha en el formulario | Derivar episodio en lectura; persistirlo POR CONFIRMAR |
| No hay roles **Contabilidad** ni **Revisoría**; `MODULE_SUBS` solo cubre `tesoreria` | 1.1 exige tres responsabilidades separadas | Submódulos nuevos + tipos de usuario o asignación por Configuración (9) |
| No hay **soportes por incapacidad** | El expediente los exige | Bucket privado `incapacidades` + tabla de adjuntos |
| No hay **parámetro de corte** | El módulo no sabe desde cuándo gestiona | Parámetro `fecha_corte_gestion` en la tabla de reglas/parámetros (6.3) |

### 3.3 Riesgos heredados que el plan hereda y trata

- La matriz tiene `dias_it_pagados` como nombre de lo que es **días de incapacidad** (I del Excel): el nombre sugiere dinero pagado y no lo es. El plan no renombra la columna (rompería la matriz) pero la etiqueta correctamente en el expediente.
- 626 de las 649 filas vigentes son anteriores al corte y 622 vienen de cargas Excel: **quedan fuera de la gestión por diseño**, pero siguen visibles en la matriz. La bandeja del módulo no las muestra; la matriz sí. Hay que decirlo en pantalla para que nadie las busque en el módulo.
- El maestro de conductores tiene fichas sin código, cédulas mal digitadas y un comodín `99999999` (depurados el 2026-09-10 en el módulo Riesgo, `src/lib/riesgo/datos.ts`): la resolución de persona del expediente debe reutilizar esos criterios, no confiar en la cédula sola.

---

## 4. Base de evidencia Excel que gobierna el motor (OBSERVADO)

Solo los 79 registros completos (anexo A) y sus 1.027 fórmulas. 14 patrones: 13 reglas más la variante `Q70 = ROUND(…,0)`. Todo lo demás del libro (584 filas con identificación pero fórmulas incompletas, 34 filas de plantilla, valores manuales, tabla dinámica, totales `SUBTOTAL(9,…703)`) es inventario o estructura auxiliar, **no** evidencia de reglas. **Con el corte, el libro es solo evidencia de reglas: ninguna de sus filas entra a GESTIVO.**

| Columna | Fórmula literal (fila genérica) | Lectura |
|---|---|---|
| I | `IF(G>0, H−G+1, 0)` | Días de incapacidad, inclusivos |
| N | `IF(L="INICIAL", IF(J="ARL SURA", IF(I<=1,0,I−1), IF(I<=2,0,I−2)), I)` | Días a cargo de la entidad; regla **por nombre literal** de una entidad; prórroga o modalidad vacía = todos |
| M | `I − N` | Días empresa |
| O | `(F/30)·I·IF(OR(K="AT",K="EG"),1,0.67)` | Valor incapacidad completa; factor 1 para AT/EG, **0.67** (no 2/3) para el resto y para K vacío |
| Q | `(F/30)·N·factor` (Q70: `ROUND(…,0)`) | Valor reconocido por la entidad (calculado) |
| P | `O − Q` | Valor empresa (calculado, no desembolso) |
| T | `IF(R="SI", Q, 0)` | Valor cobrado: todo o nada, sin monto propio |
| U | `Q − T` | Valor no cobrado |
| S | `IF(X>1,"SI",IF(B>0,"NO",""))` | PAGADA legado: cualquier pago > 1 marca SI |
| V | `IF(S="NO", Q, 0)` | Pendiente legado: **no resta X**; oculta pagos parciales |
| W | `IF(V>0,1,0)` | Contador |
| Y | `X−T = 0 → LO DEBIDO; > 0 → A FAVOR; < 0 → NO PAGADO` | Indicador contra **T**, no contra Q, sin tolerancia |
| C | `IFERROR(VLOOKUP(B, Personal!A:B, 2, 0), " ")` | Nombre por cédula; fallo devuelve un espacio |

Validaciones del libro (anexo D), todas con vacíos permitidos: L ∈ {INICIAL, PRORROGA}; R ∈ {SI, NO}; J ∈ `Lista_Entidades` (15 nombres, anexo E); K ∈ {EG, EP, AT, LM, LP}; fechas entre 1991-01-01 y 2999-12-31 (aplicada también a I por error de cobertura). No hay validación para S, E, X ni Z.

Lo que importa de este motor para el arranque: **N y Q** (cuántos días y cuánto dinero reclamar a la entidad) y el **factor por tipo**. S/T/U/V/W/Y se implementan por compatibilidad y para explicar diferencias, pero ningún expediente del arranque los usará como estado.

---

## 5. Homologación verificada contra el esquema real de GESTIVO

Leyenda del estado: **HOMOLOGADO** = campo real de GESTIVO con semántica equivalente verificada; **PARCIAL** = existe pero requiere transformación o confirmación; **NO EXISTE** = se crea (PROPUESTO). Los nombres de GESTIVO son los reales de la tabla `ausentismo` salvo indicación. La homologación se acota a lo que **aparece desde el corte** y a lo que puede aparecer en adelante.

### 5.1 Campos de identificación, fechas y clasificación (etapa 1: llegan de la matriz)

| Excel | GESTIVO real | Estado | Notas |
|---|---|---|---|
| B `CÉDULA` | `ausentismo.cedula` (TEXT, solo dígitos; el formulario exige que exista en `conductores` o `employees.document_number`) | **HOMOLOGADO** | Conservar como texto. La resolución de persona ya la hace el formulario al registrar; el expediente hereda `cedula` y `nombre`. |
| C `NOMBRES Y APELLIDOS` | `ausentismo.nombre` (snapshot al registrar) | **HOMOLOGADO** | El VLOOKUP se reemplaza por el snapshot + referencia al maestro; error visible, no un espacio. |
| D `PROCESO` | `ausentismo.cargo`, `tipo_conductor`, `area`, `departamento`, `centro_trabajo`; `employees.position` | **PARCIAL** | **POR CONFIRMAR 12.6** cuál homologa. Propuesta provisional: `cargo` + `tipo_conductor`. |
| E `SMLV` | ninguno | **NO EXISTE** | No interviene en ninguna fórmula. Campo informativo opcional; **no** se calcula desde salario. |
| F `SALARIO BASICO` | `employees.salary` + `salary_currency`; **no existe en `conductores`** | **PARCIAL** | Salario **actual**, no el vigente al inicio. Snapshot en el expediente con vigencia y fuente; conductores sin salario quedan pendientes para RRHH. **POR CONFIRMAR 12.4.** Con el corte, la vigencia que hay que cubrir es reciente (septiembre 2026 en adelante), lo que reduce el riesgo de desfase. |
| G / H fechas | `fecha_inicio`, `fecha_fin` (DATE; trigger exige fin ≥ inicio) | **HOMOLOGADO** | `fecha_inicio` es además **la llave del corte**. |
| I `DÍAS DE INC` | `dias_it_pagados` (INTEGER; trigger = fin − inicio + 1) | **HOMOLOGADO** (misma fórmula) | Etiquetar "Días de incapacidad" en todo el módulo. |
| J `ENTIDAD` | `eps` (pagador; contiene la ARL cuando origen es AT/EL) y `arl`; validados contra `ausentismo_catalogos` | **PARCIAL** | Los cinco pagadores del arranque ya existen en el catálogo (5.3). Falta clase/NIT/vigencia. |
| K `TIPO DE INCAPA.` (EG, EP, AT, LM, LP) | `origen` (AT, EG, **EL**, LM, LP) | **PARCIAL** | Desde el corte solo hay EG y AT: **ambos coinciden en ambos lados y llevan factor 1**, así que la duda EP↔EL (**POR CONFIRMAR 12.1**) no afecta al arranque; hay que resolverla antes de la primera EL/LM/LP. |
| L `INICIAL/PRORROGA` | `indicador_prorroga` | **HOMOLOGADO** | Desde el corte, las 23 son iniciales; la primera prórroga aparecerá pronto y el formulario ya la encadena a su inicial. |

### 5.2 Campos de gestión (etapa 2: no vienen de la matriz)

| Excel | GESTIVO real | Estado | Destino propuesto |
|---|---|---|---|
| R `COBRADA` | ninguno | **NO EXISTE** | Se **deriva** de la existencia de una radicación vigente. No se captura como booleano suelto. |
| X `VALOR PAGADO POR EPS` | ninguno | **NO EXISTE** | Se **deriva** de la suma de aplicaciones de recaudo. |
| Z `REVISADA CI` | `ausentismo.revision[]` es otra cosa | **NO EXISTE** | Revisión propia del expediente (estado, revisor, fecha, comentario). **Vocabulario POR CONFIRMAR 12.8.** |
| AA / AB / AC solicitud, radicación, código | ninguno | **NO EXISTE** | `incapacidad_radicaciones` (**cardinalidad POR CONFIRMAR 12.10**). |
| AD `observaciones` | ninguno en la matriz | **NO EXISTE** | Observaciones del expediente con historial. |
| AE `FECHA DE GIRO` | ninguno | **NO EXISTE** | `incapacidad_recaudos.fecha_giro`. |

### 5.3 Catálogo de entidades: lo que el corte deja dentro y fuera (OBSERVADO)

Pagadores presentes desde el corte y su estado en `ausentismo_catalogos`: **EPS SURA, SALUD TOTAL, NUEVA EPS, SANITAS, ARL BOLIVAR — los cinco existen y están activos.** No hace falta ninguna equivalencia con el libro para operar.

Del catálogo Excel (15 nombres), las entidades **sin equivalente en GESTIVO** (COOMEVA, MEDIMÁS, ARL EQUIDAD, AXA COLPATRIA, ADRES, ARL SURA) **dejan de importar**: eran históricas. Se conserva solo, como decisión de baja prioridad, si `SEGUROS BOLIVAR` (Excel) y `ARL BOLIVAR` (GESTIVO) son la misma entidad (12.14), porque afecta a cómo se etiqueta la ARL que sí opera hoy.

Lo que sigue faltando en el catálogo para radicar: **clase** (EPS / ARL / otra), **NIT** y **vigencia** (6.2). Con cinco entidades activas, completarlo es una tarea de minutos para RRHH.

### 5.4 Divergencia entre la regla de GESTIVO y la fórmula N (OBSERVADO en ambos lados)

`diasACargoPagador` en `src/lib/ausentismo/matriz-reglas.ts`: ARL (AT/EL) **todos** los días; EPS inicial días − 2; prórroga todos. Fórmula N del Excel: `J = "ARL SURA"` inicial días − 1; **cualquier otra entidad** (incluida una ARL distinta de SURA) inicial días − 2; prórroga todos.

Efecto en el arranque: las **2 incapacidades AT con ARL BOLIVAR** (1–3 días) tendrían todos sus días a cargo de la ARL con la regla de GESTIVO y **cero o uno** con la fórmula literal del Excel. **Resuelto 2026-09-11 (12.2): la ARL responde por todos los días.** La regla operativa es `gestivo-cobro-dias`; `excel-2024-v1` se conserva solo como versión de compatibilidad para las pruebas del motor y no se muestra en la liquidación. El importe reclamado sí se propone automáticamente. ARL SURA no tiene datos ni catálogo: la rama literal existe en el motor por fidelidad, pero no se dispara.

### 5.5 Reutilización directa (sin cambios)

`assertEdicion`/`getCurrentPermissions`/`canAccess`, `logTesoreriaAudit`, `ausentismo_log`, `PageHeader`, `BotonesExportar`, `descargarCsv`, `descargarPdfTabla`, patrón de PDF con gráficos, `createAdminClient`, `MATRIZ_SELECT`/`getMatriz`, `resumirCobro`/`contextoCobro`, `hoyBogota`, `limpio`, `dig`, paginación con `.range()` + `order("id")`, vista previa bajo `/docs`, receta de Playwright con Chrome instalado.

---

## 6. Modelo de datos propuesto (PROPUESTO salvo indicación)

Principio: **`ausentismo` sigue siendo la incapacidad y no se modifica su estructura.** Todo lo nuevo referencia `ausentismo.id`. Datos personales: RLS habilitada sin políticas, `REVOKE` a `anon`/`authenticated`/`public`, `GRANT ALL` a `service_role` (patrón de `riesgo_corridas`). Dinero en `NUMERIC(14,2)`; fechas de negocio `DATE`; eventos `TIMESTAMPTZ`; códigos y cédulas `TEXT`. Moneda: **POR CONFIRMAR 12.7** (el contexto indica COP; `employees.salary_currency` ya existe). **No hay tablas ni columnas de legado importado**: el corte las elimina.

### 6.1 `incapacidad_expedientes` — el expediente (1:1 con la incapacidad)

| Grupo | Columnas | Procedencia |
|---|---|---|
| Identidad | `id`, `ausentismo_id` (FK única, `ON DELETE RESTRICT`), `recibido_at`, `recibido_desde` (`matriz_formulario` / `matriz_excel` / `alta_manual`) | etapa 1, sistema. `alta_manual` cubre el caso de borde 12.16 (incapacidad anterior al corte que se decide gestionar) |
| Copia recibida (auditable, no editable) | `recibido_json` con los campos de la matriz al momento de recepción; `matriz_updated_at`; `matriz_cambio_pendiente` | etapa 1. Permite detectar cambios posteriores en la matriz sin sobrescribir la gestión |
| Persona homologada | `persona_fuente` (`conductores` / `employees` / `sin_resolver`), `persona_ref` | homologación, con incidencia si falla |
| Salario snapshot | `salario_base`, `salario_moneda`, `salario_vigencia_desde`, `salario_fuente` (`manual` por defecto / `employees` si el funcionario acepta la sugerencia), `salario_resuelto_por_email`, `salario_resuelto_at` | etapa 2, lo diligencia el funcionario de información complementaria (Resuelto 2026-09-11, 12.4); **nunca** se toma automáticamente el actual |
| Homologaciones | `tipo_homologado` (código ORIGEN), `entidad_catalogo_id` (FK a `ausentismo_catalogos`), `entidad_nombre_recibido`, `pendiente_homologacion` | etapa 1 cuando es inequívoca; **ajustables** por RRHH en etapa 2 (12.18) |
| Ajustes de liquidación (12.18) | Nivel 1, datos de entrada: `salario_*` (arriba), `entidad_catalogo_id`, `tipo_homologado`, `modalidad_ajustada`. Nivel 2, sobrescrituras: `dias_entidad_ajustados`, `valor_reclamado_ajustado`. Cada ajuste queda en la tabla **`incapacidad_ajustes_liquidacion`**: `expediente_id`, `campo`, `valor_anterior`, `valor_nuevo`, `motivo`, `ajustado_por_email`, `created_at`, `liquidacion_id` resultante; el histórico de cálculos en `incapacidad_liquidaciones` (una fila por recálculo, con `entradas`, `sobrescrituras` y `es_vigente`) | etapa 2, RRHH, con motivo obligatorio. Los valores recibidos de la matriz se conservan en `recibido_json`: el ajuste nunca los pisa. Sirve para el conteo por campo y entidad al cierre del piloto |
| Gestión | `responsable_email`, `estado` (catálogo **POR CONFIRMAR 12.13**; borrador mínimo: `recibido`, `en_completar`, `liquidado`, `radicado`, `con_recaudo`, `conciliado`, `cerrado`, `excepcion`), `valor_reclamado`, `proxima_accion`, `proxima_accion_fecha`, `observaciones` | etapa 2, por responsable |
| Revisión CI (Z) | `revision_estado`, `revision_por_email`, `revision_at`, `revision_comentario` | etapa 2; vocabulario POR CONFIRMAR 12.8 |
| Marca SMLV (E) | `marca_smlv` (booleano nullable, informativo) | etapa 2, opcional |
| Concurrencia y rastro | `version` (entero, optimista), `created_at`, `updated_at`, `eliminado_at`/`_por_email`/`motivo` | sistema |

**Saldo operativo** no se almacena como columna editable: se **calcula** (vista o función) como `valor_reclamado − Σ aplicaciones − Σ ajustes_que_extinguen`, y su **base exigible** es **POR CONFIRMAR 12.5**. Hasta esa decisión la vista expone los tres números por separado.

### 6.2 Catálogo de entidades pagadoras — extender `ausentismo_catalogos`

Columnas nuevas, aplicables a tipos EPS/ARL: `clase` (`EPS` / `ARL` / `OTRA`), `nit`, `vigente_desde`, `vigente_hasta` y **`dias_min_cobro`** (Resuelto 2026-09-11, 12.17: umbral de días cobrables **por entidad**; semilla 4 para EPS y 1 para ARL; editable en Parámetros, auditado). Se completan para las entidades activas (nueve EPS y una ARL hoy). El formulario de la matriz no cambia.

### 6.3 `incapacidad_reglas` y parámetros — versiones del motor y corte

`codigo` (`excel-2024-v1`, `excel-2024-v1-round0`, `gestivo-cobro-dias`, futuras), `vigente_desde`, `vigente_hasta`, `parametros` (jsonb: divisor 30, factores por tipo, días empleador por clase/entidad, política de redondeo; el umbral de días cobrables **ya no va aquí**: vive por entidad en el catálogo, 6.2), `aprobado_por_email`, `aprobado_at`, `descripcion`. Regla operativa semilla: `gestivo-cobro-dias` (Resuelto 2026-09-11, 12.2). Inmutables una vez usadas. Parámetro global **`fecha_corte_gestion = 2026-09-01`** (editable solo por admin, auditado; moverlo hacia atrás **no** crea expedientes retroactivos sin una acción explícita).

### 6.4 `incapacidad_liquidaciones` — cálculo explicado

`expediente_id`, `regla_id`, `entradas` (jsonb: F, G, H, I, J, K, L tal como se usaron), `dias_incapacidad`, `dias_entidad`, `dias_empresa`, `valor_total` (O), `valor_entidad` (Q), `valor_empresa` (P), `factor`, `redondeo`, `calculado_at`, `calculado_por_email`, `es_vigente`. Varias por expediente. **P y M se guardan como distribución histórica, no desembolso.**

### 6.5 `incapacidad_radicaciones` — solicitud y radicación (RRHH)

`expediente_id`, `entidad_catalogo_id`, `fecha_solicitud`, `fecha_radicacion`, `codigo_radicacion`, `valor_reclamado`, `estado` (`solicitada` / `radicada` / `devuelta` / `anulada`; POR CONFIRMAR), `motivo_devolucion`, `registrada_por_email`, `created_at`, anulación con motivo. Índice único parcial `(entidad, codigo_radicacion)` vigente contra duplicado de radicado.

### 6.6 `incapacidad_recaudos` y `incapacidad_recaudo_aplicaciones` (Contabilidad)

Recaudo: `entidad_catalogo_id`, `fecha_giro`, `valor`, `referencia`, `medio`, `registrado_por_email`, adjunto, anulación con motivo. Aplicaciones: `recaudo_id`, `expediente_id`, `valor_aplicado`, `aplicado_por_email`, `created_at`. Trigger: Σ aplicaciones ≤ valor del recaudo. Un recaudo sin aplicar queda visible. **Cardinalidad POR CONFIRMAR 12.10.**

### 6.7 `incapacidad_ajustes`

`expediente_id`, `tipo` (POR CONFIRMAR 12.6), `valor` con signo explícito, `extingue_saldo`, `motivo`, `autorizado_por_email`, `created_at`. Nunca se edita: se contra-ajusta.

### 6.8 `incapacidad_adjuntos`

`expediente_id`, `relacionado_tipo`, `relacionado_id`, `archivo_ruta`, `archivo_nombre`, `archivo_mime`, `archivo_tamano`, `subido_por_email`, `created_at`. Bucket privado `incapacidades`, URL firmada desde el servidor.

### 6.9 Bitácora

`ausentismo_log` (registro_id = `expediente_id`, acciones `expediente_…`) para antes/después; `tesoreria_audit_log` con `modulo = 'incapacidades'`. Acciones nuevas en `AccionAudit`: `expediente_creado`, `expediente_alta_manual`, `expediente_completado`, `liquidacion_calculada`, `radicacion_registrada`, `radicacion_anulada`, `recaudo_registrado`, `recaudo_aplicado`, `ajuste_registrado`, `expediente_cerrado`, `expediente_consultado`, `corte_modificado`, `exportacion` (ya existe).

### 6.10 Vista de lectura

`vw_incapacidad_expedientes`: `ausentismo` vigentes con `fecha_inicio >= corte` **o** con expediente de alta manual + expediente + liquidación vigente + agregados → `valor_reclamado`, `abonos_aplicados`, `ajustes`, `saldo_operativo` (componentes hasta 12.5), `estado`, `proxima_accion`, `dias_a_cargo_gestivo`, `dias_a_cargo_excel` (mientras 12.2 siga abierta). `GRANT SELECT` solo a `service_role`.

---

## 7. Captura en dos etapas — contrato operativo

### 7.1 El corte (PROPUESTO, casos de borde POR CONFIRMAR 12.16)

Regla base: **entra en gestión toda incapacidad vigente de la matriz con `fecha_inicio >= 2026-09-01`.** Por fecha de inicio, no por fecha de registro (las 626 históricas se cargaron el 2026-09-02). Medido: 23 hoy.

Casos de borde medidos en la base, que el plan no decide:

| Caso | Qué hay | Opciones |
|---|---|---|
| Incapacidades que **inician antes y terminan después** del corte | 4: una inicial de 180 días (2026-04-21 → 2026-10-17, EG, EPS SURA) y tres prórrogas de agosto que terminan en septiembre (SANITAS, ARL BOLIVAR, NUEVA EPS) | **Resuelto 2026-09-11 (12.16):** las largas que cruzan el corte son por lo general licencias de maternidad. Entran por **alta manual** con motivo cuando RRHH esté gestionando su cobro; las prórrogas cortas quedan fuera. La LM se parametriza como tipo propio (regla y umbral 0) |
| **Prórroga desde el corte de una inicial anterior** | 0 hoy; aparecerán | (a) expediente solo de la prórroga, con nota "inicial fuera de gestión"; (b) alta manual de la inicial. Recomendación: (a), porque la fórmula N de una prórroga no depende de la inicial |
| **Registro tardío**: incapacidad registrada después del corte con inicio anterior | indistinguible hoy de la carga histórica; ocurrirá | fuera por regla; alta manual si RRHH lo justifica |
| Corte editado hacia atrás | — | no crea expedientes retroactivos; requiere acción explícita "incorporar rango" auditada |

### 7.2 Etapa 1: recepción desde la matriz (automática, sin gestión)

**Disparador (Resuelto 2026-09-11, 12.11: trigger):** trigger `AFTER INSERT` sobre `ausentismo` que crea el expediente **solo si `fecha_inicio >= fecha_corte_gestion`** y la fila no está eliminada, más un **backfill único de las 23 filas actuales**. La carga por Excel de la matriz ya está deshabilitada (2026-09-10) y las altas llegan por formulario o API. La información que RRHH diligencia en la matriz EPS es el **insumo** de esta segunda parte: nada de lo que ya está allí se vuelve a pedir en el expediente.

**Qué se guarda:** solo lo que la matriz tiene: cédula, nombre, cargo/tipo, fechas, días, origen, inicial/prórroga, pagador (texto), diagnóstico, y la copia `recibido_json`. Homologaciones automáticas **solo cuando son inequívocas** (tipo por código exacto; entidad por nombre exacto del catálogo activo); si no, `pendiente_homologacion`.

**Qué NO se exige ni se inventa:** salario, responsable, estado de negocio, valor reclamado, radicación, recaudo, revisión, observaciones. Ningún cero, ningún "NO", ninguna fecha por defecto. Estado inicial `recibido` (de interfaz).

**Cambios posteriores en la matriz:** `AFTER UPDATE` marca `matriz_cambio_pendiente` con el diff en la bitácora; **no** recalcula ni toca radicaciones ni recaudos. Precedencia campo a campo **POR CONFIRMAR 12.12**. La eliminación lógica de la incapacidad deja el expediente en `excepcion` con motivo.

**Alta manual (caso de borde):** acción de RRHH sobre una incapacidad anterior al corte, con motivo obligatorio, auditada; crea el expediente con `recibido_desde = alta_manual`.

### 7.3 Etapa 2: completar y gestionar (por responsable y por operación)

| Operación | Quién (1.1) | Habilita cuando existen | Qué produce |
|---|---|---|---|
| Completar datos del expediente | RRHH | siempre | responsable, salario snapshot con vigencia, homologaciones resueltas, observaciones, próxima acción |
| **Ajustar datos de liquidación** (12.18) | RRHH | expediente no cerrado | cambio de salario, entidad, tipo, modalidad, días a cargo o valor reclamado, con motivo; deja la liquidación anterior como historial y crea una nueva. No toca la matriz ni las radicaciones ya hechas (12.12) |
| Liquidar / recalcular | RRHH | persona resuelta, salario, fechas, entidad y tipo homologados, modalidad | liquidación explicada con versión; `valor_reclamado` **propuesto** (no aplicado); recalcular tras un ajuste conserva las liquidaciones anteriores |
| Solicitar / radicar | RRHH | liquidación vigente o valor reclamado manual con motivo; **y umbral de días cobrables cumplido o excepción** (12.17) | radicación con código, fechas, monto, soporte |
| Registrar recaudo | Contabilidad | entidad | recaudo con giro, referencia, soporte |
| Aplicar recaudo | Contabilidad | recaudo con saldo sin aplicar y expediente radicado | aplicación; recalcula saldo |
| Ajustar | Contabilidad (autorización POR CONFIRMAR 12.6) | motivo | ajuste con signo |
| Conciliar / cerrar | Contabilidad (autorización POR CONFIRMAR) | saldo cero **o** excepción aprobada | estado con responsable, fecha, motivo |
| Revisar CI (Z) | POR CONFIRMAR 12.8 | — | revisión con estado y comentario |
| Consultar | Revisoría Fiscal | — | solo lectura + auditoría de consulta |

---

## 8. Arquitectura (PROPUESTO)

### 8.1 Módulo propio con submódulos por responsabilidad

Módulo `incapacidades` (clave en `ALL_MODULES`, etiqueta "Recuperación de incapacidades", home `/incapacidades`, hoja en el grupo *Recursos Humanos* del `NAV_TREE`, icono no repetido). Módulo propio y no pestaña de `ausentismo` porque las tres responsabilidades de 1.1 exigen permisos distintos dentro de la misma pantalla, y `MODULE_SUBS` (hoy solo `tesoreria`) es el mecanismo que GESTIVO ya tiene para eso.

Submódulos: `expedientes`, `radicacion`, `recaudos`, `conciliacion`, `consulta` y `parametros` (reglas, corte, catálogo; admin). **Resuelto 2026-09-11 (12.9):** todos menos `parametros` los opera `rrhh`; los submódulos son organización de pantallas y quedan listos para asignarse a otro tipo de usuario desde Configuración si Contabilidad o Revisoría entran después. Solo `parametros` en `SUBS_SENSIBLES`. **No hay submódulo de importación.**

### 8.2 Carpetas y piezas

- `src/lib/incapacidades/motor.ts` — funciones puras: `diasIncapacidad`, `diasEntidad(regla)`, `factor(regla)`, `valores`, `indicadoresLegado`. Sin acceso a datos; compartido por pantalla, exportación y pruebas.
- `src/lib/incapacidades/reglas.ts` — versiones desde `incapacidad_reglas`; semilla `excel-2024-v1`; lectura del corte.
- `src/lib/incapacidades/expedientes.ts` — lectura paginada, filtros, vista; aplica el corte en la consulta.
- `src/lib/incapacidades/saldo.ts` — saldo operativo con la base confirmada; hasta entonces componentes.
- `src/lib/incapacidades/homologacion.ts` — tipo y entidad por catálogo activo; persona reutilizando `esComodin` y ficha sin código de `src/lib/riesgo/datos.ts`.
- `src/lib/incapacidades/exportar.ts` — CSV/Excel/PDF con `BotonesExportar`; PDF con el patrón de `riesgo-pdf.ts`.
- `src/lib/incapacidades/auditoria.ts` — envoltorio de `logTesoreriaAudit` con `modulo: "incapacidades"` y deduplicación de consultas.
- `src/app/(dashboard)/incapacidades/` — `page.tsx` (bandeja), `[id]/page.tsx` (expediente), `radicacion/`, `recaudos/`, `conciliacion/`, `consulta/`, `parametros/`, con `actions.ts` por operación y guard `canAccess` + `canAccessSub`.
- Triggers: creación con corte, integridad de aplicaciones, `updated_at`/`version`.

### 8.3 Reglas transversales

Acciones con `assertEdicion` propio por submódulo, validación por campo, `revalidatePath`, auditoría antes/después, conflicto por `version`. Lecturas paginadas. Exportaciones con contexto, aviso y auditoría. Fechas sin hora; `hoyBogota()`. Ningún cálculo en cliente decide un estado.

---

## 9. Permisos (Resuelto 2026-09-11, 12.9: el módulo se despliega desde RRHH)

| Tipo de usuario real | Submódulos | Puede |
|---|---|---|
| `rrhh` (existe; ya tiene `ausentismo`) | `expedientes`, `radicacion`, `recaudos`, `conciliacion`, `consulta` | completar, liquidar, radicar, alta manual con motivo, observar, adjuntar, registrar/aplicar/anular recaudos, ajustar y cerrar (autorización y tolerancia según 12.6), consultar y exportar (auditado) |
| `admin` | todos | además `parametros`: reglas, corte, catálogo y umbral por entidad |
| Contabilidad / Revisoría Fiscal | ninguno hoy | **no se crean tipos de usuario.** Si más adelante entran, se les asigna el módulo o submódulos desde Configuración; `consulta` ya nace de solo lectura por construcción para ese caso |

`proxy.ts` no cambia. Cada página y acción vuelven a comprobar. La revisión CI (Z) **no** se homologa a Revisoría. Toda consulta deja rastro deduplicado. Nada por defecto para `consulta` ni `operaciones` (tipos de usuario existentes).

---

## 10. Pantallas (PROPUESTO)

1. **Bandeja** (`/incapacidades`): expedientes desde el corte, por estado, con cuatro colores de procedencia por campo (recibido, homologado, calculado, completado); pendientes de homologación y de salario destacados; **aviso fijo**: "Gestión desde el 2026-09-01; las incapacidades anteriores están en la matriz" con enlace a `/ausentismo?tab=matriz`.
2. **Listado con filtros:** rango, entidad, tipo, modalidad, estado, responsable, con/sin radicación, con/sin recaudo, saldo > 0, cobrable/no cobrable según umbral. Totales iguales al filtro. Exportación.
3. **Expediente** (`/incapacidades/[id]`): incapacidad de la matriz (solo lectura, enlace), datos recibidos · homologaciones · salario snapshot · **liquidación explicada** (entradas, versión, días, valores, fórmula literal; con las dos reglas mientras 12.2 siga abierta) · radicaciones · recaudos aplicados · ajustes · **saldo operativo con sus componentes** · revisión CI · observaciones · adjuntos · historial. Botones según submódulo. **Sin bloque de legado**: no hay filas importadas.
4. **Bandeja de cobro / radicación** (RRHH): cobrables sin radicar, radicadas, devueltas, con incidencias, y **no cobrables por umbral** en pestaña aparte; por entidad; arranca de `resumirCobro` y añade importes y estado.
5. **Recaudos** (Contabilidad): registrar giro, ver sin aplicar, aplicar a uno o varios, anular con motivo.
6. **Conciliación** (Contabilidad): parcial, completo, diferencia, sobrepago, cierre documentado; tolerancia POR CONFIRMAR 12.6.
7. **Consulta de Revisoría:** expediente en solo lectura + descargas.
8. **Tablero:** desde el corte, por entidad y estado: reclamado, radicado, recaudado, saldo, diferencia; **sin comparación con periodos anteriores al corte** (no existen en el módulo).
9. **Parámetros:** versiones de regla, corte de gestión, catálogo extendido.

Cada pantalla se verifica antes de desplegar con la vista previa temporal bajo `/docs` y Playwright, a 1440 y ~800 px.

---

## 11. Fases

Cada fase termina con: migración creada con `npm run migracion:nueva`, aplicada **a mano** en el SQL Editor por el usuario, `tsc`/`eslint` limpios, verificación descrita, documentación en `docs/` y commit (fuera de este plan).

| Fase | Contenido | Decisiones necesarias antes | Verificación de salida |
|---|---|---|---|
| **0. Decisión y homologación** (sin código) | **RESUELTA 2026-09-11** para 12.2, 12.4, 12.9, 12.11, 12.16 y 12.17 (acta en la sección 0). Pendiente sin bloquear: RRHH completa clase/NIT/vigencia y `dias_min_cobro` de las 10 entidades activas cuando exista la pantalla de Parámetros (fase 2). | — | Acta con las respuestas ✔; catálogo completo para las entidades activas |
| **1. Motor de compatibilidad** — **EN MAIN 2026-09-11** (`src/lib/incapacidades/`, `npm run test:incapacidades`, detalle en `docs/incapacidades-motor.md`) | `motor.ts` con los 14 patrones y la regla operativa `gestivo-cobro-dias`; fixtures sintéticos con las 79 filas del anexo A y los 14 casos de 13.2 que competen al motor; sin base de datos | ninguna | ✔ 1.027 aserciones verdes, 0 diferencias; Q70 y Q sin redondeo cubiertos; tolerancia técnica 1e-6 solo en importes |
| **2. Esquema, corte y etapa 1** — **EN MAIN 2026-09-11, migración `20260911201033` PENDIENTE DE APLICAR** (guía en `docs/incapacidades-fase-2.md`) | Migración: expediente, reglas + parámetro de corte, extensión del catálogo con `dias_min_cobro`, ajustes de liquidación, adjuntos, bucket, bitácora, vista; trigger de creación con corte + backfill de las **23** filas; módulo asignado a `rrhh` y `admin`; bandeja y expediente en solo lectura; alta manual; pantalla de Parámetros | 12.13 (borrador mínimo de estados si sigue abierta) | **Exactamente 23 expedientes** creados sin ningún campo de gestión; ninguna de las 626 anteriores tiene expediente; los cinco pagadores homologados sin pendientes; `anon`/`authenticated` reciben `permission denied`; una consulta deja rastro |
| **3. Etapa 2 RRHH: completar y liquidar** — **EN MAIN 2026-09-11**, sin migración nueva (detalle en `docs/incapacidades-fase-3.md`) | Salario diligenciado por el funcionario (sugerencia de `employees` visible), homologaciones, ajustes de nivel 1 y 2 con motivo (12.18), liquidación explicada con la regla operativa leída de la base, recálculo automático tras cada ajuste, concurrencia por `version` | 12.7 (redondeo y moneda) | Liquidar sin salario devuelve error por campo; con datos completos reproduce el caso 13.2 elegido; recalcular deja historial |
| **4. Radicación y umbral** — **EN MAIN 2026-09-11, migración `20260911205408` PENDIENTE DE APLICAR** (detalle en `docs/incapacidades-fase-4.md`) | Radicaciones (solicitada / radicada / devuelta / anulada) con código único por entidad; bandeja de cobro con seis pestañas e importes por entidad; "cobrada" derivada de la radicación; excepción escrita para radicar bajo el umbral **de cada entidad**; el informe de cobro de la matriz lee `dias_min_cobro`. 12.10 asumida: una radicación activa por expediente a la vez; los soportes adjuntos quedan para la fase 6 | 12.10 (confirmar el supuesto) | Duplicado de código rechazado; anulación conserva evidencia; el informe de cobro actual sigue funcionando con los mismos totales mientras las semillas sean 4/1 |
| **5. Recaudos, aplicaciones y conciliación** — **EN MAIN 2026-09-11, migración `20260911211305` PENDIENTE DE APLICAR** (detalle en `docs/incapacidades-fase-5.md`) | Recaudos (giros) y aplicaciones con Σ ≤ giro en la base; ajustes monetarios tipificados con signo; saldo operativo con sus tres componentes; conciliación con tolerancia parametrizada (semilla 0); cierre con excepción escrita si hay saldo; reapertura; todo operado por `rrhh`. 12.5 asumida (base = valor reclamado) y 12.6 asumida (tolerancia 0, tipos de ajuste, autorización RRHH) | 12.5 y 12.6 (confirmar los supuestos) | Abono parcial **no** cierra; Σ aplicaciones ≤ recaudo; sobrepago visible |
| **6. Consulta, tablero, exportaciones** — **EN MAIN 2026-09-11**, sin migración nueva (detalle en `docs/incapacidades-fase-6.md`) | Pantalla de consulta de solo lectura (para cuando se asigne `incap_consulta` a Revisoría); tablero desde el corte por entidad y estado con embudo reclamado → radicado → recaudado; exportación CSV/Excel/PDF auditada de bandeja, bandeja de cobro, conciliación y tablero; soportes al bucket privado `incapacidades` por ruta API con enlace firmado y anulación con motivo | — | `consulta` no puede invocar ninguna acción de escritura; tablero y listado coinciden para el mismo filtro |
| **7. Endurecimiento** — **EN MAIN 2026-09-11, migración `20260911215045` aplicada el 2026-09-11** (detalle en `docs/incapacidades-fase-7.md`) | Paginación con `range()` en todas las lecturas; siete índices para la bandeja, el corte, la ficha y la auditoría; parámetro de retención de soportes (1825 días) con vista de depurables, sin borrado automático; script `npm run incapacidades:rendimiento`; diccionario de datos regenerado | — | Corrida 2026-09-11: agregaciones de una carga 20,5 ms con 5.000 sintéticos en memoria (no se insertan: la base es producción); vista real 976 ms con 26 filas; ninguna lista a 1.000 |

Orden de despliegue a usuarios: 2 → 3 → 4 → 5 → 6 (todo lo opera RRHH) → 7. **No hay fase de importación histórica.**

---

## 12. Decisiones pendientes (POR CONFIRMAR) — el plan no las toma

Las marcadas **RESUELTA** tienen su respuesta en la sección 0.

| # | Decisión | Evidencia | Prioridad con el corte | Quién |
|---|---|---|---|---|
| 12.1 | ¿`EP` del Excel ≡ `EL` de GESTIVO? ¿Factor para EL/LM/LP? La LM importa más desde 12.16 | Desde el corte solo hay EG y AT (factor 1 en ambos lados) | media: antes de la primera EL/LM/LP | RRHH + Salud Ocupacional |
| 12.2 | Días a cargo de la ARL | 5.4; 2 casos AT en el arranque | **RESUELTA 2026-09-11:** todos los días | — |
| 12.3 | Episodio y prórroga: ¿se persiste el vínculo? | El formulario ya encadena | media | RRHH |
| 12.4 | Fuente y vigencia del salario | `conductores` sin salario | **RESUELTA 2026-09-11:** lo diligencia el funcionario en etapa 2 | — |
| 12.5 | Base del saldo exigible | 1.1 y 4.5 de la especificación | alta (fase 5) | Contabilidad |
| 12.6 | Tolerancia, tipos de ajuste, autorización de ajustes y cierre, sobrepago | Y sin tolerancia | alta (fase 5) | Contabilidad + Revisoría |
| 12.7 | Redondeo (Q70 vs resto), moneda | Anexo B | media | Contabilidad |
| 12.8 | Revisión CI (Z): estados, responsable | Sin regla en el libro | baja | Control Interno |
| 12.9 | Tipos de usuario para Contabilidad y Revisoría | No existen | **RESUELTA 2026-09-11:** no; el módulo se despliega desde RRHH | — |
| 12.10 | Cardinalidad recaudo↔incapacidad y radicaciones↔incapacidad | Especificación 14.3.10 | alta (fase 4/5) | RRHH |
| 12.11 | Disparador de la etapa 1 | 7.2 | **RESUELTA 2026-09-11:** trigger; la matriz EPS es el insumo | — |
| 12.12 | Precedencia si la matriz cambia después de radicar/recaudar | 2A.3 | media | RRHH + Contabilidad |
| 12.13 | Catálogo de estados, transiciones, plazos de próxima acción | 1.1 | alta (fase 2) | RRHH + Contabilidad |
| 12.14 | ¿`SEGUROS BOLIVAR` (Excel) ≡ `ARL BOLIVAR` (GESTIVO)? | Solo afecta a la etiqueta de la ARL activa | baja | RRHH |
| 12.15 | Vínculo externo `BD_Consol` | Solo histórico | **fuera del alcance** por el corte | — |
| 12.16 | Casos de borde del corte | 7.1 | **RESUELTA 2026-09-11:** las largas que cruzan son licencias de maternidad; alta manual con motivo si están en cobro | — |
| 12.17 | Umbral de días cobrables | `COBRO_EPS_DIAS_MIN = 4`; distribución medida | **RESUELTA 2026-09-11:** parámetro por entidad en el catálogo (`dias_min_cobro`) | — |

---

## 13. Pruebas

| Tipo | Qué | Cómo |
|---|---|---|
| Unitarias del motor | 14 patrones × 79 filas = 1.027 aserciones; 17 casos sintéticos de 13.2; límites: modalidad vacía, tipo vacío, X = 1 vs 1,01, X = T − 0,01, I = 0 | fixtures derivados del anexo A/I; tolerancia técnica 1e-6 en importes; Y exacto |
| Unitarias de saldo | reclamado − aplicaciones − ajustes con signos; sobrepago; ajuste que no extingue | casos por base exigible una vez confirmada |
| **Corte** | insertar incapacidad con inicio 2026-08-31 → sin expediente; con 2026-09-01 → expediente; editar el corte hacia atrás → no crea retroactivos; alta manual crea con motivo y rastro; backfill = 23 exactos | contra la base con `service_role`, filas de prueba borradas al final |
| Integración etapa 1 | alta por formulario crea expediente **sin** gestión; eliminación lógica deja `excepcion`; editar fechas marca cambio pendiente sin tocar radicaciones | idem |
| Integración etapa 2 | liquidar sin salario falla por campo; radicar bajo umbral exige excepción; radicado duplicado falla; aplicar más que el recaudo falla; abono parcial no cierra | acciones de servidor con sesión por tipo de usuario |
| Permisos | por cada acción de escritura: solo `rrhh` y `admin` la invocan; `consulta`/`operaciones`/`tesoreria` no entran; un tipo con solo el submódulo `consulta` no escribe; `parametros` solo `admin`; `proxy.ts` redirige | pruebas negativas, una por acción |
| Auditoría | cada operación deja fila con módulo `incapacidades`; consulta deduplicada; cambio de corte auditado | conteo antes/después |
| Concurrencia | dos ediciones con la misma `version` → segunda rechazada | dos clientes |
| UI | bandeja (con aviso del corte), expediente, cobro con pestaña de no cobrables, conciliación; 1440 y 800 px; tablero = listado | vista previa `/docs` + Playwright |
| Rendimiento | 5.000 expedientes sintéticos; nada devuelve exactamente 1.000 sin paginar | script de carga en entorno de prueba |
| Exportación | CSV/Excel/PDF con corte, filtros y aviso; PDF renderizado (pdf.js en Playwright) | como en Riesgo |

---

## 14. Criterios de aceptación

1. Ninguna pantalla, acción, exportación ni cálculo produce, sugiere o registra un desembolso al trabajador. `P`/`M` solo como "distribución histórica".
2. **Solo las incapacidades con `fecha_inicio >= 2026-09-01` tienen expediente automático**; hoy exactamente 23; las 626 anteriores no aparecen en el módulo y la bandeja lo dice con enlace a la matriz.
3. Una incapacidad nueva en la matriz aparece como expediente `recibido` **sin** salario, responsable, estado de negocio, radicación, recaudo, revisión ni observaciones, y sin ceros ni "NO".
4. Una incapacidad anterior al corte solo entra por **alta manual con motivo**, auditada.
5. `rrhh` puede completar, liquidar, radicar, registrar y aplicar recaudos, ajustar y conciliar; ningún otro tipo de usuario existente entra al módulo salvo `admin`.
6. Un abono parcial no cierra el expediente.
7. El submódulo `consulta` es de solo lectura por construcción: ninguna acción de escritura acepta su permiso; la consulta queda auditada. Está listo para asignarse a Revisoría sin migración.
8. El expediente muestra responsable, estado, valor reclamado, abonos, saldo y próxima acción, **o** "pendiente"; nunca un valor inventado.
9. Toda liquidación cita versión de regla, entradas y fórmula; cambiar la regla no altera liquidaciones anteriores.
10. Las 1.027 fórmulas de las 79 filas se reproducen con 0 diferencias en `excel-2024-v1`.
11. La liquidación aplica `gestivo-cobro-dias` (ARL todos los días) y lo dice; `excel-2024-v1` solo existe en las pruebas del motor.
12. Una incapacidad con menos días que el `dias_min_cobro` de su entidad no se radica sin excepción registrada.
13. Un cambio en la matriz posterior a una radicación no borra ni modifica radicaciones ni recaudos.
14. Listado y tablero coinciden para el mismo filtro y corte.
15. Tablas nuevas inaccesibles para `anon` y `authenticated`.
16. Toda decisión de 12 que siga abierta está visible como "por confirmar", no resuelta por defecto.

---

## 15. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Arranque casi vacío de cobrables**: las 23 duran 1–3 días | Piloto sin casos reales de radicación durante semanas | Decidir 12.17 en fase 0; preparar el piloto con la incapacidad de 180 días si entra por alta manual; medir volumen mensual antes de dimensionar |
| Aplicar el corte por fecha de registro | 626 históricas entrarían (todas registradas el 2026-09-02) | Corte por `fecha_inicio`; prueba explícita |
| Perder el cobro en curso de la incapacidad de 180 días | Recaudo real sin expediente | Alta manual documentada (12.16) |
| Presión posterior por "meter el histórico" | Reabrir importación del libro con datos personales y reglas mezcladas | El corte es parámetro auditado; incorporar rango requiere acción explícita; el libro queda como evidencia, no como fuente |
| Elegir regla ARL o salario actual sin decisión | Reclamar mal a ARL BOLIVAR; liquidar con salario equivocado | Ambas versiones visibles; snapshot con vigencia obligatoria |
| Confundir `PAGADA`/`V`/`Y` con estado y saldo | Cerrar con saldo | Sin filas de legado en producción; saldo calculado en servidor |
| Confundir `dias_it_pagados` con días pagados | Reportar dinero donde hay días | Etiqueta "Días de incapacidad" |
| Datos personales fuera del permiso | Fuga por PostgREST o descargas | RLS sin políticas; exportaciones y consultas auditadas |
| PostgREST corta a 1.000 | Bandejas incompletas en silencio | `.range()` + orden estable; prueba de 5.000 |
| Roles nuevos mal asignados | Contabilidad radica o RRHH recauda | Pruebas negativas por acción; submódulos sensibles nunca por defecto |

---

## 16. Glosario: legado Excel frente a operativo GESTIVO

| Concepto | Legado (Excel, solo en el motor de compatibilidad) | Operativo (GESTIVO) |
|---|---|---|
| Valor a recuperar | `Q` calculado | `valor_reclamado` del expediente (propuesto desde la liquidación, confirmado por RRHH) |
| Cobrado | `R = SI` → `T = Q` | Existe radicación vigente con monto y código |
| Pagado | `S = SI` si `X > 1` | Σ aplicaciones de recaudos > 0 |
| Pendiente | `V = Q` si `S = NO` | `saldo_operativo = base − aplicaciones − ajustes` (base POR CONFIRMAR) |
| Conciliación | `Y` por signo de `X − T`, sin tolerancia | Estado con tolerancia aprobada y motivo |
| Días entidad | `N` (regla literal ARL SURA) | Regla versionada; conviven `excel-2024-v1` y `gestivo-cobro-dias` |
| Días / valor empresa | `M`, `P` | Distribución histórica; fuera de alcance operativo |
| Cobrable | no existe | días ≥ umbral (12.17) o excepción registrada |

---

## 17. Inventario de reutilización (rutas reales, verificadas)

- Incapacidad y formulario: `supabase/migrations/005_rotacion_tables.sql`, `20260902220946_…`, `20260904192453_…`, `20260904202648_…`; `src/app/(dashboard)/ausentismo/matriz/actions.ts`; `src/lib/ausentismo/matriz.ts` (`MatrizFila`, `MATRIZ_SELECT`, `getMatriz`).
- Reglas y cobro: `src/lib/ausentismo/matriz-reglas.ts` (`diasACargoPagador`, `ORIGENES_ARL`, `COBRO_EPS_DIAS_MIN`, `DIAS_EMPLEADOR_EPS`, `diaAnterior`, `diasEntre`); `src/lib/ausentismo/cobro.ts` (`resumirCobro`, `contextoCobro`, `exportarInformeCobro`).
- Catálogos: `ausentismo_catalogos` (`20260902220946_…`, `20260903181842_…`), `crearCatalogo`/`exigirCatalogo` en `matriz/actions.ts`.
- Auditoría: `src/lib/devengados/audit.ts` (`logTesoreriaAudit`, `AccionAudit`), `src/lib/ausentismo/auditoria.ts`, `src/lib/riesgo/auditoria.ts` (deduplicación), `src/app/(dashboard)/tesoreria/devengados/auditoria/page.tsx` (lista `MODULOS`).
- Permisos: `src/lib/permissions-shared.ts` (`ALL_MODULES`, `MODULE_LABELS`, `MODULE_HOME`, `MODULE_SUBS`, `SUBMODULE_LABELS`, `SUBS_SENSIBLES`, `subAllowed`, `hrefToModule`, `hrefToSubmodule`), `src/lib/permissions.ts`, `src/lib/constants.ts` (`NAV_TREE`), `src/proxy.ts`, migración modelo `20260910155217_modulo_de_riesgo_predictivo_de_conductores.sql`.
- Soportes: `20260904191056_modulo_operativo_documentos_del_vehiculo_y_vencimientos.sql` (bucket privado, columnas de archivo).
- Exportación: `src/components/ui/botones-exportar.tsx`, `src/lib/exportar/{csv,pdf-tabla,formatos}.ts`, `src/lib/riesgo/{exportar,riesgo-pdf}.ts`.
- Lectura robusta y depuración de maestro: `src/lib/riesgo/datos.ts` (`todo` paginado con orden, `esComodin`, `esFichaSinOperacion`).
- Verificación de UI sin sesión: vista previa temporal bajo `src/app/docs/…` (pública en `proxy.ts`) + Playwright con `channel: "chrome"`.
- Salario y persona: `employees` (`salary`, `salary_currency`, `hire_date`, `document_number`, `eps`, `arl`), `conductores` (`cedula`, `fecha_ingreso`, `eps`, `arl`; sin salario).

---

*Este plan no implementa nada. Toda tabla, columna, ruta, rol, trigger, bucket y estado marcado PROPUESTO se crea únicamente en las fases descritas, con su migración y su verificación, y solo después de resolver las decisiones POR CONFIRMAR que cada fase necesita. La gestión arranca el 2026-09-01; el libro Excel es evidencia de reglas, no fuente de datos.*
