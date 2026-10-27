/**
 * Seguimiento de las solicitudes que Revisión cartulina envía a cámaras: en
 * qué etapa va cada una, qué cuenta la alarma, qué exigen los formularios de
 * caja y de la directora, y los indicadores de gestión del recobro. Módulo
 * puro: la pantalla, las acciones y las pruebas usan las mismas reglas.
 *
 * Ciclo: pendiente en cámaras → resuelta (sin visto de cartulina: la
 * normalidad queda cerrada). Si es recobro, pasa a caja: pendiente → en seguimiento (gestiones con fecha y próxima
 * fecha) → cobrado, o → incobrable por autorizar → incobrable cuando lo
 * autoriza la directora de tesorería (si lo rechaza vuelve a seguimiento). El
 * recobro se cobra al conductor del viaje, que ya viene en la solicitud.
 */

import { diasEntre } from "@/lib/operativo/constants";

export type ResultadoCamaras = "recobro" | "normalidad_timbradas";
export type CobroEstado = "cobrado" | "incobrable";

/** Lo que las reglas necesitan de una solicitud. */
export interface SeguimientoSolicitud {
  estado: "pendiente" | "resuelto";
  resultado: ResultadoCamaras | null;
  cobroEstado: CobroEstado | null;
  gestionesN: number;
  gestionProximaFecha: string | null;
  incobrableSolicitadoAt: string | null;
}

export type Etapa =
  | "en_camaras" | "cerrada"
  | "pendiente_caja" | "en_seguimiento" | "por_autorizar" | "cobrado" | "incobrable";

export const ETAPA_LABEL: Record<Etapa, string> = {
  en_camaras: "En cámaras",
  cerrada: "Cerrada",
  pendiente_caja: "Pendiente de caja",
  en_seguimiento: "En seguimiento",
  por_autorizar: "Incobrable por autorizar",
  cobrado: "Cobrado",
  incobrable: "Incobrable",
};

/**
 * Etapa de la solicitud. La respuesta de cámaras no espera ningún visto de
 * cartulina: la normalidad queda cerrada y el recobro pasa a caja en cuanto
 * cámaras resuelve. (`visto_at` queda en la base solo como histórico.)
 */
export function etapaSolicitud(s: SeguimientoSolicitud): Etapa {
  if (s.estado !== "resuelto") return "en_camaras";
  if (s.resultado === "recobro") {
    if (s.cobroEstado === "cobrado") return "cobrado";
    if (s.cobroEstado === "incobrable") return "incobrable";
    if (s.incobrableSolicitadoAt) return "por_autorizar";
    return s.gestionesN > 0 ? "en_seguimiento" : "pendiente_caja";
  }
  return "cerrada";
}

/** Recobro que sigue abierto en caja: ni cobrado ni incobrable autorizado. */
export const esPorCobrar = (s: SeguimientoSolicitud) =>
  s.estado === "resuelto" && s.resultado === "recobro" && s.cobroEstado == null;
/** Recobro abierto cuya próxima gestión ya pasó. */
export const esGestionVencida = (s: SeguimientoSolicitud, hoy: string) =>
  esPorCobrar(s) && s.gestionProximaFecha != null && s.gestionProximaFecha < hoy;
/** Incobrable que caja pidió y la directora no ha decidido. */
export const esPorAutorizar = (s: SeguimientoSolicitud) => esPorCobrar(s) && s.incobrableSolicitadoAt != null;

/**
 * Lo que ve quien no tiene cartulina (caja o la directora): solo los recobros
 * que cámaras ya resolvió, que son los únicos con cobro que gestionar.
 */
export const esDeCaja = (s: SeguimientoSolicitud) => s.estado === "resuelto" && s.resultado === "recobro";
export const ETAPAS_CAJA: readonly Etapa[] = ["pendiente_caja", "en_seguimiento", "por_autorizar", "cobrado", "incobrable"];

export interface Alarma {
  porCobrar: number;
  vencidas: number;
  porAutorizar: number;
}

export function contarAlarma(solicitudes: SeguimientoSolicitud[], hoy: string): Alarma {
  const a: Alarma = { porCobrar: 0, vencidas: 0, porAutorizar: 0 };
  for (const s of solicitudes) {
    if (esPorCobrar(s)) a.porCobrar++;
    if (esGestionVencida(s, hoy)) a.vencidas++;
    if (esPorAutorizar(s)) a.porAutorizar++;
  }
  return a;
}

/**
 * Lo que a cada quien le toca de la alarma: lo abierto es de caja y de
 * cartulina (que sigue su recobro), y lo por autorizar solo de la directora.
 */
