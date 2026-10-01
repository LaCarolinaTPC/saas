/**
 * Consolidado de la revisión de timbradas: reglas puras.
 *
 * Cruza la foto diaria del cálculo (viajes por revisar de cada día) con los
 * checks de revisado y los cierres formales del día.
 *
 *  - Se revisa lo que el cálculo dice HOY que está por revisar: un check en un
 *    viaje que GEMA ya resolvió (quedó OK o no despachado) se conserva como
 *    evidencia, pero no suma al avance.
 *  - Un viaje que entra a revisión después del cierre del día (p. ej. un
 *    recaudo tardío que lo vuelve Diferencia) queda pendiente como "nuevo" y
 *    el día pasa a "reabierto".
 */
import { ESTADOS, type EstadoTimbrada, type FilaRevision, type ResultadoDia, esAlerta, requiereRevision } from "./revision-timbradas-reglas";

/** Primer día revisado en Gestivo; lo anterior se revisó con el informe Python. */
export const INICIO_REVISION_GESTIVO = "2026-09-30";
/** Días hacia atrás que el cron recalcula: GEMA sigue corrigiendo descuentos y recaudos. */
export const DIAS_RECALCULO = 10;

export interface ViajeFoto {
  numero: number;
  estado: EstadoTimbrada;
  placa: string;
  viaje: number;
}

export interface FotoDia {
  fecha: string;
  totalViajes: number;
  porRevisar: number;
  alertas: number;
  conteoEstados: Partial<Record<EstadoTimbrada, number>>;
  viajes: ViajeFoto[];
  calculadoAt: string;
}

export interface CheckRevision {
  fecha: string;
  numero: number;
  revisadoPorEmail: string | null;
  revisadoAt: string;
}

export interface CierreDia {
  fecha: string;
  cerradoAt: string;
  cerradoPorEmail: string | null;
  porRevisar: number;
  revisados: number;
  numeros: number[];
}

export type EstadoDia = "sin_calculo" | "sin_pendientes" | "sin_revisar" | "en_curso" | "completo" | "cerrado" | "reabierto";

export const ETIQUETA_ESTADO_DIA: Record<EstadoDia, string> = {
  sin_calculo: "Sin calcular",
  sin_pendientes: "Nada por revisar",
  sin_revisar: "Sin revisar",
  en_curso: "En curso",
  completo: "Completo",
  cerrado: "Cerrado",
  reabierto: "Reabierto",
};

export interface AvanceDia {
  fecha: string;
  estadoDia: EstadoDia;
  totalViajes: number;
  porRevisar: number;
  revisados: number;
  pendientes: number;
  /** Pendientes que no estaban en el último cierre (entraron después). */
  nuevosTrasCierre: number;
  /** Checks en viajes que ya no están por revisar (GEMA los resolvió). */
  resueltosPorGema: number;
  /** 0–100; 100 si no hay nada por revisar. */
  avance: number;
  alertas: number;
  revisores: string[];
  ultimoCheck: string | null;
  pendientesPorEstado: Partial<Record<EstadoTimbrada, number>>;
  revisadosPorEstado: Partial<Record<EstadoTimbrada, number>>;
  cierre: CierreDia | null;
  calculadoAt: string | null;
}

/** Foto del día a partir del cálculo completo. */
export function fotoDesdeResultado(rev: Pick<ResultadoDia, "fecha" | "filas">, calculadoAt = new Date().toISOString()): FotoDia {
  const conteo: Partial<Record<EstadoTimbrada, number>> = {};
  for (const f of rev.filas) conteo[f.estado] = (conteo[f.estado] ?? 0) + 1;
  const viajes = rev.filas.filter(requiereRevision).map((f: FilaRevision) => ({ numero: f.numero, estado: f.estado, placa: f.placa, viaje: f.viaje }));
  return {
    fecha: rev.fecha,
    totalViajes: rev.filas.length,
    porRevisar: viajes.length,
    alertas: rev.filas.filter(esAlerta).length,
    conteoEstados: conteo,
    viajes,
    calculadoAt,
  };
}

