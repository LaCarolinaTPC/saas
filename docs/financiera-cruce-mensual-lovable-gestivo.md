# Financiera · Cruce mensual Lovable vs Gestivo, 2025-01 a 2026-08

**Fecha del cruce:** 2026-09-24 · **Alcance:** 20 meses, de enero de 2025 a agosto de 2026 ·
**Estado de los períodos en Gestivo:** los 20 cerrados.

Este documento respalda lo que se migró del aplicativo de Lovable (`lacarolinagestionflota`) a Gestivo
y quedó en producción en Financiera › Gestión Resultado Flota. Compara, vehículo-mes por vehículo-mes,
lo que el aplicativo tiene hoy en su API con lo que Gestivo muestra en `vw_financiera_consolidado`.

## 1. Veredicto

- **Lo contable está exacto.** Los seis rubros migrados (despacho, intereses, otros gastos, repuestos,
  mano de obra y descuento fondo-conductor) son **iguales al peso en los 2.901 vehículo-mes** que están
  en las dos herramientas, en los 20 meses.
- **No hay diferencias sin explicación.** Todo lo que no cuadra cae en seis casos conocidos (sección 4):
  ocho vehículo-mes de buses sin movimiento en GEMA, un bus que no existe en GEMA (el 1058, dos meses),
  julio de 2026 incompleto en Lovable, el bus 517 en diciembre de 2025, la póliza de vehículos nuevos de
  abril de 2026 y las timbradas de enero de 2025.
- **En 14 de los 20 meses** las dos herramientas dan la misma utilidad de flota. La diferencia es de
  menos de 16 pesos por mes y sale del redondeo por vehículo.
- **Cuando difieren, la cifra correcta es la de Gestivo**, salvo en los ocho vehículo-mes de buses
  parados y en el 1058: ahí a Gestivo le falta un costo que Lovable sí tiene (58.302.854 en total). Es
  el único pendiente de datos.

| Medida, 2025-01 → 2026-08 | Lovable | Gestivo | Diferencia |
|---|--:|--:|--:|
| Vehículo-mes | 2.914 | 2.901 | 13 solo en Lovable |
| Viajes | 223.106 | 223.347 | −241 |
| Ingresos | 52.295.209.434 | 52.342.220.348 | −47.010.914 |
| Costo contable (6 rubros, repuestos netos) | 15.383.529.418 | 15.325.226.565 | +58.302.854 |
| Gastos operativos totales | 44.697.519.594 | 44.680.806.993 | +16.712.601 |
| Utilidad neta | 7.597.689.840 | 7.661.413.355 | −63.723.515 |

En todo el documento, diferencia = Lovable − Gestivo.

## 2. Cómo se hizo

- **Lovable:** 2.914 filas desde 2025-01 leídas de la API externa del aplicativo (`FLOTA_API_URL`) y
  normalizadas con `leerHistorico` (`src/lib/financiera/historico.ts`). Ninguna fue rechazada.
- **Gestivo:** 2.901 filas de `vw_financiera_consolidado`, leídas por páginas con `.range()` porque
  PostgREST recorta cada consulta a 1.000 filas.
- **Llave:** período + código de vehículo. El **903** de Lovable se lee como **972**: es el mismo bus
  (placa UYX584) con otro número, y su costo se cargó bajo el 972 (ver `src/lib/financiera/salvedades.ts`).
- **Tolerancia:** ±1 peso por campo y vehículo-mes.
- **Conceptos de vehículos nuevos:** Lovable escribía a mano el combustible y la póliza de los buses
  nuevos dentro de esas dos columnas; Gestivo los guarda aparte. Para comparar, se suman al combustible
  y la póliza de Gestivo.
- **Script:** `work/fin-cruce-mensual.mts`, de solo lectura. Para repetirlo:
  `npx tsx --tsconfig tsconfig.json work/fin-cruce-mensual.mts > work/tmp/cruce.json`

## 3. Resultados por mes

### 3.1 Cobertura de vehículos

