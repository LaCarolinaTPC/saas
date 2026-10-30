import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue } from "@/lib/settings";
import { hoyBogota } from "@/lib/operativo/constants";
import { salioARodar } from "@/lib/biometrico/despacho";
import { avisosRecobros, enAlcanceRecobros, filaBandeja, type Aviso } from "./recobros-vista";
import {
  TARIFAS_POR_DEFECTO,
  type ClaveResultado, type CobroEstado, type DecisionSubgerencia, type GestionBase, type OrigenSolicitud,
  type ResultadoCatalogo, type ResultadoRevision, type RolRecobros, type SolicitudBase, type Tarifas, type TipoSolicitud,
} from "./recobros";

/**
 * Lecturas del módulo de Recobros. `disponible` es false mientras la
 * migración 20261029184904 no esté aplicada: las pantallas avisan en vez de
 * fallar. Todo pagina con `.range()` porque PostgREST corta en 1.000 filas.
 */

const PAGE = 1000;
const txt = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export interface Recobro extends SolicitudBase {
  id: string;
  numero: number;
  placa: string | null;
  viaje: number | null;
  vehiculoCodigo: string | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
  ruta: string | null;
  motivoSolicitud: string | null;
  notaSolicitud: string | null;
  solicitadoPorEmail: string | null;
  abonoId: number | null;
  anuladaMotivo: string | null;
  tomadoPorEmail: string | null;
  notaCamaras: string | null;
  resueltoPorEmail: string | null;
  camarasRevisionId: string | null;
  timbradasRegistradora: number | null;
  conteoCamara: number | null;
  diferencia: number | null;
  pasaje: number | null;
  pasajeFuente: "gema" | "tarifa" | null;
  valorRecibido: number;
  subgerenciaNota: string | null;
  subgerenciaPorEmail: string | null;
  cobroValor: number | null;
  cobroFecha: string | null;
  incobrableMotivo: string | null;
  incobrableAutorizaNombre: string | null;
  incobrableAutorizaFecha: string | null;
  incobrableSoporte: string | null;
  incobrableAutorizadoPorEmail: string | null;
  incobrableAutorizadoAt: string | null;
  liquidacionConcepto: string | null;
  liquidacionValorDescontado: number | null;
  liquidacionSoporte: string | null;
  liquidacionNota: string | null;
  liquidacionAt: string | null;
  gemaCargueConfirmadoAt: string | null;
  alertas: string[];
  /** Estado del abono «REVISIÓN CÁMARA» en GEMA (0 por gestionar, 1 gestionado = cobrado, 2 anulado); null sin abono. */
  gemaAbonoEstado: number | null;
}

export const SELECT_RECOBRO_V2 =
  "id, fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, ruta, " +
  "tipo, origen, motivo_solicitud, nota_solicitud, solicitado_por_email, solicitado_at, abono_id, abono_fecha, " +
  "anulada_at, anulada_motivo, tomado_por_email, tomado_at, estado, resultado, nota_camaras, resuelto_por_email, resuelto_at, " +
  "camaras_revision_id, timbradas_registradora, conteo_camara, diferencia, pasaje, pasaje_fuente, valor_recobro, valor_recibido, " +
  "subgerencia_decision, subgerencia_nota, subgerencia_por_email, subgerencia_at, " +
  "cobro_estado, cobro_valor, cobro_fecha, cobro_at, incobrable_motivo, incobrable_solicitado_at, " +
  "incobrable_autoriza_nombre, incobrable_autoriza_fecha, incobrable_soporte, incobrable_autorizado_por_email, incobrable_autorizado_at, " +
  "liquidacion_marcada_at, liquidacion_concepto, liquidacion_valor_descontado, liquidacion_soporte, liquidacion_nota, liquidacion_at, " +
  "gema_cargue_confirmado_at, alertas";

const uno = <T extends string>(v: unknown, validos: readonly T[]): T | null =>
  validos.includes(v as T) ? (v as T) : null;

