// Catálogo semántico: exámenes médicos ocupacionales periódicos (Recursos
// Humanos – SST). Ver docs/modulos/examenes-periodicos.md.
//
// Se exponen dos VISTAS sin datos de salud: las recomendaciones y
// observaciones del médico viven en sst_examenes_periodicos, que no está en la
// lista blanca (decisión del 2026-11-05).

import type { DocRecurso } from "./tipos";

const GRUPOS = {
  conductores: "Conductores de La Carolina.",
  administrativos: "Personal administrativo y operativo de La Carolina que no es conductor.",
  reubicados: "Trabajadores de La Carolina reubicados en otro puesto por recomendación médica.",
  metrorecaudo: "Personal de Metrorecaudo (cajeros, tesorería y administrativos).",
  anaya_giraldo: "Personal de Anaya Giraldo (vigilantes, escoltas y administrativos).",
};

const ORIGEN =
  "Módulo «Exámenes periódicos (SST)» de Gestivo (Recursos Humanos). El histórico 2021–2026 se cargó una vez del Excel «LISTADO PERSONAL EXAMEN PERIODICO» (hojas mensuales y de control); desde entonces SST registra cada atención en la pantalla. Se actualiza al momento.";

export const RECURSOS_SST: DocRecurso[] = [
  // ── sst_examenes_estado ────────────────────────────────────────────────────
  {
    nombre: "sst_examenes_estado",
    dominio: "rrhh",
    titulo: "Control de exámenes periódicos por persona",
    resumen: "Semáforo del examen médico ocupacional periódico de cada persona en control: último examen, próximo y si está vencido o por vencer.",
    granularidad: "Una fila = una persona ACTIVA en el control de exámenes periódicos (las que salieron del control no aparecen).",
    descripcion:
      "Vista calculada a la fecha de hoy en Colombia. El próximo examen es el del último examen de la persona (fecha de atención + periodicidad, por defecto 12 meses); quien todavía no tiene examen periódico lo cuenta desde su fecha de ingreso (el examen de ingreso es el primero, como lo hace SST en su Excel). Estado: vencido si ya pasó, por_vencer si faltan 30 días o menos, sin_examen si no hay ni examen ni fecha de ingreso, vigente en otro caso. Incluye a La Carolina, Metrorecaudo y Anaya Giraldo, separados por grupo. No trae recomendaciones ni ningún dato de salud.",
    origen: ORIGEN,
    identificador: "cedula",
    columnaFecha: "proximo_examen",
    volumen: "Unos cientos de filas.",
    filasAproximadas: 450,
    columnasPorDefecto: ["cedula", "nombre", "cargo", "grupo", "ultimo_examen", "proximo_examen", "dias_restantes", "estado"],
    columnas: {
      cedula: {
        descripcion: "Cédula de la persona en control.",
        relacion: "conductores_con_grupo.cedula",
        formato: "Solo dígitos",
        advertencia: "Puede ser un empleado (employees.document_number) o personal de Metrorecaudo o Anaya Giraldo que no está en los maestros de Gestivo.",
      },
      nombre: { descripcion: "Nombre de la persona como está en el control de SST." },
      cargo: { descripcion: "Cargo o área según SST (texto libre, p. ej. «Conductor - cobrador», «Vigilante»)." },
      grupo: { descripcion: "Grupo de control: la hoja del Excel de SST de donde viene.", valores: GRUPOS },
      fecha_ingreso: { descripcion: "Fecha de ingreso a la empresa según SST.", formato: "YYYY-MM-DD", advertencia: "Nula en muchos casos: no se tomó del maestro." },
      ultimo_examen: { descripcion: "Fecha de atención del examen más reciente no anulado; nula si nunca se ha examinado.", formato: "YYYY-MM-DD" },
      ultima_entrega: { descripcion: "Fecha en que se entregaron los resultados del último examen; nula si está pendiente o el histórico no la trae.", formato: "YYYY-MM-DD" },
      periodicidad_meses: {
        descripcion: "Cada cuántos meses le corresponde el examen: la del último examen o, sin exámenes, la de la persona.",
        unidad: "meses",
        advertencia: "Casi siempre 12; algunos administrativos, Metrorecaudo y Anaya Giraldo tienen 24 o 36 por concepto médico.",
      },
      proximo_examen: {
        descripcion: "Fecha en que vence el examen: último examen + periodicidad, o fecha de ingreso + periodicidad si no tiene exámenes (meses calendario).",
        formato: "YYYY-MM-DD",
      },
      dias_restantes: {
        descripcion: "Días desde hoy (Colombia) hasta el próximo examen. Negativo = vencido hace esos días.",
        unidad: "días",
        advertencia: "Cambia cada día: no lo guarde ni lo compare entre consultas de fechas distintas.",
      },
      estado: {
        descripcion: "Semáforo del examen a la fecha de hoy.",
        valores: {
          vencido: "El próximo examen ya pasó.",
          por_vencer: "Vence en 30 días o menos (incluye hoy).",
          sin_examen: "Está en control pero no tiene ningún examen registrado.",
          vigente: "Vence en más de 30 días.",
        },
      },
      examenes: { descripcion: "Cantidad de exámenes no anulados registrados de la persona.", unidad: "exámenes" },
      base_proximo: {
        descripcion: "De dónde sale proximo_examen.",
        valores: { examen: "Del último examen registrado.", ingreso: "De la fecha de ingreso: todavía no tiene examen periódico." },
        advertencia: "Nula cuando el estado es sin_examen.",
      },
    },
    relaciones: [
      { recurso: "sst_examenes_atenciones", mediante: "cedula", descripcion: "Historial de exámenes de la persona." },
      { recurso: "conductores_con_grupo", mediante: "cedula", descripcion: "Datos del conductor (si es conductor de La Carolina)." },
      { recurso: "employees", mediante: "cedula = document_number", descripcion: "Datos del empleado administrativo." },
    ],
    advertencias: [
      "Las recomendaciones del médico y las observaciones NO están disponibles por el MCP (datos de salud): solo en la pantalla del módulo.",
      "«sin_examen» es alguien en control sin exámenes y sin fecha de ingreso: falta el dato, no necesariamente el examen.",
      "Con base_proximo = 'ingreso' la persona nunca ha tenido un examen periódico registrado; su vencimiento se cuenta desde el ingreso.",
      "Alguien retirado en GEMA puede seguir activo en el control hasta que SST lo saque: cruce con conductores_con_grupo.estado si la pregunta es sobre personal activo.",
      "El estado se calcula con la fecha de hoy: un análisis histórico («¿cuántos estaban vencidos en marzo?») hay que reconstruirlo desde sst_examenes_atenciones.",
    ],
    noConfundirCon: [
      { recurso: "procesos_contratacion", diferencia: "Los exámenes de ingreso de los aspirantes a conductor están en el proceso de contratación; este recurso es el examen periódico de quien ya trabaja." },
      { recurso: "ausentismo", diferencia: "Las incapacidades y diagnósticos están en ausentismo; aquí solo hay fechas de exámenes ocupacionales." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Quién tiene el examen periódico vencido?", como: "Filtrar estado = 'vencido'; ordenar por dias_restantes ascendente." },
      { pregunta: "¿Cuántos exámenes vencen este mes por grupo?", como: "agregar_datos contando por grupo con proximo_examen entre el primer y el último día del mes." },
      { pregunta: "¿Cuántos conductores están al día?", como: "Filtrar grupo = 'conductores' y contar por estado." },
    ],
  },

  // ── sst_examenes_atenciones ────────────────────────────────────────────────
  {
    nombre: "sst_examenes_atenciones",
    dominio: "rrhh",
    titulo: "Exámenes periódicos realizados (sin recomendaciones)",
    resumen: "Cada examen médico ocupacional periódico atendido: fecha, entrega de resultados, periodicidad y próximo examen, sin datos de salud.",
    granularidad: "Una fila = un examen (atención) no anulado de una persona. Una persona tiene uno por año, más o menos.",
    descripcion:
      "Historial de exámenes periódicos de La Carolina, Metrorecaudo y Anaya Giraldo desde 2021. Las filas de origen 'historico' vienen del Excel de SST: las de 2021–2024 suelen traer solo la fecha (sin entrega). En lugar de las recomendaciones del médico, la columna tiene_recomendaciones dice si las hay.",
    origen: ORIGEN,
    identificador: "id",
    columnaFecha: "fecha_atencion",
    volumen: "Del orden de mil filas; crece unas 300 al año.",
    filasAproximadas: 1200,
    columnasPorDefecto: ["id", "cedula", "nombre", "grupo", "fecha_atencion", "fecha_entrega", "periodicidad_meses", "proximo_examen", "tiene_recomendaciones"],
    columnas: {
      id: { descripcion: "UUID del examen." },
      cedula: { descripcion: "Cédula de la persona examinada.", relacion: "sst_examenes_estado.cedula", formato: "Solo dígitos" },
      nombre: { descripcion: "Nombre de la persona a la fecha del examen." },
      cargo: { descripcion: "Cargo o área a la fecha del examen (texto libre)." },
      grupo: { descripcion: "Grupo de control actual de la persona.", valores: GRUPOS, advertencia: "Es el grupo de hoy, no el del día del examen." },
      fecha_atencion: { descripcion: "Día en que se hizo el examen.", formato: "YYYY-MM-DD" },
      fecha_entrega: { descripcion: "Día en que se entregaron los resultados; nula si está pendiente o el histórico no la trae.", formato: "YYYY-MM-DD" },
      periodicidad_meses: { descripcion: "Meses hasta el siguiente examen según el concepto médico.", unidad: "meses" },
      proximo_examen: { descripcion: "fecha_atencion + periodicidad_meses (meses calendario).", formato: "YYYY-MM-DD", advertencia: "Solo cuenta el del examen más reciente de cada persona; el de exámenes anteriores ya quedó cumplido." },
      tiene_recomendaciones: { descripcion: "Si el médico dejó recomendaciones. El texto no se expone." },
      origen: { descripcion: "De dónde salió el registro.", valores: { gestivo: "Registrado en la pantalla del módulo.", historico: "Cargado del Excel de SST." } },
      created_at: { descripcion: "Momento en que se registró en Gestivo.", formato: "timestamptz UTC" },
    },
    relaciones: [{ recurso: "sst_examenes_estado", mediante: "cedula", descripcion: "Semáforo actual de la persona." }],
    advertencias: [
      "Las recomendaciones y observaciones del médico NO se exponen (datos de salud); tiene_recomendaciones solo dice si existen.",
      "Para saber si alguien está al día use sst_examenes_estado, no el último proximo_examen de aquí a mano.",
      "Los exámenes anulados no aparecen.",
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuántos exámenes periódicos se hicieron por mes este año?", como: "agregar_datos contando por mes de fecha_atencion con fecha_atencion >= 'AAAA-01-01'." },
      { pregunta: "¿Qué exámenes tienen la entrega de resultados pendiente?", como: "Filtrar fecha_entrega is null y origen = 'gestivo' (el histórico antiguo no traía la entrega)." },
    ],
  },
];
