// Catálogo semántico del MCP: dominios "ausentismo" y "accidentabilidad".
//
// Fuentes verificadas: migraciones 005, 008, 009, 018, 019, 042 y las de marca
// de tiempo 20260902*, 20260903*, 20260904* de ausentismo; código en
// src/lib/ausentismo (matriz.ts, matriz-reglas.ts), src/app/(dashboard)/
// ausentismo/matriz/actions.ts, src/lib/rotacion/upload/processors.ts,
// src/lib/accidentabilidad/policy.ts, src/lib/rotacion/data/accidentes.ts,
// src/app/api/rotacion/accidentes y src/lib/actions.ts.

import type { DocRecurso } from "./tipos";

const FECHA_DIA = "YYYY-MM-DD (tipo date, sin hora ni zona): día calendario de Colombia";
const TS_UTC =
  "timestamptz guardado en UTC (Colombia = UTC−5); para el día local usar AT TIME ZONE 'America/Bogota' o filtrar con desfase -05:00";

export const RECURSOS_AUSENTISMO_ACCIDENTABILIDAD: DocRecurso[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // AUSENTISMO — Matriz EPS de incapacidades
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "ausentismo",
    dominio: "ausentismo",
    titulo: "Matriz EPS de incapacidades médicas",
    resumen:
      "Incapacidades médicas y licencias (EPS/ARL) de conductores y personal administrativo, con diagnóstico CIE10, días perdidos y pagador.",
    granularidad:
      "Una fila = un certificado de incapacidad (inicial o prórroga) de un empleado. Llave única (cedula, fecha_inicio, consecutivo_llave). Una prórroga es otra fila. Incluye filas eliminadas lógicamente (eliminado_at no nulo), que no son duplicados pero sí deben excluirse.",
    descripcion:
      "Es la \"MATRIZ DE AUSENTISMO\" de RRHH (pestaña Ausentismo › Matriz EPS) y está VIGENTE, no es legado: la pantalla, los indicadores, el informe de cobro a EPS/ARL y el perfil del conductor la leen hoy. Nació en 2026 como carga de Excel que se reemplazaba completa; desde 2026-09-02 también se captura en formulario y desde 2026-09-10 la carga por Excel está deshabilitada, así que todo alta, edición, eliminación o restauración nueva sale del formulario. NO contiene las ausencias diarias (permisos, no justificadas, vacaciones, taller, renuncias): esas están en ausentismo_registros. Solo trae incapacidades con certificado médico y licencias de maternidad o paternidad.",
    origen:
      "Filas antiguas: carga del Excel \"MATRIZ DE AUSENTISMO\" (hoja BASE DE AUSENTISMO), origen_registro = excel. Desde 2026-09-02: formulario de la Matriz EPS, origen_registro = formulario; una fila del Excel editada en el formulario pasa a formulario. Carga por Excel deshabilitada desde 2026-09-10 (responde 410). Se actualiza cuando RRHH registra; no hay sincronización automática.",
    identificador: "id",
    columnaFecha: "fecha_inicio",
    volumen:
      "Pequeña: 628 filas y 206 cédulas al 2026-09-02 (dato de la migración); crece con cada incapacidad registrada.",
    columnasPorDefecto: [
      "id",
      "cedula",
      "nombre",
      "tipo_conductor",
      "fecha_inicio",
      "fecha_fin",
      "dias_it_pagados",
      "indicador_prorroga",
      "consecutivo_incapacidad",
      "origen",
      "eps",
      "arl",
      "estado_registro",
    ],
    filtroPorDefecto: {
      columna: "eliminado_at",
      operador: "is",
      valor: null,
      motivo:
        "Excluye las incapacidades eliminadas lógicamente (registradas por error), que no cuentan en la matriz, los indicadores ni el cobro. Desactívelo solo para auditar eliminaciones.",
    },
    columnas: {
      id: { descripcion: "Identificador UUID de la incapacidad." },
      cedula: {
        descripcion: "Documento del empleado incapacitado, sin puntos. Clave de cruce con los maestros.",
        relacion: "conductores_con_grupo.cedula (conductores) o employees.document_number (personal administrativo)",
      },
      consecutivo_incapacidad: {
        descripcion:
          "Número del certificado de incapacidad. Una prórroga hereda el consecutivo de la incapacidad que prolonga, así que puede repetirse entre la inicial y sus prórrogas.",
        advertencia: "Puede ser nulo, sobre todo en filas del Excel.",
      },
      nombre: {
        descripcion: "Nombre del empleado. En filas del formulario se toma del maestro al guardar.",
      },
      genero: {
        descripcion: "Género del empleado, tal como venía en el Excel.",
        advertencia: "Solo en filas del Excel; nulo en filas del formulario. Valores no verificados en el código.",
        sensible: true,
      },
      edad: {
        descripcion: "Edad del empleado según el Excel.",
        unidad: "años",
        advertencia: "Solo en filas del Excel; nula en filas del formulario. No se recalcula con el tiempo.",
        sensible: true,
      },
      antiguedad: {
        descripcion: "Antigüedad del empleado como texto libre del Excel.",
        advertencia: "Solo en filas del Excel. Formato y significado no verificados en el código; para antigüedad usar conductores_con_grupo.meses_antiguedad.",
      },
      vinculacion: {
        descripcion: "Tipo de vinculación del empleado, texto del Excel.",
        advertencia: "Solo en filas del Excel. Significado no verificado en el código.",
      },
      centro_trabajo: {
        descripcion: "Centro de trabajo, texto del Excel.",
        advertencia: "Solo en filas del Excel. Significado no verificado en el código.",
      },
      departamento: {
        descripcion: "Departamento, texto del Excel.",
        advertencia: "Solo en filas del Excel. No verificado si es área de la empresa o división geográfica.",
      },
      area: {
        descripcion: "Área, texto del Excel.",
        advertencia: "Solo en filas del Excel. Significado no verificado en el código.",
      },
      cargo: {
        descripcion:
          "Cargo en mayúsculas. En el formulario: CONDUCTOR para los del maestro de conductores; para el resto, el cargo de employees (INSPECTOR DE PATIO, AUXILIAR…).",
      },
      indicador_prorroga: {
        descripcion: "Si el certificado abre una incapacidad o prolonga una anterior.",
        valores: {
          INICIAL: "Primer certificado de la incapacidad.",
          PRORROGA: "Prolonga una incapacidad del mismo empleado que terminó el día anterior; hereda su consecutivo.",
        },
        advertencia: "El formulario solo admite estos dos; filas del Excel pueden traer otra escritura o nulo.",
      },
      dias_it_pagados: {
        descripcion:
          "Días perdidos: días calendario de fecha_inicio a fecha_fin, ambos incluidos. Un trigger lo recalcula en cada inserción o cambio de fechas.",
        unidad: "días calendario",
        advertencia:
          "El nombre engaña: NO son días pagados por la EPS ni días hábiles. Para sumar días de una incapacidad completa se suman la inicial y sus prórrogas. Nulo si falta fecha_fin. En cobro a EPS, los dos primeros días de una INICIAL de origen común los asume el empleador (regla de la app, no columna).",
      },
      origen: {
        descripcion: "Origen de la incapacidad, que define quién paga.",
        valores: {
          EG: "Enfermedad general (paga la EPS). El código viejo EC se homologó a EG.",
          EL: "Enfermedad laboral (paga la ARL).",
          AT: "Accidente de trabajo (paga la ARL).",
          LM: "Licencia de maternidad.",
          LP: "Licencia de paternidad.",
        },
      },
      fecha_inicio: { descripcion: "Primer día de la incapacidad.", formato: FECHA_DIA },
      fecha_fin: {
        descripcion: "Último día de la incapacidad (incluido).",
        formato: FECHA_DIA,
        advertencia: "Puede ser nula en filas viejas del Excel.",
      },
      mes_inicio: {
        descripcion: "Nombre del mes de fecha_inicio en mayúsculas (ENERO…DICIEMBRE), derivado de la fecha.",
        advertencia: "No trae el año: para agrupar por mes use fecha_inicio.",
      },
      cie10: {
        descripcion: "Código CIE10 del diagnóstico, en mayúsculas y sin punto (M545, I10X).",
        relacion: "ausentismo_catalogos.codigo con tipo = CIE10 (tabla no expuesta)",
        advertencia: "Nulo mientras estado_registro = pendiente.",
        sensible: true,
      },
      diagnostico: {
        descripcion: "Texto del diagnóstico (DX) correspondiente al CIE10.",
        sensible: true,
      },
      soat: {
        descripcion: "Si la incapacidad la cubre el SOAT (accidente de tránsito), con cualquier origen.",
        valores: { SI: "Cubierta por SOAT.", NO: "No cubierta por SOAT." },
        advertencia: "Nulo en filas del Excel sin diagnóstico.",
        sensible: true,
      },
      grd: {
        descripcion: "Grupo relacionado de diagnóstico: agrupación del CIE10 por sistema o tipo de enfermedad, del catálogo validado.",
        advertencia: "Nombre exacto del grupo no verificado en el código más allá de que viene del Excel (GRUPO RELACIONADOS) y del catálogo GRD.",
        sensible: true,
      },
      dia_ocurrencia: {
        descripcion: "Día de la semana de fecha_inicio en mayúsculas sin tilde (LUNES…DOMINGO, MIERCOLES, SABADO).",
        advertencia: "Se deriva de fecha_inicio, no del día real del evento que causó la incapacidad.",
      },
      eps: {
        descripcion:
          "Entidad pagadora de la incapacidad. Normalmente la EPS; en origen AT o EL guarda el nombre de la ARL (compatibilidad con el Excel).",
        advertencia: "Para agrupar por EPS, excluir origen AT/EL o usar arl para esos casos.",
      },
      ips: {
        descripcion: "IPS (clínica o centro médico) que expidió la incapacidad, en la escritura canónica del catálogo.",
        sensible: true,
      },
      profesional_responsable: {
        descripcion: "Médico o profesional que firmó la incapacidad, en la escritura canónica del catálogo.",
        sensible: true,
      },
      tipo_conductor: {
        descripcion: "Tipo de vinculación del empleado con la operación.",
        valores: {
          EMPRESA: "Conductor de la empresa.",
          AFILIADO: "Conductor de vehículo afiliado.",
          REUBICADO: "Conductor reubicado (marcado así en el maestro).",
          ADMINISTRATIVO: "Personal que no es conductor (maestro employees).",
        },
        advertencia: "El formulario exige estos cuatro; filas del Excel pueden traer otros valores o nulo.",
      },
      estado: {
        descripcion:
          "Estado laboral del empleado al guardar la fila (ACTIVO o RETIRADO según el maestro). No es el estado de la incapacidad.",
        advertencia: "En filas del Excel es lo que traía la columna ESTADO; valores no verificados. No se actualiza si el empleado se retira después.",
      },
      source_file: {
        descripcion: "Nombre del archivo Excel del que salió la fila, o \"formulario\" si se capturó en la app.",
      },
      created_at: {
        descripcion: "Momento en que la fila entró a la base (para el Excel, la carga).",
        formato: TS_UTC,
        advertencia: "No es la fecha de la incapacidad: use fecha_inicio.",
      },
      estado_registro: {
        descripcion: "Completitud del registro en la matriz.",
        valores: {
          pendiente: "Abierto con datos administrativos, sin diagnóstico (CIE10/DX/SOAT/GRD). Solo se da en filas del Excel.",
          cerrado: "Con diagnóstico. Todo lo guardado en el formulario queda cerrado.",
        },
      },
      origen_registro: {
        descripcion: "Cómo llegó o se modificó por última vez la fila.",
        valores: {
          excel: "Cargada desde el Excel y nunca editada en la app.",
          formulario: "Capturada o editada en el formulario de la Matriz EPS.",
        },
      },
      arl: {
        descripcion: "ARL pagadora cuando el origen es AT o EL (o cuando el Excel traía una ARL en la columna EPS). Nula en origen común.",
      },
      abierto_por_email: {
        descripcion: "Correo del usuario que registró la incapacidad en el formulario. Nulo en filas del Excel.",
        sensible: true,
      },
      cerrado_por_email: {
        descripcion: "Correo del usuario que dejó el registro cerrado con diagnóstico.",
        sensible: true,
      },
      cerrado_at: {
        descripcion: "Momento en que el registro quedó cerrado en el formulario.",
        formato: TS_UTC,
        advertencia: "Nulo en filas del Excel que llegaron cerradas.",
      },
      modificado_por_email: {
        descripcion: "Correo de quien hizo la última edición o restauración.",
        sensible: true,
      },
      motivo_modificacion: {
        descripcion: "Motivo obligatorio de la última edición; en restauraciones empieza por \"Restaurada\".",
      },
      updated_at: { descripcion: "Última modificación de la fila (trigger).", formato: TS_UTC },
      revision: {
        descripcion: "Arreglo de marcas para que RRHH revise la fila; vacío ({}) si no hay alertas.",
        valores: {
          prorroga_sin_previa: "Prórroga sin una incapacidad previa del mismo empleado que termine el día anterior.",
          solape: "Se cruza en fechas con otra incapacidad del mismo empleado (guardada con confirmación).",
          duplicado_retirado: "El Excel la traía repetida; la copia se apartó a ausentismo_duplicados.",
          fechas_invertidas: "fecha_fin anterior a fecha_inicio; hay que corregirla.",
        },
      },
      consecutivo_llave: {
        descripcion: "Columna generada = consecutivo_incapacidad o cadena vacía; forma parte de la llave única.",
        advertencia: "Técnica; no usar para análisis.",
      },
      lote_carga: {
        descripcion: "UUID de la carga de Excel que tocó la fila por última vez. Nulo en filas del formulario.",
        advertencia: "Sin valores nuevos desde que se deshabilitó la carga (2026-09-10).",
      },
      eliminado_at: {
        descripcion: "Eliminación lógica: con valor, la incapacidad se registró por error y no cuenta en matriz, indicadores ni exportaciones.",
        formato: TS_UTC,
        advertencia: "Filtre siempre eliminado_at=is.null salvo que pida las eliminadas.",
      },
      eliminado_por_email: { descripcion: "Correo de quien eliminó la fila.", sensible: true },
      motivo_eliminacion: { descripcion: "Motivo obligatorio escrito al eliminar." },
    },
    relaciones: [
      {
        recurso: "conductores_con_grupo",
        mediante: "ausentismo.cedula = conductores_con_grupo.cedula",
        descripcion: "Datos del conductor (antigüedad, estado actual). Sin cruce para el personal ADMINISTRATIVO.",
      },
      {
        recurso: "employees",
        mediante: "ausentismo.cedula = employees.document_number",
        descripcion: "Personal no conductor (tipo_conductor = ADMINISTRATIVO).",
      },
      {
        recurso: "accidentes",
        mediante: "ausentismo.cedula = accidentes.conductor_cedula y cercanía de fecha_inicio con fecha_accidente",
        descripcion: "No hay llave: una incapacidad AT puede corresponder a un accidente reportado, pero el vínculo es solo por cédula y fechas.",
      },
    ],
    advertencias: [
      "No es legado: es la matriz vigente de incapacidades. La tabla nueva ausentismo_registros NO la reemplaza; son dos registros distintos que conviven.",
      "Excluir eliminado_at no nulo en toda cuenta o suma; la vista vw_ausentismo_matriz ya lo hace, la tabla no.",
      "dias_it_pagados son días calendario perdidos, no días pagados. Sumar días por empleado debe incluir prórrogas; contar incapacidades distintas debe contar solo indicador_prorroga = INICIAL.",
      "Incluye personal administrativo, no solo conductores: filtre tipo_conductor si la pregunta es sobre conductores.",
      "genero, edad, antiguedad, vinculacion, centro_trabajo, departamento y area solo existen en filas del Excel; no sirven para análisis de filas recientes.",
      "Contiene datos de salud (CIE10, diagnóstico, origen): no exponer por persona sin necesidad; preferir agregados.",
    ],
    noConfundirCon: [
      {
        recurso: "ausentismo_registros",
        diferencia:
          "Ausencias del día, expuesto también en el MCP: una fila por conductor ausente por día, por cualquier motivo (permiso, no justificada, vacaciones, taller, incapacidad…), capturado en Ausentismo › Registro del día, con el histórico 2026 migrado. Úselo para \"quién faltó\", reincidencia y faltas sin justificar; use ausentismo para incapacidades médicas con certificado, diagnóstico, días perdidos y cobro a EPS/ARL. Una incapacidad puede aparecer en ambos sin llave que los una (solo cédula y fechas): no sume los dos.",
      },
      {
        recurso: "vw_ausentismo_matriz",
        diferencia:
          "Vista sobre esta misma tabla con los nombres de columna del Excel (documento_de_identidad, dias_perdidos, dx…) que ya excluye las eliminadas. No expuesta hoy.",
      },
      {
        recurso: "ausentismo_conceptos",
        diferencia: "Catálogo de tipos de ausencia de ausentismo_registros (incapacidad, permiso…); no tiene relación con esta tabla.",
      },
      {
        recurso: "ausentismo_catalogos",
        diferencia: "Catálogo validado de EPS, ARL, IPS, profesionales, CIE10 y GRD que usa esta matriz; no contiene incapacidades.",
      },
      {
        recurso: "ausentismo_notificaciones",
        diferencia: "Citaciones a descargos y terminación por días seguidos sin justificar; se calcula de ausentismo_registros, no de esta tabla.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos días de incapacidad hubo por EPS en agosto de 2026?",
        como: "fecha_inicio=gte.2026-08-01 y lte.2026-08-31, eliminado_at=is.null; agrupar por eps (o arl si origen en AT,EL) y sumar dias_it_pagados.",
      },
      {
        pregunta: "¿Cuáles son los diagnósticos más frecuentes?",
        como: "eliminado_at=is.null, estado_registro=cerrado, indicador_prorroga=INICIAL; contar por cie10/diagnostico o por grd.",
      },
      {
        pregunta: "¿Qué incapacidades se pueden cobrar a la ARL?",
        como: "origen=in.AT,EL y eliminado_at=is.null; la ARL paga desde el día 1, así que todos los dias_it_pagados. Para EPS: origen fuera de AT/EL y dias_it_pagados=gte.4.",
      },
      {
        pregunta: "¿Qué incapacidades tiene un conductor?",
        como: "cedula=eq.<cédula>, eliminado_at=is.null, ordenar por fecha_inicio; las PRORROGA consecutivas forman una sola incapacidad.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // ACCIDENTABILIDAD — Reportes de accidentes
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "accidentes",
    dominio: "accidentabilidad",
    titulo: "Reportes de accidentes de tránsito",
    resumen:
      "Reporte de cada accidente de un conductor: fecha, lugar, criterios de gravedad, peatón, arreglo, aseguradora, firmas y estado de revisión.",
    granularidad:
      "Una fila = un reporte de accidente de un conductor. Un mismo evento con dos conductores propios serían dos reportes; no hay control de duplicados.",
    descripcion:
      "Reporte que diligencia el personal en Accidentabilidad › Reportar y que revisan admin o RRHH. Guarda una foto del conductor al momento del reporte (cédula, nombre, licencia), los criterios objetivos (lesionados, daños, factores de conducción, responsabilidad declarada) y la negociación inmediata. El dictamen (gravedad final, puntaje, nivel de correctivo) NO está aquí: está en accidente_evaluaciones. Los vehículos implicados están en accidente_vehiculos y la bitácora en accidente_eventos.",
    origen:
      "Formulario web (asistente de reporte) con firmas en canvas y nota de voz opcional que se transcribe con OpenAI (gpt-4o-mini-transcribe). Se crea al enviar el reporte; se edita solo cuando está en falta_informacion. Borrado físico con cascada a vehículos, eventos y evaluación.",
    identificador: "id",
    columnaFecha: "fecha_accidente",
    volumen: "Bajo; crece con cada accidente reportado. Volumen real no verificado.",
    columnasPorDefecto: [
      "id",
      "consecutivo",
      "conductor_cedula",
      "conductor_nombre",
      "fecha_accidente",
      "ciudad",
      "direccion_accidente",
      "estado",
      "lesionados",
      "danos_materiales",
      "responsabilidad_reportada",
      "hubo_arreglo",
      "arreglo_monto",
    ],
    columnas: {
      id: { descripcion: "Identificador UUID del reporte." },
      consecutivo: {
        descripcion: "Número de reporte correlativo y automático (\"Reporte #N\" en la app).",
        advertencia: "Puede tener huecos por reportes eliminados.",
      },
      conductor_id: {
        descripcion: "Id del conductor en el maestro al reportar.",
        relacion: "conductores_con_grupo.id",
        advertencia: "Puede ser nulo; para cruzar use conductor_cedula.",
      },
      conductor_cedula: {
        descripcion: "Cédula del conductor de la empresa implicado (foto al reportar). Clave de cruce con el maestro.",
        relacion: "conductores_con_grupo.cedula",
      },
      conductor_nombre: { descripcion: "Nombre del conductor al reportar." },
      conductor_licencia: { descripcion: "Número de licencia de conducción al reportar.", sensible: true },
      fecha_accidente: {
        descripcion: "Fecha y hora en que ocurrió el accidente, digitada en el formulario (si se deja vacía, la hora del envío).",
        formato: TS_UTC,
        advertencia: "Un accidente a las 8 p. m. de Colombia queda con fecha del día siguiente en UTC: filtre con -05:00 (gte.2026-08-01T00:00:00-05:00).",
      },
      direccion_accidente: { descripcion: "Dirección o sitio del accidente, texto libre obligatorio." },
      resumen_hechos: {
        descripcion: "Relato de lo ocurrido escrito por quien reporta o tomado de la transcripción de la nota de voz.",
        sensible: true,
      },
      nota_voz_url: {
        descripcion: "Ruta de la nota de voz en el almacenamiento privado \"accidentes\" (audio/<uuid>.<ext>), no una URL pública.",
        sensible: true,
      },
      nota_voz_transcripcion: {
        descripcion: "Texto transcrito automáticamente de la nota de voz.",
        advertencia: "Vacío o nulo si no hubo audio, no había API key o falló la transcripción; puede tener errores de reconocimiento.",
        sensible: true,
      },
      tiene_peaton: { descripcion: "true si hubo un peatón involucrado." },
      peaton_nombre: { descripcion: "Nombre del peatón involucrado.", sensible: true },
      peaton_cedula: { descripcion: "Cédula del peatón.", sensible: true },
      peaton_telefono: { descripcion: "Teléfono del peatón.", sensible: true },
      peaton_direccion: { descripcion: "Dirección del peatón.", sensible: true },
      peaton_correo: { descripcion: "Correo del peatón.", sensible: true },
      hubo_arreglo: { descripcion: "true si se pactó un arreglo económico inmediato en el sitio." },
      arreglo_monto: {
        descripcion: "Valor pagado en el arreglo inmediato.",
        unidad: "COP",
        advertencia: "Nulo si no hubo arreglo. Moneda inferida del formulario (\"$\"), no declarada en la base.",
      },
      arreglo_receptor_nombre: { descripcion: "Nombre de quien recibió el dinero del arreglo.", sensible: true },
      arreglo_receptor_cedula: { descripcion: "Cédula de quien recibió el dinero.", sensible: true },
      arreglo_firma_url: {
        descripcion: "Ruta de la firma de quien recibió el dinero en el almacenamiento privado (firmas/<uuid>.png).",
        sensible: true,
      },
      solicito_aseguradora: { descripcion: "true si se pidió intervención de la aseguradora (en lugar de arreglo)." },
      aseguradora_nombre: { descripcion: "Aseguradora que atendió el caso." },
      abogado_nombre: { descripcion: "Nombre del abogado de la aseguradora.", sensible: true },
      abogado_apellidos: { descripcion: "Apellidos del abogado.", sensible: true },
      abogado_cedula: { descripcion: "Cédula del abogado.", sensible: true },
      abogado_celular: { descripcion: "Celular del abogado.", sensible: true },
      firma_conductor_url: {
        descripcion: "Ruta de la firma obligatoria del conductor en el almacenamiento privado (firmas/<uuid>.png).",
        sensible: true,
      },
      firma_tercero_url: { descripcion: "Ruta de la firma del tercero implicado, si firmó.", sensible: true },
      estado: {
        descripcion: "Estado de revisión del reporte (enum accidente_estado).",
        valores: {
          pendiente_revision: "Recién creado, o reenviado tras completar información; espera revisión de admin/RRHH.",
          falta_informacion: "El revisor pidió datos; solo en este estado se puede editar el reporte.",
          completada: "El revisor marcó el reporte como completo, sin aprobarlo aún.",
          aprobado: "Aprobado por el revisor (llena reviewed_by y reviewed_at); estado final.",
        },
        advertencia: "Se puede aprobar desde cualquier estado; completada no es paso obligatorio. \"evaluado\" no es un estado: es un tipo de evento.",
      },
      created_by: {
        descripcion: "Usuario de Gestivo que hizo el reporte (perfil).",
        relacion: "profiles.id (no expuesto)",
      },
      reviewed_by: {
        descripcion: "Usuario que aprobó el reporte.",
        relacion: "profiles.id (no expuesto)",
        advertencia: "Solo se llena al aprobar; no cambia con falta_informacion ni completada.",
      },
      reviewed_at: { descripcion: "Momento de la aprobación.", formato: TS_UTC },
      created_at: {
        descripcion: "Momento en que se envió el reporte.",
        formato: TS_UTC,
        advertencia: "No es la fecha del accidente (puede reportarse días después): use fecha_accidente.",
      },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
      ciudad: { descripcion: "Ciudad donde ocurrió, texto libre (obligatorio en el formulario)." },
      lesionados: {
        descripcion: "Criterio objetivo de lesionados declarado al reportar (enum accidente_lesionados).",
        valores: {
          ninguno: "Sin lesionados (sugiere gravedad leve).",
          leves: "Lesiones leves (sugiere moderado).",
          incapacitantes: "Lesiones incapacitantes (sugiere grave).",
          fatal: "Fallecidos (sugiere fatal).",
        },
        advertencia: "Nulo en reportes anteriores a la migración 019.",
      },
      danos_materiales: {
        descripcion: "Criterio objetivo de daños declarado al reportar (enum accidente_danos).",
        valores: {
          menores: "Daños menores (sugiere leve).",
          significativos: "Daños significativos (sugiere moderado).",
          altos: "Daños altos o costosos (sugiere grave).",
          perdida_total: "Pérdida total (sugiere fatal).",
        },
        advertencia: "Nulo en reportes anteriores a la migración 019.",
      },
      fact_exceso_velocidad: { descripcion: "Quien reporta marcó exceso de velocidad como factor de conducción." },
      fact_uso_celular: { descripcion: "Quien reporta marcó uso de celular." },
      fact_no_distancia: { descripcion: "Quien reporta marcó no guardar distancia." },
      fact_fatiga: { descripcion: "Quien reporta marcó fatiga comprobada." },
      responsabilidad_reportada: {
        descripcion: "Responsabilidad declarada al reportar (enum accidente_responsabilidad). Nulo = \"en estudio\".",
        valores: {
          directo: "Responsable directo nuestro conductor.",
          compartido: "Responsabilidad compartida.",
          tercero: "Responsable un tercero.",
          en_estudio: "Sin definir (el formulario lo guarda como nulo).",
        },
        advertencia: "Es la versión inicial; la responsabilidad oficial es accidente_evaluaciones.responsabilidad.",
      },
    },
    relaciones: [
      {
        recurso: "accidente_evaluaciones",
        mediante: "accidentes.id = accidente_evaluaciones.accidente_id",
        descripcion: "Dictamen: 0 o 1 por accidente.",
      },
      {
        recurso: "accidente_eventos",
        mediante: "accidentes.id = accidente_eventos.accidente_id",
        descripcion: "Bitácora de creación, cambios de estado, ediciones, evaluaciones y aprobación (1 a N).",
      },
      {
        recurso: "accidente_vehiculos",
        mediante: "accidentes.id = accidente_vehiculos.accidente_id",
        descripcion: "Vehículos implicados (0 a N).",
      },
      {
        recurso: "conductores_con_grupo",
        mediante: "accidentes.conductor_cedula = conductores_con_grupo.cedula",
        descripcion: "Datos actuales del conductor (antigüedad, estado). El reporte guarda nombre y licencia como foto histórica.",
      },
    ],
    advertencias: [
      "fecha_accidente es timestamptz en UTC: agrupar por día o mes en hora de Colombia, no con la fecha UTC cruda.",
      "La gravedad, el puntaje y el nivel de correctivo no están aquí; hay que unir con accidente_evaluaciones (que puede faltar en reportes viejos).",
      "Un reporte eliminado desaparece junto con su evaluación, eventos y vehículos: no hay histórico de eliminados.",
      "Las columnas *_url son rutas en un bucket privado, no enlaces descargables.",
      "Contiene datos personales de terceros (peatón, receptor del arreglo, abogado): no listarlos sin necesidad.",
    ],
    noConfundirCon: [
      {
        recurso: "accidente_evaluaciones",
        diferencia: "El dictamen oficial (gravedad, responsabilidad, puntaje, nivel). accidentes solo trae lo declarado al reportar.",
      },
      {
        recurso: "ausentismo",
        diferencia: "Incapacidades médicas; un accidente de trabajo (origen AT) puede generar una, pero no hay vínculo directo.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos accidentes hubo por mes en 2026?",
        como: "fecha_accidente=gte.2026-01-01T00:00:00-05:00 y lt.2027-01-01T00:00:00-05:00; agrupar por mes de fecha_accidente en hora de Colombia y contar id.",
      },
      {
        pregunta: "¿Qué reportes siguen sin aprobar?",
        como: "estado=in.pendiente_revision,falta_informacion,completada; ordenar por created_at.",
      },
      {
        pregunta: "¿Qué conductores tienen más accidentes?",
        como: "Agrupar por conductor_cedula (no por nombre) y contar; para excluir los que fueron culpa de terceros, unir con accidente_evaluaciones y quitar responsabilidad=tercero.",
      },
      {
        pregunta: "¿Cuánto se ha pagado en arreglos directos?",
        como: "hubo_arreglo=is.true; sumar arreglo_monto (COP), agrupado por mes de fecha_accidente.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // ACCIDENTABILIDAD — Evaluación / dictamen
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "accidente_evaluaciones",
    dominio: "accidentabilidad",
    titulo: "Dictamen de accidentes (Política de Correctivos)",
    resumen:
      "Dictamen de cada accidente según la Política de Correctivos por Accidentalidad Vial: gravedad, responsabilidad, puntaje, reincidencia, nivel de correctivo y medidas.",
    granularidad: "Una fila = el dictamen vigente de un accidente. Máximo una por accidente (accidente_id único); se sobrescribe al reevaluar, sin historial.",
    descripcion:
      "Al enviar un reporte con lesionados o daños, el servidor crea un dictamen automático (evaluado_por y evaluado_at nulos). Luego un revisor admin o RRHH lo ajusta en la ficha del accidente y el servidor recalcula puntaje, nivel sugerido, reincidencia y comité. nivel_final es la decisión humana; nivel_sugerido es la regla. Reevaluar reemplaza la fila; el rastro queda solo como texto en accidente_eventos (tipo evaluado).",
    origen:
      "Cálculo del servidor (src/lib/accidentabilidad/policy.ts) al crear el reporte y cada vez que un revisor guarda el dictamen desde el panel de evaluación.",
    identificador: "id",
    columnaFecha: "created_at",
    columnasPorDefecto: [
      "id",
      "accidente_id",
      "gravedad",
      "responsabilidad",
      "puntaje",
      "reincidente",
      "nivel_sugerido",
      "nivel_final",
      "requiere_comite",
      "evaluado_at",
      "created_at",
    ],
    columnas: {
      id: { descripcion: "Identificador UUID del dictamen." },
      accidente_id: { descripcion: "Accidente evaluado (único).", relacion: "accidentes.id" },
      gravedad: {
        descripcion: "Gravedad del accidente (enum accidente_gravedad). La automática es la peor entre lesionados y daños; el revisor puede cambiarla.",
        valores: {
          leve: "Daños menores, sin lesionados, bajo impacto operativo. Suma 5 puntos.",
          moderado: "Daños significativos o lesiones leves. Suma 10 puntos.",
          grave: "Lesiones incapacitantes, altos costos, riesgo jurídico. Suma 20 puntos.",
          fatal: "Crítico: fallecimientos o pérdida total. Suma 40 puntos.",
        },
        advertencia: "Nula = sin clasificar; entonces nivel_sugerido es ninguno.",
      },
      responsabilidad: {
        descripcion: "Responsabilidad oficial en el accidente (enum accidente_responsabilidad).",
        valores: {
          en_estudio: "Sin dictamen de causalidad todavía (valor por defecto).",
          directo: "Responsable directo nuestro conductor.",
          compartido: "Responsabilidad compartida.",
          tercero: "Responsable un tercero; no aplica correctivo y no cuenta como reincidencia.",
        },
      },
      factores: {
        descripcion:
          "Arreglo JSON de claves de factores activos de la matriz de ponderación, p. ej. [\"exceso_velocidad\",\"reincidencia\"].",
        valores: {
          reincidencia: "Agravante automático, +15: al menos un accidente atribuible previo en 3 meses.",
          exceso_velocidad: "Agravante, +15.",
          uso_celular: "Agravante, +15.",
          no_guardar_distancia: "Agravante, +10.",
          fatiga_comprobada: "Agravante, +5 (la política original decía −5; el código lo trata como agravante).",
          antiguedad_3a_sin_eventos: "Atenuante automático, −10: 36 meses o más de antigüedad y ningún accidente atribuible previo.",
          conductor_destacado: "Atenuante manual, −15.",
        },
      },
      eximentes: {
        descripcion: "Arreglo JSON de claves de eximentes marcados por el revisor. No suman puntos; pueden bajar el nivel sugerido de un evento leve a ninguno.",
        valores: {
          falla_mecanica: "Fallas mecánicas certificadas.",
          caso_fortuito: "Caso fortuito o fuerza mayor.",
          tercero_responsable: "Responsabilidad demostrada de terceros.",
          antiguedad_sobresaliente: "Antigüedad sobresaliente sin historial negativo.",
          actuacion_preventiva: "Actuación preventiva para evitar consecuencias mayores.",
        },
      },
      puntaje: {
        descripcion: "Suma de la matriz de ponderación: puntos de la gravedad más los factores. Referencia de la app: más de 20 = riesgo alto, 10 a 20 = medio, menos de 10 = bajo.",
        unidad: "puntos",
        advertencia: "Puede ser negativo o bajo con atenuantes; no incluye eximentes. El nivel de correctivo no sale del puntaje sino de reglas (ver nivel_sugerido).",
      },
      puntaje_detalle: {
        descripcion:
          "Arreglo JSON [{key, label, puntaje}] con cada sumando al momento de calcular. La gravedad aparece con key \"gravedad_<valor>\" y label \"Accidente leve\"; los factores con su clave, p. ej. {\"key\":\"uso_celular\",\"label\":\"Uso de celular\",\"puntaje\":15}.",
      },
      reincidente: {
        descripcion: "true si reincidencia_3m ≥ 1 al momento de evaluar.",
        advertencia: "Foto al evaluar: no se actualiza si después se reportan o eliminan otros accidentes.",
      },
      reincidencia_3m: {
        descripcion: "Accidentes previos del mismo conductor (por cédula) en los 3 meses anteriores, sin contar los dictaminados como culpa de un tercero; los que no tienen dictamen sí cuentan.",
        unidad: "accidentes",
        advertencia: "Mes aproximado de 30,44 días. Foto al evaluar.",
      },
      reincidencia_6m: { descripcion: "Igual que reincidencia_3m, en los 6 meses anteriores.", unidad: "accidentes" },
      reincidencia_12m: { descripcion: "Igual que reincidencia_3m, en los 12 meses anteriores.", unidad: "accidentes" },
      nivel_sugerido: {
        descripcion:
          "Nivel de correctivo que propone la regla (enum accidente_nivel). Sin gravedad o sin responsabilidad (tercero, en estudio) = ninguno; fatal, o grave con exceso de velocidad o celular = IV; grave o reincidente = III; moderado = II; leve sin eximentes = I.",
        valores: {
          ninguno: "Sin correctivo disciplinario.",
          I: "Preventivo: retroalimentación, capacitación, reinducción, seguimiento 30 días.",
          II: "Correctivo moderado: memorando, suspensión temporal de la operación, evaluación técnica, restricción operativa.",
          III: "Correctivo grave: suspensión laboral, pérdida de incentivos, comité disciplinario, seguimiento psicológico y médico.",
          IV: "Sanción crítica: terminación del contrato, reporte a autoridades, exclusión de operación, acciones legales.",
        },
      },
      nivel_final: {
        descripcion: "Nivel de correctivo decidido por el revisor (mismos valores que nivel_sugerido). En el dictamen automático es igual al sugerido.",
        valores: ["ninguno", "I", "II", "III", "IV"],
        advertencia: "Use este para \"qué correctivo se aplicó\"; verifique evaluado_at para saber si lo confirmó una persona.",
      },
      medidas: {
        descripcion:
          "Arreglo JSON de textos de las medidas seleccionadas del nivel, p. ej. [\"Memorando disciplinario\",\"Capacitación intensiva\"]. Textos fijos de la política, no claves.",
        advertencia: "Registra lo decidido, no si la medida se ejecutó.",
      },
      requiere_comite: { descripcion: "true si la gravedad es moderado, grave o fatal: el Comité de Accidentalidad debe evaluar el caso." },
      observaciones: { descripcion: "Notas libres del revisor." },
      evaluado_por: {
        descripcion: "Revisor que guardó el dictamen.",
        relacion: "profiles.id (no expuesto)",
        advertencia: "Nulo = dictamen automático aún no revisado por una persona.",
      },
      evaluado_at: {
        descripcion: "Momento en que un revisor guardó el dictamen. Nulo en el automático.",
        formato: TS_UTC,
      },
      created_at: { descripcion: "Creación de la fila (normalmente al enviar el reporte).", formato: TS_UTC },
      updated_at: { descripcion: "Última reevaluación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      {
        recurso: "accidentes",
        mediante: "accidente_evaluaciones.accidente_id = accidentes.id",
        descripcion: "Para fecha, conductor y estado del reporte.",
      },
    ],
    advertencias: [
      "No todo accidente tiene evaluación (reportes previos a la migración 019 o sin lesionados ni daños): usar unión izquierda y reportar los faltantes.",
      "Distinguir dictamen automático (evaluado_at nulo) de dictamen revisado antes de concluir sobre sanciones.",
      "Reincidencia y puntaje son fotos al evaluar; no reflejan accidentes reportados después.",
      "factores, eximentes, puntaje_detalle y medidas son JSONB: filtrar con contención de arreglo, no con igualdad de texto.",
    ],
    noConfundirCon: [
      {
        recurso: "accidentes",
        diferencia: "accidentes.responsabilidad_reportada y fact_* son lo declarado al reportar; aquí están la responsabilidad y los factores oficiales.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuántos accidentes graves o fatales con responsabilidad de nuestros conductores hubo?",
        como: "gravedad=in.grave,fatal y responsabilidad=in.directo,compartido; unir con accidentes para acotar por fecha_accidente.",
      },
      {
        pregunta: "¿Qué correctivos se han aplicado por nivel?",
        como: "Contar por nivel_final, separando evaluado_at=is.null (automáticos sin revisar).",
      },
      {
        pregunta: "¿Qué casos deben ir a comité?",
        como: "requiere_comite=is.true; unir con accidentes para conductor y fecha.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // ACCIDENTABILIDAD — Bitácora
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "accidente_eventos",
    dominio: "accidentabilidad",
    titulo: "Bitácora de reportes de accidente",
    resumen: "Historial de lo ocurrido con cada reporte: creación, cambios de estado, ediciones, dictámenes y aprobación.",
    granularidad: "Una fila = una acción sobre un reporte de accidente. Varias por accidente; puede haber varias del mismo tipo.",
    descripcion:
      "Bitácora de solo inserción que escribe el servidor en cada acción del flujo de revisión. Sirve para medir tiempos de revisión y ver qué información se pidió. No guarda el antes y el después de los datos, solo el tipo, el estado nuevo y un comentario.",
    origen: "Inserción automática del servidor al crear, cambiar estado, editar, evaluar o aprobar un reporte.",
    identificador: "id",
    columnaFecha: "created_at",
    columnasPorDefecto: ["id", "accidente_id", "tipo", "estado_nuevo", "comentario", "created_at"],
    columnas: {
      id: { descripcion: "Identificador UUID del evento." },
      accidente_id: { descripcion: "Reporte al que pertenece.", relacion: "accidentes.id" },
      tipo: {
        descripcion: "Acción registrada.",
        valores: {
          creado: "Se envió el reporte (estado_nuevo = pendiente_revision).",
          cambio_estado: "El revisor lo pasó a falta_informacion, completada o pendiente_revision.",
          editado: "Se completó la información faltante y volvió a pendiente_revision.",
          evaluado: "Un revisor guardó el dictamen; estado_nuevo nulo.",
          aprobado: "El revisor aprobó el reporte (estado_nuevo = aprobado).",
        },
        advertencia: "\"comentario\" figura en la migración como tipo posible, pero el código no lo usa. El dictamen automático al crear no genera evento evaluado.",
      },
      estado_nuevo: {
        descripcion: "Estado del reporte tras la acción (enum accidente_estado).",
        valores: ["pendiente_revision", "falta_informacion", "completada", "aprobado"],
        advertencia: "Nulo en eventos evaluado.",
      },
      comentario: {
        descripcion:
          "Texto de la acción: en falta_informacion, qué información falta; en evaluado, un resumen como \"Dictamen: grave · 35 pts · Nivel III.\"; en editado, un texto fijo.",
      },
      user_id: { descripcion: "Usuario que hizo la acción.", relacion: "profiles.id (no expuesto)" },
      created_at: { descripcion: "Momento de la acción.", formato: TS_UTC },
    },
    relaciones: [
      {
        recurso: "accidentes",
        mediante: "accidente_eventos.accidente_id = accidentes.id",
        descripcion: "Reporte y su estado actual.",
      },
    ],
    advertencias: [
      "El estado actual está en accidentes.estado; no lo deduzca del último evento si hay eventos evaluado (estado_nuevo nulo).",
      "Si se elimina el reporte, sus eventos se borran en cascada.",
    ],
    noConfundirCon: [
      {
        recurso: "accidente_evaluaciones",
        diferencia: "Los eventos evaluado solo resumen el dictamen en texto; el dictamen vigente y estructurado está en accidente_evaluaciones.",
      },
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Cuánto tarda la aprobación de un reporte?",
        como: "Por accidente_id, restar created_at del evento tipo=creado al del evento tipo=aprobado.",
      },
      {
        pregunta: "¿Qué información se ha pedido a quienes reportan?",
        como: "tipo=eq.cambio_estado y estado_nuevo=eq.falta_informacion; leer comentario.",
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // ACCIDENTABILIDAD — Vehículos implicados
  // ───────────────────────────────────────────────────────────────────────────
  {
    nombre: "accidente_vehiculos",
    dominio: "accidentabilidad",
    titulo: "Vehículos implicados en accidentes",
    resumen: "Vehículos propios y de terceros que participaron en cada accidente reportado.",
    granularidad: "Una fila = un vehículo implicado en un reporte. Varias por accidente; la misma placa puede repetirse entre accidentes.",
    descripcion:
      "Lista de vehículos capturada en el reporte, propios o de terceros, con placa y descripción libres. No está enlazada al maestro de vehículos de GEMA. Al editar un reporte se borran y se vuelven a insertar todos sus vehículos.",
    origen: "Formulario de reporte y de edición de accidentes; solo se guardan filas con placa o descripción.",
    identificador: "id",
    columnasPorDefecto: ["id", "accidente_id", "placa", "es_propio", "descripcion"],
    columnas: {
      id: { descripcion: "Identificador UUID; cambia si se edita el reporte." },
      accidente_id: { descripcion: "Reporte al que pertenece.", relacion: "accidentes.id" },
      placa: {
        descripcion: "Placa escrita a mano.",
        advertencia: "Texto libre sin normalizar (mayúsculas, espacios, guiones); puede ser nula.",
      },
      descripcion: { descripcion: "Descripción libre del vehículo o de su papel (p. ej. \"vehículo que nos chocó\")." },
      es_propio: {
        descripcion: "true si es un vehículo de la empresa; false si es de un tercero.",
        advertencia: "El primer vehículo del formulario viene marcado como propio por defecto.",
      },
      created_at: {
        descripcion: "Momento de inserción de la fila.",
        formato: TS_UTC,
        advertencia: "Se reinicia al editar el reporte; no sirve como fecha del accidente.",
      },
    },
    relaciones: [
      {
        recurso: "accidentes",
        mediante: "accidente_vehiculos.accidente_id = accidentes.id",
        descripcion: "Fecha, conductor y estado del accidente.",
      },
    ],
    advertencias: [
      "Sin llave al maestro de vehículos: cruzar por placa exige normalizar el texto y puede fallar.",
      "El conductor propio está en accidentes, no aquí.",
    ],
    preguntasTipicas: [
      {
        pregunta: "¿Qué vehículos de la empresa tienen más accidentes?",
        como: "es_propio=is.true; normalizar placa (mayúsculas, sin espacios ni guiones) y contar accidente_id distintos.",
      },
      {
        pregunta: "¿En cuántos accidentes hubo un tercero con vehículo?",
        como: "es_propio=is.false; contar accidente_id distintos.",
      },
    ],
  },
];