export function mapRecobroV2(r: Record<string, unknown>): Recobro {
  return {
    id: String(r.id),
    fechaViaje: String(r.fecha_viaje),
    numero: Number(r.numero),
    placa: txt(r.placa),
    viaje: num(r.viaje),
    vehiculoCodigo: txt(r.vehiculo_codigo),
    conductorCedula: txt(r.conductor_cedula),
    conductorNombre: txt(r.conductor_nombre),
    ruta: txt(r.ruta),
    tipo: uno<TipoSolicitud>(r.tipo, ["camara", "cartulina"]) ?? "camara",
    origen: uno<OrigenSolicitud>(r.origen, ["abono_gema", "cartulina", "mantenimiento", "migracion"]) ?? "cartulina",
    motivoSolicitud: txt(r.motivo_solicitud),
    notaSolicitud: txt(r.nota_solicitud),
    solicitadoPorEmail: txt(r.solicitado_por_email),
    solicitadoAt: String(r.solicitado_at),
    abonoId: num(r.abono_id),
    abonoFecha: txt(r.abono_fecha),
    anuladaAt: txt(r.anulada_at),
    anuladaMotivo: txt(r.anulada_motivo),
    tomadoPorEmail: txt(r.tomado_por_email),
    tomadoAt: txt(r.tomado_at),
    estado: r.estado === "resuelto" ? "resuelto" : "pendiente",
    resultado: uno<ResultadoRevision>(r.resultado, ["recobro", "normalidad_timbradas", "sin_conteo"]),
    notaCamaras: txt(r.nota_camaras),
    resueltoPorEmail: txt(r.resuelto_por_email),
    resueltoAt: txt(r.resuelto_at),
    camarasRevisionId: txt(r.camaras_revision_id),
    timbradasRegistradora: num(r.timbradas_registradora),
    conteoCamara: num(r.conteo_camara),
    diferencia: num(r.diferencia),
    pasaje: num(r.pasaje),
    pasajeFuente: uno<"gema" | "tarifa">(r.pasaje_fuente, ["gema", "tarifa"]),
    valorRecobro: num(r.valor_recobro),
    valorRecibido: Number(r.valor_recibido ?? 0),
    subgerenciaDecision: uno<DecisionSubgerencia>(r.subgerencia_decision, ["cobrar", "no_cobrar"]),
    subgerenciaNota: txt(r.subgerencia_nota),
    subgerenciaPorEmail: txt(r.subgerencia_por_email),
    subgerenciaAt: txt(r.subgerencia_at),
    cobroEstado: uno<CobroEstado>(r.cobro_estado, ["cobrado", "incobrable", "liquidacion_definitiva"]),
    cobroValor: num(r.cobro_valor),
    cobroFecha: txt(r.cobro_fecha),
    cobroAt: txt(r.cobro_at),
    incobrableMotivo: txt(r.incobrable_motivo),
    incobrableSolicitadoAt: txt(r.incobrable_solicitado_at),
    incobrableAutorizaNombre: txt(r.incobrable_autoriza_nombre),
    incobrableAutorizaFecha: txt(r.incobrable_autoriza_fecha),
    incobrableSoporte: txt(r.incobrable_soporte),
    incobrableAutorizadoPorEmail: txt(r.incobrable_autorizado_por_email),
    incobrableAutorizadoAt: txt(r.incobrable_autorizado_at),
    liquidacionMarcadaAt: txt(r.liquidacion_marcada_at),
    liquidacionConcepto: txt(r.liquidacion_concepto),
    liquidacionValorDescontado: num(r.liquidacion_valor_descontado),
    liquidacionSoporte: txt(r.liquidacion_soporte),
    liquidacionNota: txt(r.liquidacion_nota),
    liquidacionAt: txt(r.liquidacion_at),
    gemaCargueConfirmadoAt: txt(r.gema_cargue_confirmado_at),
    alertas: Array.isArray(r.alertas) ? (r.alertas as unknown[]).map(String) : [],
    gemaAbonoEstado: null,
  };
}

export interface Gestion extends GestionBase {
  solicitudId: string;
  observacion: string | null;
  autorizadoPor: string | null;
  rol: "caja" | "operativo" | "directora" | "sistema";
  gemaCargueConfirmado: boolean;
  usuarioEmail: string | null;
}

export const SELECT_GESTION_V2 =
  "id, solicitud_id, fecha, gestion, resultado, compromiso_fecha, valor_recibido, autorizado_por, observacion, rol, " +
  "gema_cargue_confirmado, usuario_email, created_at";

export function mapGestionV2(r: Record<string, unknown>): Gestion {
  return {
    id: String(r.id),
    solicitudId: String(r.solicitud_id),
    fecha: String(r.fecha),
    createdAt: String(r.created_at),
    // Las registradas por la pantalla vieja no traen resultado: son «Otro» con su texto.
    resultado: (txt(r.resultado) ?? "otro") as ClaveResultado,
    compromisoFecha: txt(r.compromiso_fecha),
    valorRecibido: num(r.valor_recibido),
    autorizadoPor: txt(r.autorizado_por),
    observacion: txt(r.observacion) ?? txt(r.gestion),
    rol: uno(r.rol, ["caja", "operativo", "directora", "sistema"] as const) ?? "caja",
    gemaCargueConfirmado: r.gema_cargue_confirmado === true,
    usuarioEmail: txt(r.usuario_email),
  };
}

