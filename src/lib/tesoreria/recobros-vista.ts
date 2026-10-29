/**
 * La página de Recobros (`/tesoreria/recobros`) en filas listas para pintar:
 * estado, semáforo, saldo, última gestión y días sin registro de cada
 * solicitud, con los filtros de la bandeja y el periodo del resumen. Puro: lo
 * usan la página (servidor), la pantalla, el Excel y las pruebas.
 */

import { sumarDias } from "./calendario-pago";
import {
  diasHabilesEntre, diasSinRegistro, ESTADOS_CAJERO, estadoRecobro, fechaBogota, inicioRevision, semaforo,
  sinGestionHoy, textoEstado, valorRecibidoTotal,
  type CorreccionValorRecibido, type EstadoCalculado, type EstadoRecobro, type FilaRecobro, type GestionBase,
  type OrigenSolicitud, type ResultadoRevision, type Semaforo, type SolicitudBase, type TipoSolicitud,
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
  | "todos" | "por_revisar" | "decide_subgerencia" | "sin_gestionar" | "en_gestion" | "plazo_vencido" | "pagados";

export const FILTRO_RAPIDO_LABEL: Record<FiltroRapido, string> = {
  todos: "Todos",
  por_revisar: "Por revisar",
  decide_subgerencia: "Decide subgerencia",
  sin_gestionar: "Sin gestionar",
  en_gestion: "En gestión",
  plazo_vencido: "Plazo vencido",
  pagados: "Pagados",
};

const ESTADOS_DE_FILTRO: Record<Exclude<FiltroRapido, "todos">, readonly EstadoRecobro[]> = {
  por_revisar: ["solicitud_creada", "en_revision"],
  decide_subgerencia: ["decide_subgerencia"],
  sin_gestionar: ["sin_gestionar"],
  en_gestion: ["en_gestion"],
  plazo_vencido: ["plazo_vencido"],
  pagados: ["pagado"],
};

export function pasaFiltroRapido(f: Pick<FilaBandeja, "estado">, filtro: FiltroRapido): boolean {
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

/** Lo que ve un cajero sin otro rol: solo los recobros por cobrar. */
export const esDeCajero = (f: Pick<FilaBandeja, "estado">) => ESTADOS_CAJERO.has(f.estado.estado);

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
