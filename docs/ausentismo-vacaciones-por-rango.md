# Ausentismo · vacaciones que se presentan todos los días del periodo

**2026-09-17** · migración `20260917184357_ausentismo_conceptos_que_cubren_un_rango_de_dias.sql`

## Qué problema resuelve

En `Recursos Humanos · Ausentismo · Registro del día` cada fila era un conductor ausente **un día**:
la pantalla buscaba con `fecha = <día>`. La fila ya guardaba `fecha_inicio` y `fecha_fin` desde
`20260902162916`, pero nadie los leía.

Con vacaciones eso no servía. RRHH las diligencia una sola vez ("del 20/09 al 05/10") y el conductor
solo aparecía como ausente el 20/09. Los otros quince días quedaban en blanco, o alguien lo volvía a
registrar como novedad nueva cada mañana.

## La regla

La bandera está en el concepto, no en la palabra "vacaciones": `ausentismo_conceptos.cubre_rango`,
al lado de `cuenta_reincidencia` y `exige_soporte`. Hoy está encendida solo en **Vacaciones**; si
mañana Descanso, Licencia o Suspensión deben comportarse igual, se enciende en la base sin otra
migración ni despliegue.

Un concepto con `cubre_rango`:

- **exige fecha de terminación** — es la que presenta al ausente cada día;
- **fija `fecha = fecha_inicio`** — el día operativo lo manda el inicio del periodo, y el campo Fecha
  del formulario queda en solo lectura;
- **se presenta todos los días** entre inicio y terminación, con una sola fila;
- **impide volver a registrar** al conductor dentro del periodo.

### El invariante

`fecha ∈ [fecha_inicio, fecha_fin]`. Sin él, unas vacaciones digitadas con antelación desaparecerían
de la pantalla el día en que se digitaron (queda fuera de su propio rango) sin aparecer todavía en el
periodo. Lo fuerza `validar()` en las acciones del módulo y la migración lo dejó así en lo ya
registrado.

### Cruces

- **Mismo concepto sobre fechas que se cruzan**: se rechaza siempre. Ya existe ese periodo; lo que
  hay que hacer es editarlo.
- **Concepto distinto** (se incapacitó estando de vacaciones, renunció): se avisa y se guarda si el
  usuario confirma. Es el patrón `requiereConfirmacion` / `forzarCruce`, hermano del que usa la
  Matriz EPS con los solapes de incapacidades.

El formulario avisa antes de guardar: en cuanto hay conductor y fechas consulta
`periodosDelConductor()` y muestra los periodos que estorban.

## Dónde vive

| Pieza | Archivo |
|---|---|
| Reglas puras (cubrir día, posición en el periodo, cruces) | `src/lib/ausentismo/periodos.ts` |
| Pruebas de esas reglas (`npm run test:ausentismo`) | `src/lib/ausentismo/periodos.test.ts` |
| Lista del día y del historial | `src/lib/ausentismo/data.ts` |
| Validación, cruces y confirmación | `src/app/(dashboard)/ausentismo/actions.ts` |
| Formulario, avisos y distintivos | `src/app/(dashboard)/ausentismo/ausentismo-client.tsx` |

La consulta del día pasó de `fecha = D` a la unión `fecha = D` **o** (concepto periódico **y**
`fecha_inicio <= D <= fecha_fin`). El historial hace lo mismo contra el rango filtrado: unas
vacaciones del 20/09 al 05/10 salen al consultar del 25 al 30 de septiembre.

## Lo que NO cambió

- **Reincidentes**: vacaciones ya traía `cuenta_reincidencia = false`, así que expandir el periodo no
  mueve conteos ni alertas. Las rachas de días no justificados seguían recorriendo el rango desde
  antes (`diasCubiertos()`).
- **Conceptos sin la bandera**: se siguen viendo solo en su día, aunque traigan fecha fin.
- **Exportaciones del día y del historial**: reciben las mismas filas que la pantalla, y ya traían
  columna "Periodo".

## Al contar desde fuera (MCP, SQL, informes)

Una fila de vacaciones vale por todo el periodo. **Contar filas no es contar días**: quien sume
filas subestima los ausentes. Los días de una fila son `fecha_fin − fecha_inicio + 1`. Para saber
quién estuvo ausente un día concreto hay que sumar a `fecha = <día>` las filas de conceptos con
`cubre_rango` cuyo rango lo incluya. Está documentado en el catálogo MCP
(`src/lib/mcp/catalogo/ausentismo-diario.ts`).