/** Último cierre de cada día (el vigente). */
export function ultimoCierrePorDia(cierres: readonly CierreDia[]): Map<string, CierreDia> {
  const m = new Map<string, CierreDia>();
  for (const c of cierres) {
    const prev = m.get(c.fecha);
    if (!prev || c.cerradoAt > prev.cerradoAt) m.set(c.fecha, c);
  }
  return m;
}

export function avanceDia(fecha: string, foto: FotoDia | null, checks: readonly CheckRevision[], cierre: CierreDia | null): AvanceDia {
  const conCheck = new Map(checks.map((c) => [c.numero, c]));
  const viajes = foto?.viajes ?? [];
  const porRevisarSet = new Set(viajes.map((v) => v.numero));
  const pendientesPorEstado: Partial<Record<EstadoTimbrada, number>> = {};
  const revisadosPorEstado: Partial<Record<EstadoTimbrada, number>> = {};
  let revisados = 0;
  let nuevos = 0;
  const enCierre = new Set(cierre?.numeros ?? []);
  for (const v of viajes) {
    if (conCheck.has(v.numero)) {
      revisados++;
      revisadosPorEstado[v.estado] = (revisadosPorEstado[v.estado] ?? 0) + 1;
    } else {
      pendientesPorEstado[v.estado] = (pendientesPorEstado[v.estado] ?? 0) + 1;
      if (cierre && !enCierre.has(v.numero)) nuevos++;
    }
  }
  const pendientes = viajes.length - revisados;
  const resueltosPorGema = checks.filter((c) => !porRevisarSet.has(c.numero)).length;
  const revisores = [...new Set(checks.map((c) => c.revisadoPorEmail).filter((e): e is string => !!e))].sort();
  const ultimoCheck = checks.reduce<string | null>((a, c) => (!a || c.revisadoAt > a ? c.revisadoAt : a), null);

  let estadoDia: EstadoDia;
  if (!foto) estadoDia = "sin_calculo";
  else if (cierre) estadoDia = pendientes === 0 ? "cerrado" : "reabierto";
  else if (viajes.length === 0) estadoDia = "sin_pendientes";
  else if (pendientes === 0) estadoDia = "completo";
  else if (revisados === 0) estadoDia = "sin_revisar";
  else estadoDia = "en_curso";

  return {
    fecha,
    estadoDia,
    totalViajes: foto?.totalViajes ?? 0,
    porRevisar: viajes.length,
    revisados,
    pendientes,
    nuevosTrasCierre: nuevos,
    resueltosPorGema,
    avance: viajes.length ? Math.floor((1000 * revisados) / viajes.length) / 10 : foto ? 100 : 0,
    alertas: foto?.alertas ?? 0,
    revisores,
    ultimoCheck,
    pendientesPorEstado,
    revisadosPorEstado,
    cierre,
    calculadoAt: foto?.calculadoAt ?? null,
  };
}

/** El día se puede cerrar cuando no queda nada pendiente y no está ya cerrado. */
export const puedeCerrarDia = (a: Pick<AvanceDia, "estadoDia" | "pendientes">) =>
  a.pendientes === 0 && (a.estadoDia === "completo" || a.estadoDia === "sin_pendientes");

export interface FilaPorEstado {
  estado: EstadoTimbrada;
  porRevisar: number;
  revisados: number;
  pendientes: number;
  avance: number;
}

export interface FilaPorRevisor {
  email: string;
  checks: number;
  dias: number;
  diasCerrados: number;
  primerCheck: string;
  ultimoCheck: string;
}

export interface Consolidado {
  desde: string;
  hasta: string;
  dias: AvanceDia[];
  totales: {
    dias: number;
    porRevisar: number;
    revisados: number;
    pendientes: number;
    nuevosTrasCierre: number;
    avance: number;
    diasCerrados: number;
    diasCompletos: number;
    diasConPendientes: number;
    diasSinCalcular: number;
  };
  porEstado: FilaPorEstado[];
  porRevisor: FilaPorRevisor[];
}

const pct = (a: number, b: number) => (b ? Math.floor((1000 * a) / b) / 10 : 100);

