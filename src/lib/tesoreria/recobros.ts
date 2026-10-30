/**
 * Reglas del módulo de Recobros (requerimiento de Tesorería del 28-oct-2026):
 * en qué estado va cada solicitud, cuánto vale el recobro, cuántos días
 * hábiles lleva, qué exige cada gestión de los cajeros y qué puede hacer cada
 * rol. Módulo puro: la página, las acciones, el Excel y las pruebas dicen lo
 * mismo porque usan estas funciones.
 *
 * Ciclo:
 *   solicitud creada → en revisión → sin recobro (cerrado) | sin conteo →
 *   decide subgerencia (cobrar | no cobrar) | recobro → sin gestionar →
 *   en gestión (2 días hábiles desde la notificación) → plazo vencido
 *   (Operativo indica / acuerdo) → pagado. Salidas excepcionales: incobrable
 *   (lo autoriza subgerencia, lo registra la directora) y liquidación
 *   definitiva (conductor retirado).
 *
 * El estado no se guarda: se deriva de la solicitud, sus gestiones y la fecha
 * de hoy. Así el plazo vencido y el acuerdo incumplido cambian solos, sin cron
 * y sin que nadie los marque.
 *
 * Reemplaza poco a poco a `recobros-camaras.ts`, que sigue sirviendo a la
 * pestaña «Solicitudes a cámaras» mientras exista.
 */

import { diaIso, esFestivo, sumarDias } from "./calendario-pago";

// ── Días hábiles (lunes a sábado, sin festivos) ──────────────────────────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lunes a sábado y no festivo de Colombia. El domingo nunca cuenta. */
export function esDiaHabilRecobro(fecha: string): boolean {
  return diaIso(fecha) !== 7 && !esFestivo(fecha);
}

/**
 * Días hábiles que pasan de `desde` a `hasta`: cuenta los días hábiles del
 * intervalo (desde, hasta]. El mismo día da 0; de jueves a sábado, 2; de
 * sábado a lunes, 1 (el domingo no cuenta). Negativo si `hasta` va antes.
 */
export function diasHabilesEntre(desde: string, hasta: string): number {
  if (hasta === desde) return 0;
  if (hasta < desde) return -diasHabilesEntre(hasta, desde);
  let n = 0;
  for (let d = sumarDias(desde, 1); d <= hasta; d = sumarDias(d, 1)) {
    if (esDiaHabilRecobro(d)) n++;
  }
  return n;
}

/** La fecha que queda `n` días hábiles después de `fecha` (n ≥ 0). */
export function sumarDiasHabiles(fecha: string, n: number): string {
  let d = fecha;
  for (let k = 0; k < n; ) {
    d = sumarDias(d, 1);
    if (esDiaHabilRecobro(d)) k++;
  }
  return d;
}

/** Días hábiles de `desde` a `hasta`, ambos incluidos. */
export function diasHabilesDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (esDiaHabilRecobro(d)) out.push(d);
  return out;
}

/** Fecha de Bogotá (AAAA-MM-DD) de un instante ISO. */
export const fechaBogota = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));

// ── Valor del recobro ────────────────────────────────────────────────────────

/** Valor de la timbrada cuando GEMA no trae el pasaje del viaje. */
export interface Tarifas {
  normal: number;
  domingoFestivo: number;
}
/** Confirmadas por Tesorería el 29-oct-2026; coinciden con el pasaje de GEMA. */
export const TARIFAS_POR_DEFECTO: Tarifas = { normal: 3_700, domingoFestivo: 3_800 };

export const tarifaDelDia = (fecha: string, t: Tarifas = TARIFAS_POR_DEFECTO) =>
  diaIso(fecha) === 7 || esFestivo(fecha) ? t.domingoFestivo : t.normal;

export interface CalculoRecobro {
  diferencia: number;
  pasaje: number;
  pasajeFuente: "gema" | "tarifa";
  valor: number;
  /** El pasaje de GEMA no es el de la tarifa de ese día. */
  pasajeDistinto: boolean;
}

/**
 * Diferencia = conteo de cámara − timbradas de la registradora; valor =
 * diferencia × pasaje del viaje (el de GEMA; si no lo trae, la tarifa del
 * día). Null si falta un dato. Una diferencia de 0 o menos vale 0: no hay
 * recobro.
 */
export function calcularRecobro(i: {
  conteo: number | null;
  timbradas: number | null;
  pasajeGema: number | null;
  fechaViaje: string;
  tarifas?: Tarifas;
}): CalculoRecobro | null {
  if (i.conteo == null || i.timbradas == null) return null;
  const tarifa = tarifaDelDia(i.fechaViaje, i.tarifas);
  const gema = i.pasajeGema != null && i.pasajeGema > 0 ? Math.round(i.pasajeGema) : null;
  const pasaje = gema ?? tarifa;
  const diferencia = i.conteo - i.timbradas;
  return {
    diferencia,
    pasaje,
    pasajeFuente: gema != null ? "gema" : "tarifa",
    valor: diferencia > 0 ? diferencia * pasaje : 0,
    pasajeDistinto: gema != null && gema !== tarifa,
  };
}

/** En cartulina la diferencia la digita la auxiliar; el valor sale igual. */
export function valorDeDiferencia(diferencia: number, pasajeGema: number | null, fechaViaje: string, tarifas?: Tarifas) {
  const gema = pasajeGema != null && pasajeGema > 0 ? Math.round(pasajeGema) : null;
  const pasaje = gema ?? tarifaDelDia(fechaViaje, tarifas);
  return { pasaje, pasajeFuente: gema != null ? ("gema" as const) : ("tarifa" as const), valor: Math.max(0, diferencia) * pasaje };
}

// ── Datos que las reglas necesitan ───────────────────────────────────────────

export type TipoSolicitud = "camara" | "cartulina";
export type OrigenSolicitud = "abono_gema" | "cartulina" | "mantenimiento" | "migracion";

/** De dónde se originó la novedad, para la bandeja, el detalle y el Excel. */
export const ORIGEN_LABEL: Record<OrigenSolicitud, string> = {
  abono_gema: "Abono GEMA (revisión cámara)",
  cartulina: "Revisión cartulina",
  mantenimiento: "Mantenimiento (cámaras)",
  migracion: "Migración",
};
export type ResultadoRevision = "recobro" | "normalidad_timbradas" | "sin_conteo";
export type DecisionSubgerencia = "cobrar" | "no_cobrar";
export type CobroEstado = "cobrado" | "incobrable" | "liquidacion_definitiva";

export interface SolicitudBase {
  tipo: TipoSolicitud;
  origen: OrigenSolicitud;
  fechaViaje: string;
  solicitadoAt: string;
  /** Día del abono «REVISIÓN CÁMARA» en GEMA (origen abono_gema). */
  abonoFecha: string | null;
  anuladaAt: string | null;
  tomadoAt: string | null;
  estado: "pendiente" | "resuelto";
  resultado: ResultadoRevision | null;
  resueltoAt: string | null;
  subgerenciaDecision: DecisionSubgerencia | null;
  subgerenciaAt: string | null;
  valorRecobro: number | null;
  cobroEstado: CobroEstado | null;
  cobroAt: string | null;
  incobrableSolicitadoAt: string | null;
  liquidacionMarcadaAt: string | null;
}

