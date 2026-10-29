# 2026-10-29 · Días configurables de descargos y terminación (Reincidentes)

## Qué

En Ausentismo › Reincidentes, junto al selector **Tipo de reincidencia**, un
botón de engranaje abre el configurador de días:

- Días seguidos sin justificar para la **citación a descargos** (4 por defecto).
- Días seguidos sin justificar para la **terminación de contrato** (5 por defecto).

Solo quien puede editar Ausentismo guarda; los demás lo ven en solo lectura.
La terminación debe pedir más días que los descargos (1–60).

Es un parámetro global, no un filtro: cambia la alerta, quién entra siempre a
la lista, el aviso del día, las notificaciones pendientes, la validación de
`marcarNotificacion` y los textos de los informes (CSV, XLSX, PDF). El cambio
queda en `tesoreria_audit_log` con la acción `reincidencia_parametros`.

## Archivos

- Migración `20261029144556_ausentismo_parametros_de_dias_para_descargos_y_terminacion.sql`
  (tabla `ausentismo_parametros`, GRANT a service_role). Pendiente de aplicar a
  mano; sin ella la pantalla sigue con 4 y 5 y guardar avisa que falta la tabla.
- `src/lib/ausentismo/constants.ts`: `DiasNotificacion`, `accionesNivel(dias)`,
  `criteriosReincidencia(dias)`; `nivelAlertaReincidente` y `nivelesRequeridos`
  reciben los días.
- `src/lib/ausentismo/data.ts`: `getParametrosReincidencia`, `getReincidentes({ dias })`.
- `src/app/(dashboard)/ausentismo/actions.ts`: `actualizarParametrosReincidencia`.
- `src/app/(dashboard)/ausentismo/reincidentes/reincidentes-client.tsx`: `ConfigurarDias`.
- `src/lib/ausentismo/exportar.ts`: los informes reciben `dias`.
