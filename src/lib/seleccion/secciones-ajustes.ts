/**
 * Cómo se muestran los ajustes de la selección en Tiempos y reglas: agrupados
 * por etapa del proceso, con un nombre corto, una ayuda y la unidad junto al
 * campo. Los nombres largos de la base quedan de respaldo para los ajustes que
 * no estén aquí (van a «Otros ajustes»). Puro: lo usa la pantalla y se prueba.
 */
import type { AjusteSeleccion } from "./ajustes";

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
    },
  },
  {
    id: "verificaciones",
    titulo: "Verificaciones con Croma",
    detalle:
      "Qué consultas son obligatorias para avanzar. Si una no lo es y Croma no la responde, el proceso sigue con la observación de que falta.",
    ajustes: {
      simit_obligatorio: { etiqueta: "SIMIT obligatorio", ayuda: "Para pasar a antecedentes." },
      rnmc_obligatorio: { etiqueta: "RNMC obligatorio", ayuda: "Para quedar «Listo para citar»." },
      policia_obligatorio: { etiqueta: "Policía obligatoria", ayuda: "Para quedar «Listo para citar»." },
      procuraduria_obligatorio: { etiqueta: "Procuraduría obligatoria", ayuda: "Para quedar «Listo para citar»." },
      contraloria_obligatorio: { etiqueta: "Contraloría obligatoria", ayuda: "Para quedar «Listo para citar»." },
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
      laboratorio_nombre: { etiqueta: "Laboratorio", ayuda: "Nombre y dirección. Va en la orden de exámenes como {laboratorio}." },
      rutas_minimas: { etiqueta: "Rutas del reconocimiento de ruta", ayuda: "Las que debe aprender.", sufijo: "rutas" },
      documentos_pendientes_dias: { etiqueta: "Recordatorio de documentos pendientes", ayuda: "Días para recordarle lo que falta en la carpeta." },
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

const SUFIJO_UNIDAD: Record<string, string> = { horas: "horas", dias: "días", minutos: "min" };

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

/** Ajustes agrupados por sección, en el orden de la pantalla; los desconocidos van a «Otros ajustes». */
export function agruparAjustes(ajustes: AjusteSeleccion[]): SeccionPresentada[] {
  const porClave = new Map(ajustes.map((a) => [a.clave, a]));
  const usadas = new Set<string>();
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
