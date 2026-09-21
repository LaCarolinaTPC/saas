# Plan de desarrollo — Módulo **Financiera** (GESTIVO)

Migración del proyecto `lacarolinagestionflota` (Lovable) al SaaS Gestivo como un módulo
nuevo llamado **Financiera**.

Repositorio de origen: `https://github.com/administradordatos-mtc/lacarolinagestionflota.git`
(commit revisado: `94c75e5`, «Actualizó GitHub README v1.2.1»).

---

## Cómo leer este plan

Cada afirmación lleva una marca:

- **OBSERVADO** — verificado contra el código, el esquema o los datos reales. Se cita la fuente.
- **DECIDIDO** — resuelto por el usuario. Lleva la fecha.
- **PROPUESTO** — decisión de diseño de este plan; se puede discutir y cambiar.
- **POR CONFIRMAR** — requiere una decisión de negocio que el plan no toma. Está aislada
  para que cambiarla no obligue a rehacer el resto.

### Acta de decisiones — 2026-09-18

1. **`Ingresos` del Excel = `bruto` de `ingreso_tercero`.** Resuelve la pendiente 11.1.
2. **`ADMON` del Excel = `admon`** (el 2,5 % del bruto), **no `cartu_admon`**. Resuelve 11.2.
3. **Los rubros sin equivalente en GEMA se cargan por archivo CSV o Excel**, porque ese dato
   no existe en Gestivo por ninguna otra vía. Confirma la arquitectura de fuente dual de la
   sección 5 y fija el formato de la sección 6.6.
4. **`DESPACHO` debería venir de GEMA en el ingreso de tercero.** Verificado a medias y
   pendiente de una corrida: ver la sección 3.5.1.
5. **`TIM.` del Excel = `timbradas`**, no `timbradas_cu`. Resuelve el punto 1 de la sección 14.
6. **La utilidad arranca de `bruto` (= Ingresos) y resta solo las 15 partidas del Excel.**
   FET, CAMB, incentivo y las demás deducciones de GEMA quedan fuera del cálculo y se
   muestran solo como información. Resuelve el punto 2 de la sección 14.
7. **`SITRA` se homologa a `sitra` de GEMA.** El concepto ya no se cobra; la columna se
   conserva por paridad y hoy vale 0. Resuelve 11.3 y el punto 3 de la sección 14.
8. **Redondeo:** se guarda con 2 decimales, se muestra y se exporta en pesos enteros;
   cotejo con tolerancia de ±1 COP por partida y vehículo-mes. Resuelve el punto 4 de la 14.
9. **El propietario se conserva tal como venía en el movimiento**, para guardar la
   integridad del dato: un bus con dos dueños en el mes tiene dos filas en la operativa.
   Resuelve el punto 5 de la 14.
10. **Los rubros contables son del vehículo, no del dueño:** se guardan por vehículo-mes en
    tabla aparte y no se reparten entre propietarios. Resuelve el 5-bis y fija el modelo de
    dos tablas de la 6.1.
11. **Los retirados entran** al consolidado; la consolidación nunca filtra por `estado`.
    Resuelve el punto 6.
12. **El universo de vehículos de cada mes es el de `ingreso_tercero`:** el archivo contable
    se valida contra la operativa del período, no contra el maestro; bus sin movimiento en
    el mes → fila rechazada y reportada. Resuelve el 6-bis.
13. **El cierre de período lo marca la fecha de cierre de GEMA**, automáticamente: cuando el
    sync pasó el último día del mes, el mes se congela y el acumulado al corte parte de ahí.
    Sin botón ni rol de cierre; reabre solo el administrador. Resuelve el punto 7.
14. **Consolidación diaria a las 04:00**, porque el ingreso de tercero es el cierre del día
    de GEMA y llega a diario. Función SQL, solo meses abiertos, más «Consolidar ahora».
    Resuelve el punto 8.
15. **El aplicativo arranca en 2025:** todo el histórico operativo ya está en el espejo. Del
    aplicativo solo se traen los 6 rubros contables por vehículo-mes. No hay importador de
    26 columnas ni conciliación de nombres de propietario. Resuelve 9, 10 y 11.6.

La sección 3 es la respuesta directa a la pregunta de homologación y es la que gobierna
todo lo demás: **el espejo de GEMA no alcanza para reproducir la utilidad neta**, y de ahí
sale la arquitectura de fuente dual de la sección 5.

---

## 1. Resumen ejecutivo

El aplicativo de Lovable es un **React 18 + Vite + React Router** con **su propia base de
datos Supabase** (Lovable Cloud), 9 tablas, 5 Edge Functions y ~9.000 líneas de componentes
de dashboard. Gestivo es **Next.js 16 + React 19** con App Router, server actions, permisos
por módulo y sub-función, y migraciones con marca de tiempo aplicadas a mano. No comparten
base ni stack: no hay forma de «juntarlos», hay que portar.

El dato central del aplicativo es `fleet_records`: **una fila por vehículo y mes** con
ingresos, catorce rubros de gasto y los indicadores derivados. Ese dato hoy entra **por
carga manual de un Excel del ERP**.

La verificación (sección 3) muestra que **19 de las 26 columnas del Excel son homologables**
con el espejo `ingreso_tercero` que Gestivo ya sincroniza de GEMA todas las madrugadas (18
directas más `MODELO` por el maestro de vehículos), que **queda una ambigua** (`SITRA`, que
suma 0 en los 21 meses) y que **6 rubros de costo no existen en GEMA**: DESPACHO, INTERESES,
OTROS GASTOS, Repuestos, Mano de Obra y Desc. Fondo-conductor. Como esos 6 entran
directamente en `gastos_operativos_totales`, y por tanto en la utilidad neta y en la
rentabilidad, **el módulo no puede alimentarse solo de GEMA**.

De ahí la arquitectura, ya confirmada por el usuario: **una tabla de hechos mensual con dos
orígenes** — lo operativo y de liquidación se deriva de `ingreso_tercero` (automático,
diario, ya en la base), y los rubros contables **se cargan por CSV o Excel**, porque no
existen en Gestivo por ninguna otra vía, contra un formato reducido de 8 columnas en vez de
26. El módulo recalcula los indicadores en Gestivo y deja trazabilidad de qué vino de dónde.

Dos precisiones del acta del 2026-09-18 que cambian cifras: `Ingresos` es el `bruto` del
espejo, y `ADMON` es **`admon`** (2,5 % del bruto, ~72 M al mes), **no `cartu_admon`**
(~498 M al mes). Y queda una verificación abierta que puede bajar el archivo de 6 a 5
rubros: si GEMA devuelve el `DESPACHO` y el espejo lo está descartando (sección 3.5.1).

Beneficio lateral verificado: el espejo tiene **21 meses de historia (2025-01 a 2026-09)**,
así que la parte operativa del histórico no hay que volver a cargarla a mano.

---

## 2. Diagnóstico de los dos proyectos (OBSERVADO)

### 2.1 Lo que trae el repositorio de Lovable

| Pieza | Detalle |
|---|---|
| Stack | React 18.3, Vite 5.4, React Router 6.30, TanStack Query 5, Tailwind 3.4, shadcn/ui, Radix |
| Tablas | `fleet_records`, `profiles`, `user_roles`, `data_upload_audit`, `user_notifications`, `dashboard_tabs_config`, `password_history`, `external_api_keys`, `vehiculo_marcas` |
| Edge Functions | `fleet-api` (lectura externa por llave), `fleet-api-admin`, `fleet-chat` (agente IA), `admin-reset-password`, `validate-password` |
| Funciones SQL | `check_password_history`, `days_until_password_expires`, `get_user_role`, `has_role`, `is_password_expired` |
| Pantallas | Rentabilidad, Gasto/Timbrada, Productividad, Comparación de períodos, Vehículos en pérdida, Mantenimiento, Reportes PDF, Usuarios, Auditoría, API externa, Marcas |
| Volumen de código | ~9.000 líneas en `src/components/dashboard`, la mayor `ComparacionPeriodosTab.tsx` (1.427 líneas) |

### 2.2 Qué de eso **no** hay que portar