export interface Correccion {
  id: string;
  solicitudId: string;
  campo: "conteo_camara" | "resultado" | "diferencia" | "valor_recibido";
  gestionId: string | null;
  valorAnterior: string | null;
  valorNuevo: string;
  motivo: string;
  solicitadoPorEmail: string;
  solicitadoAt: string;
  decision: "aprobada" | "rechazada" | null;
  decisionNota: string | null;
  decididoPorEmail: string | null;
  decididoAt: string | null;
}

export const SELECT_CORRECCION =
  "id, solicitud_id, campo, gestion_id, valor_anterior, valor_nuevo, motivo, solicitado_por_email, solicitado_at, " +
  "decision, decision_nota, decidido_por_email, decidido_at";

export function mapCorreccion(r: Record<string, unknown>): Correccion {
  return {
    id: String(r.id),
    solicitudId: String(r.solicitud_id),
    campo: r.campo as Correccion["campo"],
    gestionId: txt(r.gestion_id),
    valorAnterior: txt(r.valor_anterior),
    valorNuevo: String(r.valor_nuevo),
    motivo: String(r.motivo),
    solicitadoPorEmail: String(r.solicitado_por_email),
    solicitadoAt: String(r.solicitado_at),
    decision: uno(r.decision, ["aprobada", "rechazada"] as const),
    decisionNota: txt(r.decision_nota),
    decididoPorEmail: txt(r.decidido_por_email),
    decididoAt: txt(r.decidido_at),
  };
}

/** Lee una tabla completa por páginas; null si la consulta falla (migración sin aplicar). */
async function todas<T>(
  tabla: string,
  select: string,
  orden: string[],
  map: (r: Record<string, unknown>) => T,
): Promise<T[] | null> {
  const db = createAdminClient();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(tabla).select(select);
    for (const c of orden) q = q.order(c);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(map));
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface DatosRecobros {
  disponible: boolean;
  recobros: Recobro[];
  /** Gestiones por solicitud, en orden de registro. */
  gestiones: Map<string, Gestion[]>;
  correcciones: Map<string, Correccion[]>;
  catalogo: ResultadoCatalogo[];
}

const agrupar = <T extends { solicitudId: string }>(xs: T[]) => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const l = m.get(x.solicitudId);
    if (l) l.push(x);
    else m.set(x.solicitudId, [x]);
  }
  return m;
};

/**
 * Estado en GEMA de los abonos (copia `abonos`, al día por el refresco):
 * 0 por gestionar, 1 gestionado (cobrado), 2 anulado. Vacío si falla.
 */
async function getEstadosAbonos(ids: number[]): Promise<Map<number, number>> {
  const db = createAdminClient();
  const out = new Map<number, number>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 300) {
    const { data, error } = await db.from("abonos").select("id_abono, estado").in("id_abono", unicos.slice(i, i + 300));
    if (error) return out;
    for (const r of data ?? []) if (r.estado != null) out.set(Number(r.id_abono), Number(r.estado));
  }
  return out;
}

/** Todo lo que la página de Recobros necesita, en tres lecturas paginadas. */
export async function getDatosRecobros(): Promise<DatosRecobros> {
  const [recobros, gestiones, correcciones, catalogo] = await Promise.all([
    todas("tesoreria_camaras_solicitudes", SELECT_RECOBRO_V2, ["solicitado_at", "id"], mapRecobroV2),
    todas("tesoreria_camaras_recobro_gestiones", SELECT_GESTION_V2, ["fecha", "created_at", "id"], mapGestionV2),
    todas("tesoreria_recobro_correcciones", SELECT_CORRECCION, ["solicitado_at", "id"], mapCorreccion),
    getCatalogoResultados(false),
  ]);
  if (!recobros || !gestiones || !correcciones) {
    return { disponible: false, recobros: [], gestiones: new Map(), correcciones: new Map(), catalogo: [] };
  }
  const estados = await getEstadosAbonos(recobros.map((r) => r.abonoId).filter((n): n is number => n != null));
  for (const r of recobros) r.gemaAbonoEstado = r.abonoId != null ? estados.get(r.abonoId) ?? null : null;
  return { disponible: true, recobros, gestiones: agrupar(gestiones), correcciones: agrupar(correcciones), catalogo };
}

export async function getCatalogoResultados(soloActivos: boolean): Promise<ResultadoCatalogo[]> {
  const db = createAdminClient();
  let q = db
    .from("tesoreria_recobro_resultados")
    .select("clave, nombre, exige_compromiso, exige_valor, exige_observacion, exige_autorizado_por, cierra, registra, activo")
    .order("orden");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r) => ({
    clave: String(r.clave),
    nombre: String(r.nombre),
    exigeCompromiso: !!r.exige_compromiso,
    exigeValor: !!r.exige_valor,
    exigeObservacion: !!r.exige_observacion,
    exigeAutorizadoPor: !!r.exige_autorizado_por,
    cierra: !!r.cierra,
    registra: r.registra === "operativo" ? "operativo" : "caja",
    activo: !!r.activo,
  }));
}

