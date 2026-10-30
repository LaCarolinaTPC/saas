# 2026-10-30 · Módulo de Recobros: fase 6 (avisos, MCP y documentación)

Sigue `dev-log/2026-10-29-recobros-fase-1.md` y el plan en
`work/plan-recobros-tesoreria.md`. Esta fase no lleva migración.

## Avisos por rol

- **Regla pura** `avisosRecobros` en `recobros-vista.ts`, con el mismo estado
  derivado de la página. Cada rol ve lo que puede hacer (exige «Crear y
  editar» en su función, no basta con verla):

  | Rol | Aviso |
  |---|---|
  | Caja | sin gestión hoy |
  | Subgerencia | decide subgerencia |
  | Operativo | plazo vencido sin acuerdo vigente |
  | Directora | incobrables por registrar y para liquidación definitiva |
  | Director de Mantenimiento | correcciones por validar (cuenta correcciones, no recobros) |

- **Dónde salen:**
  - Revisión del día, Caja de devengados y la página de Recobros pintan el cuadro rojo.
  - Consolidado y Mapa de calor muestran el número en la pestaña «Recobros».
- **Filtro de la bandeja:** cada aviso lleva a `/tesoreria/recobros?ver=<clave>`, que llega filtrada y con chip para quitar el filtro.
- **Mantenimiento:** la pestaña «Solicitudes» de Cámaras y sensores lleva en rojo las revisiones de cámara sin resolver. `PestanasCamaras` pasó a ser componente async.
- **Alarma vieja:** se borraron `getAlarmaRecobros`, `contarAlarma`, `alarmaPara`, `textoAlarma` y `filtroDeAlarma` con sus pruebas. El resto de `recobros-camaras.ts` ya casi no se usa (tipos y `getEventosSolicitud`): queda como candidato a limpieza.

## «No vino a trabajar» frente a GEMA

- `getViajesConductorPorDia` cuenta en `historico_despacho` los viajes que salieron a rodar (`salioARodar`, la regla del biométrico) por conductor y día.
- Se consultan los días con gestión «No vino» y hoy, si el recobro está por cobrar.
- En la línea de tiempo: «GEMA: N viajes ese día» o «sin viajes». En el formulario del cajero, al elegir «No vino», dice si el conductor ya tiene viajes hoy.

## MCP y documentación

- **Recurso MCP:** `src/lib/mcp/catalogo/tesoreria.ts` documenta 4 tablas: `tesoreria_camaras_solicitudes`, `tesoreria_camaras_recobro_gestiones`, `tesoreria_recobro_correcciones` y `tesoreria_recobro_resultados`. Están registradas en `external/resources.ts` y `external/acceso.ts`, solo para el módulo Tesorería. La advertencia principal es que el estado no se guarda: se deriva.
- **Documentación:**
  - `docs/modulos/recobros.md`, nuevo: flujo, estados, reglas, permisos, avisos y datos. Está enlazado desde `tesoreria.md`.
  - Fila nueva en `docs/mcp/CONEXION.md`.
- **Diagrama de la bóveda:** se rehízo `Wiki/assets/tesoreria-flujo-recobros-camaras.excalidraw` con 7 carriles. El anterior quedó como `…-2026-10-27.excalidraw`. No se revisó en Excalidraw.

## Verificación

- `test:tesoreria` 97 de 97 (prueba nueva de avisos; salieron las 2 de la alarma vieja), `test:permisos` 60 y `test:mcp` 8.
- `mcp:verificar-catalogo` sin errores.
- `eslint` sin errores. `tsc` sin errores en `src` (solo fallan scripts viejos de `work/`).
- Con los datos reales del 30-oct (solo lectura):
  - 43 recobros.
  - Caja: 18 sin gestión hoy, y 8 de esos conductores ya tienen viajes hoy en GEMA.
  - Mantenimiento: 17 solicitudes de cámara por resolver, igual que el número de la pestaña.
  - Los demás roles, sin avisos.
- No hice vista previa con Playwright: los cambios de pantalla son líneas de aviso, un chip y un número en una pestaña.

## Pendiente

- Commit y push (falta el nombre del usuario).
- Fase 7 (piloto):
  - Asignar `recobros_subgerencia`, `recobros_operativo` y `recobros_correcciones`.
  - Probar con sesión el ciclo completo y revisar el primer día de abonos.
