// Catálogo semántico del dominio "mantenimiento": daños reportados por vehículo,
// alertas por daño repetido, bitácora de graduación de frenos y catálogo de
// conceptos de daño.
//
// Evidencia: supabase/migrations 048, 049, 072, 073, 20260901201601,
// 20260901202556, 20260901211004 y 20260901225228;
// supabase/imports/2026-09-01-da-o-busetas.sql; src/lib/mantenimiento/*;
// src/app/(dashboard)/mantenimiento/**; src/app/(publico)/reportar-dano/*;
// docs/migracion-072/073, docs/corte-da-o-busetas.md y
// Wiki/meta/Continuidad Mantenimiento 2026-08-25.md.
//
// "Registro de daño" (20260901225228) NO crea tablas: solo agrega la clave de
// permiso `registro_dano` y el tipo de usuario homónimo. Sus capturas, y las del
// formulario público /reportar-dano, se guardan en `mantenimiento_reportes`.
// `mantenimiento_auditoria` es una bitácora interna y no se expone.
// Lo que no se pudo verificar en el repositorio va marcado en `advertencia`.

import type { DocRecurso } from "./tipos";

const INSTANTE_UTC =
  "timestamptz (instante real en UTC). Para el día o la hora de Colombia use `AT TIME ZONE 'America/Bogota'`.";

const CODIGO_VEHICULO =
  "Código interno del vehículo en el maestro de GEMA (número de flota; es el «número interno» del formato en papel). Llave estable: sobrevive a un cambio de placa. La placa se obtiene cruzando con `vehiculos`.";

const ORIGEN_DA_O_BUSETAS =
  "El 2026-09-01 se importó el histórico del sistema anterior Da-o_Busetas (script supabase/imports/2026-09-01-da-o-busetas.sql, repetible por `source_id`).";

