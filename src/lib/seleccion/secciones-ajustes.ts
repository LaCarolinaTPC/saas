/**
 * Cómo se muestran los ajustes de la selección en Tiempos y reglas: agrupados
 * por etapa del proceso, con un nombre corto, una ayuda y la unidad junto al
 * campo. Los nombres largos de la base quedan de respaldo para los ajustes que
 * no estén aquí (van a «Otros ajustes»). Puro: lo usa la pantalla y se prueba.
 */
import type { AjusteSeleccion } from "./ajustes";
import { DEFINICIONES_ALERTAS } from "./alertas-indicadores";
import { SOLO_EN_ANTECEDENTES } from "./secciones-antecedentes";

export interface PresentacionAjuste {
  etiqueta: string;
  ayuda?: string;
  /** Unidad junto al campo («horas», «años»…). Si no está, sale de la unidad del ajuste. */
  sufijo?: string;
}

export interface SeccionAjustes {
  id: string;
  titulo: string;
  detalle: string;
  /** Ajustes en el orden en que se muestran. */
  ajustes: Record<string, PresentacionAjuste>;
}

export const SECCIONES_AJUSTES: SeccionAjustes[] = [
  {
    id: "asistente",
    titulo: "Asistente de IA",
    detalle: "Cómo se presenta el asistente que atiende a los aspirantes por WhatsApp.",
    ajustes: {
      asistente_nombre: {
        etiqueta: "Nombre del asistente",
        ayuda: "Con este nombre se presenta y saluda. En los mensajes va como {asistente}, por ejemplo en la bienvenida.",
      },
    },
  },
  {
    id: "reactivacion",
    titulo: "Reactivación",
    detalle:
      "Para quien dejó de responder sin enviar la hoja de vida. Va después del recordatorio de arriba y fuera de la ventana de 24 h, con las plantillas de Meta.",
    ajustes: {
      reactivacion_aviso1_horas: { etiqueta: "Primer aviso", ayuda: "Horas sin respuesta y sin hoja de vida." },
      reactivacion_aviso2_horas: { etiqueta: "Segundo aviso", ayuda: "Horas después del primero." },
      reactivacion_llamar_horas: { etiqueta: "Pasar a llamada", ayuda: "Horas después del segundo aviso: el chat queda para que Gestión Humana llame." },
      incomunicado_dias: { etiqueta: "Cerrar como «Incomunicado»", ayuda: "Días sin respuesta después de pasar a llamada." },
    },
  },
  {
    id: "requisitos",
    titulo: "Requisitos de la preselección",
    detalle:
      "Con los requisitos en verde y la autorización de datos aceptada, el proceso pasa solo a antecedentes. La experiencia no bloquea.",
    ajustes: {
      edad_minima: { etiqueta: "Edad mínima", sufijo: "años" },
      edad_maxima: { etiqueta: "Edad máxima", sufijo: "años" },
      ciudades: { etiqueta: "Ciudades", ayuda: "Donde debe vivir. Quien vive en otra y está dispuesto a trasladarse también cumple. Separadas por comas." },
      licencias: { etiqueta: "Categorías de licencia" },
      licencia_vigencia_minima_meses: {
        etiqueta: "Vigencia mínima de la licencia",
        ayuda: "Meses que le deben quedar según el RUNT. 0 = basta con que no esté vencida.",
        sufijo: "meses",
      },
      simit_tope: { etiqueta: "Tope de multas en el SIMIT" },
      experiencia_meses: { etiqueta: "Experiencia pedida", ayuda: "No excluyente: quien tiene menos sigue el proceso.", sufijo: "meses" },
      preseleccion_cierre_minutos: {
        etiqueta: "Cerrar solo a quien no cumple, después de",
        ayuda: "Minutos con un requisito en rojo, sin cambios y sin mensajes nuevos del aspirante, antes de cerrar el proceso con su causa. Da tiempo a que corrija un dato o acepte trasladarse.",
      },
    },
  },
  {
    id: "verificaciones",
    titulo: "Verificaciones con Croma",
    detalle:
      "El SIMIT y el RUNT, y cuánto vale una consulta. Qué pasa con cada respuesta de Croma (hallazgos, fuente que no responde, nombre que no coincide) está en la pestaña Antecedentes.",
    ajustes: {
      croma_pausado: {
        etiqueta: "Pausar Croma",
        ayuda: "Sí: no se consulta nada en Croma (por ejemplo, si está caído). El proceso sigue como si las verificaciones no fueran obligatorias, el asistente pide la licencia y todo queda para revisar a mano («Lo revisé a mano» en la ficha); nadie se cita solo. Al volver a «no», la revisión automática retoma lo pendiente.",
      },
      runt_obligatorio: {
        etiqueta: "RUNT obligatorio",
        ayuda: "Para pasar a antecedentes. No: si Croma no responde el RUNT, el asistente pide la categoría y una foto de la licencia, y vale la que dice el aspirante (con la observación). Sí: hace falta el RUNT o que una persona verifique la licencia a mano.",
      },
      alerta_servicios_correos: {
        etiqueta: "Avisar por correo si un servicio falla",
        ayuda: "Separados por comas. Les llega un correo cuando Croma, la IA, WhatsApp o el correo empiezan a fallar, un recordatorio cada 6 horas si sigue igual y otro cuando vuelve a funcionar. Vacío: no se avisa. Desde el entorno de pruebas el correo dice que es de pruebas.",
      },
      alerta_servicios_copia: {
        etiqueta: "Con copia a",
        ayuda: "Separados por comas: reciben la misma alerta en copia, para verificar (por ejemplo, soporte). Vacío: sin copia.",
      },
      simit_obligatorio: { etiqueta: "SIMIT obligatorio", ayuda: "Para pasar a antecedentes." },
      croma_cache_dias: {
        etiqueta: "Reutilizar una consulta de Croma",
        ayuda: "Días que vale una consulta buena para la misma cédula. 0 = consultar siempre.",
        sufijo: "días",
      },
    },
  },
  {
    id: "citacion",
    titulo: "Citación y prueba de manejo",
    detalle: "Cuándo y cómo se cita a la prueba de manejo, y qué pasa si no llega.",
    ajustes: {
      cita_automatica: { etiqueta: "Citar automáticamente", ayuda: "Al quedar «Listo para citar», Gestivo le propone la cita. No: la cita una persona." },
      citar_exige_antecedentes: { etiqueta: "Exigir antecedentes resueltos para citar" },
      cita_hora_semana: { etiqueta: "Hora de la cita, lunes a viernes" },
      cita_hora_sabado: { etiqueta: "Hora de la cita, sábados" },
      cita_limite_mismo_dia: { etiqueta: "Ofrecer cita el mismo día hasta", ayuda: "Hora límite para ofrecer la cita ese mismo día." },
      recordatorio_cita_hora: { etiqueta: "Recordatorio el día de la cita" },
      cambio_mismo_dia_minutos: {
        etiqueta: "El profesor cambia las citas de hoy hasta",
        ayuda: "Minutos antes de la primera cita (y de la hora nueva). Hoy solo por un imprevisto, con la explicación escrita, para alcanzar a avisar a los aspirantes. Gestión Humana, desde la Agenda, puede siempre.",
        sufijo: "min antes",
      },
      alerta_no_confirmo_hora: { etiqueta: "Alerta para llamar si no confirmó" },
      tolerancia_inasistencia_minutos: { etiqueta: "Tolerancia antes de marcar «No asistió»" },
      reprogramaciones_max: { etiqueta: "Reprogramaciones permitidas", ayuda: "Después, el proceso se cierra por desistimiento.", sufijo: "veces" },
      direccion_sede: { etiqueta: "Dirección de la sede", ayuda: "Va en la citación como {direccion}." },
      contacto_cita: {
        etiqueta: "Persona por la que pregunta",
        ayuda: "Va en la citación como «Pregunta por: …» ({contacto}). Vacío: la línea no sale, pero la plantilla de Meta no se puede enviar sin él.",
      },
    },
  },
  {
    id: "despues",
    titulo: "Escuela, exámenes y contratación",
    detalle: "Lo que sigue a la prueba de manejo.",
    ajustes: {
      recordatorio_escuela_hora: { etiqueta: "Recordatorio diario de escuela" },
      laboratorio_hora: { etiqueta: "Hora en el laboratorio" },
      laboratorio_nombre: { etiqueta: "Laboratorio (respaldo)", ayuda: "Solo se usa si no hay laboratorios configurados en la pestaña Laboratorios. Va en los mensajes de exámenes como {laboratorio}." },
      orden_laboratorio_automatica: {
        etiqueta: "Enviar la orden al laboratorio automáticamente",
        ayuda: "Sí: al laboratorio por WhatsApp le llega apenas se cita al aspirante; al de correo, un correo al día con todos los citados del siguiente día hábil, a la hora de abajo. No: se envía a mano con «Enviar» en la pestaña Laboratorios.",
      },
      orden_laboratorio_hora: { etiqueta: "Hora del correo diario con las órdenes", ayuda: "Solo para los laboratorios por correo, con el envío automático." },
      cargo_documentos: {
        etiqueta: "Cargo en la carta y la orden",
        ayuda: "Va como {cargo} en la carta del banco y en la orden de exámenes, en mayúsculas. Vacío: «CONDUCTOR - COBRADOR».",
      },
      reconocimiento_hora: {
        etiqueta: "Hora del reconocimiento de ruta",
        ayuda: "A esta hora se cita cada salida, el siguiente día hábil en que el profesor puede. El recordatorio sale a la hora del recordatorio de las citas, si es antes.",
      },
      rutas_minimas: {
        etiqueta: "Rutas del reconocimiento de ruta",
        ayuda: "Cuántas debe aprender, entre ellas todas las obligatorias de la lista de abajo. Si hay más obligatorias que este número, se exigen todas.",
        sufijo: "rutas",
      },
      correo_psico_activo: {
        etiqueta: "Pedir el correo para la prueba psicosensotécnica",
        ayuda: "Al entrar a exámenes · fase 1 se le pide por WhatsApp, se le pregunta si está bien escrito y le llega un correo con un enlace para confirmarlo. Con el correo confirmado sale en Candidatos › «Psicosensotécnica: por inscribir».",
      },
      correo_psico_horas: { etiqueta: "Recordar el correo cada", ayuda: "Horas sin escribirlo o sin confirmarlo antes de cada recordatorio (dentro del horario de los recordatorios de WhatsApp)." },
      correo_psico_recordatorios: { etiqueta: "Recordatorios del correo", ayuda: "Después, el chat queda para una persona.", sufijo: "veces" },
      certificado_banco_activo: {
        etiqueta: "Recordar el certificado bancario",
        ayuda: "Después de la pregunta del banco en la fase 1, si no envía el certificado de su cuenta del Banco de Bogotá se le recuerda por WhatsApp. Se detiene cuando lo envía o el ítem de la carpeta deja de estar pendiente.",
      },
      certificado_banco_horas: { etiqueta: "Recordar el certificado cada", ayuda: "Horas sin enviarlo antes de cada recordatorio (dentro del horario de los recordatorios de WhatsApp)." },
      certificado_banco_espera_apertura_horas: { etiqueta: "Si no tenía cuenta, el primero a las", ayuda: "Tiempo para abrir la cuenta con la carta antes del primer recordatorio." },
      certificado_banco_recordatorios: { etiqueta: "Recordatorios del certificado", ayuda: "Después, el chat queda para una persona.", sufijo: "veces" },
      documentos_pendientes_dias: { etiqueta: "Recordatorio de documentos pendientes", ayuda: "Días para recordarle lo que falta en la carpeta." },
      carpeta_items: {
        etiqueta: "Documentos de la carpeta",
        ayuda: "Lo que debe estar validado para contratar, separado por comas. Es una lista de prueba: falta la de Gestión Humana.",
      },
      contratar_exige_condiciones: {
        etiqueta: "Exigir las condiciones para contratar",
        ayuda: "Exámenes de las dos fases aptos, rutas aprendidas, carpeta completa y visto bueno de la directora. No: se puede contratar sin revisarlas.",
      },
      contratar_exige_psicotecnica: {
        etiqueta: "Exigir la prueba psicosensotécnica apta para contratar",
        ayuda: "El resultado de la plataforma psicosensotécnica que Gestión Humana registra en «Día de contratación».",
      },
      listo_contratar_avisar: {
        etiqueta: "Avisar por correo cuando alguien queda «Listo para contratar»",
        ayuda: "Quien cumple todo para contratar menos el visto bueno pasa solo a la etapa «Listo para contratar» del tablero (y vuelve a la anterior si deja de cumplir). Sí: en ese momento sale un correo a Gestión Humana. También salen en el reporte diario.",
      },
      listo_contratar_correos: {
        etiqueta: "Correos que reciben ese aviso",
        ayuda: "Separados por comas. Vacío: los mismos del reporte diario de selección.",
      },
    },
  },
  {
    id: "lectura",
    titulo: "Lectura de documentos y audios",
    detalle:
      "Lo que se lee queda como propuesta en la ficha («Documentos leídos»): solo llena datos vacíos y nada pone un requisito en rojo sin que una persona lo confirme.",
    ajustes: {
      lectura_activa: {
        etiqueta: "Leer los documentos con IA",
        ayuda: "Cédula, licencia, hoja de vida y carta laboral, en foto, PDF o Word, con la IA de «Documentos» de la pestaña IA. No: solo se lee la cédula, como antes.",
      },
      validar_cartas_auto: {
        etiqueta: "Validar sola la carta laboral que coincide",
        ayuda: "Si la carta es del aspirante, de una empresa de su hoja de vida, con las mismas fechas (±2 meses) y cargo de conducción, el empleo queda verificado sin esperar a que alguien la acepte. Lo que no coincide sigue esperando a una persona.",
      },
      transcribir_audios: {
        etiqueta: "Transcribir los audios",
        ayuda: "Con la IA de «Voz» de la pestaña IA. El asistente entiende lo que dijo y deja de pedir que lo escriba.",
      },
    },
  },
  {
    id: "costo",
    titulo: "Costo del asistente",
    detalle: "Al llegar al 80 % del tope se avisa aquí; al 100 % se detienen los envíos y las consultas automáticas. Lo que hace una persona a mano sigue.",
    ajustes: {
      tope_mensual_cop: { etiqueta: "Tope mensual" },
      trm: { etiqueta: "Pesos por dólar", ayuda: "Para convertir a pesos lo que cobran los proveedores en dólares.", sufijo: "COP" },
      croma_costo_consulta: {
        etiqueta: "Valor de una consulta a Croma",
        ayuda: "Se multiplica por las consultas reales del mes (no las reutilizadas ni las simuladas). En 0 hasta conocer la tarifa.",
      },
    },
  },
  {
    id: "reporte",
    titulo: "Reporte diario por correo",
    detalle: "Cada día a las 7:00 llega por correo lo de ayer y los últimos 30 días, con las mismas cifras de Candidatos › Indicadores (donde también se cambia esto y se puede enviar ya).",
    ajustes: {
      reporte_diario_activo: { etiqueta: "Enviar el reporte diario" },
      reporte_diario_correos: { etiqueta: "Enviarlo a", ayuda: "Correos separados por comas (por ejemplo, Gestión Humana). Vacío: no se envía." },
      reporte_diario_copia: { etiqueta: "Con copia a", ayuda: "Separados por comas. Vacío: sin copia." },
    },
  },
  {
    id: "alertas",
    titulo: "Alertas del reporte diario",
    detalle:
      "Si un indicador cruza su umbral, sale como alerta arriba del reporte diario (y el asunto lo dice) y en Candidatos › Indicadores, con una sugerencia para los anuncios, las promociones o el proceso. 0 apaga una alerta de mínimo; 100 %, una de máximo. Los porcentajes solo se calculan con suficientes casos (10 o más).",
    ajustes: Object.fromEntries(
      DEFINICIONES_ALERTAS.map((d) => [
        d.ajuste,
        {
          etiqueta: `${d.etiqueta}: ${d.tipo === "min" ? "alertar si es menor que" : "alertar si es mayor que"}`,
          ayuda: d.accion,
          sufijo: d.unidad === "porcentaje" ? "%" : undefined,
        },
      ])
    ),
  },
  {
    id: "psicotecnica",
    titulo: "Prueba psicosensotécnica (PsicoAlianza)",
    detalle: "Para Candidatos › Psicosensotécnica. Si el informe no trae el concepto escrito (Ethikos lo trae como imagen), sale del porcentaje con estos cortes; una persona lo confirma.",
    ajustes: {
      psico_corte_no_recomendado: { etiqueta: "No recomendado hasta", ayuda: "Un porcentaje igual o menor es «no recomendado» (no apto).", sufijo: "%" },
      psico_corte_con_sugerencias: { etiqueta: "Recomendado con sugerencias hasta", ayuda: "Entre el corte anterior y este, «recomendado con sugerencias» (apto con observaciones); por encima, «recomendado».", sufijo: "%" },
      psico_dias_para_presentar: { etiqueta: "Días para presentarla", ayuda: "Después de inscrito, si pasan más días sin resultado sale en rojo en «Esperando resultado»." },
    },
  },
  {
    id: "pruebas",
    titulo: "Entorno de pruebas",
    detalle: "Solo cuenta en el entorno de pruebas (copia de producción), donde los correos no salen a sus destinatarios reales. En producción no hace nada.",
    ajustes: {
      correos_prueba_desarrollo: {
        etiqueta: "Correos de prueba que sí reciben",
        ayuda: "Separados por comas. Lo que va a estas direcciones sale de verdad (por ejemplo, un laboratorio al que se le puso un correo de prueba); las demás se quitan del envío. También vale un dominio: @lacarolina.com.co.",
      },
      whatsapp_prueba_desarrollo: {
        etiqueta: "Números de WhatsApp de prueba que sí reciben",
        ayuda: "Separados por comas. Lo que va a estos números sale de verdad (por ejemplo, un laboratorio al que se le puso un número de prueba). Lo que respondan desde allí llega a producción, no aquí: la respuesta del laboratorio se escribe en el chat de prueba.",
      },
    },
  },
  {
    id: "politica",
    titulo: "Política de tratamiento de datos",
    detalle: "Completan la página pública /politica-de-datos y el enlace de la autorización. Lo que quede vacío se omite.",
    ajustes: {
      enlace_politica: { etiqueta: "Enlace a la política", ayuda: "Va en la autorización como {enlace_politica}. Sin enlace, la autorización se pide sin él." },
      empresa_razon_social: { etiqueta: "Razón social" },
      empresa_nit: { etiqueta: "NIT" },
      empresa_domicilio: { etiqueta: "Domicilio principal" },
      empresa_correo_datos: { etiqueta: "Correo para consultas y reclamos" },
      empresa_telefono_datos: { etiqueta: "Teléfono para consultas y reclamos" },
      politica_vigencia: { etiqueta: "Fecha de vigencia" },
    },
  },
];

