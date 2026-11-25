/**
 * Indicadores de Comunicaciones (WhatsApp): cálculo puro, sin base de datos.
 *
 * Entra lo que ya se leyó del periodo (conversaciones creadas en él, sus
 * mensajes, las ejecuciones del agente y los procesos creados desde el chat)
 * y sale un objeto con los números. La lectura vive en
 * `indicadores-servidor.ts`; aquí todo se puede probar con datos inventados.
 *
 * Reglas que conviene tener presentes:
 * - Los días se cuentan en hora de Bogotá (UTC−5, sin horario de verano).
 * - Un saliente lo escribió el asistente si `generado_por_ia`; un aviso
 *   automático (seguimiento o reactivación) si lo firmó el sistema; si no, una
 *   persona de Gestión Humana. Una plantilla puede ser de cualquiera de los dos
 *   últimos: cuenta como plantilla en el volumen y como de quien la envió para
 *   saber quién atendió.
 * - Un mensaje que WhatsApp rechazó (`estado = failed`) no es una respuesta.
 * - Sin datos, los indicadores van en null: la vista muestra «—», no un 0.
 */

import { CAUSAS_PRESELECCION } from "@/lib/contratacion/constants";

// ── Entrada ──────────────────────────────────────────────────────────────────

export type MotivoPausa = "humano" | "solicitud" | "agente" | "manual";

export interface ConversacionFila {
  id: string;
  created_at: string;
  requiere_humano?: boolean | null;
  agente_pausado?: boolean | null;
  agente_motivo_pausa?: string | null;
  agente_pausado_at?: string | null;
  proceso_id?: string | null;
  prefiltro?: Record<string, unknown> | null;
  reactivacion_paso?: number | null;
  reactivacion_ultimo_at?: string | null;
}

export interface MensajeFila {
  conversacion_id: string;
  direccion: string;
  generado_por_ia?: boolean | null;
  plantilla?: string | null;
  enviado_por?: string | null;
  estado?: string | null;
  timestamp: string;
}

export interface EjecucionFila {
  conversacion_id?: string | null;
  created_at: string;
  modelo_usado?: string | null;
  modelo_solicitado?: string | null;
  proveedor?: string | null;
  tokens_entrada?: number | null;
  tokens_salida?: number | null;
  duracion_ms?: number | null;
  resultado: string;
  error?: string | null;
}

export interface ProcesoFila {
  id: string;
  created_at: string;
  preseleccion?: { global?: string | null; incumplido?: string | null } | null;
  requisito_incumplido?: string | null;
  autorizacion_datos?: unknown;
  hoja_vida_recibida_at?: string | null;
}

/** Rango en fechas de Bogotá (YYYY-MM-DD), ambos extremos incluidos. */
export interface Rango {
  desde: string;
  hasta: string;
}

export interface EntradaIndicadores {
  rango: Rango;
  conversaciones: ConversacionFila[];
  /** Mensajes de las conversaciones del periodo (y de las que esperan a una persona). */
  mensajes: MensajeFila[];
  ejecuciones?: EjecucionFila[];
  procesos?: ProcesoFila[];
  /** Procesos enlazados a las conversaciones del periodo, vengan o no del chat (para el embudo). */
  vinculados?: ProcesoFila[];
  /**
   * Conversaciones marcadas para una persona (o pausadas por transferencia)
   * en las que el aspirante escribió en los últimos 30 días, se hayan creado
   * cuando se hayan creado. Sus mensajes deben venir en `mensajes`.
   */
  marcadas?: ConversacionFila[];
  /** Columnas o tablas que no existen en esta base: sus secciones se omiten. */
  faltantes?: string[];
  /** Quién atendió y tipo de conversación: todo se calcula solo con las que cumplen. */
  filtros?: Filtros;
}

// ── Filtros ──────────────────────────────────────────────────────────────────

/** Clasificación de «Quién atiende» de una conversación en la que el aspirante escribió. */
export type ClaseAtencion = "solo_asistente" | "asistente_persona" | "solo_persona" | "sin_respuesta";
export type FiltroAtendio = "todas" | ClaseAtencion | "pase_sin_respuesta";
export type FiltroTipo = "todas" | "aspirantes" | "otros";

