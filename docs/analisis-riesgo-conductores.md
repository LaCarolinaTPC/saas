# Análisis predictivo de riesgo por conductor (retiro y falta no justificada)

La lógica vive en `src/lib/riesgo/` y la comparten tres consumidores: el módulo **Riesgo** de Gestivo (la vía
de consulta habitual), el cron diario `/api/cron/riesgo-conductores` que persiste cada corte, y este script.

`scripts/analisis-riesgo-conductores.mts` · `npm run riesgo:conductores [-- --corte AAAA-MM-DD --salida <carpeta>]`

Primera corrida: 2026-09-09, con el histórico de ausentes enero–agosto recién migrado a `ausentismo_registros`.
Salida (nominal, fuera del repo): `exports/analisis-predictivo-ausentismo-conductores-<corte>.html` y
`exports/riesgo-conductores-<corte>.csv` en el vault. **Para consultar el análisis no hace falta generar nada:
está en Gestivo, con permiso de módulo y rastro de quién lo miró.**

## Qué predice

| Resultado | Definición | Horizonte | Tasa base (2026) |
|---|---|---|---|
| `retiro60` | `conductores.fecha_retiro` cae en los 60 días siguientes al corte | 60 días | 18,4 % por conductor-mes |
| `novedad30` | Falta no justificada registrada (incluye "sin contacto") en los 30 días siguientes | 30 días | 19,0 % |

Los viajes perdidos por "ausencia conductor" se descartaron como resultado: los tiene el 66 % de los conductores
cada mes y no discriminan. Entran como variable explicativa.

## Cómo funciona

1. **Panel conductor × mes.** Un corte el primer día de cada mes (marzo a septiembre de 2026). Entra el conductor
   en plantilla (ingresó antes del corte y no se había retirado) con alguna huella operativa en los 90 días previos
   o marcado ACTIVO. Retiros con fecha futura se tratan como errores del maestro.
2. **Variables a la fecha de corte** (ventanas de 30 y 90 días hacia atrás): antigüedad, edad, tipo de conductor
   (relevo/fijo, afiliado/empresa), hijos; ausencias por concepto, no justificadas, soportes pendientes,
   reincidencia; días de incapacidad EPS (matriz); viajes perdidos por causa del conductor; días con cierre,
   viajes y bruto por día, caída de viajes frente a los 60 días previos.
3. **Regresión logística** propia (descenso de gradiente, L2), variables estandarizadas. Evaluación con corte
   temporal: entrena en los meses viejos y prueba en los dos más recientes evaluables.
4. **Puntuación de hoy** para los conductores en plantilla, con los tres factores que más pesan en cada uno.
   Riesgo alto = probabilidad ≥ 3× la base; medio = entre 1,5× y 3×.

## Resultados de la primera corrida (corte 2026-09-09)

| Modelo | AUC (meses de prueba) | Top 10 % | Top 20 % captura |
|---|---|---|---|
| Retiro en 60 días | 0,804 (jun, jul) | 60,0 % de retiro real, 2,9× la base | 49 % de los retiros |
| Falta no justificada en 30 días | 0,729 (jul, ago) | 60,0 % de falta real, 2,8× la base | 43 % de las faltas |

Hallazgos principales:

- **Antigüedad** es el primer factor: 35 % de retiro en 60 días con menos de 3 meses, 28 % de 3 a 6 meses,
  9 % de 6 a 12 meses, 3 % con más de 3 años.
- **Faltas no justificadas** anticipan el retiro: 11 % sin faltas en 90 días frente a 38 % con 3 o más.
- **Viajes perdidos por el conductor**: más de 10 en 90 días → 20 % de retiro frente a 6 % sin viajes perdidos.
- **La falta no justificada se repite**: una en el último mes lleva la probabilidad de otra de 12 % a 33 %; con
  3 o más, 60 %. Los reincidentes (3+ ausencias en 30 días) tienen 27 % frente a 11 % del resto.
- Pesos con signo esperable: menos de 6 meses (+), antigüedad (−), permisos y no justificadas (+), afiliado (+).
  "Vehículo en taller" y "sin ningún cierre en 30 días" salen protectores: quien está en taller o sin cierres
  no está operando, y eso reduce tanto retiros contados como faltas registradas ese mes.

Conductores evaluados al corte: 172, sobre 1.067 observaciones conductor-mes. Riesgo de retiro: 5 alto,
57 medio. Riesgo de falta no justificada: 6 alto, 19 medio.

> Cifras del 2026-09-10 con el maestro ya depurado (ver más abajo). Sin depurar eran AUC 0,817 y 0,759 sobre
> 191 conductores; la caída del AUC viene de haber quitado negativos fáciles, no de un modelo peor.
> Estas cifras son las de la corrida reproducible. Las primeras publicadas el 9 de septiembre (15 alto / 27
> medio aquí, 12 alto / 34 medio en el HTML) salieron de un script no determinista: las consultas paginaban sin
> `ORDER BY`, así que cada corrida leía las filas en otro orden, los promedios se sumaban distinto y los pesos
> entrenados cambiaban — 184 de 191 conductores se movían de probabilidad entre dos corridas seguidas con los
> mismos datos. Corregido el 2026-09-10 ordenando por `id`.

