// Catálogo semántico del dominio "gema": datos de la operación de transporte
// sincronizados desde GEMA (MySQL `gema_cr`) hacia Postgres.
//
// Evidencia: supabase/migrations 011, 027, 029, 050, 054, 057, 058, 061, 063,
// 064, 070, 071, 074-076 y 20260904212545; src/lib/gema/{sync,map,client}.ts;
// src/app/api/cron/sync-gema/route.ts; vercel.json; src/lib/devengados/*.
// Lo que no se pudo verificar en el repositorio va marcado en `advertencia`.

import type { DocRecurso } from "./tipos";

/** Advertencias comunes de frescura del sync de GEMA (texto reutilizado). */
const HORA_LOCAL_ETIQUETADA_UTC =
  "GEMA entrega la hora local de Colombia sin zona y el sync la guarda etiquetada como UTC: el valor '15:04:13+00' significa 15:04:13 hora de Colombia. Use `fecha_hora AT TIME ZONE 'UTC'` para obtener la hora local; NO la convierta a America/Bogota (restaría 5 horas de más).";

const SYNC_SIN_ESTADO_DE_ERROR =
  "Si una corrida falla, el error no se escribe en `gema_sync_state` (status sigue en 'ok'): juzgue la frescura por `last_run_at` y `last_synced_date`, no por `status`.";

