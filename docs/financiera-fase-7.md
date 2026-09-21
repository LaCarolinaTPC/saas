# Financiera · Gestión de flota — Fase 7: histórico, cotejo y umbrales

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 10 y sección 9, fase 7.
**Sin migración.** Escribe en `financiera_contable_mes` a través del cargador de la fase 4.
**Código:** `src/lib/financiera/historico.ts` (puro, 15 pruebas) ·
`scripts/financiera-historico.mts` · `scripts/financiera-recalibrar-umbrales.mts`.

## Estado: histórico migrado el 2026-09-21

El administrador generó la llave de `fleet-api` y se migró el histórico. **19 de los 20 meses del
aplicativo están cargados**: 2.740 vehículo-mes en `financiera_contable_mes`, por 14.552 millones de
pesos de costo contable. Desde ese momento el módulo muestra utilidad y rentabilidad reales, no un techo.

| Rango | Filas | Carga |
|---|---|---|
| 2025-01 → 2026-03 | 2.135 de 2.154 | `bcc895b5-5d15-460d-8e5d-f582bf41accc` |
| 2026-05 → 2026-08 | 605 de 611 | `e279c8fb-e11c-4365-9009-7481c44c46af` |

**2026-04 quedó fuera a propósito:** ver «Lo que el cotejo encontró».

Los archivos generados están en `exports/` (fuera de git). Las dos cargas quedaron en la bitácora y se
pueden reversar por período desde la pantalla.

### Cómo se obtuvo el acceso

En el aplicativo, pestaña **🔌 API Externa** (visible para quien administra usuarios): el campo
«Dirección del servicio» y el botón **Generar llave**, que muestra la llave una sola vez. Las dos van
a `.env.local`, que está fuera de git:

```
FLOTA_API_URL=https://<proyecto>.supabase.co/functions/v1/fleet-api
FLOTA_API_KEY=<la llave generada>
```

La alternativa, si no se quiere emitir una llave, es exportar a Excel desde el aplicativo y pasar el
archivo con `--excel`.

## Cómo se usa

```bash
# 1. Traer y revisar. No escribe nada.
npm run financiera:historico -- --api --cotejar

# 2. Generar el archivo de 8 columnas para cargarlo desde la pantalla
npm run financiera:historico -- --api --csv exports/contable-historico.csv

# 3. O cargarlo directo, con rastro en la bitácora
npm run financiera:historico -- --api --cargar
```

También acepta `--excel <archivo>`, `--json <archivo>`, `--periodo-desde` y `--periodo-hasta`.

**Del aplicativo solo se traen los seis rubros contables** (decisión 15 del acta): la parte operativa
ya está en el espejo y se consolidó en la fase 3. Las otras veinte columnas sirven para el cotejo.

## El cotejo, que es la mitad del valor

`--cotejar` compara las **doce medidas que Gestivo obtiene de GEMA** (viajes, timbradas, ingresos y los
nueve rubros de cartulina y descuento) con las que tenía el aplicativo, vehículo a vehículo y mes a mes,
con la tolerancia del acta (±1 COP por partida, ±0,01 puntos en rentabilidad). Si esas doce cuadran, las
dos herramientas están mirando la misma operación y entonces sí tiene sentido comparar la utilidad.

La utilidad y la rentabilidad **solo se cotejan donde Gestivo ya tiene los rubros contables**. Antes de
cargarlos, el informe lo dice en vez de fingir que cuadran.

Al final imprime el **criterio de aceptación del punto 12**: tres meses o más, cero diferencias, cero
filas sueltas en cualquiera de las dos herramientas y la utilidad cotejada en todas. Mientras no se
cumpla, lista exactamente qué falta.

## Lo que el cotejo encontró

El cotejo sobre los 20 meses (2.910 filas del aplicativo) dio **2.545 vehículo-mes cuadrando**,
337 con alguna diferencia, 28 solo en el aplicativo y 19 solo en Gestivo. Las diferencias no están
repartidas: se concentran en cuatro meses y tienen una causa clara.

Midiendo por período la relación entre los **cargos fijos diarios** del aplicativo y los de Gestivo
(fondo, póliza y estudio, que se cobran por día y no dependen de la operación), se ve cuánto mes tiene
cargado cada uno:

| Período | Completitud del aplicativo | Qué pasó |
|---|---|---|
| 2025-01 → 2025-11, 2026-01 → 2026-03, 2026-05, 2026-08 | 100 % | Cuadran |
| 2025-12 | 99,5 % | Le falta parte de un día |
| 2026-06 | 99,1 % | Le falta un día |
| 2026-07 | 97,1 % | Le falta un día (30 de 31) |
| **2026-04** | **51,9 %** | **Le falta medio mes** |

En abril de 2026 el aplicativo tiene exactamente la mitad de todo: el vehículo 500 aparece con 40 viajes
frente a 77, fondo 7.000 frente a 14.000 y estudio 84.000 frente a 168.000. No es un error de Gestivo:
es que a ese mes le cargaron medio Excel. **Cargar su contable (325 M en vez de ~700 M) contra un mes
completo de ingresos habría inflado la utilidad de abril en unos 375 millones**, así que se excluyó.

