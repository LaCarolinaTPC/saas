/**
 * Indicadores de respuesta de los aspirantes (pendiente de la entrega 4,
 * pedido del 21-nov-2026): si contestan, cuánto tardan, hasta qué pregunta
 * llegan, si los recordatorios sirven y qué pasa con los que vienen
 * recomendados. Los de ./indicadores miden el proceso (embudo, etapas, costo);
 * estos, la conversación.
 *
 * Funciones puras: la lectura de la base está en indicadores-servidor.ts.
 * La cohorte son las conversaciones que empezaron en el periodo.
 */
import { tiempos, type Rango, type Tiempos } from "@/lib/comunicaciones/indicadores";
import type { Fila } from "./indicadores";

/** Firma de los recordatorios por silencio (comunicaciones/seguimiento-ejecutar.ts). */
export const FIRMA_RECORDATORIO = "Seguimiento automático";

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface ConversacionResp {
  id: string;
  created_at: string;
  proceso_id?: string | null;
  prefiltro?: Record<string, unknown> | null;
  /** Se marcó para Gestión Humana porque no respondió a los recordatorios. */
  seguimiento_escalado_at?: string | null;
}

export interface MensajeResp {
  conversacion_id: string;
  direccion: string;
  enviado_por?: string | null;
  timestamp: string;
}

export interface ProcesoResp {
  id: string;
  created_at: string;
  estado: string;
  cedula?: string | null;
  origen?: string | null;
  recomendado?: boolean | null;
  recomendado_at?: string | null;
}

export interface CitaResp {
  proceso_id: string;
  tipo: string;
  estado: string;
  created_at: string;
  confirmada_at?: string | null;
  recordatorio_at?: string | null;
  reprogramada_por?: string | null;
}

/** Registro vigente en el Plan Padrino, por cédula del referido. */
export interface ReferidoResp {
  cedula_referido: string;
  created_at: string;
}

