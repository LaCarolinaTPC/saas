# 2026-10-28 · Ausentismo › Reincidentes: rango Desde–Hasta y filtros revisados

`fae04d8` en Desarrollo; en main con el merge `d16f8fe` (mismo nombre). Sin migración.

**Hecho.**

- **Rango de fechas.** «Corte» pasó a ser **Desde** y **Hasta**.
  - La **Ventana** quedó como atajo (mes, 30, 60, 90 días) y llena Desde.
  - Editar Desde a mano la deja en «Personalizado».
  - El tope es de 366 días; para más está el reporte histórico.
  - En la URL, `desde` solo cuenta en esta pestaña, y los enlaces viejos con `corte` + `ventana` siguen sirviendo.
  - El rango aparece en el aviso, la columna, el PDF, el Excel, el CSV y el nombre del archivo.
- **Lógica pura nueva:** `src/lib/ausentismo/reincidentes-filtros.ts`, que contiene `resolverRangoReincidentes`, `errorRangoReincidentes`, los textos y `filtrarReincidentes`, este último movido desde `exportar.ts`.
- **Fallas corregidas:**
  - El chip «Alta» mandaba `criterio=alta`, que no estaba en `CRITERIO_KEYS`: la página lo descartaba y mostraba a todos.
  - El formulario copiaba los filtros en `useState` y no se resincronizaba tras un chip; al pulsar Aplicar se perdía el filtro del chip. Se arregló con un `key` sobre `ReincidentesClient`.
- **Decisión del usuario:** se conserva la regla de que con una categoría elegida entran también quien tenga 2 o más no justificadas o 4 o más días seguidos. Ejemplo de octubre: EPS con mínimo 3 da 21 conductores, de los que 19 están por esa excepción.

**Verificado.**
- `test:ausentismo` pasa 38 de 38, con 12 pruebas nuevas; `tsc` y `eslint` limpios.
- Se cruzaron contra la base real 3 rangos × 4 categorías × 3 mínimos × 7 criterios, más retirados, sin fallos.
- Playwright sobre una vista previa temporal, ya borrada, en escritorio y celular.
