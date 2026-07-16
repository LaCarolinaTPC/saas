import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue } from "@/lib/settings";
import { calcularQuincena, quincenaDe, type ResumenQuincena } from "./engine";

/**
 * Acceso a datos del módulo Devengados. SOLO server-side.
 * La producción neta del día es el SALARIO NETO DÍA del cierre de GEMA
 * (cierres_diarios.salario_neto_dia, una fila por ruta: el día es la suma).
 * Los viajes de viajes_recaudados quedan solo como detalle de soporte.
 */

export const SETTING_BASE_DIARIA = "devengados_base_diaria";
const BASE_DIARIA_FALLBACK = 85000;
const PAGE = 1000; // límite de filas por consulta de Supabase

export async function getBaseDiaria(): Promise<number> {
  const raw = await getSettingValue(SETTING_BASE_DIARIA);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : BASE_DIARIA_FALLBACK;
}

export interface ViajeDia {
  numero: number;
  viaje: string | null;
  ruta: string | null;
  hora_despacho: string | null;
  hora_llegada: string | null;
  placa: string | null;
  codigo_vehiculo: string | null;
  bruto: number | null;
  neto: number | null;
  estado: string | null;
  novedad: string | null;
  liquidado: boolean; // ya incluido en una entrega registrada
}

export interface EntregaRow {
  id: string;
  fecha: string;
  periodo: string;
  quincena: number;
  cedula_conductor: string;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  viajes: number[];
  valor_entregado: number;
  cuenta_contable: string;
  movimiento: string;
  observacion: string | null;
  trasladada_gema: boolean;
  trasladada_at: string | null;
  created_at: string;
}

export interface EstadoConductor {
  cedula: string;
  fecha: string;
  baseDiaria: number;
  quincena: ReturnType<typeof quincenaDe>;
  resumen: ResumenQuincena;
  viajesDia: ViajeDia[];
  produccionDia: number;      // suma de neto de todos los viajes del día
  entregadoDia: number;       // entregas ya aprobadas hoy
  entregas: EntregaRow[];     // entregas de la quincena (hasta la fecha)
}

type ViajeRaw = {
  numero: number;
  fecha_viaje: string;
  cedula_conductor: string | null;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  viaje: string | null;
  ruta_programada: string | null;
  ruta_reprogramada: string | null;
  hora_despacho: string | null;
  hora_llegada: string | null;
  placa: string | null;
  codigo_vehiculo: string | null;
  bruto: number | null;
  neto: number | null;
  estado: string | null;
  novedad: string | null;
};

const VIAJE_COLS =
  "numero, fecha_viaje, cedula_conductor, codigo_conductor, conductor_nombre, viaje, " +
  "ruta_programada, ruta_reprogramada, hora_despacho, hora_llegada, placa, " +
  "codigo_vehiculo, bruto, neto, estado, novedad";