| Mes | Veh. Lovable | Veh. Gestivo | En ambos | Solo Lovable | Veh-mes con diferencia |
|---|--:|--:|--:|--:|--:|
| 2025-01 | 145 | 145 | 145 | 0 | 8 |
| 2025-02 | 145 | 145 | 145 | 0 | 0 |
| 2025-03 | 145 | 145 | 145 | 0 | 0 |
| 2025-04 | 145 | 145 | 145 | 0 | 0 |
| 2025-05 | 146 | 146 | 146 | 0 | 0 |
| 2025-06 | 146 | 146 | 146 | 0 | 0 |
| 2025-07 | 146 | 146 | 146 | 0 | 0 |
| 2025-08 | 145 | 145 | 145 | 0 | 0 |
| 2025-09 | 144 | 144 | 144 | 0 | 0 |
| 2025-10 | 144 | 144 | 144 | 0 | 0 |
| 2025-11 | 144 | 144 | 144 | 0 | 0 |
| 2025-12 | 142 | 141 | 141 | 1 | 1 |
| 2026-01 | 141 | 139 | 139 | 2 | 0 |
| 2026-02 | 138 | 138 | 138 | 0 | 0 |
| 2026-03 | 138 | 137 | 137 | 1 | 0 |
| 2026-04 | 144 | 144 | 144 | 0 | 3 |
| 2026-05 | 150 | 150 | 150 | 0 | 0 |
| 2026-06 | 151 | 151 | 151 | 0 | 0 |
| 2026-07 | 156 | 150 | 150 | 6 | 150 |
| 2026-08 | 159 | 156 | 156 | 3 | 0 |
| **Total** | **2.914** | **2.901** | **2.901** | **13** | **162** |

«Con diferencia» cuenta los vehículo-mes comunes con al menos un campo distinto, venga de GEMA o del
archivo contable. Gestivo no tiene ningún vehículo-mes que Lovable no tenga. En agosto de 2026 hay 155
vehículos con archivo contable y uno sin movimiento, el 812, que no operó y no le falta nada.

### 3.2 Producción: viajes e ingresos

| Mes | Viajes Lovable | Viajes Gestivo | Dif. | Ingresos Lovable | Ingresos Gestivo | Dif. |
|---|--:|--:|--:|--:|--:|--:|
| 2025-01 | 11.483 | 11.483 | 0 | 2.357.276.372 | 2.357.276.372 | 0 |
| 2025-02 | 11.327 | 11.327 | 0 | 2.702.003.315 | 2.702.003.315 | 0 |
| 2025-03 | 11.691 | 11.691 | 0 | 2.722.535.255 | 2.722.535.255 | 0 |
| 2025-04 | 11.655 | 11.655 | 0 | 2.621.207.333 | 2.621.207.333 | 0 |
| 2025-05 | 12.034 | 12.034 | 0 | 2.814.999.819 | 2.814.999.819 | 0 |
| 2025-06 | 11.474 | 11.474 | 0 | 2.445.825.274 | 2.445.825.274 | 0 |
| 2025-07 | 12.444 | 12.444 | 0 | 2.714.556.994 | 2.714.556.994 | 0 |
| 2025-08 | 11.435 | 11.435 | 0 | 2.704.841.101 | 2.704.841.101 | 0 |
| 2025-09 | 11.817 | 11.817 | 0 | 2.822.003.049 | 2.822.003.049 | 0 |
| 2025-10 | 11.700 | 11.700 | 0 | 2.743.757.071 | 2.743.757.071 | 0 |
| 2025-11 | 10.844 | 10.844 | 0 | 2.550.668.188 | 2.550.668.188 | 0 |
| 2025-12 | 10.738 | 10.798 | −60 | 2.452.599.265 | 2.466.857.492 | −14.258.227 |
| 2026-01 | 10.622 | 10.622 | 0 | 2.297.551.993 | 2.297.551.993 | 0 |
| 2026-02 | 9.234 | 9.234 | 0 | 2.474.191.099 | 2.474.191.099 | 0 |
| 2026-03 | 11.060 | 11.060 | 0 | 2.878.276.257 | 2.878.276.257 | 0 |
| 2026-04 | 10.389 | 10.389 | 0 | 2.624.836.623 | 2.624.836.623 | 0 |
| 2026-05 | 11.285 | 11.285 | 0 | 2.738.552.781 | 2.738.552.781 | 0 |
| 2026-06 | 10.633 | 10.633 | 0 | 2.483.093.438 | 2.483.093.438 | 0 |
| 2026-07 | 10.641 | 10.822 | −181 | 2.520.513.895 | 2.553.266.582 | −32.752.687 |
| 2026-08 | 10.600 | 10.600 | 0 | 2.625.920.312 | 2.625.920.312 | 0 |
| **Total** | **223.106** | **223.347** | **−241** | **52.295.209.434** | **52.342.220.348** | **−47.010.914** |

### 3.3 Costo contable (lo que se migró)

Suma de los seis rubros con repuestos netos (repuestos − descuento fondo-conductor). «Solo Lovable» es
el costo de los vehículo-mes que Gestivo no tiene; entre paréntesis, el número de filas.

