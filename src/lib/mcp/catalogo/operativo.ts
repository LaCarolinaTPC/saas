// Catálogo semántico del dominio "operativo" (vehículos, velocidad, deltas de
// pasajeros y documentos del vehículo) y del estado de sincronización de GEMA.
//
// Evidencia: supabase/migrations 011, 020, 027, 050 (norm_ruta), 057, 058, 059,
// 061, 063, 065, 070, 073, 076, 20260901202556, 20260902162916, 20260904191056,
// 20260904212545 y 20260904214628; src/lib/gema/{sync,map,actions}.ts;
// src/app/api/cron/sync-gema/route.ts; vercel.json; src/lib/operativo/*;
// src/app/(dashboard)/operativo/**; src/app/api/operativo/documentos/route.ts;
// src/lib/rotacion/data/mapa-calor.ts; src/lib/mantenimiento/*;
// docs/migracion-073-mantenimiento-vehiculos.md.
// Lo que no se pudo verificar en el repositorio va marcado en `advertencia`.

import type { DocRecurso } from "./tipos";

/** Mismo texto que en gema.ts: la hora local de GEMA se guarda etiquetada como UTC. */
const HORA_LOCAL_ETIQUETADA_UTC =
  "GEMA entrega la hora local de Colombia sin zona y el sync la guarda etiquetada como UTC: el valor '15:04:13+00' significa 15:04:13 hora de Colombia. Use `fecha_hora AT TIME ZONE 'UTC'` para obtener la hora local; NO la convierta a America/Bogota (restaría 5 horas de más).";

const SYNC_SIN_ESTADO_DE_ERROR =
  "Si una corrida falla, el error no se escribe en `gema_sync_state` (status sigue en 'ok'): juzgue la frescura por `last_run_at` y `last_synced_date`, no por `status`.";

const CRON_GEMA =
  "cron diario `/api/cron/sync-gema` (vercel.json `0 8 * * *` = 08:00 UTC = 03:00 hora de Colombia) o sincronización manual de un administrador";