export function alarmaPara(a: Alarma, rol: { cartulina: boolean; caja: boolean; autoriza: boolean }): Alarma {
  const cobro = rol.cartulina || rol.caja;
  return {
    porCobrar: cobro ? a.porCobrar : 0,
    vencidas: cobro ? a.vencidas : 0,
    porAutorizar: rol.autoriza ? a.porAutorizar : 0,
  };
}

/** Texto del aviso; null si no hay nada que avisar. */
export function textoAlarma(a: Alarma): string | null {
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  const partes: string[] = [];
  if (a.porCobrar > 0) {
    partes.push(
      plural(a.porCobrar, "recobro abierto en caja", "recobros abiertos en caja") +
        (a.vencidas > 0 ? ` (${a.vencidas} con gestión vencida)` : ""),
    );
  }
  if (a.porAutorizar > 0) partes.push(plural(a.porAutorizar, "incobrable por autorizar", "incobrables por autorizar"));
  return partes.length ? partes.join(" · ") : null;
}

/** Filtro de llegada del aviso: lo que más urge a quien lo ve. */
export function filtroDeAlarma(a: Alarma): FiltroEtapa {
  if (a.porAutorizar > 0) return "por_autorizar";
  if (a.vencidas > 0) return "vencida";
  return "abiertos";
}

/** Filtros de la lista: una etapa, o dos cortes que cruzan etapas. */
export type FiltroEtapa = Etapa | "abiertos" | "vencida";
export const FILTRO_LABEL: Record<FiltroEtapa, string> = {
  ...ETAPA_LABEL,
  abiertos: "Abiertos en caja",
  vencida: "Gestión vencida",
};

export function pasaFiltro(s: SeguimientoSolicitud, f: FiltroEtapa, hoy: string): boolean {
  if (f === "abiertos") return esPorCobrar(s);
  if (f === "vencida") return esGestionVencida(s, hoy);
  return etapaSolicitud(s) === f;
}

// ── Quién puede hacer qué ────────────────────────────────────────────────────

export type AccionRecobro = "gestion" | "cobrar" | "solicitar_incobrable" | "autorizar" | "rechazar" | "reabrir";

/**
 * Null si el rol puede hacer la acción sobre la solicitud; si no, el porqué.
 * Caja gestiona, cobra y pide el incobrable; solo la directora (sub-función
 * recobros_incobrable) lo autoriza, lo rechaza o lo reabre.
 */
export function motivoNoPermitido(
  accion: AccionRecobro,
  s: SeguimientoSolicitud,
  rol: { caja: boolean; autoriza: boolean },
): string | null {
  if (s.estado !== "resuelto" || s.resultado !== "recobro") {
    return "Solo los recobros que cámaras ya resolvió llevan seguimiento de caja.";
  }
  const abierto = s.cobroEstado == null;
  switch (accion) {
    case "gestion":
      if (!rol.caja) return "Solo caja registra gestiones del recobro.";
      return abierto ? null : "El recobro ya está cerrado.";
    case "cobrar":
      if (!rol.caja) return "Solo caja registra el cobro del recobro.";
      if (s.cobroEstado === "incobrable") return "El recobro está cerrado como incobrable: la directora debe reabrirlo.";
      return null;
    case "solicitar_incobrable":
      if (!rol.caja) return "Solo caja solicita el incobrable.";
      if (!abierto) return "El recobro ya está cerrado.";
      return s.incobrableSolicitadoAt ? "Ya hay una solicitud de incobrable esperando autorización." : null;
    case "autorizar":
    case "rechazar":
      if (!rol.autoriza) return "Solo la directora de tesorería autoriza o rechaza el incobrable.";
      if (!abierto) return "El recobro ya está cerrado.";
      return s.incobrableSolicitadoAt ? null : "No hay una solicitud de incobrable por decidir.";
    case "reabrir":
      if (!rol.autoriza) return "Solo la directora de tesorería reabre un incobrable.";
      return s.cobroEstado === "incobrable" ? null : "Solo se reabre un recobro cerrado como incobrable.";
  }
}

// ── Formularios ──────────────────────────────────────────────────────────────

export const VALOR_MAXIMO_RECOBRO = 10_000_000;
/** Hasta cuántos días adelante se agenda la próxima gestión. */
export const PROXIMA_GESTION_MAX_DIAS = 90;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const limpio = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

export interface CobroInput {
  valor?: number | null;
  fecha?: string | null;
  soporte?: string | null;
  nota?: string | null;
}