const SUFIJO_UNIDAD: Record<string, string> = { horas: "horas", dias: "días", minutos: "min", porcentaje: "%" };

export interface FilaPresentada {
  ajuste: AjusteSeleccion;
  etiqueta: string;
  ayuda?: string;
  sufijo?: string;
}

export interface SeccionPresentada {
  id: string;
  titulo: string;
  detalle: string;
  filas: FilaPresentada[];
}

/**
 * Ajustes que se manejan en otra pantalla (no van en «Otros ajustes»). Los
 * modelos de lectura y transcripción pasaron a la pestaña IA de Selección (21-nov-2026)
 * y sus ajustes quedan sin uso.
 */
export const EN_OTRA_PANTALLA = new Set([
  "carta_banco_ruta", "carta_firmante", "carta_firmante_cargo", "laboratorio_reparto", "lectura_modelo", "transcripcion_modelo",
  // 25-nov-2026: las reglas de antecedentes tienen su pestaña (Selección › Antecedentes).
  ...SOLO_EN_ANTECEDENTES,
]);

/** Ajustes agrupados por sección, en el orden de la pantalla; los desconocidos van a «Otros ajustes». */
export function agruparAjustes(ajustes: AjusteSeleccion[]): SeccionPresentada[] {
  const porClave = new Map(ajustes.map((a) => [a.clave, a]));
  // La plantilla de la carta del banco se sube en la pestaña Laboratorios.
  const usadas = new Set<string>(EN_OTRA_PANTALLA);
  const secciones: SeccionPresentada[] = SECCIONES_AJUSTES.map((s) => ({
    id: s.id,
    titulo: s.titulo,
    detalle: s.detalle,
    filas: Object.entries(s.ajustes).flatMap(([clave, p]) => {
      const a = porClave.get(clave);
      if (!a) return [];
      usadas.add(clave);
      return [{ ajuste: a, etiqueta: p.etiqueta, ayuda: p.ayuda, sufijo: p.sufijo ?? SUFIJO_UNIDAD[a.unidad] }];
    }),
  }));
  const otros = ajustes
    .filter((a) => !usadas.has(a.clave))
    .sort((x, y) => x.orden - y.orden)
    .map((a) => ({ ajuste: a, etiqueta: a.nombre, sufijo: SUFIJO_UNIDAD[a.unidad] }));
  if (otros.length) secciones.push({ id: "otros", titulo: "Otros ajustes", detalle: "Ajustes nuevos que todavía no tienen sección.", filas: otros });
  return secciones.filter((s) => s.filas.length > 0);
}