export type ClaveResultado =
  | "notificado" | "no_vino" | "pidio_plazo" | "no_pago_comprometido" | "acuerdo_operativo"
  | "abono_parcial" | "no_esta_de_acuerdo" | "pago_completo" | "otro" | "instruccion_operativo";

export interface GestionBase {
  id: string;
  fecha: string;
  createdAt: string;
  /** Clave del catálogo; las que Tesorería agregue después llegan como texto. */
  resultado: ClaveResultado | string;
  compromisoFecha: string | null;
  valorRecibido: number | null;
}

/** Correcciones aprobadas al valor recibido de una gestión (las gestiones no se editan). */
export interface CorreccionValorRecibido {
  gestionId: string;
  valorNuevo: number;
}

// ── Estado ───────────────────────────────────────────────────────────────────

export type EstadoRecobro =
  | "solicitud_creada" | "en_revision" | "decide_subgerencia"
  | "sin_gestionar" | "en_gestion" | "plazo_vencido"
  | "incobrable_por_autorizar" | "para_liquidacion"
  | "pagado" | "cerrado_sin_cobro" | "liquidado" | "anulada";

export const ESTADO_LABEL: Record<EstadoRecobro, string> = {
  solicitud_creada: "Solicitud creada",
  en_revision: "En revisión",
  decide_subgerencia: "Decide subgerencia",
  sin_gestionar: "Sin gestionar",
  en_gestion: "En gestión",
  plazo_vencido: "Plazo vencido",
  incobrable_por_autorizar: "Incobrable por autorizar",
  para_liquidacion: "Para liquidación definitiva",
  pagado: "Pagado",
  cerrado_sin_cobro: "Cerrado sin cobro",
  liquidado: "Cerrado por liquidación definitiva",
  anulada: "Solicitud anulada",
};

/** Orden de la franja del flujo en la página. */
export const ESTADOS_FLUJO: readonly EstadoRecobro[] = [
  "solicitud_creada", "en_revision", "decide_subgerencia", "sin_gestionar", "en_gestion",
  "plazo_vencido", "incobrable_por_autorizar", "para_liquidacion", "pagado", "cerrado_sin_cobro", "liquidado",
];

export const ESTADOS_CERRADOS: ReadonlySet<EstadoRecobro> = new Set(["pagado", "cerrado_sin_cobro", "liquidado", "anulada"]);

/** Lo que el cajero tiene en su bandeja: recobros habilitados y sin pagar. */
export const ESTADOS_CAJERO: ReadonlySet<EstadoRecobro> = new Set([
  "sin_gestionar", "en_gestion", "plazo_vencido", "incobrable_por_autorizar",
]);

export type MotivoCierre = "sin_recobro" | "subgerencia_no_cobra" | "incobrable";
export type DetalleEstado = "ultimo_dia" | "acuerdo_vigente" | "acuerdo_incumplido";

export interface EstadoCalculado {
  estado: EstadoRecobro;
  /** Día (Bogotá) en que entró a este estado: de ahí cuentan los días hábiles. */
  desde: string;
  /** Día en que se habilitó el recobro (recobro confirmado o subgerencia decide cobrar). */
  habilitadoDesde: string | null;
  /** Primera gestión «Se le notificó el recobro». */
  notificadoFecha: string | null;
  /** Último día para pagar: 2 días hábiles desde la notificación. */
  plazoHasta: string | null;
  /** Fecha de pago del acuerdo con Operativo más reciente, si lo hay. */
  acuerdoHasta: string | null;
  motivoCierre: MotivoCierre | null;
  detalle: DetalleEstado | null;
}

/** Días hábiles de plazo para pagar desde que se le notifica al conductor. */
export const PLAZO_PAGO_DIAS_HABILES = 2;

/** Resultados que, registrados el día del plazo, lo dan por incumplido ese mismo día. */
const SIN_PAGO: ReadonlySet<string> = new Set(["no_pago_comprometido", "no_vino"]);

/**
 * Dónde empieza el reloj de la revisión: el día del abono en GEMA, el día en
 * que la auxiliar creó la solicitud, o el día del viaje si Mantenimiento
 * registró el recobro sin solicitud.
 */
export function inicioRevision(s: Pick<SolicitudBase, "origen" | "abonoFecha" | "solicitadoAt" | "fechaViaje">): string {
  if (s.origen === "abono_gema" && s.abonoFecha) return s.abonoFecha;
  if (s.origen === "cartulina") return fechaBogota(s.solicitadoAt);
  return s.fechaViaje;
}

const ordenGestiones = (gs: readonly GestionBase[]) =>
  [...gs].sort((a, b) => (a.fecha === b.fecha ? a.createdAt.localeCompare(b.createdAt) : a.fecha.localeCompare(b.fecha)));

/** Valor recibido de cada gestión, con las correcciones aprobadas encima. */
export function valorRecibidoTotal(gestiones: readonly GestionBase[], correcciones: readonly CorreccionValorRecibido[] = []): number {
  const corregido = new Map(correcciones.map((c) => [c.gestionId, c.valorNuevo]));
  return gestiones.reduce((t, g) => t + (corregido.get(g.id) ?? g.valorRecibido ?? 0), 0);
}

export const saldoRecobro = (valor: number | null, gestiones: readonly GestionBase[], correcciones: readonly CorreccionValorRecibido[] = []) =>
  Math.max(0, (valor ?? 0) - valorRecibidoTotal(gestiones, correcciones));

