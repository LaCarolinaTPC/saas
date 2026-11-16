/**
 * Reactivación de aspirantes fríos (requerimiento J1). Reglas puras: a quien
 * dejó de responder sin enviar la hoja de vida se le escribe un primer aviso,
 * luego un segundo, después se pasa a llamada y al final se cierra el proceso
 * como «Incomunicado». Si responde en cualquier momento, la secuencia vuelve a
 * empezar. Los avisos salen solo en horario permitido (NF8) y, fuera de la
 * ventana de 24 h, solo con plantilla aprobada (NF2).
 */
import { enHorario } from "@/lib/comunicaciones/seguimiento";

export interface TiemposReactivacion {
  aviso1Horas: number;
  aviso2Horas: number;
  llamarHoras: number;
  incomunicadoDias: number;
  horaDesde: string;
  horaHasta: string;
}

export const TIEMPOS_REACTIVACION_POR_DEFECTO: TiemposReactivacion = {
  aviso1Horas: 24,
  aviso2Horas: 72,
  llamarHoras: 24,
  incomunicadoDias: 7,
  horaDesde: "07:00",
  horaHasta: "20:00",
};

export interface ConversacionReactivacion {
  ultimoMensajeAt: string;
  ultimoEntranteAt: string | null;
  /** El último mensaje del chat es nuestro. */
  ultimoEsNuestro: boolean;
  cerrada: boolean;
  /** 0 nada · 1 primer aviso · 2 segundo aviso · 3 para llamar · 4 cerrado por incomunicado. */
  paso: number;
  /** Cuándo se dio el último paso de la reactivación. */
  ultimoPasoAt: string | null;
  hojaVidaRecibida: boolean;
  /** Estado del proceso enlazado; null si todavía no hay proceso. */
  procesoEstado: string | null;
  /** false si la extracción vio que no busca trabajo (empleado, pasajero, otro tema). */
  buscaTrabajo: boolean;
  /** La conversación pasó por el asistente de selección (hay prefiltro o proceso). */
  esAspirante: boolean;
}

export type AccionReactivacion = "reiniciar" | "aviso1" | "aviso2" | "llamar" | "incomunicado" | null;

const HORA = 3_600_000;
const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** ¿El aspirante escribió después del último paso? Entonces la secuencia vuelve a cero. */
export function respondioDespues(c: Pick<ConversacionReactivacion, "ultimoEntranteAt" | "ultimoPasoAt" | "paso">): boolean {
  if (c.paso === 0) return false;
  const ent = ms(c.ultimoEntranteAt);
  const paso = ms(c.ultimoPasoAt);
  return Number.isFinite(ent) && Number.isFinite(paso) && ent > paso;
}

/** Siguiente acción de la reactivación para esta conversación, o null si no toca nada. */
export function accionReactivacion(c: ConversacionReactivacion, ahora: Date, t: TiemposReactivacion): AccionReactivacion {
  if (respondioDespues(c)) return "reiniciar";
  if (c.cerrada || !c.esAspirante || !c.buscaTrabajo || c.hojaVidaRecibida) return null;
  // Solo en preselección: más adelante el proceso lo lleva Gestión Humana.
  if (c.procesoEstado && c.procesoEstado !== "pendiente") return null;

  const transcurrido = (iso: string | null) => ahora.getTime() - ms(iso);
  const enHora = enHorario(ahora, t.horaDesde, t.horaHasta);

  switch (c.paso) {
    case 0:
      // 24 h sin respuesta a lo último que le dijimos.
      if (!c.ultimoEsNuestro || !enHora) return null;
      return transcurrido(c.ultimoMensajeAt) >= t.aviso1Horas * HORA ? "aviso1" : null;
    case 1:
      if (!enHora) return null;
      return transcurrido(c.ultimoPasoAt) >= t.aviso2Horas * HORA ? "aviso2" : null;
    case 2:
      return transcurrido(c.ultimoPasoAt) >= t.llamarHoras * HORA ? "llamar" : null;
    case 3: {
      // Días sin respuesta contados desde su último mensaje (o desde el primer aviso si nunca escribió después).
      const desde = c.ultimoEntranteAt ?? c.ultimoMensajeAt;
      return transcurrido(desde) >= t.incomunicadoDias * 24 * HORA ? "incomunicado" : null;
    }
    default:
      return null;
  }
}

/** Tiempos desde las filas de seleccion_ajustes y el horario de wa_seguimiento. */
export function tiemposDesdeAjustes(
  filas: { clave: string; valor: unknown }[],
  horario: { horaDesde: string; horaHasta: string }
): TiemposReactivacion {
  const m = new Map(filas.map((f) => [f.clave, Number(f.valor)]));
  const d = TIEMPOS_REACTIVACION_POR_DEFECTO;
  const num = (k: string, def: number) => {
    const v = m.get(k);
    return v !== undefined && Number.isFinite(v) && v > 0 ? v : def;
  };
  return {
    aviso1Horas: num("reactivacion_aviso1_horas", d.aviso1Horas),
    aviso2Horas: num("reactivacion_aviso2_horas", d.aviso2Horas),
    llamarHoras: num("reactivacion_llamar_horas", d.llamarHoras),
    incomunicadoDias: num("incomunicado_dias", d.incomunicadoDias),
    horaDesde: horario.horaDesde,
    horaHasta: horario.horaHasta,
  };
}