/** Consolida los días [desde, hasta] (fechas ISO, inclusivas, en orden descendente). */
export function consolidar(
  fechas: readonly string[],
  fotos: readonly FotoDia[],
  checks: readonly CheckRevision[],
  cierres: readonly CierreDia[],
): Consolidado {
  const fotoPorDia = new Map(fotos.map((f) => [f.fecha, f]));
  const checksPorDia = new Map<string, CheckRevision[]>();
  for (const c of checks) checksPorDia.set(c.fecha, [...(checksPorDia.get(c.fecha) ?? []), c]);
  const cierrePorDia = ultimoCierrePorDia(cierres);
  const dias = [...fechas].sort((a, b) => (a < b ? 1 : -1))
    .map((d) => avanceDia(d, fotoPorDia.get(d) ?? null, checksPorDia.get(d) ?? [], cierrePorDia.get(d) ?? null));

  const sum = (k: "porRevisar" | "revisados" | "pendientes" | "nuevosTrasCierre") => dias.reduce((a, d) => a + d[k], 0);
  const porRevisar = sum("porRevisar");
  const revisados = sum("revisados");

  const porEstado = ESTADOS.filter((e) => e !== "OK" && e !== "N/A - No Despachado").map((estado) => {
    const pend = dias.reduce((a, d) => a + (d.pendientesPorEstado[estado] ?? 0), 0);
    const rev = dias.reduce((a, d) => a + (d.revisadosPorEstado[estado] ?? 0), 0);
    return { estado, porRevisar: pend + rev, revisados: rev, pendientes: pend, avance: pct(rev, pend + rev) };
  });

  const enPeriodo = new Set(fechas);
  const rev = new Map<string, FilaPorRevisor & { _dias: Set<string> }>();
  for (const c of checks) {
    if (!enPeriodo.has(c.fecha)) continue;
    const email = c.revisadoPorEmail ?? "(sin usuario)";
    const r = rev.get(email) ?? { email, checks: 0, dias: 0, diasCerrados: 0, primerCheck: c.revisadoAt, ultimoCheck: c.revisadoAt, _dias: new Set<string>() };
    r.checks++;
    r._dias.add(c.fecha);
    if (c.revisadoAt < r.primerCheck) r.primerCheck = c.revisadoAt;
    if (c.revisadoAt > r.ultimoCheck) r.ultimoCheck = c.revisadoAt;
    rev.set(email, r);
  }
  for (const c of cierrePorDia.values()) {
    if (!enPeriodo.has(c.fecha)) continue;
    const email = c.cerradoPorEmail ?? "(sin usuario)";
    // Quien cierra puede no haber puesto checks ese periodo: igual aparece.
    const r = rev.get(email) ?? { email, checks: 0, dias: 0, diasCerrados: 0, primerCheck: c.cerradoAt, ultimoCheck: c.cerradoAt, _dias: new Set<string>() };
    r.diasCerrados++;
    rev.set(email, r);
  }
  const porRevisor = [...rev.values()]
    .map(({ _dias, ...r }) => ({ ...r, dias: _dias.size }))
    .sort((a, b) => b.checks - a.checks || a.email.localeCompare(b.email));

  return {
    desde: fechas.length ? [...fechas].sort()[0] : "",
    hasta: fechas.length ? [...fechas].sort().at(-1)! : "",
    dias,
    totales: {
      dias: dias.length,
      porRevisar,
      revisados,
      pendientes: sum("pendientes"),
      nuevosTrasCierre: sum("nuevosTrasCierre"),
      avance: pct(revisados, porRevisar),
      diasCerrados: dias.filter((d) => d.estadoDia === "cerrado").length,
      diasCompletos: dias.filter((d) => d.estadoDia === "completo" || d.estadoDia === "sin_pendientes").length,
      diasConPendientes: dias.filter((d) => d.pendientes > 0).length,
      diasSinCalcular: dias.filter((d) => d.estadoDia === "sin_calculo").length,
    },
    porEstado,
    porRevisor,
  };
}

/** Fechas ISO del rango [desde, hasta], recortado al inicio de la revisión en Gestivo. */
export function fechasDelRango(desde: string, hasta: string): string[] {
  const ini = desde < INICIO_REVISION_GESTIVO ? INICIO_REVISION_GESTIVO : desde;
  const out: string[] = [];
  for (let d = new Date(`${ini}T00:00:00Z`); d <= new Date(`${hasta}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
