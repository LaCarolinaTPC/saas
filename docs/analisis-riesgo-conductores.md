# Análisis predictivo de riesgo por conductor (retiro y falta no justificada)

`scripts/analisis-riesgo-conductores.mts` · `npm run riesgo:conductores [-- --corte AAAA-MM-DD --salida <carpeta>]`

Primera corrida: 2026-09-09, con el histórico de ausentes enero–agosto recién migrado a `ausentismo_registros`.
Salida (nominal, fuera del repo): `exports/analisis-predictivo-ausentismo-conductores-<corte>.html` y
`exports/riesgo-conductores-<corte>.csv` en el vault.

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
| Retiro en 60 días | 0,818 (jun, jul) | 54,5 % de retiro real, 3,0× la base | 51 % de los retiros |
| Falta no justificada en 30 días | 0,759 (jul, ago) | 51,5 % de falta real, 2,7× la base | 48 % de las faltas |

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

Plantilla al corte: 191 conductores. Riesgo de retiro: 15 alto, 61 medio. Riesgo de falta no justificada:
7 alto, 27 medio.

## Limitaciones

- Nueve meses de histórico; los cortes de prueba son dos meses. Recalibrar cada mes con la corrida.
- El retiro sale del maestro y no distingue renuncia de despido ni de fin de contrato.
- Estado civil y nivel educativo están "sin definir" en la mitad del maestro: no entran al modelo.
- Es una lista de prioridad para RRHH, no un diagnóstico: sirve para conversar, revisar asignación o vehículo
  antes de que ocurra la novedad. El informe contiene datos personales; no se reenvía ni se sube a la wiki.