Los meses al 97–99,5 % sí se cargaron: les falta un día de costo sobre veinte y pico, lo que desvía la
utilidad menos del 3 %, y la alternativa era dejar cuatro meses recientes sin ningún dato de costo.

**17 vehículo-mes quedaron sin contable** porque el aplicativo no los tenía y Gestivo sí. Catorce son
del **vehículo 972 (UYX584)**, que operó de 2025-01 a 2026-03 y nunca entró al aplicativo; los otros
tres son casos sueltos de 2026-06 y 2026-08. Representan 289 millones de ingresos sin costo conocido y
son la razón de que casi todos los meses figuren como «contable parcial» en vez de «completo».

## Verificación previa, con datos sintéticos

Antes de tener la llave se probó la herramienta con un volcado sintético armado desde el consolidado
real, con tres discrepancias metidas a propósito: las tres se reportaron y 455 de 457 vehículo-mes
cuadraron. Esa prueba sigue sirviendo como regresión (`work/fin-simular-volcado.mts`).

## Corrección: la flota sale del maestro, no del movimiento

**Migración `20260921165820_financiera_la_flota_sale_del_maestro_de_vehiculos_tipo_propietario_op.sql`
— pendiente de aplicar.**

El usuario advirtió que la clasificación AFILIADO / EMPRESA debía tomarse de
`vehiculos.tipo_propietario_op` y no de donde la estábamos tomando. Tenía razón, y los datos del
aplicativo lo confirman sin margen de duda. Sobre los 2.882 vehículo-mes que las dos herramientas
comparten, usando como referencia la columna `flota` del aplicativo:

| Campo | Coincide con el aplicativo |
|---|---|
| **`vehiculos.tipo_propietario_op`** | **2.877 · 99,8 %** |
| `ingreso_tercero.tipo_propietario` (lo que usábamos) | 2.104 · 73,0 % |
| `vehiculos.tipo_propietario` | 2.007 · 69,6 % |

En el maestro los dos campos difieren en 60 de los 202 buses: `tipo_propietario` dice 188 AFILIADO y
14 EMPRESA, mientras `tipo_propietario_op` dice 128 y 74. El bus 500 es EMPRESA en la operación y
AFILIADO en el otro campo; el aplicativo siempre lo mostró como EMPRESA. Con el origen viejo, la
flota propia aparecía como una quinta parte de lo que es.

Pero el maestro **solo guarda el estado de hoy**, y entre 2025 y 2026 cambiaron de propietario
**25 de los 167 buses** que han operado. Aplicar la clasificación de hoy a toda la historia
reclasificaría meses en los que el bus era de otra persona. De ahí el corte:

| Período | De dónde sale la flota |
|---|---|
| **Desde 2026-09** | `vehiculos.tipo_propietario_op`. Es el presente y el maestro lo tiene al día. |
| **Hasta 2026-08** | La columna `flota` del aplicativo, que es la clasificación que regía entonces. |

El corte vive en una sola función SQL, `financiera_flota_desde_maestro()`, que devuelve `2026-09`: el
mes siguiente al último que trae el aplicativo. Cambiarlo ahí cambia el comportamiento sin tocar nada más.

La migración `20260921165820` hace tres cosas y **no mueve ningún importe, solo reclasifica**:

1. Crea la función del corte.
2. La consolidación aplica el maestro solo desde el corte. En los meses anteriores el `ON CONFLICT`
   conserva a propósito lo guardado, para que forzar la re-consolidación de un mes viejo no borre su
   clasificación histórica.
3. Un `UPDATE` corrige únicamente los períodos desde el corte.

Los meses históricos los corrige el importador:

```bash
npm run financiera:historico -- --api --flota
```

Lee la columna `flota` del aplicativo, la compara con lo consolidado, muestra el reparto de cambios
antes de escribir y deja la operación en la bitácora. Si la migración no está aplicada, se detiene y
lo dice.

**Aplicado el 2026-09-21:** 784 vehículo-mes pasaron de AFILIADO a EMPRESA en los 20 meses del
histórico. Volver a correrlo no cambia nada, y la flota histórica queda coincidiendo al 100 % con la
del aplicativo. 20 vehículo-mes no tienen equivalente allí (el bus 972 y algunos sueltos) y conservan
la clasificación de GEMA. El reparto quedó así:

| Tramo | Vehículo-mes | AFILIADO | EMPRESA |
|---|---|---|---|
| Histórico, hasta 2026-08 | 2.901 | 62 % | 38 % |
| Desde 2026-09 | 152 | 55 % | 45 % |

Antes de la corrección la flota propia figuraba en torno al 10 %. Los ingresos y la utilidad totales
no se movieron ni un peso, que era la condición.

## Lo que destapa la flota bien clasificada: el costo de mantenimiento no es comparable

Con la clasificación corregida se puede leer la rentabilidad por flota, y a primera vista el resultado
es brutal: **26,13 % en los afiliados frente a 0,23 % en la flota propia** (histórico con archivo
contable). Antes de sacar conclusiones hay que mirar la estructura de costos, porque **no son
comparables**:

| Rubro, como % de los ingresos de su flota | AFILIADO | EMPRESA |
|---|---|---|
| Salario | 15,9 % | 16,0 % |
| Combustible | 20,9 % | 22,0 % |
| Despacho | 19,1 % | 18,5 % |
| Administración | 2,5 % | 2,5 % |
| **Repuestos netos** | **0,0 %** | **13,4 %** |
| **Mano de obra** | **0,0 %** | **11,1 %** |
| Intereses | 0,0 % | 1,9 % |

Todos los rubros operativos van parejos salvo los de mantenimiento: **al bus afiliado no se le registra
ni un peso de repuestos ni de mano de obra**, porque ese costo lo asume el propietario y nunca entra a
la contabilidad de la empresa. Son 24,5 puntos de diferencia, que explican casi toda la brecha de 25,9
puntos entre las dos rentabilidades.

La conclusión honesta no es «los afiliados rinden 26 % y los propios 0 %», sino que **la rentabilidad
del afiliado está medida sin su costo de mantenimiento**. Comparar las dos flotas por rentabilidad
induce a error, y conviene decidir si el módulo debe advertirlo donde se muestre esa comparación.


## Recalibración de umbrales

`npm run financiera:umbrales -- --desde 2025-01 --hasta 2026-08`, ya con el contable cargado, sobre
2.740 vehículo-mes. **Ahora los tres se pueden recalibrar.** Lo que aparece es que los umbrales
heredados están descuadrados en direcciones opuestas: productividad demasiado exigente, rentabilidad y
gasto por timbrada demasiado laxos.

**Rentabilidad.** Media ponderada real **14,70 %**, no el 44 % que se veía como techo. Mediana 20,62 %;
el P10 está en −12,55 %, es decir que uno de cada diez vehículo-mes pierde plata.

| Umbral | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| 15 / 5 (vigente) | 61 % | 14 % | 25 % |
| **26,6 / 12,0 (P70 / P35)** | **30 %** | **35 %** | **35 %** |

**Gasto por timbrada.** Real **2.629 COP** sobre un ingreso por timbrada de 3.082: el **85,3 %** del
ingreso se va en costo. (Solo GEMA era el 56 %; los seis rubros contables aportan los otros 29 puntos.)

| Umbral | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| 2.500 / 3.200 (vigente) | 51 % | 32 % | 18 % |
| **2.253 / 2.758 (P30 / P65)** | **30 %** | **35 %** | **35 %** |

Los dos valores propuestos equivalen al 73,1 % y al 89,5 % del ingreso por timbrada. Como el pasaje
sube y el umbral en pesos no, conviene decidir si se expresan como porcentaje (observación 6.3.1).

**Productividad.** Media 77,0 viajes por vehículo-mes, mediana 81.

| Umbral | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| 90 / 80 (vigente) | 15 % | 40 % | 45 % |
| 85 / 70 | 34 % | 46 % | 20 % |
| **85 / 77 (P70 / P35)** | **34 %** | **31 %** | **34 %** |

Los tres se cambian en Financiera › Parámetros y el valor anterior queda en la bitácora. **La decisión
es de Subgerencia Financiera.**

## Lo que aparece cuando se miran los costos reales

- **536 vehículo-mes en pérdida** (19,6 % de los que tienen contable), con **1.893 millones** de pérdida
  acumulada en los 19 meses.
- **23 vehículos acumulan 10 o más meses en pérdida.** Los peores: 543 (15 meses), 566 (14), 551 y 542
  (13 cada uno). Eso es lo que la pantalla de Vehículos en pérdida muestra ahora y no podía mostrar antes.

## Lo que falta para cerrar el módulo

1. **Decidir los tres umbrales** con Subgerencia Financiera y cambiarlos en Parámetros.
2. **Recuperar abril de 2026**: pedir a contabilidad el Excel completo del mes y cargarlo. Mientras
   tanto abril aparece sin costo y su utilidad se muestra como techo, que es lo correcto.
3. **Resolver el vehículo 972 (UYX584)**, 14 meses operando en GEMA sin costo en el aplicativo.
4. **Aceptar la paralela** (punto 12): el criterio pide tres meses cerrados cuadrando al 100 % en
   utilidad neta. Hoy no se cumple porque el cotejo mide contra la utilidad que el aplicativo tenía
   guardada, y esa se calculó con los meses incompletos. Con abril recuperado, los candidatos naturales
   son tres meses de 2025, que cuadran al 100 % en las doce medidas de GEMA.
4. **Antes del apagado** (puntos 13 a 15, todos de negocio, ninguno de código):
   - mapear las 8 cuentas del aplicativo a tipos de usuario de Gestivo;
   - revisar en `external_api_keys` del aplicativo si alguien externo consume `fleet-api`;
   - respaldar `fleet_records` y `data_upload_audit` en `exports/`, dejar el aplicativo en solo lectura,
     avisar en su URL y dar de baja el proyecto.

La verificación de `DESPACHO` (fase 0) sigue esperando las credenciales de GEMA. Si apareciera en GEMA,
el rubro saldría del archivo contable y habría que rehacer el volcado con cinco columnas en vez de seis.