export const RECURSOS_OPERATIVO: DocRecurso[] = [
  // ── VEHÍCULOS ─────────────────────────────────────────────────────────────
  {
    nombre: "vehiculos",
    dominio: "operativo",
    titulo: "Maestro de vehículos (GEMA)",
    resumen:
      "Maestro de los buses según GEMA: placa, marca, capacidad, ruta, conductor y propietario asignados, estado y fechas de vencimiento de SOAT, técnico-mecánica, pólizas y tarjeta de operación.",
    granularidad:
      "Una fila = un vehículo identificado por `codigo` (llave primaria; el sync deduplica por código). ~200 filas (202 al 2026-09-01, de ellas 151 con `estado` = 1).",
    descripcion:
      "Foto actual del maestro de GEMA: no guarda historia de cambios de placa, ruta, conductor ni propietario. Es la llave de vehículo de Mantenimiento, Ausentismo, Operativo, `velocidades` y el mapa de calor (todas usan `codigo`, no la placa). Las fechas `fecha_*` son vencimientos registrados en GEMA; los documentos cargados a mano en Gestivo están en `operativo_vehiculo_documentos`.",
    origen:
      `Vista GEMA \`vst_ext_get_vehiculos\`, refresco completo en cada corrida del ${CRON_GEMA}. Solo upsert por \`codigo\`: un vehículo que desaparezca de la vista de GEMA permanece aquí con sus últimos valores.`,
    identificador: "codigo",
    volumen: "~200 filas. Tabla pequeña: se puede leer completa.",
    // Sin el nombre del propietario: es un tercero afiliado, no personal de la empresa.
    columnasPorDefecto: [
      "codigo",
      "placa",
      "estado",
      "marca",
      "clase",
      "ruta",
      "grupo_liquidacion",
      "cedula_conductor",
      "conductor_nombre",
      "cedula_propietario",
      "fecha_soat",
      "fecha_tecno",
      "updated_at",
    ],
    columnas: {
      codigo: {
        descripcion:
          "Código interno del bus en GEMA (número de flota, p. ej. '537'). Llave primaria; sobrevive a un cambio de placa. Es el `codigo_vehiculo` de las demás tablas.",
        advertencia: "Es texto: filtre con eq '537', no con número. Gestivo trata los códigos ≥ 1000 como flota ecológica (NV) en los informes de rendimiento.",
      },
      placa: { descripcion: "Placa vigente del bus.", advertencia: "Puede cambiar; para cruces use `codigo`." },
      modelo: { descripcion: "Modelo del vehículo según GEMA.", advertencia: "Formato no documentado (presumiblemente el año). No verificado." },
      motor: { descripcion: "Número de motor." },
      chasis: { descripcion: "Número de chasis." },
      color: { descripcion: "Color del vehículo." },
      capacidad_sentado: { descripcion: "Pasajeros sentados que admite el bus.", unidad: "pasajeros" },
      capacidad_en_pie: { descripcion: "Pasajeros de pie que admite el bus.", unidad: "pasajeros" },
      tarjeta_propiedad: { descripcion: "Número de la tarjeta de propiedad (licencia de tránsito)." },
      pasaje_ordinario: { descripcion: "Tarifa por pasajero en día ordinario configurada para el bus.", unidad: "COP por pasajero" },
      pasaje_festivo: { descripcion: "Tarifa por pasajero en domingo o festivo configurada para el bus.", unidad: "COP por pasajero" },
      registro: { descripcion: "Campo `registro` de GEMA.", advertencia: "Significado no documentado. No verificado." },
      max_factura: { descripcion: "Campo `max_factura` de GEMA.", advertencia: "Significado y unidad no documentados. No verificado." },
      numero_tarjeta_op: { descripcion: "Número de la tarjeta de operación del bus." },
      automatico: { descripcion: "Indicador `automatico` de GEMA (1 → true).", advertencia: "Significado no documentado. NULL de origen se guarda como false." },
      estado: {
        descripcion: "Estado del vehículo en GEMA, guardado tal cual (entero). Gestivo considera activo solo `estado` = 1 (Mantenimiento, Ausentismo, Operativo y el reporte de daños).",
        valores: { "1": "Activo para gestión (aparece en tableros y formularios)" },
        advertencia: "La vista de GEMA no documenta los demás valores (presumiblemente 0 = inactivo); cualquier valor distinto de 1 se muestra como 'Inactivo'. Los inactivos también son información: no los descarte si la pregunta es histórica.",
      },
      id_unidad: { descripcion: "Campo `id_unidad` de GEMA.", advertencia: "Significado no documentado (posiblemente la unidad GPS). No verificado." },
      vinculado: { descripcion: "Indicador `vinculado` de GEMA (1 → true).", advertencia: "Significado no documentado. NULL de origen se guarda como false." },
      parametro_conteo: { descripcion: "Campo `parametro_conteo` de GEMA.", advertencia: "Significado no documentado. No verificado." },
      activo_cartulina: { descripcion: "GEMA marca la cartulina (deducciones fijas del bus) como activa (1 → true).", advertencia: "Regla exacta no documentada. NULL de origen se guarda como false." },
      activo_poliza: { descripcion: "GEMA marca la póliza del bus como activa (1 → true).", advertencia: "Regla exacta no documentada. NULL de origen se guarda como false." },
      tipo_propietario: { descripcion: "Clasificación del propietario del bus en GEMA.", advertencia: "Valores no documentados. Consulte los valores distintos antes de filtrar." },
      tipo_propietario_op: { descripcion: "Campo `tipo_propietario_op` de GEMA.", advertencia: "Significado y valores no documentados. No verificado." },
      observacion: { descripcion: "Observación libre del vehículo en GEMA." },
      tipo_carroceria: { descripcion: "Tipo de carrocería." },
      marca: { descripcion: "Marca del vehículo." },
      clase: { descripcion: "Clase de vehículo según GEMA.", advertencia: "Valores literales no verificados." },
      grupo_liquidacion: {
        descripcion: "Grupo de flota con que GEMA liquida el bus. 'NV' = flota ecológica; el resto se trata como GN en los informes de Gestivo.",
        relacion: "ingreso_tercero.grupo_liquidacion",
      },
      grupo_cu: { descripcion: "Grupo para la liquidación CU (promedios de ruta o grupo) en GEMA.", advertencia: "Valores no documentados. No verificado." },
      tipo_gps: { descripcion: "Tipo de equipo GPS del bus.", advertencia: "Valores no documentados. No verificado." },
      conductor_nombre: {
        descripcion: "Nombre del conductor asignado al bus en el maestro de GEMA.",
        advertencia: "Es la asignación actual, no quién manejó en una fecha: para eso use `viajes_recaudados`.",
      },
      cedula_conductor: {
        descripcion: "Cédula del conductor asignado, solo dígitos y sin ceros a la izquierda.",
        relacion: "conductores_con_grupo.cedula",
        advertencia: "Asignación actual; NULL si GEMA no la informa.",
      },
      propietario_nombre: { descripcion: "Nombre del propietario del bus.", sensible: true },
      cedula_propietario: { descripcion: "Cédula o NIT del propietario, solo dígitos.", relacion: "propietarios.cedula" },
      propietario_admin: {
        descripcion: "Nombre del propietario administrador del bus según GEMA.",
        sensible: true,
        advertencia: "Diferencia exacta con `propietario_nombre` no documentada. No verificado.",
      },
      cedula_propietario_admin: {
        descripcion: "Cédula o NIT del propietario administrador, solo dígitos.",
        relacion: "propietarios.cedula",
        advertencia: "Significado no documentado. No verificado.",
      },
      ruta: {
        descripcion: "Ruta asignada al bus en el maestro de GEMA.",
        advertencia: "Asignación actual, sin normalizar (guiones y espacios variables). La ruta real de cada viaje está en `viajes_recaudados`.",
      },
      nombre_cartulina: { descripcion: "Nombre con que aparece el bus en la cartulina de GEMA.", advertencia: "Significado no verificado." },
      fecha_tecno: {
        descripcion: "Vencimiento de la revisión técnico-mecánica registrado en GEMA.",
        formato: "YYYY-MM-DD, fecha calendario de Colombia",
        advertencia: "El sync descarta años < 1940 o > 2035 (quedan NULL). Un documento cargado en Gestivo puede tener una fecha más reciente.",
      },
      fecha_tarjeta_op: { descripcion: "Vencimiento de la tarjeta de operación registrado en GEMA.", formato: "YYYY-MM-DD, fecha calendario de Colombia" },
      fecha_soat: { descripcion: "Vencimiento del SOAT registrado en GEMA.", formato: "YYYY-MM-DD, fecha calendario de Colombia" },
      fecha_contrato: {
        descripcion: "Fecha de contrato del vehículo en GEMA.",
        formato: "YYYY-MM-DD",
        advertencia: "No se verificó si es inicio o vencimiento; no la usa ningún tablero.",
      },
      fecha_srcc: { descripcion: "Vencimiento de la póliza de responsabilidad civil contractual (RCC) registrado en GEMA.", formato: "YYYY-MM-DD, fecha calendario de Colombia" },
      fecha_srce: { descripcion: "Vencimiento de la póliza de responsabilidad civil extracontractual (RCE) registrado en GEMA.", formato: "YYYY-MM-DD, fecha calendario de Colombia" },
      fecha_full_amparo: {
        descripcion: "Fecha de la póliza de 'full amparo' en GEMA.",
        formato: "YYYY-MM-DD",
        advertencia: "Presumiblemente vencimiento; no verificado y no está en el catálogo de documentos de Operativo.",
      },
      source_file: { descripcion: "Origen de la carga ('GEMA')." },
      created_at: { descripcion: "Primera inserción de la fila en Gestivo.", formato: "timestamptz UTC" },
      updated_at: {
        descripcion: "Última vez que el sync escribió la fila; se reescribe en cada corrida aunque nada cambie. Sirve para ver la frescura, no cuándo cambió el dato en GEMA.",
        formato: "timestamptz UTC",
      },
    },
    relaciones: [
      { recurso: "propietarios", mediante: "vehiculos.cedula_propietario = propietarios.cedula", descripcion: "Datos del dueño actual del bus." },
      { recurso: "conductores_con_grupo", mediante: "vehiculos.cedula_conductor = conductores_con_grupo.cedula", descripcion: "Conductor asignado actualmente." },
      { recurso: "viajes_recaudados", mediante: "vehiculos.codigo = viajes_recaudados.codigo_vehiculo", descripcion: "Viajes del bus con conductor y ruta reales de cada día." },
      { recurso: "velocidades", mediante: "vehiculos.codigo = velocidades.codigo_vehiculo", descripcion: "Eventos de 50 km/h o más del bus." },
      { recurso: "pv_deltas", mediante: "vehiculos.codigo = pv_deltas.codigo_vehiculo", descripcion: "Subidas y bajadas del bus por lugar y hora." },
      {
        recurso: "operativo_vehiculo_documentos",
        mediante: "vehiculos.codigo = operativo_vehiculo_documentos.codigo_vehiculo",
        descripcion: "Documentos cargados en Gestivo (SOAT, pólizas…), que pueden actualizar las fechas de GEMA.",
      },
    ],
    advertencias: [
      "Sin filtro por defecto: los vehículos con `estado` distinto de 1 siguen en la tabla. Para contar la flota activa filtre `estado` eq 1 y dígalo en la respuesta.",
      "Conductor, propietario y ruta son la asignación ACTUAL del maestro. Para saber quién manejó o qué ruta hizo un bus en una fecha use `viajes_recaudados`.",
      "Vencimiento que rige en Operativo = la fecha más reciente entre la de GEMA (`fecha_soat`, `fecha_tecno`, `fecha_srcc`, `fecha_srce`, `fecha_tarjeta_op`) y la del último documento no anulado de `operativo_vehiculo_documentos` del mismo tipo. Una fecha vencida aquí puede estar renovada en Gestivo.",
      "Los días para vencer se cuentan con la fecha de hoy en Colombia (America/Bogota), no con la fecha UTC.",
      SYNC_SIN_ESTADO_DE_ERROR,
    ],
    noConfundirCon: [
      {
        recurso: "propietarios",
        diferencia: "Maestro de personas o empresas dueñas. vehiculos es el maestro de buses y es donde está la relación bus → propietario.",
      },
      {
        recurso: "operativo_vehiculo_documentos",
        diferencia: "Documentos cargados a mano en Gestivo, con número, entidad, archivo e historial. vehiculos solo trae la fecha de vencimiento que tiene GEMA.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos vehículos activos hay por ruta o por grupo?",
        como: "Agregado count con filtro `estado` eq 1, agrupado por `ruta` (o `grupo_liquidacion`). Advierta que la ruta es la asignada, sin normalizar.",
      },
      {
        pregunta: "¿Qué buses activos tienen el SOAT vencido o por vencer según GEMA?",
        como: "Filtros `estado` eq 1 y `fecha_soat` lte <hoy en Colombia + 30 días>; columnas `codigo, placa, fecha_soat`. Luego verifique en `operativo_vehiculo_documentos` (tipo 'soat', sin anular) si hay una fecha posterior, que es la que rige. Incluya los `fecha_soat` NULL como 'sin dato'.",
      },
      {
        pregunta: "¿De quién es y quién maneja el bus 537?",
        como: "Filtro `codigo` eq '537'; columnas `placa, estado, cedula_propietario, propietario_nombre, cedula_conductor, conductor_nombre, ruta` (nombres sensibles: pídalos solo si hacen falta).",
      },
    ],
  },

  // ── VELOCIDADES ───────────────────────────────────────────────────────────
  {
    nombre: "velocidades",
    dominio: "operativo",
    titulo: "Eventos GPS de 50 km/h o más",
    resumen:
      "Eventos GPS de cada bus con velocidad de 50 km/h o más, con posición y dirección. Base del informe de exceso de velocidad por conductor.",
    granularidad:
      "Una fila = un evento GPS de un vehículo en un instante (llave primaria compuesta `codigo_vehiculo` + `fecha_hora`, al segundo). No es una incidencia: varios eventos seguidos del mismo episodio son varias filas.",
    descripcion:
      "Solo trae eventos con velocidad mayor o igual al umbral del sync (50 km/h). No trae conductor, ruta ni despacho: el conductor se atribuye cruzando con el viaje de `viajes_recaudados` que el bus tenía despachado a esa hora (función `get_incidencias_velocidad`). Para velocidades por debajo de 50 km/h use `puntos_virtuales.velocidad`.",
    origen:
      `Procedimiento GEMA \`pa_ext_get_VelocidadesByFecha(desde, hasta, 50)\` en el ${CRON_GEMA}. Marcador propio en \`gema_sync_state\` (dataset 'velocidades'): cada corrida re-lee desde el día del marcador hasta hoy; la primera corrida cargó 7 días hacia atrás. Solo upsert por (codigo_vehiculo, fecha_hora): nunca borra.`,
    identificador: "codigo_vehiculo",
    columnaFecha: "fecha",
    volumen:
      "~1.300 filas por día con umbral 50 (unas 40.000 al mes). Filtre por `fecha` (índices en `fecha` y en `codigo_vehiculo, fecha`). Para conteos use agregados, no descargue meses completos.",
    columnasPorDefecto: ["codigo_vehiculo", "fecha_hora", "fecha", "hora", "velocidad", "latitud", "longitud", "direccion"],
    columnas: {
      codigo_vehiculo: {
        descripcion: "Código interno del bus en GEMA. Parte de la llave primaria.",
        relacion: "vehiculos.codigo",
      },
      fecha_hora: {
        descripcion: "Instante del evento, al segundo. Parte de la llave primaria.",
        formato: "timestamptz con hora local de Colombia etiquetada como UTC",
        advertencia: HORA_LOCAL_ETIQUETADA_UTC,
      },
      fecha: { descripcion: "Día del evento en hora de Colombia. Columna para filtrar.", formato: "YYYY-MM-DD, hora de Colombia" },
      hora: { descripcion: "Hora del evento como texto, en hora de Colombia.", formato: "texto 'HH:MM:SS'" },
      latitud: { descripcion: "Latitud del evento.", unidad: "grados decimales", advertencia: "Puede ser NULL." },
      longitud: { descripcion: "Longitud del evento.", unidad: "grados decimales", advertencia: "Puede ser NULL." },
      velocidad: {
        descripcion: "Velocidad instantánea reportada por el GPS. Siempre ≥ 50 por construcción.",
        unidad: "km/h",
        advertencia: "El umbral del sync sale de la variable de entorno GEMA_VELOCIDAD_MIN (mínimo 50, valor de producción no verificado). El informe de Operativo cuenta como exceso desde `operativo_velocidad_parametros.umbral_kmh` (60 por defecto), no desde 50.",
      },
      direccion: { descripcion: "Dirección textual aproximada según GEMA.", advertencia: "Puede venir vacía; calidad no verificada." },
      source_file: { descripcion: "Origen de la carga ('GEMA')." },
      created_at: { descripcion: "Primera inserción en Gestivo (UTC real). No es la hora del evento.", formato: "timestamptz UTC" },
    },
    relaciones: [
      { recurso: "vehiculos", mediante: "velocidades.codigo_vehiculo = vehiculos.codigo", descripcion: "Placa, ruta asignada y propietario del bus." },
      {
        recurso: "viajes_recaudados",
        mediante: "codigo_vehiculo = viajes_recaudados.codigo_vehiculo AND fecha_viaje en (fecha − 1, fecha) AND hora_despacho ≤ hora del evento",
        descripcion: "Conductor y ruta: el viaje del bus con el último despacho anterior al evento, descartado si llegó más de 30 minutos antes (regla de `get_incidencias_velocidad`).",
      },
      {
        recurso: "operativo_velocidad_reportes",
        mediante: "conductor atribuido (cedula) + semana lunes-domingo de `fecha`",
        descripcion: "Marca de si el conductor ya fue reportado a RRHH por esa semana.",
      },
    ],
    advertencias: [
      "Una fila no es una incidencia. El informe oficial agrupa en una incidencia los eventos del mismo vehículo con velocidad ≥ umbral separados por menos de `minutos_agrupacion` (5 min por defecto). Use la función SQL `get_incidencias_velocidad(desde, hasta, umbral, minutos)` (o `get_incidencias_velocidad_json`, que devuelve un solo JSON sin el tope de 1.000 filas de PostgREST): trae inicio y fin en hora local (TIMESTAMP sin zona), eventos, velocidad máxima y promedio, posición del pico y el conductor, ruta y viaje atribuidos; conductor NULL = no había viaje que cubriera la hora.",
      "Contar filas por conductor exige atribuir el conductor por viaje; `vehiculos.cedula_conductor` es solo la asignación actual y NO sirve para eventos pasados.",
      "Cobertura: empieza unos 7 días antes de la primera corrida del sync de velocidades (fecha no documentada). Consulte MIN(fecha) antes de afirmar que no hubo excesos en una fecha antigua.",
      "El día de `gema_sync_state.last_synced_date` (dataset 'velocidades') suele estar incompleto (el cron corre a las 03:00) y se completa en la corrida siguiente; los días anteriores al marcador no se vuelven a leer.",
      HORA_LOCAL_ETIQUETADA_UTC,
      SYNC_SIN_ESTADO_DE_ERROR,
    ],
    noConfundirCon: [
      {
        recurso: "puntos_virtuales",
        diferencia: "Toda la telemetría (~90.000 eventos/día, cualquier velocidad), con despacho activo. velocidades es solo el subconjunto ≥ 50 km/h que entrega otro procedimiento de GEMA, con otra llave (vehículo + instante).",
      },
      {
        recurso: "operativo_velocidad_reportes",
        diferencia: "Decisiones registradas de reportar a un conductor ante RRHH por una semana. velocidades son los eventos crudos que las originan.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué buses pasaron de 80 km/h la semana pasada?",
        como: "Filtros `fecha` gte <lunes> y lte <domingo>, `velocidad` gt 80; agregados count y max de `velocidad` agrupados por `codigo_vehiculo`. Aclare que son eventos, no incidencias.",
      },
      {
        pregunta: "¿Cuántas incidencias de exceso tuvo cada conductor en el mes?",
        como: "No se responde solo con esta tabla: llame a `get_incidencias_velocidad(<primer día>, <último día>, <umbral_kmh vigente>, <minutos_agrupacion vigente>)` y agrupe por `cedula_conductor`; reporte aparte las incidencias sin conductor.",
      },
      {
        pregunta: "¿Dónde ocurrieron los excesos del bus 537 un día?",
        como: "Filtros `codigo_vehiculo` eq '537' y `fecha` eq <día>; columnas `hora, velocidad, latitud, longitud, direccion`, orden por `fecha_hora`.",
      },
    ],
  },

  // ── PV DELTAS ─────────────────────────────────────────────────────────────
  {
    nombre: "pv_deltas",
    dominio: "operativo",
    titulo: "Subidas y bajadas por evento GPS",
    resumen:
      "Pasajeros que suben y bajan en cada evento de telemetría con movimiento, ya calculados como diferencia del contador, con posición, geocerca, hora, vehículo, despacho y ruta normalizada. Fuente del mapa de calor.",
    granularidad:
      "Una fila = un evento de `puntos_virtuales` (mismo `numero`, llave primaria) en el que subió o bajó al menos un pasajero. Los eventos sin movimiento no tienen fila.",
    descripcion:
      "Tabla derivada: `refrescar_pv_deltas` calcula, por despacho y en orden de `fecha_hora`, la diferencia de los contadores acumulados `subidas` y `bajadas` de `puntos_virtuales` respecto al evento anterior. Como ya son incrementos, `dsub` y `dbaj` SÍ se suman. Excluye eventos sin despacho, contadores fuera de 0-2.000, deltas de más de 60 pasajeros, sin posición o en (0,0). No trae conductor ni dinero.",
    origen:
      "Función SQL `refrescar_pv_deltas(dia, dia)`, que el sync de `puntos_virtuales` ejecuta tras cargar cada día (borra y reinserta ese día). Histórico poblado por las migraciones 061, 063 y 070 sobre todo `puntos_virtuales` existente en su momento. Misma frecuencia que `puntos_virtuales` (cron diario, 03:00 hora de Colombia).",
    identificador: "numero",
    columnaFecha: "fecha",
    volumen:
      "~15.000 filas por día. Filtre siempre por `fecha` (índices en `fecha` y en `codigo_vehiculo, fecha`) y use agregados sum con agrupación.",
    columnasPorDefecto: [
      "numero",
      "fecha",
      "hora",
      "codigo_vehiculo",
      "numero_despacho",
      "ruta",
      "cod_pv",
      "punto_virtual",
      "dsub",
      "dbaj",
      "lat",
      "lng",
    ],
    columnas: {
      numero: { descripcion: "Número del evento en GEMA; llave primaria.", relacion: "puntos_virtuales.numero" },
      fecha: { descripcion: "Día del evento en hora de Colombia. Columna para filtrar.", formato: "YYYY-MM-DD, hora de Colombia" },
      hora: {
        descripcion: "Hora del día del evento (0 a 23), tomada de los dos primeros caracteres de `puntos_virtuales.hora`.",
        unidad: "hora del día (entero)",
        formato: "entero 0-23, hora de Colombia",
      },
      lat: { descripcion: "Latitud del evento redondeada a 4 decimales (~11 m); agrupa eventos cercanos en una misma celda.", unidad: "grados decimales" },
      lng: { descripcion: "Longitud del evento redondeada a 4 decimales.", unidad: "grados decimales" },
      cod_pv: {
        descripcion: "Código de la geocerca (punto virtual) del evento. Úselo para agrupar: los nombres no son únicos.",
        advertencia: "'0' o NULL = fuera de geocerca.",
      },
      punto_virtual: { descripcion: "Nombre de la geocerca.", advertencia: "'N/A' cuando no hay geocerca; nombres repetidos entre códigos." },
      direccion: { descripcion: "Dirección textual según GEMA.", advertencia: "Frecuentemente vacía o 'SIN DEFINIR…'." },
      codigo_vehiculo: { descripcion: "Código interno del bus en GEMA.", relacion: "vehiculos.codigo" },
      ruta: {
        descripcion: "Ruta del viaje del despacho: `norm_ruta(COALESCE(ruta_reprogramada, ruta_programada))` de `viajes_recaudados`.",
        relacion: "viajes_recaudados.ruta_programada",
        advertencia:
          "NULL cuando el despacho no tenía viaje recaudado al calcular el día; como los días anteriores no se recalculan, un recaudo que llegue tarde deja la ruta NULL para siempre. `norm_ruta` colapsa guiones repetidos: 'A -- 16 MIRAMAR' (EXPRESS) y 'A - 16 MIRAMAR' quedan como la misma ruta.",
      },
      dsub: {
        descripcion: "Pasajeros que subieron en este evento (incremento del contador de subidas del despacho). Se puede sumar.",
        unidad: "pasajeros",
        valores: ["0 a 60"],
        advertencia: "Si el contador retrocede (reinicio del equipo) el delta es 0. Es un conteo del sensor de puertas, no timbradas: la cifra oficial por viaje es `viajes_recaudados.timbradas`.",
      },
      dbaj: {
        descripcion: "Pasajeros que bajaron en este evento (incremento del contador de bajadas). Se puede sumar.",
        unidad: "pasajeros",
        valores: ["0 a 60"],
      },
      velocidad: {
        descripcion: "Velocidad instantánea del evento copiada de `puntos_virtuales`.",
        unidad: "km/h",
        advertencia: "Puede ser NULL o negativa; excluya < 0 al promediar.",
      },
      numero_despacho: {
        descripcion: "Despacho (viaje) al que pertenece el evento. Nunca NULL en la práctica (los eventos sin despacho se excluyen).",
        relacion: "viajes_recaudados.numero",
        advertencia: "Puede no existir en `viajes_recaudados` (despacho sin recaudo); use LEFT JOIN.",
      },
    },
    relaciones: [
      { recurso: "puntos_virtuales", mediante: "pv_deltas.numero = puntos_virtuales.numero", descripcion: "Evento crudo completo (contadores acumulados, alarmas, IMEI)." },
      {
        recurso: "viajes_recaudados",
        mediante: "pv_deltas.numero_despacho = viajes_recaudados.numero",
        descripcion: "Conductor, timbradas y dinero del viaje. LEFT JOIN: hay despachos sin recaudo.",
      },
      { recurso: "vehiculos", mediante: "pv_deltas.codigo_vehiculo = vehiculos.codigo", descripcion: "Maestro del bus." },
    ],
    advertencias: [
      "SUM(dsub) de un viaje no tiene por qué igualar las timbradas: el sensor de puertas y la registradora miden distinto, y el filtro descarta eventos basura. Para pasajeros oficiales use `viajes_recaudados.timbradas`; pv_deltas sirve para distribuir por lugar, geocerca y hora.",
      "Cada día se calcula una sola vez, cuando el sync de `puntos_virtuales` lo procesa (el día del marcador se recalcula en la corrida siguiente). Cambios posteriores en `viajes_recaudados` no se reflejan en `ruta`.",
      "Cobertura: igual o menor que la de `puntos_virtuales`. La carga histórica puntual por script de `puntos_virtuales` no recalcula esta tabla; no está verificado que pv_deltas cubra todo ese histórico. Consulte MIN(fecha).",
      "El filtro por `ruta` excluye los despachos sin recaudo (ruta NULL); el total por vehículo o por geocerca sí los incluye. Dígalo si compara ambos.",
      "`hora` es entera: para franjas use `hora` gte/lte, no rangos de texto.",
    ],
    noConfundirCon: [
      {
        recurso: "puntos_virtuales",
        diferencia: "Telemetría cruda con `subidas` y `bajadas` ACUMULADAS por despacho (nunca se suman). pv_deltas trae los incrementos por evento ya limpios (`dsub`, `dbaj`), solo de eventos con movimiento, y la ruta normalizada.",
      },
      {
        recurso: "viajes_recaudados",
        diferencia: "Una fila por viaje con timbradas liquidadas (cifra oficial). pv_deltas es el reparto del conteo del sensor por evento y lugar.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿En qué paradas sube más gente en una ruta?",
        como: "Filtros `fecha` gte/lte, `ruta` eq <ruta normalizada>, `cod_pv` neq '0'; agregado sum de `dsub` y `dbaj` agrupado por `cod_pv` y `punto_virtual`, orden por la suma descendente.",
      },
      {
        pregunta: "¿A qué hora se concentra la demanda?",
        como: "Filtro `fecha` en el rango; agregado sum de `dsub` agrupado por `hora`.",
      },
      {
        pregunta: "¿Dónde subieron los pasajeros del viaje N?",
        como: "Filtros `fecha` eq <día> y `numero_despacho` eq N; columnas `hora, cod_pv, punto_virtual, lat, lng, dsub, dbaj`, orden por `numero`. Compare el total con `viajes_recaudados.timbradas`.",
      },
    ],
  },

  // ── TIPOS DE DOCUMENTO ────────────────────────────────────────────────────
  {
    nombre: "operativo_documento_tipos",
    dominio: "operativo",
    titulo: "Catálogo de documentos del vehículo",
    resumen:
      "Los documentos obligatorios que Operativo controla por vehículo (SOAT, técnico-mecánica, pólizas RCC y RCE, tarjeta de operación), con la columna de GEMA que les corresponde y los umbrales de aviso.",
    granularidad: "Una fila = un tipo de documento identificado por `key`. 5 filas sembradas.",
    descripcion:
      "Catálogo de configuración. Define qué fecha de `vehiculos` alimenta cada documento y cuántos días antes del vencimiento se alerta como 'próximo' y como 'crítico'. Los umbrales se editan desde la pantalla de Operativo; no guarda historia de cambios.",
    origen: "Sembrado por la migración 20260904191056; umbrales editables en la aplicación (tiempo real).",
    identificador: "key",
    volumen: "5 filas.",
    columnasPorDefecto: ["key", "nombre", "columna_gema", "dias_proximo", "dias_critico", "activo", "orden"],
    columnas: {
      key: {
        descripcion: "Identificador del tipo; es el valor de `operativo_vehiculo_documentos.tipo`.",
        valores: {
          soat: "SOAT",
          tecnomecanica: "Revisión técnico-mecánica",
          poliza_rcc: "Póliza RC contractual",
          poliza_rce: "Póliza RC extracontractual",
          tarjeta_operacion: "Tarjeta de operación",
        },
      },
      nombre: { descripcion: "Nombre legible del documento." },
      columna_gema: {
        descripcion: "Columna DATE de `vehiculos` con el vencimiento que trae GEMA para este documento.",
        valores: {
          fecha_soat: "Usada por 'soat'",
          fecha_tecno: "Usada por 'tecnomecanica'",
          fecha_srcc: "Usada por 'poliza_rcc'",
          fecha_srce: "Usada por 'poliza_rce'",
          fecha_tarjeta_op: "Usada por 'tarjeta_operacion'",
          fecha_full_amparo: "Permitida por el CHECK; sin tipo sembrado",
          fecha_contrato: "Permitida por el CHECK; sin tipo sembrado",
        },
        advertencia: "NULL = el documento solo se controla con lo cargado en Gestivo.",
      },
      dias_proximo: {
        descripcion: "Días antes del vencimiento desde los que el documento se marca 'próximo a vencer'.",
        unidad: "días",
        advertencia: "Sembrado en 30. La aplicación admite 1 a 365; siempre ≥ `dias_critico`.",
      },
      dias_critico: {
        descripcion: "Días antes del vencimiento desde los que el documento se marca 'crítico'.",
        unidad: "días",
        advertencia: "Sembrado en 15. La aplicación admite 0 a 365.",
      },
      orden: { descripcion: "Orden de presentación en pantallas e informes (10, 20, 30…)." },
      activo: { descripcion: "Si el tipo se controla. Los inactivos no salen en el tablero ni admiten cargas nuevas." },
      updated_by_email: { descripcion: "Correo del usuario de Gestivo que cambió los umbrales por última vez.", sensible: true },
      updated_at: { descripcion: "Última modificación de la fila.", formato: "timestamptz UTC" },
    },
    relaciones: [
      {
        recurso: "operativo_vehiculo_documentos",
        mediante: "operativo_documento_tipos.key = operativo_vehiculo_documentos.tipo",
        descripcion: "Documentos cargados de este tipo.",
      },
      {
        recurso: "vehiculos",
        mediante: "la columna de `vehiculos` cuyo nombre indica `columna_gema`",
        descripcion: "Vencimiento según GEMA para este tipo.",
      },
    ],
    advertencias: [
      "Nivel de alerta (lo calcula la aplicación, no se guarda): días = fecha que rige − hoy en Colombia; NULL → 'sin_dato' (lo más grave); < 0 → 'vencido'; ≤ `dias_critico` → 'critico'; ≤ `dias_proximo` → 'proximo'; si no, 'al_dia'. La fecha que rige es la más reciente entre la de GEMA y la del último documento no anulado.",
      "Los umbrales actuales se aplican a todo, también a lo ya vencido: cambiar un umbral cambia los niveles de todos los vehículos de inmediato.",
    ],
    noConfundirCon: [
      {
        recurso: "operativo_vehiculo_documentos",
        diferencia: "Los documentos concretos por vehículo. Este recurso es solo el catálogo y la configuración de alertas.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Con cuántos días de anticipación se avisa que vence el SOAT?",
        como: "Filtro `key` eq 'soat'; leer `dias_proximo` y `dias_critico`.",
      },
      {
        pregunta: "¿Qué fecha de GEMA se usa para la póliza extracontractual?",
        como: "Filtro `key` eq 'poliza_rce'; leer `columna_gema` y consultar esa columna en `vehiculos`.",
      },
    ],
  },

  // ── DOCUMENTOS DEL VEHÍCULO ───────────────────────────────────────────────
  {
    nombre: "operativo_vehiculo_documentos",
    dominio: "operativo",
    titulo: "Documentos cargados por vehículo",
    resumen:
      "SOAT, técnico-mecánica, pólizas y tarjetas de operación registrados en Gestivo por vehículo, con número, entidad, fechas de expedición y vencimiento, archivo adjunto y anulación con rastro.",
    granularidad:
      "Una fila = un documento cargado para un vehículo y un tipo. Un vehículo tiene varias filas del mismo tipo a lo largo del tiempo (renovaciones); la vigente es la no anulada con mayor `fecha_vencimiento` (desempate por `created_at` más reciente).",
    descripcion:
      "Complementa las fechas de `vehiculos`, que son de solo lectura y sin archivos. Solo se cargan documentos de vehículos con `estado` = 1 y tipos activos. No se borran: se anulan con motivo. El archivo vive en el bucket privado 'operativo' de Storage y solo se ve con URL firmada desde la aplicación.",
    origen: "Carga manual en el módulo Operativo de Gestivo (ruta `/api/operativo/documentos`), en tiempo real. Módulo creado el 2026-09-04: no hay documentos anteriores.",
    identificador: "id",
    columnaFecha: "fecha_vencimiento",
    volumen: "Pequeño (cargas manuales desde septiembre de 2026; como máximo unas pocas filas por vehículo y tipo). Tamaño exacto no documentado.",
    filtroPorDefecto: {
      columna: "anulado_en",
      operador: "is",
      valor: null,
      motivo: "Un documento anulado es un registro dado de baja con motivo: no cuenta como vigente en ningún tablero. Desactive el filtro solo para auditar anulaciones.",
    },
    columnasPorDefecto: [
      "id",
      "codigo_vehiculo",
      "tipo",
      "numero",
      "entidad",
      "fecha_expedicion",
      "fecha_vencimiento",
      "archivo_nombre",
      "created_at",
      "anulado_en",
    ],
    columnas: {
      id: { descripcion: "UUID del documento." },
      codigo_vehiculo: { descripcion: "Código del bus en GEMA (llave foránea al maestro).", relacion: "vehiculos.codigo" },
      tipo: {
        descripcion: "Tipo de documento.",
        relacion: "operativo_documento_tipos.key",
        valores: {
          soat: "SOAT",
          tecnomecanica: "Revisión técnico-mecánica",
          poliza_rcc: "Póliza RC contractual",
          poliza_rce: "Póliza RC extracontractual",
          tarjeta_operacion: "Tarjeta de operación",
        },
      },
      numero: { descripcion: "Número de la póliza, del SOAT o del certificado.", advertencia: "Opcional (texto libre, hasta 120 caracteres)." },
      entidad: { descripcion: "Aseguradora o centro de diagnóstico (CDA) que expidió el documento.", advertencia: "Texto libre, sin catálogo: la misma entidad puede estar escrita de varias formas." },
      fecha_expedicion: { descripcion: "Fecha de expedición del documento (opcional; nunca posterior al vencimiento).", formato: "YYYY-MM-DD, fecha calendario de Colombia" },
      fecha_vencimiento: {
        descripcion: "Fecha de vencimiento del documento. Obligatoria.",
        formato: "YYYY-MM-DD, fecha calendario de Colombia",
        advertencia: "No es necesariamente la que rige: la vigente para el vehículo es la mayor entre esta (del último documento no anulado) y la de GEMA en `vehiculos`.",
      },
      archivo_ruta: {
        descripcion: "Ruta del archivo en el bucket privado 'operativo' (`<codigo>/<tipo>/<marca>-<aleatorio>.<ext>`). No es una URL descargable.",
        advertencia: "NULL = se registró la vigencia sin adjuntar archivo.",
      },
      archivo_nombre: { descripcion: "Nombre original del archivo subido." },
      archivo_mime: {
        descripcion: "Tipo del archivo.",
        valores: { "application/pdf": "PDF", "image/jpeg": "Foto JPG", "image/png": "Imagen PNG", "image/webp": "Imagen WebP" },
      },
      archivo_tamano: { descripcion: "Tamaño del archivo (máximo 4 MB).", unidad: "bytes" },
      observaciones: { descripcion: "Nota libre de quien cargó el documento (hasta 1.000 caracteres)." },
      created_by: { descripcion: "UUID del usuario de Gestivo que cargó el documento." },
      created_by_email: { descripcion: "Correo del usuario que cargó el documento.", sensible: true },
      created_at: { descripcion: "Momento de la carga en Gestivo.", formato: "timestamptz UTC" },
      anulado_en: {
        descripcion: "Momento de la anulación. NULL = documento no anulado.",
        formato: "timestamptz UTC",
      },
      anulado_por_email: { descripcion: "Correo del usuario que anuló el documento.", sensible: true },
      motivo_anulacion: { descripcion: "Motivo de la anulación (5 a 200 caracteres)." },
    },
    relaciones: [
      { recurso: "vehiculos", mediante: "operativo_vehiculo_documentos.codigo_vehiculo = vehiculos.codigo", descripcion: "Placa y fecha de GEMA del mismo documento (columna indicada por el catálogo)." },
      { recurso: "operativo_documento_tipos", mediante: "operativo_vehiculo_documentos.tipo = operativo_documento_tipos.key", descripcion: "Nombre del documento, columna de GEMA y umbrales de aviso." },
    ],
    advertencias: [
      "Una fila no dice si el vehículo está al día: puede haber una renovación posterior (otra fila) o una fecha más reciente en GEMA. El tablero de Operativo usa la vista `vw_operativo_vencimientos` (vehículo activo × tipo, con fecha de GEMA, del documento, la que rige y discrepancia); su columna `dias_restantes` usa la fecha UTC y es solo de apoyo.",
      "Que un vehículo no tenga filas no significa que le falte el documento: puede estar cubierto por la fecha de GEMA.",
      "Si el vehículo pasa a inactivo en GEMA, sus documentos siguen aquí pero no aparecen en el tablero.",
    ],
    noConfundirCon: [
      {
        recurso: "vehiculos",
        diferencia: "Trae la fecha de vencimiento que tiene GEMA (sin número, entidad ni archivo). Este recurso guarda lo que Operativo carga y verifica en Gestivo.",
      },
      {
        recurso: "operativo_documento_tipos",
        diferencia: "Catálogo de los tipos de documento y sus umbrales; no tiene documentos concretos.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuál es el SOAT vigente del bus 537?",
        como: "Filtros `codigo_vehiculo` eq '537' y `tipo` eq 'soat' (con el filtro por defecto de no anulados); orden `fecha_vencimiento` descendente, límite 1. Compare con `vehiculos.fecha_soat` y reporte la mayor como la que rige.",
      },
      {
        pregunta: "¿Qué documentos cargados vencen en los próximos 30 días?",
        como: "Filtros `fecha_vencimiento` gte <hoy en Colombia> y lte <hoy + 30>; columnas `codigo_vehiculo, tipo, numero, entidad, fecha_vencimiento`. Descarte los que tengan otra fila posterior del mismo vehículo y tipo, o una fecha de GEMA más reciente.",
      },
      {
        pregunta: "¿Qué documentos se anularon y por qué?",
        como: "Desactivar el filtro por defecto y filtrar `anulado_en` not is null; columnas `codigo_vehiculo, tipo, fecha_vencimiento, anulado_en, motivo_anulacion`.",
      },
    ],
  },

  // ── REPORTES DE VELOCIDAD A RRHH ──────────────────────────────────────────
  {
    nombre: "operativo_velocidad_reportes",
    dominio: "operativo",
    titulo: "Reportes a RRHH por exceso de velocidad",
    resumen:
      "Marca de que Operativo reportó a Recursos Humanos a un conductor por sus incidencias de exceso de velocidad en una semana, con cuántas incidencias y la velocidad máxima de ese momento.",
    granularidad:
      "Una fila = un conductor reportado por una semana de lunes a domingo. Solo puede haber un reporte no anulado por (`cedula`, `semana_desde`); los anulados quedan como filas adicionales.",
    descripcion:
      "Registro de la decisión, no el cálculo: `incidencias` y `velocidad_max` son una copia de lo que mostraba el informe al marcar. El informe propone reportar al conductor con `minimo_incidencias` o más incidencias en la semana, pero la marca la pone una persona; que un conductor reportable no tenga fila significa 'pendiente'. No se borra: se anula con motivo.",
    origen:
      "Carga manual desde Operativo › Exceso de velocidad (tiempo real). Cada marca y anulación también queda en `tesoreria_audit_log` (acciones 'velocidad_reportado_rrhh' y 'velocidad_reporte_anulado'). Módulo creado el 2026-09-04.",
    identificador: "id",
    columnaFecha: "semana_desde",
    volumen: "Pequeño (marcas manuales desde septiembre de 2026); tamaño exacto no documentado.",
    filtroPorDefecto: {
      columna: "anulada_en",
      operador: "is",
      valor: null,
      motivo: "Un reporte anulado quedó sin efecto y no cuenta como reportado en el informe. Desactive el filtro solo para auditar anulaciones.",
    },
    columnasPorDefecto: [
      "id",
      "cedula",
      "codigo",
      "nombre",
      "semana_desde",
      "semana_hasta",
      "incidencias",
      "velocidad_max",
      "reportado_en",
      "anulada_en",
    ],
    columnas: {
      id: { descripcion: "UUID del reporte." },
      cedula: {
        descripcion: "Cédula del conductor reportado, solo dígitos.",
        relacion: "conductores_con_grupo.cedula",
      },
      codigo: {
        descripcion: "Código de personal del conductor en GEMA, si el informe lo tenía.",
        relacion: "viajes_recaudados.codigo_conductor",
        advertencia: "Opcional; puede ser NULL.",
      },
      nombre: { descripcion: "Nombre del conductor al momento del reporte." },
      semana_desde: {
        descripcion: "Lunes de la semana reportada. Columna para filtrar por periodo.",
        formato: "YYYY-MM-DD, fecha calendario de Colombia (siempre lunes)",
      },
      semana_hasta: {
        descripcion: "Domingo de la misma semana, aunque caiga en el mes siguiente.",
        formato: "YYYY-MM-DD, fecha calendario de Colombia (siempre domingo)",
      },
      incidencias: {
        descripcion: "Incidencias de la semana que motivaron el reporte, contadas con los parámetros vigentes al marcar.",
        unidad: "incidencias (episodios, no eventos)",
        advertencia: "No se recalcula si después cambian los parámetros o llegan datos tardíos.",
      },
      velocidad_max: { descripcion: "Velocidad máxima del conductor en esa semana al marcar.", unidad: "km/h" },
      reportado_en: {
        descripcion: "Día en que se entregó el reporte a Recursos Humanos, indicado por el usuario.",
        formato: "YYYY-MM-DD, fecha calendario de Colombia",
      },
      observaciones: { descripcion: "Nota libre del reporte (hasta 300 caracteres)." },
      created_by: { descripcion: "UUID del usuario de Gestivo que marcó el reporte." },
      created_by_email: { descripcion: "Correo del usuario que marcó el reporte.", sensible: true },
      created_at: { descripcion: "Momento en que se registró la marca en Gestivo.", formato: "timestamptz UTC" },
      anulada_en: { descripcion: "Momento de la anulación. NULL = reporte vigente.", formato: "timestamptz UTC" },
      anulada_por_email: { descripcion: "Correo del usuario que anuló el reporte.", sensible: true },
      motivo_anulacion: { descripcion: "Motivo de la anulación (5 a 200 caracteres)." },
    },
    relaciones: [
      { recurso: "conductores_con_grupo", mediante: "operativo_velocidad_reportes.cedula = conductores_con_grupo.cedula", descripcion: "Maestro del conductor." },
      {
        recurso: "velocidades",
        mediante: "`get_incidencias_velocidad(semana_desde, semana_hasta, umbral, minutos)` filtrado por `cedula_conductor` = cedula",
        descripcion: "Detalle de las incidencias que sustentan el reporte (recalculadas con los parámetros de hoy).",
      },
      { recurso: "operativo_velocidad_parametros", mediante: "fila única id = 1", descripcion: "Mínimo de incidencias vigente para saber quién es reportable." },
    ],
    advertencias: [
      "Sin fila ≠ sin exceso: solo hay filas para conductores que alguien marcó. Para 'pendientes' calcule las incidencias por conductor y semana con `get_incidencias_velocidad` y quite los que ya tienen reporte vigente.",
      "Las semanas son completas de lunes a domingo y no se recortan al mes: un reporte de la semana 31/08-06/09 cuenta para agosto y septiembre. Filtre por solapamiento (`semana_desde` lte fin AND `semana_hasta` gte inicio).",
      "Las incidencias con conductor NULL (sin viaje que cubra la hora) nunca generan reporte.",
    ],
    noConfundirCon: [
      {
        recurso: "velocidades",
        diferencia: "Eventos GPS crudos ≥ 50 km/h por vehículo, sin conductor. Este recurso son las decisiones de reporte por conductor y semana.",
      },
      {
        recurso: "operativo_velocidad_parametros",
        diferencia: "Configuración única (umbral, mínimo, minutos). No dice a quién se reportó.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos conductores se reportaron a RRHH por velocidad en agosto?",
        como: "Filtros `semana_desde` lte '2026-08-31' y `semana_hasta` gte '2026-08-01' (con el filtro por defecto de no anulados); agregado count distinto de `cedula`.",
      },
      {
        pregunta: "¿El conductor con cédula X ya fue reportado esta semana?",
        como: "Filtros `cedula` eq X y `semana_desde` eq <lunes de esta semana en Colombia>; columnas `incidencias, velocidad_max, reportado_en`.",
      },
      {
        pregunta: "¿Qué conductores son reincidentes?",
        como: "Agregado count agrupado por `cedula` en el periodo, filtrando los que tienen 2 o más semanas reportadas.",
      },
    ],
  },

  // ── PARÁMETROS DE VELOCIDAD ───────────────────────────────────────────────
  {
    nombre: "operativo_velocidad_parametros",
    dominio: "operativo",
    titulo: "Parámetros del informe de exceso de velocidad",
    resumen:
      "Configuración vigente del informe de velocidad: umbral de exceso, incidencias semanales para reportar a RRHH y minutos que separan dos incidencias.",
    granularidad: "Una sola fila (`id` = 1, garantizado por CHECK).",
    descripcion:
      "Valores que la aplicación pasa a `get_incidencias_velocidad`. Guarda solo el valor actual; los cambios anteriores quedan en `tesoreria_audit_log` (acción 'velocidad_parametros'). Si la fila no existe, la aplicación usa 60 km/h, 4 incidencias y 5 minutos.",
    origen: "Sembrada por la migración 20260904212545 con los valores por defecto; editable desde Operativo › Exceso de velocidad (tiempo real).",
    identificador: "id",
    volumen: "1 fila.",
    columnasPorDefecto: ["id", "umbral_kmh", "minimo_incidencias", "minutos_agrupacion", "updated_at"],
    columnas: {
      id: { descripcion: "Siempre 1.", valores: ["1"] },
      umbral_kmh: {
        descripcion: "Velocidad desde la que un evento cuenta como exceso (mayor o igual).",
        unidad: "km/h",
        advertencia: "Por defecto 60; CHECK entre 50 y 150 (GEMA no reporta por debajo de 50).",
      },
      minimo_incidencias: {
        descripcion: "Incidencias en la misma semana (lunes a domingo) desde las que el conductor se considera reportable a RRHH.",
        unidad: "incidencias",
        advertencia: "Por defecto 4; CHECK entre 1 y 100.",
      },
      minutos_agrupacion: {
        descripcion: "Dos eventos del mismo vehículo separados por menos de estos minutos pertenecen a la misma incidencia.",
        unidad: "minutos",
        advertencia: "Por defecto 5; CHECK entre 1 y 120.",
      },
      updated_by_email: { descripcion: "Correo del usuario que cambió los parámetros por última vez.", sensible: true },
      updated_at: { descripcion: "Último cambio de los parámetros.", formato: "timestamptz UTC" },
    },
    relaciones: [
      { recurso: "velocidades", mediante: "velocidades.velocidad >= umbral_kmh", descripcion: "Eventos que cuentan como exceso con el umbral vigente." },
      { recurso: "operativo_velocidad_reportes", mediante: "incidencias >= minimo_incidencias", descripcion: "Regla para proponer el reporte a RRHH." },
    ],
    advertencias: [
      "Cambiar los parámetros recalcula el informe de cualquier periodo, también el pasado, pero NO los reportes ya registrados: un reporte antiguo pudo hacerse con otro umbral.",
      "Bandas de gravedad fijas en la aplicación (no están en esta tabla): hasta 65 km/h bajo, 66-70 moderado, 71-80 alto, más de 80 crítico.",
    ],
    noConfundirCon: [
      {
        recurso: "operativo_velocidad_reportes",
        diferencia: "Reportes concretos por conductor y semana. Este recurso es solo la regla vigente.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Desde qué velocidad se considera exceso?",
        como: "Leer `umbral_kmh` de la fila `id` eq 1 (60 si no hay fila).",
      },
      {
        pregunta: "¿Cuántas incidencias hacen falta para reportar a un conductor?",
        como: "Leer `minimo_incidencias` y `minutos_agrupacion` de la fila `id` eq 1; explicar que se cuentan por semana de lunes a domingo.",
      },
    ],
  },

  // ── ESTADO DEL SYNC DE GEMA ───────────────────────────────────────────────
  {
    nombre: "gema_sync_state",
    dominio: "gema",
    titulo: "Estado de la sincronización con GEMA",
    resumen:
      "Una fila por dataset sincronizado desde GEMA con la última corrida exitosa, el marcador de fecha y las filas procesadas. Se usa para juzgar qué tan frescos están los datos.",
    granularidad: "Una fila = un dataset (llave primaria `dataset`). 10 filas.",
    descripcion:
      "Cada función del sync actualiza su fila SOLO al terminar bien. No es un historial de corridas (se sobrescribe) ni un registro de errores. Consúltela antes de concluir que no hubo operación, viajes o eventos en una fecha reciente.",
    origen: `Escrita por \`src/lib/gema/sync.ts\` en cada corrida del ${CRON_GEMA}. Filas sembradas por las migraciones 011, 027, 057 y 058.`,
    identificador: "dataset",
    columnaFecha: "last_run_at",
    volumen: "10 filas.",
    columnasPorDefecto: ["dataset", "last_synced_date", "last_run_at", "rows_synced", "status", "error"],
    columnas: {
      dataset: {
        descripcion: "Conjunto de datos sincronizado y tabla que alimenta.",
        valores: {
          conductores: "Maestro → tabla `conductores` (refresco completo)",
          empleados: "Maestro → tabla `employees` (refresco completo; excluye conductores)",
          propietarios: "Maestro → tabla `propietarios` (refresco completo)",
          vehiculos: "Maestro → tabla `vehiculos` (refresco completo)",
          cierres: "Operacional → `cierres_diarios`; su marcador define desde dónde re-sincroniza la corrida",
          viajes_perdidos: "Operacional → `viajes_perdidos` (borra y reinserta la ventana)",
          ingreso_tercero: "Operacional → `ingreso_tercero`",
          viajes_recaudados: "Operacional → `viajes_recaudados`",
          velocidades: "Telemetría → `velocidades` (marcador propio)",
          puntos_virtuales: "Telemetría → `puntos_virtuales` y `pv_deltas` (marcador propio, día por día)",
        },
      },
      last_synced_date: {
        descripcion:
          "Marcador de fecha. En cierres, viajes_perdidos, ingreso_tercero y viajes_recaudados = fecha más reciente con datos recibida en la última corrida (si GEMA no devolvió filas, el inicio de la ventana, ~45 días atrás). En velocidades y puntos_virtuales = último día con datos; la corrida siguiente vuelve a leer desde ese día.",
        formato: "YYYY-MM-DD, fecha calendario de Colombia",
        advertencia: "Siempre NULL en los maestros (conductores, empleados, propietarios, vehiculos): para ellos use `last_run_at`. El día del marcador puede estar incompleto.",
      },
      last_run_at: {
        descripcion: "Momento en que terminó la última corrida exitosa de ese dataset. En puntos_virtuales se actualiza tras cada día procesado.",
        formato: "timestamptz UTC real (no hora local etiquetada)",
        advertencia: "NULL = el dataset nunca se ha sincronizado con éxito.",
      },
      rows_synced: {
        descripcion: "Filas escritas por la última corrida exitosa.",
        unidad: "filas",
        advertencia: "No son filas nuevas: en los operacionales es toda la ventana re-sincronizada (~45 días) y en puntos_virtuales el acumulado de los días procesados en la corrida.",
      },
      status: {
        descripcion: "Estado registrado del dataset.",
        valores: { idle: "Valor inicial: nunca se ha sincronizado con éxito", ok: "Hubo al menos una corrida exitosa (no dice que la última lo fuera)" },
        advertencia: "Nunca toma un valor de error: una corrida fallida no toca la fila y el status sigue en 'ok'.",
      },
      error: {
        descripcion: "Mensaje de error.",
        advertencia: "En la práctica siempre NULL: el sync lo limpia en cada éxito y no lo escribe al fallar. Los errores de corridas manuales quedan en `tesoreria_audit_log` (acción 'sincronizacion_gema', `detalle.filas[].error`); los del cron solo en la respuesta HTTP y los registros de Vercel.",
      },
    },
    relaciones: [
      { recurso: "puntos_virtuales", mediante: "dataset = 'puntos_virtuales'", descripcion: "Hasta qué día hay telemetría (y deltas en `pv_deltas`)." },
      { recurso: "velocidades", mediante: "dataset = 'velocidades'", descripcion: "Hasta qué día hay eventos de velocidad." },
      { recurso: "viajes_recaudados", mediante: "dataset = 'viajes_recaudados'", descripcion: "Frescura de los viajes recaudados." },
      { recurso: "vehiculos", mediante: "dataset = 'vehiculos'", descripcion: "Última actualización del maestro de vehículos." },
    ],
    advertencias: [
      "Cómo juzgar la frescura: el cron corre una vez al día a las 08:00 UTC (03:00 en Colombia). Si `last_run_at` de un dataset tiene más de ~26 horas, sus últimas corridas fallaron o no se ejecutaron, aunque `status` diga 'ok'. Compare `last_run_at` entre datasets: uno rezagado respecto a los demás falló solo.",
      SYNC_SIN_ESTADO_DE_ERROR,
      "Un `last_synced_date` reciente en velocidades o puntos_virtuales solo indica el último día con datos, que suele estar a medias; los días posteriores faltan por completo si el sync va atrasado (puntos_virtuales procesa tantos días como alcance en ~200 s por corrida).",
      "Los datos operacionales de los últimos 45 días se re-sincronizan en cada corrida y pueden cambiar; un día reciente sin filas no prueba que no hubo operación.",
    ],
    noConfundirCon: [
      {
        recurso: "puntos_virtuales",
        diferencia: "Los datos en sí. MAX(fecha) de una tabla dice qué hay cargado; gema_sync_state dice cuándo corrió el sync y desde dónde seguirá.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Están actualizados los datos de GEMA?",
        como: "Leer todas las filas con `dataset, last_run_at, last_synced_date`; marcar como desactualizado cualquier dataset con `last_run_at` anterior a ahora − 26 horas, ignorando `status`.",
      },
      {
        pregunta: "¿Hasta qué día puedo confiar en la telemetría o en los excesos de velocidad?",
        como: "Filtro `dataset` in ('puntos_virtuales', 'velocidades'); los días anteriores a `last_synced_date` están completos y ese día puede estar parcial.",
      },
      {
        pregunta: "¿Cuándo se actualizó por última vez el maestro de vehículos?",
        como: "Filtro `dataset` eq 'vehiculos'; leer `last_run_at` (su `last_synced_date` es siempre NULL).",
      },
    ],
  },
];