/** Cobro ya validado y normalizado, listo para guardar. */
export interface CobroValido {
  valor: number;
  fecha: string;
  soporte: string;
  nota: string | null;
}

/**
 * Valida el cobro: valor en pesos enteros, fecha (entre el día del viaje y
 * hoy) y recibo o soporte.
 */
export function validarCobro(
  input: CobroInput,
  ctx: { fechaViaje: string; hoy: string },
): { ok: true; cobro: CobroValido } | { ok: false; error: string } {
  const nota = limpio(input.nota);
  if (nota && nota.length > 500) return { ok: false, error: "La nota no puede pasar de 500 caracteres." };
  const valor = input.valor;
  if (valor == null || !Number.isFinite(valor) || !Number.isInteger(valor) || valor <= 0) {
    return { ok: false, error: "Escriba el valor cobrado en pesos, sin decimales." };
  }
  if (valor > VALOR_MAXIMO_RECOBRO) {
    return { ok: false, error: `El valor no puede pasar de ${VALOR_MAXIMO_RECOBRO.toLocaleString("es-CO")}.` };
  }
  const fecha = limpio(input.fecha);
  if (!fecha || !FECHA_RE.test(fecha)) return { ok: false, error: "Indique la fecha del cobro." };
  if (fecha < ctx.fechaViaje) return { ok: false, error: "La fecha del cobro no puede ser anterior al viaje." };
  if (fecha > ctx.hoy) return { ok: false, error: "La fecha del cobro no puede ser futura." };
  const soporte = limpio(input.soporte);
  if (!soporte) return { ok: false, error: "Escriba el número de recibo o soporte." };
  if (soporte.length > 100) return { ok: false, error: "El soporte no puede pasar de 100 caracteres." };
  return { ok: true, cobro: { valor, fecha, soporte, nota } };
}

export interface GestionInput {
  fecha?: string | null;
  gestion?: string | null;
  proximaFecha?: string | null;
}

export interface GestionValida {
  fecha: string;
  gestion: string;
  proximaFecha: string | null;
}

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDiasIso(fecha: string, dias: number): string {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + dias));
  return d.toISOString().slice(0, 10);
}

/**
 * Valida una gestión de caja: la fecha va entre el día en que cámaras resolvió
 * y hoy; la próxima fecha, si la hay, desde hoy y hasta 90 días.
 */
export function validarGestion(
  input: GestionInput,
  ctx: { desde: string; hoy: string },
): { ok: true; gestion: GestionValida } | { ok: false; error: string } {
  const fecha = limpio(input.fecha);
  if (!fecha || !FECHA_RE.test(fecha)) return { ok: false, error: "Indique la fecha de la gestión." };
  if (fecha < ctx.desde) return { ok: false, error: "La gestión no puede ser anterior a la respuesta de cámaras." };
  if (fecha > ctx.hoy) return { ok: false, error: "La fecha de la gestión no puede ser futura." };
  const gestion = limpio(input.gestion);
  if (!gestion) return { ok: false, error: "Escriba qué gestión se hizo." };
  if (gestion.length > 500) return { ok: false, error: "La gestión no puede pasar de 500 caracteres." };
  const proximaFecha = limpio(input.proximaFecha);
  if (proximaFecha) {
    if (!FECHA_RE.test(proximaFecha)) return { ok: false, error: "La próxima fecha no es válida." };
    if (proximaFecha < ctx.hoy) return { ok: false, error: "La próxima fecha no puede ser pasada." };
    if (proximaFecha > sumarDiasIso(ctx.hoy, PROXIMA_GESTION_MAX_DIAS)) {
      return { ok: false, error: `La próxima fecha no puede pasar de ${PROXIMA_GESTION_MAX_DIAS} días.` };
    }
  }
  return { ok: true, gestion: { fecha, gestion, proximaFecha } };
}

/** Motivo o nota obligatoria (incobrable, rechazo, reapertura). */
export function validarTexto(texto: string | null | undefined, falta: string): { ok: true; texto: string } | { ok: false; error: string } {
  const t = limpio(texto);
  if (!t) return { ok: false, error: falta };
  if (t.length > 500) return { ok: false, error: "El texto no puede pasar de 500 caracteres." };
  return { ok: true, texto: t };
}

// ── Días de atención e indicadores ───────────────────────────────────────────

/** Fecha de Bogotá (AAAA-MM-DD) de un instante ISO. */
export const fechaBogota = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));

export interface RecobroIndicador extends SeguimientoSolicitud {
  resueltoAt: string | null;
  cobroFecha: string | null;
  cobroValor: number | null;
  incobrableAutorizadoAt: string | null;
}