Gestivo ya resuelve, mejor y de forma transversal, buena parte de lo que el aplicativo
implementó por su cuenta:

| En Lovable | En Gestivo ya existe | Conclusión |
|---|---|---|
| `profiles`, `user_roles`, `has_role`, `get_user_role` | Tipos de usuario, `ALL_MODULES`, `MODULE_SUBS`, `subAllowed` | **No se porta.** Se mapea a permisos de Gestivo |
| `password_history`, `is_password_expired`, `validate-password`, `admin-reset-password` | Autenticación y cambio de contraseña de Gestivo (`/cambiar-contrasena`) | **No se porta** |
| `dashboard_tabs_config` (activar/desactivar pestañas) | Permisos por sub-función | **No se porta.** Se sustituye por sub-funciones |
| `external_api_keys` + `fleet-api` + `fleet-api-admin` | `src/lib/external/api-keys.ts` y `/api/external/v1/*` | **No se porta.** Se expone `financiera` como recurso externo más |
| `user_notifications` + Realtime + campana | (no hay equivalente) | **POR CONFIRMAR** si se necesita (sección 11.4) |
| `vehiculo_marcas` | `vehiculos.marca`, que viene de GEMA | **No se porta.** Se lee del maestro |
| `fleet-chat` (agente IA sobre los datos en pantalla) | Servidor MCP de Gestivo con OAuth | **No se porta.** Se expone el recurso al MCP |

Lo que sí hay que portar es el **núcleo analítico**: el modelo de datos, el motor de
cálculo, los filtros en cascada con acumulación al corte, y las siete pestañas.

### 2.3 Convenciones de Gestivo que el plan respeta (OBSERVADO)

- Migraciones **solo** con `npm run migracion:nueva -- "descripcion"`; nunca numeradas a
  mano. Se aplican a mano en el SQL Editor, deben correr enteras de una vez y conceder
  `GRANT` a `service_role` en cada tabla nueva (`AGENTS.md`, `docs/migraciones.md`).
- Next.js de esta versión tiene cambios de API: **leer `node_modules/next/dist/docs/`**
  antes de escribir código (`AGENTS.md`).
- PostgREST recorta a 1.000 filas: toda lectura de volumen **pagina con `.range()`**.
- Excel con estilos: **`exceljs`**, no `xlsx` (modelo en `src/lib/operativo/velocidad-export.ts`).
- El hook de pre-commit falla desde PowerShell: commitear desde Bash o `cmd /c`.

---

## 3. Homologación verificada: Excel de Lovable ↔ `ingreso_tercero` de Gestivo

Esta es la verificación que pidió el usuario. Fuentes:

- Columnas del Excel: `src/lib/excelParser.ts` del repositorio de Lovable (constante
  `EXCEL_COLUMNS`, 26 columnas).
- Esquema del espejo: `supabase/migrations/011_gema_sync.sql` y `src/lib/gema/sync.ts`
  (`syncIngresoTercero`, procedimiento GEMA `pa_ext_get_IngresoTerceroByFecha`).
- Datos reales: consultas de agregación sobre `ingreso_tercero` (21 meses) y muestra de
  filas del **2026-03-12**.

### 3.1 Estado del espejo (OBSERVADO)

| Hecho | Valor |
|---|---|
| Filas totales | 89.784 |
| Rango real de fechas | **2025-01 a 2026-09 (21 meses)** |
| Granularidad | 1 fila = día + vehículo + conductor + ruta + grupo de liquidación |
| Vehículos distintos por mes | entre 137 y 156 |
| Actualización | cron diario 03:00 Colombia; re-sincroniza los últimos 45 días |

> [!warning] La documentación del recurso está desactualizada
> `describir_recurso` y el catálogo MCP afirman «histórico desde 2026-01-01». Los datos
> reales arrancan en **2025-01**. Conviene corregir `src/lib/mcp/catalogo/gema.ts`.

### 3.2 Columnas homologables directamente (18 de 26) — OBSERVADO

| Columna del Excel | Campo en `ingreso_tercero` | Nota |
|---|---|---|
| `Ingresos` | `bruto` | **DECIDIDO 2026-09-18.** Es el denominador de la rentabilidad. Coherente con los datos: marzo 2026 da 2.878.276.257 sobre 875.411 timbradas, ~3.288 COP por timbrada |
| `ADMON` | `admon` | **DECIDIDO 2026-09-18: es `admon`, no `cartu_admon`.** Verificado que `admon` es exactamente el **2,5 % del bruto** (4 filas del 2026-03-12: 833.107 × 0,025 = 20.827,7 ✓). `cartu_admon` es otra cosa —un fijo diario por bus— y **no entra** en esta columna |
| `Fechas`, `Fecha_OK`, `Año` | `fecha` | El período `YYYY-MM` sale de `to_char(fecha,'YYYY-MM')`. Elimina las tres heurísticas de `normalizePeriod` |
| `VEHI.` | `codigo_vehiculo` | En el Excel es número; en el espejo es `text`. Requiere normalización |
| `PLACA` | `placa` | Directo |
| `PROPIETARIO` | `propietario_nombre` | El espejo además trae `cedula_propietario`, que es mejor llave |
| `Flota` | `tipo_propietario` | **Verificado:** el espejo solo tiene los valores `AFILIADO` y `EMPRESA`, exactamente los dos que produce `normalizeFlota()` |
| `VIAJES` | `viajes` | Sumar por mes. Admite decimales |
| `TIM.` | `timbradas` | **DECIDIDO 2026-09-18: `timbradas`, no `timbradas_cu`.** Sumar por mes. El espejo trae las dos y en marzo 2026 difieren un 6 % (875.411 vs 821.569,45); `timbradas_cu` no se usa en el módulo |
| `FONDO` | `cartu_fondo` | Sumar |
| `POLIZA` | `cartu_poliza` | Sumar |
| `PRESTA.` | `cartu_presta` | Sumar |
| `ESTUD.` | `cartu_estudio` | Sumar |
| `SALARIO` | `salario` | Sumar |
| `COMBS` | `combustible` | Sumar |
| `RTICA` | `rtica` | Sumar. **Verificado: es el 0,7 % del bruto** |

### 3.3 Columna que se resuelve por el maestro (1 de 26) — OBSERVADO

| Columna | Origen | Nota |
|---|---|---|
| `MODELO` | `vehiculos.modelo` | No está en `ingreso_tercero`, sí en el maestro de GEMA (202 vehículos: 188 AFILIADO, 14 EMPRESA; 22 modelos distintos entre los afiliados). Se resuelve por `codigo_vehiculo = vehiculos.codigo` |

### 3.4 Columnas ambiguas — ninguna

Las tres quedaron resueltas el 2026-09-18: `Ingresos` = `bruto` y `ADMON` = `admon` pasaron a
la sección 3.2; **`SITRA` se homologa a `sitra`** de GEMA — el concepto ya no se cobra, la
columna suma 0 en los 21 meses y se conserva solo por paridad con el Excel.

> [!note] Consecuencia de la decisión sobre `ADMON`
> Al quedar en `admon` (2,5 % del bruto, ~72 M al mes) y no en `cartu_admon` (fijo diario,
> ~498 M al mes), **`cartu_admon` no se usa en el módulo**. Es la diferencia más grande de
> toda la homologación: ~426 M al mes. El cotejo de la fase 0 debe confirmarlo contra un mes
> real antes de consolidar los 21 meses.

### 3.5 Columnas SIN equivalente en GEMA (6 de 26) — OBSERVADO

Ninguna de estas existe en `ingreso_tercero` ni en ningún otro recurso del dominio `gema`:

