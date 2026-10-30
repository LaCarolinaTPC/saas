// Catálogo semántico del dominio "tesoreria": módulo de Recobros (requerimiento
// de Tesorería del 28-oct-2026). Cada recobro es una solicitud de revisión de un
// viaje (cámara o cartulina) que, si confirma timbradas no registradas, se
// cobra al conductor con gestiones diarias de caja.
//
// Evidencia: supabase/migrations 20261022164228, 20261026213310,
// 20261027155032, 20261029184904, 20261029202014 y 20261029210226;
// src/lib/tesoreria/recobros.ts (reglas y estado derivado),
// src/lib/tesoreria/recobros-data.ts, src/lib/tesoreria/recobros-solicitudes.ts,
// src/app/(dashboard)/tesoreria/recobros/** y docs/modulos/recobros.md.
//
// `tesoreria_camaras_solicitudes_eventos` (bitácora interna de acciones) no se
// expone: la línea de tiempo se reconstruye con las columnas *_at.

import type { DocRecurso } from "./tipos";

const INSTANTE_UTC =
  "timestamptz (instante real en UTC). Para el día o la hora de Colombia use `AT TIME ZONE 'America/Bogota'`.";

const CODIGO_VEHICULO =
  "Código interno del vehículo en el maestro de GEMA (número de flota). Llave estable: sobrevive a un cambio de placa.";

const USUARIO = (que: string) => ({ descripcion: `Usuario de Gestivo que ${que}.`, sensible: true });

const ESTADO_DERIVADO =
  "El estado del recobro (Solicitud creada, En revisión, Decide subgerencia, Sin gestionar, En gestión, Plazo vencido, Incobrable por autorizar, Para liquidación definitiva, Pagado, Cerrado sin cobro, Liquidado, Anulada) NO se guarda en ninguna columna: Gestivo lo deriva al vuelo (src/lib/tesoreria/recobros.ts › estadoRecobro) con la solicitud, sus gestiones y la fecha de hoy. Aproximación con columnas: `anulada_at` no nulo → Anulada; `estado` = 'pendiente' → Solicitud creada (o En revisión si `tomado_at` no es nulo); `resultado` = 'normalidad_timbradas' → Cerrado sin cobro; `resultado` = 'sin_conteo' sin `subgerencia_decision` → Decide subgerencia (con 'no_cobrar' → Cerrado sin cobro); `cobro_estado` 'cobrado' → Pagado, 'incobrable' → Cerrado sin cobro, 'liquidacion_definitiva' → Liquidado; `valor_recibido` ≥ `valor_recobro` > 0 → Pagado; `liquidacion_marcada_at` → Para liquidación definitiva; `incobrable_solicitado_at` → Incobrable por autorizar; sin gestión 'notificado' → Sin gestionar; con ella, En gestión hasta 2 días hábiles después de la primera notificación y luego Plazo vencido. Días hábiles = lunes a sábado sin festivos de Colombia; el domingo nunca cuenta.";