export interface Filtros {
  atendio?: FiltroAtendio;
  tipo?: FiltroTipo;
}

export const OPCIONES_ATENDIO: { valor: FiltroAtendio; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "solo_asistente", etiqueta: "Solo el asistente" },
  { valor: "asistente_persona", etiqueta: "Asistente y una persona" },
  { valor: "solo_persona", etiqueta: "Solo una persona" },
  { valor: "sin_respuesta", etiqueta: "Sin respuesta" },
  { valor: "pase_sin_respuesta", etiqueta: "Pasadas a una persona, sin respuesta" },
];

export const OPCIONES_TIPO: { valor: FiltroTipo; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "aspirantes", etiqueta: "Aspirantes" },
  { valor: "otros", etiqueta: "Otros temas" },
];

/** Valor de la URL → filtro; lo que no se reconozca vuelve a «todas». */
export function leerFiltroAtendio(v: string | undefined): FiltroAtendio {
  return OPCIONES_ATENDIO.find((o) => o.valor === v)?.valor ?? "todas";
}
export function leerFiltroTipo(v: string | undefined): FiltroTipo {
  return OPCIONES_TIPO.find((o) => o.valor === v)?.valor ?? "todas";
}

/**
 * «Otros temas»: el asistente leyó la conversación y concluyó que no busca
 * trabajo (vende algo, es trabajador, pasajero, número equivocado). Sin esa
 * lectura cuenta como aspirante.
 */