export function estadoRecobro(
  s: SolicitudBase,
  gestionesSinOrden: readonly GestionBase[],
  hoy: string,
  correcciones: readonly CorreccionValorRecibido[] = [],
): EstadoCalculado {
  const base: EstadoCalculado = {
    estado: "solicitud_creada", desde: inicioRevision(s), habilitadoDesde: null,
    notificadoFecha: null, plazoHasta: null, acuerdoHasta: null, motivoCierre: null, detalle: null,
  };
  if (s.anuladaAt) return { ...base, estado: "anulada", desde: fechaBogota(s.anuladaAt) };
  if (s.estado !== "resuelto" || !s.resultado) {
    return s.tomadoAt ? { ...base, estado: "en_revision", desde: fechaBogota(s.tomadoAt) } : base;
  }
  const resuelto = s.resueltoAt ? fechaBogota(s.resueltoAt) : inicioRevision(s);
  if (s.resultado === "normalidad_timbradas") {
    return { ...base, estado: "cerrado_sin_cobro", desde: resuelto, motivoCierre: "sin_recobro" };
  }
  let habilitado = resuelto;
  if (s.resultado === "sin_conteo") {
    if (!s.subgerenciaDecision) return { ...base, estado: "decide_subgerencia", desde: resuelto };
    const decidio = s.subgerenciaAt ? fechaBogota(s.subgerenciaAt) : resuelto;
    if (s.subgerenciaDecision === "no_cobrar") {
      return { ...base, estado: "cerrado_sin_cobro", desde: decidio, motivoCierre: "subgerencia_no_cobra" };
    }
    habilitado = decidio;
  }

  // Desde aquí el recobro está habilitado para cobro.
  const gestiones = ordenGestiones(gestionesSinOrden);
  const notif = gestiones.find((g) => g.resultado === "notificado")?.fecha ?? null;
  const plazoHasta = notif ? sumarDiasHabiles(notif, PLAZO_PAGO_DIAS_HABILES) : null;
  const acuerdos = gestiones.filter((g) => g.resultado === "acuerdo_operativo" && g.compromisoFecha);
  const acuerdoHasta = acuerdos.length ? acuerdos[acuerdos.length - 1].compromisoFecha : null;
  const h: EstadoCalculado = { ...base, habilitadoDesde: habilitado, notificadoFecha: notif, plazoHasta, acuerdoHasta };
  const cerradoEn = s.cobroAt ? fechaBogota(s.cobroAt) : hoy;

  if (s.cobroEstado === "cobrado") return { ...h, estado: "pagado", desde: cerradoEn };
  if (s.cobroEstado === "incobrable") return { ...h, estado: "cerrado_sin_cobro", desde: cerradoEn, motivoCierre: "incobrable" };
  if (s.cobroEstado === "liquidacion_definitiva") return { ...h, estado: "liquidado", desde: cerradoEn };
  const pagos = gestiones.filter((g) => (g.valorRecibido ?? 0) > 0);
  if ((s.valorRecobro ?? 0) > 0 && saldoRecobro(s.valorRecobro, gestiones, correcciones) === 0 && pagos.length) {
    return { ...h, estado: "pagado", desde: pagos[pagos.length - 1].fecha };
  }
  if (s.liquidacionMarcadaAt) return { ...h, estado: "para_liquidacion", desde: fechaBogota(s.liquidacionMarcadaAt) };
  if (s.incobrableSolicitadoAt) return { ...h, estado: "incobrable_por_autorizar", desde: fechaBogota(s.incobrableSolicitadoAt) };
  if (!notif || !plazoHasta) return { ...h, estado: "sin_gestionar", desde: habilitado };

  // Un plazo (el de 2 días o el del acuerdo) se incumple al pasar su fecha, o
  // ese mismo día si el cajero ya registró que no pagó o no vino.
  const incumplido = (hasta: string, despuesDe?: string) =>
    hoy > hasta ||
    gestiones.some((g) => g.fecha >= hasta && SIN_PAGO.has(g.resultado) && (!despuesDe || g.createdAt > despuesDe));

  if (!incumplido(plazoHasta)) {
    const ultimo = hoy === plazoHasta;
    return { ...h, estado: "en_gestion", desde: notif, detalle: ultimo ? "ultimo_dia" : null };
  }
  // Vencido: cuenta desde el día del plazo original, aunque luego haya acuerdo.
  if (acuerdoHasta) {
    const acuerdo = acuerdos[acuerdos.length - 1];
    const roto = incumplido(acuerdoHasta, acuerdo.createdAt);
    return { ...h, estado: "plazo_vencido", desde: plazoHasta, detalle: roto ? "acuerdo_incumplido" : "acuerdo_vigente" };
  }
  return { ...h, estado: "plazo_vencido", desde: plazoHasta };
}

/** Texto corto del estado, con su detalle, para la bandeja y la línea de tiempo. */
export function textoEstado(e: EstadoCalculado, hoy: string): string {
  const base = ESTADO_LABEL[e.estado];
  if (e.estado === "en_gestion") return e.detalle === "ultimo_dia" ? `${base} · último día` : `${base} · paga hasta ${e.plazoHasta}`;
  if (e.estado === "plazo_vencido") {
    const dias = diasHabilesEntre(e.desde, hoy);
    if (e.detalle === "acuerdo_vigente") return `Acuerdo con Operativo · paga ${e.acuerdoHasta}`;
    const quien = e.detalle === "acuerdo_incumplido" ? "Incumplió acuerdo" : base;
    return dias > 0 ? `${quien} · ${dias} ${dias === 1 ? "día hábil" : "días hábiles"} vencido` : quien;
  }
  return base;
}

// ── Semáforo ─────────────────────────────────────────────────────────────────

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";

/** Verde dentro de la meta (1 día hábil), ámbar de 2 a 3, rojo más de 3 o plazo vencido, gris cerrado. */
export function semaforo(e: EstadoCalculado, hoy: string): Semaforo {
  if (ESTADOS_CERRADOS.has(e.estado)) return "gris";
  if (e.estado === "plazo_vencido") return "rojo";
  const d = diasHabilesEntre(e.desde, hoy);
  return d <= 1 ? "verde" : d <= 3 ? "ambar" : "rojo";
}

// ── Registro diario de los cajeros ───────────────────────────────────────────

/**
 * Desde qué día se exige el registro diario del cajero: el 29-oct-2026 la
 * migración 20261029184904 llevó a caja los recobros de octubre que nunca
 * habían llegado. Antes de esa fecha caja no los veía, así que esos días no
 * son «sin registro del cajero».
 */
export const INICIO_REGISTRO_DIARIO = "2026-10-29";

/**
 * Días hábiles en que el recobro estaba en la bandeja del cajero y nadie
 * registró gestión. Cuenta desde el día en que se habilitó (no antes de
 * `desde`) hasta ayer (hoy todavía tiene plazo: va en «Sin gestión hoy»), o
 * hasta el día en que salió de la bandeja.
 */
export function diasSinRegistro(
  e: EstadoCalculado,
  gestiones: readonly GestionBase[],
  hoy: string,
  desde: string = INICIO_REGISTRO_DIARIO,
): string[] {
  if (!e.habilitadoDesde) return [];
  const inicio = e.habilitadoDesde > desde ? e.habilitadoDesde : desde;
  const fin = ESTADOS_CAJERO.has(e.estado) ? sumarDias(hoy, -1) : sumarDias(e.desde, -1);
  if (fin < inicio) return [];
  const conGestion = new Set(gestiones.map((g) => g.fecha));
  return diasHabilesDelRango(inicio, fin).filter((d) => !conGestion.has(d));
}

/** En la bandeja del cajero, hoy es hábil y nadie ha registrado gestión hoy. */
export const sinGestionHoy = (e: EstadoCalculado, gestiones: readonly GestionBase[], hoy: string) =>
  ESTADOS_CAJERO.has(e.estado) && esDiaHabilRecobro(hoy) && !gestiones.some((g) => g.fecha === hoy);

// ── Gestión del cajero ───────────────────────────────────────────────────────

/** Una fila del catálogo `tesoreria_recobro_resultados`. */
export interface ResultadoCatalogo {
  clave: string;
  nombre: string;
  exigeCompromiso: boolean;
  exigeValor: boolean;
  exigeObservacion: boolean;
  exigeAutorizadoPor: boolean;
  cierra: boolean;
  registra: "caja" | "operativo";
  activo: boolean;
}

export interface GestionInput {
  resultado?: string | null;
  compromisoFecha?: string | null;
  valorRecibido?: number | null;
  autorizadoPor?: string | null;
  observacion?: string | null;
  gemaCargueConfirmado?: boolean | null;
}

export interface GestionValida {
  resultado: string;
  compromisoFecha: string | null;
  valorRecibido: number | null;
  autorizadoPor: string | null;
  observacion: string | null;
  gemaCargueConfirmado: boolean;
}

const limpio = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Valida la gestión de hoy contra el catálogo y el estado del recobro. La
 * fecha de la gestión es siempre hoy: nadie registra días pasados.
 */
