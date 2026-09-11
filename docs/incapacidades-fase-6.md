# Recuperación de incapacidades — Fase 6: consulta, tablero, exportaciones y soportes

**Plan:** `docs/Plan_desarrollo_incapacidades_GESTIVO.md`, sección 11, fase 6, y pantallas 7 y 8.
**Migración:** ninguna nueva. Usa el bucket `incapacidades` y la tabla `incapacidad_adjuntos` de la fase 2
(`20260911201033_…`). Las tres migraciones del módulo siguen **pendientes de aplicar**, en orden.
**Código:** `src/lib/incapacidades/{adjuntos,exportar,tablero-reglas}.ts` · `src/app/api/incapacidades/adjuntos/route.ts` ·
`src/app/(dashboard)/incapacidades/{consulta,tablero}/page.tsx` · `[id]/adjuntos-panel.tsx` · `exportar-boton.tsx` ·
`exportar-actions.ts`.
**Pruebas:** `npm run test:incapacidades` (49 pruebas).

## Qué hace

| Pieza | Dónde | Qué exige | Qué produce |
|---|---|---|---|
| **Consulta** (pantalla 7) | `/incapacidades/consulta` | El módulo | Búsqueda por cédula o nombre y estado, tabla de solo lectura sin ninguna acción de escritura. Es la pantalla que recibirá Revisoría cuando se le asigne `incap_consulta`. Cada consulta queda en la auditoría |
| **Tablero** (pantalla 8) | `/incapacidades/tablero` | El módulo | Desde el corte, por entidad y estado: expedientes, cobrables, días a cargo, reclamado, radicado, recaudado, ajustes y saldo en cobro; embudo del reclamo al recaudo; barra de avance por entidad. Sin comparación con periodos anteriores al corte |
| **Exportaciones** | bandeja, bandeja de cobro, conciliación y tablero | El módulo | CSV, Excel y PDF con lo que se ve (filtros, pestaña o vista), contexto, fecha y aviso de datos personales. La bandeja de cobro sale con una sección por entidad (y una hoja por entidad en Excel). Cada descarga se audita (`exportacion`, módulo `incapacidades`) |
| **Soportes** | panel «Soportes» del expediente | Permiso de edición; expediente no cerrado | PDF, JPG, PNG o WebP hasta 10 MB al bucket privado `incapacidades` por la ruta `/api/incapacidades/adjuntos` (las server actions limitan el cuerpo a 1 MB); fila en `incapacidad_adjuntos` con qué soporta (expediente, liquidación, radicación, recaudo, ajuste); enlace firmado de una hora; anulación con motivo, nunca borrado |

## Reglas que fija

- **Las exportaciones se generan en el navegador** con las filas ya cargadas, como en Riesgo y en la matriz: no
  hay ruta de servidor que volver a autorizar. El rastro se deja después de generar; si la descarga falla no queda
  anotada una copia que no existió.
- **Las cifras del tablero** salen de la vista del expediente: reclamado cuenta desde `liquidado`; radicado, las
  radicaciones en estado radicada; recaudado, los abonos aplicados; el saldo en cobro solo los expedientes
  `radicado`, `con_recaudo` y `conciliado` (no lo liquidado sin radicar ni lo cerrado).
- **Los soportes** siguen el patrón de los documentos del vehículo: nombre irrepetible en el bucket, URL firmada
  desde el servidor, si la fila falla se borra el archivo. La bitácora del expediente registra `adjunto_subido` y
  `adjunto_anulado`.
- **La ficha** del expediente cambia su bloque de soportes por «Radicación y cobro» (radicación activa,
  devoluciones, abonos, saldo, número de soportes); el detalle y las acciones están en los paneles de abajo.

## Verificación de salida de la fase (plan, 11)

| Criterio | Cómo se verificó |
|---|---|
| Consulta no puede invocar ninguna acción de escritura | La pantalla no enlaza formularios; el expediente solo muestra los suyos con `puedeEditar`; la ruta de soportes exige `puedeEditar` |
| Tablero y listado coinciden para el mismo filtro | `agregarTablero` suma sobre las mismas filas de la vista que la bandeja; prueba `el tablero agrega reclamado, radicado, recaudado y saldo…` |
| tsc, eslint, 49 pruebas | limpios |
| UX | vista previa temporal bajo `/docs` + Playwright a 1440/800: KPIs, embudo, tabla por entidad con avance, panel de soportes con enlace, sin enlace y carga; borrada antes del commit |

## Comprobación manual tras aplicar las migraciones

1. Abrir un expediente y cargar un PDF como «Expediente»; debe aparecer con enlace que abre el archivo; el enlace
   deja de servir pasada una hora y vuelve a generarse al recargar.
2. Cargar un archivo de 11 MB o un `.docx` → rechazado con mensaje claro.
3. Anular el soporte con motivo → desaparece de la lista; en Tesorería › Auditoría queda `adjunto_anulado`.
4. En la bandeja de cobro, pestaña «Por radicar», descargar Excel: una hoja «Listado» y una por entidad; en
   Auditoría queda `exportacion` con `cobro:por_radicar` y el número de filas.
5. El tablero debe mostrar el mismo número de expedientes que la bandeja sin filtros, y la suma de «Saldo en cobro»
   debe coincidir con el total de Conciliación en «Radicados en cobro».

## Lo que la fase 6 no hace

Endurecimiento (fase 7): índices adicionales, prueba con 5.000 expedientes sintéticos, retención de soportes,
diccionario de datos del módulo.
