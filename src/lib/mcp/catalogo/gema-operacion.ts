// Catálogo semántico: operación de GEMA tal cual (timbradas descontadas,
// tickets transfer, anotaciones de viaje y planilla de cumplimientos).
// Verificado el 2026-09-11 contra los procedimientos de GEMA (sondeo de los
// días 2026-09-01 a 2026-09-10), la migración
// 20260911162140_tablas_espejo_de_gema_timbradas_descontadas_tickets_transfer_anotaciones_y_cumplimientos.sql,
// src/lib/gema/sync.ts y cruces contra viajes_recaudados, pv_deltas y
// conductores_con_grupo en producción.

import type { DocRecurso } from "./tipos";

const HORA_LOCAL = "timestamp sin zona: hora local de Colombia tal como la registra GEMA (no reste horas)";
const DIA = "date, día calendario en Colombia";
const SINCRONIZACION =
  "Sincronización diaria desde GEMA a las 03:00 de Colombia (cron /api/cron/sync-gema): se reemplazan completos los últimos 10 días, así que lo que se registre hoy en GEMA aparece mañana y lo que GEMA borre también desaparece. Histórico cargado desde 2026-01-01.";

const ID_INTERNO = {
  descripcion:
    "Identificador interno de Gestivo. Cambia cada vez que se vuelve a sincronizar el día: no lo use como referencia; use id_viaje.",
};
const ID_VIAJE = {
  descripcion:
    "Número del viaje (despacho) en GEMA. Es el mismo valor que viajes_recaudados.numero y pv_deltas.numero_despacho: úselo para traer conductor, recaudo o pasajeros del viaje.",
  relacion: "viajes_recaudados.numero",
};
const CODIGO_VEHICULO = {
  descripcion: "Código interno del bus en GEMA (texto, p. ej. '537'). Es la clave para cruzar con el maestro de vehículos.",
  relacion: "vehiculos.codigo",
};
const PLACA = { descripcion: "Placa del bus registrada en el viaje.", advertencia: "Puede cambiar en el tiempo; para cruzar use codigo_vehiculo." };
const NUM_VIAJE = { descripcion: "Número de vuelta del vehículo en ese día (1 = primera vuelta)." };
const SINCRONIZADO = {
  descripcion: "Momento en que Gestivo copió la fila desde GEMA.",
  formato: "timestamptz en UTC",
};
const RUTAS =
  "GEMA distingue rutas que solo difieren en los guiones (p. ej. 'A - 16 MIRAMAR' y 'A -- 16 MIRAMAR'): no las sume como una sola sin decirlo.";