export function validarGestion(
  input: GestionInput,
  ctx: { catalogo: readonly ResultadoCatalogo[]; estado: EstadoCalculado; saldo: number; hoy: string },
): { ok: true; gestion: GestionValida } | { ok: false; error: string } {
  const r = ctx.catalogo.find((c) => c.clave === input.resultado && c.activo);
  if (!r) return { ok: false, error: "Elija el resultado de la gestión." };
  const { estado: e, saldo, hoy } = ctx;
  if (!ESTADOS_CAJERO.has(e.estado)) return { ok: false, error: "Este recobro no está por cobrar." };

  const observacion = limpio(input.observacion);
  if (observacion && observacion.length > 500) return { ok: false, error: "La observación no puede pasar de 500 caracteres." };
  if (r.exigeObservacion && !observacion) return { ok: false, error: `Con «${r.nombre}» escriba la observación.` };

  if (r.clave === "notificado" && e.notificadoFecha) {
    return { ok: false, error: `Al conductor ya se le notificó el ${e.notificadoFecha}.` };
  }

  let compromisoFecha: string | null = null;
  if (r.exigeCompromiso) {
    compromisoFecha = limpio(input.compromisoFecha);
    if (!compromisoFecha || !FECHA_RE.test(compromisoFecha)) return { ok: false, error: "Indique la fecha de compromiso de pago." };
    if (compromisoFecha < hoy) return { ok: false, error: "La fecha de compromiso no puede ser pasada." };
    if (!esDiaHabilRecobro(compromisoFecha)) return { ok: false, error: "La fecha de compromiso debe ser un día hábil (lunes a sábado, sin festivos)." };
    if (r.clave === "acuerdo_operativo") {
      if (e.estado !== "plazo_vencido") return { ok: false, error: "El acuerdo con Operativo se registra cuando el plazo ya venció." };
    } else {
      // Sin notificación el plazo aún no corre: se cuenta como si fuera hoy.
      const tope = e.plazoHasta ?? sumarDiasHabiles(hoy, PLAZO_PAGO_DIAS_HABILES);
      if (compromisoFecha > tope) return { ok: false, error: `La fecha de compromiso no puede pasar del plazo (${tope}).` };
    }
  }

  let autorizadoPor: string | null = null;
  if (r.exigeAutorizadoPor) {
    autorizadoPor = limpio(input.autorizadoPor);
    if (!autorizadoPor) return { ok: false, error: "Indique quién autorizó." };
    if (autorizadoPor.length > 120) return { ok: false, error: "El nombre de quien autorizó no puede pasar de 120 caracteres." };
  }

  let valorRecibido: number | null = null;
  if (r.exigeValor) {
    const v = input.valorRecibido;
    if (v == null || !Number.isInteger(v) || v <= 0) return { ok: false, error: "Escriba el valor recibido en pesos, sin decimales." };
    if (v > saldo) return { ok: false, error: `El valor recibido no puede pasar del saldo (${saldo.toLocaleString("es-CO")}).` };
    if (r.cierra && v !== saldo) {
      return { ok: false, error: `«${r.nombre}» exige recibir el saldo completo (${saldo.toLocaleString("es-CO")}). Si pagó una parte, use «Abono parcial».` };
    }
    if (!r.cierra && v === saldo) return { ok: false, error: "Ese valor cubre todo el saldo: registre «Pagó completo»." };
    valorRecibido = v;
  }

  const gemaCargueConfirmado = !!input.gemaCargueConfirmado;
  if (r.cierra && !gemaCargueConfirmado) {
    return { ok: false, error: "Confirme que ya cargó en GEMA las timbradas del recobro al conductor con la fecha de hoy." };
  }

  return { ok: true, gestion: { resultado: r.clave, compromisoFecha, valorRecibido, autorizadoPor, observacion, gemaCargueConfirmado } };
}

// ── Correcciones (las valida el director de Mantenimiento) ───────────────────

export type CampoCorreccion = "conteo_camara" | "resultado" | "diferencia" | "valor_recibido";

export const CAMPO_CORRECCION_LABEL: Record<CampoCorreccion, string> = {
  conteo_camara: "Conteo de cámara",
  resultado: "Resultado de la revisión",
  diferencia: "Diferencia (cartulina)",
  valor_recibido: "Valor recibido",
};

export interface CorreccionInput {
  campo?: string | null;
  valorNuevo?: string | number | null;
  gestionId?: string | null;
  motivo?: string | null;
}

export function validarCorreccion(
  input: CorreccionInput,
  ctx: {
    tipo: TipoSolicitud;
    estado: EstadoCalculado;
    conteoActual: number | null;
    diferenciaActual: number | null;
    resultadoActual: ResultadoRevision | null;
    /** Valor vigente (corregido si ya lo fue) de cada gestión con dinero. */
    valoresRecibidos: ReadonlyMap<string, number>;
    valorRecobro: number;
    totalRecibido: number;
  },
): { ok: true; campo: CampoCorreccion; valorNuevo: string; valorAnterior: string | null; gestionId: string | null; motivo: string } | { ok: false; error: string } {
  const motivo = limpio(input.motivo);
  if (!motivo) return { ok: false, error: "Escriba el motivo de la corrección." };
  if (motivo.length > 500) return { ok: false, error: "El motivo no puede pasar de 500 caracteres." };
  if (["anulada", "liquidado"].includes(ctx.estado.estado)) return { ok: false, error: "Este recobro ya no admite correcciones." };
  const campo = input.campo as CampoCorreccion;
  const entero = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  switch (campo) {
    case "conteo_camara": {
      if (ctx.tipo !== "camara") return { ok: false, error: "El conteo de cámara solo existe en solicitudes de cámara." };
      const n = entero(input.valorNuevo);
      if (n == null || n > 500) return { ok: false, error: "El conteo debe ser un número entero de pasajeros." };
      if (n === ctx.conteoActual) return { ok: false, error: "El conteo nuevo es igual al actual." };
      return { ok: true, campo, valorNuevo: String(n), valorAnterior: ctx.conteoActual == null ? null : String(ctx.conteoActual), gestionId: null, motivo };
    }
    case "diferencia": {
      if (ctx.tipo !== "cartulina") return { ok: false, error: "La diferencia solo se digita en solicitudes de cartulina." };
      const n = entero(input.valorNuevo);
      if (n == null || n > 500) return { ok: false, error: "La diferencia debe ser un número entero de timbradas." };
      if (n === ctx.diferenciaActual) return { ok: false, error: "La diferencia nueva es igual a la actual." };
      return { ok: true, campo, valorNuevo: String(n), valorAnterior: ctx.diferenciaActual == null ? null : String(ctx.diferenciaActual), gestionId: null, motivo };
    }
    case "resultado": {
      const v = String(input.valorNuevo ?? "");
      if (!["recobro", "normalidad_timbradas", "sin_conteo"].includes(v)) return { ok: false, error: "Elija el resultado correcto." };
      if (v === ctx.resultadoActual) return { ok: false, error: "El resultado nuevo es igual al actual." };
      if (ctx.totalRecibido > 0 && v !== "recobro") {
        return { ok: false, error: "El conductor ya pagó parte del recobro: primero corrija los valores recibidos." };
      }
      return { ok: true, campo, valorNuevo: v, valorAnterior: ctx.resultadoActual, gestionId: null, motivo };
    }
    case "valor_recibido": {
      const gid = limpio(input.gestionId);
      const actual = gid ? ctx.valoresRecibidos.get(gid) : undefined;
      if (!gid || actual == null) return { ok: false, error: "Elija la gestión con el valor que se corrige." };
      const n = entero(input.valorNuevo);
      if (n == null) return { ok: false, error: "El valor debe ser en pesos, sin decimales." };
      if (n === actual) return { ok: false, error: "El valor nuevo es igual al actual." };
      if (ctx.totalRecibido - actual + n > ctx.valorRecobro) return { ok: false, error: "Con ese valor lo recibido pasaría del valor del recobro." };
      return { ok: true, campo, valorNuevo: String(n), valorAnterior: String(actual), gestionId: gid, motivo };
    }
    default:
      return { ok: false, error: "Elija qué se corrige." };
  }
}

