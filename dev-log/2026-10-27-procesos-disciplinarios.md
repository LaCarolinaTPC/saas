# 2026-10-27 · Procesos disciplinarios (Recursos Humanos)

## Qué

Ítem nuevo «Procesos disciplinarios» en Recursos Humanos (módulo
`disciplinarios`, ruta `/disciplinarios`). Reemplaza el Excel de RRHH:

- Registra llamados de atención y citaciones a descargos: trabajador (del
  maestro de conductores o escrito a mano si no está), fecha de los hechos,
  motivo (catálogo + «Otro» con detalle), descripción, responsable; para la
  citación, fecha de citación, fecha de la diligencia, si asistió y resumen de
  los descargos; y la medida ejecutada (pendiente, sin medida, llamado verbal
  o escrito, suspensión con días, terminación, otra) con su fecha y detalle.
- Tres vistas con los mismos filtros (fechas, tipo, motivo, conductor):
  **Registro** (editar y anular con motivo), **Por conductor** (procesos,
  llamados, citaciones, asistió / no asistió a descargos, suspensiones y
  días, terminaciones, pendientes y los motivos con cuántas veces cada uno;
  se despliega su historial) y **Por motivo** (cuántos procesos, llamados,
  citaciones y trabajadores por motivo).
- Exporta a Excel y CSV el registro y el resumen por conductor.

Los procesos no se borran: se anulan con motivo y dejan de contar.

## Archivos

- Migración `20261027200246_procesos_disciplinarios_llamados_de_atencion_y_descargos.sql`
  (tabla `procesos_disciplinarios`, GRANT a service_role, módulo para el
  admin). Pendiente de aplicar a mano.
- `src/lib/permissions-shared.ts` (módulo, etiqueta, inicio, ruta) y
  `src/lib/constants.ts` (ítem del menú).
- `src/lib/disciplinarios/reglas.ts` (+ test, `npm run test:disciplinarios`),
  `src/lib/disciplinarios/data.ts`.
- `src/app/(dashboard)/disciplinarios/` (`page.tsx`, `actions.ts`,
  `disciplinarios-client.tsx`, `proceso-dialog.tsx`).

## Pendiente / siguiente

- Importar el Excel actual de RRHH (cuando se tenga el archivo: se mapean
  sus columnas a la tabla).
- Adjuntar el acta de descargos o la carta de la medida (PDF).
- Enlazar con Ausentismo › Reincidentes: la citación a descargos por faltas
  seguidas podría crear el proceso con los datos prellenados.

## Ficha del conductor

- Sección «Procesos disciplinarios» (`src/components/disciplinarios/resumen-conductor.tsx`)
  en la ficha de RRHH (`/conductores/[cedula]`) y en el perfil de Rotación
  (`/rotacion/conductores/[cedula]`, columna lateral): conteos, motivos y los
  últimos 5 procesos, con enlace al módulo ya filtrado por la cédula
  (`/disciplinarios?tab=conductores&q=…`). Solo con el módulo `disciplinarios`.
- Revisión de la ficha de RRHH: todas las columnas del maestro ya se mostraban
  (salvo `fecha_reingreso`, vacía en los 175 activos). Se agregó lo que
  faltaba de otros módulos y lo calculado:
  - Edad y antigüedad en el encabezado; aviso de licencia y contrato vencidos
    o por vencer (30 días) en el encabezado y junto a la fecha
    (`src/lib/conductores/ficha-reglas.ts` + test en `test:conductores`).
  - `src/components/conductores/resumen-modulos.tsx`: tarjetas de Accidentes
    (12 meses, total, con lesionados, el último con responsabilidad),
    Ausentismo (últimos 90 días: ausencias, no justificadas, incapacidades /
    EPS, seguimiento de RRHH), Riesgo (niveles del último análisis) y Proceso
    de contratación (estado, reingreso, SIMIT, antecedentes, categoría de
    licencia). Cada tarjeta solo con el permiso de su módulo y con enlace al
    módulo filtrado.