/** Claves de `app_settings` del módulo. */
export const CLAVE_TARIFA_NORMAL = "recobros_tarifa_normal";
export const CLAVE_TARIFA_DOMINGO_FESTIVO = "recobros_tarifa_domingo_festivo";

/**
 * Valor de la timbrada cuando GEMA no trae el pasaje. Por defecto $3.700 y
 * $3.800 (domingos y festivos); Tesorería lo puede cambiar sin desplegar.
 */
export async function getTarifas(): Promise<Tarifas> {
  const [n, d] = await Promise.all([getSettingValue(CLAVE_TARIFA_NORMAL), getSettingValue(CLAVE_TARIFA_DOMINGO_FESTIVO)]);
  const valido = (v: string | null, def: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x > 0 ? x : def;
  };
  return {
    normal: valido(n, TARIFAS_POR_DEFECTO.normal),
    domingoFestivo: valido(d, TARIFAS_POR_DEFECTO.domingoFestivo),
  };
}

/**
 * Cédulas de conductores retirados (conductores.estado = 'RETIRADO') entre las
 * dadas: su saldo pendiente va a la liquidación definitiva.
 */
export async function getConductoresRetirados(cedulas: string[]): Promise<string[]> {
  const db = createAdminClient();
  const unicas = [...new Set(cedulas.filter(Boolean))];
  const out: string[] = [];
  for (let i = 0; i < unicas.length; i += 300) {
    const { data, error } = await db.from("conductores").select("cedula").in("cedula", unicas.slice(i, i + 300)).eq("estado", "RETIRADO");
    if (error) return out;
    out.push(...(data ?? []).map((r) => String(r.cedula)));
  }
  return out;
}

/**
 * Avisos de Recobros para un rol (Revisión cartulina, Caja de devengados).
 * Calcula el estado de cada recobro con las mismas reglas de la página; lista
 * vacía si la migración no está o el rol no atiende nada.
 */
export async function getAvisosRecobros(rol: RolRecobros): Promise<Aviso[]> {
  if (!Object.values(rol).some(Boolean)) return [];
  const datos = await getDatosRecobros();
  if (!datos.disponible) return [];
  const hoy = hoyBogota();
  const filas = datos.recobros
    .map((s) => filaBandeja(s, datos.gestiones.get(s.id) ?? [], datos.correcciones.get(s.id) ?? [], (c) => c, hoy))
    .filter(enAlcanceRecobros);
  return avisosRecobros(filas, rol);
}

/**
 * Solicitudes de revisión de cámara sin resolver (pestaña Solicitudes de
 * Cámaras y sensores). 0 si la consulta falla.
 */
export async function contarSolicitudesCamaraPendientes(): Promise<number> {
  const db = createAdminClient();
  const { count, error } = await db
    .from("tesoreria_camaras_solicitudes")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "camara")
    .eq("estado", "pendiente")
    .is("anulada_at", null);
  return error ? 0 : count ?? 0;
}

/**
 * Viajes que salieron a rodar en GEMA (`historico_despacho`) por conductor y
 * día, para contrastar la gestión «No vino a trabajar». Clave
 * `cedula|fecha`; los pares sin viajes quedan en 0. Mapa vacío si falla.
 */
export async function getViajesConductorPorDia(pares: { cedula: string; fecha: string }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const porFecha = new Map<string, Set<string>>();
  for (const p of pares) {
    if (!p.cedula) continue;
    out.set(`${p.cedula}|${p.fecha}`, 0);
    const s = porFecha.get(p.fecha) ?? new Set<string>();
    s.add(p.cedula);
    porFecha.set(p.fecha, s);
  }
  const db = createAdminClient();
  for (const [fecha, set] of porFecha) {
    const cedulas = [...set];
    for (let i = 0; i < cedulas.length; i += 300) {
      const { data, error } = await db
        .from("historico_despacho")
        .select("conductor_ced, estado, timbradas")
        .eq("fecha_viaje", fecha)
        .in("conductor_ced", cedulas.slice(i, i + 300));
      if (error) return new Map();
      for (const f of (data ?? []) as { conductor_ced: string | null; estado: string | null; timbradas: number | null }[]) {
        if (!f.conductor_ced || !salioARodar(f)) continue;
        const k = `${String(f.conductor_ced).trim()}|${fecha}`;
        if (out.has(k)) out.set(k, out.get(k)! + 1);
      }
    }
  }
  return out;
}