## El módulo Riesgo en Gestivo

`/riesgo` (hoja **Riesgo** dentro de Recursos Humanos) muestra, del último corte: las tarjetas de riesgo, la
calidad de los dos modelos, los tres gráficos del informe (`src/components/graficos/graficos-riesgo.tsx`, con
Recharts: pesos de cada modelo como barras divergentes desde cero, tasa de retiro por mes, y las nueve tablas de
tasas por tramo) y el detalle conductor por conductor — el mismo que traía el informe HTML, con
nombre, código, cédula, probabilidad, nivel, los tres factores que le pesan y sus ausencias, no justificadas,
viajes perdidos y antigüedad. Se alterna entre riesgo de retiro y falta no justificada (la tabla se reordena por
el objetivo elegido), se filtra por nivel y se busca por nombre, cédula o código. Un selector permite consultar
cortes anteriores. No calcula nada: lee lo que dejó la corrida.

| Pieza | Dónde |
|---|---|
| Pantalla | `src/app/(dashboard)/riesgo/` (page, client y la acción de recalcular) |
| Lectura y escritura de corridas | `src/lib/riesgo/persistir.ts` |
| Cron diario, 9:00 (tras el de GEMA) | `src/app/api/cron/riesgo-conductores/route.ts` · `vercel.json` |
| Tablas | `riesgo_corridas` (una fila por corrida, con métricas y pesos) y `riesgo_conductores` (puntaje y variables por conductor) |
| Migración | `supabase/migrations/20260910155217_modulo_de_riesgo_predictivo_de_conductores.sql` |

Decisiones que conviene no deshacer sin pensarlo:

- **Se guardan todas las corridas**, no solo la última. Es lo que permite volver a un corte y, con el tiempo,
  comprobar si el modelo acertó comparando el puntaje de entonces con lo que pasó después.
- **Las tablas no conceden `SELECT` a `authenticated`**, a diferencia de otras tablas de resultados como
  `pv_deltas`. Llevan nombre, cédula, salud, familia e ingreso: un usuario con sesión podría leerlas por
  PostgREST saltándose el permiso del módulo. Todo pasa por el servidor.
- **Cada consulta y cada recálculo quedan en la auditoría** (`tesoreria_audit_log`, módulo `riesgo`, visible en
  Tesorería › Auditoría). Saber quién miró los datos personales es la mitad de la razón para haber traído el
  informe dentro de la aplicación en vez de seguir repartiéndolo por correo.
- **El módulo se concede a `admin` y `rrhh`**; las subgerencias y Psicología se habilitan desde
  Configuración → Usuarios, sin tocar código.

La primera entrega salió agregada, sin nombres; el detalle por conductor y las descargas se añadieron el mismo
día a pedido del usuario. Los datos ya estaban guardados, así que fue pintar pantalla.

Las descargas (`src/lib/riesgo/exportar.ts`, con `BotonesExportar`) se generan en el navegador con las filas ya
cargadas, como en Reincidentes y en el tablero de Operativo: no hay ruta de servidor que volver a autorizar.
CSV y PDF llevan lo que se ve, con los filtros aplicados; el Excel añade tres hojas más — métricas y pesos de
los dos modelos, las tasas por tramo y las notas de lectura — porque es el formato con el que alguien va a
defender el listado si le preguntan de dónde sale.

El **PDF** (`src/lib/riesgo/riesgo-pdf.ts`) trae los mismos gráficos que el informe HTML: los pesos de cada
modelo, la tasa de retiro por mes y las nueve tablas de tasas por tramo, antes de la tabla de conductores. Se
dibujan con primitivas de jsPDF a partir de los agregados que ya guardó la corrida, como en los indicadores de
Ausentismo: salen en vector, nítidos al imprimir, y no dependen de que Chart.js cargue desde un CDN — que es lo
que hacía frágil al HTML. Dos diferencias deliberadas con él: los pesos van como barras divergentes desde una
línea de cero, para que el signo se lea sin depender del color; y el gráfico de retiros por mes, que en el HTML
tenía doble escala (barras de retiros y línea de tasa), muestra solo la tasa, con el conteo como etiqueta —
las reglas de visualización del proyecto prohíben la doble escala. El Excel no lleva gráficos: la librería
`xlsx` no los crea, y los datos que los alimentan están en sus hojas. Los tres encabezan con el corte, la calidad del modelo y el
aviso de datos personales: un archivo descargado pierde el permiso del módulo, así que al menos debe decir de
cuándo es y que no se reenvía. Cada descarga queda en la auditoría con el formato y cuántas filas salieron.

## Depuración del maestro

El maestro de conductores no sirve tal cual para un ranking nominal. La revisión del 2026-09-10 encontró tres
clases de filas que no son conductores evaluables, y las tres se descartan en `leerFuentes`
(`src/lib/riesgo/datos.ts`) **antes de armar el panel**, así que no entran al entrenamiento ni al listado.

