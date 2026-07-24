# Informe — Simulador desde el cierre GEMA y búsqueda exacta por código

**Fecha:** 24 de julio de 2026
**Solicitado por:** Nestor Molina (WhatsApp, 24-jul, con plazo 11 a. m.)
**Estado:** implementado y verificado con typecheck; pendiente desplegar.

## 1. El problema reportado

En la pestaña **Rendimiento del día** del simulador, el valor a recibir se
**calculaba** desde los viajes (`viajes_recaudados`): se reconstruía la
TIMB. CU con la metodología de GEMA y se aplicaba la fórmula
`CU × $3.300 × 16% − $85.000 − $2.000 × viajes`. El análisis quincenal, en
cambio, usa la cifra **oficial ya liquidada** por GEMA
(`cierres_diarios.salario_neto_dia`) menos la base. Por eso el conductor 114
veía **$84.788** en el simulador y **$84.781** en el análisis quincenal:
pequeñas diferencias de redondeo del cálculo que generan incomodidad.

## 2. Qué se cambió

### 2.1 Rendimiento del día: consulta del cierre (no cálculo)

Como pidió Nestor: los valores ya **no se calculan**, se **consultan** de la
tabla de cierre (`cierres_diarios`), la misma que liquida GEMA y de donde
sale el salario neto día que usa devengados.

- **Valor a recibir = salario neto día del cierre − base diaria** (la base
  sigue siendo el parámetro de $85.000, se descuenta una sola vez por día;
  si el conductor rodó varias rutas, sus filas de cierre se suman).
- Es exactamente la misma cuenta del análisis quincenal → **cero
  diferencias** frente a lo liquidado.
- La **timbrada** mostrada sigue la regla de la tabla: si `tipo_cierre`
  empieza por "CU" es `timbradas + diff_tim`; en los demás tipos, solo
  `timbradas`.
- La tabla muestra: código, vehículo, rutas, viajes, timbrada, salario neto
  día, valor a recibir y estado (habilitado / sin excedente).
- Se mantiene la privacidad (solo código, sin nombre ni cédula) y el acceso
  solo para administrador.

### 2.2 Caso "día sin cierre" (decisión tomada)

El cierre de GEMA llega **después** de terminar el día. Si se consulta una
fecha cuyo cierre aún no está sincronizado (por ejemplo, el día en curso):

- La pantalla muestra el **estimado** calculado como hasta ahora, con una
  etiqueta ámbar bien visible: **"Estimado — cierre GEMA pendiente"**.
- Cuando el cierre llega, la pantalla pasa sola a modo consulta con
  etiqueta verde: **"Consulta del cierre GEMA"**, y los parámetros de la
  fórmula (% pago, tarifa festivo, ahorro por viaje) se ocultan porque ya
  vienen dentro de la liquidación de GEMA. Solo queda editable la base.
- El detalle por ruta y segmento (cálculo de la TIMB. CU) se conserva
  debajo como **referencia**, marcado como tal.

### 2.3 Búsqueda exacta por código

Nueva regla en las 4 pantallas de devengados (simulador, caja, análisis
quincenal y parámetros): si lo digitado son **solo dígitos (1 a 6)** se trata
como código y debe coincidir **exacto** — buscar "114" trae únicamente el
114, no el 11142 ni el 11144. Nombres siguen con coincidencia parcial, y las
cédulas (7+ dígitos) también. En el simulador, un número corto también
encuentra el vehículo con ese código exacto.

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/lib/devengados/rendimiento.ts` | Nueva función `getCierreDia`: lee `cierres_diarios` de la fecha, consolida por conductor y aplica la regla CU de la timbrada. |
| `src/lib/devengados/buscar.ts` | **Nuevo.** Helper `esBusquedaCodigo` (regla de búsqueda exacta). |
| `.../simulador/page.tsx` | Trae el cierre del día junto al rendimiento calculado. |
| `.../simulador/simulador-client.tsx` | Pasa el cierre a la pestaña Rendimiento. |
| `.../simulador/rendimiento-client.tsx` | Modo consulta vs. estimado, tabla oficial del cierre, etiquetas, búsqueda exacta. |
| `.../caja-client.tsx` | Búsqueda exacta por código. |
| `.../analisis/analisis-client.tsx` | Búsqueda exacta por código. |
| `.../parametros/parametros-client.tsx` | Búsqueda exacta por código (bloqueo de conductor). |

Sin cambios de base de datos: los campos necesarios (`bruto`,
`salario_bruto_dia`, `salario_neto_dia`, `tipo_cierre`, `diff_tim`) ya
existían en `cierres_diarios` desde la migración 031.

## 4. Verificación

- `tsc --noEmit` sin errores.
- ESLint limpio en los archivos tocados (hay un error **preexistente** ajeno
  a este cambio en `parametros/page.tsx:22` — `prefer-const` — que no toqué).
- Pendiente: validar en producción que, para el 21/07, el cód. 114 muestre
  $84.781 en el simulador (igual al análisis quincenal).

## 5. Segunda solicitud de Nestor (pendiente de diseño)

Reestructurar **usuarios y roles** para que un funcionario pueda tener
varios módulos (p. ej. tesorería + otro) sin ser administrador. Hoy cada
usuario tiene un único tipo (`user_types`) con módulos fijos. Propuesta a
presentar por separado: permisos por módulo asignables por usuario, sin
tocar los tipos existentes. No se incluyó en esta entrega por su alcance.
