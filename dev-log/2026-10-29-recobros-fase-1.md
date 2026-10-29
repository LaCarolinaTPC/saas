# 2026-10-29 · Módulo de Recobros: plan y fase 1

Pedido: actualizar el flujo de recobros según el requerimiento de Tesorería
del 28-oct (`work/Requerimiento Modulo Recobros Gestivo.md`). El plan está en
`work/plan-recobros-tesoreria.md` (7 fases).

## Hallazgos en los datos

- **Dos caminos que no se tocaban:**
  - 11 revisiones `camara_recobro` con aforo, registradas por Mantenimiento sin solicitud, que nunca llegaron a caja.
  - Las solicitudes de cartulina se resolvían como `sensor_recobro` sin aforo (`resolverSolicitudCamaras` guarda `aforo: null`).
- **Abonos de GEMA «REVISIÓN CÁMARA»:** unos 7 al día. 53 de los 93 que hay desde el 13-oct ya tenían revisión de Mantenimiento, y ninguno corresponde a un recobro.

## Decisiones del usuario

- **D1 · Incobrable:** lo autoriza subgerencia por fuera de Gestivo; la directora de Tesorería lo registra con quién autorizó y el soporte.
- **D2 · Origen de la solicitud:** cada abono «REVISIÓN CÁMARA» nuevo crea una solicitud a Cámaras. Los anteriores no se cargan, salvo los 11 recobros de octubre con conteo, que sí se rescatan.
- **D4 · Correcciones:** toda corrección la valida el director de Mantenimiento.
- **D5 · Liquidación definitiva:** la cierra la directora con el concepto.
- **D6 · Roles:** subgerencia y Operativo.
- **D7 · Página:** `/tesoreria/recobros`.
- **Tarifa:** $3.700 y $3.800 (domingos y festivos), igual que el pasaje de GEMA. Octubre da 94 timbradas = **$347.800**; Tesorería había calculado $310.200 con $3.300.
- **Refresco de GEMA:** las pantallas de revisión traen los datos al abrir si tienen más de 15 minutos, y hay botón para forzarlo. Sigue el patrón de `despacho-al-dia.ts`, porque Vercel solo admite crons diarios.

## Fase 1 (commit `196e587` «Actualizacion flojo de trabajo de recobro», merge `cabd41c`)

- **`src/lib/tesoreria/recobros.ts`:** reglas puras con estado derivado (sin cron), días hábiles de lunes a sábado, plazo de 2 días hábiles, acuerdo con Operativo, semáforo, saldo, validaciones, permisos por rol, resumen y rankings.
- **Pruebas:** 15 en `recobros.test.ts`, dentro de `test:tesoreria` (86 de 86).
- **`src/lib/tesoreria/recobros-data.ts`:** lecturas paginadas.
- **Migración `20261029184904`:**
  - Columnas nuevas en la solicitud.
  - Catálogo `tesoreria_recobro_resultados` con 10 resultados.
  - Gestiones de solo inserción, mediante un trigger.
  - Tabla `tesoreria_recobro_correcciones`.
  - Rescate de los `camara_recobro` de octubre.

**Pendiente:**
- Aplicar la migración en el SQL Editor y verificar: 11 viajes con conteo, 94 timbradas, $347.800.
- **Para la fase 5:**
  - Pasar a `sin_conteo` los recobros sin conteo.
  - Exigir en el CHECK del incobrable el nombre de quien autorizó en subgerencia y el soporte.
  - Permitir el pago sin recibo.
- Siguiente: fase 2 (abonos → solicitud, refresco de GEMA y revisión con conteo en Mantenimiento).

## Fase 2 · Abonos de GEMA → solicitud y revisión con conteo

La migración de la fase 1 quedó aplicada. Esta fase no tiene migración.

