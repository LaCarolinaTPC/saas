// Catálogo semántico: reclutamiento (candidatos, vacantes, pipeline, procesos de
// contratación, empleados, documentos), campañas de Meta Ads y departamentos.
//
// Verificado contra: migraciones 001, 002, 004, 011, 012, 014, 015, 017, 021,
// 024, 025, 026 y 20260904171240; src/lib/actions.ts,
// src/lib/contratacion/{actions,constants}.ts, src/lib/meta/sync.ts,
// src/app/api/campanas/sync-meta, src/app/api/webhooks/[slug],
// src/lib/gema/sync.ts (syncEmpleados), src/app/api/departments,
// src/app/api/rotacion/upload-records, src/lib/recruitment/derive.ts y
// src/app/(dashboard)/configuracion/pipeline/actions.ts.

import type { DocRecurso } from "./tipos";

const TS_UTC =
  "timestamptz en UTC (Colombia = UTC−5). Convierta con AT TIME ZONE 'America/Bogota' antes de agrupar por día.";

const FLUJO =
  "Flujo: candidates (persona) → candidate_vacancy (postulación a una vacante, con etapa del pipeline) → stage_history (cambios de etapa) ; en paralelo procesos_contratacion (seguimiento operativo de aspirantes a conductor) → al pasar a 'contratado' crea la persona en conductores (vacante cuyo título contiene «conductor», visible en conductores_con_grupo) o en employees (cualquier otra vacante).";

const ETAPAS_PIPELINE: Record<string, string> = {
  recibido: "Recibido: postulación nueva / pendiente por citar (equivale al estado 'pendiente' del proceso).",
  citado: "Citado a entrevista o presentación.",
  en_examenes: "En exámenes médicos.",
  prueba_manejo: "En prueba de manejo.",
  en_escuela: "En escuela de formación.",
  reconocimiento_ruta: "En reconocimiento de ruta.",
  contratado: "Contratado (etapa de tipo 'ganado').",
  rechazado: "Rechazado o proceso cerrado sin contratación (tipo 'perdido'; equivale a 'cierre' del proceso).",
  en_revision: "Etapa genérica antigua, desactivada en la migración 026; solo en registros históricos.",
  validacion_documental: "Etapa genérica antigua, desactivada; solo histórico.",
  preseleccionado: "Etapa genérica antigua, desactivada; solo histórico.",
  entrevistado: "Etapa genérica antigua, desactivada; solo histórico.",
  en_pruebas: "Etapa genérica antigua, desactivada; solo histórico.",
  aprobado: "Etapa genérica antigua de tipo 'ganado', desactivada; solo histórico.",
};

const NOTA_ETAPAS =
  "Es la clave de texto (pipeline_stages.key), no un id ni un enum. La tabla pipeline_stages (no expuesta por la API) da label, orden, tipo ('normal' | 'ganado' | 'perdido') y activo. Un administrador puede crear etapas nuevas con clave derivada del nombre (p. ej. 'entrevista_final'), así que pueden aparecer claves fuera de esta lista.";

