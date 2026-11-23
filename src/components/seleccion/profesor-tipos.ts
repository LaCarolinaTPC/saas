/**
 * Contrato entre la vista del profesor y sus acciones. La misma pantalla se
 * usa en /profesor (acciones reales, permiso `profesor.*`) y en Candidatos ›
 * Selección (acciones de prueba, solo candidatos del chat de prueba).
 */
import type { AjustesAgenda, Cita, ExcepcionProfesor } from "@/lib/seleccion/agenda";
import type { ResultadoAgenda, ResultadoDisponibilidad, ResultadoReprogramarDia, VistaCitacion } from "@/lib/seleccion/agenda-servidor";
import type {
  HistorialProfesor,
  PendientesProfesor,
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
  citar(procesoId: string, cuando: { fecha: string; hora: string }): Promise<ResultadoAgenda>;
  reprogramar(citaId: string, cuando: { fecha: string; hora: string }, por: "aspirante" | "empresa"): Promise<ResultadoAgenda>;
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
