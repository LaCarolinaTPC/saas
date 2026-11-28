/**
 * Contrato entre la vista del profesor y sus acciones. La misma pantalla se
 * usa en /profesor (acciones reales, permiso `profesor.*`) y en Candidatos ›
 * Selección (acciones de prueba, solo candidatos del chat de prueba).
 */
import type { AjustesAgenda, Cita, ExcepcionProfesor } from "@/lib/seleccion/agenda";
import type { ResultadoAgenda, ResultadoDisponibilidad, ResultadoReprogramarDia, VistaCitacion } from "@/lib/seleccion/agenda-servidor";
import type {
  ExamenesElegidos,
  HistorialProfesor,
  PendientesProfesor,
  PlanExamenes,
  RegistroProfesor,
  ResultadoClase,
  ResultadoProfesor,
  ResultadoPrueba,
  ResultadoRuta,
  SiNoSinTomar,
} from "@/lib/seleccion/profesor-servidor";

export interface DatosPrueba {
  resultado: ResultadoPrueba;
  rutaEscrita?: SiNoSinTomar | null;
  partesMotor?: SiNoSinTomar | null;
  clasesSugeridas?: number | null;
  observacion?: string | null;
}
export interface DatosClase {
  resultado: ResultadoClase;
  observacion?: string | null;
  /** false = no llegó a la clase. */
  asistio?: boolean;
  /** Clases que el profesor calcula que le faltan después de esta. */
  clasesFaltantes?: number | null;
}
export interface DatosRuta {
  ruta: string;
  resultado: ResultadoRuta;
  observacion?: string | null;
}
/** Las rutas de un día, en un solo guardado (23-nov-2026). */
export interface DatosRutasDia {
  salidas: { ruta: string; resultado: "aprendida" | "repetir" }[];
  observacion?: string | null;
}
export interface DatosConcepto {
  concepto: "acepta" | "rechaza";
  nota?: string | null;
}
export interface DatosDisponibilidad {
  fecha: string;
  disponible: boolean;
  hora?: string | null;
  motivo?: string | null;
  nota?: string | null;
}

export interface AccionesDisponibilidad {
  listar(desde: string, hasta: string): Promise<ExcepcionProfesor[]>;
  guardar(ex: DatosDisponibilidad): Promise<ResultadoDisponibilidad>;
  quitar(fecha: string): Promise<{ ok: boolean; error?: string }>;
  reprogramarDia(fecha: string): Promise<ResultadoReprogramarDia>;
}

export interface AccionesProfesor {
  pendientes(fecha: string): Promise<PendientesProfesor>;
  historial(procesoId: string): Promise<HistorialProfesor>;
  rutas(): Promise<string[]>;
  cita(citaId: string, accion: "llego" | "no_asistio" | "deshacer"): Promise<ResultadoAgenda>;
  prueba(procesoId: string, d: DatosPrueba): Promise<ResultadoProfesor>;
  clase(procesoId: string, d: DatosClase): Promise<ResultadoProfesor>;
  ruta(procesoId: string, d: DatosRuta): Promise<ResultadoProfesor>;
  /** Varias rutas del día: un solo mensaje (o ninguno) al final. */
  rutasDia(procesoId: string, d: DatosRutasDia): Promise<ResultadoProfesor>;
  /** Lo que haría «Listo para exámenes», sin hacerlo. */
  planExamenes(procesoId: string): Promise<PlanExamenes>;
  /** «Listo para exámenes»: cita al laboratorio y envía el mensaje con la carta. */
  /** Sin `elegidos`, el día y el laboratorio del plan; con ellos, lo que eligió el profesor. */
  examenes(procesoId: string, elegidos?: ExamenesElegidos | null): Promise<ResultadoProfesor>;
  deshacer(procesoId: string, tipo: RegistroProfesor["tipo"], id: string): Promise<ResultadoProfesor>;
  observacion(procesoId: string, texto: string): Promise<ResultadoProfesor>;
  concepto(procesoId: string, d: DatosConcepto): Promise<ResultadoProfesor>;
  disponibilidad: AccionesDisponibilidad;
}

