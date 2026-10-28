# 2026-10-28 · Reincidentes: días de incapacidad multiplicados

**Caso.** 72246879 salía con incapacidades de 4 días que eran de 2. Cada
incapacidad se registra una fila por día y cada fila lleva el rango médico
completo; Reincidentes sumaba ese rango por fila (2 filas × 2 días = 4; una de
15 días daba 225) y contaba filas como incapacidades. Los datos están bien.

**Hecho** (commit b0bcc78, en main con el merge b3db63e «incapacidades dias
reincidentes»):

- `src/lib/ausentismo/incapacidades-conteo.ts` (puro, 9 pruebas): días
  DISTINTOS cubiertos dentro del periodo consultado; incapacidades por rango
  médico (inicio-fin), y cada fila sin rango cuenta como una.
- `data.ts`: la pestaña Reincidentes y el reporte histórico lo usan; el Excel
  exportado sale de los mismos datos.

**Medido** (antes → ahora): Camargo sep 2 (4 d) → 1 (2 d), oct 4 (8 d) → 2 (4 d);
todos en el histórico 2026: 1.288 inc (5.499 d) → 1.044 (1.715 d). Con el
filtro normal la lista no cambia; con categoría Incapacidad en octubre pasa de
24 a 19, porque ahora cuenta incapacidades y no filas.

**Para RRHH.** 4 filas de la migración del Excel 2026 con la fecha fuera de su
rango de incapacidad (25-feb, 6-abr, 30-abr, 9-jun); hay que decidir si fueron
prórroga o error de concepto. El detalle nominal se dio en la sesión, no va en
el repo (es público).

**Verificado.** `test:ausentismo` 50 tras el merge con el cron de GPS; `tsc` y
`eslint` sin errores fuera de `work/`. Build no corrido: `next dev` bloquea
`.next`.

**Pendiente.** Confirmar en la pantalla de producción con Camargo.
