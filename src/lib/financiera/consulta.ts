/**
 * Lectura de la vista consolidada y de los catálogos para las pantallas de
 * Gestión de flota. Solo servidor. Toda lectura de volumen pagina con
 * .range() (PostgREST recorta a 1.000).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { PARAMETROS_SEMILLA, type IndicadorSemaforo, type ParametroSemaforo } from "./motor";
import { llaveFila, type FilaConsolidada, type Propietario, type PropietariosPorFila } from "./analisis";

const PAGINA = 1000;

async function paginar<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    todo.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todo;
}

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number | null) ?? 0;
  return Number.isFinite(x) ? x : 0;
};

// Una sola cadena literal, sin concatenar: si se parte con `+` deja de ser un
// tipo literal y supabase-js ya no puede inferir la forma de la respuesta.
const COLUMNAS = "periodo, codigo_vehiculo, propietarios, cedula_propietario, propietario_nombre, tipo_propietario, placa, modelo, vehiculo_activo, estado_periodo, viajes, timbradas, ingresos, dias_con_produccion, fondo, poliza, prestamo, estudio, salario, combustible, rtica, admon, sitra, fet, valor_camb, incentivo_c, valor_descuentos, despacho, intereses, otros_gastos, repuestos, mano_de_obra, desc_fondo_conductor, combustible_vehiculos_nuevos, poliza_vehiculos_nuevos, origen_contable, sin_operacion";

type Cruda = Record<string, unknown>;

function aFila(r: Cruda): FilaConsolidada {
  return {
    periodo: String(r.periodo),
    codigoVehiculo: String(r.codigo_vehiculo),
    propietarios: n(r.propietarios),
    cedulaPropietario: (r.cedula_propietario as string | null) ?? null,
    propietarioNombre: (r.propietario_nombre as string | null) ?? null,
    tipoPropietario: (r.tipo_propietario as string | null) ?? null,
    placa: (r.placa as string | null) ?? null,
    modelo: (r.modelo as string | null) ?? null,
    vehiculoActivo: (r.vehiculo_activo as boolean | null) ?? null,
    estadoPeriodo: (r.estado_periodo as FilaConsolidada["estadoPeriodo"]) ?? null,
    diasConProduccion: n(r.dias_con_produccion),
    viajes: n(r.viajes), timbradas: n(r.timbradas), ingresos: n(r.ingresos),
    fondo: n(r.fondo), poliza: n(r.poliza), prestamo: n(r.prestamo), estudio: n(r.estudio), salario: n(r.salario),
    combustible: n(r.combustible), rtica: n(r.rtica), admon: n(r.admon), sitra: n(r.sitra),
    fet: n(r.fet), valorCamb: n(r.valor_camb), incentivoC: n(r.incentivo_c), valorDescuentos: n(r.valor_descuentos),
    despacho: n(r.despacho), intereses: n(r.intereses), otrosGastos: n(r.otros_gastos),
    repuestos: n(r.repuestos), manoDeObra: n(r.mano_de_obra), descFondoConductor: n(r.desc_fondo_conductor),
    combustibleVehiculosNuevos: n(r.combustible_vehiculos_nuevos),
    polizaVehiculosNuevos: n(r.poliza_vehiculos_nuevos),
    // `sin_movimiento` es un bus parado que el archivo del mes no traía: no le falta nada.
    tieneContable: r.origen_contable !== "sin_dato",
    // Costo contable de un mes en que el bus no tuvo fila en GEMA (no operó).
    sinOperacion: r.sin_operacion === true,
  };
}

/** Filas vehículo-mes de los períodos pedidos. */
export async function cargarConsolidado(periodos: string[]): Promise<FilaConsolidada[]> {
  if (periodos.length === 0) return [];
  const db = createAdminClient();
  const filas = await paginar<Cruda>((a, b) =>
    db.from("vw_financiera_consolidado").select(COLUMNAS).in("periodo", periodos).order("periodo").order("codigo_vehiculo").range(a, b)
  );
  return filas.map(aFila);
}

/** Dueños por vehículo-mes (para filtrar por propietario cuando un bus tuvo varios). */
export async function cargarPropietarios(periodos: string[]): Promise<PropietariosPorFila> {
  const mapa = new Map<string, Propietario[]>();
  if (periodos.length === 0) return mapa;
  const db = createAdminClient();
  const filas = await paginar<{ periodo: string; codigo_vehiculo: string; cedula_propietario: string; propietario_nombre: string | null; tipo_propietario: string | null }>((a, b) =>
    db.from("financiera_operativo_mes").select("periodo, codigo_vehiculo, cedula_propietario, propietario_nombre, tipo_propietario").in("periodo", periodos).range(a, b)
  );
  for (const f of filas) {
    const k = llaveFila(f.periodo, f.codigo_vehiculo);
    const l = mapa.get(k) ?? [];
    l.push({ cedula: f.cedula_propietario, nombre: f.propietario_nombre, tipo: f.tipo_propietario });
    mapa.set(k, l);
  }
  return mapa;
}