export const RECURSOS_TESORERIA: DocRecurso[] = [
  // ── RECOBROS: SOLICITUD ───────────────────────────────────────────────────
  {
    nombre: "tesoreria_camaras_solicitudes",
    dominio: "tesoreria",
    titulo: "Recobros: solicitudes de revisión y cobro por viaje",
    resumen:
      "Cada viaje enviado a revisión (cámara o cartulina) y, si hubo timbradas no registradas, el recobro al conductor: conteo, valor, decisión de subgerencia, cobro, incobrable y liquidación definitiva.",
    granularidad: "Una fila = un viaje (fecha_viaje + numero de despacho) con su revisión y su recobro. Un viaje tiene a lo sumo una fila.",
    descripcion:
      "Nace de cuatro formas (`origen`): un abono «REVISIÓN CÁMARA» de GEMA (desde que un administrador lo activa en Cámaras › Solicitudes), la auxiliar de Revisión cartulina, Mantenimiento al registrar un `camara_recobro` con conteo, o la migración de la fase 1. Mantenimiento (tipo 'camara') o la auxiliar (tipo 'cartulina') la resuelve: Recobro, Sin recobro (normalidad de timbradas) o Sin conteo (decide subgerencia). El recobro habilitado pasa a la bandeja de los cajeros, que registran una gestión diaria en `tesoreria_camaras_recobro_gestiones` hasta el pago. Al resolver se fija una instantánea (timbradas, conteo, diferencia, pasaje y valor) que no cambia si GEMA reprocesa; solo se cambia por corrección aprobada.",
    origen:
      "Gestivo: Tesorería › Recobros, Revisión cartulina y Mantenimiento › Cámaras y sensores, más la sincronización de abonos de GEMA (cron diario y refresco al abrir cada 15 minutos). Tabla creada el 2026-10-22; ampliada a módulo de Recobros el 2026-10-29.",
    identificador: "id",
    columnaFecha: "fecha_viaje",
    volumen: "Del orden de 200 solicitudes al mes desde que se activaron las solicitudes por abono (≈ 7 abonos «REVISIÓN CÁMARA» al día); muy pocas terminan en recobro.",
    columnasPorDefecto: [
      "id", "fecha_viaje", "numero", "vehiculo_codigo", "conductor_cedula", "conductor_nombre", "tipo", "origen",
      "estado", "resultado", "diferencia", "valor_recobro", "valor_recibido", "cobro_estado",
    ],
    columnas: {
      id: { descripcion: "Identificador UUID de la solicitud (lo usan gestiones y correcciones)." },
      fecha_viaje: { descripcion: "Día del viaje revisado.", formato: "YYYY-MM-DD en hora de Colombia" },
      numero: { descripcion: "Número del viaje en el despacho de GEMA.", relacion: "historico_despacho.numero" },
      placa: { descripcion: "Placa del bus en el despacho (instantánea)." },
      viaje: { descripcion: "Número de viaje del bus ese día." },
      vehiculo_codigo: { descripcion: CODIGO_VEHICULO, relacion: "vehiculos.codigo" },
      conductor_cedula: { descripcion: "Cédula del conductor del viaje (a quien se le cobra).", relacion: "conductores_con_grupo.cedula" },
      conductor_nombre: { descripcion: "Nombre del conductor al crear la solicitud." },
      ruta: { descripcion: "Ruta del viaje (reprogramada si la hubo)." },
      tipo: {
        descripcion: "Qué revisión define el recobro.",
        valores: { camara: "La revisa Mantenimiento con el video.", cartulina: "La define la auxiliar de Tesorería en la Revisión cartulina («Recobro por cartulina»)." },
      },
      origen: {
        descripcion: "Cómo nació la solicitud; de aquí sale el inicio del reloj de la revisión.",
        valores: {
          abono_gema: "Un abono «REVISIÓN CÁMARA» de GEMA; el reloj cuenta desde `abono_fecha`.",
          cartulina: "La auxiliar de Revisión cartulina; el reloj cuenta desde `solicitado_at`.",
          mantenimiento: "Mantenimiento registró un `camara_recobro` sin solicitud; el reloj cuenta desde `fecha_viaje`.",
          migracion: "Cargada por migración.",
        },
      },
      estado: {
        descripcion: "Estado de la revisión (no del recobro).",
        valores: { pendiente: "Sin resultado todavía.", resuelto: "Ya tiene `resultado`." },
        advertencia: ESTADO_DERIVADO,
      },
      solicitado_por_email: USUARIO("creó la solicitud (o el texto 'migracion …')"),
      solicitado_at: { descripcion: "Momento en que se creó la solicitud.", formato: INSTANTE_UTC },
      motivo_solicitud: { descripcion: "Motivo de la solicitud." },
      nota_solicitud: { descripcion: "Nota libre de quien la pidió." },
      abono_id: { descripcion: "Abono de GEMA que la originó (solo origen abono_gema).", relacion: "abonos.id_abono" },
      abono_fecha: { descripcion: "Día del abono «REVISIÓN CÁMARA».", formato: "YYYY-MM-DD en hora de Colombia" },
      anulada_at: {
        descripcion: "Momento en que se anuló la solicitud: GEMA anuló o borró el abono antes de que se tomara la revisión.",
        formato: INSTANTE_UTC,
        advertencia: "Una anulada no es un recobro: exclúyala para contar solicitudes o recobros.",
      },
      anulada_motivo: { descripcion: "Por qué se anuló." },
      tomado_por_email: USUARIO("tomó la revisión"),
      tomado_at: { descripcion: "Momento en que el técnico o la auxiliar tomó la revisión.", formato: INSTANTE_UTC },
      resultado: {
        descripcion: "Resultado de la revisión.",
        valores: {
          recobro: "Hubo timbradas no registradas: se cobra.",
          normalidad_timbradas: "Sin recobro: el conteo cuadra.",
          sin_conteo: "No hubo conteo de cámara: decide subgerencia (`subgerencia_decision`).",
        },
      },
      nota_camaras: { descripcion: "Observación de quien resolvió la revisión." },
      resuelto_por_email: USUARIO("resolvió la revisión"),
      resuelto_at: { descripcion: "Momento de la resolución. De `inicio` a aquí se miden los días de revisión (meta: 1 día hábil).", formato: INSTANTE_UTC },
      camaras_revision_id: { descripcion: "Revisión de cámaras del formulario de Mantenimiento ligada a la solicitud.", relacion: "camaras_revisiones.id" },
      conteo_revision_id: { descripcion: "Revisión `camara_recobro` de donde salió el conteo.", relacion: "camaras_revisiones.id" },
      timbradas_registradora: {
        descripcion: "Timbradas de la registradora del viaje según GEMA (historico_despacho.timbradas), fijadas al resolver.",
        unidad: "pasajeros",
      },
      conteo_camara: { descripcion: "Pasajeros contados en el video por Mantenimiento.", unidad: "pasajeros" },
      diferencia: {
        descripcion: "Timbradas no registradas: conteo de cámara − registradora. En cartulina, las que digita la auxiliar; en sin conteo que subgerencia decide cobrar, las que fija subgerencia.",
        unidad: "timbradas",
        advertencia: "Puede ser ≤ 0 (alerta `diferencia_no_positiva`): entonces no hay valor a cobrar.",
      },
      pasaje: { descripcion: "Valor de la timbrada con que se calculó el recobro.", unidad: "COP" },
      pasaje_fuente: {
        descripcion: "De dónde salió el pasaje.",
        valores: { gema: "Pasaje del viaje en viajes_recaudados.", tarifa: "Tarifa de Tesorería: $3.700, o $3.800 domingos y festivos (configurable)." },
      },
      valor_recobro: {
        descripcion: "Valor a cobrar = max(diferencia, 0) × pasaje.",
        unidad: "COP",
        advertencia: "Nulo mientras no hay recobro habilitado (pendiente, sin recobro, sin conteo sin decidir).",
      },
      valor_recibido: {
        descripcion: "Suma de lo recibido en las gestiones de caja, con las correcciones aprobadas encima. Saldo = valor_recobro − valor_recibido.",
        unidad: "COP",
        advertencia: "En los cobros anteriores a las gestiones (flujo viejo) es igual a `cobro_valor`.",
      },
      subgerencia_decision: { descripcion: "Decisión de subgerencia en un recobro sin conteo.", valores: { cobrar: "Se cobra con las timbradas que fija subgerencia.", no_cobrar: "Se cierra sin cobro." } },
      subgerencia_nota: { descripcion: "Observación obligatoria de subgerencia." },
      subgerencia_por_email: USUARIO("registró la decisión de subgerencia"),
      subgerencia_at: { descripcion: "Momento de la decisión de subgerencia.", formato: INSTANTE_UTC },
      cobro_estado: {
        descripcion: "Cierre del recobro. Nulo mientras sigue abierto.",
        valores: {
          cobrado: "Pagado (con «Pagó completo» y el cargue en GEMA confirmado, o con el flujo anterior).",
          incobrable: "Cerrado como incobrable, autorizado por subgerencia.",
          liquidacion_definitiva: "Cerrado en la liquidación definitiva del conductor retirado.",
        },
      },
      cobro_valor: { descripcion: "Valor cobrado en el cierre.", unidad: "COP" },
      cobro_fecha: { descripcion: "Día del pago.", formato: "YYYY-MM-DD" },
      cobro_soporte: { descripcion: "Número de recibo o soporte del pago." },
      cobro_motivo: { descripcion: "Motivo del cierre en el flujo anterior." },
      cobro_nota: { descripcion: "Nota del cierre." },
      cobro_por_email: USUARIO("registró el cierre"),
      cobro_at: { descripcion: "Momento del cierre.", formato: INSTANTE_UTC },
      gestiones_n: { descripcion: "Cantidad de gestiones de caja registradas (resumen que mantiene la app)." },
      gestion_ultima_fecha: { descripcion: "Día de la última gestión.", formato: "YYYY-MM-DD" },
      gestion_proxima_fecha: { descripcion: "Fecha comprometida en la última gestión (plazo o acuerdo), si la hubo.", formato: "YYYY-MM-DD" },
      incobrable_motivo: { descripcion: "Por qué caja pide declararlo incobrable." },
      incobrable_solicitado_por_email: USUARIO("pidió el incobrable"),
      incobrable_solicitado_at: { descripcion: "Momento en que caja pidió el incobrable.", formato: INSTANTE_UTC },
      incobrable_autoriza_nombre: {
        descripcion: "Quién lo autorizó en subgerencia (la autorización se da por fuera de Gestivo).",
        advertencia: "Obligatorio solo en incobrables cerrados desde el 2026-10-30.",
      },
      incobrable_autoriza_fecha: { descripcion: "Fecha de la autorización de subgerencia.", formato: "YYYY-MM-DD" },
      incobrable_soporte: { descripcion: "Soporte de la autorización (acta, correo, número)." },
      incobrable_autorizado_por_email: USUARIO("registró el incobrable (la directora de Tesorería)"),
      incobrable_autorizado_at: { descripcion: "Momento del registro del incobrable.", formato: INSTANTE_UTC },
      incobrable_rechazo_nota: { descripcion: "Por qué se rechazó la solicitud de incobrable." },
      incobrable_rechazado_por_email: USUARIO("rechazó el incobrable"),
      incobrable_rechazado_at: { descripcion: "Momento del rechazo.", formato: INSTANTE_UTC },
      liquidacion_marcada_at: { descripcion: "Momento en que la directora pasó el recobro a liquidación definitiva (conductor retirado).", formato: INSTANTE_UTC },
      liquidacion_marcada_por_email: USUARIO("lo pasó a liquidación definitiva"),
      liquidacion_concepto: {
        descripcion: "Cómo se cerró en la liquidación definitiva.",
        valores: ["descontado_total", "descontado_parcial", "no_descontable", "otro"],
      },
      liquidacion_valor_descontado: { descripcion: "Valor descontado en la liquidación.", unidad: "COP" },
      liquidacion_soporte: { descripcion: "Soporte de la liquidación." },
      liquidacion_nota: { descripcion: "Nota del cierre por liquidación." },
      liquidacion_por_email: USUARIO("cerró la liquidación"),
      liquidacion_at: { descripcion: "Momento del cierre por liquidación.", formato: INSTANTE_UTC },
      gema_cargue_confirmado_por_email: USUARIO("confirmó el cargue del pago en GEMA"),
      gema_cargue_confirmado_at: {
        descripcion: "Momento en que caja confirmó que cargó el pago en GEMA. El cargue es manual: Gestivo solo guarda la confirmación.",
        formato: INSTANTE_UTC,
      },
      visto_at: { descripcion: "Flujo anterior (hasta 2026-10-27): momento en que la auxiliar vio la respuesta de cámaras. Ya no se usa.", formato: INSTANTE_UTC },
      visto_por_email: USUARIO("vio la respuesta en el flujo anterior"),
      alertas: {
        descripcion: "Avisos para revisar a mano.",
        valores: {
          sin_conteo_camara: "Recobro de cámara sin conteo que no pasó a sin_conteo porque caja ya lo había tocado.",
          diferencia_no_positiva: "El conteo no supera la registradora.",
          sin_timbradas_gema: "GEMA no trae las timbradas del viaje: no se pudo calcular el valor.",
          abono_anulado_en_gema: "GEMA anuló o borró el abono cuando la revisión ya estaba tomada.",
        },
      },
    },
    relaciones: [
      { recurso: "tesoreria_camaras_recobro_gestiones", mediante: "id = solicitud_id", descripcion: "Gestiones diarias de caja y pagos." },
      { recurso: "tesoreria_recobro_correcciones", mediante: "id = solicitud_id", descripcion: "Correcciones pedidas y su decisión." },
      { recurso: "historico_despacho", mediante: "numero = numero", descripcion: "Viaje en GEMA: horas, ruta, conductor y timbradas." },
      { recurso: "viajes_recaudados", mediante: "numero = numero", descripcion: "Recaudo y pasaje del viaje." },
      { recurso: "abonos", mediante: "abono_id = id_abono", descripcion: "Abono «REVISIÓN CÁMARA» que originó la solicitud." },
      { recurso: "camaras_revisiones", mediante: "camaras_revision_id / conteo_revision_id = id", descripcion: "Revisión del video de Mantenimiento." },
      { recurso: "conductores_con_grupo", mediante: "conductor_cedula = cedula", descripcion: "Estado del conductor (retirado → liquidación definitiva)." },
    ],
    advertencias: [
      ESTADO_DERIVADO,
      "Plazo de pago: 2 días hábiles desde la PRIMERA gestión con resultado 'notificado'. Un acuerdo con Operativo ('acuerdo_operativo', con `compromiso_fecha`) no borra el vencimiento: el recobro sigue en Plazo vencido con el acuerdo vigente o incumplido.",
      "Semáforo: verde hasta 1 día hábil en el estado, ámbar de 2 a 3, rojo más de 3 o plazo vencido, gris cerrado.",
      "Para «recobros» cuente solo los habilitados: `resultado` = 'recobro', o 'sin_conteo' con `subgerencia_decision` = 'cobrar'; y `anulada_at` nulo. Las demás filas son revisiones sin cobro.",
      "La mayoría de solicitudes por abono de GEMA terminan sin recobro: el abono «REVISIÓN CÁMARA» no significa que el conductor deba dinero.",
      "Antes del 2026-10-29 los recobros de cámara de cartulina se resolvían sin conteo ni valor; varios se pasaron a 'sin_conteo' el 2026-10-29 para que decida subgerencia.",
      "Las columnas *_email identifican a usuarios internos: no las use para identificar al conductor.",
    ],
    noConfundirCon: [
      { recurso: "camaras_revisiones", diferencia: "Esa es la revisión técnica del video (aforo, fallas); esta es la solicitud y el cobro al conductor." },
      { recurso: "abonos", diferencia: "El abono de GEMA es dinero registrado al viaje; aquí solo dispara la revisión." },
      { recurso: "devengados_entregas", diferencia: "Los devengados son dinero que caja ENTREGA al conductor; el recobro es dinero que el conductor DEBE." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto se ha recobrado y cuánto falta por cobrar este mes?",
        como: "Filtre recobros habilitados con `fecha_viaje` del mes y `anulada_at` nulo; recaudado = suma de `valor_recibido`; por cobrar = suma de `valor_recobro` − `valor_recibido` donde `cobro_estado` es nulo.",
      },
      {
        pregunta: "¿Qué conductores tienen más timbradas no registradas?",
        como: "Recobros habilitados con `diferencia` > 0; agrupe por `conductor_cedula` y sume `diferencia` y `valor_recobro`.",
      },
      {
        pregunta: "¿Cuántas revisiones de cámara están pendientes?",
        como: "Filtre `tipo` = 'camara', `estado` = 'pendiente' y `anulada_at` nulo.",
      },
    ],
  },
  // ── RECOBROS: GESTIONES DE CAJA ───────────────────────────────────────────
  {
    nombre: "tesoreria_camaras_recobro_gestiones",
    dominio: "tesoreria",
    titulo: "Recobros: gestiones diarias de cobro",
    resumen: "Cada gestión que caja (u Operativo) registra sobre un recobro abierto: resultado, compromiso de pago y dinero recibido.",
    granularidad: "Una fila = una gestión sobre un recobro en un día. Un recobro tiene muchas, y puede tener varias el mismo día.",
    descripcion:
      "Los cajeros registran una gestión cada día hábil mientras el recobro está en su bandeja (notificó, no vino, pidió plazo, abono parcial, pagó completo…). Operativo registra su instrucción con el plazo vencido. Es de SOLO INSERCIÓN: un trigger impide editar o borrar; un error se arregla con otra gestión o con una corrección aprobada en `tesoreria_recobro_correcciones`.",
    origen: "Tesorería › Recobros (desde 2026-10-29) y la pestaña anterior «Solicitudes a cámaras» (2026-10-27 a 2026-10-29, `resultado` = 'otro').",
    identificador: "id",
    columnaFecha: "fecha",
    volumen: "Crece con un registro por recobro abierto y día hábil.",
    columnasPorDefecto: ["id", "solicitud_id", "fecha", "resultado", "compromiso_fecha", "valor_recibido", "rol", "gema_cargue_confirmado"],
    columnas: {
      id: { descripcion: "Identificador UUID de la gestión." },
      solicitud_id: { descripcion: "Recobro gestionado.", relacion: "tesoreria_camaras_solicitudes.id" },
      fecha: { descripcion: "Día de la gestión.", formato: "YYYY-MM-DD en hora de Colombia" },
      resultado: { descripcion: "Resultado del catálogo.", relacion: "tesoreria_recobro_resultados.clave" },
      compromiso_fecha: { descripcion: "Fecha prometida de pago (pidió plazo o acuerdo con Operativo).", formato: "YYYY-MM-DD" },
      valor_recibido: {
        descripcion: "Dinero recibido en esta gestión (abono parcial o pago completo).",
        unidad: "COP",
        advertencia: "Puede haber una corrección aprobada que cambie este valor: el total vigente está en `tesoreria_camaras_solicitudes.valor_recibido`.",
      },
      autorizado_por: { descripcion: "Quién de Operativo autorizó el acuerdo (resultado 'acuerdo_operativo')." },
      observacion: { descripcion: "Observación del cajero." },
      rol: { descripcion: "Rol con que se registró.", valores: ["caja", "operativo", "directora", "sistema"] },
      gema_cargue_confirmado: { descripcion: "En «Pagó completo»: el cajero confirmó que cargó el pago en GEMA." },
      gestion: { descripcion: "Texto de la gestión del flujo anterior; en las nuevas repite la observación." },
      proxima_fecha: { descripcion: "Próxima fecha de gestión del flujo anterior.", formato: "YYYY-MM-DD" },
      origen: { descripcion: "Cómo llegó.", valores: { caja: "Registrada en Gestivo.", migracion: "Cargada por migración." } },
      usuario_email: USUARIO("registró la gestión"),
      created_at: { descripcion: "Momento del registro.", formato: INSTANTE_UTC },
    },
    relaciones: [
      { recurso: "tesoreria_camaras_solicitudes", mediante: "solicitud_id = id", descripcion: "El recobro y su conductor." },
      { recurso: "tesoreria_recobro_resultados", mediante: "resultado = clave", descripcion: "Nombre del resultado y qué exige." },
    ],
    advertencias: [
      "Días sin registro del cajero: días hábiles (lunes a sábado sin festivos) con el recobro en la bandeja de caja y sin ninguna fila aquí. Solo se exigen desde el 2026-10-29.",
      "La primera gestión 'notificado' abre el plazo de 2 días hábiles para pagar.",
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuánto recibió caja por recobros esta semana?", como: "Sume `valor_recibido` con `fecha` en la semana (verifique correcciones aprobadas de campo 'valor_recibido')." },
    ],
  },
  // ── RECOBROS: CORRECCIONES ────────────────────────────────────────────────
  {
    nombre: "tesoreria_recobro_correcciones",
    dominio: "tesoreria",
    titulo: "Recobros: correcciones validadas por el director de Mantenimiento",
    resumen: "Correcciones pedidas a un recobro (conteo, resultado, diferencia o valor recibido de una gestión) y su aprobación o rechazo.",
    granularidad: "Una fila = una corrección pedida a un campo de un recobro.",
    descripcion:
      "Las piden la auxiliar de Tesorería, caja, la directora o el director de Mantenimiento; las aprueba o rechaza el director de Mantenimiento. Lo corregido nunca se sobrescribe: el valor anterior queda aquí. Una decidida no se edita y ninguna se borra (trigger).",
    origen: "Tesorería › Recobros, desde 2026-10-29.",
    identificador: "id",
    columnaFecha: "solicitado_at",
    volumen: "Pocas filas.",
    columnasPorDefecto: ["id", "solicitud_id", "campo", "valor_anterior", "valor_nuevo", "motivo", "solicitado_at", "decision", "decidido_at"],
    columnas: {
      id: { descripcion: "Identificador UUID." },
      solicitud_id: { descripcion: "Recobro corregido.", relacion: "tesoreria_camaras_solicitudes.id" },
      campo: {
        descripcion: "Qué se corrige.",
        valores: {
          conteo_camara: "Conteo del video (recalcula diferencia y valor).",
          resultado: "Resultado de la revisión.",
          diferencia: "Timbradas no registradas.",
          valor_recibido: "Dinero recibido en una gestión (`gestion_id`).",
        },
      },
      gestion_id: { descripcion: "Gestión cuyo valor recibido se corrige (solo campo 'valor_recibido').", relacion: "tesoreria_camaras_recobro_gestiones.id" },
      valor_anterior: { descripcion: "Valor antes de la corrección, como texto." },
      valor_nuevo: { descripcion: "Valor pedido, como texto." },
      motivo: { descripcion: "Por qué se pide." },
      solicitado_por_email: USUARIO("pidió la corrección"),
      solicitado_at: { descripcion: "Momento de la solicitud.", formato: INSTANTE_UTC },
      decision: { descripcion: "Decisión. Nula mientras está por validar.", valores: ["aprobada", "rechazada"] },
      decision_nota: { descripcion: "Nota de la decisión; obligatoria al rechazar." },
      decidido_por_email: USUARIO("decidió la corrección"),
      decidido_at: { descripcion: "Momento de la decisión.", formato: INSTANTE_UTC },
    },
    relaciones: [
      { recurso: "tesoreria_camaras_solicitudes", mediante: "solicitud_id = id", descripcion: "El recobro corregido." },
      { recurso: "tesoreria_camaras_recobro_gestiones", mediante: "gestion_id = id", descripcion: "La gestión cuyo valor se corrige." },
    ],
    advertencias: ["Solo una corrección pendiente por recobro, campo y gestión. Las aprobadas ya están aplicadas en la solicitud (salvo valor_recibido de la gestión, que se aplica en el total)."],
  },
  // ── RECOBROS: CATÁLOGO DE RESULTADOS ──────────────────────────────────────
  {
    nombre: "tesoreria_recobro_resultados",
    dominio: "tesoreria",
    titulo: "Recobros: catálogo de resultados de la gestión",
    resumen: "Resultados posibles de una gestión de cobro (notificado, no vino, pidió plazo, abono parcial, pagó completo…) y qué exige cada uno.",
    granularidad: "Una fila = un resultado posible.",
    descripcion:
      "10 resultados de sistema sembrados el 2026-10-29 con la lista del requerimiento de Tesorería; Tesorería puede agregar más. Los de sistema no se renombran porque las reglas de la app usan su clave (p. ej. 'notificado' abre el plazo).",
    origen: "Migración 20261029184904.",
    identificador: "clave",
    volumen: "≈ 10 filas.",
    columnasPorDefecto: ["clave", "nombre", "exige_compromiso", "exige_valor", "exige_observacion", "cierra", "registra", "activo"],
    columnas: {
      clave: { descripcion: "Identificador estable; lo usa `tesoreria_camaras_recobro_gestiones.resultado`." },
      nombre: { descripcion: "Nombre que ve el cajero." },
      exige_compromiso: { descripcion: "Pide fecha de compromiso de pago." },
      exige_valor: { descripcion: "Pide el valor recibido." },
      exige_observacion: { descripcion: "Pide observación." },
      exige_autorizado_por: { descripcion: "Pide quién autorizó (acuerdo con Operativo)." },
      cierra: { descripcion: "Cierra el recobro (Pagó completo): exige el saldo exacto y el cargue en GEMA." },
      registra: { descripcion: "Quién lo registra.", valores: ["caja", "operativo"] },
      es_sistema: { descripcion: "Resultado de sistema: su clave la usan las reglas." },
      activo: { descripcion: "Si se ofrece en el formulario." },
      orden: { descripcion: "Orden en el formulario." },
      creado_por_email: USUARIO("lo creó"),
      created_at: { descripcion: "Momento de creación.", formato: INSTANTE_UTC },
    },
    relaciones: [
      { recurso: "tesoreria_camaras_recobro_gestiones", mediante: "clave = resultado", descripcion: "Gestiones con ese resultado." },
    ],
  },
];