| Mes | Contable Lovable (todas las filas) | Contable Gestivo | Dif. | De la dif.: solo Lovable | Rubros en veh-mes comunes |
|---|--:|--:|--:|--:|--:|
| 2025-01 | 776.960.409 | 776.960.409 | 0 | — | iguales |
| 2025-02 | 720.955.427 | 720.955.427 | 0 | — | iguales |
| 2025-03 | 782.438.772 | 782.438.772 | 0 | — | iguales |
| 2025-04 | 801.623.852 | 801.623.852 | 0 | — | iguales |
| 2025-05 | 846.009.824 | 846.009.824 | 0 | — | iguales |
| 2025-06 | 777.954.110 | 777.954.110 | 0 | — | iguales |
| 2025-07 | 813.203.920 | 813.203.920 | 0 | — | iguales |
| 2025-08 | 741.153.312 | 741.153.312 | 0 | — | iguales |
| 2025-09 | 829.529.537 | 829.529.537 | 0 | — | iguales |
| 2025-10 | 757.244.960 | 757.244.960 | 0 | — | iguales |
| 2025-11 | 744.568.952 | 744.568.952 | 0 | — | iguales |
| 2025-12 | 757.830.156 | 754.591.190 | +3.238.966 | 3.238.966 (1) | iguales |
| 2026-01 | 697.559.049 | 694.544.813 | +3.014.236 | 3.014.236 (2) | iguales |
| 2026-02 | 649.808.050 | 649.808.050 | 0 | — | iguales |
| 2026-03 | 725.871.397 | 719.661.393 | +6.210.004 | 6.210.004 (1) | iguales |
| 2026-04 | 710.110.706 | 710.110.706 | 0 | — | iguales |
| 2026-05 | 741.681.040 | 741.681.040 | 0 | — | iguales |
| 2026-06 | 803.791.504 | 803.791.504 | 0 | — | iguales |
| 2026-07 | 860.659.995 | 835.368.615 | +25.291.380 | 25.291.380 (6) | iguales |
| 2026-08 | 844.574.445 | 824.026.177 | +20.548.268 | 20.548.268 (3) | iguales |
| **Total** | **15.383.529.418** | **15.325.226.565** | **+58.302.854** | **58.302.854** | iguales |

**Toda la diferencia contable (58.302.854) está en vehículo-mes que no existen en Gestivo.** En los
vehículo-mes comunes, los rubros son idénticos en los 20 meses.

### 3.4 Resultado: gastos operativos y utilidad neta

Las cifras de Lovable incluyen todas sus filas, también las que Gestivo no tiene.

| Mes | Gastos operativos Lovable | Gestivo | Dif. | Utilidad Lovable | Utilidad Gestivo | Dif. |
|---|--:|--:|--:|--:|--:|--:|
| 2025-01 | 2.109.508.017 | 2.109.508.015 | +3 | 247.768.355 | 247.768.357 | −2 |
| 2025-02 | 2.143.324.798 | 2.143.324.791 | +8 | 558.678.517 | 558.678.524 | −7 |
| 2025-03 | 2.263.347.071 | 2.263.347.078 | −7 | 459.188.184 | 459.188.177 | +7 |
| 2025-04 | 2.241.253.276 | 2.241.253.280 | −4 | 379.954.057 | 379.954.053 | +4 |
| 2025-05 | 2.347.477.105 | 2.347.477.111 | −6 | 467.522.714 | 467.522.708 | +6 |
| 2025-06 | 2.176.863.714 | 2.176.863.713 | +1 | 268.961.560 | 268.961.561 | −1 |
| 2025-07 | 2.306.900.046 | 2.306.900.041 | +5 | 407.656.948 | 407.656.953 | −5 |
| 2025-08 | 2.211.747.638 | 2.211.747.643 | −4 | 493.093.463 | 493.093.458 | +4 |
| 2025-09 | 2.335.192.076 | 2.335.192.070 | +6 | 486.810.973 | 486.810.979 | −6 |
| 2025-10 | 2.249.093.305 | 2.249.093.290 | +15 | 494.663.766 | 494.663.781 | −15 |
| 2025-11 | 2.158.104.001 | 2.158.104.002 | −1 | 392.564.187 | 392.564.186 | +1 |
| 2025-12 | 2.147.513.129 | 2.151.870.291 | −4.357.162 | 305.086.136 | 314.987.201 | −9.901.065 |
| 2026-01 | 2.089.252.866 | 2.086.238.631 | +3.014.236 | 208.299.127 | 211.313.362 | −3.014.236 |
| 2026-02 | 1.974.232.655 | 1.974.232.655 | 0 | 499.958.444 | 499.958.444 | 0 |
| 2026-03 | 2.286.128.339 | 2.279.918.335 | +6.210.004 | 592.147.918 | 598.357.922 | −6.210.004 |
| 2026-04 | 2.199.336.640 | 2.202.082.265 | −2.745.624 | 425.499.983 | 422.754.358 | +2.745.624 |
| 2026-05 | 2.339.089.246 | 2.339.089.246 | 0 | 399.463.535 | 399.463.535 | 0 |
| 2026-06 | 2.311.702.153 | 2.311.702.153 | 0 | 171.391.285 | 171.391.285 | 0 |
| 2026-07 | 2.380.277.978 | 2.386.235.114 | −5.957.136 | 140.235.917 | 167.031.468 | −26.795.551 |
| 2026-08 | 2.427.175.539 | 2.406.627.272 | +20.548.268 | 198.744.773 | 219.293.040 | −20.548.268 |
| **Total** | **44.697.519.594** | **44.680.806.993** | **+16.712.601** | **7.597.689.840** | **7.661.413.355** | **−63.723.515** |