/** Viajes recaudados de un rango (opcionalmente de un conductor), paginados. */
async function fetchViajes(
  ini: string,
  fin: string,
  cedula?: string
): Promise<ViajeRaw[]> {
  const supabase = createAdminClient();
  const all: ViajeRaw[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("viajes_recaudados")
      .select(VIAJE_COLS)
      .gte("fecha_viaje", ini)
      .lte("fecha_viaje", fin)
      .order("numero", { ascending: true })
      .range(from, from + PAGE - 1);
    if (cedula) query = query.eq("cedula_conductor", cedula);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as ViajeRaw[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

type CierreRow = {
  cod_conductor: string;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  fecha: string;
  ruta: string | null;
  salario_neto_dia: number | null;
};

const CIERRE_COLS =
  "cod_conductor, conductor_nombre, cedula_conductor, fecha, ruta, salario_neto_dia";

/** Cierres diarios de un rango (opcionalmente de un conductor), paginados. */
async function fetchCierres(
  ini: string,
  fin: string,
  cedula?: string
): Promise<CierreRow[]> {
  const supabase = createAdminClient();
  const all: CierreRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("cierres_diarios")
      .select(CIERRE_COLS)
      .gte("fecha", ini)
      .lte("fecha", fin)
      .order("fecha", { ascending: true })
      .order("cod_conductor", { ascending: true })
      .range(from, from + PAGE - 1);
    if (cedula) query = query.eq("cedula_conductor", cedula);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as CierreRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

function mapEntrega(row: Record<string, unknown>): EntregaRow {
  return {
    ...(row as unknown as EntregaRow),
    viajes: Array.isArray(row.viajes) ? (row.viajes as number[]) : [],
    valor_entregado: Number(row.valor_entregado ?? 0),
  };
}

/** Estado completo de un conductor para la pantalla de caja. */
export async function getEstadoConductor(
  cedula: string,
  fecha: string
): Promise<EstadoConductor> {
  const supabase = createAdminClient();
  const baseDiaria = await getBaseDiaria();
  const quincena = quincenaDe(fecha);

  // El corte a corte solo considera hasta la fecha consultada. La producción
  // sale de los cierres (salario neto día); los viajes son solo soporte.
  const cierres = await fetchCierres(quincena.ini, fecha, cedula);
  const viajes = await fetchViajes(fecha, fecha, cedula);

  const { data: entRows, error: entErr } = await supabase
    .from("devengados_entregas")
    .select("*")
    .eq("cedula_conductor", cedula)
    .gte("fecha", quincena.ini)
    .lte("fecha", fecha)
    .order("created_at", { ascending: true });
  if (entErr) throw entErr;
  const entregas = (entRows ?? []).map(mapEntrega);

  const porDia = new Map<string, number>();
  for (const c of cierres) {
    porDia.set(c.fecha, (porDia.get(c.fecha) ?? 0) + (c.salario_neto_dia ?? 0));
  }
  const entregado = entregas.reduce((s, e) => s + e.valor_entregado, 0);
  const resumen = calcularQuincena(
    [...porDia.entries()].map(([f, p]) => ({ fecha: f, produccion: p })),
    baseDiaria,
    entregado
  );

  const liquidados = new Set<number>(entregas.flatMap((e) => e.viajes));
  const viajesDia: ViajeDia[] = viajes.map((v) => ({
      numero: v.numero,
      viaje: v.viaje,
      ruta: v.ruta_programada ?? v.ruta_reprogramada,
      hora_despacho: v.hora_despacho,
      hora_llegada: v.hora_llegada,
      placa: v.placa,
      codigo_vehiculo: v.codigo_vehiculo,
      bruto: v.bruto,
      neto: v.neto,
      estado: v.estado,
      novedad: v.novedad,
      liquidado: liquidados.has(v.numero),
    }));

  return {
    cedula,
    fecha,
    baseDiaria,
    quincena,
    resumen,
    viajesDia,
    produccionDia: porDia.get(fecha) ?? 0,
    entregadoDia: entregas
      .filter((e) => e.fecha === fecha)
      .reduce((s, e) => s + e.valor_entregado, 0),
    entregas,
  };
}

export interface FilaAnalisis {
  cedula: string;
  codigo: string | null;
  nombre: string | null;
  resumen: ResumenQuincena;
}

/** Análisis consolidado de la quincena para todos los conductores con viajes. */
export async function getAnalisisQuincena(fecha: string): Promise<{
  baseDiaria: number;
  quincena: ReturnType<typeof quincenaDe>;
  filas: FilaAnalisis[];
}> {
  const supabase = createAdminClient();
  const baseDiaria = await getBaseDiaria();
  const quincena = quincenaDe(fecha);

  const cierres = await fetchCierres(quincena.ini, fecha);

  const { data: entRows, error: entErr } = await supabase
    .from("devengados_entregas")
    .select("cedula_conductor, valor_entregado")
    .gte("fecha", quincena.ini)
    .lte("fecha", fecha);
  if (entErr) throw entErr;

  type Acum = {
    codigo: string | null;
    nombre: string | null;
    porDia: Map<string, number>;
    entregado: number;
  };
  const porConductor = new Map<string, Acum>();
  for (const c of cierres) {
    // Filas viejas sin re-sincronizar aún no traen cédula: se agrupan por
    // código para no perderlas, pero sin cédula no cruzan con entregas.
    const ced = c.cedula_conductor ?? c.cod_conductor;
    if (!ced) continue;
    let acc = porConductor.get(ced);
    if (!acc) {
      acc = {
        codigo: c.cod_conductor,
        nombre: c.conductor_nombre,
        porDia: new Map(),
        entregado: 0,
      };
      porConductor.set(ced, acc);
    }
    acc.porDia.set(
      c.fecha,
      (acc.porDia.get(c.fecha) ?? 0) + (c.salario_neto_dia ?? 0)
    );
  }
  for (const e of entRows ?? []) {
    const acc = porConductor.get(e.cedula_conductor as string);
    if (acc) acc.entregado += Number(e.valor_entregado ?? 0);
  }

  const filas: FilaAnalisis[] = [...porConductor.entries()].map(
    ([cedula, acc]) => ({
      cedula,
      codigo: acc.codigo,
      nombre: acc.nombre,
      resumen: calcularQuincena(
        [...acc.porDia.entries()].map(([f, p]) => ({ fecha: f, produccion: p })),
        baseDiaria,
        acc.entregado
      ),
    })
  );

  filas.sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));
  return { baseDiaria, quincena, filas };
}

/** Entregas de un día (registro para el traslado manual a GEMA). */
export async function getEntregasDia(fecha: string): Promise<EntregaRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("devengados_entregas")
    .select("*")
    .eq("fecha", fecha)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEntrega);
}
