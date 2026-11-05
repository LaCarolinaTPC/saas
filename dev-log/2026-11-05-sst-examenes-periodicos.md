# 2026-11-05 · SST: exámenes médicos ocupacionales periódicos

Pedido: agregar en Recursos Humanos el control del Excel «LISTADO PERSONAL
EXAMEN PERIODICO 2026», documentarlo, dejarlo disponible en el MCP y subir el
Excel como histórico.

## Qué quedó

- **Migración** `20261105161614_sst_examenes_periodicos.sql`:
  - tablas `sst_examenes_personas` (población en control) y `sst_examenes_periodicos` (una fila por atención);
  - vistas sin datos de salud para el MCP: `sst_examenes_estado` y `sst_examenes_atenciones`;
  - la sección `examenes_periodicos` en el admin.
  - Es idempotente. La primera versión (sin `periodicidad_meses` en personas ni `base_proximo` en la vista) ya se había aplicado; hay que volver a correrla entera.
- **Módulo** `/examenes-periodicos`, en el menú RRHH, con permisos ver / crear / editar / anular / exportar:
  - **Control**: semáforo por persona (vencido, por vencer en 30 días o menos, sin examen, vigente), historial y salida del control.
  - **Atenciones**: cada examen con su entrega y sus recomendaciones.
- **Reglas**:
  - próximo examen = atención + periodicidad (12 meses por defecto, editable por examen);
  - sin exámenes, el primero se cuenta desde la fecha de ingreso, como lo hacía el Excel.
- **MCP**: solo las dos vistas, documentadas en `src/lib/mcp/catalogo/sst.ts`. Las recomendaciones y observaciones **no** se exponen, por decisión del usuario.
- **Histórico**: `npm run sst:examenes-historico -- "<xlsx>" --ensayo|--escribir|--reversar`.
- **Documentación**: `docs/modulos/examenes-periodicos.md`.

## Hallazgos del Excel

- El próximo examen de quien todavía no tenía examen periódico salía de la fecha de ingreso + 12 meses (24 o 36 en administrativos y Metrorecaudo). El módulo hace lo mismo con la periodicidad de la persona.
- Con eso, de 297 alertas del Excel coinciden 294 estados. Las 3 diferencias tienen una atención mensual más reciente que la hoja de control no reflejaba.
- 60 filas mensuales no son exámenes y se rechazan: casi todas son citas sin fecha de atención o futuras. También hay textos en la columna de fecha («NO», «REPETIR GLICEMIA»).
- Tres fechas de entrega anteriores a la atención se cargan igual, con aviso. La restricción de la tabla solo se exige a los registros de Gestivo.

## Pendiente

- Confirmar con SST qué significa la marca «PROTEGER» de la columna A de algunas hojas. Por ahora queda como observación del examen.