### 3.5 Campo por campo, sobre los 2.901 vehículo-mes comunes

| Campo | Veh-mes comparados | Con diferencia | % iguales | Diferencia absoluta |
|---|--:|--:|--:|--:|
| viajes | 2.901 | 54 | 98,1 % | 241 |
| timbradas | 2.901 | 62 | 97,9 % | 60.072 |
| ingresos | 2.901 | 54 | 98,1 % | 47.010.914 |
| fondo | 2.901 | 71 | 97,6 % | 45.500 |
| póliza | 2.901 | 152 | 94,8 % | 7.481.192 |
| préstamo | 2.901 | 132 | 95,4 % | 10.955.700 |
| estudio | 2.901 | 70 | 97,6 % | 410.000 |
| salario | 2.901 | 54 | 98,1 % | 8.604.857 |
| combustible | 2.901 | 54 | 98,1 % | 12.824.567 |
| rtica | 2.901 | 50 | 98,3 % | 306.670 |
| admon | 2.901 | 54 | 98,1 % | 1.175.273 |
| sitra | 2.901 | 0 | 100,0 % | 0 |
| **despacho** | 2.901 | 0 | 100,0 % | 0 |
| **intereses** | 2.901 | 0 | 100,0 % | 0 |
| **otros gastos** | 2.901 | 0 | 100,0 % | 0 |
| **repuestos** | 2.901 | 0 | 100,0 % | 0 |
| **mano de obra** | 2.901 | 0 | 100,0 % | 0 |
| **desc. fondo-conductor** | 2.901 | 0 | 100,0 % | 0 |
| gastos operativos totales | 2.901 | 154 | 94,7 % | 41.803.759 |
| utilidad neta | 2.901 | 154 | 94,7 % | 29.013.834 |

En negrita, los seis rubros migrados: 100 % iguales. Las diferencias en los campos que vienen de GEMA
son las de julio de 2026, el bus 517 en diciembre de 2025, la póliza de abril de 2026 y las timbradas
de enero de 2025 (sección 4). La diferencia absoluta suma el valor de cada diferencia sin signo.

## 4. Explicación de cada diferencia

### 4.1 Ocho vehículo-mes de buses sin movimiento: 46,7 millones · PENDIENTE

Son buses que no tuvieron movimiento en GEMA ese mes (cero viajes, cero ingresos) pero a los que
contabilidad les cargó reparaciones. GEMA no crea la fila de un bus que no opera, y como el consolidado
de Gestivo parte de esa fila, el costo no tiene dónde cargarse.

| Mes | Bus | Placa | Repuestos | Mano de obra | Otros gastos | Total |
|---|---|---|--:|--:|--:|--:|
| 2025-12 | 562 | WPV992 | 2.124.150 | 906.780 | 208.036 | 3.238.966 |
| 2026-01 | 534 | TDW241 | 716.027 | 983.586 | 15.979 | 1.715.592 |
| 2026-01 | 562 | WPV992 | 368.608 | 930.036 | 0 | 1.298.644 |
| 2026-03 | 558 | TZK545 | 5.180.204 | 1.029.800 | 0 | 6.210.004 |
| 2026-07 | 506 | TDU369 | 11.895.637 | 3.775.106 | 15.766 | 15.686.509 |
| 2026-07 | 530 | TDV338 | 2.659.532 | 891.770 | 411.734 | 3.963.036 |
| 2026-08 | 506 | TDU369 | 6.650.495 | 7.270.595 | 0 | 13.921.090 |
| 2026-08 | 530 | TDV338 | 0 | 618.800 | 0 | 618.800 |
| **Total** | | | | | | **46.652.641** |

