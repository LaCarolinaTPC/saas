/**
 * La página de Recobros (`/tesoreria/recobros`) en filas listas para pintar:
 * estado, semáforo, saldo, última gestión y días sin registro de cada
 * solicitud, con los filtros de la bandeja y el periodo del resumen. Puro: lo
 * usan la página (servidor), la pantalla, el Excel y las pruebas.
 */

import { sumarDias } from "./calendario-pago";
import {
  ABONO_GESTIONADO, ABONO_POR_GESTIONAR, diasHabilesEntre, diasSinRegistro, ESTADOS_CAJERO, estadoRecobro, fechaBogota, inicioRevision, semaforo,
  sinGestionHoy, textoEstado, valorRecibidoTotal,
  type CorreccionValorRecibido, type EstadoCalculado, type EstadoRecobro, type FilaRecobro, type GestionBase,
  type OrigenSolicitud, type ResultadoRevision, type RolRecobros, type Semaforo, type SolicitudBase, type TipoSolicitud,
} from "./recobros";

/** Lo que la vista necesita de una solicitud (ver `Recobro` en recobros-data). */
export interface SolicitudVista extends SolicitudBase {
  id: string;
  numero: number;
  viaje: number | null;
  placa: string | null;
  vehiculoCodigo: string | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
  ruta: string | null;
  motivoSolicitud: string | null;
  notaSolicitud: string | null;
  solicitadoPorEmail: string | null;
  tomadoPorEmail: string | null;
  notaCamaras: string | null;
  resueltoPorEmail: string | null;
  timbradasRegistradora: number | null;
  conteoCamara: number | null;
  diferencia: number | null;
  subgerenciaNota: string | null;
  subgerenciaPorEmail: string | null;
  cobroValor: number | null;
  pasaje?: number | null;
  alertas: string[];
  incobrableMotivo?: string | null;
  incobrableAutorizaNombre?: string | null;
  incobrableAutorizaFecha?: string | null;
  incobrableSoporte?: string | null;
  incobrableAutorizadoPorEmail?: string | null;
  liquidacionConcepto?: string | null;
  liquidacionValorDescontado?: number | null;
  liquidacionSoporte?: string | null;
  liquidacionNota?: string | null;
  /** Estado del abono en GEMA (0 por gestionar, 1 gestionado = cobrado, 2 anulado); null o ausente sin abono. */
  gemaAbonoEstado?: number | null;
}

export interface GestionVista extends GestionBase {
  observacion: string | null;
  autorizadoPor: string | null;
  usuarioEmail: string | null;
  rol: string;
}

export interface CorreccionVista {
  campo: string;
  gestionId: string | null;
  valorNuevo: string;
  decision: "aprobada" | "rechazada" | null;
  id?: string;
  valorAnterior?: string | null;
  motivo?: string;
  solicitadoPorEmail?: string;
  solicitadoAt?: string;
  decisionNota?: string | null;
  decididoPorEmail?: string | null;
  decididoAt?: string | null;
}

export interface FilaBandeja extends FilaRecobro {
  id: string;
  origen: OrigenSolicitud;
  numero: number;
  viaje: number | null;
  placa: string | null;
  ruta: string | null;
  resultado: ResultadoRevision | null;
  registradora: number | null;
  conteo: number | null;
  saldo: number;
  /** Estado del abono «REVISIÓN CÁMARA» en GEMA; null si el viaje no tiene abono. */
  gemaAbono: number | null;
  semaforo: Semaforo;
  textoEstado: string;
  diasEnEstado: number;
  /** Días hábiles desde que se habilitó el recobro (null si no es recobro habilitado o ya se pagó). */
  diasSinPagar: number | null;
  /** Días hábiles en que el recobro estuvo en la bandeja de caja sin gestión. */
  diasSinRegistro: string[];
  ultimaGestion: { fecha: string; usuario: string | null; resultado: string; compromiso: string | null } | null;
  gestiones: GestionVista[];
  correccionesPendientes: number;
  correcciones: CorreccionVista[];
  /** Pasaje con que se calculó el valor (para estimar correcciones y la decisión de subgerencia). */
  pasaje: number | null;
  incobrable: { motivo: string | null; autorizaNombre: string | null; autorizaFecha: string | null; soporte: string | null; registradoPor: string | null };
  liquidacion: { concepto: string | null; valorDescontado: number | null; soporte: string | null; nota: string | null };
  solicitud: {
    motivo: string | null;
    nota: string | null;
    por: string | null;
    at: string;
    tomadoPor: string | null;
    tomadoAt: string | null;
    notaRevision: string | null;
    resueltoPor: string | null;
    resueltoAt: string | null;
    subgerenciaDecision: string | null;
    subgerenciaNota: string | null;
    subgerenciaPor: string | null;
    subgerenciaAt: string | null;
    anuladaAt: string | null;
  };
  alertas: string[];
  /**
   * Viajes del conductor en GEMA por día, para los días con gestión «No vino
   * a trabajar» y para hoy si está por cobrar. Lo agrega la página.
   */
  viajesDelDia?: Record<string, number>;
}