// ── Quién puede hacer qué ────────────────────────────────────────────────────

export interface RolRecobros {
  auxiliar: boolean;
  mantenimiento: boolean;
  directorMantenimiento: boolean;
  subgerencia: boolean;
  caja: boolean;
  operativo: boolean;
  directora: boolean;
}

export type AccionRecobro =
  | "tomar" | "resolver" | "decidir_subgerencia" | "gestionar" | "instruccion_operativo"
  | "solicitar_incobrable" | "registrar_incobrable" | "marcar_liquidacion" | "cerrar_liquidacion"
  | "solicitar_correccion" | "validar_correccion" | "reabrir_incobrable";

/** Null si el rol puede hacer la acción con el recobro en ese estado; si no, el porqué. */
export function motivoNoPermitido(accion: AccionRecobro, e: EstadoCalculado, rol: RolRecobros, tipo: TipoSolicitud): string | null {
  const est = e.estado;
  switch (accion) {
    case "tomar":
      if (tipo === "camara" ? !rol.mantenimiento : !rol.auxiliar) return "Esta revisión la toma quien la resuelve.";
      return est === "solicitud_creada" ? null : "La revisión ya se tomó o se cerró.";
    case "resolver":
      if (tipo === "camara" ? !rol.mantenimiento : !rol.auxiliar) {
        return tipo === "camara" ? "Solo Mantenimiento resuelve la revisión de cámara." : "Solo la auxiliar de Tesorería resuelve la revisión de cartulina.";
      }
      return est === "solicitud_creada" || est === "en_revision" ? null : "La revisión ya tiene resultado.";
    case "decidir_subgerencia":
      if (!rol.subgerencia) return "Solo subgerencia decide si se cobra sin conteo de cámara.";
      return est === "decide_subgerencia" ? null : "Este recobro no está esperando decisión de subgerencia.";
    case "gestionar":
      if (!rol.caja) return "Solo los cajeros registran la gestión de cobro.";
      return ESTADOS_CAJERO.has(est) ? null : "Este recobro no está por cobrar.";
    case "instruccion_operativo":
      if (!rol.operativo) return "Solo Operativo registra su instrucción.";
      return est === "plazo_vencido" ? null : "Operativo interviene cuando el plazo de pago ya venció.";
    case "solicitar_incobrable":
      if (!rol.caja) return "Solo caja solicita el incobrable.";
      if (est === "incobrable_por_autorizar") return "Ya hay una solicitud de incobrable esperando.";
      return ESTADOS_CAJERO.has(est) ? null : "Este recobro no está por cobrar.";
    case "registrar_incobrable":
      if (!rol.directora) return "Solo la directora de Tesorería registra la autorización de subgerencia.";
      return est === "incobrable_por_autorizar" ? null : "No hay una solicitud de incobrable por decidir.";
    case "marcar_liquidacion":
      if (!rol.directora) return "Solo la directora de Tesorería pasa un recobro a liquidación definitiva.";
      return ESTADOS_CAJERO.has(est) ? null : "Solo un recobro por cobrar pasa a liquidación definitiva.";
    case "cerrar_liquidacion":
      if (!rol.directora) return "Solo la directora de Tesorería cierra la liquidación definitiva.";
      return est === "para_liquidacion" ? null : "Este recobro no está para liquidación definitiva.";
    case "solicitar_correccion":
      if (!(rol.auxiliar || rol.mantenimiento || rol.caja || rol.directora || rol.directorMantenimiento)) {
        return "Piden correcciones la auxiliar de Tesorería, caja, la directora y el director de Mantenimiento.";
      }
      return est === "anulada" || est === "liquidado" || est === "solicitud_creada" || est === "en_revision"
        ? "Este recobro no admite correcciones."
        : null;
    case "validar_correccion":
      return rol.directorMantenimiento ? null : "Solo el director de Mantenimiento valida las correcciones.";
    case "reabrir_incobrable":
      if (!rol.directora) return "Solo la directora de Tesorería reabre un incobrable.";
      return est === "cerrado_sin_cobro" && e.motivoCierre === "incobrable" ? null : "Solo se reabre un recobro cerrado como incobrable.";
  }
}

// ── Subgerencia e incobrable ─────────────────────────────────────────────────

/**
 * Decisión de subgerencia cuando la cámara no tiene conteo. Observación
 * obligatoria. Para cobrar, como no hay conteo, subgerencia fija las
 * timbradas a cobrar (con lo que muestra el sensor u otra evidencia).
 */
export function validarDecisionSubgerencia(input: { decision?: string | null; timbradas?: number | null; nota?: string | null }):
  { ok: true; decision: DecisionSubgerencia; timbradas: number | null; nota: string } | { ok: false; error: string } {
  const decision = input.decision as DecisionSubgerencia;
  if (decision !== "cobrar" && decision !== "no_cobrar") return { ok: false, error: "Elija Cobrar o No cobrar." };
  const nota = limpio(input.nota);
  if (!nota) return { ok: false, error: "Escriba la observación de la decisión." };
  if (nota.length > 500) return { ok: false, error: "La observación no puede pasar de 500 caracteres." };
  if (decision === "no_cobrar") return { ok: true, decision, timbradas: null, nota };
  const t = input.timbradas;
  if (t == null || !Number.isInteger(t) || t <= 0 || t > 500) {
    return { ok: false, error: "Para cobrar, indique cuántas timbradas se cobran (número entero mayor que 0)." };
  }
  return { ok: true, decision, timbradas: t, nota };
}

/**
 * La directora registra el incobrable que autorizó subgerencia por fuera de
 * Gestivo (D1): quién lo autorizó, cuándo y el soporte (correo o acta).
 */
export function validarRegistroIncobrable(
  input: { nombre?: string | null; fecha?: string | null; soporte?: string | null },
  ctx: { hoy: string; solicitadoEn: string | null },
): { ok: true; nombre: string; fecha: string; soporte: string } | { ok: false; error: string } {
  const nombre = limpio(input.nombre);
  if (!nombre || nombre.length < 3) return { ok: false, error: "Escriba quién autorizó el incobrable en subgerencia." };
  if (nombre.length > 120) return { ok: false, error: "El nombre no puede pasar de 120 caracteres." };
  const fecha = limpio(input.fecha);
  if (!fecha || !FECHA_RE.test(fecha)) return { ok: false, error: "Indique la fecha de la autorización." };
  if (fecha > ctx.hoy) return { ok: false, error: "La fecha de la autorización no puede ser futura." };
  if (ctx.solicitadoEn && fecha < ctx.solicitadoEn) return { ok: false, error: "La autorización no puede ser anterior a la solicitud de incobrable." };
  const soporte = limpio(input.soporte);
  if (!soporte) return { ok: false, error: "Indique el soporte de la autorización (correo, acta o documento)." };
  if (soporte.length > 200) return { ok: false, error: "El soporte no puede pasar de 200 caracteres." };
  return { ok: true, nombre, fecha, soporte };
}