| Columna del Excel | Naturaleza | Origen probable |
|---|---|---|
| `DESPACHO` | Gasto operativo | Contabilidad / ERP |
| `INTERESES` | Gasto financiero | Contabilidad / ERP |
| `OTROS GASTOS` | Gasto operativo | Contabilidad / ERP |
| `Repuestos` | Costo de mantenimiento | Repositorio BI, `Consumos\` (consumos repuestos GMAS/MGX) |
| `Mano de Obra` | Costo de mantenimiento | Contabilidad / taller |
| `Desc. Fondo - conductor` | Recuperación que **se resta de Repuestos** | Contabilidad |

#### 3.5.1 `DESPACHO`: verificación pendiente de una corrida contra GEMA

El usuario señala que **`DESPACHO` debería venir en el ingreso de tercero**. Lo verificado
hasta ahora:

- **OBSERVADO — en Gestivo no existe.** `ingreso_tercero` no tiene ninguna columna de
  despacho (`supabase/migrations/011_gema_sync.sql`), y `syncIngresoTercero` no mapea
  ninguna (`src/lib/gema/sync.ts`). Barrido de todo el esquema y del diccionario de datos:
  los únicos `despacho` que existen son **identificadores de viaje**
  (`numero_despacho`, `viaje_despacho`, `hora_despacho`, `geo_trazados.despacho`) o **el
  despachador, que es una persona** (`viajes_perdidos.despacho`, mapeado desde
  `r.Despachador`). **Ninguno es un valor monetario.**
- **NO VERIFICADO — si GEMA lo devuelve y el espejo lo descarta.** `syncIngresoTercero`
  toma los campos **por nombre**, así que cualquier columna que
  `pa_ext_get_IngresoTerceroByFecha` devuelva y no esté en la lista **se pierde en
  silencio**. Es una hipótesis plausible y hay que descartarla o confirmarla.
- **Por qué no se pudo verificar aquí:** `GEMA_DB_USER` y `GEMA_DB_PASSWORD` están **vacías
  en `.env`**; las credenciales reales viven en `.env.local` (y en Vercel), que no está en
  la máquina donde se redactó el plan.

**Cómo resolverlo (primer paso de la Fase 0):**

```bash
npx tsx --tsconfig tsconfig.json work/gema-columnas-ingreso-tercero.mts 2026-03-12
```

El script imprime todas las columnas que devuelve el procedimiento y **marca con `??` las
que el espejo está descartando**.

Los dos desenlaces y qué implica cada uno:

| Si el script muestra… | Entonces |
|---|---|
| Una columna de despacho **con valor monetario** | Es un **defecto del espejo, no del Excel**. Se añade la columna a `ingreso_tercero` (migración), se mapea en `syncIngresoTercero`, se re-sincroniza el histórico, y `DESPACHO` **sale de la lista de la 3.5 y pasa a la 3.2**. El archivo contable baja de 6 a 5 rubros |
| Ninguna columna sin mapear, o ninguna monetaria | `DESPACHO` **no existe en el origen** y se queda en el archivo contable, como los otros cinco |

Mientras no se corra, el plan **asume el caso conservador** (va por archivo) para no
bloquear, y la Fase 2 no se ve afectada: quitar un rubro del archivo es cambiar una
constante, no rehacer el modelo.

> [!important] Consecuencia
> `gastos_operativos_totales = DESPACHO + FONDO + POLIZA + PRESTA. + SALARIO + INTERESES +
> ESTUD. + SITRA + COMBS + RTICA + ADMON + OTROS GASTOS + (Repuestos − Desc. Fondo-conductor)
> + Mano de Obra` (`excelParser.ts`). Seis de los quince sumandos no están en GEMA. Por tanto
> **la utilidad neta, la rentabilidad y el gasto por timbrada no se pueden calcular solo con
> el espejo.** Cualquier diseño que lo suponga entrega cifras equivocadas.

### 3.6 Hallazgos adicionales verificados

Salen de esta revisión y valen para todo Gestivo, no solo para Financiera:

1. **`total_cartulina` no incluye la póliza.** Marzo 2026: `cartu_admon` 497.792.000 +
   `cartu_estudio` 18.358.000 + `cartu_fondo` 1.945.000 + `cartu_presta` 308.029.900 =
   **826.124.900 = `total_cartulina`** exacto, mientras `cartu_poliza` (112.631.704) queda
   fuera. Confirmado también a nivel de fila (128.000 + 4.000 + 500 + 72.700 = 205.200). La
   documentación del recurso lo daba como «no verificado»; **ya está verificado y debe
   corregirse en `src/lib/mcp/catalogo/gema.ts`**.
2. **`admon` = 2,5 % del bruto** y **`rtica` = 0,7 % del bruto**, constantes en la muestra.
   También documentable.
3. **`liquido` sigue sin fórmula reproducible.** En la fila del vehículo 975 del 2026-03-12,
   `bruto − admon − total_cartulina − cartu_poliza − salario − combustible − rtica − fet` da
   237.663, pero `liquido` es 286.361. **No usar `liquido` como utilidad** hasta aclararlo.
4. **Riesgo de subconteo en el espejo.** El sync descarta filas con llave repetida en vez de
   sumarlas (advertencia del propio recurso). Para un módulo financiero eso es material: la
   fase 1 debe medirlo (sección 9).

### 3.7 Veredicto

**Homologación parcial, suficiente para la mitad operativa y no para la contable.**

| Grupo | Columnas | % |
|---|---|---|
| Homologables directo con `ingreso_tercero` | 18 | 69 % |
| Vía maestro `vehiculos` | 1 | 4 % |
| Ambigua (solo `SITRA`) | 1 | 4 % |
| Sin equivalente en GEMA → archivo contable | 6 | 23 % |

Si la verificación de la 3.5.1 encuentra el despacho en el origen, el reparto pasa a
**19 / 1 / 1 / 5** (73 % homologable directo).

El archivo mensual **no desaparece**, pero pasa de 26 a 8 columnas (7 si aparece el despacho).

---

## 4. Alcance de la migración

**Entra:** el modelo de datos, el motor de cálculo, los filtros en cascada con acumulación
al corte, y las siete pestañas analíticas (Rentabilidad, Gasto/Timbrada, Productividad,
Comparación de períodos, Vehículos en pérdida, Mantenimiento, Reportes), la carga de datos
con auditoría y reversión, y la exposición del recurso por la API externa y el MCP.

**No entra** (sección 2.2): usuarios, roles, contraseñas, configuración de pestañas, llaves
de API propias, marcas de vehículo y el agente de chat.

**Queda fuera de este plan:** apagar el aplicativo de Lovable. Se propone convivencia hasta
cerrar la fase 6 (sección 9).

---

## 5. Arquitectura propuesta: tabla de hechos mensual con dos orígenes (PROPUESTO)

```
GEMA ──(cron 03:00, ya existe)──> ingreso_tercero  ─┐
                                   vehiculos        ├─> financiera_consolidado_mes
CSV/Excel contable (8 col.) ──> financiera_cargas ──┘      (hechos + indicadores)
      ↑ DECIDIDO 2026-09-18                                   │
      (los 6 rubros no están en Gestivo                       ├─> /financiera (7 pestañas)
       por ninguna otra vía)                                  ├─> /api/external/v1/financiera
                                                              └─> MCP
