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

- Fase 6 en `main` con el commit `70baf74` «actualizacion recobros tesorerria».
- Fase 7: ver abajo.

## Fase 7 · Piloto (empezada)

- **Abonos de GEMA desde el 29-oct:**
  - Entraron 6 «REVISIÓN CÁMARA», con 6 solicitudes y sin duplicados ni anulados.
  - Las 6 siguen sin tomar en Mantenimiento.
- **Permisos.** El motor de permisos es el nuevo:
  - Son 18 usuarios con rol admin, entre ellos subgerencia, la dirección de Operativo, la de Mantenimiento y la dirección de Tesorería.
  - El rol RRHH tiene Tesorería completa (caja, cartulina y parámetros). Viene de antes y no se tocó.
- **Avisos de los admin** (`rolAvisosRecobros`): solo ven los de las funciones que tengan asignadas de forma explícita, por permiso individual o por un rol que no sea super. Antes cada admin habría visto los avisos de todos los roles.
- **Permisos individuales asignados** (`usuario_permisos`, ver y editar; se revierte borrando esas 8 filas):
  - Dirección de Tesorería: `recobros_incobrable`.
  - Subgerencia: `recobros_subgerencia`.
  - Dirección de Operativo: `recobros_operativo`.
  - Dirección de Mantenimiento: `recobros_correcciones`.
- **Verificación:** cada uno queda con su rol y hoy no tiene pendientes. Un admin sin asignación ya no ve avisos.
- **Maqueta de Tesorería:** las diferencias se reportaron al usuario; no se cambió nada.
- **Rol RRHH sin Tesorería** (decisión del usuario):
  - Se quitaron los 19 permisos `tesoreria.*` de `rol_permisos` del rol `rrhh`. Afecta a 5 usuarios, que no tenían otro rol ni gestiones de cobro registradas.
  - Conserva sus 12 módulos (ausentismo, empleados, incapacidades y otros).
  - El respaldo está en `work/rrhh-tesoreria-respaldo-2026-10-30.json`, ignorado por git.

## Nuevas reglas de recobros (commit `b770ae5`, merge `e25dd29` en `main`)

Sin migración.

- **El recaudo se hace solo en GEMA.** Gestivo no registra pagos a mano: un recobro pasa a pagado cuando GEMA muestra el viaje recaudado. Esto queda para la fase 2.
- **Dos estados para Caja** (`estadoCaja` en `recobros-vista.ts`):
  - *Por gestionar*: recobro habilitado y sin recaudar. Sigue en Caja de un día para otro. Incluye lo que reportó Revisión cartulina aunque Cámaras no lo haya contado (decisión del usuario).
  - *Gestionado*: pagado.
  - Lo que espera la cámara, lo cerrado sin cobro y la liquidación definitiva no son de Caja.
- **Aviso de Caja:** `por_gestionar` («N recobros por gestionar en caja») reemplaza a `sin_gestion_hoy`. En Caja de devengados y en Revisión del día lleva la lista: buseta, viaje, fecha, diferencia, saldo y días pendiente. Va el más antiguo primero, con hasta 8 filas, y los días en rojo desde el tercero.
- **Página de Recobros para el cajero:** filtros *Por gestionar* (el que abre por defecto) y *Gestionados*. La tarjeta «Sin gestión hoy» pasó a llamarse «Por gestionar».
- **Verificación:**
  - `test:tesoreria` 97 de 97; `tsc` y `eslint` sin errores.
  - Datos reales del 30-oct: de 44 recobros, 18 están por gestionar y 26 fuera de Caja. De los 18, 6 vienen de Revisión cartulina sin timbradas ni valor (diferencia vacía y saldo $0).

### Pendiente: fase 2, cierre por GEMA

- **Paso 0 · Recaudo de prueba:** foto en GEMA (`viajes_recaudados`, `abonos` y `timbradas_descontadas`) antes y después de recaudar un recobro real, por ejemplo el viaje 1854866 del vehículo 1024 (17-oct). Así se fija la señal de recaudo.
- **Después:**
  - regla `verificarRecaudoGema` en el refresco de 15 minutos y en el cron;
  - migración con `gema_recaudo_*`, origen `gema` y evento `recaudado_en_gema`, con `GRANT`;
  - gestión automática de pago con origen GEMA;
  - quitar «Pagó completo» y «Abono» del formulario del cajero;
  - corrida en seco antes de activar.

## GEMA manda: estado del abono (commit «actualizacion recobro mejora de flujo de trabajo»)

Sin migración. Tesorería confirmó que en GEMA **GESTIONADO = cobrado**. El abono «REVISIÓN CÁMARA» tiene tres estados: `0` POR GESTIONAR, `1` GESTIONADO y `2` ANULADO. Ya no hace falta el recaudo de prueba.

- **Lectura:** el refresco y el cron vuelven a leer los abonos desde el abono abierto más viejo (`diaAbonoAbiertoMasViejo`, hasta 60 días atrás), no solo hoy y ayer.
- **Cierre** (`planSolicitudesDesdeAbonos`), cuando GEMA marca el abono como gestionado:
  - Solicitud sin revisar, tomada o no: se anula.
  - Recobro habilitado sin cobro: queda `cobrado`, con soporte «GEMA abono n.º» y evento `cobro_registrado` de origen gema.
  - Sin valor: solo la alerta `gestionado_en_gema_sin_valor`.
  - Si el abono ya llega gestionado, no abre solicitud.
- **Caja** (`estadoCaja`):
  - Con abono, manda GEMA. Por gestionar mientras el abono esté en 0, también si la cámara no encontró recobro («falta gestionar el abono en GEMA»).
  - Sin abono, solo cuenta lo reportado por Revisión cartulina.
  - Los recobros que Mantenimiento registró sin abono quedan fuera de Caja: hoy son 10, del 13 al 20-oct, por $311.700.
- **Por revisar cámaras:** los abonos POR GESTIONAR que la cámara aún no revisa, más lo reportado por Revisión cartulina.
- **Corrida en seco con GEMA en vivo (30-oct):**
  - Se anulan 3 solicitudes (1863621, 1863622 y 1863654).
  - Por revisar cámaras: 11 (3 abonos y 8 de cartulina).
  - Caja por gestionar: 9 (8 de cartulina y 1863625, sin recobro con el abono por gestionar).
  - Gestionado: 1863450.
  - Cuadra con la lista de GEMA.
- **Verificación:** `test:tesoreria` 98 de 98; `tsc` y `eslint` sin errores.
- **Pendiente:** decidir qué pasa con los 10 recobros de Mantenimiento sin abono y quitar «Pagó/Abono» del formulario del cajero.