Con el 1058 (4.2), que suma 11.650.213, son 58.302.854 de costo contable que están en Lovable y no en
Gestivo. **Efecto:** en diciembre de 2025 y en enero, marzo, julio y agosto de 2026, la utilidad de
flota de Gestivo sale más alta en ese valor. En la bitácora este pendiente figura como «buses parados».
Para resolverlo, el consolidado tiene que admitir una fila contable sin fila operativa.

### 4.2 Bus 1058, julio y agosto de 2026: 11,7 millones · PENDIENTE

El código 1058 no existe en el maestro de vehículos de GEMA. Lovable le carga 18.328 de repuestos y
5.623.507 de intereses en julio, con la placa LJO700, que en GEMA es del **1057**. En agosto le carga
6.008.378 de intereses, con la placa «NNN». Falta confirmar si es el 1057, como pasó con el 903 y el 972,
o un bus nuevo que todavía no está en GEMA. Si es el 1057, el costo se carga bajo ese código.

### 4.3 Julio de 2026: Lovable tiene 30 de 31 días · Gestivo correcto

Al archivo de Lovable le falta el día 31, y se nota en los 150 buses del mes: fondo, estudio, póliza y
préstamo tienen un día menos, y los 53 buses que operaron el 31 pierden 181 viajes y 32.752.687 de
ingresos. Gestivo lee de GEMA el mes completo. Los rubros contables son los mismos en las dos.

Además, Lovable tiene en julio 213.494 de combustible escrito a mano para tres buses nuevos (1029, 1031 y
1033), sin viajes. No operaron en julio (su primer mes en GEMA es agosto), así que no tienen fila en
Gestivo.

En julio, Lovable da 26.795.551 menos de utilidad: 25.504.874 son el costo de 4.1 y 4.2 más el
combustible de los buses nuevos, y 1.290.677 son el día 31.

### 4.4 Bus 517, diciembre de 2025 · Gestivo correcto

Lovable le registra 20 viajes y GEMA 80. La diferencia arrastra los ingresos (14.258.227) y todas las
partidas de GEMA de ese bus. En Gestivo, la utilidad sale 6.662.103 más alta.

### 4.5 Póliza de vehículos nuevos, abril de 2026 · Gestivo correcto, confirmado por el usuario

Los buses 1022, 1024 y 1025 tienen en Gestivo 2.745.624 de póliza de vehículos nuevos que Lovable perdió
al actualizar el mes. El usuario confirmó el 2026-09-23 que el costo es real, así que se conserva.

### 4.6 Timbradas, enero de 2025 · Gestivo correcto

Ocho buses (520, 521 y 523 a 528) tienen 0 timbradas en Lovable; Gestivo toma de GEMA las 45.753 que
hicieron. Solo cambia el gasto por timbrada; ingresos y utilidad no se mueven.

### 4.7 Redondeo

De enero a noviembre de 2025, la utilidad de flota difiere entre 1 y 15 pesos por mes, porque Lovable
guardaba cada indicador redondeado por vehículo. Ningún vehículo-mes difiere en más de un peso.

## 5. Conciliación de la utilidad total

| Concepto | Efecto en la utilidad (Lovable − Gestivo) |
|---|--:|
| Buses sin movimiento en GEMA con costo (4.1) | −46.652.641 |
| Bus 1058 (4.2) | −11.650.213 |
| Combustible de 1029, 1031 y 1033 en julio (4.3) | −213.494 |
| Julio sin el día 31 (4.3) | −1.290.677 |
| Bus 517 en diciembre (4.4) | −6.662.103 |
| Póliza de vehículos nuevos de abril (4.5) | +2.745.624 |
| Redondeo (4.7) | −11 |
| **Total** | **−63.723.515** |

Cuadra con la diferencia de utilidad de la sección 1.

## 6. Pendientes

1. **Buses sin movimiento con costo (4.1).** Decidir si se cargan los 46,7 millones de esos ocho
   vehículo-mes.
2. **Bus 1058 (4.2).** Confirmar con el área si es el 1057 o un bus nuevo.

Todo lo demás está cerrado: las diferencias que quedan son errores de Lovable que Gestivo corrige con
los datos de GEMA.