- **Abono → solicitud** (`recobros-solicitudes.ts › sincronizarSolicitudesDesdeAbonos`, regla pura `planSolicitudesDesdeAbonos`):
  - Cada abono «REVISIÓN CÁMARA» no anulado abre una solicitud por viaje.
  - Si el viaje ya tenía solicitud de cartulina, se le anota el abono.
  - Si GEMA anula o borra el abono antes de que se tome la revisión, la solicitud se anula; si ya se tomó, solo queda la alerta.
  - Corre en el cron (`runSync`) y en el refresco del día.
  - **Está apagado** hasta que un administrador lo active en Cámaras › Solicitudes. Así arranca desde hoy sin cargar abonos viejos, y una prueba en local no crea solicitudes en la base real.
- **Refresco de GEMA** (`src/lib/gema/recobros-al-dia.ts`):
  - Trae abonos, recaudo y despacho de hoy y ayer. El despacho va por `refrescarDespachoDelDia`, que tiene su propio candado.
  - Ventana de 15 minutos y candado propio en `gema_sync_state` (fila `recobros_al_dia`).
  - Medido contra GEMA: unos 2,4 s.
  - En Cámaras › Solicitudes se refresca solo al abrir y tiene botón. En Revisión cartulina, solo botón, para no hacer más lenta esa pantalla.
- **Bandeja de Mantenimiento:**
  - Semáforo por días hábiles, origen, «Tomar revisión» y filtro de anuladas.
  - Conteo del video con registradora, diferencia y valor calculados en vivo.
  - Tres resultados: Recobro, Sin recobro y Sin conteo (decide subgerencia).
  - Reutiliza la revisión ya registrada por el formulario si el conteo coincide.
- **Formulario:** un `camara_recobro` con conteo resuelve la solicitud de su viaje o abre una ya resuelta (origen Mantenimiento).
- **Pestaña vieja de caja:** muestra «Sin conteo · decide subgerencia» y «Anulada».
- **Verificación:**
  - 17 pruebas de recobros (88 en `test:tesoreria`); `tsc` y `eslint` sin errores.
  - En seco, los 12 abonos de ayer y hoy abrirían 12 solicitudes.
  - Vista previa temporal con Playwright en escritorio y celular, sin errores. Ya está borrada.

**Pendiente:**
- Activar las solicitudes desde abonos en producción, una vez esto esté en `main`.
- Probar con sesión.

## Fase 3 · Recobro por cartulina (lo define la auxiliar)

- **Migración `20261029202014`:** columna `genera_recobro` en `tesoreria_revision_novedades` y novedad de sistema «Recobro por cartulina». «No justificado — cobrar/descontar» conserva su sentido histórico y no crea recobros.
- **Al elegir «Recobro por cartulina»:**
  - La auxiliar digita las timbradas sin justificar. Se sugiere el exceso del descuento real sobre el autorizado (`excesoDescuento`).
  - La observación es obligatoria.
  - Gestivo abre el recobro ya resuelto (tipo y origen cartulina; solicitud, toma y resolución con la misma marca de tiempo). El valor sale del pasaje de GEMA o, si no lo trae, de la tarifa.
  - El recobro llega a caja.
- **Un recobro creado no se deshace desde la revisión** (`decidirMarcaCartulina`): ni «Quitar revisión» ni cambiar la novedad. Eso es una corrección (fase 5). Si el viaje ya tiene solicitud de cámara, no se abre recobro por cartulina.
- **«Enviar a revisión de cámaras»:** ahora guarda tipo, origen y motivo, y deja el evento `solicitud_creada`.
- **Pantallas:** la pestaña vieja de caja rotula «Recobro por cartulina · N timbradas · $valor». El catálogo se lee con `*` para no romperse antes de aplicar la migración.
- **Verificación:**
  - 18 pruebas de recobros (93 en `test:tesoreria`); `tsc` y `eslint` sin errores.
  - Vista previa con el día real 28-oct y Playwright (panel del viaje en escritorio y celular), sin guardar nada. Ya está borrada.
