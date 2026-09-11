// Catálogo semántico del MCP: dominio "ausentismo", registro diario de ausencias.
//
// Fuentes verificadas: migraciones 042_ausentismo_registros,
// 20260902162916 (vehículo, rango y soporte), 20260902180848 (conceptos y
// trazabilidad), 20260902220946 (catálogos validados), 20260903181842 (trigger
// IPS/profesional), 20260904173119 (notificaciones); código en
// src/lib/ausentismo/constants.ts y data.ts, src/app/(dashboard)/ausentismo/
// actions.ts, page.tsx, ausentismo-client.tsx, matriz/actions.ts,
// src/lib/ausentismo/matriz.ts, src/lib/riesgo/variables.ts y
// scripts/migrar-ausentismo-registros.mts; docs/migracion-ausentismo-registros-2026.md.

import type { DocRecurso } from "./tipos";

const FECHA_DIA = "YYYY-MM-DD (tipo date, sin hora ni zona): día calendario de Colombia";
const TS_UTC =
  "timestamptz guardado en UTC (Colombia = UTC−5); para el día local usar AT TIME ZONE 'America/Bogota' o filtrar con desfase -05:00";
const MARCA_MIGRACION = "migracion:Bd_ausentismo_2026.xlsx";

export const RECURSOS_AUSENTISMO_DIARIO: DocRecurso[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // Registro diario de ausencias
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "ausentismo_registros",
    dominio: "ausentismo",
    titulo: "Ausencias diarias de conductores",
    resumen:
      "Quién faltó cada día y por qué (permiso, no justificada, incapacidad, vacaciones, taller…), con soporte, vehículo afectado y reclasificaciones; base de reincidencia y alertas de descargos.",
    granularidad:
      "Una fila = un conductor ausente en un día operativo (fecha), aunque puede cubrir un rango fecha_inicio..fecha_fin. La base NO garantiza unicidad (sin índice único): la app bloquea un segundo registro del mismo conductor y fecha al crear, pero no al editar. Al 2026-09-09 había 0 pares (fecha, cedula) repetidos.",
    descripcion:
      "Reemplaza la planilla diaria de ausentes de Recepción (Excel \"AUSENTES DE 2026\"). Solo conductores del maestro. Cada ausencia se anota normalmente como una fila por día; una ausencia larga puede venir en una sola fila con rango. Alimenta las pestañas Registro del día, Historial y Reincidentes, y el modelo de riesgo. NO contiene diagnósticos, días de incapacidad pagados ni cobro a EPS (eso es la matriz ausentismo), ni los viajes perdidos de GEMA. Las eliminaciones son físicas: la fila desaparece y el rastro queda en una bitácora no expuesta (ausentismo_log).",
    origen:
      `Histórico 2026-01-01 a 2026-08-31: migración única del Excel Bd_ausentismo_2026.xlsx el 2026-09-09 (3.537 filas, created_by_email = "${MARCA_MIGRACION}"). Resto (152 filas al 2026-09-09, y todo lo nuevo): formulario Ausentismo › Registro del día, capturado por RRHH al momento; fecha de inicio del uso del formulario no verificada. Sin sincronización automática. No hay datos anteriores a 2026.`,
    identificador: "id",
    columnaFecha: "fecha",
    volumen:
      "3.689 filas del 2026-01-01 al 2026-09-08 (al 2026-09-09); unas 450 por mes, ~5.000 al año. PostgREST corta en 1.000 filas por petición: acotar por fecha o paginar.",
    columnasPorDefecto: [
      "id",
      "fecha",
      "cedula",
      "codigo",
      "nombre",
      "tipo",
      "contacto",
      "soporte",
      "fecha_inicio",
      "fecha_fin",
      "codigo_vehiculo",
      "tipo_inicial",
    ],
    columnas: {
      id: { descripcion: "Identificador UUID del registro." },
      fecha: {
        descripcion:
          "Día operativo en que el conductor faltó y se registró. Es la fecha que usan Registro del día, Historial y la ventana de reincidencia. El formulario propone hoy en hora de Colombia y no admite fechas futuras.",
        formato: FECHA_DIA,
      },
      cedula: {
        descripcion: "Cédula del conductor, solo dígitos. Clave de cruce.",
        relacion: "conductores_con_grupo.cedula",
      },
      codigo: {
        descripcion: "Código de personal del conductor en GEMA, copiado al registrar.",
        relacion: "conductores_con_grupo.codigo",
        advertencia: "Puede ser nulo; cruce por cedula.",
      },
      nombre: {
        descripcion: "Nombre del conductor al registrar (foto; no se actualiza si cambia el maestro).",
      },
      telefono: {
        descripcion: "Teléfono de contacto; si no se digita, se toma celular o teléfono del maestro conductores.",
        sensible: true,
      },
      tipo: {
        descripcion:
          "Concepto ACTUAL de la ausencia: clave de ausentismo_conceptos (llave foránea). Puede reclasificarse después (p. ej. no_justificada → incapacidad al llegar el soporte).",
        relacion: "ausentismo_conceptos.key",
        valores: {
          incapacidad: "Incapacidad médica (exige soporte; cuenta para reincidencia).",
          permiso: "Permiso; en el histórico incluye trámite de licencia y reunión.",
          vacaciones: "Vacaciones programadas; NO cuenta para reincidencia.",
          descanso: "Descanso programado; NO cuenta para reincidencia.",
          suspension: "Suspensión disciplinaria.",
          calamidad: "Calamidad familiar (exige soporte).",
          licencia: "Licencia de paternidad, maternidad o luto (exige soporte).",
          eps: "Cita médica o trámite en EPS (exige soporte).",
          taller: "Vehículo en taller: el conductor no opera por el bus.",
          no_justificada: "Falta sin justificación; en el histórico incluye \"sin contacto\". Única que alimenta la racha de descargos/terminación.",
          renuncia: "Renuncia o retiro.",
          otra: "Otra causa; en el histórico incluye cobro de viajes.",
        },
        advertencia:
          "Lista abierta: RRHH crea conceptos desde el formulario sin migración. Qué cuenta como reincidencia sale de ausentismo_conceptos.cuenta_reincidencia, no de esta lista.",
      },
      contacto: {
        descripcion: "Resultado del intento de localizar al conductor; el formulario solo lo guarda si tipo = no_justificada.",
        valores: {
          apagado: "Teléfono apagado.",
          no_contesta: "No contesta.",
          desvia_llamadas: "Desvía las llamadas.",
          localizado: "Se logró hablar con él.",
        },
        advertencia: "Sin CHECK en la base (lo valida la app). Nulo en la mayoría de filas; en el histórico se dedujo del texto de la justificación y nunca vale localizado.",
      },
      justificacion: {
        descripcion: "Texto libre con lo que explicó el conductor o anotó Recepción.",
        advertencia:
          "En filas migradas puede traer \"Relevo: sí\" y, si se fundieron filas del Excel, textos unidos con \" | \" y \"Tipos en Excel: A, B\".",
        sensible: true,
      },
      incapacidad_inicio: {
        descripcion: "Primer día de la incapacidad médica según el certificado; el formulario solo lo guarda si tipo = incapacidad.",
        formato: FECHA_DIA,
        advertencia: "Opcional: 115 incapacidades del histórico entraron sin estas fechas (ilegibles en el Excel).",
        sensible: true,
      },
      incapacidad_fin: {
        descripcion: "Último día de la incapacidad médica (incluido). Solo con tipo = incapacidad.",
        formato: FECHA_DIA,
        sensible: true,
      },
      reintegro: {
        descripcion: "Día previsto o real de regreso al trabajo.",
        formato: FECHA_DIA,
        advertencia: "Opcional y no se actualiza solo; 21 del histórico quedaron vacíos por fecha ilegible.",
      },
      soporte: {
        descripcion: "Seguimiento del documento que justifica la ausencia. Por defecto no_aplica.",
        valores: {
          no_aplica: "No requiere soporte.",
          pendiente: "Debe traer soporte: cuenta como alerta \"alta\" en Reincidentes.",
          presentado: "Soporte entregado (en el histórico, \"Registrado\" y \"Entregado\").",
        },
        advertencia: "Sin CHECK en la base (lo valida la app). pendiente no se vence solo: RRHH lo cambia al recibir el documento.",
      },
      soporte_observaciones: {
        descripcion: "Qué soporte se pidió o qué llegó. Nulo cuando soporte = no_aplica; en el histórico guarda el texto original de la columna de soporte.",
        sensible: true,
      },
      codigo_vehiculo: {
        descripcion: "Código interno del bus que deja de rodar por la ausencia (maestro vehiculos de GEMA); la placa está en ese maestro.",
        relacion: "vehiculos.codigo",
        advertencia: "Opcional (renuncias, licencias); nulo si el código no existía en el maestro.",
      },
      fecha_inicio: {
        descripcion: "Inicio de la ausencia reportada. Obligatorio en la app; en filas anteriores al 2026-09-02 y en todo el histórico migrado es igual a fecha.",
        formato: FECHA_DIA,
        advertencia: "Nullable en la base aunque en la práctica siempre viene.",
      },
      fecha_fin: {
        descripcion: "Fin de la ausencia reportada (incluido). Nulo = la fila cubre solo su día (fecha).",
        formato: FECHA_DIA,
        advertencia: "Nulo en todo el histórico migrado. CHECK: fecha_fin ≥ fecha_inicio.",
      },
      tipo_inicial: {
        descripcion: "Concepto con el que se creó el registro. Lo sella un trigger al insertar y es inmutable; distinto de tipo = registro reclasificado.",
        relacion: "ausentismo_conceptos.key",
      },
      tipo_modificado_at: {
        descripcion: "Última vez que cambió tipo (trigger). Nulo si nunca se reclasificó.",
        formato: TS_UTC,
      },
      modificado_por_email: {
        descripcion: "Correo de quien hizo la última edición (de cualquier campo). Nulo si nunca se editó.",
        sensible: true,
      },
      motivo_modificacion: {
        descripcion: "Motivo obligatorio (máx. 200 caracteres) de la última edición; las anteriores solo quedan en la bitácora no expuesta.",
      },
      created_by: {
        descripcion: "Usuario de Gestivo que creó el registro.",
        relacion: "profiles.id (no expuesto)",
        advertencia: "Nulo en el histórico migrado.",
      },
      created_by_email: {
        descripcion: `Correo de quien creó el registro. En el histórico migrado NO es un correo: vale "${MARCA_MIGRACION}".`,
        advertencia: `Para separar histórico de captura en la app: created_by_email=eq.${MARCA_MIGRACION}.`,
        sensible: true,
      },
      created_at: {
        descripcion: "Momento en que la fila entró a la base.",
        formato: TS_UTC,
        advertencia: "Para el histórico es 2026-09-09: nunca use created_at como fecha de la ausencia.",
      },
      updated_at: { descripcion: "Última modificación de la fila (trigger).", formato: TS_UTC },
    },
    relaciones: [
      {
        recurso: "conductores_con_grupo",
        mediante: "ausentismo_registros.cedula = conductores_con_grupo.cedula",
        descripcion: "Estado actual, antigüedad y tipo de conductor; nombre y código aquí son foto al registrar.",
      },
      {
        recurso: "ausentismo_conceptos",
        mediante: "ausentismo_registros.tipo (o tipo_inicial) = ausentismo_conceptos.key",
        descripcion: "Nombre legible del concepto y banderas cuenta_reincidencia y exige_soporte.",
      },
      {
        recurso: "vehiculos",
        mediante: "ausentismo_registros.codigo_vehiculo = vehiculos.codigo",
        descripcion: "Placa y datos del bus afectado (maestro sincronizado desde GEMA).",
      },
      {
        recurso: "ausentismo_notificaciones",
        mediante: "cedula igual y fecha entre racha_desde y racha_hasta, con tipo = no_justificada",
        descripcion: "Marca de notificación de descargos o terminación de la racha; sin llave directa.",
      },
      {
        recurso: "ausentismo",
        mediante: "cedula igual y solape de fecha con fecha_inicio..fecha_fin de la matriz",
        descripcion: "Una fila tipo incapacidad puede tener su certificado en la matriz EPS; no hay llave que los una.",
      },
    ],
    advertencias: [
      "Contar filas no es contar días: una fila con fecha_fin cubre fecha_inicio..fecha_fin. Días de una fila = fecha_fin − fecha_inicio + 1, o 1 si fecha_fin es nulo.",
      "Reincidencia (regla de la app): conductor con 3 o más filas cuyo concepto tiene cuenta_reincidencia = true (todo salvo vacaciones y descanso) en los 30 días calendario que terminan en el corte, ambos incluidos, filtrando por fecha; la pantalla permite ventana 30/60/90 y mínimo 2/3/4. También entra con soporte = pendiente, con 2 o más no_justificada o con racha ≥ 4.",
      "Racha: días calendario consecutivos cubiertos por filas tipo = no_justificada (fecha más su rango fecha_inicio..fecha_fin) dentro de la ventana; se toma la más reciente. 4 días = citación a descargos; 5 o más = terminación de contrato. Un día sin registro (fin de semana, descanso) corta la racha. Niveles de alerta: terminacion > descargos > critica (2+ no_justificada) > alta (1 no_justificada o soporte pendiente).",
      "tipo es la clasificación vigente; para medir cuántas faltas se registraron como no justificadas y luego se justificaron, compare tipo_inicial con tipo.",
      "Histórico incompleto: la migración dejó fuera 87 filas sin cédula (82 de mayo de 2026, que queda subcontado), 27 con fecha de 2025 y las filas \"Asistió / Llegó tarde\". Julio venía duplicado en el Excel y se fundió por conductor y día.",
      "Las ausencias eliminadas desaparecen de la tabla: no hay filtro de eliminados.",
      "tipo y fechas de incapacidad son información laboral y de salud: preferir conteos agregados a listados nominales.",
    ],
    noConfundirCon: [
      {
        recurso: "ausentismo",
        diferencia:
          "La matriz EPS: una fila por certificado de incapacidad o licencia (inicial o prórroga), de conductores y administrativos, con CIE10, días perdidos y pagador EPS/ARL; sirve para cobro e indicadores médicos. ausentismo_registros es el control operativo de quién faltó cada día por cualquier causa. Una incapacidad puede estar en las dos sin llave común: nunca sume ambas.",
      },
      {
        recurso: "ausentismo_notificaciones",
        diferencia: "Solo guarda la marca de que RRHH notificó descargos o terminación; la alerta y la racha se calculan de esta tabla.",
      },
      {
        recurso: "viajes_perdidos",
        diferencia: "Viajes que GEMA marcó como no hechos, con novedades como \"ausencia conductor\"; es otra fuente, por viaje y no por día, y no coincide uno a uno con estas ausencias.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Quién faltó el 2026-09-10 y qué buses quedaron sin conductor?",
        como: "fecha=eq.2026-09-10; listar cedula, codigo, tipo, soporte y codigo_vehiculo; unir con vehiculos por codigo_vehiculo para la placa.",
      },
      {
        pregunta: "¿Cuántas faltas no justificadas hubo por mes en 2026?",
        como: "tipo=eq.no_justificada, fecha=gte.2026-01-01&fecha=lte.2026-12-31; agrupar por mes de fecha, contar id y cedula distintas (mayo está subcontado por la migración).",
      },
      {
        pregunta: "¿Qué conductores son reincidentes al corte 2026-09-10?",
        como: "fecha=gte.2026-08-12&fecha=lte.2026-09-10; excluir los tipo cuyo concepto tiene cuenta_reincidencia=false (vacaciones, descanso); agrupar por cedula y quedarse con 3 o más filas. Para descargos/terminación, calcular la racha de días consecutivos con tipo=no_justificada.",
      },
      {
        pregunta: "¿Quién debe soportes?",
        como: "soporte=eq.pendiente, ordenar por fecha; agrupar por cedula y tipo.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogo de conceptos de ausencia
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "ausentismo_conceptos",
    dominio: "ausentismo",
    titulo: "Tipos de ausencia",
    resumen:
      "Catálogo de conceptos (tipos) de ausencia del registro diario, con las reglas de si cuentan para reincidencia y si exigen soporte.",
    granularidad: "Una fila = un concepto. Clave única key; nombre único sin distinguir mayúsculas.",
    descripcion:
      "Define los valores válidos de ausentismo_registros.tipo y tipo_inicial y dos reglas de negocio: cuenta_reincidencia y exige_soporte. Sembrado con 12 conceptos; RRHH con permiso de edición agrega nuevos desde el formulario. Los conceptos no se borran desde la app: se desactivan en la base. No aplica a la matriz ausentismo, que usa origen (EG, EL, AT, LM, LP).",
    origen:
      "Semilla de la migración 20260902180848 (2026-09-02) con los 12 tipos que usaba la app; altas posteriores desde el formulario del registro diario. Sin sincronización.",
    identificador: "key",
    columnaFecha: "created_at",
    volumen: "Muy pequeña: 12 sembrados más los creados por RRHH.",
    columnasPorDefecto: ["key", "nombre", "orden", "activo", "cuenta_reincidencia", "exige_soporte", "created_at"],
    columnas: {
      key: {
        descripcion:
          "Clave estable que guarda ausentismo_registros.tipo. En los creados desde la app se deriva del nombre: minúsculas, sin tildes, guiones bajos, máx. 40 caracteres (\"Cita médica / EPS\" → cita_medica_eps).",
        valores: {
          incapacidad: "Incapacidad (orden 10; cuenta; exige soporte).",
          permiso: "Permiso (20; cuenta).",
          vacaciones: "Vacaciones (30; NO cuenta).",
          descanso: "Descanso (40; NO cuenta).",
          suspension: "Suspensión (50; cuenta).",
          calamidad: "Calamidad familiar (60; cuenta; exige soporte).",
          licencia: "Licencia paternidad/maternidad (70; cuenta; exige soporte).",
          eps: "Cita médica / EPS (80; cuenta; exige soporte).",
          taller: "Vehículo en taller (90; cuenta).",
          no_justificada: "No justificada (100; cuenta).",
          renuncia: "Renuncia / retiro (110; cuenta).",
          otra: "Otra (120; cuenta).",
        },
        advertencia: "Son los sembrados con sus banderas iniciales; las banderas pueden haberse cambiado en la base y pueden existir claves nuevas. Consulte la tabla.",
      },
      nombre: { descripcion: "Nombre legible que muestra la app (\"Calamidad familiar\")." },
      orden: {
        descripcion: "Posición en el selector (menor primero). Los creados desde la app se agregan al final.",
        advertencia: "Orden 900 = tipo suelto que existía en los registros y se dio de alta automáticamente al crear la llave foránea.",
      },
      activo: {
        descripcion: "false = ya no se ofrece para registros nuevos; los registros viejos lo conservan y siguen siendo válidos.",
      },
      cuenta_reincidencia: {
        descripcion: "true = las ausencias de este concepto suman para ser reincidente. false = programadas (vacaciones, descanso), no suman.",
      },
      exige_soporte: {
        descripcion: "true = al elegirlo, el formulario propone soporte = pendiente. Es sugerencia, no obligación: el registro puede guardarse con otro valor.",
      },
      created_by_email: {
        descripcion: "Correo de quien creó el concepto desde la app. Nulo en los 12 sembrados.",
        sensible: true,
      },
      created_at: { descripcion: "Alta del concepto (en los sembrados, cuando se aplicó la migración).", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      {
        recurso: "ausentismo_registros",
        mediante: "ausentismo_conceptos.key = ausentismo_registros.tipo (o tipo_inicial)",
        descripcion: "Uno a muchos: etiqueta y reglas de cada ausencia.",
      },
    ],
    advertencias: [
      "Para excluir lo programado en conteos de reincidencia use cuenta_reincidencia=false, no una lista fija de claves.",
      "No filtre por activo=true al etiquetar histórico: registros viejos pueden usar conceptos inactivos.",
    ],
    noConfundirCon: [
      {
        recurso: "ausentismo_catalogos",
        diferencia: "Listas de la matriz EPS (EPS, ARL, IPS, profesionales, CIE10, GRD, origen); nada que ver con los tipos de ausencia diaria.",
      },
      {
        recurso: "ausentismo",
        diferencia: "La matriz clasifica por origen (EG, EL, AT, LM, LP), no por estos conceptos.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué tipos de ausencia cuentan para reincidencia?",
        como: "cuenta_reincidencia=is.true; ordenar por orden.",
      },
      {
        pregunta: "¿Qué conceptos creó RRHH después de la semilla?",
        como: "created_by_email=not.is.null; ordenar por created_at.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Notificaciones de descargos y terminación
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "ausentismo_notificaciones",
    dominio: "ausentismo",
    titulo: "Notificaciones de descargos y terminación por faltas",
    resumen:
      "Marcas de \"ya notificado\" de la citación a descargos (4 días seguidos sin justificar) y de la terminación de contrato (5 o más) a conductores.",
    granularidad:
      "Una fila = una notificación de un nivel a un conductor por una racha de faltas. Una racha de 5+ días suele tener dos filas (descargos y terminación). Garantizado: una sola vigente (no anulada) por (cedula, nivel, racha_desde); las anuladas pueden repetirse.",
    descripcion:
      "RRHH la marca en Ausentismo › Reincidentes cuando entrega la notificación. Solo registra que se notificó, cuándo y por quién; la alerta, la racha y los pendientes de notificar se calculan en vivo desde ausentismo_registros y NO se guardan. Una marca errada no se borra: se anula con motivo y deja de contar. No registra el resultado del proceso disciplinario (descargos realizados, despido efectivo).",
    origen:
      "Botón \"Marcar como notificado\" de la pestaña Reincidentes, desde la migración 20260904173119 (2026-09-04). Sin datos anteriores ni carga masiva.",
    identificador: "id",
    columnaFecha: "notificado_en",
    volumen: "Muy pequeña (decenas como máximo); volumen real no verificado.",
    columnasPorDefecto: [
      "id",
      "cedula",
      "codigo",
      "nombre",
      "nivel",
      "racha_desde",
      "racha_hasta",
      "dias",
      "notificado_en",
      "anulada_en",
      "created_at",
    ],
    filtroPorDefecto: {
      columna: "anulada_en",
      operador: "is",
      valor: null,
      motivo:
        "Una marca anulada se registró por error y deja de contar como notificación; se conserva solo como rastro. Desactívelo únicamente para auditar anulaciones.",
    },
    columnas: {
      id: { descripcion: "Identificador UUID de la marca." },
      cedula: { descripcion: "Cédula del conductor notificado, solo dígitos.", relacion: "conductores_con_grupo.cedula" },
      codigo: { descripcion: "Código de personal en GEMA al marcar; puede ser nulo.", relacion: "conductores_con_grupo.codigo" },
      nombre: { descripcion: "Nombre del conductor al marcar (foto)." },
      nivel: {
        descripcion: "Qué se notificó (CHECK).",
        valores: {
          descargos: "Citación a descargos: racha de 4 o más días seguidos sin justificar.",
          terminacion: "Notificación de terminación de contrato: racha de 5 o más días.",
        },
      },
      racha_desde: {
        descripcion: "Primer día de la racha de faltas no justificadas que motivó la notificación.",
        formato: FECHA_DIA,
      },
      racha_hasta: {
        descripcion: "Último día de la racha conocido al marcar. CHECK: ≥ racha_desde.",
        formato: FECHA_DIA,
        advertencia: "Foto al marcar: si la racha se alargó después no se actualiza; la app empareja por solapamiento de fechas.",
      },
      dias: {
        descripcion: "Días calendario seguidos de la racha al marcar. La app exige ≥ 4 para descargos y ≥ 5 para terminación.",
        unidad: "días calendario",
      },
      notificado_en: {
        descripcion: "Día en que se entregó la notificación al conductor, digitado por RRHH (no posterior a hoy).",
        formato: FECHA_DIA,
        advertencia: "No es cuándo se marcó en el sistema (created_at).",
      },
      observaciones: {
        descripcion: "Nota libre (máx. 300 caracteres): medio de entrega, acta, etc.",
        sensible: true,
      },
      created_by: { descripcion: "Usuario que hizo la marca.", relacion: "auth.users.id (no expuesto)" },
      created_by_email: { descripcion: "Correo de quien hizo la marca.", sensible: true },
      created_at: { descripcion: "Momento en que se registró la marca.", formato: TS_UTC },
      anulada_en: {
        descripcion: "Momento de la anulación. Nulo = marca vigente.",
        formato: TS_UTC,
      },
      anulada_por_email: { descripcion: "Correo de quien anuló la marca.", sensible: true },
      motivo_anulacion: { descripcion: "Motivo obligatorio de la anulación (máx. 200 caracteres).", sensible: true },
    },
    relaciones: [
      {
        recurso: "ausentismo_registros",
        mediante: "cedula igual y ausentismo_registros.fecha entre racha_desde y racha_hasta, con tipo = no_justificada",
        descripcion: "Las faltas que forman la racha; sin llave directa.",
      },
      {
        recurso: "conductores_con_grupo",
        mediante: "ausentismo_notificaciones.cedula = conductores_con_grupo.cedula",
        descripcion: "Estado actual del conductor (si ya figura RETIRADO tras la terminación).",
      },
    ],
    advertencias: [
      "Ausencia de fila no significa que no haya alerta: los pendientes de notificar se calculan desde ausentismo_registros (racha ≥ 4 sin marca vigente que se solape).",
      "Una racha de terminación normalmente tiene también su fila de descargos: para contar conductores notificados use cedula distintas, no filas.",
      "Es información disciplinaria nominal: preferir conteos por nivel y mes.",
    ],
    noConfundirCon: [
      {
        recurso: "ausentismo_registros",
        diferencia: "Contiene las faltas diarias de las que sale la racha; esta tabla solo guarda la constancia de notificación.",
      },
      {
        recurso: "ausentismo",
        diferencia: "Matriz EPS de incapacidades médicas; no interviene en descargos ni terminación.",
      },
      {
        recurso: "accidente_evaluaciones",
        diferencia: "Correctivos por accidentes de tránsito (niveles I–IV); estas notificaciones son por faltas sin justificar.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántas citaciones a descargos y terminaciones se notificaron en agosto de 2026?",
        como: "Con el filtro por defecto (anulada_en=is.null): notificado_en=gte.2026-08-01&notificado_en=lte.2026-08-31; agrupar por nivel y contar cedula distintas.",
      },
      {
        pregunta: "¿Qué conductores con racha de 4+ días aún no han sido notificados?",
        como: "No se responde solo aquí: calcular rachas de tipo=no_justificada en ausentismo_registros y descartar las que tengan fila vigente del nivel con racha_desde ≤ fin de la racha y racha_hasta ≥ inicio.",
      },
      {
        pregunta: "¿Qué marcas se anularon y por qué?",
        como: "Desactivar el filtro por defecto; anulada_en=not.is.null; leer motivo_anulacion.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Catálogos validados de la matriz EPS
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "ausentismo_catalogos",
    dominio: "ausentismo",
    titulo: "Catálogos de la matriz EPS (EPS, ARL, IPS, CIE10, GRD)",
    resumen:
      "Listas validadas que usa la matriz de incapacidades: EPS, ARL, IPS, profesionales, códigos CIE10 con su diagnóstico y GRD, orígenes y la regla letra CIE10 → GRD.",
    granularidad:
      "Una fila = un valor de una lista (tipo). Único por tipo y nombre normalizado (sin tildes ni mayúsculas) salvo CIE10 y CIE10_LETRA; único por tipo y código cuando hay código; CIE10_LETRA admite varias filas por letra.",
    descripcion:
      "Sembrado el 2026-09-02 desde las 628 filas de la matriz ausentismo. El formulario de la Matriz EPS exige que EPS, ARL, IPS, profesional, CIE10, GRD y origen existan aquí y estén activos; un trigger reescribe ips y profesional_responsable de la matriz con el nombre canónico de este catálogo. NO contiene incapacidades ni personas incapacitadas, y no tiene relación con el registro diario de ausencias.",
    origen:
      "Semilla de la migración 20260902220946; altas desde los selectores de la Matriz EPS (EPS, ARL, IPS, PROFESIONAL, CIE10) y, mientras existió la carga por Excel, IPS/profesionales nuevos que el trigger daba de alta sin verificar. ORIGEN y GRD son listas cerradas: solo cambian en la base.",
    identificador: "id",
    columnaFecha: "ultimo_uso",
    volumen: "Pequeña: cientos de filas como mucho (cifra exacta no verificada).",
    columnasPorDefecto: ["id", "tipo", "codigo", "nombre", "relacionado", "activo", "verificado", "usos", "ultimo_uso"],
    columnas: {
      id: { descripcion: "Identificador UUID del valor." },
      tipo: {
        descripcion: "Lista a la que pertenece (CHECK). Define cómo leer codigo, nombre y relacionado.",
        valores: {
          ORIGEN: "Origen de la incapacidad. codigo = EG, EL, AT, LM o LP; nombre = descripción (Enfermedad general…).",
          GRD: "Grupo relacionado de diagnóstico. nombre = el grupo; sin código.",
          EPS: "Entidad promotora de salud. nombre = entidad; codigo = NIT o código Supersalud (nulo en lo sembrado).",
          ARL: "Administradora de riesgos laborales. Igual que EPS; sembradas las que la matriz traía en la columna eps con nombre \"ARL…\".",
          AFP: "Fondo de pensiones. Permitido por el CHECK, pero ni la semilla ni la app lo crean.",
          IPS: "Clínica o centro que expide la incapacidad. nombre = IPS.",
          PROFESIONAL: "Médico que firma. nombre = profesional; relacionado = su IPS más frecuente.",
          CIE10: "Código de diagnóstico. codigo = CIE10 en mayúsculas sin punto (M545); nombre = diagnóstico (DX); relacionado = GRD.",
          CIE10_LETRA: "Regla para proponer el GRD. codigo = letra inicial del CIE10; nombre = GRD que propone; puede haber varias por letra (H: oído y ojo).",
        },
        advertencia: "AFP probablemente vacía (no verificado en la base).",
      },
      codigo: {
        descripcion: "Código según tipo: CIE10, letra, código de origen, o NIT/código de EPS/ARL (obligatorio al crearlas desde la app, 3 a 20 caracteres).",
        advertencia: "Nulo en GRD, IPS, PROFESIONAL y en EPS/ARL sembradas.",
      },
      nombre: {
        descripcion: "Escritura canónica del valor; es lo que se guarda en las columnas de texto de la matriz (eps, arl, ips, profesional_responsable, grd, diagnostico).",
        advertencia: "En PROFESIONAL es el nombre de una persona.",
      },
      relacionado: {
        descripcion: "CIE10: GRD del código. PROFESIONAL: IPS habitual. Nulo en los demás tipos.",
        advertencia: "Para PROFESIONAL es la IPS más frecuente o la primera con que apareció; un profesional puede atender en varias.",
      },
      activo: {
        descripcion: "false = el formulario ya no lo acepta en filas nuevas; se conserva para filas viejas. La app no tiene botón para desactivar: se cambia en la base.",
      },
      verificado: {
        descripcion: "true = sembrado desde la data o confirmado por un admin. false = creado desde un selector o por una carga de Excel, pendiente de revisión, pero utilizable.",
        advertencia: "No se encontró en el código una acción para verificar: se confirma en la base.",
      },
      usos: {
        descripcion: "Veces que se ha usado en la matriz: conteo de la semilla más 1 por cada alta o edición en el formulario que lo usa.",
        unidad: "filas de la matriz",
        advertencia: "Indicativo, no exacto: una edición suma otra vez y eliminar una incapacidad no resta. Para conteos reales agrupe la tabla ausentismo.",
      },
      ultimo_uso: {
        descripcion: "Mayor fecha_inicio de una incapacidad que lo usó.",
        formato: FECHA_DIA,
        advertencia: "Es la fecha de la incapacidad, no cuándo se usó el catálogo; nulo si nunca se usó.",
      },
      created_by_email: { descripcion: "Correo de quien lo creó desde la app; nulo en lo sembrado y en lo creado por el trigger.", sensible: true },
      created_at: { descripcion: "Alta del valor.", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      {
        recurso: "ausentismo",
        mediante:
          "Por texto, sin llave foránea: ausentismo.eps/arl/ips/profesional_responsable/grd = nombre del tipo respectivo; ausentismo.cie10 = codigo con tipo = CIE10; ausentismo.origen = codigo con tipo = ORIGEN",
        descripcion: "Comparar sin tildes ni mayúsculas si el texto de la matriz es anterior a la homologación.",
      },
    ],
    advertencias: [
      "Filtre siempre por tipo: codigo y nombre cambian de significado entre listas.",
      "No sirve para contar incapacidades por EPS o diagnóstico: use la tabla ausentismo.",
    ],
    noConfundirCon: [
      {
        recurso: "ausentismo",
        diferencia: "La matriz de incapacidades en sí; este recurso solo tiene los valores permitidos.",
      },
      {
        recurso: "ausentismo_conceptos",
        diferencia: "Tipos de ausencia del registro diario (permiso, no justificada…); no se relaciona con este catálogo.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué EPS e IPS están habilitadas en la matriz?",
        como: "tipo=in.EPS,IPS&activo=is.true; ordenar por usos descendente.",
      },
      {
        pregunta: "¿A qué diagnóstico y GRD corresponde el CIE10 M545?",
        como: "tipo=eq.CIE10&codigo=eq.M545; leer nombre (DX) y relacionado (GRD).",
      },
      {
        pregunta: "¿Qué valores faltan por verificar?",
        como: "verificado=is.false; agrupar por tipo y ordenar por created_at.",
      },
    ],
  },
];