export function esOtroTema(c: ConversacionFila): boolean {
  return c.prefiltro?.busca_trabajo === false;
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface Tiempos {
  /** Cuántos casos entran en el cálculo. */
  n: number;
  /** Milisegundos; null sin casos. */
  mediana: number | null;
  p90: number | null;
}

export interface Conteo {
  clave: string;
  etiqueta: string;
  n: number;
}

export interface Indicadores {
  rango: Rango & { dias: number };
  volumen: {
    conversacionesNuevas: number;
    porDia: { fecha: string; etiqueta: string; conversaciones: number }[];
    recibidos: number;
    enviados: number;
    enviadosPor: { asistente: number; gestionHumana: number; plantilla: number; automatico: number };
  };
  atencion: {
    /** Conversaciones del periodo en las que el aspirante escribió al menos una vez. */
    base: number;
    soloAsistente: number;
    asistenteYPersona: number;
    soloPersona: number;
    sinRespuesta: number;
    /** % de `base`; null si no hay base. */
    pctSoloAsistente: number | null;
  };
  pases: {
    total: number;
    porMotivo: { solicitud: number; agente: number; falla: number; manual: number };
    respondidos: number;
    sinRespuesta: number;
    /** Desde el pase hasta el primer mensaje de una persona. */
    tiempoHastaPersona: Tiempos;
  };
  primeraRespuesta: { general: Tiempos; asistente: Tiempos; persona: Tiempos };
  esperandoAhora: number;
  asistente: {
    ejecuciones: number;
    respondido: number;
    transferido: number;
    error: number;
    errores: Conteo[];
    duracion: Tiempos;
    tokensEntrada: number;
    tokensSalida: number;
    modelos: Conteo[];
  };
  seleccion: {
    disponible: boolean;
    embudo: Conteo[];
    procesos: number;
    semaforo: { pasa: number; no_cumple: number; incompleto: number; sin_evaluar: number };
    causas: Conteo[];
  };
  reactivacion: { disponible: boolean; avisados: number; volvieron: number };
  faltantes: string[];
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;
/** Colombia está en UTC−5 todo el año. */
const DESFASE_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** Firmas de los avisos automáticos (seguimiento-ejecutar.ts y seleccion/envio.ts). */
export const FIRMAS_AUTOMATICAS = new Set(["Seguimiento automático", "Selección automática"]);

/** Día (YYYY-MM-DD) en hora de Bogotá de una marca de tiempo. */
export function diaBogota(fecha: string | number | Date): string {
  const t = typeof fecha === "number" ? fecha : new Date(fecha).getTime();
  return new Date(t - DESFASE_BOGOTA_MS).toISOString().slice(0, 10);
}

/** Inicio (ISO en UTC) de un día de Bogotá. */
export function inicioDiaBogota(dia: string): string {
  return new Date(`${dia}T00:00:00-05:00`).toISOString();
}

/** Rango de los últimos `dias` días de Bogotá, hoy incluido. */
export function rangoUltimosDias(dias: number, ahora: Date = new Date()): Rango {
  const hasta = diaBogota(ahora);
  const desde = diaBogota(new Date(`${hasta}T12:00:00-05:00`).getTime() - (dias - 1) * DIA_MS);
  return { desde, hasta };
}

/** Máximo de días que se puede pedir con «desde» y «hasta». */
export const MAX_DIAS_RANGO = 180;
export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(dia: string, n: number): string {
  return new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA_MS).toISOString().slice(0, 10);
}

/** Días de un rango, ambos extremos incluidos. */
export function largoRango(r: Rango): number {
  const ms = new Date(`${r.hasta}T12:00:00Z`).getTime() - new Date(`${r.desde}T12:00:00Z`).getTime();
  return Math.round(ms / DIA_MS) + 1;
}

export function fechaValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export interface PeriodoElegido {
  rango: Rango;
  /** 7, 30 o 90 con los botones; null si es un rango con fechas. */
  dias: Periodo | null;
  /** Por qué no se pudo usar el rango pedido. */
  aviso?: string;
}

/**
 * Periodo pedido en la URL. Si vienen `desde` y `hasta` (días de Bogotá,
 * `hasta` incluido) mandan sobre `dias`; si no sirven se usa `dias` (o 30) y
 * se explica por qué.
 */
export function resolverPeriodo(
  p: { dias?: string; desde?: string; hasta?: string },
  ahora: Date = new Date()
): PeriodoElegido {
  const dias = PERIODOS.find((x) => String(x) === p.dias) ?? 30;
  const porDefecto = { rango: rangoUltimosDias(dias, ahora), dias };
  const desde = p.desde?.trim() ?? "";
  const hasta = p.hasta?.trim() ?? "";
  if (!desde && !hasta) return porDefecto;
  let aviso: string | null = null;
  if (!desde || !hasta) aviso = "Para un rango hay que elegir las dos fechas.";
  else if (!fechaValida(desde) || !fechaValida(hasta)) aviso = "Alguna de las fechas no es válida.";
  else if (desde > hasta) aviso = "La fecha «desde» es posterior a «hasta».";
  else if (largoRango({ desde, hasta }) > MAX_DIAS_RANGO) aviso = `El rango puede tener hasta ${MAX_DIAS_RANGO} días.`;
  if (aviso) return { ...porDefecto, aviso: `${aviso} Se muestran los últimos ${dias} días.` };
  return { rango: { desde, hasta }, dias: null };
}

/** Periodo anterior del mismo largo, que termina el día antes de `r.desde`. */
export function rangoAnterior(r: Rango): Rango {
  const n = largoRango(r);
  return { desde: sumarDias(r.desde, -n), hasta: sumarDias(r.desde, -1) };
}

function diasDelRango(r: Rango): string[] {
  const out: string[] = [];
  let t = new Date(`${r.desde}T12:00:00Z`).getTime();
  const fin = new Date(`${r.hasta}T12:00:00Z`).getTime();
  while (t <= fin) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += DIA_MS;
  }
  return out;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2026-11-03" → "3 nov". */
export function etiquetaDia(dia: string): string {
  const [, m, d] = dia.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** Mediana y percentil 90 (rango más cercano) de una lista de duraciones. */
export function tiempos(valores: number[]): Tiempos {
  const v = valores.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { n: 0, mediana: null, p90: null };
  const mitad = Math.floor(n / 2);
  const mediana = n % 2 ? v[mitad] : (v[mitad - 1] + v[mitad]) / 2;
  const p90 = v[Math.max(0, Math.ceil(0.9 * n) - 1)];
  return { n, mediana, p90 };
}

const t = (iso: string) => new Date(iso).getTime();

export type Autor = "asistente" | "persona" | "automatico";

/** Quién escribió un saliente. */
export function autorDe(m: MensajeFila): Autor {
  if (m.generado_por_ia) return "asistente";
  if (m.enviado_por && FIRMAS_AUTOMATICAS.has(m.enviado_por)) return "automatico";
  return "persona";
}

const entregado = (m: MensajeFila) => m.estado !== "failed";

/** Lo que cuenta como respuesta al aspirante: asistente, una persona o una plantilla. */
function esRespuesta(m: MensajeFila): boolean {
  if (m.direccion !== "saliente" || !entregado(m)) return false;
  return autorDe(m) !== "automatico" || !!m.plantilla;
}

function agrupar(items: string[], etiqueta: (clave: string) => string = (c) => c, max = 8): Conteo[] {
  const mapa = new Map<string, number>();
  for (const i of items) mapa.set(i, (mapa.get(i) ?? 0) + 1);
  const orden = [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = orden.slice(0, max).map(([clave, n]) => ({ clave, etiqueta: etiqueta(clave), n }));
  const resto = orden.slice(max).reduce((s, [, n]) => s + n, 0);
  if (resto > 0) top.push({ clave: "__otros__", etiqueta: "Otros", n: resto });
  return top;
}

/** Texto corto para agrupar los errores del agente (que se vea si se acabó el crédito). */
export function resumirError(error: string | null | undefined): string {
  const e = (error ?? "").trim();
  if (!e) return "Sin detalle";
  if (/insufficient.{0,10}credit|credit balance|crédito|saldo|quota|billing|payment required|\b402\b/i.test(e)) {
    return "Sin crédito en el proveedor de IA";
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(e)) return "Límite de uso del proveedor";
  if (/api.?key|unauthori[sz]ed|authentication|\b401\b|\b403\b|forbidden/i.test(e)) return "Clave del proveedor no válida";
  if (/time.?out|timed out|abort|tard[oó]/i.test(e)) return "El proveedor tardó demasiado";
  if (/overload|unavailable|bad gateway|\b5\d\d\b|internal server/i.test(e)) return "El proveedor no estaba disponible";
  if (/whatsapp/i.test(e)) return "WhatsApp rechazó el envío";
  if (/model.*(not found|no endpoints|not available)|no endpoints/i.test(e)) return "Modelo no disponible";
  return e.length > 60 ? `${e.slice(0, 59)}…` : e;
}

/** Texto del registro de ejecución cuando la persona pidió hablar con alguien (responder.ts). */
const PIDIO_PERSONA = /pidi[oó] hablar/i;

function tieneDatosAspirante(p: Record<string, unknown> | null | undefined): boolean {
  if (!p) return false;
  return ["nombre", "cedula", "edad", "ciudad", "licencia", "experiencia_meses"].some(
    (k) => p[k] != null && p[k] !== ""
  );
}

function autorizo(valor: unknown): boolean {
  if (valor == null || valor === false) return false;
  if (typeof valor === "string") return !/^(no|false|)$/i.test(valor.trim());
  return true;
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

interface Pase {
  motivo: keyof Indicadores["pases"]["porMotivo"];
  en: number;
}

/** Primer pase a una persona de una conversación, por las ejecuciones del agente o por su estado. */
export function primerPase(c: ConversacionFila, ejecuciones: EjecucionFila[]): Pase | null {
  const eventos: Pase[] = [];
  for (const e of ejecuciones) {
    if (e.resultado === "transferido") {
      eventos.push({ motivo: PIDIO_PERSONA.test(e.error ?? "") ? "solicitud" : "agente", en: t(e.created_at) });
    } else if (e.resultado === "error" && !/whatsapp/i.test(e.error ?? "")) {
      // Si el proveedor falla, el agente se pausa y la conversación queda para una persona.
      eventos.push({ motivo: "falla", en: t(e.created_at) });
    }
  }
  // El estado guarda solo el último motivo; sirve cuando no hay ejecución (pausa manual).
  const motivo = c.agente_motivo_pausa;
  if (c.agente_pausado_at && (motivo === "manual" || ((motivo === "solicitud" || motivo === "agente") && eventos.length === 0))) {
    eventos.push({ motivo: motivo as Pase["motivo"], en: t(c.agente_pausado_at) });
  }
  if (eventos.length === 0) return null;
  return eventos.reduce((a, b) => (b.en < a.en ? b : a));
}

/**
 * ¿Espera ahora a una persona? Marcada para una persona (o pausada por
 * transferencia) y con un mensaje del aspirante que ninguna persona ha
 * contestado. La despedida del asistente al transferir no cuenta.
 */
export function esperaPersona(c: ConversacionFila, mensajes: MensajeFila[]): boolean {
  const marcada =
    !!c.requiere_humano ||
    (!!c.agente_pausado && (c.agente_motivo_pausa === "solicitud" || c.agente_motivo_pausa === "agente"));
  if (!marcada) return false;
  let ultimoEntrante = -Infinity;
  let ultimaPersona = -Infinity;
  for (const m of mensajes) {
    const ts = t(m.timestamp);
    if (m.direccion === "entrante") ultimoEntrante = Math.max(ultimoEntrante, ts);
    else if (entregado(m) && autorDe(m) === "persona") ultimaPersona = Math.max(ultimaPersona, ts);
  }
  return ultimoEntrante > -Infinity && ultimoEntrante > ultimaPersona;
}

/**
 * «Quién atiende» de una conversación. null si el aspirante nunca escribió:
 * esa no entra en la base.
 */
export function claseAtencion(msgs: MensajeFila[]): ClaseAtencion | null {
  let escribio = false;
  let hayAsistente = false;
  let hayPersona = false;
  for (const m of msgs) {
    if (m.direccion === "entrante") escribio = true;
    else if (entregado(m)) {
      const autor = autorDe(m);
      if (autor === "asistente") hayAsistente = true;
      if (autor === "persona") hayPersona = true;
    }
  }
  if (!escribio) return null;
  if (hayAsistente && hayPersona) return "asistente_persona";
  if (hayAsistente) return "solo_asistente";
  if (hayPersona) return "solo_persona";
  return "sin_respuesta";
}

/** Primer mensaje de una persona después del pase (mensajes en orden). */
function respuestaTrasPase(msgs: MensajeFila[], pase: Pase): MensajeFila | undefined {
  return msgs.find((m) => m.direccion === "saliente" && entregado(m) && autorDe(m) === "persona" && t(m.timestamp) > pase.en);
}

/** ¿La conversación cumple los filtros de quién atendió y tipo? (mensajes en orden) */
export function cumpleFiltros(
  c: ConversacionFila,
  msgs: MensajeFila[],
  ejecuciones: EjecucionFila[],
  filtros: Filtros = {}
): boolean {
  const tipo = filtros.tipo ?? "todas";
  if (tipo === "otros" && !esOtroTema(c)) return false;
  if (tipo === "aspirantes" && esOtroTema(c)) return false;
  const atendio = filtros.atendio ?? "todas";
  if (atendio === "todas") return true;
  if (atendio === "pase_sin_respuesta") {
    const pase = primerPase(c, ejecuciones);
    return !!pase && !respuestaTrasPase(msgs, pase);
  }
  return claseAtencion(msgs) === atendio;
}

export function calcularIndicadores(entrada: EntradaIndicadores): Indicadores {
  const { rango } = entrada;
  const faltantes = entrada.faltantes ?? [];
  const falta = (col: string) => faltantes.some((f) => f === col || f.endsWith(`.${col}`));
  const dias = diasDelRango(rango);
  const enRango = (iso: string) => {
    const d = diaBogota(iso);
    return d >= rango.desde && d <= rango.hasta;
  };

  // Mensajes por conversación, en orden.
  const porConv = new Map<string, MensajeFila[]>();
  for (const m of entrada.mensajes) {
    const lista = porConv.get(m.conversacion_id);
    if (lista) lista.push(m);
    else porConv.set(m.conversacion_id, [m]);
  }
  for (const lista of porConv.values()) lista.sort((a, b) => t(a.timestamp) - t(b.timestamp));

  const ejecPorConv = new Map<string, EjecucionFila[]>();
  for (const e of entrada.ejecuciones ?? []) {
    if (!e.conversacion_id) continue;
    const lista = ejecPorConv.get(e.conversacion_id);
    if (lista) lista.push(e);
    else ejecPorConv.set(e.conversacion_id, [e]);
  }

  // Conversaciones creadas en el periodo que cumplen los filtros. Con filtros,
  // las ejecuciones y los procesos se limitan a esas conversaciones.
  const filtros = entrada.filtros ?? {};
  const hayFiltro = (filtros.atendio ?? "todas") !== "todas" || (filtros.tipo ?? "todas") !== "todas";
  const cumple = (c: ConversacionFila) =>
    !hayFiltro || cumpleFiltros(c, porConv.get(c.id) ?? [], ejecPorConv.get(c.id) ?? [], filtros);
  const conversaciones = entrada.conversaciones.filter((c) => enRango(c.created_at) && cumple(c));
  const idsConv = new Set(conversaciones.map((c) => c.id));
  const idsProceso = new Set(conversaciones.map((c) => c.proceso_id).filter(Boolean));

  // 1. Volumen
  const porDiaMapa = new Map(dias.map((d) => [d, 0]));
  for (const c of conversaciones) {
    const d = diaBogota(c.created_at);
    porDiaMapa.set(d, (porDiaMapa.get(d) ?? 0) + 1);
  }
  const enviadosPor = { asistente: 0, gestionHumana: 0, plantilla: 0, automatico: 0 };
  let recibidos = 0;
  let enviados = 0;

  // 2-4. Atención, pases y primera respuesta
  const atencion = { base: 0, soloAsistente: 0, asistenteYPersona: 0, soloPersona: 0, sinRespuesta: 0 };
  const porMotivo = { solicitud: 0, agente: 0, falla: 0, manual: 0 };
  let pasesTotal = 0;
  let pasesRespondidos = 0;
  const hastaPersona: number[] = [];
  const primera: number[] = [];
  const primeraAsistente: number[] = [];
  const primeraPersona: number[] = [];

  for (const c of conversaciones) {
    const msgs = porConv.get(c.id) ?? [];
    let primerEntrante: number | null = null;
    let primeraResp: { en: number; autor: Autor } | null = null;

    for (const m of msgs) {
      const ts = t(m.timestamp);
      if (m.direccion === "entrante") {
        recibidos++;
        if (primerEntrante == null) primerEntrante = ts;
        continue;
      }
      enviados++;
      const autor = autorDe(m);
      if (m.plantilla) enviadosPor.plantilla++;
      else if (autor === "asistente") enviadosPor.asistente++;
      else if (autor === "automatico") enviadosPor.automatico++;
      else enviadosPor.gestionHumana++;

      if (!entregado(m)) continue;
      if (primerEntrante != null && primeraResp == null && esRespuesta(m)) primeraResp = { en: ts, autor };
    }

    const clase = claseAtencion(msgs);
    if (clase) {
      atencion.base++;
      if (clase === "asistente_persona") atencion.asistenteYPersona++;
      else if (clase === "solo_asistente") atencion.soloAsistente++;
      else if (clase === "solo_persona") atencion.soloPersona++;
      else atencion.sinRespuesta++;
    }
    if (primerEntrante != null && primeraResp) {
      const dt = primeraResp.en - primerEntrante;
      primera.push(dt);
      if (primeraResp.autor === "asistente") primeraAsistente.push(dt);
      // Una plantilla del sistema entra en el total, pero no es de una persona.
      else if (primeraResp.autor === "persona") primeraPersona.push(dt);
    }

    const pase = primerPase(c, ejecPorConv.get(c.id) ?? []);
    if (pase) {
      pasesTotal++;
      porMotivo[pase.motivo]++;
      const respuesta = respuestaTrasPase(msgs, pase);
      if (respuesta) {
        pasesRespondidos++;
        hastaPersona.push(t(respuesta.timestamp) - pase.en);
      }
    }
  }

  // Esperando ahora: sobre las marcadas que llegan aparte (no dependen del
  // periodo elegido); sin ellas, sobre las conversaciones del periodo.
  let esperandoAhora = 0;
  // Con filtros, solo las marcadas que los cumplen.
  for (const c of entrada.marcadas?.filter(cumple) ?? conversaciones) {
    if (esperaPersona(c, porConv.get(c.id) ?? [])) esperandoAhora++;
  }

  // 5. Asistente de IA: ejecuciones del periodo (con filtros, solo las de esas conversaciones).
  const ejecuciones = (entrada.ejecuciones ?? []).filter(
    (e) => enRango(e.created_at) && (!hayFiltro || (!!e.conversacion_id && idsConv.has(e.conversacion_id)))
  );
  const cuenta = (r: string) => ejecuciones.filter((e) => e.resultado === r).length;
  const asistente = {
    ejecuciones: ejecuciones.length,
    respondido: cuenta("respondido"),
    transferido: cuenta("transferido"),
    error: cuenta("error"),
    errores: agrupar(ejecuciones.filter((e) => e.resultado === "error").map((e) => resumirError(e.error)), undefined, 6),
    duracion: tiempos(ejecuciones.map((e) => e.duracion_ms).filter((d): d is number => d != null)),
    tokensEntrada: ejecuciones.reduce((s, e) => s + (Number(e.tokens_entrada) || 0), 0),
    tokensSalida: ejecuciones.reduce((s, e) => s + (Number(e.tokens_salida) || 0), 0),
    modelos: agrupar(
      ejecuciones
        // El pase por pedido de la persona no consulta al modelo.
        .filter((e) => !(e.resultado === "transferido" && PIDIO_PERSONA.test(e.error ?? "")))
        .map((e) => e.modelo_usado || e.modelo_solicitado || e.proveedor || "Sin dato"),
      (c) => c,
      6
    ),
  };

  // 6. Selección de conductores
  const procesos = (entrada.procesos ?? []).filter((p) => enRango(p.created_at) && (!hayFiltro || idsProceso.has(p.id)));
  const procesoPorId = new Map([...(entrada.vinculados ?? []), ...procesos].map((p) => [p.id, p]));
  const sinPrefiltro = falta("prefiltro");
  const embudo: Conteo[] = [
    { clave: "nuevas", etiqueta: "Conversaciones nuevas", n: conversaciones.length },
    {
      clave: "datos",
      etiqueta: "Con datos del aspirante",
      n: conversaciones.filter((c) => tieneDatosAspirante(c.prefiltro)).length,
    },
    {
      clave: "autorizacion",
      etiqueta: "Aceptó la autorización de datos",
      n: conversaciones.filter((c) => {
        const p = c.proceso_id ? procesoPorId.get(c.proceso_id) : undefined;
        return c.prefiltro?.autorizacion === "si" || autorizo(p?.autorizacion_datos);
      }).length,
    },
    {
      clave: "hoja_vida",
      etiqueta: "Envió la hoja de vida",
      n: conversaciones.filter((c) => {
        const p = c.proceso_id ? procesoPorId.get(c.proceso_id) : undefined;
        return c.prefiltro?.hoja_vida === true || !!p?.hoja_vida_recibida_at;
      }).length,
    },
    { clave: "proceso", etiqueta: "Proceso de selección creado", n: conversaciones.filter((c) => !!c.proceso_id).length },
  ];
  const semaforo = { pasa: 0, no_cumple: 0, incompleto: 0, sin_evaluar: 0 };
  const causas: string[] = [];
  for (const p of procesos) {
    const g = p.preseleccion?.global;
    if (g === "pasa" || g === "no_cumple" || g === "incompleto") semaforo[g]++;
    else semaforo.sin_evaluar++;
    if (g === "no_cumple") {
      const clave = p.preseleccion?.incumplido as keyof typeof CAUSAS_PRESELECCION | undefined;
      causas.push(p.requisito_incumplido || (clave && CAUSAS_PRESELECCION[clave]) || "Sin causa registrada");
    }
  }

  // 7. Reactivación
  const sinReactivacion = falta("reactivacion_paso");
  let avisados = 0;
  let volvieron = 0;
  for (const c of conversaciones) {
    if ((c.reactivacion_paso ?? 0) < 1) continue;
    avisados++;
    const desde = c.reactivacion_ultimo_at ? t(c.reactivacion_ultimo_at) : null;
    if (desde != null && (porConv.get(c.id) ?? []).some((m) => m.direccion === "entrante" && t(m.timestamp) > desde)) {
      volvieron++;
    }
  }

  return {
    rango: { ...rango, dias: dias.length },
    volumen: {
      conversacionesNuevas: conversaciones.length,
      porDia: dias.map((fecha) => ({ fecha, etiqueta: etiquetaDia(fecha), conversaciones: porDiaMapa.get(fecha) ?? 0 })),
      recibidos,
      enviados,
      enviadosPor,
    },
    atencion: {
      ...atencion,
      pctSoloAsistente: atencion.base ? Math.round((atencion.soloAsistente / atencion.base) * 1000) / 10 : null,
    },
    pases: {
      total: pasesTotal,
      porMotivo,
      respondidos: pasesRespondidos,
      sinRespuesta: pasesTotal - pasesRespondidos,
      tiempoHastaPersona: tiempos(hastaPersona),
    },
    primeraRespuesta: {
      general: tiempos(primera),
      asistente: tiempos(primeraAsistente),
      persona: tiempos(primeraPersona),
    },
    esperandoAhora,
    asistente,
    seleccion: {
      disponible: !sinPrefiltro,
      embudo,
      procesos: procesos.length,
      semaforo,
      causas: agrupar(causas, undefined, 6),
    },
    reactivacion: { disponible: !sinReactivacion, avisados, volvieron },
    faltantes,
  };
}

// ── Formato ──────────────────────────────────────────────────────────────────

/** Duración legible: «40 s», «12 min», «2 h 5 min», «1 d 3 h». null → «—». */
export function formatoDuracion(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const resto = min % 60;
    return resto ? `${h} h ${resto} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

/** Qué dirección es buena para un indicador; «neutro» para el volumen. */
export type Sentido = "mas_es_mejor" | "menos_es_mejor" | "neutro";

export interface Variacion {
  /** «+15 %», «−4 pts», «+12» (si antes era 0) o «sin cambio». */
  texto: string;
  flecha: "▲" | "▼" | "";
  /** mejor: verde; peor: naranja; neutro: gris. */
  tono: "mejor" | "peor" | "neutro";
}

/**
 * Cambio frente al periodo anterior. Las cantidades y los tiempos cambian en
 * %; los porcentajes (`tipo: "puntos"`) en puntos. null si falta alguno.
 */
export function variacion(
  actual: number | null | undefined,
  anterior: number | null | undefined,
  { tipo = "cantidad", sentido = "neutro" }: { tipo?: "cantidad" | "puntos"; sentido?: Sentido } = {}
): Variacion | null {
  if (actual == null || anterior == null || !Number.isFinite(actual) || !Number.isFinite(anterior)) return null;
  const firmar = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("es-CO")}`;
  let cambio: number;
  let texto: string;
  if (tipo === "puntos") {
    cambio = Math.round(actual - anterior);
    texto = `${firmar(cambio)} pts`;
  } else if (anterior === 0) {
    cambio = Math.round(actual);
    texto = firmar(cambio);
  } else {
    cambio = Math.round(((actual - anterior) / anterior) * 100);
    texto = `${firmar(cambio)} %`;
  }
  if (cambio === 0) return { texto: "sin cambio", flecha: "", tono: "neutro" };
  const sube = cambio > 0;
  const tono = sentido === "neutro" ? "neutro" : sube === (sentido === "mas_es_mejor") ? "mejor" : "peor";
  return { texto, flecha: sube ? "▲" : "▼", tono };
}

/** Porcentaje entero de `parte` sobre `total`; null si el total es 0. */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}