```

Tres razones para consolidar en una tabla propia en vez de calcular al vuelo:

1. Los dos orígenes tienen **granularidad distinta** (día+conductor+ruta vs mes) y
   **cadencia distinta** (diaria vs mensual). Consolidar es el punto donde se encuentran.
2. Agregar 90.000 filas diarias a mes en cada carga de pantalla es caro y repetitivo.
3. Un módulo financiero necesita **cifras estables**: si `ingreso_tercero` re-sincroniza los
   últimos 45 días, un mes cerrado no puede cambiar solo. El consolidado se **congela** al
   cerrar el mes (sección 6.4).

---

## 6. Modelo de datos (PROPUESTO)

Nombres con prefijo `financiera_` para no chocar con nada existente. Toda tabla nueva lleva
`GRANT` a `service_role` (`AGENTS.md`).

### 6.1 Dos tablas de hechos con grano distinto (DECIDIDO 2026-09-18, puntos 5 y 5-bis)

La operativa de GEMA viene por día y por dueño; la contable llega por vehículo y mes. Tienen
grano distinto y **se guardan en tablas distintas**, en vez de forzarlas a una sola fila:

#### 6.1-a `financiera_operativo_mes` — producción y rubros de GEMA

Una fila por **período + vehículo + propietario**. Llave única
`(periodo, codigo_vehiculo, cedula_propietario)`. El propietario se conserva **tal como
venía en el movimiento diario**, para guardar la integridad del dato: en el caso normal hay
una fila por vehículo-mes; si el bus cambió de dueño dentro del mes, hay una por dueño, cada
una con la producción de sus días. Las filas históricas del Excel traen un solo dueño por
vehículo-mes y encajan sin cambio.

- **Identificación:** `periodo` (`text`, `YYYY-MM`), `codigo_vehiculo` (`text`),
  `cedula_propietario`, `propietario_nombre`, `tipo_propietario` (el `flota` del Excel),
  `placa` (la del último día de la fila; `placa_cambio` si hubo más de una), `modelo`.
- **Producción:** `viajes`, `timbradas`, `ingresos` (= `bruto`), `dias_con_produccion`.
- **Rubros de GEMA:** `fondo`, `poliza`, `prestamo`, `estudio`, `salario`, `combustible`,
  `rtica`, `admon`, `sitra`.
- **Informativos, fuera de la utilidad (punto 2):** `fet`, `valor_camb`, `incentivo_c`,
  `valor_descuentos`.
- **Trazabilidad:** `origen` (`gema` | `archivo`), `carga_id`, `created_at`, `updated_at`.

#### 6.1-b `financiera_contable_mes` — los seis rubros del archivo

Una fila por **período + vehículo**. Llave única `(periodo, codigo_vehiculo)`. Los rubros
contables **son del vehículo, no del dueño**, así que no se reparten aunque la operativa
tenga dos propietarios ese mes.

- `despacho`, `intereses`, `otros_gastos`, `repuestos`, `mano_de_obra`,
  `desc_fondo_conductor`.
- **Trazabilidad:** `carga_id`, `created_at`, `updated_at`.

#### 6.1-c Cierre y derivados

- El **cierre de período** (6.4) va en una tabla pequeña `financiera_periodos` (`periodo`,
  `cerrado_at`, `cerrado_por`, `reabierto_at`, `motivo`), porque cubre a las dos tablas a la
  vez.
- Los **indicadores** (`gastos_operativos_totales`, `utilidad_neta`, `rentabilidad`,
  `gastos_por_timbrada`) **no se guardan**: los calcula la vista 6.5 al nivel del
  **vehículo-mes**, sumando la operativa de todos los dueños del bus y restando la contable.
  Cuando el filtro es por propietario, la producción y los rubros de GEMA se muestran del
  dueño y el costo contable aparece **como del vehículo**, marcado, sin prorrateo.
- Los KPIs de pantalla usan **promedio ponderado** `Σutilidad / Σingresos`, nunca el promedio
  de una columna (así lo hace hoy el aplicativo y así debe seguir).

### 6.2 `financiera_cargas` — bitácora de carga y reversión

Sustituye a `data_upload_audit`. Una fila por operación: `tipo`
(`consolidar_gema` | `cargar_contable` | `reversar`), `periodo`, `usuario_id`,
`archivo_nombre`, `filas`, `detalle` (`jsonb` con períodos, vehículos, totales de
ingresos/gastos/utilidad), `created_at`.

### 6.3 `financiera_parametros` — umbrales de semáforo

Los cortes Crítico / Aceptable / Excelente de los tres indicadores. Hoy están quemados en
`src/lib/fleetUtils.ts` del aplicativo; aquí se parametrizan y quedan bajo la sub-función
`fin_parametros` (solo administrador). **Semilla de la migración (OBSERVADO en el código):**

| Indicador | 🟢 Excelente | 🟡 Aceptable | 🔴 Crítico |
|---|---|---|---|
| Rentabilidad (%) | ≥ 15 | 5 – 14,9 | < 5 |
| Gasto por timbrada (COP) | ≤ 2.500 | 2.501 – 3.200 | > 3.200 |
| Productividad (viajes por vehículo-mes) | ≥ 90 | 80 – 89 | < 80 |

Una fila por indicador con `umbral_excelente` y `umbral_aceptable`; la dirección (mayor o
menor es mejor) es parte de la fila. Cambiarlos queda en la bitácora.

#### 6.3.1 Reevaluación con datos reales (OBSERVADO 2026-09-18)

Se recalcularon los tres indicadores sobre `ingreso_tercero`: 20 meses cerrados de flota
(2025-01 a 2026-08) y la distribución por vehículo de julio 2026 (147 buses con movimiento).
Script: `work/financiera-reevaluar-umbrales.mjs`. Como el espejo no trae los 6 rubros
contables, **solo la productividad es exacta**; la rentabilidad calculada es un **techo** y
el gasto por timbrada un **piso**.

**Productividad (exacta) — el umbral actual es inalcanzable para la flota.**

| | Valor |
|---|---|
| Promedio de flota, 20 meses | **77,0 viajes por vehículo-mes** (mín 66,9 · máx 85,2) |
| Meses en 🟢 con el umbral 90/80 | **0 de 20** · 🟡 7 · 🔴 13 |
| Julio 2026 por vehículo | P10 50 · P25 66 · **mediana 78** · P75 86 · P90 92 · máx 106 |
| Reparto con 90/80 | 🟢 16 % · 🟡 29 % · **🔴 55 %** |
| Reparto si fuera 85/70 | 🟢 29 % · 🟡 41 % · 🔴 30 % |
| Reparto si fuera 80/65 | 🟢 45 % · 🟡 31 % · 🔴 24 % |

Además hay una **caída en 2026**: de 78–85 viajes por bus en 2025 a 67–75 en la mayoría de
2026, mientras la flota con movimiento creció de ~145 a 156 buses. Puede ser real (más buses
repartiéndose los mismos despachos) o ser el **subconteo del espejo** (hallazgo 3.6.4); la
Fase 1 lo tiene que separar antes de sacar conclusiones de negocio.

**Gasto por timbrada (piso) y rentabilidad (techo) — no se pueden recalibrar todavía.**

| | 2025 | 2026 (ene–ago) |
|---|---|---|
| Ingreso por timbrada | ~2.988 COP | ~3.288 COP (**+10 %**, subió el pasaje) |
| Gasto GEMA por timbrada (piso) | 1.572 – 1.706 | 1.759 – 1.972 |
| Techo de rentabilidad | 43 – 47 % | 39 – 46 % |
| Margen por vehículo-mes antes de contables | 7,1 – 9,1 M | 6,5 – 9,6 M |

Solo GEMA ya consume el **56 %** del ingreso por timbrada. Para que un bus quede 🟢 con los
umbrales actuales, los 6 rubros contables tienen que caber en **764 COP/timbrada** (o
**5,26 M por vehículo-mes** en rentabilidad); para no caer en 🔴, en 1.464 COP/timbrada
(7,07 M). Si eso es holgado o imposible solo se sabe con `repuestos` y `mano_de_obra` en la
mano: **la recalibración de estos dos queda para la Fase 7**, cuando esté cargado el
histórico contable, corriendo el mismo script sobre el consolidado completo.

Dos cosas sí se ven ya: (1) los umbrales de gasto por timbrada están en pesos fijos y el
pasaje subió 10 % en un año, así que envejecen — conviene evaluar expresarlos como
**porcentaje del ingreso por timbrada**; (2) el umbral 🔴 de 3.200 COP quedó casi igual al
ingreso por timbrada de 2026 (3.288), es decir, «crítico» hoy equivale a rentabilidad ≈ 2,7 %,
coherente con el corte de 5 %.

### 6.4 Cierre de período (DECIDIDO 2026-09-18, punto 7 de la sección 14)

**El cierre lo marca GEMA, no el calendario ni un usuario.** Un período se cierra
automáticamente cuando `gema_sync_state.last_synced_date` del dataset `ingreso_tercero` es
mayor o igual que el último día del mes: el cron registra `cerrado_at` en
`financiera_periodos` y deja de recalcular ese mes aunque el espejo cambie por la
re-sincronización de 45 días. El **acumulado al corte** de las pantallas parte de esa fecha
de cierre. Esto es lo que da estabilidad a las cifras sin depender de que alguien se acuerde
de cerrar.

**Reabrir** sí es una acción humana: solo el administrador, con motivo obligatorio, y queda
en `financiera_cargas`. Un período reabierto vuelve a recalcularse en cada corrida hasta que
GEMA lo cierre de nuevo. Al reabrir se conserva una **copia de las cifras anteriores** (tabla
`financiera_periodos_versiones`) para poder comparar «lo que se reportó» con «lo que quedó».

El estado de cada mes es visible en `/financiera/flota/datos`: **abierto** (GEMA todavía no
lo cerró; puede moverse), **cerrado** (congelado) o **reabierto** (por quién, cuándo, por qué).

### 6.5 Vista de lectura

`vw_financiera_consolidado` con el `join` ya resuelto a `vehiculos` para modelo y marca, y
los indicadores listos. Toda lectura de volumen **pagina con `.range()`**.

### 6.6 Formato del archivo contable (DECIDIDO 2026-09-18)

Se acepta **CSV y Excel (`.xlsx`)**, porque estos seis rubros no existen en Gestivo por
ninguna otra vía. Ocho columnas, contra las 26 del archivo actual:

| Columna | Tipo | Obligatoria | Regla |
|---|---|---|---|
| `periodo` | texto `YYYY-MM` | sí | Debe existir en el consolidado y **no estar cerrado** |
| `vehiculo` | texto | sí | Se coteja contra la **operativa del mismo período** (lo que muestra `ingreso_tercero`), no contra el maestro: si el bus no tuvo movimiento ese mes, la fila se rechaza y se reporta (DECIDIDO 2026-09-18, punto 6-bis) |
| `despacho` | número | sí | **Sale del archivo si la verificación 3.5.1 lo encuentra en GEMA** |
| `intereses` | número | sí | |
| `otros_gastos` | número | sí | |
| `repuestos` | número | sí | |
| `mano_de_obra` | número | sí | |
| `desc_fondo_conductor` | número | sí | Se **resta** de `repuestos`, no se suma como gasto |

Reglas de la carga:

- **Vacío es 0**, igual que hoy en `excelParser.ts` (`Number(row[...]) || 0`). Se reporta
  cuántas celdas se interpretaron así, para que nadie confunda «sin dato» con «cero».
- **CSV:** UTF-8, separador `,` o `;` detectado automáticamente, decimal `,` o `.`. Se
  rechaza el archivo entero si la cabecera no coincide, nunca a medias.
- **Idempotente por `(periodo, vehiculo)`:** volver a cargar el mismo período reemplaza sus
  rubros contables y **no toca la parte operativa** que vino de GEMA.
- **Previsualización antes de confirmar:** filas válidas, filas rechazadas con el motivo, y
  el delta de los totales contra lo que ya había. Igual que la carga de la matriz de
  ausentismo.
- **Reversión por período**, que borra solo los rubros contables y deja `origen_contable`
  en `sin_dato`.
- Plantilla descargable en los dos formatos desde `/financiera/datos`.

---

## 7. Permisos (PROPUESTO)

Módulo nuevo `financiera` en `ALL_MODULES`, etiqueta **«Financiera»**, `MODULE_HOME`
`/financiera`.

Sub-funciones en `MODULE_SUBS` (prefijo `fin_` porque `SUBS_SENSIBLES`, `SUBS_SOLO_ADMIN` y
`SUB_HOME` se indexan por nombre sin módulo, y `parametros` ya es de Tesorería — misma
razón que llevó a `incap_` en incapacidades):

| Sub-función | Cubre |
|---|---|
| `fin_tablero` | Rentabilidad, Gasto/Timbrada, Productividad |
| `fin_analisis` | Comparación de períodos, Vehículos en pérdida, Mantenimiento |
| `fin_datos` | Consolidar desde GEMA, cargar el archivo contable, reversar (el cierre es automático por GEMA; reabrir es del administrador) |
| `fin_auditoria` | Bitácora de cargas — **entra en `SUBS_SENSIBLES`**, como `auditoria` de Tesorería |
| `fin_parametros` | Umbrales de semáforo — **entra en `SUBS_SOLO_ADMIN`** |

Equivalencia con los roles de Lovable: Visualizador → `fin_tablero` + `fin_analisis`;
Editor → + `fin_datos`; Administrador → todas.

---

## 8. Pantallas (PROPUESTO)

> [!note] Nombre y jerarquía (2026-09-18)
> El módulo se llama **Financiera** y lo que se porta de Lovable es su primera opción,
> **Gestión de flota**. Eso deja espacio a otras opciones financieras después sin renombrar
> nada. En el menú: grupo «Financiera» → sub-grupo o prefijo «Gestión de flota». En rutas,
> las de abajo quedan bajo `/financiera/flota/…` (`/financiera` redirige a la primera
> pantalla permitida). Los nombres de sub-función `fin_*` no cambian.

Rutas bajo `src/app/(dashboard)/financiera/flota/`, con `PageHeader` y el menú contraíble
ya existentes. Entrada en `src/lib/constants.ts` como grupo, con icono `Landmark` o
`PiggyBank`. (La tabla usa la forma corta; anteponer `/flota` a cada ruta salvo la raíz.)

| Ruta | Pantalla | Sub-función |
|---|---|---|
| `/financiera` | Rentabilidad (KPIs + tabla detallada) | `fin_tablero` |
| `/financiera/timbrada` | Gasto por timbrada | `fin_tablero` |
| `/financiera/productividad` | Productividad | `fin_tablero` |
| `/financiera/comparacion` | Comparación de períodos | `fin_analisis` |
| `/financiera/perdida` | Vehículos en pérdida | `fin_analisis` |
| `/financiera/mantenimiento` | Repuestos vs mano de obra | `fin_analisis` |
| `/financiera/datos` | Consolidar, cargar, reversar, cerrar | `fin_datos` |
| `/financiera/auditoria` | Bitácora de cargas | `fin_auditoria` |
| `/financiera/parametros` | Umbrales | `fin_parametros` |

Reglas que se conservan del aplicativo original (OBSERVADO en su código y documentación):

- **Filtros en cascada** `Año → Mes → Flota → Propietario → Vehículo`, cada uno reduciendo
  las opciones del siguiente, con chips removibles. En Gestivo van por `nuqs` (ya es
  dependencia) para que el estado viva en la URL.
- **Acumulación al corte:** elegir un mes acumula desde enero hasta ese mes.
- **Agrupación por `codigo_vehiculo`, nunca por placa** (una placa puede cambiar de bus).
- **Selector de vista de rentabilidad** (Operativa sin intereses / Después de financiero /
  Ambas) en Rentabilidad, Gasto/Timbrada y la tabla detallada — ver punto 18 de la
  sección 14, pendiente de confirmar que se conserva.
- **Promedio ponderado** en rentabilidad y gasto por timbrada.
- **`Desc. Fondo-conductor` se resta de Repuestos**, no se suma como gasto.
- Valores negativos siempre en rojo.

Exportes: Excel con **`exceljs`** (no `xlsx`) siguiendo `src/lib/operativo/velocidad-export.ts`;
PDF con `jspdf` + `jspdf-autotable`, que ya son dependencias de Gestivo.

---

## 9. Fases

Cada fase cierra con `tsc` y `eslint` limpios y commit propio.

### Fase 0 — Decisiones (bloquea a la 2)
Tres de las cuatro decisiones ya están tomadas (acta del 2026-09-18). Queda:

1. **Correr `work/gema-columnas-ingreso-tercero.mts`** para cerrar lo de `DESPACHO`
   (sección 3.5.1). Es lo primero: define si el archivo contable lleva 6 rubros o 5.
2. **Cotejar un mes real** del Excel contra el espejo (sección 10) para confirmar
   `Ingresos` = `bruto` y `ADMON` = `admon` con cifras, no solo con el criterio.
3. Resolver `SITRA` (11.3) con contabilidad.

### Fase 1 — Auditoría del espejo
Medir el subconteo por llave repetida (hallazgo 3.6.4): cuántas filas descarta el sync por
mes y qué porcentaje del bruto representan. Si es material, corregir `syncIngresoTercero`
para sumar en vez de descartar. **Es prerrequisito de fiarse de las cifras.**

### Fase 2 — Migración y motor
Migración con `npm run migracion:nueva -- "modulo financiera consolidado mensual y cargas"`:
las tres tablas, la vista, índices, `GRANT` a `service_role` y RLS. Motor de cálculo en
`src/lib/financiera/motor.ts` con **pruebas unitarias** que transcriben literalmente las
fórmulas de `excelParser.ts` (mismo método que se usó en incapacidades: el oráculo es la
fórmula, no cifras inventadas).

> [!done] Implementada el 2026-09-21 — `docs/financiera-fase-2.md`
> Migración `20260921140156_modulo_financiera_consolidado_mensual_y_cargas.sql` (pendiente de
> aplicar en el SQL Editor). Incluye además las funciones SQL de la fase 3
> (`financiera_consolidar_periodo`, `financiera_consolidar_abiertos`,
> `financiera_cerrar_periodos_por_gema`, `financiera_reabrir_periodo`), así que la primera
> consolidación se puede disparar desde el editor con `SELECT financiera_consolidar_abiertos('sql-editor')`.
> Motor con 23 pruebas (`npm run test:financiera`), permisos `financiera` / `fin_*` registrados.
> `DESPACHO` sigue en el archivo contable (caso conservador de la 3.5.1).

### Fase 3 — Consolidación desde GEMA
Server action + ruta de cron que agrega `ingreso_tercero` a mes por vehículo y llena la
parte operativa de los 21 meses disponibles. Idempotente por `(periodo, codigo_vehiculo)`.
No toca períodos cerrados.

> [!done] Implementada el 2026-09-21 — `docs/financiera-fase-3.md`
> Migración aplicada y primera corrida hecha: 21 meses, 20 cerrados, 2026-09 abierto; marzo 2026
> igual a la referencia de la sección 10; cotejo vista ↔ motor sin diferencias en tres meses.
> La corrida diaria va **encadenada al final del cron `sync-gema`** (03:00 Colombia), no en un
> cron propio: el plan Hobby de Vercel admite dos y ya están ocupados. Ruta
> `/api/cron/financiera-consolidar` para invocarla a mano; «Consolidar ahora» en
> `/financiera/flota/datos` (sub-función `fin_datos`), que ya muestra estado por mes y bitácora.

### Fase 4 — Carga del archivo contable (CSV o Excel)
Pantalla `/financiera/datos` con el contrato de la sección 6.6: plantilla descargable en
ambos formatos, lectura de CSV y `.xlsx`, validación contra `vehiculos.codigo` y contra
períodos cerrados, previsualización con filas rechazadas y delta de totales, carga por
lotes paginados, bitácora en `financiera_cargas` y reversión por período.

> [!done] Implementada el 2026-09-21 — `docs/financiera-fase-4.md`
> En `/financiera/flota/datos`: plantillas, previsualización, confirmación, reversión;
> 15 pruebas nuevas y carga real de prueba (cargar → recargar → reversar) sobre 2026-09.
> **Ajuste al contrato 6.6, documentado allí:** un mes **cerrado sin archivo** sí recibe la
> carga (si no, ningún mes podría recibirla: GEMA cierra antes de que contabilidad
> entregue); reemplazar o reversar en un mes cerrado que **ya tiene archivo** exige la
> reapertura del administrador. Constante `REEMPLAZO_EN_CERRADO_EXIGE_REAPERTURA`.

### Fase 5 — Pantallas
Las seis pestañas analíticas, los filtros en cascada y la tabla detallada. Se portan de
Lovable adaptando a server components y a los componentes de Gestivo. Verificación de UX
**sin sesión** con vista previa temporal bajo `/docs` + Playwright a 1440 y 800 px, y
borrarla antes del commit (método ya establecido en el proyecto).

### Fase 6 — Exportes, API externa y MCP
Excel y PDF; alta de `financiera` en `src/lib/external/resources.ts` y en el catálogo MCP;
corrección de la documentación de `ingreso_tercero` con los hallazgos 3.6.1 a 3.6.3.

### Fase 7 — Migración del histórico y corte
Cargar el histórico contable que hoy vive en Lovable (sección 10), cotejar mes a mes contra
el aplicativo original, y **solo entonces** decidir el apagado. Con el consolidado completo,
**recalibrar los umbrales de gasto por timbrada y rentabilidad** (6.3.1) corriendo
`work/financiera-reevaluar-umbrales.mjs` adaptado al consolidado, y proponer los nuevos
valores a Subgerencia Financiera antes de cambiarlos en Parámetros.

---

## 10. Migración del dato histórico

La parte operativa **no hay que migrarla**: sale de `ingreso_tercero`, que ya tiene 2025-01
a 2026-09 en Gestivo, y el aplicativo **arranca también en 2025** (DECIDIDO 2026-09-18), así
que no hay meses fuera del espejo.

La parte contable (los 6 rubros) solo existe hoy dentro de `fleet_records` en la base de
Lovable. **OBSERVADO:** la lectura anónima está bloqueada por RLS, así que hay que sacarla
por uno de estos caminos:

1. **`fleet-api` con una llave activa** — la Edge Function ya existe, es de solo lectura,
   pagina de a 1.000 y filtra por período. Es el camino limpio. Requiere que el
   administrador genere la llave en la pestaña API del aplicativo.
2. Exportación manual a Excel desde el propio aplicativo.

El mismo volcado sirve para la **Fase 0**: con un mes se **confirman con cifras** las dos
decisiones del acta (`Ingresos` = `bruto`, `ADMON` = `admon`) y se resuelve `SITRA`. La
consulta deja `admon` y `cartu_admon` lado a lado a propósito: es el control de que la
decisión sobre `ADMON` cuadra contra el Excel real y no contra el otro candidato.

```sql
SELECT to_char(fecha,'YYYY-MM') AS periodo,
       codigo_vehiculo,
       SUM(bruto)         AS ingresos_bruto,
       SUM(timbradas)     AS timbradas,
       SUM(viajes)        AS viajes,
       SUM(admon)         AS admon_pct,
       SUM(cartu_admon)   AS admon_fijo,
       SUM(cartu_fondo)   AS fondo,
       SUM(cartu_poliza)  AS poliza,
       SUM(cartu_presta)  AS prestamo,
       SUM(cartu_estudio) AS estudio,
       SUM(salario)       AS salario,
       SUM(combustible)   AS combustible,
       SUM(rtica)         AS rtica,
       SUM(sitra)         AS sitra