// ── Aplicar una corrección aprobada ──────────────────────────────────────────

/** Lo vigente del recobro que una corrección puede cambiar. */
export interface SnapshotCorregible {
  tipo: TipoSolicitud;
  fechaViaje: string;
  resultado: ResultadoRevision | null;
  conteo: number | null;
  timbradas: number | null;
  diferencia: number | null;
  pasaje: number | null;
}

/**
 * Columnas de la solicitud que cambian al aprobar una corrección de conteo,
 * diferencia o resultado. El valor se recalcula con el pasaje guardado (o la
 * tarifa). El valor recibido no se toca aquí: sale de las gestiones con sus
 * correcciones aprobadas encima.
 */
export function aplicarCorreccion(
  s: SnapshotCorregible,
  campo: Exclude<CampoCorreccion, "valor_recibido">,
  valorNuevo: string,
  tarifas: Tarifas = TARIFAS_POR_DEFECTO,
): Record<string, unknown> {
  const pasaje = s.pasaje ?? tarifaDelDia(s.fechaViaje, tarifas);
  const valorDe = (dif: number | null) => (dif != null && dif > 0 ? dif * pasaje : 0);
  if (campo === "conteo_camara") {
    const conteo = Number(valorNuevo);
    const dif = s.timbradas == null ? null : conteo - s.timbradas;
    return {
      conteo_camara: conteo, diferencia: dif, pasaje,
      valor_recobro: s.resultado === "recobro" ? valorDe(dif) : s.resultado === "normalidad_timbradas" ? 0 : null,
    };
  }
  if (campo === "diferencia") {
    const dif = Number(valorNuevo);
    return { diferencia: dif, pasaje, valor_recobro: valorDe(dif) };
  }
  const resultado = valorNuevo as ResultadoRevision;
  if (resultado === "sin_conteo") {
    return { resultado, conteo_camara: null, diferencia: null, valor_recobro: null };
  }
  const dif = s.tipo === "camara" && s.conteo != null && s.timbradas != null ? s.conteo - s.timbradas : s.diferencia;
  return { resultado, diferencia: dif, pasaje, valor_recobro: resultado === "recobro" ? valorDe(dif) : 0 };
}

// ── Liquidación definitiva ───────────────────────────────────────────────────

export const CONCEPTOS_LIQUIDACION = {
  descontado_total: "Descontado total en la liquidación",
  descontado_parcial: "Descontado parcial en la liquidación",
  no_descontable: "No descontable",
  otro: "Otro (ver nota)",
} as const;
export type ConceptoLiquidacion = keyof typeof CONCEPTOS_LIQUIDACION;

export function validarCierreLiquidacion(
  input: { concepto?: string | null; valorDescontado?: number | null; soporte?: string | null; nota?: string | null },
  saldo: number,
): { ok: true; concepto: ConceptoLiquidacion; valorDescontado: number; soporte: string; nota: string | null } | { ok: false; error: string } {
  const concepto = input.concepto as ConceptoLiquidacion;
  if (!concepto || !(concepto in CONCEPTOS_LIQUIDACION)) return { ok: false, error: "Elija el concepto de la liquidación definitiva." };
  const nota = limpio(input.nota);
  if (nota && nota.length > 500) return { ok: false, error: "La nota no puede pasar de 500 caracteres." };
  if (concepto === "otro" && !nota) return { ok: false, error: "Con «Otro» escriba la nota." };
  const soporte = limpio(input.soporte);
  if (!soporte) return { ok: false, error: "Indique el soporte (número de la liquidación o documento)." };
  if (soporte.length > 100) return { ok: false, error: "El soporte no puede pasar de 100 caracteres." };
  const v = concepto === "no_descontable" ? 0 : input.valorDescontado;
  if (v == null || !Number.isInteger(v) || v < 0) return { ok: false, error: "Escriba el valor descontado en pesos, sin decimales." };
  if (v > saldo) return { ok: false, error: `Lo descontado no puede pasar del saldo (${saldo.toLocaleString("es-CO")}).` };
  if (concepto === "descontado_total" && v !== saldo) return { ok: false, error: "«Descontado total» es el saldo completo." };
  if (concepto === "descontado_parcial" && (v === 0 || v === saldo)) return { ok: false, error: "«Descontado parcial» es más de 0 y menos que el saldo." };
  return { ok: true, concepto, valorDescontado: v, soporte, nota };
}

// ── Solicitudes desde los abonos «REVISIÓN CÁMARA» de GEMA ───────────────────