/** Aviso entre el chat de prueba y el marco del profesor (misma página): algo cambió o hay un mensaje para el aspirante. */
export const EVENTO_PRUEBA = "seleccion-prueba";
export interface AvisoPrueba {
  /** Mensaje que le llegaría al aspirante (se muestra en el chat de prueba). */
  texto?: string;
  /** Candidato al que va el mensaje: con varios chats de prueba, solo lo muestra el suyo. */
  procesoId?: string;
  /** Chat al que va (simulador del cron: el silencio de un aspirante que todavía no es candidato). */
  idChat?: number;
  /** Nota de Gestivo para quien prueba (no es un mensaje al aspirante ni entra a la conversación). */
  nota?: string;
  etiqueta?: string;
  /** Mensaje del catálogo: con él, el chat de prueba muestra los botones de su plantilla. */
  clave?: string;
  /** Documentos que le llegarían por WhatsApp (orden de exámenes, carta del banco). */
  adjuntos?: string[];
}
export function avisarPrueba(detalle: AvisoPrueba = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<AvisoPrueba>(EVENTO_PRUEBA, { detail: detalle }));
}

export const ETIQUETA_MENSAJE: Record<string, string> = {
  citacion: "Citación",
  cita_reprogramada: "Cita reprogramada",
  cita_movida_empresa: "Cita movida por la empresa",
  // Desde el 23-nov-2026 la orden va solo al laboratorio; al aspirante, la cita y la carta del banco.
  examenes_fase1: "Cita de exámenes, fase 1",
  inasistencia: "Aviso de inasistencia (borrador para revisar)",
  recordatorio_cita: "Recordatorio de la cita",
  escuela: "Recordatorio de escuela",
  examenes_fase2: "Paso a la fase 2 de exámenes",
  reconocimiento_ruta: "Reconocimiento de ruta",
  reconocimiento_siguiente: "Siguiente salida de reconocimiento de ruta",
  recordatorio_reconocimiento: "Recordatorio del reconocimiento de ruta",
  inasistencia_reconocimiento: "Aviso de inasistencia al reconocimiento (borrador para revisar)",
  reconocimiento_reprogramado: "Reconocimiento de ruta reprogramado",
  // Respuestas a las preguntas del mensaje de exámenes (27-nov-2026).
  banco_si: "Respuesta: tiene cuenta en el Banco de Bogotá",
  banco_no: "Respuesta: no tiene cuenta (va la carta del banco)",
  reconocimiento_aviso: "Aviso del reconocimiento de ruta (¿cuántas rutas conoce?)",
  rutas_suficientes: "Respuesta: conoce las rutas suficientes",
  rutas_faltan: "Respuesta: debe hacer el reconocimiento de rutas",
  pedir_correo: "Pedido del correo para la psicotécnica",
};

// ── Citar ──────────────────────────────────────────────────────────────────

export interface DatosCitar {
  propuesta: { fecha: string; hora: string };
  vista: VistaCitacion | null;
  /** Cita de prueba de manejo que sigue en pie (citar la reprograma). */
  vigente: Cita | null;
  excepciones: ExcepcionProfesor[];
  /** Horas configuradas, para proponer la hora al cambiar el día. */
  ajustes: AjustesAgenda;
}

export interface AccionesCitar {
  datos(procesoId: string): Promise<DatosCitar>;
  vista(procesoId: string, cuando: { fecha: string; hora: string }, reprogramar: boolean, por?: "aspirante" | "empresa"): Promise<VistaCitacion | null>;
  /** `textoPropio`: el mensaje ajustado para este aspirante (solo sale así con la ventana de 24 h abierta). */
  citar(procesoId: string, cuando: { fecha: string; hora: string }, textoPropio?: string | null): Promise<ResultadoAgenda>;
  reprogramar(citaId: string, cuando: { fecha: string; hora: string }, por: "aspirante" | "empresa", textoPropio?: string | null): Promise<ResultadoAgenda>;
}

/** Cómo quedó el envío, en palabras. */
export function textoEnvio(envio: string | undefined): string {
  switch (envio) {
    case "enviado":
      return "Mensaje enviado por WhatsApp.";
    case "borrador":
      return "El mensaje quedó como borrador en la bandeja (han pasado más de 24 horas o es de revisar): envíalo desde Comunicaciones.";
    case "prueba":
      return "Candidato de prueba: el mensaje aparece en el chat de prueba, no sale por WhatsApp.";
    case "sin_conversacion":
      return "No tiene celular ni conversación de WhatsApp: hay que avisarle por otro medio.";
    case "sin_plantilla":
    case "falta_dato":
      return "No se pudo enviar (falta la plantilla aprobada o un dato del mensaje): avísale por otro medio.";
    case "sin_catalogo":
      return "El mensaje no está en el catálogo de Selección.";
    case "fallido":
      return "WhatsApp rechazó el envío: revisa la conversación en Comunicaciones.";
    default:
      return "";
  }
}