/**
 * Días de atención: calendario, desde el día en que cámaras confirmó el
 * recobro hasta el cobro (fecha del cobro), hasta la autorización del
 * incobrable, o hasta hoy si sigue abierto. Null si no es un recobro resuelto.
 */
export function diasAtencion(r: RecobroIndicador, hoy: string): number | null {
  if (r.estado !== "resuelto" || r.resultado !== "recobro" || !r.resueltoAt) return null;
  const inicio = fechaBogota(r.resueltoAt);
  const fin =
    r.cobroEstado === "cobrado" && r.cobroFecha ? r.cobroFecha
    : r.cobroEstado === "incobrable" && r.incobrableAutorizadoAt ? fechaBogota(r.incobrableAutorizadoAt)
    : hoy;
  return Math.max(0, diasEntre(inicio, fin));
}

export type NivelDias = "normal" | "alerta" | "critico";
/** Ámbar desde 8 días, rojo desde 16. */
export const nivelDias = (d: number): NivelDias => (d >= 16 ? "critico" : d >= 8 ? "alerta" : "normal");

export const TRAMOS_DIAS = [
  { label: "0–7 días", min: 0, max: 7 },
  { label: "8–15 días", min: 8, max: 15 },
  { label: "16–30 días", min: 16, max: 30 },
  { label: "Más de 30", min: 31, max: Infinity },
] as const;

export interface IndicadoresRecobros {
  recobros: number;
  abiertos: number;
  sinGestion: number;
  enSeguimiento: number;
  porAutorizar: number;
  vencidas: number;
  cobrados: number;
  incobrables: number;
  /** Cobrados sobre cerrados (cobrados + incobrables); null sin cerrados. */
  tasaCobro: number | null;
  montoCobrado: number;
  diasCerradosPromedio: number | null;
  diasCerradosMediana: number | null;
  diasAbiertosPromedio: number | null;
  diasAbiertosMaximo: number | null;
  tramosAbiertos: number[];
  /** Gestiones registradas por recobro (todos los recobros). */
  gestionesPorRecobro: number | null;
  diasEsperandoAutorizacion: number | null;
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function indicadoresRecobros(filas: RecobroIndicador[], hoy: string): IndicadoresRecobros {
  const recobros = filas.filter(esDeCaja);
  const diasCerrados: number[] = [];
  const diasAbiertos: number[] = [];
  const esperando: number[] = [];
  const tramos = TRAMOS_DIAS.map(() => 0);
  let sinGestion = 0, enSeguimiento = 0, porAutorizar = 0, vencidas = 0, cobrados = 0, incobrables = 0;
  let monto = 0, gestiones = 0;
  for (const r of recobros) {
    gestiones += r.gestionesN;
    const d = diasAtencion(r, hoy);
    const etapa = etapaSolicitud(r);
    if (etapa === "cobrado") { cobrados++; monto += r.cobroValor ?? 0; }
    if (etapa === "incobrable") incobrables++;
    if (etapa === "cobrado" || etapa === "incobrable") {
      if (d != null) diasCerrados.push(d);
      continue;
    }
    if (etapa === "pendiente_caja") sinGestion++;
    if (etapa === "en_seguimiento") enSeguimiento++;
    if (etapa === "por_autorizar") {
      porAutorizar++;
      if (r.incobrableSolicitadoAt) esperando.push(Math.max(0, diasEntre(fechaBogota(r.incobrableSolicitadoAt), hoy)));
    }
    if (esGestionVencida(r, hoy)) vencidas++;
    if (d != null) {
      diasAbiertos.push(d);
      tramos[TRAMOS_DIAS.findIndex((t) => d >= t.min && d <= t.max)]++;
    }
  }
  const cerrados = cobrados + incobrables;
  return {
    recobros: recobros.length,
    abiertos: sinGestion + enSeguimiento + porAutorizar,
    sinGestion, enSeguimiento, porAutorizar, vencidas, cobrados, incobrables,
    tasaCobro: cerrados ? cobrados / cerrados : null,
    montoCobrado: monto,
    diasCerradosPromedio: promedio(diasCerrados),
    diasCerradosMediana: mediana(diasCerrados),
    diasAbiertosPromedio: promedio(diasAbiertos),
    diasAbiertosMaximo: diasAbiertos.length ? Math.max(...diasAbiertos) : null,
    tramosAbiertos: tramos,
    gestionesPorRecobro: recobros.length ? gestiones / recobros.length : null,
    diasEsperandoAutorizacion: promedio(esperando),
  };
}