/** Días cuyo despacho del conductor hay que mirar: los de «No vino» y hoy si está por cobrar. */
export function diasParaViajes(f: Pick<FilaBandeja, "estado" | "gestiones">, hoy: string): string[] {
  const dias = new Set(f.gestiones.filter((g) => g.resultado === "no_vino").map((g) => g.fecha));
  if (ESTADOS_CAJERO.has(f.estado.estado)) dias.add(hoy);
  return [...dias];
}

/** Arma una fila de la bandeja con las reglas del módulo. */
export function filaBandeja(
  s: SolicitudVista,
  gestionesSinOrden: readonly GestionVista[],
  correcciones: readonly CorreccionVista[],
  nombreResultado: (clave: string) => string,
  hoy: string,
  /** Desde qué día se exige el registro diario (por defecto INICIO_REGISTRO_DIARIO). */
  inicioRegistro?: string,
): FilaBandeja {
  const gestiones = [...gestionesSinOrden].sort((a, b) =>
    a.fecha === b.fecha ? a.createdAt.localeCompare(b.createdAt) : a.fecha.localeCompare(b.fecha));
  const aprobadas: CorreccionValorRecibido[] = correcciones
    .filter((c) => c.decision === "aprobada" && c.campo === "valor_recibido" && c.gestionId)
    .map((c) => ({ gestionId: c.gestionId!, valorNuevo: Number(c.valorNuevo) }));
  const e: EstadoCalculado = estadoRecobro(s, gestiones, hoy, aprobadas);
  // Lo cobrado con el flujo anterior (cobro de caja sin gestiones) cuenta como recibido.
  const recibidoGestiones = valorRecibidoTotal(gestiones, aprobadas);
  const recibido = recibidoGestiones > 0 ? recibidoGestiones : s.cobroEstado === "cobrado" ? s.cobroValor ?? 0 : 0;
  const valor = s.valorRecobro ?? null;
  const ultima = gestiones[gestiones.length - 1] ?? null;
  const pagado = e.estado === "pagado";
  return {
    id: s.id,
    tipo: s.tipo,
    origen: s.origen,
    fechaViaje: s.fechaViaje,
    numero: s.numero,
    viaje: s.viaje,
    placa: s.placa,
    vehiculoCodigo: s.vehiculoCodigo,
    conductorCedula: s.conductorCedula,
    conductorNombre: s.conductorNombre,
    ruta: s.ruta,
    resultado: s.resultado,
    registradora: s.timbradasRegistradora,
    conteo: s.conteoCamara,
    diferencia: s.diferencia,
    valorRecobro: valor,
    recibido,
    saldo: pagado ? 0 : Math.max(0, (valor ?? 0) - recibido),
    gemaAbono: s.gemaAbonoEstado ?? null,
    inicioRevision: inicioRevision(s),
    resueltoEn: s.estado === "resuelto" && s.resueltoAt ? fechaBogota(s.resueltoAt) : null,
    estado: e,
    semaforo: semaforo(e, hoy),
    textoEstado: textoEstado(e, hoy),
    diasEnEstado: Math.max(0, diasHabilesEntre(e.desde, hoy)),
    diasSinPagar: e.habilitadoDesde && !pagado && e.estado !== "cerrado_sin_cobro" && e.estado !== "liquidado"
      ? Math.max(0, diasHabilesEntre(e.habilitadoDesde, hoy))
      : null,
    diasSinRegistro: diasSinRegistro(e, gestiones, hoy, inicioRegistro),
    sinGestionHoy: sinGestionHoy(e, gestiones, hoy),
    ultimaGestion: ultima
      ? { fecha: ultima.fecha, usuario: ultima.usuarioEmail, resultado: nombreResultado(String(ultima.resultado)), compromiso: ultima.compromisoFecha }
      : null,
    gestiones,
    correccionesPendientes: correcciones.filter((c) => c.decision == null).length,
    correcciones: [...correcciones],
    pasaje: s.pasaje ?? null,
    incobrable: {
      motivo: s.incobrableMotivo ?? null, autorizaNombre: s.incobrableAutorizaNombre ?? null,
      autorizaFecha: s.incobrableAutorizaFecha ?? null, soporte: s.incobrableSoporte ?? null,
      registradoPor: s.incobrableAutorizadoPorEmail ?? null,
    },
    liquidacion: {
      concepto: s.liquidacionConcepto ?? null, valorDescontado: s.liquidacionValorDescontado ?? null,
      soporte: s.liquidacionSoporte ?? null, nota: s.liquidacionNota ?? null,
    },
    solicitud: {
      motivo: s.motivoSolicitud,
      nota: s.notaSolicitud,
      por: s.solicitadoPorEmail,
      at: s.solicitadoAt,
      tomadoPor: s.tomadoPorEmail,
      tomadoAt: s.tomadoAt,
      notaRevision: s.notaCamaras,
      resueltoPor: s.resueltoPorEmail,
      resueltoAt: s.resueltoAt,
      subgerenciaDecision: s.subgerenciaDecision,
      subgerenciaNota: s.subgerenciaNota,
      subgerenciaPor: s.subgerenciaPorEmail,
      subgerenciaAt: s.subgerenciaAt,
      anuladaAt: s.anuladaAt,
    },
    alertas: s.alertas,
  };
}

