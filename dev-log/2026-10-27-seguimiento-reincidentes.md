# 2026-10-27 · Seguimiento de reincidentes (Ausentismo)

## Qué

En Ausentismo › Reincidentes, cada fila tiene una columna **Seguimiento** con
la etiqueta del seguimiento más reciente (Sin seguimiento / En seguimiento /
Compromiso cumplido / Compromiso no cumplido) y un botón **Seguimiento** que
abre un diálogo con el historial del conductor y el formulario:

- Tipo (EPS · Incapacidad · Ausentismo), fecha, responsable (Asistente de
  gestión humana · Directora de gestión humana · SST), motivo / hallazgo
  (recurrente en incapacidad · en ir a la EPS · en faltar injustificadamente).
- Acción realizada, compromiso del conductor y de la empresa (texto libre;
  ejemplo «Ajustar el turno mientras termina el tratamiento»).
- Fecha límite, estado (Abierto · Cumplido · Incumplido) y próxima revisión.

Tipo y motivo se prellenan con lo que más pesa en la reincidencia
(`sugeridos`). Un conductor puede tener varios seguimientos; se editan (para
cerrarlos), no se borran, y queda quién los registró y modificó.

Si el más reciente sigue abierto, la etiqueta avisa «Vencido el …» (fecha
límite pasada), «Revisión atrasada» o «Revisar hoy». La barra suma el chip
«N sin seguimiento». Los exportes (CSV, XLSX y PDF) llevan el seguimiento.

## Archivos

- Migración `20261027161331_seguimiento_de_reincidentes_de_ausentismo.sql`
  (tabla `ausentismo_seguimientos`, GRANT a service_role). Pendiente de
  aplicar a mano; sin ella la pestaña sigue funcionando «Sin seguimiento».
- `src/lib/ausentismo/seguimiento-reglas.ts` (+ test en `test:ausentismo`).
- `src/lib/ausentismo/data.ts`: `Reincidente.seguimiento`,
  `getResumenSeguimientos`, `getSeguimientos`.
- `src/app/(dashboard)/ausentismo/actions.ts`: `listarSeguimientos`,
  `crearSeguimiento`, `actualizarSeguimiento`.
- `src/app/(dashboard)/ausentismo/reincidentes/seguimiento-dialog.tsx` y la
  columna en `reincidentes-client.tsx`.
- `src/lib/ausentismo/exportar.ts`: columnas y resumen del seguimiento.

No se agregó al catálogo MCP: ahí cada entrada expone la tabla por la API de
datos, y publicar los seguimientos (datos personales) es otra decisión.