/** Años con al menos un mes consolidado, descendente. */
export async function aniosDisponibles(): Promise<number[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("financiera_periodos").select("periodo").order("periodo", { ascending: false }).range(0, 999);
  if (error) throw new Error(error.message);
  return [...new Set(((data ?? []) as { periodo: string }[]).map((p) => Number(p.periodo.slice(0, 4))))];
}

/** Umbrales de semáforo desde la tabla; si falta alguno, la semilla del motor. */
export async function leerParametros(): Promise<Record<IndicadorSemaforo, ParametroSemaforo>> {
  const db = createAdminClient();
  const { data, error } = await db.from("financiera_parametros").select("indicador, etiqueta, unidad, mayor_es_mejor, umbral_excelente, umbral_aceptable, updated_at, actualizado_por_email");
  if (error) throw new Error(error.message);
  const out = { ...PARAMETROS_SEMILLA };
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const k = r.indicador as IndicadorSemaforo;
    if (!(k in out)) continue;
    out[k] = {
      indicador: k,
      etiqueta: String(r.etiqueta),
      unidad: String(r.unidad),
      mayorEsMejor: Boolean(r.mayor_es_mejor),
      umbralExcelente: n(r.umbral_excelente),
      umbralAceptable: n(r.umbral_aceptable),
    };
  }
  return out;
}

export interface ParametroConRastro extends ParametroSemaforo {
  updatedAt: string | null;
  actualizadoPorEmail: string | null;
}

export async function leerParametrosConRastro(): Promise<ParametroConRastro[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("financiera_parametros").select("*").order("indicador");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    indicador: r.indicador as IndicadorSemaforo,
    etiqueta: String(r.etiqueta),
    unidad: String(r.unidad),
    mayorEsMejor: Boolean(r.mayor_es_mejor),
    umbralExcelente: n(r.umbral_excelente),
    umbralAceptable: n(r.umbral_aceptable),
    updatedAt: (r.updated_at as string | null) ?? null,
    actualizadoPorEmail: (r.actualizado_por_email as string | null) ?? null,
  }));
}

/** Guarda los umbrales de un indicador y deja la operación en la bitácora. */
export async function guardarParametro(p: ParametroSemaforo, email: string | null, anterior: ParametroSemaforo): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("financiera_parametros")
    .update({ umbral_excelente: p.umbralExcelente, umbral_aceptable: p.umbralAceptable, actualizado_por_email: email })
    .eq("indicador", p.indicador);
  if (error) throw new Error(error.message);
  const { error: e2 } = await db.from("financiera_cargas").insert({
    tipo: "cambiar_parametro",
    usuario_email: email,
    detalle: {
      indicador: p.indicador,
      antes: { excelente: anterior.umbralExcelente, aceptable: anterior.umbralAceptable },
      despues: { excelente: p.umbralExcelente, aceptable: p.umbralAceptable },
    },
  });
  if (e2) console.error("[financiera] no se pudo registrar el cambio de parámetro:", e2.message);
}

export interface VersionPeriodo {
  id: string;
  periodo: string;
  motivo: string;
  tomadaPorEmail: string | null;
  tomadaAt: string;
  ingresos: number | null;
  utilidadNeta: number | null;
  vehiculos: number | null;
  vehiculosConContable: number | null;
}

export async function listarVersiones(limite = 50): Promise<VersionPeriodo[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("financiera_periodos_versiones")
    .select("id, periodo, motivo, tomada_por_email, tomada_at, resumen")
    .order("tomada_at", { ascending: false })
    .range(0, Math.max(0, limite - 1));
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const res = (r.resumen ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id),
      periodo: String(r.periodo),
      motivo: String(r.motivo),
      tomadaPorEmail: (r.tomada_por_email as string | null) ?? null,
      tomadaAt: String(r.tomada_at),
      ingresos: res.ingresos != null ? n(res.ingresos) : null,
      utilidadNeta: res.utilidad_neta != null ? n(res.utilidad_neta) : null,
      vehiculos: res.vehiculos != null ? n(res.vehiculos) : null,
      vehiculosConContable: res.vehiculos_con_contable != null ? n(res.vehiculos_con_contable) : null,
    };
  });
}
