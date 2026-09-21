# Financiera · Gestión de flota — Fase 6: exportes, API externa y MCP

**Plan:** `docs/Plan_desarrollo_financiera_GESTIVO.md`, sección 9, fase 6.
**Migración:** `supabase/migrations/20260921154738_financiera_identificador_de_la_vista_consolidada_para_la_api_externa.sql`
— **pendiente de aplicar**. Ver «Lo que hay que correr» más abajo.
**Código:** `src/lib/financiera/exportar.ts` (armado del informe, puro) ·
`src/app/(dashboard)/financiera/flota/exportar-flota.tsx` (PDF, Excel y CSV en el navegador) ·
`src/lib/external/resources.ts` (dos recursos nuevos) · `src/lib/mcp/catalogo/financiera.ts` (dominio nuevo) ·
correcciones en `src/lib/mcp/catalogo/gema.ts`.

## 1. Exportes

Seis pantallas ganan el botón de descarga en tres formatos, con los filtros aplicados: Rentabilidad,
Gasto por timbrada, Productividad, Comparación, Vehículos en pérdida y Mantenimiento.

El informe lo arma el servidor con los **valores en crudo** y el tipo de cada columna; el navegador lo
baja a cada formato. Eso permite que:

- **Excel** lleve celdas numéricas de verdad, con formato de moneda o porcentaje, autofiltro, encabezado
  fijo y una hoja «Informe» aparte con los filtros, los totales y las advertencias. Los importes se
  redondean a dos decimales al escribir: las sumas de la base arrastran ruido de coma flotante
  (1.391.693.817,6000001) que la pantalla oculta y Excel muestra en cuanto alguien suma una columna.
- **PDF** y **CSV** lleven el valor ya formateado en pesos enteros, con el prefijo de techo o piso.

Dos cosas que se descubrieron generando los archivos de verdad, no leyendo el código:

- **La fuente del PDF no tiene los símbolos ≤ ni ≥.** jsPDF los dibuja como un hueco, así que
  «Utilidad ≤ $ 9.375.655.218» salía como «Utilidad $ 9.375.655.218»: justo la advertencia que da sentido
  a la cifra. `sanearPdf()` los cambia por `<=` y `>=`, que Helvetica sí tiene.
- **Los anchos de columna del PDF deben sumar menos de 259 mm** (carta apaisada menos márgenes). Si se
  pasan, autotable corta la última columna en silencio. Y si se deja la columna de propietario flexible,
  se queda con las sobras: con 7 mm partía cada razón social en seis líneas y 162 vehículos ocupaban 57
  páginas. Con ancho propio son 12.

## 2. API externa de solo lectura

Dos recursos nuevos en la lista blanca de `/api/external/v1`, en el dominio `financiera`:

| Recurso | Grano | Identificador |
|---|---|---|
| `vw_financiera_consolidado` | período + vehículo | `id` = `AAAA-MM|codigo_vehiculo` |
| `vw_financiera_flota_mes` | período | `periodo` |

No se exponen las tablas de hechos ni la bitácora: todo lo que hace falta está en las dos vistas, ya con
los indicadores calculados.

## 3. Catálogo MCP

Dominio nuevo **`financiera`** con las dos vistas documentadas columna por columna (53 y 23 columnas),
con sus relaciones, preguntas típicas y las trampas del dominio. Lo que el catálogo repite en cada sitio
donde importa, porque es lo que haría fallar a un agente:

- Si `origen_contable` es `sin_dato` o `cobertura_contable` no es `completo`, **la utilidad y la
  rentabilidad son un techo y el gasto por timbrada un piso**. No se pueden dar como cifras firmes.
- **Nunca promediar** las columnas `rentabilidad` o `gastos_por_timbrada`: hay que sumar y dividir al
  final. Un promedio simple pesa igual a un bus con un mes que a uno con doce.
- **Agrupar por `codigo_vehiculo`, nunca por placa.**
- Los **vehículos retirados entran a propósito**; excluirlos cambia los totales históricos.
- **`liquido` no es la utilidad** y no está en las vistas.
- El umbral de productividad heredado (90 / 80) **es inalcanzable** para esta flota, que promedia 77: no
  concluir que va mal solo porque no llega a 90.

## 4. Correcciones a la documentación de `ingreso_tercero`

Los hallazgos 3.6.1 a 3.6.4 del plan, verificados el 2026-09-18 sobre los 21 meses del espejo. El
catálogo los daba por inciertos o los decía mal:

| Qué decía | Qué dice ahora |
|---|---|
| «histórico desde 2026-01-01» | Arranca en **2025-01**: unas 90.000 filas hasta 2026-09 |
| `total_cartulina`: «que sea la suma de las `cartu_*` no está verificado» | Es `cartu_admon + cartu_estudio + cartu_fondo + cartu_presta`, y **excluye `cartu_poliza`** |
| `cartu_admon`: «componente de administración» | Es un **fijo diario por bus** (128.000 en la muestra). No confundir con `admon` |
| `admon`: «administración descontada» | Es el **2,5 % del bruto**. Es la que usa el modelo financiero |
| `rtica`: «significado de la sigla no documentado» | Retención de industria y comercio: el **0,7 % del bruto** |
| `liquido`: «fórmula no verificada» | **No es la utilidad y no es reproducible**: no usarlo como resultado |
| `bruto`: «fórmula no verificada» | Sigue sin verificarse cómo lo calcula GEMA, pero es el «Ingresos» del modelo |

La diferencia entre `admon` y `cartu_admon` es la más cara: en marzo de 2026 son 72 M contra 498 M en
toda la flota. Confundirlas hunde cualquier cálculo de utilidad.

## Lo que hay que correr

1. **Aplicar la migración** `20260921154738_…` en el SQL Editor. Es un `CREATE OR REPLACE VIEW` que añade
   `id` al final de `vw_financiera_consolidado`; se puede correr dos veces sin efecto. Imprime tres
   comprobaciones: un `id` con la forma `2026-09|500` y el mismo número de filas que antes en las dos vistas.
2. **Hasta que se aplique**, la Data API y el MCP responden mal ese recurso: `id` está entre sus columnas
   por defecto y todavía no existe. `vw_financiera_flota_mes` funciona desde ya.

Comprobado con `work/fin-verificar-api.mts`, que cruza las columnas reales de las dos vistas contra la
lista blanca y el catálogo: ninguna columna real sin documentar, ninguna documentada de más salvo `id`.

## Verificación

- `npm run mcp:verificar-catalogo`: 50 recursos, sin errores.
- Descargas generadas de verdad con Playwright sobre datos reales: los tres formatos de dos informes, sin
  errores de JavaScript. El Excel se volvió a abrir para confirmar que los importes son celdas numéricas
  con formato de moneda; el PDF se renderizó a imagen para revisar el encabezado, los anchos y las notas.
- Con el archivo contable vacío, la pantalla de Mantenimiento no tiene filas y sus botones salen
  deshabilitados, que es lo correcto.

## Qué queda

- **Fase 7**: cargar el histórico contable de Lovable con el cargador de la fase 4, cotejar tres meses
  contra el aplicativo y recalibrar los umbrales de gasto por timbrada y rentabilidad. Es lo único que
  falta para cerrar el plan.
- Fase 0 sigue esperando las credenciales de GEMA (`DESPACHO` y el subconteo por llave repetida).