// ── Filtros ──────────────────────────────────────────────────────────────────

/** Botones rápidos de la bandeja (requerimiento: Todos, Por revisar, …, Pagados). */
export type FiltroRapido =
  | "todos" | "por_revisar" | "decide_subgerencia" | "sin_gestionar" | "en_gestion" | "plazo_vencido" | "pagados"
  | "por_gestionar" | "gestionados";

export const FILTRO_RAPIDO_LABEL: Record<FiltroRapido, string> = {
  todos: "Todos",
  por_revisar: "Por revisar",
  decide_subgerencia: "Decide subgerencia",
  sin_gestionar: "Sin gestionar",
  en_gestion: "En gestión",
  plazo_vencido: "Plazo vencido",
  pagados: "Pagados",
  por_gestionar: "Por gestionar",
  gestionados: "Gestionados",
};

const ESTADOS_DE_FILTRO: Record<Exclude<FiltroRapido, "todos">, readonly EstadoRecobro[]> = {
  por_revisar: ["solicitud_creada", "en_revision"],
  decide_subgerencia: ["decide_subgerencia"],
  sin_gestionar: ["sin_gestionar"],
  en_gestion: ["en_gestion"],
  plazo_vencido: ["plazo_vencido"],
  pagados: ["pagado"],
  por_gestionar: [],
  gestionados: [],
};

export function pasaFiltroRapido(f: FilaCaja, filtro: FiltroRapido): boolean {
  if (filtro === "por_gestionar") return estadoCaja(f) === "por_gestionar";
  if (filtro === "gestionados") return estadoCaja(f) === "gestionado";
  return filtro === "todos" || ESTADOS_DE_FILTRO[filtro].includes(f.estado.estado);
}

