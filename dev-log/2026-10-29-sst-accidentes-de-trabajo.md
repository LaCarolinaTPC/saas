# 2026-10-29 · SST: matriz de accidentes de trabajo y su caracterización

Pedido: asignar a RRHH – SST el Excel «INFORMACION ACCIDENTES DE TRABAJO.xlsx»
(matriz + pestaña de caracterización con estadísticas y la figura del cuerpo)
y cargar su histórico.

## Qué quedó

- **Migración** `20261029231220_sst_accidentes_de_trabajo.sql`: crea la tabla `sst_accidentes_trabajo` y la sección `accidentes_trabajo` en el admin. Ya está aplicada.
- **Módulo** `/accidentes-trabajo`, en el menú RRHH, con permisos ver / crear / editar / anular / exportar:
  - Pestaña **Registro**: filtros por año, mes, tipo de lesión, parte del cuerpo, mecanismo, agente, tránsito y búsqueda libre. Permite crear, editar y anular, y exportar a XLSX con la hoja de caracterización o a CSV.
  - Pestaña **Caracterización**: calcula a partir de los registros lo mismo que la pestaña «Carac.» del Excel (por mes, tipo de lesión, parte del cuerpo, mecanismo, día, agente y cargo). Incluye una figura del cuerpo propia (`FiguraCuerpo` en `components/graficos/graficos-sst.tsx`) coloreada en una gama de un solo tono.
- **Reglas puras** en `src/lib/sst/`: catálogos tomados de las listas del Excel, `caracterizar`, y el mapeo del histórico. Tests: `npm run test:sst`.
- **Histórico**: `npm run sst:historico -- "<xlsx>" --ensayo|--escribir|--reversar`. Se cargaron 23 casos de 2026, sin filas rechazadas.

## Diferencias con la pestaña del Excel

- Tipo de lesión: el Excel cuenta los 2 «Aplastamiento» como «Golpe»; el módulo los separa.
- Mecanismo: el caso del ojo figura en el Excel como «contacto con partículas», pero el registro dice «caída de objetos».
- La cédula 1094055724 (Dubian Botello Lazaro) no está en conductores ni en empleados. Se cargó igual.

## Pendiente

- Índices de frecuencia y severidad (IF/IS): requieren las horas hombre trabajadas, que no están en el Excel.