**1. El comodín (3 filas).** Cédula **99999999**, código 10735, «NO DEFINIDO NO DEFINIDO NO DEFINIDO NO
DEFINIDO», activa desde 2019: es donde GEMA imputa lo que no tiene conductor asignado, y acumula **2.735 viajes
perdidos, el 9,6 % de todos**. Salía tercero en el ranking con 770 viajes perdidos en 30 días. Peor: entraba al
entrenamiento, y un valor así infla la media y la desviación de esas variables, comprimiendo al estandarizar los
puntajes de los conductores de verdad. `esComodin` descarta cédula vacía o fuera de 6-10 dígitos, cédula de un
solo dígito repetido, y nombres de relleno. El rango 6-10 es el de una cédula colombiana; el umbral bajo es 6 y
no 8 porque en el maestro hay 156 cédulas legítimas de 7 dígitos.

**2. Fichas sin código de conductor (18 filas).** Sin código no hay despacho posible en GEMA, y los datos lo
confirman: de las 19 fichas sin código, **ninguna tiene un solo cierre**; dos tienen una o dos ausencias y nada
más. Les falta también el tipo de conductor y la fecha de nacimiento. Son altas administrativas o conductores
pendientes de habilitar, y aparecían en el listado con nombre y cédula como si se les hubiera evaluado, cuando
todas sus variables de actividad eran cero y el puntaje salía solo de la antigüedad.

**3. Duplicadas por código (1 fila).** Un código no puede identificar a dos conductores. Había dos casos, y en
los dos era la misma persona con la cédula mal digitada en una de las fichas: código 10810 con `722593541`
(0 cierres) y `72259354` (244 cierres, 42 viajes perdidos, 33 ausencias); código 10757 con `10457427221`
(11 dígitos) y `1045742722`. Se conserva la ficha que tiene la operación; si ninguna la tiene, la de cédula más
corta, porque la larga es la que lleva el dígito de más.

Efecto en las métricas: el panel baja de 1.183 a 1.067 observaciones y los conductores puntuados de 191 a 172, y
el **AUC de retiro baja de 0,827 a 0,804**. No es que el modelo empeore: las filas que salieron eran negativos
fáciles — gente sin actividad que no se retira — y quitarlos sube la tasa base de 18,5 % a 20,5 % y hace la
población más difícil. Lo que importa operativamente se mantiene: el decil superior acierta el 60 % y es 2,9
veces la tasa base.

### Errores del maestro que hay que corregir en GEMA

No se arreglan en el análisis porque son datos de origen que también afectan a nómina y a operación:

| Qué | Quién |
|---|---|
| Fecha de nacimiento imposible (13 años al corte) | NEIRA AGUILAR ARMANDO, código 2703, CC 72132190, nac 2013-05-17 |
| Sin fecha de nacimiento | BORREGO SALCEDO FABIO ENRIQUE, código 10755, CC 19616936 |
| Cédula con un dígito de más, ficha duplicada | RANGEL SERGIO ANDRES (código 10810) y BERMUDEZ BARRIOS MIGUEL ANGEL (código 10757) |
| 18 fichas sin código, tipo ni fecha de nacimiento | altas de 2025-02 a 2026-08; ver la corrida, que informa cuántas omitió |

Mientras la fecha de nacimiento falte o sea imposible, `variables()` deja la edad en **0**, que el modelo lee
como un valor real y no como un dato ausente. Con 2 casos de 172 el efecto es marginal, pero si la lista crece
conviene imputar la mediana en vez de cero.

## La sincronización de GEMA y las corridas

`viajes_perdidos` y `cierres_diarios` se reescriben por ventanas cuando corre la sincronización, y una corrida
que lea en ese momento entrena con datos a medias sin que nada lo delate. Pasó el 2026-09-10: una corrida vio
**22.802 viajes perdidos de los 28.549** que había — el 20 % de la variable más pesada, ausente — y publicó
AUC 0,808, una cifra perfectamente plausible. Desde entonces `leerFuentes` recuenta las dos tablas al terminar
de leerlas y **falla** si cambiaron, en vez de guardar una corrida silenciosamente mala. El cron está a las 9:00
justo para no cruzarse con el de GEMA de las 8:00, pero un «Recalcular» a mano puede caer en cualquier momento.

## Limitaciones

- Nueve meses de histórico; los cortes de prueba son dos meses. El cron recalibra cada día, y la pantalla
  muestra el AUC del corte para que nadie lea el puntaje como un oráculo.
- El retiro sale del maestro y no distingue renuncia de despido ni de fin de contrato.
- Estado civil y nivel educativo están "sin definir" en la mitad del maestro: no entran al modelo.
- Es una lista de prioridad para RRHH, no un diagnóstico: sirve para conversar, revisar asignación o vehículo
  antes de que ocurra la novedad. El informe contiene datos personales; no se reenvía ni se sube a la wiki.
