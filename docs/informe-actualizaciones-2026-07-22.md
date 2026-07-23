# Informe de actualizaciones — Martes 22 de julio de 2026

**Módulo:** Tesorería / Devengados
**Total:** 10 actualizaciones desplegadas

---

## 🕗 8:53 a.m. — Auditoría de tesorería: filtros, paginación y corrección visual

- La bitácora de auditoría mostraba 200 filas sin forma de acotarlas. Ahora se puede filtrar por **rango de fechas, acción, módulo, resultado, usuario y conductor**, con paginación de 100 filas.
- Los filtros quedan en la URL, de modo que una vista filtrada se puede **compartir por enlace** y recargar sin perder el contexto.
- El filtro por fecha se ajustó a la zona horaria de Bogotá; antes los movimientos de la tarde podían quedar fuera del rango.
- Se corrigió un defecto visual que recortaba las tablas anchas en **todo el dashboard** (no solo en auditoría).

## 🕤 9:31 a.m. — Entregas del día: fila de totales al pie de la tabla

- Antes había que sumar a ojo cuánto efectivo salió de caja. Ahora el pie de la tabla muestra el **neto del día** (pagado − devoluciones), el conteo de pagos vigentes y devoluciones, y el desglose de cada uno.
- El criterio del total es el mismo del encabezado y del cierre de caja, para que los tres siempre cuadren entre sí.

## 🕙 9:50 a.m. — Devoluciones: el reverso se contabiliza en la fecha de la entrega original

- Se corrigió un defecto contable: un pago del 16 devuelto el 21 quedaba partido en dos días (el débito en el 16 y el crédito en el 21), sin compensarse nunca.
- Ahora la devolución **hereda la fecha, periodo y quincena de la entrega original**; la auditoría sigue registrando el momento real en que se digitó.
- Se realinearon las 2 devoluciones ya registradas que estaban afectadas (SUÁREZ $66.014 y BORREGO $91.192), con constancia en la bitácora.

## 🕙 10:17 a.m. — Corrección de datos: 22 pagos del cierre del 18 estaban sellados con fecha del 21

- El 21 de julio, un cambio temporal de la fecha operativa dejó 22 pagos con fecha contable del 21 cuando en realidad correspondían al **cierre del día 18**.
- Se verificó cada uno antes de corregir: los 22 caen dentro de la ventana del incidente, ninguno estaba trasladado a GEMA y la liquidación quincenal no se afectó.
- Resultado: el cierre del 18 pasó de **$1.740.694 a $2.986.995** y el 21 quedó en cero. Aplicado y verificado en producción.

## 🕙 10:17 a.m. — Entregas del día: filtro por cajero para administradores

- Con varios cajeros operando el mismo día no había forma de aislar los movimientos de uno solo para cuadrarle la caja.
- El nuevo filtro (visible solo para administradores) aplica a **toda la vista**: tabla, totales, consolidado por cajero y exportaciones a Excel — al elegir un cajero se ve su cuadre completo.

## 🕙 10:22 a.m. — Caja: ajuste de texto en el chip de fecha operativa

- El rótulo decía "de prueba" y confundía al cajero sobre si lo que registraba era real. Ahora dice **"de cierre"**, que es su uso real: cuadrar días ya cerrados.

## 🕚 11:07 a.m. — Entregas: un administrador puede registrar el pago a nombre del cajero, también el día en curso

- Cuando un cajero entregaba el efectivo pero no alcanzaba a digitar el pago, el administrador solo podía registrarlo a su nombre si el día ya estaba cerrado; para el día en curso tocaba mover la fecha operativa global — el rodeo que causó el descuadre del 18 de julio.
- Ahora la caja tiene la opción **"Registrar a nombre de otro cajero"** (solo administradores), que acepta el día en curso sin tocar ningún parámetro global.
- Estos movimientos quedan marcados con el chip **"Novedad"**, generan soporte firmable y quedan diferenciados en auditoría.
- Se conservan todos los controles: cajero acreditado obligatorio, motivo obligatorio, un pago por conductor por día y rechazo de fechas futuras.

## 🕐 11:55 a.m. — Entregas: el filtro lista todos los cajeros de Tesorería

- El filtro solo mostraba los cajeros con movimientos ese día, por lo que un cajero sin registros "desaparecía" (caso de Yesica y Antonio el día 18).
- Ahora se listan **todos los cajeros**; elegir uno sin movimientos muestra la tabla vacía, que también es información útil: ese cajero no ha cuadrado.

## 🕕 6:45 p.m. — Análisis quincenal: los conductores con pago pero sin producción sí aparecen

- Un conductor que recibió un pago en la quincena pero no tuvo producción (típicamente un retirado) desaparecía del análisis y Contabilidad no podía ver qué se le había pagado.
- Ahora aparece con producción en cero y el valor de su entrega visible, para detectar si quedó sobregirado.
- No cambia ningún número de los conductores que ya aparecían; solo agrega las filas que antes se ocultaban.

## 🕘 9:41 p.m. — Caja: estado de cuenta del conductor con pago real, saldo y PDF imprimible

- A solicitud de Contabilidad, la tabla de registro diario de Caja gana dos columnas: **"Pago (real)"** (las entregas vigentes de cada día) y **"Saldo"** (liberado acumulado menos entregado, renglón por renglón). El último saldo es el pendiente por pagar. Se agrega además fila de totales.
- Nuevo botón **"Estado de cuenta"** que genera un **PDF imprimible por conductor** con la misma información y espacio de firmas, como soporte para cuadrar contra GEMA. Formato de tabla día a día aprobado por Néstor.
- Verificado con el caso de AMADOR BARAJAS WILMER: el saldo cierra en $4.789 y el déficit del día 18 ($16.145) queda visible en el acumulado.

---

**Resumen ejecutivo:** la jornada se concentró en robustecer el flujo de **entregas y cierre de caja** (totales, filtros por cajero, devoluciones y pagos a nombre del cajero), se aplicaron **dos correcciones de datos históricos verificadas en producción** (reversos y los 22 pagos del cierre del 18), y se entregó el **estado de cuenta imprimible por conductor** solicitado por Contabilidad.