export const RECURSOS_MANTENIMIENTO: DocRecurso[] = [
  // ── REPORTES DE DAÑO ──────────────────────────────────────────────────────
  {
    nombre: "mantenimiento_reportes",
    dominio: "mantenimiento",
    titulo: "Reportes de daño de vehículos",
    resumen:
      "Cada daño que un conductor reporta sobre un vehículo, clasificado por concepto (FRENOS, MOTOR, LUCES…); dos del mismo vehículo y concepto en 30 días abren una alerta.",
    granularidad:
      "Una fila = un reporte de daño de un conductor sobre un vehículo y un concepto, en un instante. Varios reportes del mismo daño son filas distintas.",
    descripcion:
      "Contiene el vehículo, el conductor que reporta, el concepto, una descripción libre y la fecha y hora. Si el reporte formó parte de una recurrencia, `alerta_id` apunta a la alerta. Es la única tabla del \"Registro de daño\": el formulario interno /mantenimiento/registrar (permiso `registro_dano` o `mantenimiento`) y el formulario público /reportar-dano (conductor sin cuenta, identificado por cédula) escriben aquí. NO contiene costos, kilometraje, repuestos, fotos ni el trabajo de taller (la orden de taller está en la alerta). No es un accidente de tránsito.",
    origen:
      `Tres vías: (1) formulario público /reportar-dano, la fecha la pone el servidor; (2) formulario interno /mantenimiento/registrar, con fecha y hora digitadas por el usuario; (3) importación única del sistema origen: ${ORIGEN_DA_O_BUSETAS} Se escribe en el momento del reporte; no hay proceso por lotes. Ritmo esperado ~20 reportes al mes.`,
    identificador: "id",
    columnaFecha: "fecha_reporte",
    volumen:
      "55 filas importadas (2026-06-02 a 2026-09-01) más lo registrado después; unas decenas por mes. Consultas completas sin problema.",
    columnasPorDefecto: [
      "id",
      "fecha_reporte",
      "codigo_vehiculo",
      "cedula_conductor",
      "concepto_id",
      "descripcion",
      "alerta_id",
      "source_id",
    ],
    columnas: {
      id: { descripcion: "Identificador del reporte en Gestivo (UUID)." },
      source_id: {
        descripcion:
          "Llave del reporte en el sistema origen Da-o_Busetas. Nulo si el reporte nació en Gestivo. Sirve para distinguir lo importado.",
        advertencia: "Única cuando no es nula. Las 55 filas importadas la tienen; ninguna captura de Gestivo la tiene.",
      },
      codigo_vehiculo: {
        descripcion: CODIGO_VEHICULO,
        relacion: "vehiculos.codigo",
        advertencia:
          "Los formularios solo ofrecen vehículos con `vehiculos.estado = 1` (activos); el reporte conserva el código aunque el vehículo se desactive después.",
      },
      cedula_conductor: {
        descripcion: "Cédula del conductor que reporta el daño.",
        relacion: "conductores_con_grupo.cedula",
        advertencia:
          "Los formularios exigen conductor ACTIVO, pero la importación aceptó conductores hoy RETIRADO (9 de 35 cédulas): no filtre por estado actual al contar reportes históricos. En el formulario interno quien captura elige al conductor, que puede no ser el asignado al vehículo.",
      },
      concepto_id: {
        descripcion: "Tipo de daño reportado. El nombre (FRENOS, MOTOR…) está en `mantenimiento_conceptos`.",
        relacion: "mantenimiento_conceptos.id",
      },
      descripcion: {
        descripcion: "Texto libre del conductor o de quien captura sobre qué pasó. Opcional.",
        advertencia: "Nulo con frecuencia; sin normalizar (mayúsculas, errores de digitación).",
      },
      fecha_reporte: {
        descripcion:
          "Momento del reporte. Es la fecha que usa la regla de recurrencia (ventana de 30 días) y la que se filtra en el historial.",
        formato: INSTANTE_UTC,
        advertencia:
          "Formulario público: hora del servidor al enviar (instante real). Importación: instante real del origen. Formulario interno: la fecha y hora se digitan sin zona y el servidor las interpreta en su propia zona horaria; si el servidor corre en UTC, esas filas quedan 5 horas adelantadas respecto a la hora de Colombia digitada. La zona del servidor no está verificada. La pantalla de historial filtra por los 10 primeros caracteres (día UTC), no por el día de Colombia.",
      },
      alerta_id: {
        descripcion:
          "Alerta de recurrencia a la que quedó ligado el reporte. Nulo = el reporte no forma parte de ninguna alerta (la interfaz lo muestra como no «Recurrente»).",
        relacion: "mantenimiento_alertas.id",
        advertencia:
          "Lo llena el disparador al insertar; al cerrar una alerta, los reportes que el usuario desmarca vuelven a nulo («no era reproceso»). Por eso una alerta cerrada puede tener menos reportes ligados que su `cantidad`. Un reporte ya ligado a una alerta cerrada nunca se re-engancha a otra, aunque sigue contando para la ventana de 30 días.",
      },
      created_by: {
        descripcion: "Usuario de Gestivo que capturó el reporte en el formulario interno.",
        relacion: "profiles.id (no expuesto)",
        advertencia: "Nulo en el formulario público, en la importación y si el perfil se borró.",
      },
      created_by_email: {
        descripcion: "Correo del usuario que capturó el reporte en el formulario interno.",
        sensible: true,
        advertencia:
          "Nulo en el formulario público y en la importación. Regla práctica de origen: `source_id` no nulo = importado; `created_by_email` no nulo = formulario interno; ambos nulos = formulario público del conductor.",
      },
      created_at: {
        descripcion: "Momento en que se insertó la fila en Gestivo (auditoría técnica).",
        formato: INSTANTE_UTC,
        advertencia:
          "En las 55 filas importadas es el 2026-09-01 (fecha de la carga), no la del daño. Para análisis use `fecha_reporte`.",
      },
    },
    relaciones: [
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Placa, clase, marca, ruta y estado del vehículo." },
      { recurso: "conductores_con_grupo", mediante: "cedula_conductor = cedula", descripcion: "Nombre, estado y antigüedad del conductor que reportó." },
      { recurso: "mantenimiento_conceptos", mediante: "concepto_id = id", descripcion: "Nombre del tipo de daño." },
      { recurso: "mantenimiento_alertas", mediante: "alerta_id = id", descripcion: "Alerta de recurrencia, su estado, orden de taller y cierre." },
    ],
    advertencias: [
      "Nada de dinero, kilometraje ni medidas: solo el hecho reportado. No existen columnas de costo, prioridad ni estado en el reporte; el «estado» de un daño se deduce de su alerta.",
      "Que un daño se reporte no significa que se haya reparado ni verificado: es la palabra del conductor.",
      "Reportes duplicados por error del conductor existen (p. ej. se repitió el envío por falla de internet) y pueden abrir alertas falsas; las notas de cierre de la alerta lo aclaran.",
      "Hay datos de prueba conservados a propósito: el reporte con `source_id` que empieza por 278b9fba (vehículo 548, «PRUEBA DE AUDITORIA»). Exclúyalo en indicadores si hace falta.",
      "Histórico desde 2026-06-02 únicamente: antes de esa fecha no hay datos, no significa cero daños.",
    ],
    noConfundirCon: [
      {
        recurso: "mantenimiento_alertas",
        diferencia:
          "La alerta es la consecuencia de 2 o más reportes del mismo vehículo y concepto en 30 días; contar alertas no es contar daños.",
      },
      {
        recurso: "mantenimiento_frenos",
        diferencia:
          "Graduación de frenos es mantenimiento preventivo registrado por el supervisor; un reporte con concepto FRENOS es una falla que avisa un conductor.",
      },
      {
        recurso: "accidente_vehiculos",
        diferencia: "Los accidentes de tránsito se registran en el dominio accidentabilidad, no como reportes de daño.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué conceptos de daño se reportan más este mes?",
        como:
          "Filtre `fecha_reporte` >= primer día del mes en hora de Colombia (p. ej. '2026-09-01T05:00:00Z'), agrupe por `concepto_id` con conteo y cruce con `mantenimiento_conceptos` para el nombre.",
      },
      {
        pregunta: "¿Qué vehículos acumulan más reportes de daño?",
        como:
          "Agrupe por `codigo_vehiculo` con conteo en el rango de fechas deseado; cruce con `vehiculos.codigo` para la placa.",
      },
      {
        pregunta: "¿Cuántos reportes llegaron por el formulario del conductor frente al interno?",
        como:
          "Con `source_id` nulo: `created_by_email` nulo = formulario público; no nulo = formulario interno. Agrupe por esa condición.",
      },
      {
        pregunta: "¿Qué reportes originaron una alerta?",
        como: "Filtre `alerta_id` = id de la alerta, ordenado por `fecha_reporte` descendente.",
      },
    ],
  },

  // ── ALERTAS DE RECURRENCIA ────────────────────────────────────────────────
  {
    nombre: "mantenimiento_alertas",
    dominio: "mantenimiento",
    titulo: "Alertas de daño recurrente",
    resumen:
      "Alertas que se abren solas cuando un mismo vehículo acumula 2 o más reportes del mismo concepto en 30 días, y que Mantenimiento cierra con orden de taller y notas.",
    granularidad:
      "Una fila = un episodio de recurrencia de un vehículo y un concepto, desde que se abre hasta que se cierra. Solo puede haber una alerta abierta por vehículo y concepto; después de cerrarla, un nuevo reporte puede abrir otra.",
    descripcion:
      "Las alertas NO se generan por kilometraje, por fecha programada ni por calendario de mantenimiento preventivo: las crea un disparador de base de datos al insertar un reporte en `mantenimiento_reportes`. Regla: se cuentan los reportes del mismo `codigo_vehiculo` y `concepto_id` con `fecha_reporte` entre (fecha del nuevo reporte − 30 días) y la fecha del nuevo reporte; si son 2 o más y no hay alerta abierta, se abre una con `cantidad` = ese conteo; si ya hay una abierta, se actualiza su `cantidad`. Luego se cierra a mano en /mantenimiento/alertas con orden de taller y notas obligatorias. No contiene costos, repuestos ni fecha de reparación.",
    origen:
      `Disparador \`trg_mantenimiento_recurrencia\` en cada reporte nuevo (en tiempo real) y cierre manual por un usuario con permiso de edición de Mantenimiento. ${ORIGEN_DA_O_BUSETAS} Las 5 alertas importadas conservan su apertura y su cierre originales.`,
    identificador: "id",
    columnaFecha: "created_at",
    volumen: "5 filas importadas al 2026-09-01 (4 cerradas, 1 abierta) más las nuevas; pocas por mes.",
    columnasPorDefecto: [
      "id",
      "created_at",
      "codigo_vehiculo",
      "concepto_id",
      "cantidad",
      "estado",
      "orden_taller",
      "cerrada_at",
      "notas_cierre",
    ],
    columnas: {
      id: { descripcion: "Identificador de la alerta (UUID)." },
      source_id: {
        descripcion: "Llave de la alerta en el sistema origen Da-o_Busetas. Nulo si nació en Gestivo.",
        advertencia: "Única cuando no es nula.",
      },
      codigo_vehiculo: { descripcion: CODIGO_VEHICULO, relacion: "vehiculos.codigo" },
      concepto_id: {
        descripcion: "Concepto de daño que se repite.",
        relacion: "mantenimiento_conceptos.id",
      },
      cantidad: {
        descripcion:
          "Número de reportes del mismo vehículo y concepto dentro de la ventana de 30 días del último reporte que actualizó la alerta mientras estaba abierta. Siempre >= 2.",
        unidad: "reportes",
        advertencia:
          "No se recalcula al cerrar ni al desvincular reportes, así que puede no coincidir con los reportes que hoy tienen `alerta_id` = esta alerta. Cuenta toda la ventana de 30 días, incluso reportes ya atendidos en una alerta cerrada anterior: una alerta nueva puede nacer con cantidad 3 o 4.",
      },
      estado: {
        descripcion: "Situación de la alerta.",
        valores: {
          abierta: "Recurrencia detectada y pendiente de gestión por Mantenimiento.",
          cerrada: "Atendida: tiene orden de taller, notas, fecha de cierre y (si nació en Gestivo) quién cerró.",
        },
        advertencia: "No hay otros estados ni reapertura: una nueva recurrencia abre una fila nueva.",
      },
      orden_taller: {
        descripcion: "Número de la orden de trabajo del taller con que se atendió la alerta (p. ej. 'OTD-2026060081').",
        advertencia:
          "Nulo mientras está abierta. Texto libre: hay valores no estándar como '1' u 'OTD-PRUEBA CONTROL'. No es llave de ningún recurso expuesto.",
      },
      notas_cierre: {
        descripcion:
          "Qué se hizo o por qué no era un reproceso (p. ej. dos intervenciones distintas sobre el mismo sistema). Obligatorias al cerrar.",
        advertencia: "Nulo mientras está abierta.",
      },
      cerrada_por: {
        descripcion: "Usuario de Gestivo que cerró la alerta.",
        relacion: "profiles.id (no expuesto)",
        advertencia: "Nulo en abiertas, en las 4 cerradas importadas y si el perfil se borró.",
      },
      cerrada_at: {
        descripcion: "Momento del cierre.",
        formato: INSTANTE_UTC,
        advertencia: "Nulo mientras está abierta. Tiempo de atención = `cerrada_at` − `created_at`.",
      },
      created_at: {
        descripcion:
          "Momento en que se abrió la alerta, es decir, cuando se insertó el reporte que completó la recurrencia.",
        formato: INSTANTE_UTC,
        advertencia:
          "Es la hora de inserción, no la `fecha_reporte` del reporte que la disparó (difieren si el reporte se capturó con fecha pasada). En las importadas es la apertura original del sistema origen.",
      },
    },
    relaciones: [
      { recurso: "mantenimiento_reportes", mediante: "id = mantenimiento_reportes.alerta_id", descripcion: "Reportes ligados a la alerta (los que la originaron y no se desvincularon)." },
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Placa y datos del vehículo." },
      { recurso: "mantenimiento_conceptos", mediante: "concepto_id = id", descripcion: "Nombre del concepto." },
    ],
    advertencias: [
      "No hay prioridad, severidad ni costo: todas las alertas pesan igual.",
      "Un reporte insertado con fecha pasada solo cuenta los reportes anteriores a él dentro de 30 días; los posteriores ya existentes no se reevalúan.",
      "Si el disparador estuvo desactivado (como durante la importación) no se abren alertas; las importadas se trajeron tal cual del origen.",
      "La alerta con `source_id` que empieza por 0aed2ae2 (vehículo 548, LUCES DIRECCIONALES, orden 'OTD-PRUEBA CONTROL') nació de una prueba de auditoría y se conservó a propósito.",
    ],
    noConfundirCon: [
      {
        recurso: "mantenimiento_reportes",
        diferencia: "Los reportes son los daños individuales; la alerta agrupa los repetidos. Para volumen de daños cuente reportes.",
      },
      {
        recurso: "vw_operativo_vencimientos",
        diferencia:
          "Los vencimientos de SOAT, tecnomecánica y otros documentos del vehículo son alertas por fecha del dominio operativo; estas alertas son por daño repetido.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué alertas de mantenimiento siguen abiertas?",
        como:
          "Filtre `estado` = 'abierta', ordene por `created_at` ascendente (las más antiguas primero) y cruce `codigo_vehiculo` con `vehiculos` y `concepto_id` con `mantenimiento_conceptos`.",
      },
      {
        pregunta: "¿Cuánto tarda Mantenimiento en cerrar una alerta?",
        como:
          "Filtre `estado` = 'cerrada' y calcule `cerrada_at` − `created_at` por fila; promedie o agrupe por `concepto_id`.",
      },
      {
        pregunta: "¿Qué vehículos tienen daños que se repiten?",
        como: "Agrupe por `codigo_vehiculo` (y opcionalmente `concepto_id`) con conteo de alertas en el rango de `created_at`.",
      },
    ],
  },

  // ── GRADUACIÓN DE FRENOS ──────────────────────────────────────────────────
  {
    nombre: "mantenimiento_frenos",
    dominio: "mantenimiento",
    titulo: "Bitácora de graduación de frenos",
    resumen:
      "Registro diario, por vehículo, de si el supervisor graduó (ajustó) los frenos; alimenta el formato controlado CPA-R-31 y el indicador de vehículos sin graduación reciente.",
    granularidad:
      "Una fila = un registro de la bitácora para un vehículo en una fecha, con graduación realizada o no. Se permiten varias filas por vehículo y día.",
    descripcion:
      "Indica si en esa fecha se realizó la graduación de frenos y, si no, por qué (observación obligatoria). Es mantenimiento preventivo, independiente de los reportes de daño. NO contiene medidas (ni mm de pastillas o bandas, ni presión de aire), costos ni kilometraje: solo sí/no y texto. Un vehículo activo sin filas con `graduacion = true` en más de 30 días cuenta como «frenos vencidos» en el tablero; si nunca se graduó es el caso más grave.",
    origen:
      `Formulario /mantenimiento/frenos, lo diligencia un usuario con permiso de edición de Mantenimiento en el momento; no se permiten fechas futuras (según el día de Colombia). ${ORIGEN_DA_O_BUSETAS} Trajo 1 registro.`,
    identificador: "id",
    columnaFecha: "fecha",
    volumen: "1 fila importada al 2026-09-01 más lo registrado después; tabla pequeña (flota de ≈151 vehículos activos).",
    columnasPorDefecto: ["id", "fecha", "codigo_vehiculo", "graduacion", "observacion", "source_id"],
    columnas: {
      id: { descripcion: "Identificador del registro (UUID)." },
      source_id: {
        descripcion: "Llave del registro en el sistema origen Da-o_Busetas. Nulo si nació en Gestivo.",
        advertencia: "Única cuando no es nula.",
      },
      fecha: {
        descripcion: "Día en que se hizo (o se debió hacer) la graduación, elegido por quien registra.",
        formato: "YYYY-MM-DD (date), día calendario de Colombia",
        advertencia:
          "Puede ser una fecha pasada (registro tardío); no es la fecha de captura, que está en `created_at`.",
      },
      codigo_vehiculo: {
        descripcion: CODIGO_VEHICULO,
        relacion: "vehiculos.codigo",
        advertencia: "El formulario solo ofrece vehículos con `vehiculos.estado = 1`.",
      },
      graduacion: {
        descripcion: "Si se realizó la graduación de frenos ese día.",
        valores: {
          true: "Se graduaron los frenos. Solo estas filas cuentan como graduación.",
          false: "No se realizó; la observación explica por qué (la base rechaza la fila sin observación).",
        },
        advertencia:
          "Un registro con `false` NO es una graduación: para «última graduación» filtre `graduacion = true`.",
      },
      observacion: {
        descripcion:
          "Motivo por el que no se graduó (obligatorio si `graduacion = false`) o hallazgos del sistema de frenos (opcional si se graduó).",
      },
      registrado_por: {
        descripcion: "Usuario de Gestivo que hizo el registro.",
        relacion: "profiles.id (no expuesto)",
        advertencia: "Nulo en el registro importado y si el perfil se borró.",
      },
      registrado_por_email: {
        descripcion: "Correo del usuario que hizo el registro.",
        sensible: true,
        advertencia: "Nulo en el registro importado.",
      },
      created_at: {
        descripcion: "Momento en que se capturó el registro en Gestivo.",
        formato: INSTANTE_UTC,
      },
    },
    relaciones: [
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Placa y estado; los vehículos activos (`estado = 1`) son la flota que debe graduarse." },
    ],
    advertencias: [
      "La ausencia de filas no es un dato en la tabla: los vehículos nunca graduados solo aparecen cruzando con `vehiculos` (activos, `estado = 1`) y trátelos como el peor caso, no como 0 días.",
      "Puede haber más de un registro por vehículo y día (el formulario avisa pero no bloquea): deduplique por (`codigo_vehiculo`, `fecha`) si cuenta vehículos atendidos.",
      "El umbral de «vencido» no está en la base: el tablero usa más de 30 días y la página de reportes permite 15, 30, 45, 60 o 90.",
      "La bitácora arranca el 2026-09-01; casi todos los vehículos aparecerán como nunca graduados hasta que se alimente.",
    ],
    noConfundirCon: [
      {
        recurso: "mantenimiento_reportes",
        diferencia:
          "Un reporte con concepto FRENOS es una falla avisada por un conductor; esta tabla es el ajuste preventivo que registra el supervisor.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué vehículos activos llevan más de 30 días sin graduación de frenos?",
        como:
          "Filtre `graduacion` = true y tome el máximo de `fecha` por `codigo_vehiculo`; cruce con `vehiculos` con `estado = 1` y liste los que no tengan fecha o cuya fecha sea anterior a hoy (Colombia) − 30 días.",
      },
      {
        pregunta: "¿Cuántas graduaciones se hicieron este mes y en cuántos vehículos?",
        como:
          "Filtre `graduacion` = true y `fecha` >= primer día del mes; cuente filas y cuente `codigo_vehiculo` distintos.",
      },
      {
        pregunta: "¿Por qué no se graduaron frenos?",
        como: "Filtre `graduacion` = false en el rango de `fecha` y lea `observacion` por `codigo_vehiculo`.",
      },
    ],
  },

  // ── CONCEPTOS DE DAÑO ─────────────────────────────────────────────────────
  {
    nombre: "mantenimiento_conceptos",
    dominio: "mantenimiento",
    titulo: "Conceptos de daño",
    resumen:
      "Catálogo de los 15 tipos de daño mecánico con que se clasifican los reportes y las alertas (FRENOS, MOTOR, LUCES TRASERAS…).",
    granularidad: "Una fila = un concepto (tipo de daño). Nombre único.",
    descripcion:
      "Catálogo pequeño y casi estático. Son las quince categorías reales de la operación, idénticas por nombre a las del sistema origen Da-o_Busetas; reemplazaron el 2026-09-01 a siete conceptos iniciales (Carrocería / Golpes, Llantas / Frenos, Otro…) que ya no existen. No hay jerarquía ni prioridad por concepto.",
    origen:
      "Cargado por la migración 20260901201601 (aplicada a mano el 2026-09-01). Gestivo no tiene pantalla para administrar conceptos: solo cambia por migración.",
    identificador: "id",
    columnaFecha: "created_at",
    volumen: "15 filas.",
    columnasPorDefecto: ["id", "nombre", "descripcion", "activo", "created_at"],
    columnas: {
      id: { descripcion: "Identificador del concepto (UUID); lo referencian reportes y alertas en `concepto_id`." },
      nombre: {
        descripcion: "Nombre del tipo de daño, en mayúsculas y sin tildes tal como en el origen. Único.",
        valores: {
          "CAJA DE VELOCIDADES": "Problemas en ingreso de cambios y ruidos anormales",
          DIRECCION: "Sistema de dirección",
          "ELECTRICO (Otros)": "Toda falla eléctrica diferente a luces",
          EMBRAGUE: "Anomalías en sistema de embrague",
          FRENOS: "Sistema de frenos (el concepto más reportado: 27 de 55 en el histórico)",
          "FUGA DE AIRE": "Fugas de aire por mangueras y diafragmas",
          "FUGAS DE ACEITE": "Reporte de fugas de aceite",
          LLANTAS: "Desgaste en llantas y daños",
          "LUCES DELANTERAS": "Fallas en luces delanteras",
          "LUCES DIRECCIONALES": "Falla en luces direccionales",
          "LUCES INTERNAS": "Fallas en luces internas",
          "LUCES TRASERAS": "Fallas en luces traseras",
          MOTOR: "Ruidos anormales y pérdida de potencia",
          SUSPENSION: "Muelles, barras estabilizadoras y amortiguadores",
          TRANSMISION: "Ruidos anormales en transmisión",
        },
        advertencia:
          "Filtre por `id`, no por nombre: los nombres no llevan tildes ('DIRECCION', 'SUSPENSION') y uno lleva paréntesis ('ELECTRICO (Otros)').",
      },
      descripcion: { descripcion: "Explicación del alcance del concepto; los formularios la muestran para ayudar a elegir." },
      activo: {
        descripcion: "Si el concepto se ofrece en los formularios de reporte.",
        valores: { true: "Disponible para nuevos reportes.", false: "Retirado: no se ofrece, pero puede seguir referenciado por reportes antiguos." },
        advertencia: "Al 2026-09-01 los 15 están activos. No filtre por `activo` al nombrar reportes históricos.",
      },
      created_at: {
        descripcion: "Momento en que se insertó el concepto (la aplicación de la migración, 2026-09-01).",
        formato: INSTANTE_UTC,
        advertencia: "No tiene significado de negocio.",
      },
    },
    relaciones: [
      { recurso: "mantenimiento_reportes", mediante: "id = mantenimiento_reportes.concepto_id", descripcion: "Reportes de ese tipo de daño." },
      { recurso: "mantenimiento_alertas", mediante: "id = mantenimiento_alertas.concepto_id", descripcion: "Alertas de recurrencia de ese tipo de daño." },
    ],
    advertencias: [
      "Ningún documento anterior al 2026-09-01 con los siete conceptos viejos (Carrocería / Golpes, Vidrios / Espejos, Llantas / Frenos…) aplica: esos conceptos se borraron sin reportes asociados.",
      "FRENOS y LLANTAS son conceptos separados; «graduación de frenos» no es un concepto sino otro recurso.",
    ],
    noConfundirCon: [
      {
        recurso: "mantenimiento_frenos",
        diferencia: "El concepto FRENOS clasifica fallas reportadas; la graduación de frenos es la bitácora preventiva.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué tipos de daño se pueden reportar?",
        como: "Filtre `activo` = true y ordene por `nombre`.",
      },
      {
        pregunta: "¿Cuál es el id del concepto FRENOS para filtrar reportes?",
        como: "Filtre `nombre` = 'FRENOS' y use su `id` en `mantenimiento_reportes.concepto_id`.",
      },
    ],
  },
];