export interface EntradaRespuesta {
  rango: Rango;
  conversaciones: ConversacionResp[];
  mensajes: MensajeResp[];
  /** Procesos enlazados a esas conversaciones. */
  procesos: ProcesoResp[];
  /** Citas de esos procesos. */
  citas: CitaResp[];
  /** Registros del Plan Padrino de las cédulas de esos procesos. */
  referidos: ReferidoResp[];
  faltantes: string[];
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface RecordatorioNumero {
  numero: number;
  enviados: number;
  respondidos: number;
  pct: number | null;
}

export interface IndicadoresRespuesta {
  /** Conversaciones de aspirantes a las que les escribimos al menos una vez. */
  base: number;
  /** Las que nos escribieron de nuevo después de nuestro primer mensaje. */
  respondieron: number;
  pctRespondieron: number | null;
  /** Cuántos llegaron a responder cada pregunta, en el orden en que se hacen. */
  preguntas: Fila[];
  tiempos: {
    /** Lo que tarda el aspirante en contestar un mensaje nuestro. */
    respuestaAspirante: Tiempos;
    /** Del primer mensaje al registro como candidato (cédula y autorización). */
    hastaRegistro: Tiempos;
    /** Del registro a la primera cita. */
    hastaPrimeraCita: Tiempos;
  };
  recordatorios: {
    /** Conversaciones que recibieron al menos un recordatorio por silencio. */
    conversaciones: number;
    /** De esas, las que volvieron a escribir después de alguno. */
    volvieron: number;
    pctVolvieron: number | null;
    /** De las que volvieron, las que quedaron registradas como candidatos. */
    volvieronYRegistraron: number;
    /** Las que no respondieron y quedaron para una persona. */
    escaladas: number;
    enviados: number;
    porNumero: RecordatorioNumero[];
    /** Del recordatorio que funcionó a la respuesta. */
    tiempoRespuesta: Tiempos;
  };
  citas: {
    /** Citas a las que se les envió el recordatorio. */
    recordadas: number;
    confirmaron: number;
    pidieronOtraFecha: number;
    sinRespuesta: number;
    /** Asistencia de las ya cumplidas, según confirmaron o no. */
    asistenciaConfirmadas: { citas: number; asistieron: number; pct: number | null };
    asistenciaSinConfirmar: { citas: number; asistieron: number; pct: number | null };
  };
  recomendados: {
    /** Respuesta a «¿vienes recomendado?» entre las conversaciones de la base. */
    si: number;
    no: number;
    sinResponder: number;
    /** Candidatos (con proceso) que vienen recomendados. */
    apadrinados: number;
    conPadrino: number;
    sinPadrino: number;
    /** De que lo dijo a que Gestión Humana le asignó el padrino. */
    tiempoHastaPadrino: Tiempos;
    contratacion: { recomendados: { n: number; contratados: number; pct: number | null }; resto: { n: number; contratados: number; pct: number | null } };
  };
  faltantes: string[];
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

const pct = (parte: number, total: number): number | null => (total > 0 ? (parte / total) * 100 : null);
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const tiene = (v: unknown) => v !== null && v !== undefined && v !== "" && v !== false;

/** Preguntas del asistente, en su orden, y cómo saber en el prefiltro que la respondió. */
const PREGUNTAS: { clave: string; etiqueta: string; respondio: (p: Record<string, unknown>) => boolean }[] = [
  { clave: "ciudad", etiqueta: "Ciudad donde vive", respondio: (p) => tiene(p.ciudad) },
  { clave: "edad", etiqueta: "Edad o fecha de nacimiento", respondio: (p) => tiene(p.edad) || tiene(p.fecha_nacimiento) },
  { clave: "cedula", etiqueta: "Cédula", respondio: (p) => tiene(p.cedula) },
  { clave: "recomendado", etiqueta: "Si viene recomendado", respondio: (p) => p.recomendado === true || p.recomendado === false },
  { clave: "autorizacion", etiqueta: "Autorización de datos", respondio: (p) => p.autorizacion === "si" || p.autorizacion === "no" },
  { clave: "experiencia", etiqueta: "Experiencia", respondio: (p) => typeof p.experiencia_meses === "number" },
  { clave: "disponibilidad", etiqueta: "Desde cuándo puede empezar", respondio: (p) => tiene(p.disponibilidad) },
  { clave: "hoja_vida", etiqueta: "Hoja de vida", respondio: (p) => p.hoja_vida === true },
];

export function calcularIndicadoresRespuesta(e: EntradaRespuesta): IndicadoresRespuesta {
  const porConversacion = new Map<string, MensajeResp[]>();
  for (const m of e.mensajes) {
    const lista = porConversacion.get(m.conversacion_id);
    if (lista) lista.push(m);
    else porConversacion.set(m.conversacion_id, [m]);
  }
  // Por hora real, no por texto: las fechas llegan con y sin fracción de segundo
  // y comparadas como texto se desordenan. Con la misma hora se conserva el orden de la base.
  for (const lista of porConversacion.values()) lista.sort((a, b) => ms(a.timestamp) - ms(b.timestamp));

  const procesoPorId = new Map(e.procesos.filter((p) => p.origen !== "chat_prueba").map((p) => [p.id, p]));

  // La base: aspirantes (no «otros temas») a los que les escribimos al menos una vez.
  const base = e.conversaciones.filter(
    (c) => c.prefiltro?.busca_trabajo !== false && (porConversacion.get(c.id) ?? []).some((m) => m.direccion === "saliente")
  );

  let respondieron = 0;
  const esperas: number[] = [];
  const esperasRecordatorio: number[] = [];
  const porNumero = new Map<number, { enviados: number; respondidos: number }>();
  let recordadas = 0;
  let volvieron = 0;
  let volvieronYRegistraron = 0;
  let escaladas = 0;
  let enviados = 0;

  for (const c of base) {
    const msgs = porConversacion.get(c.id) ?? [];
    let vioSaliente = false;
    let respondio = false;
    let ultimoSaliente: MensajeResp | null = null;
    let racha = 0; // recordatorios seguidos desde su último mensaje
    let tuvoRecordatorio = false;
    let volvio = false;
    for (const m of msgs) {
      if (m.direccion === "saliente") {
        vioSaliente = true;
        ultimoSaliente = m;
        if (m.enviado_por === FIRMA_RECORDATORIO) {
          racha += 1;
          tuvoRecordatorio = true;
          enviados += 1;
          const n = porNumero.get(racha) ?? { enviados: 0, respondidos: 0 };
          n.enviados += 1;
          porNumero.set(racha, n);
        }
        continue;
      }
      // Entrante: cuenta como respuesta solo el primero después de algo nuestro.
      if (vioSaliente) respondio = true;
      if (ultimoSaliente) {
        const espera = ms(m.timestamp) - ms(ultimoSaliente.timestamp);
        if (Number.isFinite(espera) && espera >= 0) {
          esperas.push(espera);
          // Respondió al último recordatorio de la racha (los anteriores no funcionaron).
          if (ultimoSaliente.enviado_por === FIRMA_RECORDATORIO && racha > 0) {
            porNumero.get(racha)!.respondidos += 1;
            esperasRecordatorio.push(espera);
            volvio = true;
          }
        }
      }
      ultimoSaliente = null;
      racha = 0;
    }
    if (respondio) respondieron += 1;
    if (tuvoRecordatorio) {
      recordadas += 1;
      if (volvio) {
        volvieron += 1;
        if (c.proceso_id && procesoPorId.has(c.proceso_id)) volvieronYRegistraron += 1;
      } else if (c.seguimiento_escalado_at) {
        escaladas += 1;
      }
    }
  }

  const preguntas: Fila[] = PREGUNTAS.map((q) => ({
    clave: q.clave,
    etiqueta: q.etiqueta,
    n: base.filter((c) => c.prefiltro && q.respondio(c.prefiltro)).length,
  }));

  // Del primer mensaje al registro, y del registro a la primera cita.
  const hastaRegistro: number[] = [];
  for (const c of base) {
    const p = c.proceso_id ? procesoPorId.get(c.proceso_id) : null;
    if (!p || p.origen !== "whatsapp_agente") continue;
    const d = ms(p.created_at) - ms(c.created_at);
    if (Number.isFinite(d) && d >= 0) hastaRegistro.push(d);
  }
  const primeraCita = new Map<string, string>();
  for (const cita of e.citas) {
    const actual = primeraCita.get(cita.proceso_id);
    if (!actual || cita.created_at < actual) primeraCita.set(cita.proceso_id, cita.created_at);
  }
  const hastaPrimeraCita: number[] = [];
  for (const [id, creada] of primeraCita) {
    const p = procesoPorId.get(id);
    if (!p) continue;
    const d = ms(creada) - ms(p.created_at);
    if (Number.isFinite(d) && d >= 0) hastaPrimeraCita.push(d);
  }

  // Citas con recordatorio: qué respondieron y si asistieron.
  const citasRecordadas = e.citas.filter((c) => c.recordatorio_at && procesoPorId.has(c.proceso_id));
  const confirmo = (c: CitaResp) => Boolean(c.confirmada_at) || c.estado === "confirmada";
  const pidioOtra = (c: CitaResp) => !confirmo(c) && (c.estado === "pide_otra_fecha" || (c.estado === "reprogramada" && c.reprogramada_por === "aspirante"));
  const cumplidas = citasRecordadas.filter((c) => c.estado === "asistio" || c.estado === "no_asistio");
  const asistencia = (lista: CitaResp[]) => {
    const asistieron = lista.filter((c) => c.estado === "asistio").length;
    return { citas: lista.length, asistieron, pct: pct(asistieron, lista.length) };
  };

  // Recomendados.
  const si = base.filter((c) => c.prefiltro?.recomendado === true).length;
  const no = base.filter((c) => c.prefiltro?.recomendado === false).length;
  const procesosBase = [...new Set(base.map((c) => c.proceso_id).filter((id): id is string => Boolean(id)))]
    .map((id) => procesoPorId.get(id))
    .filter((p): p is ProcesoResp => Boolean(p));
  const apadrinados = procesosBase.filter((p) => p.recomendado === true);
  const referidoDe = new Map(e.referidos.map((r) => [r.cedula_referido.trim(), r]));
  const hastaPadrino: number[] = [];
  let conPadrino = 0;
  for (const p of apadrinados) {
    const r = p.cedula ? referidoDe.get(p.cedula.trim()) : undefined;
    if (!r) continue;
    conPadrino += 1;
    const d = ms(r.created_at) - ms(p.recomendado_at ?? p.created_at);
    if (Number.isFinite(d) && d >= 0) hastaPadrino.push(d);
  }
  const contratacion = (lista: ProcesoResp[]) => {
    const contratados = lista.filter((p) => p.estado === "contratado").length;
    return { n: lista.length, contratados, pct: pct(contratados, lista.length) };
  };

  return {
    base: base.length,
    respondieron,
    pctRespondieron: pct(respondieron, base.length),
    preguntas,
    tiempos: {
      respuestaAspirante: tiempos(esperas),
      hastaRegistro: tiempos(hastaRegistro),
      hastaPrimeraCita: tiempos(hastaPrimeraCita),
    },
    recordatorios: {
      conversaciones: recordadas,
      volvieron,
      pctVolvieron: pct(volvieron, recordadas),
      volvieronYRegistraron,
      escaladas,
      enviados,
      porNumero: [...porNumero.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([numero, n]) => ({ numero, enviados: n.enviados, respondidos: n.respondidos, pct: pct(n.respondidos, n.enviados) })),
      tiempoRespuesta: tiempos(esperasRecordatorio),
    },
    citas: {
      recordadas: citasRecordadas.length,
      confirmaron: citasRecordadas.filter(confirmo).length,
      pidieronOtraFecha: citasRecordadas.filter(pidioOtra).length,
      sinRespuesta: citasRecordadas.filter((c) => !confirmo(c) && !pidioOtra(c)).length,
      asistenciaConfirmadas: asistencia(cumplidas.filter(confirmo)),
      asistenciaSinConfirmar: asistencia(cumplidas.filter((c) => !confirmo(c))),
    },
    recomendados: {
      si,
      no,
      sinResponder: base.length - si - no,
      apadrinados: apadrinados.length,
      conPadrino,
      sinPadrino: apadrinados.length - conPadrino,
      tiempoHastaPadrino: tiempos(hastaPadrino),
      contratacion: {
        recomendados: contratacion(apadrinados),
        resto: contratacion(procesosBase.filter((p) => p.recomendado !== true)),
      },
    },
    faltantes: e.faltantes,
  };
}
