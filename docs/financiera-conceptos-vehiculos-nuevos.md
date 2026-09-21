# Financiera · Combustible y póliza de vehículos nuevos

**Fecha:** 2026-09-21 · **Migración:** `20260921202204_financiera_conceptos_contables_de_combustible_y_poliza_de_vehiculos_nuevos.sql`

## El problema

La auditoría campo por campo contra el aplicativo de Lovable (`docs/financiera-fase-7.md`) dejó
50 diferencias sin explicar sobre 2.301 vehículo-mes de meses completos:

| Rubro | Casos | Meses | Valor |
|---|---|---|---|
| combustible | 47 | 7 (2025-06 a 08 y 2026-05 a 08) | $ 101.176.280 |
| póliza | 3 | 1 (2026-04) | $ 2.745.624 |

Las 26 diferencias de utilidad de los meses completos eran exactamente esas mismas filas: no había
ningún error de cálculo. Los buses afectados son 1022, 1029, 1038, 1055, 1056 y 1057, todos nuevos
desde 2026-04, más el 10000, retirado.

El usuario confirmó el origen: **esas cifras se escribían a mano en el reporte del aplicativo**,
dentro de las mismas columnas que alimenta GEMA. Son buses nuevos cuyo combustible y cuya póliza
GEMA todavía no factura al vehículo.

## La decisión

No se toca lo que viene de GEMA ni se «parchan» sus columnas. Los dos gastos entran como **dos
conceptos contables propios**, que se cargan por el mismo archivo que los otros seis y cuentan como
**costo operativo**, igual que el combustible y la póliza de GEMA.

Así queda trazable de dónde salió cada peso: `combustible` es lo que reporta GEMA y
`combustible_vehiculos_nuevos` es lo que puso contabilidad. El total de un bus es la suma de los dos.

## Qué cambió

**Base de datos.** `financiera_contable_mes` tiene dos columnas nuevas,
`combustible_vehiculos_nuevos` y `poliza_vehiculos_nuevos`, `NUMERIC(16,2) NOT NULL DEFAULT 0`.
`vw_financiera_consolidado` las expone al final y las suma dentro de `gastos_contables`, así que
entran en gastos operativos totales, utilidad neta, rentabilidad y gasto por timbrada sin que
ninguna fórmula cambie de forma. No son financieras: la vista operativa, que excluye intereses,
sí las resta.

**Archivo contable.** Pasa de ocho a diez columnas, pero las dos nuevas son **opcionales**: un
archivo con las ocho de siempre se sigue cargando igual y las nuevas quedan en 0. Una columna
ausente no cuenta como celda vacía.

**Comprobación de doble conteo.** Al previsualizar, si una fila trae valor en un concepto de
vehículos nuevos y GEMA ya reporta ese mismo rubro para ese vehículo en ese mes, la pantalla lo
avisa en ámbar. **No bloquea la carga**: hay meses en los que el bus empieza a facturar por GEMA a
mitad de período y las dos cifras conviven. La decisión es de contabilidad; el sistema solo evita
que pase inadvertido.

## Cargar el histórico

```bash
# Ver qué se va a cargar, sin escribir nada
npm run financiera:historico -- --api --nuevos

# Escribirlo a un archivo para revisarlo en Excel
npm run financiera:historico -- --api --nuevos-csv exports/vehiculos-nuevos.csv

# Cargarlo
npm run financiera:historico -- --api --nuevos-cargar
```

El valor de cada concepto es la diferencia entre lo que tenía el aplicativo y lo que reporta GEMA,
vehículo-mes por vehículo-mes. Una diferencia negativa (GEMA reporta más que el aplicativo) no puede
ser un ajuste manual: no se carga y se lista aparte para mirarla a mano.

El archivo que genera lleva **la fila completa**, los seis rubros de siempre con el mismo valor que
ya tienen más los dos conceptos. Cargar solo los dos dejaría los otros seis en cero, porque el
upsert escribe la fila entera.

`--nuevos-cargar` **reabre los meses cerrados** antes de cargar y los vuelve a cerrar después. Cada
reapertura toma una versión del período y queda en la bitácora, que es justo el rastro que se quiere
para una cifra ya reportada. Si la carga falla, los meses quedan reabiertos y el script lo dice.

## El cotejo

`cotejar()` compara ahora `combustible` del aplicativo contra
`combustible + combustible_vehiculos_nuevos` de Gestivo, y lo mismo con la póliza. Si no lo hiciera,
toda fila con ajuste manual aparecería como diferencia aunque el total fuera idéntico.

## Verificación

72 pruebas de `npm run test:financiera`, `tsc` y `eslint` limpios. Las pruebas nuevas cubren: que un
archivo de ocho columnas sigue entrando, que los dos conceptos se leen cuando vienen, que suman al
gasto contable del período, que el aviso de doble conteo se dispara y que no se dispara cuando el
concepto va en cero o cuando no hay referencia de GEMA.