/** Concepto del abono en GEMA, comparado sin tildes ni mayúsculas (GEMA a veces pierde la tilde). */
export const esConceptoRevisionCamara = (concepto: string | null | undefined) =>
  (concepto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase() === "REVISION CAMARA";

export interface AbonoRevision {
  idAbono: number;
  idViaje: number | null;
  /** Fecha y hora local de Colombia tal como la entrega GEMA («2026-10-28T22:09:20»). */
  fechaAbono: string;
  fechaViaje: string | null;
  numViaje: number | null;
  codigoVehiculo: string | null;
  placa: string | null;
  valor: number | null;
  /** 0 por gestionar, 1 gestionado, 2 anulado. */
  estado: number | null;
  usuario: string | null;
}

export interface SolicitudExistente {
  id: string;
  numero: number;
  origen: OrigenSolicitud;
  abonoId: number | null;
  abonoFecha: string | null;
  estado: "pendiente" | "resuelto";
  tomadoAt: string | null;
  anuladaAt: string | null;
  alertas: string[];
  /** Para el cierre por GEMA: lo que la revisión decidió y si ya se cerró el cobro. */
  resultado?: ResultadoRevision | null;
  subgerenciaDecision?: DecisionSubgerencia | null;
  cobroEstado?: CobroEstado | null;
  valorRecobro?: number | null;
}

/** Estados del abono en GEMA. */
export const ABONO_POR_GESTIONAR = 0;
export const ABONO_GESTIONADO = 1;
export const ABONO_ANULADO = 2;

export interface PlanAbonos {
  /** Abonos que abren solicitud nueva (uno por viaje). */
  crear: AbonoRevision[];
  /** El viaje ya tenía solicitud (de cartulina o de Mantenimiento): se le anota el abono. */
  vincular: { solicitudId: string; abono: AbonoRevision }[];
  /**
   * GEMA anuló o borró el abono y nadie había tomado la revisión, o GEMA lo
   * gestionó antes de la revisión (`aunqueTomada`: se anula aunque esté tomada).
   */
  anular: { solicitudId: string; motivo: string; aunqueTomada?: boolean }[];
  /** Igual, pero la revisión ya se tomó o se resolvió: solo se avisa. */
  alertar: { solicitudId: string; alerta: string }[];
  /** GEMA gestionó (cobró) el abono de un recobro habilitado: queda cobrado por el valor del recobro. */
  cobrar: { solicitudId: string; abono: AbonoRevision; valor: number }[];
}

export const ALERTA_ABONO_ANULADO = "abono_anulado_en_gema";
/** GEMA gestionó el abono de un recobro sin valor que cobrar (p. ej. sin conteo y sin decisión). */
export const ALERTA_GESTIONADO_SIN_VALOR = "gestionado_en_gema_sin_valor";

/** El recobro quedó habilitado para cobro (recobro o «sin conteo» que subgerencia decidió cobrar). */
const recobroHabilitado = (s: Pick<SolicitudExistente, "resultado" | "subgerenciaDecision">) =>
  s.resultado === "recobro" || (s.resultado === "sin_conteo" && s.subgerenciaDecision === "cobrar");

/**
 * Qué hacer con los abonos de un rango de días ya sincronizado. Solo cuentan
 * los del concepto «REVISIÓN CÁMARA», no anulados y desde la fecha de
 * arranque (D2: no se cargan los anteriores). Es idempotente: repetirlo con
 * los mismos abonos no crea ni anula nada nuevo.
 *
 * El recaudo se hace solo en GEMA: cuando el cajero gestiona el abono allá
 * (estado 1, GESTIONADO = cobrado), la solicitud que aún esperaba la cámara se
 * anula y el recobro habilitado queda cobrado. Un abono ya gestionado no abre
 * solicitud nueva.
 */
export function planSolicitudesDesdeAbonos(
  abonos: readonly AbonoRevision[],
  existentes: readonly SolicitudExistente[],
  opciones: { arranque: string; rango: { desde: string; hasta: string } },
): PlanAbonos {
  const plan: PlanAbonos = { crear: [], vincular: [], anular: [], alertar: [], cobrar: [] };
  const vigentes = abonos
    .filter((a) => a.estado !== 2 && a.idViaje != null && a.fechaAbono.slice(0, 10) >= opciones.arranque)
    .sort((a, b) => a.fechaAbono.localeCompare(b.fechaAbono) || a.idAbono - b.idAbono);
  const porAbono = new Map(existentes.filter((s) => s.abonoId != null).map((s) => [s.abonoId!, s]));
  const porViaje = new Map(existentes.map((s) => [s.numero, s]));
  const viajesEnPlan = new Set<number>();

  for (const a of vigentes) {
    if (porAbono.has(a.idAbono)) continue;
    const viaje = a.idViaje!;
    if (viajesEnPlan.has(viaje)) continue; // un segundo abono del mismo viaje no abre otra revisión
    const ya = porViaje.get(viaje);
    if (ya) {
      if (ya.abonoId == null) plan.vincular.push({ solicitudId: ya.id, abono: a });
    } else if (a.estado !== ABONO_GESTIONADO) {
      plan.crear.push(a);
    }
    viajesEnPlan.add(viaje);
  }

  const idsVigentes = new Set(vigentes.map((a) => a.idAbono));
  const anulados = new Map(abonos.filter((a) => a.estado === 2).map((a) => [a.idAbono, a]));
  for (const s of existentes) {
    if (s.origen !== "abono_gema" || s.abonoId == null || !s.abonoFecha || s.anuladaAt) continue;
    if (s.abonoFecha < opciones.rango.desde || s.abonoFecha > opciones.rango.hasta) continue;
    if (idsVigentes.has(s.abonoId)) continue;
    const motivo = anulados.has(s.abonoId)
      ? `GEMA anuló el abono n.º ${s.abonoId}.`
      : `El abono n.º ${s.abonoId} ya no está en GEMA.`;
    if (s.estado === "pendiente" && !s.tomadoAt) plan.anular.push({ solicitudId: s.id, motivo });
    else if (!s.alertas.includes(ALERTA_ABONO_ANULADO)) plan.alertar.push({ solicitudId: s.id, alerta: ALERTA_ABONO_ANULADO });
  }

  // Abonos gestionados (cobrados) en GEMA. Va por el abono de la solicitud,
  // también el que se vinculó en esta misma pasada.
  const gestionados = new Map(vigentes.filter((a) => a.estado === ABONO_GESTIONADO).map((a) => [a.idAbono, a]));
  const abonoDe = new Map(existentes.map((s) => [s.id, s.abonoId]));
  for (const v of plan.vincular) abonoDe.set(v.solicitudId, v.abono.idAbono);
  for (const s of existentes) {
    const id = abonoDe.get(s.id);
    const a = id != null ? gestionados.get(id) : undefined;
    if (!a || s.anuladaAt) continue;
    if (s.estado === "pendiente") {
      // Tomada o no: GEMA ya lo gestionó, la cámara no tiene nada que revisar.
      plan.anular.push({
        solicitudId: s.id, aunqueTomada: true,
        motivo: `GEMA gestionó (cobró) el abono n.º ${a.idAbono} antes de la revisión de cámara.`,
      });
    } else if (recobroHabilitado(s) && !s.cobroEstado) {
      if ((s.valorRecobro ?? 0) > 0) plan.cobrar.push({ solicitudId: s.id, abono: a, valor: s.valorRecobro! });
      else if (!s.alertas.includes(ALERTA_GESTIONADO_SIN_VALOR)) plan.alertar.push({ solicitudId: s.id, alerta: ALERTA_GESTIONADO_SIN_VALOR });
    }
  }
  return plan;
}

// ── Resolución de la revisión (Mantenimiento o la auxiliar) ──────────────────

export const RESULTADO_REVISION_LABEL: Record<ResultadoRevision, string> = {
  recobro: "Recobro",
  normalidad_timbradas: "Sin recobro",
  sin_conteo: "Sin conteo de cámara",
};

/**
 * Valida el resultado que registra quien revisa. Recobro exige el conteo y
 * una diferencia positiva; «Sin recobro» no admite un conteo que dé
 * diferencia (eso es un recobro); «Sin conteo» va sin conteo y lo decide
 * subgerencia. La diferencia sale de las timbradas de GEMA, nadie la digita.
 */
export function validarResolucion(
  input: { resultado?: string | null; conteo?: number | null; nota?: string | null },
  ctx: { timbradas: number | null },
): { ok: true; resultado: ResultadoRevision; conteo: number | null; nota: string | null } | { ok: false; error: string } {
  const resultado = input.resultado as ResultadoRevision;
  if (!(resultado in RESULTADO_REVISION_LABEL)) return { ok: false, error: "Elija el resultado de la revisión." };
  const nota = limpio(input.nota);
  if (nota && nota.length > 1000) return { ok: false, error: "La nota no puede pasar de 1000 caracteres." };
  const c = input.conteo;
  const conteo = c == null || (typeof c === "number" && Number.isNaN(c)) ? null : c;
  if (conteo != null && (!Number.isInteger(conteo) || conteo < 0 || conteo > 500)) {
    return { ok: false, error: "El conteo debe ser un número entero de pasajeros." };
  }
  if (resultado === "sin_conteo") {
    if (conteo != null) return { ok: false, error: "Con conteo de cámara elija «Recobro» o «Sin recobro»." };
    if (!nota) return { ok: false, error: "Explique por qué no hay conteo (por ejemplo, la cámara no grabó)." };
    return { ok: true, resultado, conteo: null, nota };
  }
  if (resultado === "recobro" && conteo == null) return { ok: false, error: "Escriba los pasajeros que contó en el video." };
  if (conteo != null) {
    if (ctx.timbradas == null) return { ok: false, error: "GEMA no tiene las timbradas de ese viaje: actualice desde GEMA e intente de nuevo." };
    const dif = conteo - ctx.timbradas;
    if (resultado === "recobro" && dif <= 0) {
      return { ok: false, error: `El conteo (${conteo}) no supera las timbradas de la registradora (${ctx.timbradas}): no hay recobro.` };
    }
    if (resultado === "normalidad_timbradas" && dif > 0) {
      return { ok: false, error: `El conteo da ${dif} ${dif === 1 ? "timbrada" : "timbradas"} sin registrar: es un recobro.` };
    }
  }
  return { ok: true, resultado, conteo, nota };
}

// ── Recobro por cartulina (lo define la auxiliar de Tesorería) ───────────────

/**
 * Sugerencia de la diferencia sin justificar en la revisión de cartulina: lo
 * que el descuento real del viaje pasa del autorizado por la tabla. Null si
 * no hay exceso o faltan datos; la auxiliar decide el número final.
 */
export function excesoDescuento(i: { timR: number | null; timNeto: number | null; autorizado: number | null }): number | null {
  if (i.timR == null || i.timNeto == null || i.autorizado == null) return null;
  const exceso = i.timR - i.timNeto - i.autorizado;
  return exceso > 0 ? exceso : null;
}

/** Diferencia sin justificar y observación del recobro por cartulina. */
export function validarRecobroCartulina(input: { diferencia?: number | null; nota?: string | null }):
  { ok: true; diferencia: number; nota: string } | { ok: false; error: string } {
  const d = input.diferencia;
  if (d == null || !Number.isInteger(d) || d <= 0) {
    return { ok: false, error: "Escriba la diferencia de timbradas sin justificar (un número entero mayor que 0)." };
  }
  if (d > 500) return { ok: false, error: "La diferencia no puede pasar de 500 timbradas." };
  const nota = limpio(input.nota);
  if (!nota) return { ok: false, error: "Escriba la observación del recobro." };
  if (nota.length > 500) return { ok: false, error: "La observación no puede pasar de 500 caracteres." };
  return { ok: true, diferencia: d, nota };
}

/** Lo que ya hay abierto para el viaje en `tesoreria_camaras_solicitudes`. */
export interface SolicitudDelViaje {
  tipo: TipoSolicitud;
  anuladaAt: string | null;
}

/**
 * Qué pasa con la marca de un viaje en la revisión de cartulina según su
 * solicitud: «crear» abre el recobro, «conservar» deja el recobro que ya hay
 * (solo se guarda la marca) y un error impide el cambio. Un recobro ya creado
 * no se deshace quitando o cambiando la marca: eso es una corrección.
 */
export function decidirMarcaCartulina(
  generaRecobro: boolean,
  existente: SolicitudDelViaje | null,
): { accion: "crear" | "conservar" | "nada" } | { error: string } {
  const vigente = existente && !existente.anuladaAt ? existente : null;
  if (generaRecobro) {
    if (!vigente) return { accion: "crear" };
    if (vigente.tipo === "cartulina") return { accion: "conservar" };
    return { error: "Este viaje ya tiene una solicitud de revisión de cámara: el recobro sale de esa revisión." };
  }
  if (vigente?.tipo === "cartulina") {
    return { error: "Este viaje ya generó un recobro por cartulina. Para cambiarlo, pida una corrección; no se quita desde aquí." };
  }
  return { accion: "nada" };
}

// ── Resumen, rankings y orden de la bandeja ──────────────────────────────────

/** Lo que el resumen y los rankings necesitan de cada recobro. */
export interface FilaRecobro {
  tipo: TipoSolicitud;
  fechaViaje: string;
  conductorCedula: string | null;
  conductorNombre: string | null;
  vehiculoCodigo: string | null;
  /** Timbradas no registradas (diferencia positiva); 0 o null si no hay recobro. */
  diferencia: number | null;
  valorRecobro: number | null;
  recibido: number;
  inicioRevision: string;
  resueltoEn: string | null;
  estado: EstadoCalculado;
  sinGestionHoy: boolean;
}

/** Cuenta como recobro habilitado: confirmado por cámara o cartulina, o subgerencia decidió cobrar. */
export const esHabilitado = (f: Pick<FilaRecobro, "estado">) => f.estado.habilitadoDesde != null;

export interface Resumen {
  recobrosHabilitados: number;
  timbradasNoRegistradas: number;
  valorDejadoDeCobrar: number;
  porCobrar: number;
  recaudado: number;
  diasPromedioRevision: number | null;
  sinGestionHoy: number;
}

/** Tarjetas del resumen sobre los recobros del periodo (por fecha del viaje). */
export function resumen(filas: readonly FilaRecobro[]): Resumen {
  const r: Resumen = {
    recobrosHabilitados: 0, timbradasNoRegistradas: 0, valorDejadoDeCobrar: 0,
    porCobrar: 0, recaudado: 0, diasPromedioRevision: null, sinGestionHoy: 0,
  };
  const dias: number[] = [];
  for (const f of filas) {
    if (f.resueltoEn) dias.push(Math.max(0, diasHabilesEntre(f.inicioRevision, f.resueltoEn)));
    if (f.sinGestionHoy) r.sinGestionHoy++;
    if (!esHabilitado(f)) continue;
    r.recobrosHabilitados++;
    r.timbradasNoRegistradas += Math.max(0, f.diferencia ?? 0);
    r.valorDejadoDeCobrar += f.valorRecobro ?? 0;
    r.recaudado += f.recibido;
    if (ESTADOS_CAJERO.has(f.estado.estado) || f.estado.estado === "para_liquidacion") {
      r.porCobrar += Math.max(0, (f.valorRecobro ?? 0) - f.recibido);
    }
  }
  r.diasPromedioRevision = dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null;
  return r;
}

export interface PuestoRanking {
  clave: string;
  nombre: string;
  timbradas: number;
  valor: number;
  viajes: number;
}

/** Conductores o busetas con más timbradas no registradas (solo recobros habilitados). */
export function ranking(filas: readonly FilaRecobro[], por: "conductor" | "buseta", top = 10): PuestoRanking[] {
  const m = new Map<string, PuestoRanking>();
  for (const f of filas) {
    // Sin timbradas no registradas (recobro sin conteo) no entra al ranking.
    if (!esHabilitado(f) || (f.diferencia ?? 0) <= 0) continue;
    const clave = por === "conductor" ? f.conductorCedula ?? f.conductorNombre ?? "sin dato" : f.vehiculoCodigo ?? "sin dato";
    const nombre = por === "conductor" ? f.conductorNombre ?? clave : clave;
    const p = m.get(clave) ?? { clave, nombre, timbradas: 0, valor: 0, viajes: 0 };
    p.timbradas += Math.max(0, f.diferencia ?? 0);
    p.valor += f.valorRecobro ?? 0;
    p.viajes++;
    m.set(clave, p);
  }
  return [...m.values()].sort((a, b) => b.timbradas - a.timbradas || b.valor - a.valor || a.nombre.localeCompare(b.nombre)).slice(0, top);
}

const PESO_SEMAFORO: Record<Semaforo, number> = { rojo: 0, ambar: 1, verde: 2, gris: 3 };

/** Lo más urgente primero: rojos, ámbar, verdes y cerrados; dentro de cada color, mayor valor. */
export function ordenUrgencia<T extends { semaforo: Semaforo; valorRecobro: number | null }>(filas: readonly T[]): T[] {
  return [...filas].sort((a, b) => PESO_SEMAFORO[a.semaforo] - PESO_SEMAFORO[b.semaforo] || (b.valorRecobro ?? 0) - (a.valorRecobro ?? 0));
}