export const RECURSOS_GEMA_OPERACION: DocRecurso[] = [
  // ── timbradas_descontadas ────────────────────────────────────────────────
  {
    nombre: "timbradas_descontadas",
    dominio: "gema",
    titulo: "Timbradas descontadas por viaje",
    resumen:
      "Cada descuento de pasajeros aplicado a un viaje en GEMA: cuántas timbradas, por qué motivo, a qué conductor y vehículo, quién lo registró y cuándo.",
    granularidad:
      "Una fila = un descuento registrado sobre un viaje. Un viaje puede tener varios descuentos (varias filas). No hay duplicados exactos.",
    descripcion:
      "Detalle de los descuentos que GEMA resta al conteo de la registradora de un viaje. La suma de tim_descuento por viaje coincide con viajes_recaudados.descuento en la gran mayoría de los viajes (56 de 59 revisados), y viajes_recaudados.timbradas ya trae ese descuento restado. Se guarda con los mismos nombres de columna de pa_ext_get_TimbradasDescontadasByFecha.",
    origen: `${SINCRONIZACION} Este procedimiento entrega los descuentos según el día en que se registraron (dia_generacion), no según el día del viaje.`,
    identificador: "id",
    columnaFecha: "dia_generacion",
    volumen: "Unos 370 descuentos por día (3.739 entre el 1 y el 10 de septiembre de 2026).",
    columnasPorDefecto: [
      "id_viaje",
      "fecha_viaje",
      "num_viaje",
      "codigo_vehiculo",
      "conductor",
      "identificacion_conductor",
      "tim_descuento",
      "motivo_descuento",
      "fecha_generacion",
      "usuario_generacion",
    ],
    columnas: {
      id: ID_INTERNO,
      id_viaje: ID_VIAJE,
      fecha_viaje: {
        descripcion:
          "Día operativo del viaje al que se aplicó el descuento. Puede ser anterior a la fecha de generación cuando el descuento se registró días después.",
        formato: DIA,
      },
      num_viaje: NUM_VIAJE,
      codigo_vehiculo: CODIGO_VEHICULO,
      placa_vehiculo: PLACA,
      conductor: { descripcion: "Nombre del conductor del viaje, tal como lo registra GEMA." },
      identificacion_conductor: {
        descripcion:
          "Cédula del conductor del viaje, normalizada a solo dígitos y sin ceros a la izquierda para cruzar con el maestro.",
        relacion: "conductores_con_grupo.cedula",
      },
      tim_descuento: {
        descripcion: "Cantidad de timbradas (pasajeros) descontadas en este registro.",
        unidad: "timbradas (pasajeros)",
      },
      motivo_descuento: {
        descripcion: "Motivo del descuento, tal como lo clasifica GEMA.",
        valores: [
          "POR VENTA",
          "VENTA ADICIONAL",
          "ACTUALIZACIÓN CONTEO",
          "POR ABORTADOS",
          "POR LABOR OPERATIVO",
          "SENSOR",
          "POR VARADOS EN RUTA",
          "REVISION DE CAMARAS",
          "POR ACCIDENTE",
          "MANTENIMIENTO",
        ],
        advertencia:
          "GEMA no documenta el significado de cada motivo. Son los valores observados del 1 al 10 de septiembre de 2026 (el 75 % es POR VENTA) y pueden aparecer otros: no interprete un motivo más allá de su texto.",
      },
      observacion: {
        descripcion: "Texto libre de quien registró el descuento.",
        advertencia: "Vacía en cerca del 13 % de las filas.",
      },
      fecha_generacion: {
        descripcion: "Fecha y hora en que se registró el descuento en GEMA.",
        formato: HORA_LOCAL,
      },
      dia_generacion: {
        descripcion:
          "Día en que se registró el descuento (fecha_generacion sin la hora). Es la fecha con que GEMA entrega estos datos: úsela para filtrar por periodo de registro.",
        formato: DIA,
      },
      usuario_generacion: { descripcion: "Usuario de GEMA que registró el descuento." },
      sincronizado_at: SINCRONIZADO,
    },
    relaciones: [
      { recurso: "viajes_recaudados", mediante: "id_viaje = numero", descripcion: "Recaudo, timbradas netas y descuento total del viaje." },
      { recurso: "conductores_con_grupo", mediante: "identificacion_conductor = cedula", descripcion: "Maestro del conductor." },
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Maestro del bus." },
    ],
    advertencias: [
      "Hay dos formas de fechar un descuento y dan cifras distintas: por dia_generacion (cuándo se registró) o por fecha_viaje (a qué operación corresponde). Diga siempre cuál usó.",
      "viajes_recaudados.timbradas ya tiene restado este descuento: no lo reste otra vez.",
      "Para totales use agregar_datos con sum de tim_descuento; contar filas cuenta registros de descuento, no pasajeros.",
    ],
    noConfundirCon: [
      { recurso: "viajes_recaudados", diferencia: "viajes_recaudados.descuento es el total descontado por viaje; aquí está cada descuento con su motivo y quién lo registró." },
      { recurso: "tickets_transfer", diferencia: "Los tickets transfer son otro registro de GEMA, por ticket y con tipo descuento o incentivo; no son descuentos de registradora." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántas timbradas se descontaron por motivo en agosto?",
        como: "agregar_datos agrupando por motivo_descuento con sum de tim_descuento, filtrando dia_generacion gte 2026-08-01 y lte 2026-08-31 (o fecha_viaje si la pregunta es por operación).",
      },
      {
        pregunta: "¿Qué conductores acumulan más descuentos por venta?",
        como: "agregar_datos agrupando por identificacion_conductor y conductor con sum de tim_descuento, filtro motivo_descuento eq 'POR VENTA' y un rango de fechas.",
      },
      {
        pregunta: "¿Por qué se le descontaron timbradas al viaje 123456?",
        como: "consultar_datos con filtro id_viaje eq 123456 y las columnas motivo_descuento, tim_descuento, observacion y usuario_generacion.",
      },
    ],
  },

  // ── tickets_transfer ─────────────────────────────────────────────────────
  {
    nombre: "tickets_transfer",
    dominio: "gema",
    titulo: "Tickets transfer por viaje",
    resumen:
      "Registro de tickets transfer de un viaje en GEMA: cuántos tickets, cuántos cuentan como descuento y cuántos como incentivo, y si se anuló.",
    granularidad:
      "Una fila = el registro de tickets transfer de un viaje. En los datos revisados id_viaje no se repite (un registro por viaje).",
    descripcion:
      "Cada ticket del detalle es de tipo 0 o 1. En todas las filas revisadas cantidad_total = cantidad_descuento + cantidad_incentivo y los tipos del detalle coinciden: tipo 0 cuenta como descuento y tipo 1 como incentivo. Se guarda con los mismos nombres de columna de pa_ext_get_TicketsTransferByFecha.",
    origen: `${SINCRONIZACION} Este procedimiento entrega los registros según el día en que se generaron (dia_generacion).`,
    identificador: "id",
    columnaFecha: "dia_generacion",
    volumen: "Pocos: 65 registros entre el 1 y el 10 de septiembre de 2026.",
    columnasPorDefecto: [
      "id_viaje",
      "fecha_viaje",
      "codigo_vehiculo",
      "cantidad_total",
      "cantidad_descuento",
      "cantidad_incentivo",
      "tickets",
      "estado",
      "fecha_generacion",
      "fecha_anulacion",
    ],
    columnas: {
      id: ID_INTERNO,
      id_viaje: ID_VIAJE,
      fecha_viaje: { descripcion: "Día operativo del viaje.", formato: DIA },
      num_viaje: NUM_VIAJE,
      codigo_vehiculo: CODIGO_VEHICULO,
      placa_vehiculo: PLACA,
      cantidad_total: { descripcion: "Tickets transfer registrados en el viaje.", unidad: "tickets" },
      cantidad_descuento: { descripcion: "Tickets que cuentan como descuento (tipo 0 en el detalle).", unidad: "tickets" },
      cantidad_incentivo: { descripcion: "Tickets que cuentan como incentivo (tipo 1 en el detalle).", unidad: "tickets" },
      tickets: {
        descripcion: "Números de ticket del registro en texto, p. ej. '0001'.",
        advertencia:
          "Un registro puede tener varios tickets (se observaron registros con '0001' y '0002'); el formato de este texto con varios tickets no está documentado: para contarlos o leerlos use tickets_detalles.",
      },
      tickets_detalles: {
        descripcion: "Arreglo JSON con cada ticket: [{\"num\": \"0001\", \"tipo\": 0}]. num = número del ticket; tipo 0 = descuento, 1 = incentivo.",
        formato: "jsonb",
        advertencia:
          "El significado de tipo 0 y 1 se dedujo de que coincide con cantidad_descuento y cantidad_incentivo en todas las filas revisadas; GEMA no lo documenta.",
      },
      estado: {
        descripcion: "Estado del registro en GEMA.",
        valores: { "1": "Único valor observado (registro vigente)." },
        advertencia: "Otros valores no se han observado; no se sabe si una anulación cambia el estado.",
      },
      fecha_generacion: { descripcion: "Fecha y hora en que se registraron los tickets.", formato: HORA_LOCAL },
      dia_generacion: {
        descripcion: "Día en que se registraron los tickets. Es la fecha con que GEMA entrega estos datos.",
        formato: DIA,
      },
      usuario_generacion: { descripcion: "Usuario de GEMA que registró los tickets." },
      fecha_anulacion: {
        descripcion: "Fecha y hora en que se anuló el registro; nula si sigue vigente.",
        formato: HORA_LOCAL,
      },
      usuario_anulacion: { descripcion: "Usuario de GEMA que anuló el registro; nulo si sigue vigente." },
      sincronizado_at: SINCRONIZADO,
    },
    relaciones: [
      { recurso: "viajes_recaudados", mediante: "id_viaje = numero", descripcion: "Conductor, recaudo y timbradas del viaje." },
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Maestro del bus." },
    ],
    advertencias: [
      "Ni GEMA ni el código de Gestivo documentan qué es operativamente un ticket transfer: describa estos datos por sus columnas y no invente su uso.",
      "Para excluir registros anulados filtre fecha_anulacion is_null (entre el 1 y el 10 de septiembre de 2026 no había ninguno anulado).",
      "No trae conductor: para saberlo cruce id_viaje con viajes_recaudados.numero.",
    ],
    noConfundirCon: [
      { recurso: "timbradas_descontadas", diferencia: "Los descuentos de timbradas corrigen el conteo de la registradora; los tickets transfer son otro registro por ticket." },
      { recurso: "incentivos", diferencia: "incentivos son pagos en dinero a empleados; cantidad_incentivo aquí es un número de tickets." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos tickets transfer de descuento e incentivo hubo este mes?",
        como: "agregar_datos sin agrupar con sum de cantidad_descuento y sum de cantidad_incentivo, filtros dia_generacion gte el primer día del mes y fecha_anulacion is_null.",
      },
      {
        pregunta: "¿Qué vehículos registran más tickets transfer?",
        como: "agregar_datos agrupando por codigo_vehiculo con sum de cantidad_total y un rango de fechas.",
      },
    ],
  },

  // ── anotaciones_viajes ───────────────────────────────────────────────────
  {
    nombre: "anotaciones_viajes",
    dominio: "gema",
    titulo: "Anotaciones de novedad por viaje",
    resumen:
      "La novedad anotada a cada viaje en GEMA (sin novedad, trocha, viaje incompleto, varado en ruta, error GPS, accidente…), con observación, rutas y quién la registró.",
    granularidad:
      "Una fila = una anotación sobre un viaje. Casi siempre hay una por viaje, pero un viaje puede tener varias: 3 casos repetidos en 3.897 anotaciones del 1 al 10 de septiembre de 2026.",
    descripcion:
      "Clasificación de lo que pasó en cada viaje según el despacho. Cerca del 89 % es '(13) SIN NOVEDAD'. Se guarda con los mismos nombres de columna de pa_ext_get_AnotacionesViajesByFecha.",
    origen: `${SINCRONIZACION} Este procedimiento entrega las anotaciones según el día del viaje (fecha_viaje), aunque se hayan registrado después.`,
    identificador: "id",
    columnaFecha: "fecha_viaje",
    volumen: "Unas 390 anotaciones por día (3.897 entre el 1 y el 10 de septiembre de 2026).",
    columnasPorDefecto: [
      "id_viaje",
      "fecha_viaje",
      "num_viaje",
      "codigo_vehiculo",
      "conductor",
      "ruta_programada",
      "cod_novedad",
      "novedad",
      "estado",
      "fecha_generacion",
    ],
    columnas: {
      id: ID_INTERNO,
      id_viaje: ID_VIAJE,
      fecha_viaje: { descripcion: "Día operativo del viaje anotado. Es la fecha con que GEMA entrega estos datos.", formato: DIA },
      num_viaje: NUM_VIAJE,
      codigo_vehiculo: CODIGO_VEHICULO,
      placa_vehiculo: PLACA,
      conductor: {
        descripcion: "Nombre del conductor del viaje, tal como lo registra GEMA.",
        advertencia: "No viene la cédula: para cruzar con el maestro use id_viaje contra viajes_recaudados.numero y tome cedula_conductor.",
      },
      ruta_programada: { descripcion: "Ruta asignada al viaje en la programación.", advertencia: RUTAS },
      ruta_reprogramada: {
        descripcion: "Ruta que finalmente se asignó al viaje; igual a la programada si no hubo cambio.",
        advertencia: RUTAS,
      },
      cod_novedad: {
        descripcion: "Código interno de la novedad en GEMA.",
        valores: {
          "483": "(13) SIN NOVEDAD",
          "472": "(02) TROCHA",
          "474": "(04) VIAJE INCOMPLETO",
          "471": "(01) NO ENTRO MANANTIALES",
          "477": "(07) VARADO EN RUTA",
          "475": "(05) ERROR GPS",
          "478": "(08) BOTA TIEMPO",
          "476": "(06) ACCIDENTE",
          "473": "(03) NO SALIO A VIAJE",
          "595": "(15) NO MUESTRA RECORRIDO",
        },
        advertencia: "Valores observados del 1 al 10 de septiembre de 2026; GEMA puede tener otros códigos.",
      },
      novedad: {
        descripcion: "Nombre de la novedad con su número de lista entre paréntesis, p. ej. '(04) VIAJE INCOMPLETO'.",
        advertencia: "GEMA no documenta el significado de cada novedad; no lo interprete más allá del texto.",
      },
      observacion: {
        descripcion: "Texto libre de quien anotó la novedad.",
        advertencia: "Vacía en cerca del 84 % de las filas.",
      },
      estado: {
        descripcion: "Estado de la anotación en GEMA.",
        valores: ["1", "0"],
        advertencia: "Se observan 1 y 0, pero GEMA no documenta qué significa cada uno (posiblemente vigente y anulada). No filtre por estado sin decirlo.",
      },
      fecha_generacion: { descripcion: "Fecha y hora en que se registró la anotación.", formato: HORA_LOCAL },
      usuario_generacion: { descripcion: "Usuario de GEMA que registró la anotación." },
      sincronizado_at: SINCRONIZADO,
    },
    relaciones: [
      { recurso: "viajes_recaudados", mediante: "id_viaje = numero", descripcion: "Cédula y código del conductor, recaudo y timbradas del viaje." },
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Maestro del bus." },
      { recurso: "cumplimientos", mediante: "id_viaje", descripcion: "Puntualidad del mismo viaje en los puntos de control." },
    ],
    advertencias: [
      "La inmensa mayoría de filas son '(13) SIN NOVEDAD' (cod_novedad 483). Para analizar novedades filtre cod_novedad neq 483.",
      "Para contar viajes con novedad use count_distinct de id_viaje: un viaje puede tener más de una anotación.",
    ],
    noConfundirCon: [
      { recurso: "viajes_perdidos", diferencia: "viajes_perdidos son viajes que no se hicieron o no se completaron, con tipología de responsable; las anotaciones cubren todos los viajes, incluidos los que salieron sin novedad." },
      { recurso: "viajes_recaudados", diferencia: "viajes_recaudados.novedad es el estado de recaudo del viaje; aquí está la novedad operativa anotada en el despacho." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué novedades se anotaron más la semana pasada?",
        como: "agregar_datos agrupando por novedad con count_distinct de id_viaje, filtros fecha_viaje gte/lte de la semana y cod_novedad neq 483.",
      },
      {
        pregunta: "¿Qué vehículos quedaron varados en ruta este mes?",
        como: "consultar_datos con filtros cod_novedad eq 477 y fecha_viaje gte el primer día del mes, columnas codigo_vehiculo, fecha_viaje, conductor y observacion.",
      },
    ],
  },

  // ── historico_despacho ───────────────────────────────────────────────────
  {
    nombre: "historico_despacho",
    dominio: "gema",
    titulo: "Histórico de despacho: todos los viajes programados",
    resumen:
      "Cada viaje programado en el despacho de GEMA, se haya despachado o no: estado, novedad y su tipología, horas, vehículo, conductor, propietario, timbradas y si se pagó.",
    granularidad:
      "Una fila = un viaje programado (numero único). Unos 500 por día. Incluye los no despachados, que no tienen recaudo.",
    descripcion:
      "Es el histórico completo que entrega pa_ext_get_ViajesByFecha, con sus 31 columnas (nombres de GEMA en minúsculas con guion bajo). Del 1 al 10 de septiembre de 2026 hubo 5.083 viajes: 3.960 DESPACHADO con novedad NORMAL y el resto con alguna novedad (taller, sin conductor, pérdida de viaje…). numero es el mismo número de viaje de viajes_recaudados, cumplimientos, anotaciones_viajes y pv_deltas.",
    origen:
      "Sincronización diaria desde GEMA a las 03:00 de Colombia (cron /api/cron/sync-gema): se reemplazan completos los días de los últimos 45, porque el recaudo y el pago de un viaje cambian después. Histórico cargado desde 2026-01-01.",
    identificador: "numero",
    columnaFecha: "fecha_viaje",
    volumen: "Unos 500 viajes por día (5.083 entre el 1 y el 10 de septiembre de 2026).",
    columnasPorDefecto: [
      "numero",
      "fecha_viaje",
      "hora_despacho",
      "codigo",
      "conductor_cod",
      "conductor",
      "ruta_programada",
      "estado",
      "novedad",
      "tipologia_novedad",
      "timbradas",
      "is_pago",
    ],
    columnas: {
      numero: {
        descripcion:
          "Número del viaje en GEMA (Numero). Único. Es viajes_recaudados.numero (cuando hubo recaudo), cumplimientos.id_viaje, anotaciones_viajes.id_viaje y pv_deltas.numero_despacho.",
        relacion: "viajes_recaudados.numero",
      },
      fecha_viaje: { descripcion: "Día operativo del viaje (FechaViaje). Es la fecha con que GEMA entrega estos datos.", formato: DIA },
      hora_procesado: {
        descripcion: "Hora en que el despacho procesó el viaje en GEMA (HoraProcesado).",
        formato: "texto 'HH:MM:SS', hora local de Colombia",
        advertencia: "GEMA no documenta la diferencia exacta con hora_despacho.",
      },
      hora_despacho: { descripcion: "Hora de despacho del viaje (HoraDespacho).", formato: "texto 'HH:MM:SS', hora local de Colombia" },
      hora_llegada: { descripcion: "Hora de llegada del viaje (HoraLlegada).", formato: "texto 'HH:MM:SS', hora local de Colombia" },
      fecha_recaudo: {
        descripcion: "Fecha y hora en que se recaudó el viaje (FechaRecaudo).",
        formato: HORA_LOCAL,
        advertencia: "Nula en cerca del 20 % de los viajes: los no despachados o aún sin recaudar.",
      },
      codigo: { ...CODIGO_VEHICULO, descripcion: "Código interno del bus en GEMA (Codigo). Clave para cruzar con el maestro de vehículos." },
      placa: { ...PLACA, descripcion: "Placa del bus en el viaje (Placa)." },
      conductor_cod: {
        descripcion: "Código de personal del conductor (ConductorCod), sin ceros a la izquierda para cruzar con el maestro y los cierres.",
        relacion: "conductores_con_grupo.codigo",
        advertencia: "GEMA lo entrega con ceros a la izquierda (p. ej. '0889'); aquí se guarda '889'.",
      },
      conductor: { descripcion: "Nombre del conductor asignado al viaje (Conductor)." },
      conductor_ced: {
        descripcion: "Cédula del conductor (ConductorCed), solo dígitos y sin ceros a la izquierda.",
        relacion: "conductores_con_grupo.cedula",
        advertencia: "En viajes sin conductor puede ser la ficha comodín 99999999 («NO DEFINIDO»): exclúyala al contar por conductor.",
      },
      turno: { descripcion: "Turno del despacho en la planilla del día (Turno), de 1 a unos 47." },
      viaje: { descripcion: "Número de vuelta del vehículo en el día (Viaje), de 1 a 5." },
      estado: {
        descripcion: "Estado del viaje en el despacho (Estado).",
        valores: {
          DESPACHADO: "Salió a ruta (3.960 de 5.083 del 1 al 10 de septiembre de 2026)",
          NO_DESPACHADO: "Programado pero no salió (1.030)",
          NO_FINALIZADO: "Salió pero no se cerró (86)",
          PENDIENTE: "Pendiente (5)",
          POR_LIQUIDAR: "Por liquidar (2)",
        },
        advertencia: "GEMA no documenta cada estado; las descripciones salen del nombre y de los conteos observados.",
      },
      ruta_reprogramada: { descripcion: "Ruta finalmente asignada (RutaReprogramada).", advertencia: RUTAS },
      ruta_programada: {
        descripcion: "Ruta asignada en la programación (RutaProgramada).",
        valores: ["A - 16 MIRAMAR", "A -- 16 MIRAMAR", "D - 6 ECOLOGICA - CALLE 30", "D - 7 ECOLOGICA - CALLE 17"],
        advertencia: RUTAS,
      },
      novedad: {
        descripcion: "Novedad del viaje en el despacho (Novedad). NORMAL = sin novedad.",
        valores: [
          "NORMAL",
          "TALLER",
          "SIN CONDUCTOR FIJO",
          "PERDIDA DE VIAJE",
          "FUERA FRECUENCIA",
          "APROVECHAMIENTO",
          "VARADO EN RUTA",
          "AUSENCIA CONDUCTOR",
          "ACCIDENTE TRANSITO",
          "PENDIENTE POR GESTIONAR",
          "VIAJE PENDIENTE",
          "INJUSTIFICADO",
          "PENDIENTE POR REVISION",
        ],
        advertencia:
          "Valores observados en septiembre de 2026; GEMA tiene al menos 15. Un viaje con novedad distinta de NORMAL es lo que Gestivo llama viaje perdido.",
      },
      sigla_novedad: {
        descripcion: "Sigla de la novedad (SiglaNovedad), p. ej. SNV = NORMAL, TLL = TALLER, SNC = SIN CONDUCTOR FIJO, PERD-TURN = PERDIDA DE VIAJE, VIC = VARADO EN RUTA.",
        advertencia: "La correspondencia sigla ↔ novedad se dedujo de conteos idénticos; GEMA no la documenta.",
      },
      tipologia_novedad: {
        descripcion: "A quién se atribuye la novedad (TipologiaNovedad).",
        valores: {
          "N/A": "Sin novedad",
          VEHICULO: "Atribuible al vehículo",
          CONDUCTOR: "Atribuible al conductor: los únicos viajes perdidos imputables a él",
          OTROS: "Otras causas",
        },
      },
      detalle_novedad: { descripcion: "Detalle libre de la novedad (DetalleNovedad)." },
      despachador: { descripcion: "Nombre de quien despachó el viaje (Despachador)." },
      planillero: { descripcion: "Nombre del planillero del viaje (Planillero)." },
      tipo_paquete: {
        descripcion: "Tipo de paquete del viaje (TipoPaquete).",
        valores: ["NORMAL", "N/A"],
        advertencia: "Significado no documentado por GEMA.",
      },
      is_ruleta: {
        descripcion: "Indicador de GEMA isRuleta (true en 402 de 5.083 viajes del 1 al 10 de septiembre de 2026).",
        advertencia: "Significado no documentado por GEMA: no lo interprete.",
      },
      is_cuna: {
        descripcion: "Indicador de GEMA isCuna (true en 694 de 5.083 viajes).",
        advertencia: "Significado no documentado por GEMA: no lo interprete.",
      },
      tipo_propietario: {
        descripcion: "Tipo de propietario del vehículo en el viaje (TipoPropietario).",
        valores: { AFILIADO: "Vehículo de un propietario afiliado", EMPRESA: "Vehículo de la empresa" },
      },
      propietario: { descripcion: "Nombre del propietario del vehículo (Propietario)." },
      propietario_ced: {
        descripcion: "Cédula del propietario (PropietarioCed), solo dígitos.",
        relacion: "propietarios.cedula",
      },
      timbradas: {
        descripcion: "Pasajeros cobrados del viaje (Timbradas). Coincide con viajes_recaudados.timbradas, que ya tiene el descuento restado.",
        unidad: "timbradas (pasajeros)",
        advertencia: "Cero en los viajes no despachados.",
      },
      is_pago: {
        descripcion: "Indicador de pago del viaje (isPago). En la muestra del 2026-09-10, 440 de los 443 viajes con pago tenían fila en viajes_recaudados.",
      },
      tipo_gps: { descripcion: "Proveedor del GPS del bus (TipoGps).", valores: ["SUNTECH", "OPTOCONTROL"] },
      sincronizado_at: SINCRONIZADO,
    },
    relaciones: [
      { recurso: "viajes_recaudados", mediante: "numero = numero", descripcion: "Dinero del viaje (bruto, anticipo, neto) cuando hubo recaudo." },
      { recurso: "cumplimientos", mediante: "numero = id_viaje", descripcion: "Puntualidad del viaje en cada punto de control." },
      { recurso: "anotaciones_viajes", mediante: "numero = id_viaje", descripcion: "Anotación de novedad del viaje." },
      { recurso: "pv_deltas", mediante: "numero = numero_despacho", descripcion: "Pasajeros que subieron y bajaron durante el viaje." },
      { recurso: "conductores_con_grupo", mediante: "conductor_ced = cedula", descripcion: "Maestro del conductor." },
      { recurso: "vehiculos", mediante: "codigo = codigo", descripcion: "Maestro del bus." },
      { recurso: "propietarios", mediante: "propietario_ced = cedula", descripcion: "Maestro del propietario." },
    ],
    advertencias: [
      "Incluye los viajes NO_DESPACHADO: para contar viajes realizados filtre estado eq DESPACHADO; para programados, no filtre por estado.",
      "Viaje perdido = novedad distinta de NORMAL. Solo tipologia_novedad = CONDUCTOR es imputable al conductor.",
      "Cuente viajes con agregar_datos (count o count_distinct de numero); para dinero use viajes_recaudados.",
    ],
    noConfundirCon: [
      { recurso: "viajes_perdidos", diferencia: "viajes_perdidos es un subconjunto (solo novedad distinta de NORMAL, 15 columnas) que usan las pantallas de Rotación; aquí están todos los viajes con sus 31 columnas." },
      { recurso: "viajes_recaudados", diferencia: "viajes_recaudados solo tiene los viajes con recaudo, con el detalle de dinero; aquí están también los no despachados y las novedades." },
      { recurso: "anotaciones_viajes", diferencia: "Las anotaciones son otra clasificación de novedades (con códigos propios, p. ej. TROCHA o ERROR GPS); la novedad del despacho está en esta tabla." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos viajes se programaron y cuántos se despacharon ayer?",
        como: "agregar_datos agrupando por estado con count, filtro fecha_viaje eq la fecha de ayer.",
      },
      {
        pregunta: "¿Qué conductores perdieron más viajes por su causa este mes?",
        como: "agregar_datos agrupando por conductor_ced y conductor con count, filtros tipologia_novedad eq CONDUCTOR, fecha_viaje gte el primer día del mes y conductor_ced neq '99999999'.",
      },
      {
        pregunta: "¿Qué vehículos acumulan más viajes perdidos por taller?",
        como: "agregar_datos agrupando por codigo con count, filtros novedad eq TALLER y un rango de fecha_viaje.",
      },
    ],
  },

  // ── cumplimientos ────────────────────────────────────────────────────────
  {
    nombre: "cumplimientos",
    dominio: "gema",
    titulo: "Planilla de tiempos: cumplimiento por punto de control",
    resumen:
      "Hora programada y hora real de paso de cada viaje por cada punto de control de su ruta, con la diferencia en minutos (puntualidad).",
    granularidad:
      "Una fila = el paso programado de un viaje por un punto de control. Cada viaje tiene entre 6 y 14 pasos, y puede pasar dos veces por el mismo punto, así que no hay llave única.",
    descripcion:
      "Compara la hora programada de paso (hora_cumplimiento) con la hora real registrada (hora_llegada). min_diferencia = hora_llegada − hora_cumplimiento en minutos, verificado en las 2.797 filas con llegada del 2026-09-10: positivo = pasó tarde, negativo = pasó antes. Se guarda con los mismos nombres de columna de pa_ext_get_CumplimientosByFecha.",
    origen: `${SINCRONIZACION} Este procedimiento entrega la planilla según el día del viaje (fecha_viaje).`,
    identificador: "id",
    columnaFecha: "fecha_viaje",
    volumen: "Unas 3.000 filas por día (3.066 el 2026-09-10), unas 90.000 al mes: filtre siempre por fecha_viaje.",
    columnasPorDefecto: [
      "id_viaje",
      "fecha_viaje",
      "codigo_vehiculo",
      "ruta",
      "num_viaje",
      "hora_despacho",
      "punto_control",
      "hora_cumplimiento",
      "hora_llegada",
      "min_diferencia",
    ],
    columnas: {
      id: ID_INTERNO,
      id_viaje: {
        ...ID_VIAJE,
        advertencia: "Se repite en cada punto de control del viaje: para contar viajes use count_distinct de id_viaje.",
      },
      fecha_viaje: { descripcion: "Día operativo del viaje. Es la fecha con que GEMA entrega estos datos.", formato: DIA },
      turno: {
        descripcion: "Turno del despacho en la planilla del día (del 1 a unos 46).",
        advertencia: "GEMA no documenta el significado operativo exacto del turno.",
      },
      num_viaje: NUM_VIAJE,
      codigo_vehiculo: CODIGO_VEHICULO,
      placa_vehiculo: PLACA,
      ruta: {
        descripcion: "Ruta del viaje.",
        valores: ["D - 7 ECOLOGICA - CALLE 17", "D - 6 ECOLOGICA - CALLE 30", "A - 16 MIRAMAR", "A -- 16 MIRAMAR"],
        advertencia: `Valores observados el 2026-09-10. ${RUTAS}`,
      },
      hora_despacho: { descripcion: "Hora programada de salida del viaje.", formato: "texto 'HH:MM', hora local de Colombia" },
      punto_control: {
        descripcion: "Nombre del punto de control por el que debe pasar el viaje.",
        valores: [
          "TERMINAL LA CAROLINA",
          "VILLA CAROLINA",
          "ALAMEDA",
          "TROJA",
          "CALLE 48 CON 22",
          "LAS MALLAS",
          "ANTIGUO REX",
          "MURILLO-KRA 8",
          "UNICO",
          "AUTONOMA",
          "PORTAL PRADO",
          "CALLE 30 CON 38",
          "PANORAMA",
          "CALANCALA",
          "HOTEL DEL PRADO",
        ],
        advertencia: "Valores observados el 2026-09-10; puede haber otros.",
      },
      abreviatura: {
        descripcion: "Código corto del punto de control, p. ej. 'MLL-S'.",
        advertencia: "El sufijo parece indicar el sentido del recorrido, pero GEMA no lo documenta. Hay 16 abreviaturas para 15 puntos.",
      },
      hora_cumplimiento: {
        descripcion: "Hora programada para pasar por el punto de control.",
        formato: "texto 'HH:MM:SS', hora local de Colombia",
      },
      hora_llegada: {
        descripcion: "Hora real en que el bus pasó por el punto según GEMA.",
        formato: "texto 'HH:MM:SS', hora local de Colombia",
        advertencia: "Nula en cerca del 9 % de los pasos (no se registró el paso).",
      },
      min_diferencia: {
        descripcion: "Minutos entre la hora real y la programada (hora_llegada − hora_cumplimiento). Positivo = tarde; negativo = temprano.",
        unidad: "minutos",
        advertencia:
          "Nula cuando no hay hora_llegada. En un día va de −90 a 89 minutos; los extremos pueden ser un paso asociado a la vuelta equivocada cuando el viaje pasa dos veces por el mismo punto.",
      },
      sincronizado_at: SINCRONIZADO,
    },
    relaciones: [
      { recurso: "viajes_recaudados", mediante: "id_viaje = numero", descripcion: "Conductor (cédula y código) y recaudo del viaje." },
      { recurso: "pv_deltas", mediante: "id_viaje = numero_despacho", descripcion: "Pasajeros que subieron y bajaron durante el mismo viaje." },
      { recurso: "anotaciones_viajes", mediante: "id_viaje", descripcion: "Novedad anotada al mismo viaje." },
      { recurso: "vehiculos", mediante: "codigo_vehiculo = codigo", descripcion: "Maestro del bus." },
    ],
    advertencias: [
      "Las horas son texto: para medir puntualidad use agregar_datos con avg, min o max de min_diferencia y filtre min_diferencia not_null.",
      "Una fila es un paso por un punto de control, no un viaje: cuente viajes con count_distinct de id_viaje.",
      "No trae conductor: para puntualidad por conductor cruce id_viaje con viajes_recaudados.numero.",
    ],
    noConfundirCon: [
      { recurso: "cierres_diarios", diferencia: "Los porcentajes de cierres_diarios son de liquidación y pago del conductor, no de cumplimiento de horarios." },
      { recurso: "pv_deltas", diferencia: "pv_deltas cuenta pasajeros por punto virtual (geocerca GPS); los puntos de control de esta planilla miden horarios de paso." },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué rutas pasan más tarde por los puntos de control esta semana?",
        como: "agregar_datos agrupando por ruta con avg de min_diferencia, filtros fecha_viaje gte/lte de la semana y min_diferencia not_null.",
      },
      {
        pregunta: "¿Qué vehículos acumulan más pasos con más de 10 minutos de retraso?",
        como: "agregar_datos agrupando por codigo_vehiculo con count y count_distinct de id_viaje, filtros min_diferencia gt 10 y un rango de fecha_viaje.",
      },
      {
        pregunta: "¿Cómo le fue en horario al viaje 123456?",
        como: "consultar_datos con filtro id_viaje eq 123456, orden hora_cumplimiento asc y las columnas punto_control, hora_cumplimiento, hora_llegada y min_diferencia.",
      },
    ],
  },
];