export const RECURSOS_RECLUTAMIENTO: DocRecurso[] = [
  // ───────────────────────────────────────────────────────────── candidates
  {
    nombre: "candidates",
    dominio: "reclutamiento",
    titulo: "Candidatos",
    columnasPorDefecto: ["id", "full_name", "document_number", "source", "skills", "created_at"],
    resumen: "Banco de personas que se han postulado o están en un proceso de selección.",
    granularidad:
      "Una fila = una persona candidata. document_number es único cuando existe; sin documento puede haber duplicados de la misma persona (por teléfono o correo).",
    descripcion:
      `Datos de contacto y perfil del aspirante. NO tiene columna de estado ni de etapa: la etapa vive en candidate_vacancy y el estado operativo en procesos_contratacion. ${FLUJO}`,
    origen:
      "Tres vías verificadas: (1) formulario de procesos de contratación (módulo Candidatos o panel de una conversación de WhatsApp en Comunicaciones), que crea el candidato por cédula si no existe con source = medio_postulacion; (2) webhooks genéricos configurables en Integraciones (POST /api/webhooks/<slug>), que buscan por teléfono, documento o correo y crean o actualizan con source = slug del webhook; (3) edición manual desde la ficha. Tiempo real, sin sincronización programada.",
    identificador: "id",
    columnaFecha: "created_at",
    columnas: {
      id: { descripcion: "Identificador UUID del candidato." },
      full_name: {
        descripcion: "Nombre completo. Desde procesos de contratación llega en MAYÚSCULAS; desde webhooks, tal como lo envía la plataforma ('Sin nombre' si no vino).",
      },
      document_type: {
        descripcion: "Tipo de documento de identidad.",
        valores: { CC: "Cédula de ciudadanía (valor por defecto)." },
        advertencia: "Ningún flujo del código lo asigna: casi siempre es el valor por defecto 'CC', aunque la persona tenga otro documento.",
      },
      document_number: {
        descripcion: "Número de documento (cédula). Único en la tabla. Clave para cruzar con procesos_contratacion.cedula, employees.document_number y conductores_con_grupo.cedula.",
        relacion: "procesos_contratacion.cedula",
        advertencia: "Nulo en candidatos creados por webhook sin documento. Texto sin normalizar (puede traer puntos o espacios según la fuente).",
      },
      phone: {
        descripcion: "Teléfono o celular de contacto.",
        sensible: true,
        advertencia: "Formato heterogéneo: el webhook guarda el valor crudo (a veces con indicativo 57), el formulario lo guarda recortado y desde WhatsApp se prellenan los últimos 10 dígitos. Compare por los últimos 10 dígitos.",
      },
      email: { descripcion: "Correo electrónico.", sensible: true },
      location: { descripcion: "Ciudad o ubicación declarada; editable en la ficha.", sensible: true },
      linkedin_url: { descripcion: "URL del perfil de LinkedIn; editable en la ficha.", sensible: true },
      avatar_url: {
        descripcion: "URL de foto del candidato.",
        sensible: true,
        advertencia: "No se encontró ningún flujo que la llene; espere nulos.",
      },
      source: {
        descripcion: "Canal por el que llegó el candidato, fijado al crearlo (no se actualiza después).",
        valores: {
          manual: "Valor por defecto de la columna.",
          whatsapp: "Medio de postulación WhatsApp (formulario o panel de conversación).",
          computrabajo: "Medio Computrabajo.",
          referido: "Referido por un empleado.",
          varylo: "Medio Varylo.",
          manychat: "Medio ManyChat.",
          voluntario: "Se presentó por iniciativa propia.",
          reingreso: "Persona que ya trabajó en la empresa.",
          otro: "Otro medio.",
          contratacion: "Creado desde un proceso sin medio de postulación.",
        },
        advertencia: "Texto libre: los webhooks escriben el slug de su configuración, que puede ser cualquier texto. El módulo Campañas lo agrupa por subcadena: whats/meta/facebook/instagram → WhatsApp; refer → Referido; computrabajo; manychat; varylo; resto → Otros.",
      },
      skills: { descripcion: "Arreglo de texto con habilidades del candidato (solo se muestra en la ficha).", advertencia: "Normalmente nulo." },
      notes: { descripcion: "Nota libre sobre el candidato.", sensible: true },
      created_at: { descripcion: "Momento de creación del candidato.", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "candidate_vacancy", mediante: "candidate_vacancy.candidate_id = candidates.id", descripcion: "Vacantes a las que está postulado y su etapa." },
      { recurso: "procesos_contratacion", mediante: "procesos_contratacion.candidate_id = candidates.id (o cedula = document_number)", descripcion: "Seguimiento operativo del aspirante (estado, SIMIT, exámenes)." },
      { recurso: "documents", mediante: "documents.candidate_id = candidates.id", descripcion: "Archivos recibidos del candidato." },
      { recurso: "employees", mediante: "employees.candidate_id = candidates.id o document_number", descripcion: "Si fue contratado como empleado administrativo." },
      { recurso: "conductores_con_grupo", mediante: "conductores_con_grupo.cedula = candidates.document_number", descripcion: "Si fue contratado como conductor." },
    ],
    advertencias: [
      "El botón «Contratar» de la ficha del candidato crea el empleado y BORRA el candidato con sus postulaciones y su historial de etapas. Los contratados por esa vía ya no aparecen aquí; los contratados por procesos_contratacion sí permanecen.",
      "No hay columna de estado: para saber si alguien fue contratado use procesos_contratacion.estado o candidate_vacancy.current_stage.",
    ],
    noConfundirCon: [
      { recurso: "procesos_contratacion", diferencia: "procesos_contratacion es el registro operativo con estado y fechas del proceso; candidates es solo la persona y su contacto." },
      { recurso: "employees", diferencia: "employees son personas ya vinculadas laboralmente." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuántos candidatos nuevos llegaron por canal este mes?", como: "Filtrar created_at en el mes (convertido a hora de Colombia) y agrupar por source." },
      { pregunta: "¿Existe un candidato con esta cédula?", como: "Filtrar document_number = cédula; si no aparece, buscar también en procesos_contratacion.cedula." },
      { pregunta: "¿En qué vacantes está un candidato?", como: "Cruzar candidate_vacancy por candidate_id y ver vacancy_id y current_stage." },
    ],
  },

  // ───────────────────────────────────────────────────────────── vacancies
  {
    nombre: "vacancies",
    dominio: "reclutamiento",
    titulo: "Vacantes",
    columnasPorDefecto: ["id", "title", "department_id", "status", "modality", "contract_type", "salary_min", "salary_max", "published_at", "created_at"],
    resumen: "Posiciones abiertas o históricas a las que se asignan candidatos y procesos.",
    granularidad: "Una fila = una vacante (cargo publicado). Sin restricción de unicidad por título.",
    descripcion:
      "Define el cargo, departamento, modalidad, contrato y rango salarial. Los webhooks solo emparejan candidatos con vacantes en estado 'activa' (coincidencia de palabras del título en el payload). Si el título contiene «conductor», contratar a alguien en ella lo da de alta en conductores; si no, en employees.",
    origen: "Formulario del módulo Vacantes (/vacantes/nueva) y cambios de estado desde el detalle. Manual, en tiempo real.",
    identificador: "id",
    columnaFecha: "created_at",
    columnas: {
      id: { descripcion: "Identificador UUID de la vacante." },
      title: { descripcion: "Nombre del cargo (p. ej. «Conductor de bus»). Determina si una contratación va a conductores (contiene «conductor», sin tildes ni mayúsculas) o a employees." },
      department_id: { descripcion: "Departamento al que pertenece la vacante.", relacion: "departments.id", advertencia: "El selector del formulario solo ofrece departamentos con origen = 'manual'." },
      description: { descripcion: "Descripción libre del cargo." },
      requirements: { descripcion: "Requisitos libres del cargo." },
      location: { descripcion: "Lugar de trabajo." },
      modality: {
        descripcion: "Modalidad de trabajo.",
        valores: { presencial: "En sitio (por defecto).", remoto: "Remoto.", hibrido: "Híbrido." },
      },
      contract_type: {
        descripcion: "Tipo de contrato ofrecido.",
        valores: {
          indefinido: "Término indefinido (por defecto).",
          fijo: "Término fijo.",
          obra_labor: "Obra o labor.",
          prestacion_servicios: "Prestación de servicios.",
          practicante: "Práctica o aprendizaje.",
        },
      },
      salary_min: { descripcion: "Salario mínimo ofrecido.", unidad: "COP" },
      salary_max: { descripcion: "Salario máximo ofrecido.", unidad: "COP" },
      salary_currency: { descripcion: "Moneda del rango salarial.", valores: ["COP"], advertencia: "El formulario no la pide: siempre queda el valor por defecto 'COP'." },
      status: {
        descripcion: "Estado de la vacante.",
        valores: {
          borrador: "Guardada sin publicar.",
          activa: "Publicada y recibiendo candidatos (única que empareja webhooks).",
          cerrada: "Ya no recibe candidatos; se puede reactivar.",
          archivada: "Retirada del listado; se puede reactivar.",
        },
      },
      created_by: { descripcion: "Usuario de Gestivo que la creó (UUID de profiles, no expuesto)." },
      published_at: {
        descripcion: "Momento en que se creó publicada.",
        formato: TS_UTC,
        advertencia: "Solo se llena si se crea directamente como 'activa'; publicar o reactivar después NO lo actualiza.",
      },
      closes_at: { descripcion: "Fecha prevista de cierre.", formato: TS_UTC, advertencia: "Ningún flujo la llena; espere nulos." },
      created_at: { descripcion: "Creación de la vacante.", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "candidate_vacancy", mediante: "candidate_vacancy.vacancy_id = vacancies.id", descripcion: "Postulaciones a la vacante con su etapa." },
      { recurso: "procesos_contratacion", mediante: "procesos_contratacion.vacancy_id = vacancies.id", descripcion: "Procesos de contratación asociados." },
      { recurso: "departments", mediante: "vacancies.department_id = departments.id", descripcion: "Nombre del departamento." },
    ],
    advertencias: [
      "Eliminar una vacante borra en cascada sus postulaciones (candidate_vacancy) y su historial de etapas; los procesos quedan con vacancy_id nulo.",
    ],
    preguntasTipicas: [
      { pregunta: "¿Qué vacantes están abiertas?", como: "Filtrar status = 'activa'." },
      { pregunta: "¿Cuántos postulados tiene cada vacante?", como: "Contar candidate_vacancy agrupando por vacancy_id y unir con title." },
    ],
  },

  // ───────────────────────────────────────────────────────────── candidate_vacancy
  {
    nombre: "candidate_vacancy",
    dominio: "reclutamiento",
    titulo: "Postulaciones y etapa del pipeline",
    columnasPorDefecto: ["id", "candidate_id", "vacancy_id", "current_stage", "applied_at", "updated_at"],
    resumen: "Vínculo candidato–vacante con la etapa actual del pipeline de selección.",
    granularidad: "Una fila = un candidato en una vacante. Única por (candidate_id, vacancy_id): no hay duplicados; la misma persona en dos vacantes son dos filas.",
    descripcion:
      `Estado actual del embudo por vacante; solo guarda la etapa vigente (el recorrido está en stage_history). Desde la migración 026 las etapas activas son los estados del proceso de conductores. ${FLUJO}`,
    origen:
      "Se crea al asignar manualmente un candidato a una vacante, por webhook cuando el payload coincide con una vacante activa, o automáticamente al guardar un proceso de contratación con vacante. La etapa cambia por el tablero Kanban o la ficha, y también se sobrescribe cada vez que se guarda el proceso de contratación vinculado. Tiempo real.",
    identificador: "id",
    columnaFecha: "applied_at",
    columnas: {
      id: { descripcion: "Identificador UUID de la postulación." },
      candidate_id: { descripcion: "Candidato postulado.", relacion: "candidates.id" },
      vacancy_id: { descripcion: "Vacante a la que se postula.", relacion: "vacancies.id" },
      current_stage: {
        descripcion: `Etapa actual del candidato en esta vacante. ${NOTA_ETAPAS}`,
        valores: ETAPAS_PIPELINE,
        advertencia: "Cuando la postulación está ligada a un proceso de contratación, se sincroniza así: pendiente → recibido, cierre → rechazado y los demás estados con la misma clave. Para contratados use current_stage = 'contratado' (o cualquier etapa tipo 'ganado', incluida la antigua 'aprobado').",
      },
      assigned_to: { descripcion: "Reclutador responsable (UUID de profiles).", advertencia: "Ningún flujo lo asigna; espere nulos." },
      applied_at: {
        descripcion: "Momento en que se creó la postulación (ingreso al pipeline).",
        formato: TS_UTC,
        advertencia: "El módulo Campañas toma los primeros 10 caracteres (día UTC): las postulaciones después de las 7:00 p. m. de Colombia caen allí en el día siguiente.",
      },
      updated_at: { descripcion: "Último cambio de la fila, normalmente de etapa (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "candidates", mediante: "candidate_id = candidates.id", descripcion: "Datos de la persona y canal (source)." },
      { recurso: "vacancies", mediante: "vacancy_id = vacancies.id", descripcion: "Cargo y estado de la vacante." },
      { recurso: "stage_history", mediante: "stage_history.candidate_vacancy_id = candidate_vacancy.id", descripcion: "Cambios de etapa de esta postulación." },
      { recurso: "procesos_contratacion", mediante: "(candidate_id, vacancy_id) iguales en ambas tablas", descripcion: "Proceso operativo que alimenta la etapa." },
    ],
    advertencias: [
      "Subregistro de contratados: el botón «Contratar» de la ficha borra las postulaciones del candidato. Para contar contrataciones de conductores es más fiable procesos_contratacion.estado = 'contratado'.",
      "Un proceso de contratación sin vacancy_id no genera fila aquí.",
      "Puede haber filas con etapas antiguas desactivadas (en_revision, aprobado…) de antes de la migración 026.",
    ],
    noConfundirCon: [
      { recurso: "procesos_contratacion", diferencia: "procesos_contratacion es el expediente operativo (una fila por proceso, con SIMIT, exámenes, fechas y causa de no contratación, puede no tener vacante); candidate_vacancy solo guarda en qué etapa va la persona dentro de una vacante concreta." },
      { recurso: "stage_history", diferencia: "stage_history es el historial de cambios; aquí solo está la etapa vigente." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuántos candidatos hay en cada etapa para una vacante?", como: "Filtrar vacancy_id y agrupar por current_stage contando filas." },
      { pregunta: "¿Cuántas postulaciones entraron por día?", como: "Agrupar por (applied_at AT TIME ZONE 'America/Bogota')::date." },
      { pregunta: "¿Cuál es la conversión postulado → contratado por canal?", como: "Unir con candidates.source; contar filas y las de current_stage = 'contratado' por canal." },
    ],
  },

  // ───────────────────────────────────────────────────────────── stage_history
  {
    nombre: "stage_history",
    dominio: "reclutamiento",
    titulo: "Historial de etapas del pipeline",
    columnasPorDefecto: ["id", "candidate_vacancy_id", "from_stage", "to_stage", "changed_by", "notes", "created_at"],
    resumen: "Bitácora de cambios de etapa de cada postulación.",
    granularidad: "Una fila = un cambio de etapa (o ingreso inicial) de una postulación. Una postulación tiene 0..n filas; puede repetirse la misma etapa si alguien la mueve y la devuelve.",
    descripcion:
      "Registra from_stage → to_stage con autor y nota. Sirve para tiempos entre etapas, pero es INCOMPLETO: los cambios hechos desde procesos de contratación actualizan candidate_vacancy.current_stage sin escribir aquí.",
    origen:
      "Se escribe solo en: asignación manual a vacante (to_stage 'recibido', nota «Asignado manualmente»), ingreso por webhook (nota «Ingreso automatico via webhook <nombre>»), y movimientos en el Kanban o la ficha del candidato. Tiempo real.",
    identificador: "id",
    columnaFecha: "created_at",
    columnas: {
      id: { descripcion: "Identificador UUID del cambio." },
      candidate_vacancy_id: { descripcion: "Postulación que cambió de etapa.", relacion: "candidate_vacancy.id" },
      from_stage: {
        descripcion: `Etapa anterior. Nula en el ingreso inicial. ${NOTA_ETAPAS}`,
        valores: ETAPAS_PIPELINE,
      },
      to_stage: {
        descripcion: "Etapa nueva (misma codificación que from_stage).",
        valores: ETAPAS_PIPELINE,
      },
      changed_by: { descripcion: "Usuario que hizo el cambio (UUID de profiles). Nulo en ingresos por webhook." },
      notes: { descripcion: "Nota del cambio; los ingresos automáticos traen texto fijo." },
      created_at: { descripcion: "Momento del cambio.", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "candidate_vacancy", mediante: "candidate_vacancy_id = candidate_vacancy.id", descripcion: "Para llegar al candidato y la vacante." },
    ],
    advertencias: [
      "No refleja los cambios de estado hechos en procesos_contratacion ni la creación de postulaciones desde procesos: la etapa actual puede no coincidir con el último to_stage.",
      "Se borra junto con la postulación (eliminar vacante, candidato o usar «Contratar» en la ficha).",
    ],
    noConfundirCon: [
      { recurso: "procesos_contratacion", diferencia: "Las fechas de citación, exámenes, prueba de manejo y contrato del proceso de conductores están en procesos_contratacion, no aquí." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuándo pasó un candidato a cierta etapa?", como: "Unir con candidate_vacancy por candidate_vacancy_id, filtrar to_stage y tomar created_at en hora de Colombia." },
      { pregunta: "¿Cuántos movimientos de etapa hubo por semana?", como: "Agrupar por semana de created_at convertido a America/Bogota; tenga en cuenta que no incluye los cambios hechos desde procesos." },
    ],
  },

  // ───────────────────────────────────────────────────────────── procesos_contratacion
  {
    nombre: "procesos_contratacion",
    dominio: "reclutamiento",
    titulo: "Procesos de contratación de conductores",
    columnasPorDefecto: ["id", "fecha_creacion", "nombre", "cedula", "estado", "causa_no_contrato", "candidate_id", "vacancy_id", "simit", "licencia_categoria", "medio_postulacion", "fecha_contrato"],
    resumen: "Expediente operativo de RRHH por aspirante: estado del proceso, validaciones SIMIT y antecedentes, licencia y fechas.",
    granularidad: "Una fila = un proceso de contratación. NO es único por cédula: una misma persona puede tener varios procesos (reingresos o intentos repetidos).",
    descripcion:
      `Reemplaza el Excel «Procesos de reclutamiento». Es la fuente principal del embudo de conductores. Al guardar: crea el candidato por cédula si no existe, crea o actualiza la postulación en candidate_vacancy (si hay vacante) y, en estado 'contratado', da de alta a la persona en conductores (vacante con «conductor» en el título) o en employees. ${FLUJO}`,
    origen:
      "Formulario del módulo Candidatos y panel del contacto en Comunicaciones (WhatsApp): desde una conversación se abre el mismo formulario con medio_postulacion = 'whatsapp' y la conversación queda enlazada (wa_conversaciones.proceso_id, tabla no expuesta). También hay cambio rápido de estado desde la tabla. Captura manual en tiempo real; no hay sincronización automática.",
    identificador: "id",
    columnaFecha: "fecha_creacion",
    columnas: {
      id: { descripcion: "Identificador UUID del proceso." },
      candidate_id: { descripcion: "Candidato vinculado, buscado o creado por cédula.", relacion: "candidates.id", advertencia: "Puede ser nulo si falló la creación del candidato." },
      vacancy_id: { descripcion: "Vacante del proceso (migración 025).", relacion: "vacancies.id", advertencia: "Opcional; nulo en procesos sin vacante o si la vacante se eliminó." },
      fecha_creacion: { descripcion: "Fecha de registro del proceso; editable en el formulario.", formato: "date (YYYY-MM-DD), por defecto el día actual en hora de Colombia" },
      nombre: { descripcion: "Nombre del aspirante, guardado en MAYÚSCULAS." },
      cedula: { descripcion: "Cédula del aspirante.", relacion: "candidates.document_number" },
      celular: { descripcion: "Celular del aspirante.", sensible: true },
      reingreso: { descripcion: "true si la persona ya trabajó antes en la empresa." },
      estado: {
        descripcion: "Estado del proceso, en orden del flujo.",
        valores: {
          pendiente: "Pendiente por citar (valor por defecto).",
          citado: "Citado.",
          en_examenes: "En exámenes médicos.",
          prueba_manejo: "En prueba de manejo.",
          en_escuela: "En escuela de formación.",
          reconocimiento_ruta: "En reconocimiento de ruta.",
          contratado: "Contratado; dispara el alta en conductores o employees.",
          cierre: "Cierre del proceso sin contratación (ver causa_no_contrato).",
        },
        advertencia: "Texto sin CHECK en la base. «En curso» = los seis primeros. En candidate_vacancy se traduce pendiente → recibido y cierre → rechazado.",
      },
      causa_no_contrato: {
        descripcion: "Motivo de no contratación; solo se conserva cuando estado = 'cierre' (en otro estado se borra).",
        valores: [
          "No se ajusta al perfil",
          "Desistimiento",
          "Incomunicado",
          "Exámenes médicos",
          "No aprobado reintegro",
          "Proceso psicotécnico",
          "No pasó prueba de manejo",
          "Laborando en otra empresa",
          "Deuda SIMIT",
        ],
        advertencia: "Admite texto libre además de esta lista; agrupe con cuidado (mayúsculas y variantes).",
      },
      observacion: { descripcion: "Observación libre del reclutador.", sensible: true },
      simit: {
        descripcion: "Resultado de la consulta de multas de tránsito en SIMIT.",
        valores: { pendiente: "Pendiente verificar.", ok: "Sin deuda.", deuda: "Tiene deuda (ver simit_valor).", acuerdo_pago: "Tiene acuerdo de pago (ver simit_valor)." },
        advertencia: "Nulo si no se registró.",
      },
      simit_valor: { descripcion: "Valor de la deuda SIMIT; 0 cuando no hay deuda o no se registró.", unidad: "COP", sensible: true },
      antecedentes: {
        descripcion: "Resultado de la verificación de antecedentes.",
        valores: { pendiente: "Pendiente verificar.", ok: "Sin antecedentes.", con_antecedentes: "Con antecedentes." },
        sensible: true,
      },
      licencia_categoria: {
        descripcion: "Categoría de licencia de conducción (RUNT).",
        valores: ["A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3"],
        advertencia: "Texto libre recortado; puede traer otros valores.",
      },
      medio_postulacion: {
        descripcion: "Canal por el que se postuló.",
        valores: {
          whatsapp: "WhatsApp (valor por defecto del formulario y de conversaciones).",
          computrabajo: "Computrabajo.",
          referido: "Referido.",
          varylo: "Varylo.",
          manychat: "ManyChat.",
          voluntario: "Voluntario.",
          reingreso: "Reingreso.",
          otro: "Otro.",
        },
      },
      fecha_citacion: { descripcion: "Fecha en que se citó.", formato: "date (YYYY-MM-DD), digitada a mano" },
      fecha_examenes: { descripcion: "Fecha de exámenes médicos.", formato: "date (YYYY-MM-DD), digitada a mano" },
      fecha_prueba_manejo: { descripcion: "Fecha de la prueba de manejo.", formato: "date (YYYY-MM-DD), digitada a mano" },
      fecha_contrato: {
        descripcion: "Fecha de contratación; se usa como fecha de ingreso en el alta del conductor o empleado (si falta, se usa la fecha del día).",
        formato: "date (YYYY-MM-DD)",
        advertencia: "Puede ser nula aunque estado = 'contratado'.",
      },
      created_by: { descripcion: "Usuario que creó el proceso (UUID de profiles)." },
      created_at: { descripcion: "Momento de inserción del registro.", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "candidates", mediante: "candidate_id = candidates.id o cedula = candidates.document_number", descripcion: "Persona y datos de contacto." },
      { recurso: "vacancies", mediante: "vacancy_id = vacancies.id", descripcion: "Cargo del proceso." },
      { recurso: "candidate_vacancy", mediante: "(candidate_id, vacancy_id)", descripcion: "Etapa del pipeline sincronizada con el estado." },
      { recurso: "conductores_con_grupo", mediante: "cedula = conductores_con_grupo.cedula", descripcion: "Conductor dado de alta tras contratarse." },
      { recurso: "employees", mediante: "cedula = employees.document_number", descripcion: "Empleado dado de alta si la vacante no es de conductor." },
    ],
    advertencias: [
      "Las fechas del proceso son manuales y opcionales: no calcule tiempos de ciclo sin descartar nulos.",
      "El borrado es físico: un proceso eliminado desaparece sin rastro.",
      "Contar personas distintas exige agrupar por cedula (hay procesos repetidos).",
    ],
    noConfundirCon: [
      { recurso: "candidate_vacancy", diferencia: "candidate_vacancy es la etapa por vacante del pipeline genérico; procesos_contratacion es el expediente con validaciones y fechas, y existe aunque no haya vacante." },
      { recurso: "conductores_con_grupo", diferencia: "conductores_con_grupo es el maestro de conductores ya vinculados (rotación); aquí están los aspirantes, contratados o no." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuántos conductores se contrataron este mes?", como: "Filtrar estado = 'contratado' y fecha_contrato en el mes (si fecha_contrato es nula, usar fecha_creacion); contar cédulas distintas." },
      { pregunta: "¿Por qué no se contrata a los aspirantes?", como: "Filtrar estado = 'cierre' en el rango de fecha_creacion y agrupar por causa_no_contrato." },
      { pregunta: "¿Qué canal trae más contratados?", como: "Agrupar por medio_postulacion contando total y estado = 'contratado'." },
      { pregunta: "¿Cuántos procesos están en curso por etapa?", como: "Filtrar estado en (pendiente, citado, en_examenes, prueba_manejo, en_escuela, reconocimiento_ruta) y agrupar por estado." },
    ],
  },

  // ───────────────────────────────────────────────────────────── employees
  {
    nombre: "employees",
    dominio: "reclutamiento",
    titulo: "Empleados (RRHH)",
    columnasPorDefecto: ["id", "full_name", "document_number", "position", "department_id", "status", "hire_date", "end_date", "contract_type", "gema_codigo", "source"],
    resumen: "Maestro de empleados administrativos y de apoyo, sincronizado desde GEMA y complementado a mano.",
    granularidad:
      "Una fila = un registro de empleado. gema_codigo es único cuando existe; document_number NO es único, así que la misma cédula puede aparecer más de una vez (registro manual y de GEMA, o reingresos).",
    descripcion:
      "Personal con cargo, departamento, estado, fechas de ingreso y retiro, seguridad social y salario. La sincronización de GEMA excluye los cargos que contienen «CONDUCTOR» (esos van a conductores), pero hay conductores con source = 'manual' creados por la carga de Excel de conductores del módulo Rotación.",
    origen:
      "(1) Sync de GEMA (vista vst_ext_get_empleados, upsert por gema_codigo, source = 'gema'), dentro del cron diario /api/cron/sync-gema (08:00 UTC = 3:00 a. m. Colombia según vercel.json); (2) alta automática al contratar desde procesos_contratacion en vacante no conductora; (3) botón «Contratar» de la ficha del candidato; (4) carga de Excel de conductores activos o retirados en Rotación, que inserta los que no existan por cédula; (5) edición manual.",
    identificador: "id",
    columnaFecha: "hire_date",
    columnas: {
      id: { descripcion: "Identificador UUID del empleado." },
      candidate_id: { descripcion: "Candidato del que proviene, si se contrató desde Gestivo.", relacion: "candidates.id", advertencia: "Casi siempre nulo: los de GEMA no lo tienen y «Contratar» borra luego el candidato." },
      full_name: { descripcion: "Nombre completo." },
      document_number: { descripcion: "Cédula.", relacion: "conductores_con_grupo.cedula", advertencia: "No es única; puede ser nula." },
      email: { descripcion: "Correo; en los de GEMA sale del correo personal registrado en GEMA.", sensible: true },
      phone: { descripcion: "Celular.", sensible: true },
      avatar_url: { descripcion: "URL de foto.", sensible: true, advertencia: "No se encontró flujo que la llene." },
      department_id: { descripcion: "Departamento organizacional.", relacion: "departments.id" },
      position: { descripcion: "Cargo (en GEMA, texto en mayúsculas; 'SIN CARGO' o 'Por definir' si faltó)." },
      status: {
        descripcion: "Estado laboral.",
        valores: {
          periodo_prueba: "En período de prueba.",
          activo: "Vinculado y activo (por defecto).",
          permiso: "Con permiso o licencia.",
          inactivo: "Inactivo sin retiro formal.",
          retirado: "Retirado de la empresa.",
        },
        advertencia: "La sincronización de GEMA solo escribe 'activo' o 'retirado' y lo sobrescribe en cada corrida; los otros valores solo aparecen por edición manual.",
      },
      hire_date: { descripcion: "Fecha de ingreso.", formato: "date (YYYY-MM-DD)", advertencia: "Nullable desde la migración 014: GEMA trae empleados sin fecha de ingreso." },
      end_date: { descripcion: "Fecha de retiro; nula si sigue vinculado.", formato: "date (YYYY-MM-DD)" },
      contract_type: {
        descripcion: "Tipo de contrato.",
        valores: ["indefinido", "fijo", "obra_labor", "prestacion_servicios", "practicante"],
        advertencia: "GEMA no lo envía: en registros sincronizados queda el valor por defecto 'indefinido'.",
      },
      salary: { descripcion: "Salario del empleado.", unidad: "COP", sensible: true, advertencia: "GEMA no lo envía; solo existe si se editó a mano o vino de la vacante al contratar." },
      salary_currency: { descripcion: "Moneda del salario.", valores: ["COP"] },
      supervisor_id: { descripcion: "Jefe inmediato (UUID de profiles).", advertencia: "Ningún flujo lo asigna." },
      location: { descripcion: "Sede o ubicación.", sensible: true },
      eps: { descripcion: "EPS (entidad de salud) afiliada.", sensible: true },
      afp: { descripcion: "Fondo de pensiones.", sensible: true },
      arl: { descripcion: "Administradora de riesgos laborales.", sensible: true },
      caja_compensacion: { descripcion: "Caja de compensación familiar.", sensible: true },
      observations: { descripcion: "Observaciones; las altas automáticas dicen «Creado automáticamente al contratar (módulo Candidatos)».", sensible: true },
      gema_codigo: { descripcion: "Código de personal en GEMA (clave del upsert). Nulo en registros manuales." },
      source: {
        descripcion: "Origen del registro.",
        valores: { gema: "Sincronizado desde GEMA.", manual: "Creado en Gestivo (formulario, contratación o Excel de conductores)." },
      },
      created_at: { descripcion: "Inserción del registro.", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "departments", mediante: "department_id = departments.id", descripcion: "Nombre del departamento." },
      { recurso: "documents", mediante: "documents.employee_id = employees.id", descripcion: "Documentos del empleado." },
      { recurso: "conductores_con_grupo", mediante: "document_number = conductores_con_grupo.cedula", descripcion: "Detecta conductores que también quedaron como empleado." },
    ],
    advertencias: [
      "Para contar conductores NO use esta tabla: use conductores_con_grupo. Si necesita solo personal administrativo, excluya position ILIKE '%CONDUCTOR%'.",
      "Los datos de GEMA se sobrescriben en cada sincronización: las ediciones manuales de campos que GEMA envía (nombre, cargo, estado, fechas) se pierden.",
    ],
    noConfundirCon: [
      { recurso: "conductores_con_grupo", diferencia: "Es el maestro de conductores del módulo de rotación (tabla conductores, estado ACTIVO/RETIRADO en mayúsculas, con grupo y meses de antigüedad). employees es RRHH general sin conductores de GEMA." },
      { recurso: "candidates", diferencia: "candidates son aspirantes, no vinculados." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuántos empleados activos hay por departamento?", como: "Filtrar status = 'activo', agrupar por department_id y unir con departments.name." },
      { pregunta: "¿Cuántos ingresos y retiros hubo en el mes?", como: "Ingresos: hire_date en el mes; retiros: end_date en el mes (o status = 'retirado'). Descarte nulos de hire_date." },
      { pregunta: "¿Qué EPS tienen los empleados?", como: "Agrupar por eps con status = 'activo'." },
    ],
  },

  // ───────────────────────────────────────────────────────────── documents
  {
    nombre: "documents",
    dominio: "reclutamiento",
    titulo: "Documentos de candidatos y empleados",
    columnasPorDefecto: ["id", "candidate_id", "employee_id", "category_id", "mime_type", "status", "needs_review", "created_at"],
    resumen: "Metadatos de archivos adjuntos (hoja de vida, identificación, etc.) con su estado de revisión.",
    granularidad: "Una fila = un archivo. Sin unicidad: el mismo archivo reenviado por webhook genera otra fila.",
    descripcion:
      "Solo metadatos y la URL del archivo, no el contenido. El único flujo que inserta filas es el webhook de integraciones, que descarga los adjuntos del payload al bucket público «documents» de Supabase Storage. Desde la interfaz solo se cambia el estado o se elimina.",
    origen:
      "Webhooks de /api/webhooks/<slug> con adjuntos (estado inicial 'pendiente', needs_review = true). Al contratar con el botón «Contratar», los documentos pasan del candidato al empleado. Tiempo real.",
    identificador: "id",
    columnaFecha: "created_at",
    columnas: {
      id: { descripcion: "Identificador UUID del documento." },
      name: { descripcion: "Nombre mostrado: «<archivo> - <nombre del candidato>».", sensible: true },
      file_path: {
        descripcion: "URL pública del archivo en Storage (…/storage/v1/object/public/documents/candidates/<id>/…) o, si falló la copia, la URL original de la plataforma de origen.",
        sensible: true,
        advertencia: "El bucket es público: la URL da acceso directo al archivo. No la exponga.",
      },
      file_size: { descripcion: "Tamaño del archivo.", unidad: "bytes", advertencia: "Nulo si no se pudo descargar." },
      mime_type: { descripcion: "Tipo MIME (application/pdf, image/jpeg…)." },
      category_id: { descripcion: "Categoría del documento (tabla document_categories, no expuesta: Hoja de Vida, Documento de Identidad, Licencia, Antecedentes, Exámenes Médicos, Contrato…).", advertencia: "Ningún flujo la asigna: espere nulos." },
      status: {
        descripcion: "Estado de revisión del documento.",
        valores: {
          pendiente: "Recibido sin revisar (por defecto).",
          revisado: "Revisado; la interfaz lo muestra como «Vigente».",
          aprobado: "Aprobado.",
          firmado: "Firmado.",
          vencido: "Vencido.",
          rechazado: "Rechazado.",
        },
        advertencia: "Solo cambia a mano; no hay proceso que marque 'vencido' automáticamente.",
      },
      classification_confidence: { descripcion: "Confianza de una clasificación automática (0–1).", advertencia: "Ningún flujo la llena; la columna existe pero no se usa." },
      needs_review: { descripcion: "true si requiere revisión; se pone true al llegar por webhook y queda true solo mientras status = 'pendiente'." },
      candidate_id: { descripcion: "Candidato dueño del documento.", relacion: "candidates.id" },
      employee_id: { descripcion: "Empleado dueño del documento.", relacion: "employees.id" },
      assigned_to: { descripcion: "Usuario responsable de revisarlo (UUID de profiles).", advertencia: "Ningún flujo lo asigna." },
      uploaded_by: { descripcion: "Usuario que lo subió (UUID de profiles).", advertencia: "Nulo: el webhook no lo llena." },
      expires_at: { descripcion: "Fecha de vencimiento.", formato: "date (YYYY-MM-DD)", advertencia: "Ningún flujo la llena." },
      created_at: { descripcion: "Recepción del documento.", formato: TS_UTC },
      updated_at: { descripcion: "Última modificación (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "candidates", mediante: "candidate_id = candidates.id", descripcion: "Candidato dueño." },
      { recurso: "employees", mediante: "employee_id = employees.id", descripcion: "Empleado dueño." },
    ],
    advertencias: [
      "Tabla de poco uso: solo se llena si hay webhooks con adjuntos configurados. Que esté vacía no significa que los candidatos no tengan documentos (pueden estar fuera de Gestivo).",
      "Si se elimina el candidato, el documento queda huérfano (candidate_id nulo).",
      "No contiene los documentos de vehículos del módulo operativo.",
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuántos documentos están pendientes de revisión?", como: "Filtrar status = 'pendiente' (o needs_review = true) y contar." },
      { pregunta: "¿Qué documentos tiene un candidato?", como: "Filtrar candidate_id; listar name, mime_type y status (sin mostrar file_path)." },
    ],
  },

  // ───────────────────────────────────────────────────────────── meta_campaigns
  {
    nombre: "meta_campaigns",
    dominio: "campanas",
    titulo: "Campañas de Meta Ads (acumulado)",
    columnasPorDefecto: ["id", "meta_campaign_id", "nombre", "gasto", "impresiones", "clics", "leads", "updated_at"],
    resumen: "Resumen por campaña de Meta Ads: gasto, impresiones, clics y conversaciones del rango de la última sincronización.",
    granularidad: "Una fila = una campaña de Meta (única por meta_campaign_id). Solo existen campañas con actividad en algún rango sincronizado.",
    descripcion:
      "Totales por campaña calculados sumando los datos diarios que trajo la última sincronización. No es un acumulado histórico garantizado: cada sync reemplaza los totales con la suma del rango pedido.",
    origen:
      "Graph API de Meta (insights nivel campaña, time_increment = 1) vía GET /api/campanas/sync-meta, protegido con CRON_SECRET. Rango por defecto: 2026-01-01 hasta hoy (UTC); acepta ?from=&to=. No hay cron para este endpoint en vercel.json: la frecuencia real no es verificable en el código.",
    identificador: "id",
    columnas: {
      id: { descripcion: "UUID interno." },
      meta_campaign_id: { descripcion: "Id de la campaña en Meta.", relacion: "meta_spend_daily.meta_campaign_id" },
      nombre: { descripcion: "Nombre de la campaña en Meta al momento del sync." },
      estado: { descripcion: "Estado de la campaña en Meta.", advertencia: "El sync no lo llena: siempre nulo." },
      fecha_inicio: { descripcion: "Inicio de la campaña.", formato: "date", advertencia: "El sync no lo llena: siempre nulo." },
      fecha_fin: { descripcion: "Fin de la campaña.", formato: "date", advertencia: "El sync no lo llena: siempre nulo." },
      gasto: {
        descripcion: "Inversión (spend de Meta) sumada en el rango de la última sincronización.",
        unidad: "moneda de la cuenta publicitaria (se asume COP)",
        advertencia: "El código no convierte ni consulta la moneda: el valor está en la moneda configurada en la cuenta de Meta. Si el último sync usó un rango corto, el total es solo de ese rango.",
      },
      impresiones: { descripcion: "Impresiones en el rango sincronizado.", unidad: "impresiones" },
      clics: { descripcion: "Clics en el rango sincronizado.", unidad: "clics" },
      leads: {
        descripcion: "Conversaciones o leads: suma de las acciones onsite_conversion.messaging_conversation_started_7d, lead y onsite_conversion.lead_grouped.",
        unidad: "conversaciones",
        advertencia: "Suma tipos de acción que Meta puede reportar solapados (lead y lead_grouped): posible doble conteo en campañas de formulario.",
      },
      moneda: { descripcion: "Moneda declarada.", valores: ["COP"], advertencia: "Valor por defecto de la columna; el sync nunca lo escribe, no confirma la moneda real." },
      updated_at: { descripcion: "Última actualización por el sync (trigger).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "meta_spend_daily", mediante: "meta_campaign_id", descripcion: "Detalle diario de la campaña." },
    ],
    advertencias: [
      "Para gasto por periodo use meta_spend_daily, no esta tabla.",
      "No hay atribución de candidatos a campañas: ninguna tabla de reclutamiento guarda meta_campaign_id.",
    ],
    noConfundirCon: [
      { recurso: "meta_spend_daily", diferencia: "meta_spend_daily tiene una fila por campaña y día y permite filtrar por fechas; meta_campaigns es un total sin fecha." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Qué campañas existen y cuánto han gastado?", como: "Listar nombre y gasto; para un periodo concreto sumar meta_spend_daily.gasto por meta_campaign_id." },
      { pregunta: "¿Cuál es el costo por conversación de cada campaña?", como: "gasto / NULLIF(leads, 0) por fila, aclarando la posible doble cuenta de leads." },
    ],
  },

  // ───────────────────────────────────────────────────────────── meta_spend_daily
  {
    nombre: "meta_spend_daily",
    dominio: "campanas",
    titulo: "Gasto diario en Meta Ads",
    columnasPorDefecto: ["id", "fecha", "meta_campaign_id", "gasto", "impresiones", "clics", "leads"],
    resumen: "Gasto, impresiones, clics y conversaciones de Meta Ads por campaña y día.",
    granularidad: "Una fila = una campaña en un día. Única por (fecha, meta_campaign_id); los re-sync actualizan sin duplicar. Solo días con datos devueltos por Meta.",
    descripcion:
      "Base del costo por contratación del módulo Campañas: suma gasto y toma leads como «conversaciones» del canal WhatsApp.",
    origen:
      "Mismo sync que meta_campaigns: Graph API de Meta vía GET /api/campanas/sync-meta (upsert por fecha y campaña). Invocación manual o cron externo; frecuencia no verificable en el código.",
    identificador: "id",
    columnaFecha: "fecha",
    columnas: {
      id: { descripcion: "UUID interno." },
      fecha: {
        descripcion: "Día del reporte (date_start del insight de Meta).",
        formato: "date (YYYY-MM-DD) en la zona horaria de la cuenta publicitaria de Meta",
      },
      meta_campaign_id: { descripcion: "Id de la campaña en Meta.", relacion: "meta_campaigns.meta_campaign_id", advertencia: "Texto sin llave foránea." },
      gasto: {
        descripcion: "Inversión del día.",
        unidad: "moneda de la cuenta publicitaria (se asume COP)",
        advertencia: "No se convierte ni se guarda la moneda en esta tabla.",
      },
      impresiones: { descripcion: "Impresiones del día.", unidad: "impresiones" },
      clics: { descripcion: "Clics del día.", unidad: "clics" },
      leads: {
        descripcion: "Conversaciones de mensajería iniciadas más leads del día (misma suma de acciones que meta_campaigns.leads).",
        unidad: "conversaciones",
        advertencia: "Posible doble conteo entre lead y lead_grouped.",
      },
      created_at: { descripcion: "Primera inserción de la fila (no cambia en actualizaciones).", formato: TS_UTC },
    },
    relaciones: [
      { recurso: "meta_campaigns", mediante: "meta_campaign_id", descripcion: "Nombre de la campaña." },
      { recurso: "procesos_contratacion", mediante: "Solo por periodo (fecha vs. fecha_contrato); no hay llave común", descripcion: "Costo por contratación aproximado." },
    ],
    advertencias: [
      "El módulo Campañas atribuye todo el gasto a los canales WhatsApp, ManyChat y Varylo; es una aproximación, no una atribución real por campaña.",
      "Meta puede ajustar cifras de días recientes: si no se vuelve a sincronizar, los últimos días pueden quedar desactualizados.",
    ],
    noConfundirCon: [
      { recurso: "meta_campaigns", diferencia: "meta_campaigns es un total por campaña sin fecha." },
    ],
    preguntasTipicas: [
      { pregunta: "¿Cuánto se gastó en Meta este mes?", como: "Filtrar fecha en el mes y sumar gasto." },
      { pregunta: "¿Cuál fue el costo por contratación del mes?", como: "Sumar gasto del mes y dividir entre procesos_contratacion con estado = 'contratado' y fecha_contrato en el mes (idealmente de medios whatsapp, manychat o varylo)." },
      { pregunta: "¿Qué campaña tuvo más conversaciones por semana?", como: "Agrupar por semana de fecha y meta_campaign_id sumando leads; unir con meta_campaigns.nombre." },
    ],
  },

  // ───────────────────────────────────────────────────────────── departments
  {
    nombre: "departments",
    dominio: "organizacion",
    titulo: "Departamentos",
    columnasPorDefecto: ["id", "name", "origen", "description", "created_at"],
    resumen: "Catálogo de departamentos: los organizacionales de GEMA y los creados a mano para vacantes.",
    granularidad: "Una fila = un departamento; name es único (sensible a mayúsculas).",
    descripcion:
      "Catálogo compartido por employees.department_id y vacancies.department_id. La columna origen separa los departamentos que trae GEMA de los creados por usuarios para clasificar vacantes.",
    origen:
      "(1) Sync de empleados de GEMA: crea los departamentos que no existan (comparando en mayúsculas) con origen = 'gema', en el cron diario; (2) botón de crear departamento del formulario de vacantes (POST /api/departments), origen = 'manual'; (3) semilla inicial genérica (Ingeniería, Diseño, Mercadeo, RRHH, Operaciones, Finanzas), marcada 'gema' por la migración 024.",
    identificador: "id",
    columnas: {
      id: { descripcion: "Identificador UUID." },
      name: { descripcion: "Nombre del departamento (los de GEMA, tal como vienen, normalmente en mayúsculas)." },
      description: { descripcion: "Descripción; solo la tienen los de la semilla inicial." },
      created_at: { descripcion: "Creación del registro.", formato: TS_UTC },
      origen: {
        descripcion: "Quién gestiona el departamento (migración 024).",
        valores: {
          gema: "Organizacional: creado por el sync de GEMA o existente antes de la migración 024 (incluye la semilla genérica). No aparece en el selector de vacantes.",
          manual: "Creado por un usuario desde vacantes; es lo único que ofrece el selector de departamento de vacantes.",
        },
        advertencia: "Si un usuario crea desde vacantes un nombre que ya existía como 'gema', la fila pasa a 'manual' aunque GEMA la siga usando. origen no indica si hay empleados asociados.",
      },
    },
    relaciones: [
      { recurso: "employees", mediante: "employees.department_id = departments.id", descripcion: "Empleados del departamento." },
      { recurso: "vacancies", mediante: "vacancies.department_id = departments.id", descripcion: "Vacantes del departamento." },
    ],
    advertencias: [
      "Los departamentos de la semilla (Ingeniería, Diseño, Mercadeo, Finanzas…) son datos genéricos de ejemplo, no necesariamente áreas reales de la empresa.",
      "Los permisos por alcance de usuario (profiles.scope_departments) guardan nombres de departamento, no ids.",
    ],
    preguntasTipicas: [
      { pregunta: "¿Qué departamentos reales tiene la empresa?", como: "Filtrar origen = 'gema' y quedarse con los que tengan empleados (unir con employees por department_id)." },
      { pregunta: "¿Cuántos empleados activos tiene cada departamento?", como: "Unir con employees filtrando status = 'activo' y agrupar por name." },
    ],
  },
];
