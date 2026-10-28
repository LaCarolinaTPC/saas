# 2026-10-27 · Recobros de cámaras: seguimiento de caja e incobrable autorizado

Pedido: si caja no cobra el recobro, que registre la fecha y la gestión del
seguimiento y que eso se vea como histórico hasta el cobro, en la pestaña de
cartulina y para tesorería, con indicadores de gestión y días de atención.
Después: que el incobrable solo lo autorice la directora de tesorería.

Decisiones consultadas:

- «No se cobró» deja de cerrar el recobro: ahora es una **gestión** (fecha,
  qué se hizo, próxima fecha opcional ≤ 90 días). Para no dejarlo abierto para
  siempre existe el **incobrable**, que caja solicita con motivo y solo
  autoriza, rechaza (con nota) o reabre la directora (sub-función sensible
  `recobros_incobrable`, se asigna usuario a usuario) o el admin.
- Los indicadores van para cartulina, directora y admin, arriba de la pestaña.
- **Días de atención**: calendario, desde el día (Bogotá) en que cámaras
  confirma el recobro hasta el cobro, la autorización o hoy. Ámbar desde 8 y
  rojo desde 16.

Cambios:

- Etapas nuevas: pendiente de caja → en seguimiento → incobrable por
  autorizar → cobrado / incobrable. Filtros «Abiertos en caja» y «Gestión
  vencida».
- Reglas en `recobros-camaras.ts` (`motivoNoPermitido`, `validarGestion`,
  `diasAtencion`, `indicadoresRecobros`, `alarmaPara`), 9 pruebas en
  `test:tesoreria`. Las acciones validan con las mismas reglas y actualizan
  con guarda para que dos personas no decidan a la vez.
- Alarma por rol: el visto a cartulina, lo abierto (con vencidas) a caja y
  cartulina, lo por autorizar solo a la directora.
- La migración pasa los «no_cobrado» existentes a seguimiento: su motivo
  queda como primera gestión (origen `migracion`).
- Diagrama del flujo en la bóveda: `Wiki/assets/tesoreria-flujo-recobros-camaras.excalidraw`.

Verificado con vista previa temporal en `/docs` y Playwright (escritorio,
formulario de gestión, filtro por autorizar, celular sin desborde ni errores
en consola), ya borrada. Las acciones no se probaron con sesión.

Commit `98680da` en `Desarrollo` (merge con `c75502e` del equipo); en `main`
con el merge `a425f40` «recobro de camaras ajuste».

**Migración aplicada** el mismo día, sin error. Verificado: 3 recobros, los 3
abiertos sin gestión; no había «no cobrado» que convertir.

**Pendiente:**

- ~~Asignar `recobros_incobrable` a la directora~~: no hace falta (ver abajo).
- Probar con sesión: gestión, cobro, solicitud, autorización, rechazo y reapertura.

## Sin «Marcar visto» en las respuestas de cámaras

Pedido: cuando cámaras resuelve y la respuesta se ve en Revisión cartulina, no
hace falta marcar visto.

- Se eliminó la etapa «Respuesta sin revisar»: la normalidad queda **Cerrada**
  en cuanto cámaras responde; el recobro va directo a caja, como ya hacía.
- Fuera el botón, el sello «Sin revisar en cartulina», la acción
  `marcarRespuestaVista` y `sinVer` de la alarma (la pestaña y el aviso solo
  cuentan recobros abiertos, vencidos y por autorizar).
- Sin migración: `visto_at` / `visto_por_email` quedan como histórico.

Verificado: `test:tesoreria` 71/71, tsc sin errores propios, vista previa
temporal con Playwright (escritorio y celular, sin errores), ya borrada.
Commit `8f1088e` «actualizacion recobro camara sin visto en revision» en
`Desarrollo`, merge `211d37d` con `0ac17ec` del equipo (reincidentes RRHH).

En `main` con el merge `d5ff6ab` «bitacora sin visto recobros» (main y
Desarrollo quedan iguales).

## Permiso de la jefe de tesorería

Dos veces se «guardó» `recobros_incobrable` y la base no tenía nada: ningún
perfil con permisos individuales ni registro `cambio_permisos_individuales` en
la auditoría. La causa: la jefe de tesorería es tipo **admin**, que pasa toda
sub-función (`subAllowed` devuelve true para el admin, con Tesorería y
«Puede editar» en su tipo) y no admite permisos individuales. Ya puede
autorizar, rechazar y reabrir incobrables sin asignarle nada.

Consecuencia aceptada por el usuario: los **19 perfiles admin** también pueden
autorizar incobrables. Se le ofrecieron dos salidas (pasarla a un tipo propio
con el permiso individual, o reservar la autorización a quien la tenga explícita
aunque sea admin) y prefirió dejarlo como está.

**Pendiente:** probar el flujo con sesión real (gestión, cobro, solicitud,
autorización, rechazo y reapertura). El commit `0ac17ec` del equipo trae la
migración `20261027161331_seguimiento_de_reincidentes_de_ausentismo.sql`;
confirmar que alguien la aplicó.