export const RECURSOS_GEMA: DocRecurso[] = [
  // ── PUNTOS VIRTUALES ──────────────────────────────────────────────────────
  {
    nombre: "puntos_virtuales",
    dominio: "gema",
    titulo: "Telemetría de registradoras (eventos GPS)",
    resumen:
      "Eventos crudos que emite el equipo a bordo de cada bus: posición GPS, geocerca (punto virtual), contadores de pasajeros, despacho activo y alarmas.",
    granularidad:
      "Una fila = un evento de telemetría de un vehículo (identificado por `numero`, único; el sync deduplica por él). Varias filas por minuto por bus; no es una fila por viaje ni por pasajero.",
    descripcion:
      "Cada evento trae la posición, la velocidad, la geocerca por la que pasa (si hay), el contador de la registradora y los contadores ACUMULADOS de subidas y bajadas dentro del despacho en curso. Incluye también eventos de alarma (bloqueos de puerta, puerta abierta/cerrada, falla de comunicación), que son ~0,3 % de la tabla. No trae conductor ni ruta: se obtienen cruzando `numero_despacho` con `viajes_recaudados.numero`. No trae dinero.",
    origen:
      "Procedimiento GEMA `pa_ext_get_PuntosVirtualesByFecha(fecha)`, día por día, en el cron diario `/api/cron/sync-gema` (vercel.json `0 8 * * *` = 08:00 UTC = 03:00 hora de Colombia) o en la sincronización manual de un administrador. Tiene marcador propio en `gema_sync_state` (dataset 'puntos_virtuales'): cada corrida re-procesa el día del marcador y avanza días mientras quede presupuesto de tiempo (~200 s; un día tarda 60-90 s). Tras cada día recalcula `pv_deltas`. Solo upsert: nunca borra.",
    identificador: "numero",
    columnaFecha: "fecha",
    // Sin subidas/bajadas/registradora/abordo: son acumulados que se suman por error.
    columnasPorDefecto: [
      "numero",
      "fecha",
      "hora",
      "codigo_vehiculo",
      "placa",
      "numero_despacho",
      "cod_pv",
      "punto_virtual",
      "descripcion",
      "velocidad",
      "latitud",
      "longitud",
    ],
    volumen:
      "~90.000 filas por día (millones en total). Filtre SIEMPRE por `fecha` (indexada; también hay índice en `codigo_vehiculo, fecha` y en `numero_despacho`). La API devuelve máximo 1.000 filas: para totales use `/aggregate` con filtro de fecha y agrupación, nunca descargue días completos.",
    columnas: {
      id: { descripcion: "UUID interno de Gestivo. No sirve para cruzar; use `numero`." },
      numero: {
        descripcion: "Identificador del evento en GEMA (campo `Numero`). Único en la tabla.",
      },
      imei: { descripcion: "IMEI del equipo GPS/registradora que emitió el evento." },
      placa: {
        descripcion: "Placa del bus (viene del campo `Vehiculo` de GEMA).",
        relacion: "vehiculos.placa",
        advertencia: "La placa puede cambiar; para cruces use `codigo_vehiculo`.",
      },
      codigo_vehiculo: {
        descripcion: "Código interno del bus en GEMA (número de flota, p. ej. '537'). Llave estable del vehículo.",
        relacion: "vehiculos.codigo",
      },
      registradora: {
        descripcion:
          "Lectura del contador acumulado de la registradora (torniquete) en ese evento. GEMA liquida las timbradas de un viaje como lectura final − inicial.",
        unidad: "pasajeros (conteo acumulado)",
        advertencia:
          "Puede retroceder a mitad de viaje por reinicio del equipo; en ese caso final − inicial queda corto. No lo sume.",
      },
      pasajeros_dia: {
        descripcion: "Campo `PasajerosDia` de GEMA.",
        unidad: "pasajeros",
        advertencia: "Significado exacto no documentado (presumiblemente acumulado del día del equipo). No verificado.",
      },
      fecha_hora: {
        descripcion: "Instante del evento.",
        formato: "timestamptz con hora local de Colombia etiquetada como UTC",
        advertencia: HORA_LOCAL_ETIQUETADA_UTC,
      },
      fecha: {
        descripcion: "Día del evento según GEMA, en hora de Colombia. Columna para filtrar (indexada).",
        formato: "YYYY-MM-DD, hora de Colombia",
      },
      hora: {
        descripcion: "Hora del evento como texto, en hora de Colombia. Las funciones SQL extraen la hora con los dos primeros caracteres.",
        formato: "texto 'HH:MM:SS'",
      },
      cod_pv: {
        descripcion: "Código de la geocerca (punto virtual) donde ocurrió el evento. Úselo para filtrar o agrupar: los nombres de geocerca no son únicos.",
        advertencia: "'0' o NULL = el evento no está dentro de ninguna geocerca.",
      },
      punto_virtual: {
        descripcion: "Nombre de la geocerca (parada, paradero o punto de control definido en GEMA).",
        advertencia: "'N/A' cuando no hay geocerca. Nombres repetidos entre códigos distintos.",
      },
      descripcion: {
        descripcion: "Tipo de evento emitido por el equipo.",
        valores: {
          "BLOQUEO P1": "Alarma: bloqueo de la puerta 1",
          "BLOQUEO P2": "Alarma: bloqueo de la puerta 2",
          "BLOQUEO P3": "Alarma: bloqueo de la puerta 3",
          "PUERTA ABIERTA": "Alarma: puerta abierta fuera de protocolo",
          "PUERTA CERRADA": "Alarma: puerta cerrada fuera de protocolo",
          "FALLA DE COMUNICACION": "Alarma: falla de comunicación del equipo",
        },
        advertencia: "Solo están verificados los valores de alarma; los demás valores (telemetría normal) no están documentados.",
      },
      estado: {
        descripcion: "Campo `Estado` del evento en GEMA.",
        advertencia: "Valores y significado no documentados en el repositorio. No verificado.",
      },
      bloqueo: {
        descripcion: "Indicador `Bloqueo` de GEMA (1 → true).",
        advertencia: "Significado no documentado; para alarmas de bloqueo use `descripcion` LIKE 'BLOQUEO%'. NULL de origen se guarda como false.",
      },
      velocidad: {
        descripcion: "Velocidad instantánea del bus reportada por el GPS.",
        unidad: "km/h",
        advertencia: "Puede venir negativa o nula; excluya valores < 0 al promediar. Para excesos use la tabla `velocidades`.",
      },
      latitud: {
        descripcion: "Latitud del evento.",
        unidad: "grados decimales",
        advertencia: "Puede ser NULL o 0 (0,0 = sin posición); exclúyalos en mapas.",
      },
      longitud: { descripcion: "Longitud del evento.", unidad: "grados decimales" },
      direccion: {
        descripcion: "Dirección textual aproximada de la posición según GEMA.",
        advertencia: "Frecuentemente vacía o 'SIN DEFINIR…'.",
      },
      is_base: {
        descripcion: "GEMA marca la geocerca como base (terminal o punto de salida).",
        advertencia: "NULL cuando GEMA no lo informa. Significado exacto no verificado.",
      },
      subidas: {
        descripcion: "Contador ACUMULADO de pasajeros que han subido en el despacho en curso. Su máximo en el viaje coincide aproximadamente con las timbradas.",
        unidad: "pasajeros (acumulado)",
        advertencia:
          "NUNCA sume esta columna entre eventos: multiplica el conteo. Pasajeros en un punto = diferencia con el evento anterior del mismo `numero_despacho`. Hay basura (valores > 2.000) y reinicios.",
      },
      bajadas: {
        descripcion: "Contador ACUMULADO de pasajeros que han bajado en el despacho en curso.",
        unidad: "pasajeros (acumulado)",
        advertencia: "Mismas trampas que `subidas`: no sumar entre eventos.",
      },
      abordo: {
        descripcion: "Pasajeros a bordo reportados por el equipo en ese evento.",
        unidad: "pasajeros",
        advertencia: "Fórmula no documentada (presumiblemente subidas − bajadas). No verificado; no lo sume entre eventos.",
      },
      subidas_p1: { descripcion: "Subidas por la puerta 1.", unidad: "pasajeros", advertencia: "Se asume acumulado como `subidas`; no verificado." },
      subidas_p2: { descripcion: "Subidas por la puerta 2.", unidad: "pasajeros", advertencia: "Se asume acumulado como `subidas`; no verificado." },
      subidas_p3: { descripcion: "Subidas por la puerta 3.", unidad: "pasajeros", advertencia: "Se asume acumulado como `subidas`; no verificado." },
      bajadas_p1: { descripcion: "Bajadas por la puerta 1.", unidad: "pasajeros", advertencia: "Se asume acumulado como `bajadas`; no verificado." },
      bajadas_p2: { descripcion: "Bajadas por la puerta 2.", unidad: "pasajeros", advertencia: "Se asume acumulado como `bajadas`; no verificado." },
      bajadas_p3: { descripcion: "Bajadas por la puerta 3.", unidad: "pasajeros", advertencia: "Se asume acumulado como `bajadas`; no verificado." },
      numero_despacho: {
        descripcion: "Despacho (viaje) que el bus tenía activo en el evento. Es el mismo número que `viajes_recaudados.numero`.",
        relacion: "viajes_recaudados.numero",
        advertencia:
          "NULL = evento sin despacho activo (bus fuera de viaje). Hay despachos que solo existen en la telemetría, sin fila en `viajes_recaudados` (viaje sin recaudo).",
      },
      viaje_despacho: {
        descripcion: "Etiqueta del viaje del despacho según GEMA (equivale a `viajes_recaudados.viaje`).",
        advertencia: "Formato no documentado. No verificado.",
      },
      hora_despacho: {
        descripcion: "Hora de salida del despacho activo, en hora de Colombia.",
        formato: "texto 'HH:MM:SS'",
      },
      source_file: {
        descripcion: "Origen de la carga.",
        valores: { GEMA: "Cron o sincronización manual", "GEMA-BACKFILL": "Carga histórica puntual por script" },
      },
      created_at: {
        descripcion: "Momento en que Gestivo insertó la fila por primera vez (UTC real). No es la hora del evento.",
        formato: "timestamptz UTC",
      },
    },
    relaciones: [
      {
        recurso: "viajes_recaudados",
        mediante: "puntos_virtuales.numero_despacho = viajes_recaudados.numero",
        descripcion: "Da conductor, ruta (COALESCE(ruta_reprogramada, ruta_programada)), timbradas y dinero del viaje. Use LEFT JOIN: hay despachos sin recaudo.",
      },
      {
        recurso: "vehiculos",
        mediante: "puntos_virtuales.codigo_vehiculo = vehiculos.codigo",
        descripcion: "Maestro del bus: placa vigente, marca, capacidad, propietario, ruta asignada.",
      },
      {
        recurso: "pv_deltas",
        mediante: "pv_deltas.numero = puntos_virtuales.numero",
        descripcion: "Deltas de subidas/bajadas ya calculados por evento con movimiento (~15.000/día), con ruta normalizada. Fuente del mapa de calor.",
      },
    ],
    advertencias: [
      "Cobertura: el cron carga desde su marcador (backfill inicial de 7 días); existió un script de carga histórica (jul-2025 → jul-2026, `source_file` = 'GEMA-BACKFILL') cuya ejecución completa no está verificada. Consulte MIN(fecha) antes de afirmar que no hubo operación en una fecha antigua.",
      "El día de `gema_sync_state.last_synced_date` (dataset 'puntos_virtuales') puede estar a medias: el cron corre a las 03:00 y ese día solo queda completo en la corrida siguiente. Los días anteriores al marcador no se vuelven a leer, así que eventos que GEMA registre tarde para esos días no llegan. Si el sync va atrasado, los días posteriores al marcador faltan por completo.",
      "`subidas`, `bajadas` y `registradora` son contadores acumulados: SUM sobre eventos es siempre incorrecto. Para pasajeros de un viaje use MAX por `numero_despacho` o, mejor, `viajes_recaudados.timbradas`.",
      HORA_LOCAL_ETIQUETADA_UTC,
      SYNC_SIN_ESTADO_DE_ERROR,
    ],
    noConfundirCon: [
      {
        recurso: "viajes_recaudados",
        diferencia: "Una fila por viaje con timbradas y dinero liquidados. puntos_virtuales es la telemetría cruda (muchos eventos por viaje) y no sirve para contar viajes ni dinero.",
      },
      {
        recurso: "pv_deltas",
        diferencia: "Pasajeros que suben y bajan en cada evento (`dsub`, `dbaj`, ya como diferencia y sin basura), con ruta normalizada. Para pasajeros por lugar, geocerca u hora use pv_deltas y sume ahí; en puntos_virtuales los contadores son acumulados.",
      },
      {
        recurso: "velocidades",
        diferencia: "Solo eventos con velocidad ≥ 50 km/h (~1.300/día), con otra llave (vehículo + fecha_hora). Para excesos de velocidad use velocidades.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántas alarmas de puerta tuvo cada bus ayer?",
        como: "Agregado count con filtros `fecha` eq <día> y `descripcion` like 'BLOQUEO%' (o 'PUERTA%', 'FALLA%'), agrupado por `codigo_vehiculo`.",
      },
      {
        pregunta: "¿Por qué geocercas pasó el bus 537 en un día?",
        como: "Filtros `fecha` eq <día>, `codigo_vehiculo` eq '537', `cod_pv` neq '0'; columnas `hora, cod_pv, punto_virtual, numero_despacho`, orden por `fecha_hora`. Limite filas.",
      },
      {
        pregunta: "¿Cuántos pasajeros subieron en un viaje según el GPS?",
        como: "Agregado max de `subidas` con filtro `fecha` eq <día>, agrupado por `numero_despacho`. Compare con `viajes_recaudados.timbradas` del mismo número (la cifra oficial).",
      },
      {
        pregunta: "¿Hasta qué fecha hay telemetría?",
        como: "Leer `gema_sync_state` dataset 'puntos_virtuales' (`last_synced_date`, `last_run_at`) o agregado max de `fecha`; tratar el último día como posiblemente incompleto.",
      },
    ],
  },

  // ── VIAJES RECAUDADOS ─────────────────────────────────────────────────────
  {
    nombre: "viajes_recaudados",
    dominio: "gema",
    titulo: "Viajes recaudados por despacho",
    resumen:
      "Cada viaje (despacho) de un bus con su conductor, ruta, horas, lecturas de la registradora, timbradas y valores de recaudo en caja.",
    granularidad:
      "Una fila = un viaje/despacho identificado por `numero` (único; sin duplicados). Un conductor hace varios viajes por día y puede cambiar de bus o de ruta.",
    descripcion:
      "Viajes con su liquidación en caja: lecturas inicial y final de la registradora, timbradas brutas (`timbradas_real`), descuento y timbradas netas, valores bruto, anticipo, factura, ahorro y neto, cajero y momento del recaudo. Incluye viajes con novedad (p. ej. varado en ruta). No incluye despachos que nunca se recaudaron (solo visibles en `puntos_virtuales`) ni los viajes perdidos (tabla `viajes_perdidos`).",
    origen:
      "Procedimiento GEMA `pa_ext_get_ViajesRecaudadosByFecha(ini, fin)` en el cron diario `/api/cron/sync-gema` (03:00 hora de Colombia) y en la sincronización manual. Cada corrida re-sincroniza desde hoy − 45 días (o desde el marcador de cierres si va más atrasado), porque GEMA modifica recaudos después de creados. Carga operacional desde 2026-01-01; un script puntual cargó jul-dic 2025 (`source_file` = 'GEMA-BACKFILL', ejecución no verificada). Solo upsert por `numero`: nunca borra.",
    identificador: "numero",
    columnaFecha: "fecha_viaje",
    columnasPorDefecto: [
      "numero",
      "fecha_viaje",
      "hora_despacho",
      "codigo_vehiculo",
      "placa",
      "codigo_conductor",
      "cedula_conductor",
      "ruta_programada",
      "ruta_reprogramada",
      "timbradas",
      "novedad",
      "bruto",
    ],
    volumen: "Volumen diario no documentado. Filtre por `fecha_viaje` (indexada; índices también en `cedula_conductor` y `codigo_vehiculo, fecha_viaje`).",
    columnas: {
      id: { descripcion: "UUID interno de Gestivo. No sirve para cruzar; use `numero`." },
      numero: {
        descripcion: "Número del despacho/viaje en GEMA. Es el que aparece como `numero_despacho` en la telemetría y en `devengados_entregas.viajes`.",
      },
      fecha_viaje: {
        descripcion: "Día operativo del viaje, en hora de Colombia. Columna para filtrar.",
        formato: "YYYY-MM-DD, hora de Colombia",
      },
      hora_despacho: {
        descripcion: "Hora de salida del bus (despacho), en hora de Colombia.",
        formato: "texto 'HH:MM:SS'",
      },
      hora_llegada: {
        descripcion: "Hora de llegada del viaje, en hora de Colombia.",
        formato: "texto 'HH:MM:SS'",
        advertencia: "'00:00:00' = llegada no registrada. Si es menor que la de despacho, el viaje cruzó la medianoche.",
      },
      codigo_vehiculo: {
        descripcion: "Código interno del bus en GEMA. Llave estable del vehículo. Los códigos ≥ 1000 son la flota ecológica (NV); el resto, GN.",
        relacion: "vehiculos.codigo",
      },
      placa: { descripcion: "Placa del bus al momento del viaje.", relacion: "vehiculos.placa" },
      conductor_nombre: { descripcion: "Nombre del conductor del viaje." },
      codigo_conductor: {
        descripcion: "Código de personal del conductor en GEMA, sin ceros a la izquierda. Es la llave de `cierres_diarios.cod_conductor`.",
        relacion: "cierres_diarios.cod_conductor",
      },
      cedula_conductor: {
        descripcion: "Cédula del conductor, solo dígitos y sin ceros a la izquierda.",
        relacion: "conductores_con_grupo.cedula",
      },
      viaje: {
        descripcion: "Etiqueta del viaje en GEMA (identifica el viaje dentro de la programación del día).",
        advertencia: "Formato no documentado. No verificado.",
      },
      inicial: {
        descripcion: "Lectura del contador de la registradora al iniciar el viaje.",
        unidad: "pasajeros (lectura acumulada)",
      },
      final: {
        descripcion: "Lectura del contador de la registradora al terminar el viaje. GEMA liquida final − inicial.",
        unidad: "pasajeros (lectura acumulada)",
        advertencia: "Si la registradora se reinició en el viaje, final − inicial queda corto.",
      },
      descuento: {
        descripcion: "Timbradas descontadas del viaje (pasajeros que no se cobran). Verificado: 120 reales − 3 de descuento = 117 timbradas.",
        unidad: "pasajeros",
        advertencia: "Es un conteo de pasajeros, no dinero.",
      },
      timbradas: {
        descripcion: "Timbradas NETAS del viaje (pasajeros cobrados) = `timbradas_real` − `descuento`. Cifra oficial de pasajeros del viaje.",
        unidad: "pasajeros",
        advertencia: "Ya viene con el descuento restado: no vuelva a restar `descuento`.",
      },
      timbradas_real: {
        descripcion: "Timbradas BRUTAS del viaje (lectura final − inicial), antes del descuento.",
        unidad: "pasajeros",
      },
      bruto: {
        descripcion: "Valor bruto recaudado del viaje.",
        unidad: "COP",
        advertencia: "Fórmula no documentada (presumiblemente timbradas × pasaje). No verificado.",
      },
      anticipo: {
        descripcion: "Anticipo descontado en el recaudo del viaje.",
        unidad: "COP",
        advertencia: "Destinatario y regla no documentados. No verificado.",
      },
      factura: { descripcion: "Valor de factura asociado al recaudo del viaje.", unidad: "COP", advertencia: "Significado no documentado. No verificado." },
      ahorro: {
        descripcion: "Ahorro del conductor retenido en el viaje.",
        unidad: "COP",
        advertencia: "Los simuladores usan $2.000 por viaje como parámetro; el valor real por fila no está verificado.",
      },
      neto: {
        descripcion: "Valor neto del recaudo del viaje tras los descuentos de caja.",
        unidad: "COP",
        advertencia: "Fórmula no verificada. NO es la producción neta del conductor: esa es `cierres_diarios.salario_neto_dia`.",
      },
      fecha_recaudo: {
        descripcion: "Momento en que la caja registró el recaudo del viaje. Puede ser días después de `fecha_viaje`.",
        formato: "timestamptz con hora local de Colombia etiquetada como UTC",
        advertencia: "Mismo mapeo que `puntos_virtuales.fecha_hora`: use `AT TIME ZONE 'UTC'` para leer la hora local. NULL si no hay recaudo o la fecha es absurda.",
      },
      is_extemporaneo: {
        descripcion: "GEMA marca el recaudo como extemporáneo (registrado fuera del plazo normal).",
        advertencia: "Regla exacta no documentada. NULL de origen se guarda como false.",
      },
      cajero: { descripcion: "Cajero de GEMA que registró el recaudo." },
      pasaje: {
        descripcion: "Tarifa por pasajero aplicada al viaje. Los informes de 2026 usan $3.300 ordinario y $3.400 domingo o festivo.",
        unidad: "COP por pasajero",
      },
      propietario_nombre: { descripcion: "Nombre del propietario del bus." },
      cedula_propietario: {
        descripcion: "Cédula o NIT del propietario del bus, solo dígitos.",
        relacion: "propietarios.cedula",
      },
      estado: {
        descripcion: "Estado del viaje en GEMA.",
        advertencia: "Valores no documentados en el repositorio. Consulte los valores distintos antes de filtrar.",
      },
      novedad: {
        descripcion: "Novedad operativa del viaje. 'NORMAL' = sin novedad; otros valores describen la causa (p. ej. 'VARADO EN RUTA', no finalizado).",
        advertencia: "Un viaje con novedad distinta de 'NORMAL' se liquida como medio viaje (0,5) en la reconstrucción de rendimiento de Gestivo.",
      },
      ruta_programada: {
        descripcion: "Ruta programada para el viaje.",
        advertencia: "GEMA escribe la misma ruta con guiones y espacios variables ('A - 16 MIRAMAR' vs 'A -- 16 MIRAMAR'); el doble guion identifica la variante EXPRESS. Normalice antes de agrupar.",
      },
      ruta_reprogramada: {
        descripcion: "Ruta efectiva cuando el viaje se reprogramó. La ruta real del viaje es COALESCE(ruta_reprogramada, ruta_programada).",
      },
      is_viaje_contable: {
        descripcion: "GEMA marca el viaje como contable para la liquidación.",
        advertencia: "Regla no documentada. No verificado. NULL de origen se guarda como false.",
      },
      source_file: {
        descripcion: "Origen de la carga.",
        valores: { GEMA: "Cron o sincronización manual", "GEMA-BACKFILL": "Carga histórica puntual por script" },
      },
      created_at: { descripcion: "Momento de la primera inserción en Gestivo (UTC real).", formato: "timestamptz UTC" },
    },
    relaciones: [
      {
        recurso: "puntos_virtuales",
        mediante: "viajes_recaudados.numero = puntos_virtuales.numero_despacho",
        descripcion: "Telemetría del viaje: recorrido GPS, alarmas y contadores. Acote siempre por fecha.",
      },
      {
        recurso: "conductores_con_grupo",
        mediante: "viajes_recaudados.cedula_conductor = conductores_con_grupo.cedula",
        descripcion: "Maestro del conductor (estado, antigüedad, tipo).",
      },
      {
        recurso: "cierres_diarios",
        mediante: "codigo_conductor = cierres_diarios.cod_conductor AND fecha_viaje = cierres_diarios.fecha",
        descripcion: "Liquidación diaria oficial del conductor para esos viajes.",
      },
      {
        recurso: "vehiculos",
        mediante: "viajes_recaudados.codigo_vehiculo = vehiculos.codigo",
        descripcion: "Maestro del bus.",
      },
      {
        recurso: "propietarios",
        mediante: "viajes_recaudados.cedula_propietario = propietarios.cedula",
        descripcion: "Datos del dueño del bus.",
      },
    ],
    advertencias: [
      "Los datos de los últimos 45 días pueden cambiar (recaudos extemporáneos, ajustes) y los recaudos llegan con días de atraso: el día de hoy y los recientes pueden estar incompletos. Antes de concluir que un conductor no trabajó, revise `gema_sync_state` (dataset 'viajes_recaudados').",
      "El sync nunca borra: un viaje anulado o eliminado en GEMA después de sincronizado sigue aquí.",
      "No se aplica filtro por defecto: la regla de `is_viaje_contable` y los valores de `estado` no están documentados, así que excluir filas por ellos podría quitar viajes reales. Si la pregunta es contable, compare el resultado con y sin `is_viaje_contable` eq true e indíquelo.",
      "Contar filas da viajes recaudados, no despachos totales: hay despachos sin recaudo (solo en `puntos_virtuales`) y los viajes perdidos están en `viajes_perdidos`.",
      "Para pagos al conductor la fuente oficial es `cierres_diarios` (salario_neto_dia); reconstruir desde estos viajes difiere de GEMA porque la liquidación CU usa promedios de ruta, grupo o segmento.",
      SYNC_SIN_ESTADO_DE_ERROR,
    ],
    noConfundirCon: [
      {
        recurso: "cierres_diarios",
        diferencia: "Liquidación oficial del conductor: una fila por conductor, día y ruta, con viajes liquidados (admite 0,5), timbradas CU y salario bruto/neto del día. Úsela para pagos y rendimiento del conductor; use viajes_recaudados para contar viajes reales, pasajeros por viaje, horas o ruta de un bus.",
      },
      {
        recurso: "ingreso_tercero",
        diferencia: "Liquidación diaria para el tercero (propietario del bus) por vehículo, conductor, ruta y grupo, con cartulina, FET y deducciones. Úsela para dinero del propietario; viajes_recaudados es el detalle por viaje del recaudo en caja.",
      },
      {
        recurso: "puntos_virtuales",
        diferencia: "Telemetría cruda (muchos eventos por viaje, contadores acumulados). No sirve para contar viajes ni sumar pasajeros.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos viajes y pasajeros hizo cada ruta en una semana?",
        como: "Agregados count y sum de `timbradas` con filtros `fecha_viaje` gte/lte, agrupados por `ruta_reprogramada` y `ruta_programada`; unifique variantes de escritura de la ruta.",
      },
      {
        pregunta: "¿Qué viajes hizo el conductor con cédula X un día?",
        como: "Filtros `cedula_conductor` eq X y `fecha_viaje` eq <día>; columnas `numero, hora_despacho, hora_llegada, codigo_vehiculo, ruta_reprogramada, ruta_programada, timbradas, novedad`, orden por `hora_despacho`.",
      },
      {
        pregunta: "¿Cuánto recaudó el bus 537 en el mes?",
        como: "Agregado sum de `bruto` (o `neto`) con filtros `codigo_vehiculo` eq '537' y `fecha_viaje` entre el primer y el último día del mes, agrupado por `codigo_vehiculo`. Advierta que los últimos días pueden cambiar.",
      },
      {
        pregunta: "¿Qué viajes tuvieron novedad?",
        como: "Filtros `fecha_viaje` en el rango y `novedad` neq 'NORMAL'; agrupar por `novedad` o por `codigo_conductor`.",
      },
    ],
  },

  // ── INGRESO TERCERO ───────────────────────────────────────────────────────
  {
    nombre: "ingreso_tercero",
    dominio: "gema",
    titulo: "Liquidación diaria a terceros (propietarios)",
    resumen:
      "Liquidación diaria de GEMA de lo producido por cada bus para el tercero (propietario): viajes, timbradas, bruto y las deducciones de cartulina, FET, administración, combustible y demás.",
    granularidad:
      "Una fila = un día + vehículo + conductor + ruta + grupo de liquidación (llave única). Un bus con dos conductores o dos rutas en el día tiene varias filas.",
    descripcion:
      "Resultado del cierre de GEMA desde la óptica del tercero dueño del bus: producción del día (viajes, timbradas, timbradas CU, pasaje, bruto) y los conceptos que se descuentan antes del líquido. No trae detalle por viaje (ver `viajes_recaudados`) ni la liquidación del conductor como tal (ver `cierres_diarios`).",
    origen:
      "Procedimiento GEMA `pa_ext_get_IngresoTerceroByFecha(ini, fin)` en el cron diario `/api/cron/sync-gema` (03:00 hora de Colombia) y la sincronización manual. Re-sincroniza siempre los últimos 45 días (o más atrás si el marcador de cierres va atrasado); histórico desde 2026-01-01. GEMA genera los cierres con días de atraso. Solo upsert por la llave única: nunca borra.",
    identificador: "id",
    columnaFecha: "fecha",
    columnasPorDefecto: [
      "id",
      "fecha",
      "codigo_vehiculo",
      "placa",
      "codigo_conductor",
      "cedula_conductor",
      "cedula_propietario",
      "ruta",
      "grupo_liquidacion",
      "viajes",
      "timbradas",
      "bruto",
    ],
    volumen: "Volumen no documentado (del orden de los buses activos por día, ~200 vehículos en el maestro). Filtre por `fecha` (indexada; índices también en `cedula_conductor` y `cedula_propietario`).",
    columnas: {
      id: {
        descripcion: "UUID interno de Gestivo; identificador del endpoint de detalle. La llave de negocio es (fecha, codigo_vehiculo, cedula_conductor, ruta, grupo_liquidacion).",
      },
      fecha: { descripcion: "Día liquidado, en hora de Colombia. Columna para filtrar.", formato: "YYYY-MM-DD, hora de Colombia" },
      tipo_cierre: {
        descripcion: "Modalidad de cierre con la que GEMA liquidó el día.",
        advertencia: "En `cierres_diarios` aparecen valores como 'CU (RUTAS,GRUPOS,PROM)' y 'CU (RUTAS,GRUPOS)'; los valores de esta tabla no están verificados.",
      },
      ruta: {
        descripcion: "Ruta liquidada.",
        advertencia: "Cadena vacía '' (no NULL) cuando GEMA no la informa. Escritura variable de guiones y espacios.",
      },
      grupo_liquidacion: {
        descripcion: "Grupo de flota con el que se liquida. 'NV' = flota ecológica; el resto se trata como GN en los informes de Gestivo.",
        advertencia: "Cadena vacía '' (no NULL) cuando falta.",
      },
      tipo_prom: { descripcion: "Tipo de promedio aplicado en la liquidación (campo `tipoProm`).", advertencia: "Valores no documentados. No verificado." },
      tipo_gps: { descripcion: "Tipo de equipo GPS del bus (campo `tipoGps`).", advertencia: "Valores no documentados. No verificado." },
      codigo_vehiculo: {
        descripcion: "Código interno del bus en GEMA.",
        relacion: "vehiculos.codigo",
        advertencia: "Cadena vacía '' (no NULL) cuando falta.",
      },
      placa: { descripcion: "Placa del bus.", relacion: "vehiculos.placa" },
      cedula_conductor: {
        descripcion: "Cédula del conductor, solo dígitos.",
        relacion: "conductores_con_grupo.cedula",
        advertencia: "Cadena vacía '' (no NULL) cuando falta.",
      },
      codigo_conductor: {
        descripcion: "Código de personal del conductor, sin ceros a la izquierda.",
        relacion: "cierres_diarios.cod_conductor",
      },
      conductor_nombre: { descripcion: "Nombre del conductor." },
      cedula_propietario: { descripcion: "Cédula o NIT del propietario (tercero), solo dígitos.", relacion: "propietarios.cedula" },
      propietario_nombre: { descripcion: "Nombre del propietario (tercero)." },
      tipo_propietario: {
        descripcion: "Clasificación del propietario del bus en GEMA.",
        advertencia: "Valores no documentados en el repositorio. Consulte los valores distintos antes de filtrar.",
      },
      pasaje: { descripcion: "Tarifa por pasajero aplicada.", unidad: "COP por pasajero" },
      viajes: {
        descripcion: "Viajes liquidados en la fila.",
        unidad: "viajes",
        advertencia: "Admite decimales (medios viajes liquidados); puede no coincidir con el conteo de filas de `viajes_recaudados`.",
      },
      timbradas: { descripcion: "Timbradas (pasajeros cobrados) liquidadas en la fila.", unidad: "pasajeros" },
      timbradas_cu: {
        descripcion: "Timbradas CU: pasajeros liquidados con la metodología CU de GEMA (promedio de ruta, grupo o segmento), distintas de las timbradas individuales.",
        unidad: "pasajeros",
      },
      descuento: {
        descripcion: "Descuento de la liquidación (campo `descuento`).",
        advertencia: "No verificado si es conteo de pasajeros (como en `viajes_recaudados`) o dinero. Distinto de `valor_descuentos`.",
      },
      fet: {
        descripcion: "Concepto FET de la liquidación (campo `fet`).",
        unidad: "COP",
        advertencia: "Definición de la sigla y regla de cálculo no documentadas. No verificado.",
      },
      factor_calidad: { descripcion: "Factor de calidad aplicado en la liquidación.", advertencia: "Unidad (valor o factor) y regla no documentadas. No verificado." },
      valor_camb: { descripcion: "Concepto CAMB de la liquidación (campo `valorCAMB`).", unidad: "COP", advertencia: "Significado de la sigla no documentado. No verificado." },
      bruto: { descripcion: "Valor bruto producido por el bus en la fila.", unidad: "COP", advertencia: "Fórmula no verificada." },
      total_cartulina: {
        descripcion: "Total de la cartulina: suma de deducciones fijas del bus (administración, estudio, fondo, póliza, préstamo).",
        unidad: "COP",
        advertencia: "Que sea exactamente la suma de las columnas `cartu_*` no está verificado.",
      },
      cartu_admon: { descripcion: "Componente de administración de la cartulina.", unidad: "COP" },
      cartu_estudio: { descripcion: "Componente de estudio de la cartulina.", unidad: "COP", advertencia: "Significado no documentado. No verificado." },
      cartu_fondo: { descripcion: "Componente de fondo de la cartulina.", unidad: "COP", advertencia: "Significado no documentado. No verificado." },
      cartu_poliza: { descripcion: "Componente de póliza (seguro) de la cartulina.", unidad: "COP" },
      cartu_presta: { descripcion: "Componente de préstamo de la cartulina.", unidad: "COP", advertencia: "Significado no documentado. No verificado." },
      salario: { descripcion: "Salario del conductor cargado a la liquidación del bus.", unidad: "COP", advertencia: "No verificado contra `cierres_diarios.salario_bruto_dia`." },
      anticipo: { descripcion: "Anticipo descontado.", unidad: "COP" },
      factura: { descripcion: "Valor de factura de la liquidación.", unidad: "COP", advertencia: "Significado no documentado. No verificado." },
      incentivo_c: { descripcion: "Incentivo (campo `incentivoC`).", unidad: "COP", advertencia: "Significado de la 'C' no documentado. No verificado." },
      valor_descuentos: { descripcion: "Valor total de descuentos de la liquidación.", unidad: "COP", advertencia: "Composición no documentada." },
      combustible: { descripcion: "Combustible descontado.", unidad: "COP" },
      sitra: { descripcion: "Concepto SITRA de la liquidación.", unidad: "COP", advertencia: "Significado de la sigla no documentado. No verificado." },
      rtica: { descripcion: "Concepto RTICA de la liquidación.", unidad: "COP", advertencia: "Significado de la sigla no documentado. No verificado." },
      admon: { descripcion: "Administración descontada.", unidad: "COP" },
      liquido: {
        descripcion: "Valor líquido resultante de la liquidación para el tercero.",
        unidad: "COP",
        advertencia: "Fórmula (bruto menos qué conceptos) no verificada.",
      },
      source_file: { descripcion: "Origen de la carga ('GEMA')." },
      created_at: { descripcion: "Momento de la primera inserción en Gestivo (UTC real).", formato: "timestamptz UTC" },
    },
    relaciones: [
      { recurso: "propietarios", mediante: "ingreso_tercero.cedula_propietario = propietarios.cedula", descripcion: "Datos del tercero liquidado." },
      { recurso: "vehiculos", mediante: "ingreso_tercero.codigo_vehiculo = vehiculos.codigo", descripcion: "Maestro del bus." },
      {
        recurso: "cierres_diarios",
        mediante: "codigo_conductor = cierres_diarios.cod_conductor AND fecha = cierres_diarios.fecha AND ruta = cierres_diarios.ruta",
        descripcion: "Liquidación del conductor del mismo día y ruta (sin desagregar por vehículo).",
      },
      { recurso: "conductores_con_grupo", mediante: "ingreso_tercero.cedula_conductor = conductores_con_grupo.cedula", descripcion: "Maestro del conductor." },
    ],
    advertencias: [
      "Las columnas de la llave (codigo_vehiculo, cedula_conductor, ruta, grupo_liquidacion) usan '' en vez de NULL: filtre `eq ''`, no `is null`.",
      "Si GEMA devuelve dos filas con la misma llave, el sync conserva la última y descarta la otra (no las suma, a diferencia de `cierres_diarios`). Los totales pueden quedar por debajo de GEMA en esos casos.",
      "Los últimos 45 días se re-sincronizan y pueden cambiar; los cierres llegan con días de atraso, así que un día reciente sin filas no significa sin operación.",
      "Varias columnas monetarias (FET, CAMB, SITRA, RTICA, cartulina) no tienen definición documentada: reporte sus valores con el nombre de la columna sin interpretar la sigla.",
      SYNC_SIN_ESTADO_DE_ERROR,
    ],
    noConfundirCon: [
      {
        recurso: "viajes_recaudados",
        diferencia: "Detalle por viaje del recaudo en caja. ingreso_tercero es el consolidado diario liquidado al propietario, con deducciones que no existen por viaje.",
      },
      {
        recurso: "cierres_diarios",
        diferencia: "Liquidación del conductor (salario bruto y neto del día, ahorro, porcentajes). Para lo que recibe o produce el conductor use cierres_diarios; para lo que se liquida al dueño del bus, ingreso_tercero.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto se liquidó a cada propietario en el mes?",
        como: "Agregado sum de `liquido` (o `bruto`) con filtros `fecha` gte/lte del mes, agrupado por `cedula_propietario`; enriquecer nombre desde `propietarios`.",
      },
      {
        pregunta: "¿Cuánto se descontó de cartulina al bus 537 en una quincena?",
        como: "Agregado sum de `total_cartulina` con filtros `codigo_vehiculo` eq '537' y `fecha` entre el 1 y el 15 (o 16 y fin de mes), agrupado por `codigo_vehiculo`.",
      },
      {
        pregunta: "¿Qué producción liquidó GEMA por ruta y grupo un día?",
        como: "Filtro `fecha` eq <día>; agregados sum de `viajes`, `timbradas` y `bruto` agrupados por `ruta` y `grupo_liquidacion`.",
      },
    ],
  },

  // ── PROPIETARIOS ──────────────────────────────────────────────────────────
  {
    nombre: "propietarios",
    dominio: "gema",
    titulo: "Maestro de propietarios de buses",
    resumen: "Personas o empresas dueñas de los buses según GEMA, con su tipo, plazo de pago, contacto y estado.",
    granularidad: "Una fila = un propietario identificado por `cedula` (única; el sync deduplica por cédula y conserva la última fila de GEMA).",
    descripcion:
      "Maestro de terceros propietarios. No trae qué buses posee cada uno: esa relación está en `vehiculos` (cedula_propietario y cedula_propietario_admin) y en las filas de `viajes_recaudados` e `ingreso_tercero`.",
    origen:
      "Vista GEMA `vst_ext_get_propietarios`, refresco completo en cada corrida del cron diario `/api/cron/sync-gema` (03:00 hora de Colombia) y de la sincronización manual. Solo upsert por cédula: un propietario eliminado en GEMA permanece aquí.",
    identificador: "cedula",
    // Sin direccion, telefono, celular ni correo (sensibles).
    columnasPorDefecto: ["cedula", "codigo", "nombre", "tipo_propietario", "estado"],
    volumen: "Tabla pequeña (maestro); tamaño exacto no documentado.",
    columnas: {
      id: { descripcion: "UUID interno de Gestivo. No sirve para cruzar; use `cedula`." },
      cedula: {
        descripcion: "Número de identificación del propietario (cédula o NIT), solo dígitos y sin ceros a la izquierda.",
        advertencia: "Se descartan los registros de GEMA sin identificación válida.",
      },
      codigo: {
        descripcion: "Código de personal del propietario en GEMA, sin ceros a la izquierda.",
        advertencia: "No se verificó con qué otra tabla cruza.",
      },
      nombre: { descripcion: "Nombre o razón social del propietario." },
      tipo_identificacion: { descripcion: "Tipo de documento de identidad (p. ej. cédula o NIT).", advertencia: "Valores literales no verificados." },
      tipo_propietario: {
        descripcion: "Clasificación del propietario en GEMA.",
        advertencia: "Valores no documentados en el repositorio. Consulte los valores distintos antes de filtrar.",
      },
      plazo_pago: { descripcion: "Plazo de pago de la liquidación al propietario pactado en GEMA.", advertencia: "Formato y unidad no documentados. No verificado." },
      direccion: { descripcion: "Dirección del propietario.", sensible: true },
      telefono: { descripcion: "Teléfono fijo del propietario, como texto libre.", sensible: true },
      celular: {
        descripcion: "Celular del propietario, como texto libre (normalmente 10 dígitos, a veces con guiones o espacios).",
        sensible: true,
      },
      correo: { descripcion: "Correo personal del propietario.", sensible: true },
      estado: {
        descripcion: "Estado del propietario en GEMA.",
        valores: { ACTIVO: "Propietario activo", INACTIVO: "Propietario inactivo" },
      },
      updated_at: {
        descripcion: "Última vez que el sync escribió la fila (se actualiza en cada corrida aunque nada cambie). No indica cuándo cambió el dato en GEMA.",
        formato: "timestamptz UTC",
      },
    },
    relaciones: [
      {
        recurso: "vehiculos",
        mediante: "propietarios.cedula = vehiculos.cedula_propietario (o vehiculos.cedula_propietario_admin)",
        descripcion: "Buses del propietario en el maestro vigente.",
      },
      {
        recurso: "ingreso_tercero",
        mediante: "propietarios.cedula = ingreso_tercero.cedula_propietario",
        descripcion: "Liquidaciones diarias del propietario.",
      },
      {
        recurso: "viajes_recaudados",
        mediante: "propietarios.cedula = viajes_recaudados.cedula_propietario",
        descripcion: "Viajes de sus buses.",
      },
    ],
    advertencias: [
      "Contiene datos personales de contacto (dirección, teléfonos, correo): no los exponga salvo que la pregunta lo requiera.",
      "Es el estado actual: no guarda historia de cambios de propietario ni de contacto.",
    ],
    noConfundirCon: [
      {
        recurso: "conductores_con_grupo",
        diferencia: "Maestro de conductores (quien maneja). Un propietario puede no conducir y un conductor puede no ser propietario.",
      },
      {
        recurso: "vehiculos",
        diferencia: "Maestro de buses; es donde está la relación bus → propietario. propietarios no dice qué buses tiene cada uno.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos propietarios activos hay por tipo?",
        como: "Agregado count con filtro `estado` eq 'ACTIVO', agrupado por `tipo_propietario`.",
      },
      {
        pregunta: "¿Qué buses tiene el propietario con cédula X?",
        como: "Consultar `vehiculos` con `cedula_propietario` eq X (o `cedula_propietario_admin` eq X); `propietarios` solo aporta nombre y estado.",
      },
      {
        pregunta: "¿Quién es el dueño del bus que hizo el viaje N?",
        como: "Leer `viajes_recaudados` con `numero` eq N y cruzar su `cedula_propietario` con `propietarios.cedula`.",
      },
    ],
  },
];