/** Búsqueda por conductor, buseta, placa o número de viaje (despacho). */
export function pasaBusqueda(
  f: Pick<FilaBandeja, "conductorNombre" | "conductorCedula" | "vehiculoCodigo" | "placa" | "numero">,
  texto: string,
): boolean {
  const q = texto.trim().toLowerCase();
  if (!q) return true;
  return [f.conductorNombre, f.conductorCedula, f.vehiculoCodigo, f.placa, String(f.numero)]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

// ── Caja: por gestionar o gestionado ─────────────────────────────────────────

/**
 * Para Caja un recobro tiene dos estados: *Por gestionar*, que sigue en Caja
 * de un día para otro, y *Gestionado* (cobrado). El recaudo se hace solo en
 * GEMA, así que:
 *
 * - Con abono «REVISIÓN CÁMARA», GEMA manda: por gestionar mientras el abono
 *   esté POR GESTIONAR (también si la cámara no encontró recobro: el cajero
 *   igual tiene que gestionarlo allá) y gestionado cuando GEMA lo gestiona.
 * - Sin abono, solo cuenta lo reportado por Revisión cartulina: por gestionar
 *   mientras el recobro esté por cobrar, gestionado al pagarse.
 * - Lo que espera la revisión de cámara o la decisión de subgerencia, lo
 *   anulado y lo que Mantenimiento registró sin abono ni reporte de cartulina
 *   no es de Caja (null).
 */
export type EstadoCaja = "por_gestionar" | "gestionado";

type FilaCaja = Pick<FilaBandeja, "estado"> & Partial<Pick<FilaBandeja, "origen" | "gemaAbono">>;

const ESPERA_REVISION: ReadonlySet<EstadoRecobro> = new Set(["solicitud_creada", "en_revision", "decide_subgerencia", "anulada"]);

export const ESTADO_CAJA_LABEL: Record<EstadoCaja, string> = {
  por_gestionar: "Por gestionar",
  gestionado: "Gestionado",
};

export function estadoCaja(f: FilaCaja): EstadoCaja | null {
  const est = f.estado.estado;
  if (ESPERA_REVISION.has(est)) return null;
  if (f.gemaAbono != null) {
    if (f.gemaAbono === ABONO_GESTIONADO) return "gestionado";
    return f.gemaAbono === ABONO_POR_GESTIONAR ? "por_gestionar" : null;
  }
  if (f.origen !== "cartulina") return null;
  if (ESTADOS_CAJERO.has(est)) return "por_gestionar";
  return est === "pagado" ? "gestionado" : null;
}

/** Nota para Caja cuando el estado del recobro no lo dice solo (p. ej. sin recobro y el abono sin gestionar). */
export function notaCaja(f: FilaCaja): string | null {
  if (estadoCaja(f) !== "por_gestionar") return null;
  if (f.gemaAbono == null) return "Sin abono en GEMA · registre en qué fecha y viaje lo cargó";
  if (ESTADOS_CAJERO.has(f.estado.estado)) return null;
  return f.estado.estado === "cerrado_sin_cobro" ? "Sin recobro · falta gestionar el abono en GEMA" : "Falta gestionar el abono en GEMA";
}

/**
 * Lo que aparece en Recobros (página, resumen, flujo, avisos y Excel): los
 * abonos «REVISIÓN CÁMARA» de GEMA y lo reportado por Revisión cartulina. Lo
 * que Mantenimiento registró sin abono en GEMA queda fuera: no tiene cómo
 * gestionarse (cobrarse) en GEMA.
 */
export const enAlcanceRecobros = (f: Partial<Pick<FilaBandeja, "origen" | "gemaAbono">>) =>
  f.origen === "abono_gema" || f.origen === "cartulina" || f.gemaAbono != null;

/** Filtros de la bandeja para un cajero sin otro rol. */
export const FILTROS_CAJA: readonly FiltroRapido[] = ["por_gestionar", "gestionados"];

/** Lo que ve un cajero sin otro rol: los por gestionar y, para consultar, los gestionados. */
export const esDeCajero = (f: FilaCaja) => estadoCaja(f) != null;

// ── Avisos por rol ───────────────────────────────────────────────────────────

/**
 * Lo que cada rol tiene que atender hoy. Se pinta en Revisión cartulina, Caja
 * de devengados, la página de Recobros y Cámaras › Solicitudes; cada aviso
 * lleva a la bandeja filtrada (`?ver=<clave>`).
 */
export type ClaveAviso =
  | "por_gestionar" | "decide_subgerencia" | "plazo_vencido" | "incobrable_por_autorizar"
  | "para_liquidacion" | "correcciones" | "por_revisar_camara";

export const CLAVES_AVISO: readonly ClaveAviso[] = [
  "por_gestionar", "decide_subgerencia", "plazo_vencido", "incobrable_por_autorizar",
  "para_liquidacion", "correcciones", "por_revisar_camara",
];

/** Nombre corto del filtro `?ver=` en la bandeja. */
export const AVISO_LABEL: Record<ClaveAviso, string> = {
  por_gestionar: "Por gestionar",
  decide_subgerencia: "Decide subgerencia",
  plazo_vencido: "Plazo vencido sin acuerdo",
  incobrable_por_autorizar: "Incobrable por autorizar",
  para_liquidacion: "Para liquidación definitiva",
  correcciones: "Correcciones por validar",
  por_revisar_camara: "Revisión de cámara por resolver",
};

export interface Aviso {
  clave: ClaveAviso;
  n: number;
  texto: string;
  href: string;
  /** Solo en «Por gestionar»: los recobros, el más antiguo primero, para la lista de Caja. */
  detalle?: ItemPorGestionar[];
}

/** Un recobro por gestionar en la lista de Caja. */
export interface ItemPorGestionar {
  id: string;
  numero: number;
  fechaViaje: string;
  vehiculoCodigo: string | null;
  diferencia: number | null;
  saldo: number;
  /** Días hábiles desde que la cámara habilitó el recobro (o desde la revisión, sin recobro). */
  dias: number;
  nota: string | null;
}

type FilaAviso = Pick<FilaBandeja, "tipo" | "estado" | "correccionesPendientes">
  & Partial<Pick<FilaBandeja, "id" | "numero" | "fechaViaje" | "vehiculoCodigo" | "diferencia" | "saldo" | "diasSinPagar"
    | "diasEnEstado" | "origen" | "gemaAbono">>;

/** Si la fila cuenta para el aviso (y pasa el filtro `?ver=` de la bandeja). */
export function pasaAviso(f: FilaAviso, clave: ClaveAviso): boolean {
  const est = f.estado.estado;
  switch (clave) {
    case "por_gestionar": return estadoCaja(f) === "por_gestionar";
    case "decide_subgerencia": return est === "decide_subgerencia";
    // Con acuerdo vigente Operativo ya dio su instrucción: no espera nada.
    case "plazo_vencido": return est === "plazo_vencido" && f.estado.detalle !== "acuerdo_vigente";
    case "incobrable_por_autorizar": return est === "incobrable_por_autorizar";
    case "para_liquidacion": return est === "para_liquidacion";
    case "correcciones": return f.correccionesPendientes > 0;
    // Un abono ya gestionado en GEMA no espera la cámara (el refresco anula la solicitud).
    case "por_revisar_camara":
      return f.tipo === "camara" && (est === "solicitud_creada" || est === "en_revision") && f.gemaAbono !== ABONO_GESTIONADO;
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const TEXTO_AVISO: Record<ClaveAviso, (n: number) => string> = {
  por_gestionar: (n) => `${plural(n, "recobro", "recobros")} por gestionar en caja`,
  decide_subgerencia: (n) => `${plural(n, "recobro sin conteo espera", "recobros sin conteo esperan")} decisión de subgerencia`,
  plazo_vencido: (n) => `${plural(n, "recobro", "recobros")} con el plazo de pago vencido ${n === 1 ? "espera" : "esperan"} instrucción de Operativo`,
  incobrable_por_autorizar: (n) => `${plural(n, "incobrable", "incobrables")} por registrar la autorización de subgerencia`,
  para_liquidacion: (n) => `${plural(n, "recobro", "recobros")} para cerrar en liquidación definitiva`,
  correcciones: (n) => `${plural(n, "corrección", "correcciones")} por validar`,
  por_revisar_camara: (n) => `${plural(n, "solicitud", "solicitudes")} de revisión de cámara por resolver`,
};

/** Quién atiende cada aviso (lo que puede hacer, no solo ver). */
const ROL_AVISO: Record<ClaveAviso, (r: RolRecobros) => boolean> = {
  por_gestionar: (r) => r.caja,
  decide_subgerencia: (r) => r.subgerencia,
  plazo_vencido: (r) => r.operativo,
  incobrable_por_autorizar: (r) => r.directora,
  para_liquidacion: (r) => r.directora,
  correcciones: (r) => r.directorMantenimiento,
  por_revisar_camara: (r) => r.mantenimiento,
};

export const hrefAviso = (clave: ClaveAviso) =>
  clave === "por_revisar_camara" ? "/mantenimiento/camaras/solicitudes" : `/tesoreria/recobros?ver=${clave}`;

/**
 * Avisos del rol, en el orden de CLAVES_AVISO y sin los que están en cero.
 * Las correcciones cuentan correcciones, no recobros.
 */
export function avisosRecobros(filas: readonly FilaAviso[], rol: RolRecobros): Aviso[] {
  const out: Aviso[] = [];
  for (const clave of CLAVES_AVISO) {
    if (!ROL_AVISO[clave](rol)) continue;
    const cuentan = filas.filter((f) => pasaAviso(f, clave));
    const n = clave === "correcciones" ? filas.reduce((t, f) => t + f.correccionesPendientes, 0) : cuentan.length;
    if (!n) continue;
    const aviso: Aviso = { clave, n, texto: TEXTO_AVISO[clave](n), href: hrefAviso(clave) };
    if (clave === "por_gestionar") aviso.detalle = cuentan.map(itemPorGestionar).sort((a, b) => b.dias - a.dias || a.fechaViaje.localeCompare(b.fechaViaje));
    out.push(aviso);
  }
  return out;
}

const itemPorGestionar = (f: FilaAviso): ItemPorGestionar => ({
  id: f.id ?? "", numero: f.numero ?? 0, fechaViaje: f.fechaViaje ?? "", vehiculoCodigo: f.vehiculoCodigo ?? null,
  diferencia: f.diferencia ?? null, saldo: f.saldo ?? 0, dias: f.diasSinPagar ?? f.diasEnEstado ?? 0,
  nota: notaCaja(f),
});

/** Total para el número de la pestaña: lo que la persona tiene por atender. */
export const totalAvisos = (avisos: readonly Aviso[]) => avisos.reduce((t, a) => t + a.n, 0);

export const esClaveAviso = (v: unknown): v is ClaveAviso => CLAVES_AVISO.includes(v as ClaveAviso);

// ── Periodo del resumen ──────────────────────────────────────────────────────

export type Periodo = "semana" | "mes" | "mes_anterior" | "todo";

export const PERIODO_LABEL: Record<Periodo, string> = {
  semana: "Esta semana",
  mes: "Este mes",
  mes_anterior: "Mes anterior",
  todo: "Todo",
};

/** Rango de fechas del viaje para el periodo (semana de lunes a domingo). Null = sin límite. */
export function rangoPeriodo(p: Periodo, hoy: string): { desde: string; hasta: string } | null {
  if (p === "todo") return null;
  if (p === "semana") {
    const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 domingo
    const desde = sumarDias(hoy, -((dia + 6) % 7));
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const [a, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  const [aa, mm] = p === "mes" ? [a, m] : m === 1 ? [a - 1, 12] : [a, m - 1];
  const desde = `${aa}-${String(mm).padStart(2, "0")}-01`;
  const fin = new Date(Date.UTC(aa, mm, 0)).toISOString().slice(0, 10);
  return { desde, hasta: fin };
}

export const enRango = (fecha: string, r: { desde: string; hasta: string } | null) =>
  !r || (fecha >= r.desde && fecha <= r.hasta);

/** Filtro de tipo de solicitud del resumen y la bandeja. */
export type FiltroTipo = "todos" | TipoSolicitud;
