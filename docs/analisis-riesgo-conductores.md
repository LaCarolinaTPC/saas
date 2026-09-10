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
| Retiro en 60 días | 0,817 (jun, jul) | 57,6 % de retiro real, 3,1× la base | 51 % de los retiros |
| Falta no justificada en 30 días | 0,759 (jul, ago) | 51,5 % de falta real, 2,7× la base | 46 % de las faltas |

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

Plantilla al corte: 191 conductores, sobre 1.190 observaciones conductor-mes. Riesgo de retiro: 12 alto,
62 medio. Riesgo de falta no justificada: 7 alto, 30 medio.

> Estas cifras son las de la corrida reproducible. Las primeras publicadas el 9 de septiembre (15 alto / 27
> medio aquí, 12 alto / 34 medio en el HTML) salieron de un script no determinista: las consultas paginaban sin
> `ORDER BY`, así que cada corrida leía las filas en otro orden, los promedios se sumaban distinto y los pesos
> entrenados cambiaban — 184 de 191 conductores se movían de probabilidad entre dos corridas seguidas con los
> mismos datos. Corregido el 2026-09-10 ordenando por `id`.

## El módulo Riesgo en Gestivo

`/riesgo` (hoja **Riesgo** dentro de Recursos Humanos) muestra, del último corte: las tarjetas de riesgo, la
calidad de los dos modelos y el detalle conductor por conductor — el mismo que traía el informe HTML, con
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
defender el listado si le preguntan de dónde sale. Los tres encabezan con el corte, la calidad del modelo y el
aviso de datos personales: un archivo descargado pierde el permiso del módulo, así que al menos debe decir de
cuándo es y que no se reenvía. Cada descarga queda en la auditoría con el formato y cuántas filas salieron.

## Limitaciones

- Nueve meses de histórico; los cortes de prueba son dos meses. El cron recalibra cada día, y la pantalla
  muestra el AUC del corte para que nadie lea el puntaje como un oráculo.
- El retiro sale del maestro y no distingue renuncia de despido ni de fin de contrato.
- Estado civil y nivel educativo están "sin definir" en la mitad del maestro: no entran al modelo.
- Es una lista de prioridad para RRHH, no un diagnóstico: sirve para conversar, revisar asignación o vehículo
  antes de que ocurra la novedad. El informe contiene datos personales; no se reenvía ni se sube a la wiki.
