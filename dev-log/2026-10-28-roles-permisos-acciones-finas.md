# 2026-10-28 · Roles y permisos — acciones finas en las pantallas existentes

**Pedido** (del plan): permisos para Nuevo, Editar, Eliminar, etc. en las
páginas que ya existen.

**Catálogo** (`src/lib/permisos/catalogo.ts`):
- **Todo módulo de pantalla** tiene `ver`, `editar` y **`exportar`**.
  `exportar` es de nivel `ver`, porque hoy quien ve puede descargar.
- **Acciones propias**, todas de nivel `editar`:

| Módulo | Acciones |
|---|---|
| Vacantes | crear · editar (estado) · eliminar |
| Candidatos | editar (etapa, asignar, contratar) · eliminar |
| Empleados | editar · eliminar |
| Documentos | editar (estado) · eliminar |
| Ausentismo | crear · editar · eliminar |
| Accidentabilidad | editar · aprobar (estado de la revisión) · eliminar · evaluar (especial) |
| Procesos disciplinarios | crear · editar · anular |

- **Nadie pierde nada:** las de nivel `editar` las reciben quienes ya editaban
  el módulo y las de `ver`, quienes lo veían. Así lo hacen la equivalencia (en
  sombra) y la herencia por nivel de la sincronización (en nuevo).

**Servidor:**
- Cada acción exige su permiso: `createVacancy` → `vacantes.crear`,
  `deleteVacancy` → `vacantes.eliminar`, `deleteCandidate`,
  `deleteEmployee*`/`deleteDisciplinaryRecord`, `deleteDocument`,
  `eliminarAccidente` → `.eliminar`, `aprobarAccidente`/`setAccidenteEstado` →
  `accidentabilidad.aprobar`.
- Ausentismo: `crearRegistro` → `crear`, `eliminarRegistro` → `eliminar`.
- Disciplinarios: crear, editar y anular.
- Excel de ausentismo (matriz, indicadores) → `ausentismo.exportar`.

**Pantallas:**
- Los botones de Nuevo, Eliminar, Aprobar y Anular usan su permiso: vacantes,
  candidatos, empleados (lista y detalle), documentos, ausentismo (nuevo
  registro y lápiz/papelera por fila), accidentes y disciplinarios.
- **Exportar:** `usePuedeExportar()` / `<SiExporta>` deciden por el módulo de la
  ruta actual. `BotonesExportar` (compartido por 12 pantallas) se oculta solo.
  Además: consulta de accidentes, indicadores y matriz de ausentismo, historial
  de cámaras y de combustible.

**Comparación ampliada.** `compararAcceso` revisa ahora cada acción del módulo
según su nivel.
- Encontró un hueco real: la equivalencia usaba una lista fija `ver/editar` en
  vez de las acciones del catálogo, y los 9 usuarios de Tesorería perdían
  `exportar`. Corregido.
- Contra la base real, ya sincronizada sola (188 permisos):
  `permisos:comparar -- <foto> --bd` da «Nadie pierde acceso».

**Pruebas.** `test:permisos` 55, y las demás suites, `tsc`, `eslint` (los
errores que quedan son de antes) y `build` pasan.

**Para agregar una acción a un módulo:**
1. Declararla en el catálogo con su nivel.
2. Exigirla en la acción de servidor (`exigirPermiso`/`faltaPermiso`).
3. Ocultar el botón con `usePermisos()`.

La base y los roles se ponen al día solos.