FROM ingreso_tercero
WHERE fecha >= '2026-03-01' AND fecha <= '2026-03-31'
GROUP BY 1, 2
ORDER BY 2;
```

Referencia ya calculada para marzo de 2026 (total de la flota): `bruto` 2.878.276.257,
`timbradas` 875.411, `viajes` 11.060, `admon` 71.956.905, `cartu_admon` 497.792.000,
`total_cartulina` 826.124.900, `liquido` 811.365.353, sobre 4.220 filas y 137 vehículos.

---

## 11. Decisiones pendientes (POR CONFIRMAR) — el plan no las toma

| # | Decisión | Por qué importa | Cómo se resuelve |
|---|---|---|---|
| ~~11.1~~ | ~~¿`Ingresos` es `bruto`?~~ | — | **RESUELTA 2026-09-18: sí.** Ver 3.2 |
| ~~11.2~~ | ~~¿`ADMON` es `admon` o `cartu_admon`?~~ | — | **RESUELTA 2026-09-18: `admon`.** Ver 3.2 |
| ~~11.3~~ | ~~¿Por qué `SITRA` suma 0?~~ | — | **RESUELTA 2026-09-18: el concepto ya no se cobra; se homologa a `sitra`.** Ver 3.4 |
| 11.4 | ¿Se necesitan las notificaciones en tiempo real de carga? | Gestivo no tiene equivalente; construirlo es una fase aparte | Decisión de negocio |
| ~~11.5~~ | ~~¿Los rubros contables llegan por archivo?~~ | — | **RESUELTA 2026-09-18: sí, CSV o Excel.** Ver 6.6 |
| ~~11.6~~ | ~~¿Qué antigüedad tiene el histórico?~~ | — | **RESUELTA 2026-09-18: arranca en 2025**, dentro de los 21 meses del espejo. Solo se vuelcan los rubros contables |
| 11.7 | ¿Se apaga el aplicativo de Lovable al cerrar la fase 7? | Afecta el mantenimiento de dos sistemas | Decisión de negocio |
| 11.8 | ¿GEMA devuelve el `DESPACHO` y el espejo lo descarta? | Decide si el archivo lleva 6 rubros o 5, y si hay un defecto que corregir en el sync | Correr `work/gema-columnas-ingreso-tercero.mts` (sección 3.5.1) |

Aparte de 11.5, sigue en pie revisar si **`Repuestos` podría automatizarse** desde el
repositorio BI (`Consumos\`, consumos de repuestos GMAS/MGX) en vez de venir en el archivo.
No bloquea nada: el archivo es el camino acordado y esa sería una mejora posterior.

---

## 12. Pruebas

- **Motor:** unitarias con `node:test` + `tsx` (patrón `npm run test:incapacidades`),
  transcribiendo las fórmulas de `excelParser.ts`. Casos borde: ingresos 0 (rentabilidad 0,
  no división por cero), timbradas 0, `Desc. Fondo-conductor` mayor que `Repuestos`.
- **Consolidación:** que correr dos veces el mismo período dé el mismo resultado, y que no
  toque períodos cerrados.
- **Paginación:** un período con más de 1.000 filas debe leerse completo (regresión del
  tope de PostgREST).
- **Carga del archivo:** mismo contenido en CSV y en `.xlsx` debe producir el mismo
  resultado; separador `;` y decimal `,`; celda vacía → 0 y contada en el reporte; vehículo
  inexistente → fila rechazada sin abortar el resto; período cerrado → archivo rechazado
  entero; cargar dos veces el mismo período no duplica ni toca la parte de GEMA.
- **Cotejo funcional:** los KPIs de tres meses deben coincidir con los del aplicativo de
  Lovable antes de dar la fase 7 por cerrada.

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Se asume que GEMA basta y se omiten los 6 rubros contables | Utilidad y rentabilidad equivocadas en todo el módulo | Sección 3.5; `origen_contable = 'sin_dato'` marca la fila como incompleta y la pantalla lo advierte |
| Subconteo del espejo por llave repetida | Cifras financieras por debajo de GEMA | Fase 1 lo mide antes de construir encima |
| La re-sincronización de 45 días mueve un mes ya reportado | Un informe entregado deja de cuadrar | Cierre de período (6.4) |
| Se toma `liquido` como utilidad | Cifra incorrecta: no es reproducible (3.6.3) | Prohibido en el motor; queda escrito |
| Las 1.427 líneas de `ComparacionPeriodosTab` se portan tal cual | Deuda técnica importada | Se reescribe sobre el motor y los componentes de Gestivo, no se copia |
| Migración numerada a mano | Colisión y rechazo del verificador | `npm run migracion:nueva` (`AGENTS.md`) |
| **El espejo descarta columnas que GEMA sí devuelve** | Se pide por archivo un dato que ya estaba disponible, y se carga a mano para siempre | Sección 3.5.1: el script lista las columnas sin mapear. Aplica a `DESPACHO` y a cualquier otra |
| Se toma `cartu_admon` como `ADMON` por descuido | ~426 M al mes de más en los gastos: la utilidad se hunde | Decidido en el acta y escrito en 3.2 y 3.4; el motor no debe leer `cartu_admon` |
| El archivo contable se carga contra un período ya cerrado | Descuadre entre lo reportado y lo que muestra la pantalla | Validación de período cerrado en la carga (6.6) |

---

## 14. Consideraciones que la homologación deja abiertas para la migración y la puesta en marcha

Lo que sigue son las definiciones que **todavía faltan** para que la migración quede bien
especificada y el módulo arranque sin sorpresas. Salen de la propia homologación: cada una
es una consecuencia de comparar el modelo del Excel con el espejo de GEMA. Están agrupadas
por el momento en que hay que resolverlas y marcadas con quién decide.

### 14.A Definición financiera — qué modelo reproduce el módulo

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| ~~1~~ | ~~`TIM.` = `timbradas` o `timbradas_cu`~~ | Marzo 2026: 875.411 vs 821.569,45 — 6 % de diferencia | **RESUELTA 2026-09-18: `timbradas`.** `timbradas_cu` no entra en el módulo. El cotejo de un mes solo la confirma |
| ~~2~~ | ~~Conceptos de GEMA que el Excel no contempla~~ (`fet`, `valor_camb`, `incentivo_c`, `descuento`, `factor_calidad`, `anticipo`, `factura`, `valor_descuentos`) | Marzo 2026: `fet` 175.082.221 (6 % del bruto), `valor_camb` 17.464.449, `incentivo_c` 8.862.000 | **RESUELTA 2026-09-18: el modelo arranca de `bruto` = Ingresos y la utilidad resta solo las 15 partidas del Excel.** Las demás deducciones de GEMA **no entran** en la utilidad; el módulo las muestra como conceptos informativos («no incluidos en la utilidad») con su monto por mes, sin afectar ningún indicador |
| ~~3~~ | ~~`SITRA` siempre 0~~ | 0 en los 21 meses | **RESUELTA 2026-09-18: se homologa a `sitra` de GEMA.** El concepto ya no se cobra; la columna se conserva por paridad con el Excel y hoy siempre vale 0 |
| ~~4~~ | ~~Redondeo y tolerancia de cotejo~~ | GEMA liquida con 2 decimales (`admon` 20.827,7); el Excel trae enteros | **RESUELTA 2026-09-18.** Guardar con 2 decimales tal como llega de GEMA; **mostrar y exportar (Excel/PDF) en pesos enteros**, rentabilidad con 2 decimales; cotejo con tolerancia **±1 COP por partida y vehículo-mes** y ±0,01 puntos en rentabilidad |

### 14.B Reglas de consolidación día → mes

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| ~~5~~ | ~~Atributos que cambian dentro del mes~~ | Marzo 2026: ningún vehículo cambió de placa, dueño ni tipo dentro del mes (máximo 1 valor distinto en los 137) | **RESUELTA 2026-09-18: el propietario se conserva tal como venía en el movimiento, para guardar la integridad del dato.** No se colapsa a un dueño por mes: si un bus tuvo dos propietarios en el mes, el consolidado tiene **dos filas**, cada una con la producción y los rubros de GEMA de sus días. La llave del consolidado pasa a ser **(periodo, codigo_vehiculo, cedula_propietario)** — ver 6.1. `tipo_propietario` sigue al dueño. `placa`: la del último día de la fila, con marca si cambió |
| ~~5-bis~~ | ~~Reparto de los rubros contables cuando hay dos dueños en el mes~~ | Caso raro (0 en marzo 2026) | **RESUELTA 2026-09-18: no hay nada que repartir.** Los rubros contables (`despacho`, `intereses`, `otros_gastos`, `repuestos`, `mano_de_obra`, `desc_fondo_conductor`) **son del vehículo, no del dueño**: se guardan por **vehículo-mes** en una tabla aparte (6.1-b) y no se tocan por que haya dos propietarios en la operativa. Los indicadores se calculan al nivel del vehículo-mes; el propietario es una dimensión de la producción, no del costo contable |
| 6 | **Universo de vehículos.** | OBSERVADO: 0 filas con `codigo_vehiculo = ''` en los 21 meses. `vehiculos` tiene 202 filas y solo 151 con `estado = 1` | **RESUELTA en parte 2026-09-18: los retirados entran** al consolidado y a los indicadores históricos; la consolidación **nunca filtra por `estado`**; la pantalla ofrece «solo activos» como filtro opcional. Códigos normalizados sin ceros a la izquierda antes de cruzar. **Queda 6-bis** |
| ~~6-bis~~ | ~~Vehículo del archivo contable que no existe~~ | — | **RESUELTA 2026-09-18: el valor real es el que muestra `ingreso_tercero`.** El archivo contable se valida contra la **operativa del mismo período** (`financiera_operativo_mes`, derivada de `ingreso_tercero`), no contra el maestro `vehiculos`. Un bus existe en un mes si tuvo movimiento en GEMA ese mes; si no, la fila **se rechaza y se reporta** y el resto del archivo entra. Cubre a los retirados sin excepciones y evita costos colgados de un bus que no rodó |
| ~~7~~ | ~~Cuándo un mes es cerrable~~ | GEMA cierra con días de atraso y el sync re-sincroniza 45 días | **RESUELTA 2026-09-18: el cierre lo marca la fecha de cierre de GEMA, no el calendario.** Un mes queda cerrado **automáticamente** cuando `gema_sync_state.last_synced_date` de `ingreso_tercero` es ≥ el último día del mes: ahí el cron deja de recalcularlo y el **acumulado al corte parte de esa fecha**. No hay botón de cerrar ni rol que cierre. Reabrir es acción del administrador, con motivo, y queda en la bitácora; el cron vuelve a recalcular ese mes hasta que GEMA lo cierre otra vez. Ver 6.4 |
| ~~8~~ | ~~Orden y forma del cron~~ | `/api/cron/sync-gema` corre a las 03:00. El ingreso de tercero **es el cierre del día** de GEMA: llega diario | **RESUELTA 2026-09-18: consolidación diaria a las 04:00**, solo sobre los meses abiertos, más botón «Consolidar ahora» en `/financiera/flota/datos`. Implementada como **función SQL** `financiera_consolidar_periodo(p_periodo)` (una sentencia `INSERT … SELECT … GROUP BY … ON CONFLICT`), no como bucle en TypeScript. Los 21 meses del arranque son ~90.000 filas: segundos. Financiera nunca muestra el día en curso: ve lo que el sync trajo a las 03:00 |

### 14.C Histórico y paridad con el aplicativo actual

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| ~~9~~ | ~~Meses anteriores a 2025-01~~ | — | **RESUELTA 2026-09-18: el aplicativo arranca en 2025**, igual que el espejo. **Todo el histórico operativo ya está en `ingreso_tercero`**; no hace falta importador de 26 columnas ni `origen = 'archivo'` en la operativa. Del aplicativo solo se traen los **6 rubros contables** de cada vehículo-mes, con el mismo formato de 8 columnas de la 6.6. Resuelve también la 11.6 |
| ~~10~~ | ~~Propietarios por nombre vs por cédula~~ | `PROPIETARIO` es texto libre en el Excel; `cedula_propietario` en el espejo | **Se disuelve con el 9.** Como ninguna fila operativa viene del Excel, el propietario siempre llega de GEMA **con cédula**: no hay nombres libres que conciliar ni tabla de alias. El filtro en cascada muestra `cedula — nombre` desde el espejo. El nombre del Excel solo se usa en el cotejo de paridad, como texto de referencia |
| 11 | **Umbrales de semáforo.** Estaban quemados en el código de Lovable, no en su base | **OBSERVADO y extraídos** de `src/lib/fleetUtils.ts` (`getRentabilidadStatus`, `getGastoTimbradaStatus`, `getProductividadStatus`): **Rentabilidad** 🟢 ≥ 15 % · 🟡 5 %–14,9 % · 🔴 < 5 %. **Gasto por timbrada** 🟢 ≤ 2.500 · 🟡 2.501–3.200 · 🔴 > 3.200 COP. **Productividad** (viajes por vehículo-mes) 🟢 ≥ 90 · 🟡 80–89 · 🔴 < 80 | **Reevaluados con datos reales el 2026-09-18 (6.3.1).** Productividad: el umbral 90/80 es **inalcanzable** — 0 de 20 meses en 🟢, flota en 77 viajes/bus-mes, 55 % de los buses en 🔴 — **POR CONFIRMAR el nuevo umbral** (85/70 o 80/65). Gasto por timbrada y rentabilidad: **se conservan para la paridad** y se recalibran en la Fase 7 con el histórico contable cargado; evaluar expresar el gasto por timbrada como % del ingreso, porque el pasaje subió 10 % |
| 18 | **Tres vistas de rentabilidad.** El aplicativo permite ver la rentabilidad **Operativa (sin intereses)**, **Después de financiero** (con intereses, la histórica) o **Ambas**. El único rubro que se trata como financiero es `intereses`: `costosSinFinanciero = gastosOperativosTotales − intereses`. El selector aplica a Rentabilidad, Gasto/Timbrada y la tabla detallada | **OBSERVADO** en `fleetUtils.ts` (`RentabilidadView`, `costosPorVista`, `rentabilidadOperativa`, `rentabilidadFinanciera`) y `RentabilidadViewSelector.tsx`. No estaba documentado en `FUNCIONALIDADES.md` | **POR CONFIRMAR** si el módulo conserva las tres vistas (paridad, recomendado) o solo una. Nota: `intereses` viene del archivo contable, así que la vista operativa **no** es «solo GEMA»: incluye los otros cinco rubros del archivo |
| 12 | **Corrida en paralelo y criterios de aceptación.** Sin esto el apagado es un salto de fe | — | Negocio + plan. PROPUESTO: **3 meses cerrados** comparados vehículo a vehículo con la tolerancia del punto 4; se acepta si el 100 % de los vehículos-mes cuadra en utilidad neta y los KPIs de flota coinciden a 2 decimales. Las diferencias se documentan con causa antes de aceptar |

### 14.D Puesta en marcha y apagado

| # | Consideración | Evidencia | Quién decide |
|---|---|---|---|
| 13 | **Mapa de usuarios.** El aplicativo tiene 8 cuentas con roles propios; hay que decidir a qué tipo de usuario de Gestivo va cada una y crear los tipos que falten | OBSERVADO en `FUNCIONALIDADES.md` §2.4: 2 administradores, 3 editores, 3 visualizadores (una inactiva). Varias cuentas (contabilidad, subgerencia financiera, tesorería) quizá no existen hoy en Gestivo | Administrador de Gestivo. Equivalencia de roles en la sección 7 |
| 14 | **Consumidores de `fleet-api`.** Si alguien externo la usa, debe migrar a `/api/external/v1/financiera` antes del apagado | Verificable en `external_api_keys.request_count` y `last_used_at` del aplicativo | Administrador del aplicativo: exportar esa tabla en la fase 0 |
| 15 | **Apagado ordenado.** Hay dos despliegues (Lovable y el espejo en Vercel) y una URL en uso | OBSERVADO en `FUNCIONALIDADES.md` §1.1 y §13 | Plan: al aceptar la paralela, (a) exportación completa de `fleet_records` y `data_upload_audit` como respaldo en `exports/`, (b) el aplicativo pasa a solo lectura, (c) redirección o aviso en su URL, (d) baja del proyecto en Vercel y en Lovable. Nunca antes de la aceptación del punto 12 |
| 16 | **Corrección de la documentación de `ingreso_tercero`** con los hallazgos 3.6.1–3.6.3 y el rango real de fechas | OBSERVADO | Ya en la fase 6; aquí solo para que no se olvide en el cierre |
| 17 | **Jerarquía de nombres.** Módulo **Financiera**, opción **Gestión de flota** | Definido por el usuario 2026-09-18 | Aplicado en la sección 8 (rutas `/financiera/flota/…`) |

### 14.E Qué bloquea qué

- **Bloquean la Fase 2 (modelo y motor):** solo el `DESPACHO` de la 3.5.1 (1 a 5-bis ya
  están resueltos).
- **Bloquean la Fase 3 (consolidación):** ninguno (6, 6-bis, 7 y 8 ya están resueltos).
- **Bloquean la Fase 5 (pantallas):** 18 (si se conservan las tres vistas de rentabilidad).
- **Bloquean la Fase 7 (histórico y corte):** 12 (9, 10 y 11 ya están resueltos; el 11
  solo espera confirmación de que los valores siguen vigentes).
- **Bloquean el apagado:** 12, 13, 14, 15.
- **No bloquean nada:** 3, 16, 17.

---

_Plan redactado el 2026-09-18. Verificación de la sección 3 hecha sobre el commit `94c75e5`
del repositorio de origen y sobre los datos reales de `ingreso_tercero` en Gestivo. Sección 14
añadida el mismo día con tres verificaciones adicionales (timbradas vs timbradas CU, filas
sin vehículo, cambios de atributos dentro del mes)._
