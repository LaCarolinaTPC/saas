// Indicadores del tablero de cámaras y sensores, calculados sobre las
// revisiones vigentes del periodo. Puro: lo usan la página y las pruebas.
import type { RevisionCamaras } from "./camaras-data";
import { compararConAforo, type Elemento, type TipoNovedad } from "./camaras-reglas";

/** Viajes mínimos comparados para que un conductor entre al ranking de caja. */
export const MIN_VIAJES_CONDUCTOR = 3;

export interface FilaMes {
  mes: string;
  revisiones: number;
  fallas: number;
  /** % de revisiones con DFS y aforo en que el DFS cuadra; null sin comparables. */
  pctCuadra: number | null;
}

export interface FilaVehiculo {
  codigo: string;
  revisiones: number;
  fallasCamara: number;
  fallasSensor: number;
  comparables: number;
  pctCuadra: number | null;
  /** Suma de (DFS − aforo) sobre las comparables: negativo, el sensor cuenta de menos. */
  diferenciaDfs: number;
}

export interface FilaConductor {
  cedula: string;
  nombre: string;
  viajes: number;
  aforo: number;
  caja: number;
  /** caja − aforo: negativo son pasajeros vistos en el video que no timbraron. */
  diferencia: number;
  pct: number | null;
}

export interface Tablero {
  revisiones: number;
  viajesRevisados: number;
  fallas: number;
  comparables: number;
  pctCuadra: number | null;
  // ── Descriptivos adicionales (no rompen las pruebas existentes) ──
  /** Revisiones y fallas separadas por elemento, para la tasa de falla por tipo. */
  revisionesCamara: number;
  revisionesSensor: number;
  fallasCamara: number;
  fallasSensor: number;
  /** Buses distintos revisados y cuántos tuvieron al menos una falla de cada tipo. */
  busesRevisados: number;
  busesConFallaCamara: number;
  busesConFallaSensor: number;
  /** Revisiones marcadas como repetidas (reprocesos). */
  repetidas: number;
  /** Oportunidad de la revisión: días entre el viaje y el día en que se vio el video. */
  latenciaMediana: number | null;
  latenciaDentro7Pct: number | null;
  latenciaMedidas: number;
  porTipo: { clave: string; nombre: string; elemento: Elemento; cantidad: number }[];
  porMes: FilaMes[];
  vehiculos: FilaVehiculo[];
  conductores: FilaConductor[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Días calendario entre dos fechas ISO (b − a); negativo si b es anterior. */
function diasISO(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export function resumirTablero(
  revisiones: RevisionCamaras[],
  tipos: TipoNovedad[],
  recaudo: Record<number, number | null>,
): Tablero {
  const nombre = new Map(tipos.map((t) => [t.clave, t]));
  const viajes = new Set<string>();
  const porTipo = new Map<string, number>();
  const meses = new Map<string, { revisiones: number; fallas: number; comparables: number; cuadra: number }>();
  const buses = new Map<string, FilaVehiculo & { cuadra: number }>();
  const conductores = new Map<string, Omit<FilaConductor, "diferencia" | "pct">>();
  let fallas = 0, comparables = 0, cuadra = 0;
  let revisionesCamara = 0, revisionesSensor = 0, fallasCamara = 0, fallasSensor = 0, repetidas = 0;
  const latencias: number[] = [];

  for (const r of revisiones) {
    viajes.add(`${r.fecha_viaje}|${r.vehiculo_codigo}|${r.viaje}`);
    if (r.elemento === "camara") revisionesCamara++; else revisionesSensor++;
    if (r.con_falla) { if (r.elemento === "camara") fallasCamara++; else fallasSensor++; }
    if (r.revision_repetida) repetidas++;
    if (r.fecha_revision) {
      const d = diasISO(r.fecha_viaje, r.fecha_revision);
      if (d >= 0 && d <= 400) latencias.push(d);
    }
    const mes = r.fecha_viaje.slice(0, 7);
    const m = meses.get(mes) ?? { revisiones: 0, fallas: 0, comparables: 0, cuadra: 0 };
    const b = buses.get(r.vehiculo_codigo) ?? {
      codigo: r.vehiculo_codigo, revisiones: 0, fallasCamara: 0, fallasSensor: 0, comparables: 0, pctCuadra: null,
      diferenciaDfs: 0, cuadra: 0,
    };
    m.revisiones++;
    b.revisiones++;
    if (r.con_falla) {
      fallas++;
      m.fallas++;
      if (r.elemento === "camara") b.fallasCamara++; else b.fallasSensor++;
      porTipo.set(r.tipo_novedad, (porTipo.get(r.tipo_novedad) ?? 0) + 1);
    }
    const d = compararConAforo(r.dfs_optocontrol, r.aforo);
    if (d.nivel !== "sin_dato") {
      comparables++;
      m.comparables++;
      b.comparables++;
      b.diferenciaDfs += d.diferencia ?? 0;
      if (d.nivel === "ok") { cuadra++; m.cuadra++; b.cuadra++; }
    }
    meses.set(mes, m);
    buses.set(r.vehiculo_codigo, b);

    // Caja frente al aforo, por conductor: una vez por viaje (la fila de cámara).
    const caja = r.despacho_numero != null ? recaudo[r.despacho_numero] : null;
    if (r.elemento === "camara" && r.aforo != null && caja != null && r.conductor_cedula && !r.revision_repetida) {
      const c = conductores.get(r.conductor_cedula) ?? {
        cedula: r.conductor_cedula, nombre: r.conductor_nombre ?? r.conductor_cedula, viajes: 0, aforo: 0, caja: 0,
      };
      c.viajes++;
      c.aforo += r.aforo;
      c.caja += caja;
      conductores.set(r.conductor_cedula, c);
    }
  }

  const busesArr = [...buses.values()];
  const dentro7 = latencias.filter((d) => d <= 7).length;

  return {
    revisiones: revisiones.length,
    viajesRevisados: viajes.size,
    fallas,
    comparables,
    pctCuadra: pct(cuadra, comparables),
    revisionesCamara,
    revisionesSensor,
    fallasCamara,
    fallasSensor,
    busesRevisados: busesArr.length,
    busesConFallaCamara: busesArr.filter((b) => b.fallasCamara > 0).length,
    busesConFallaSensor: busesArr.filter((b) => b.fallasSensor > 0).length,
    repetidas,
    latenciaMediana: mediana(latencias),
    latenciaDentro7Pct: pct(dentro7, latencias.length),
    latenciaMedidas: latencias.length,
    porTipo: [...porTipo]
      .map(([clave, cantidad]) => ({
        clave, cantidad, nombre: nombre.get(clave)?.nombre ?? clave, elemento: nombre.get(clave)?.elemento ?? "camara",
      }))
      .sort((a, b) => b.cantidad - a.cantidad),
    porMes: [...meses]
      .map(([mes, m]) => ({ mes, revisiones: m.revisiones, fallas: m.fallas, pctCuadra: pct(m.cuadra, m.comparables) }))
      .sort((a, b) => b.mes.localeCompare(a.mes)),
    vehiculos: [...buses.values()]
      .map(({ cuadra: c, ...b }) => ({ ...b, pctCuadra: pct(c, b.comparables) }))
      .sort((a, b) => b.fallasCamara + b.fallasSensor - (a.fallasCamara + a.fallasSensor) || b.revisiones - a.revisiones),
    conductores: [...conductores.values()]
      .filter((c) => c.viajes >= MIN_VIAJES_CONDUCTOR)
      .map((c) => ({ ...c, diferencia: c.caja - c.aforo, pct: c.aforo > 0 ? Math.round(((c.caja - c.aforo) / c.aforo) * 1000) / 10 : null }))
      .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
  };
}

// ── Análisis descriptivo y prescriptivo ───────────────────────────────────────

export type InsightTono = "critico" | "alerta" | "bueno" | "info";

export interface Insight {
  tono: InsightTono;
  titulo: string;
  detalle: string;
}

export interface AnalisisTablero {
  /** Qué está pasando, en frases cortas. */
  descriptivo: Insight[];
  /** Qué hacer, accionable y priorizado. */
  recomendaciones: Insight[];
}

/** Umbrales del análisis (centralizados para que pantalla y pruebas coincidan). */
export const UMBRAL = {
  coberturaBuena: 80,
  coberturaCritica: 60,
  cuadreBueno: 80,
  cuadreCritico: 60,
  evasionCritica: -15,
  reincidenteFallas: 3,
  latenciaDiasOk: 7,
  dentro7Bueno: 70,
};

const lista = (xs: string[], n = 3) =>
  xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} y ${xs.length - n} más`;

const pctTxt = (v: number | null) => (v == null ? "sin dato" : `${v} %`.replace(".", ","));

/**
 * Lee el tablero y entrega el análisis: primero lo descriptivo (cobertura,
 * fallas, cuadre, oportunidad, evasión) y luego las recomendaciones accionables,
 * ordenadas de más urgente a menos. No toca la base: puro, para pruebas y UI.
 */
export function analizarTablero(t: Tablero, despachados: number): AnalisisTablero {
  const cobertura = despachados > 0 ? Math.round((t.viajesRevisados / despachados) * 1000) / 10 : null;
  const tasaFalla = pct(t.fallas, t.revisiones);
  const tasaCam = pct(t.fallasCamara, t.revisionesCamara);
  const tasaSen = pct(t.fallasSensor, t.revisionesSensor);
  const riesgo = t.conductores.filter((c) => (c.pct ?? 0) <= UMBRAL.evasionCritica);
  const reincidentes = t.vehiculos.filter((v) => v.fallasCamara + v.fallasSensor >= UMBRAL.reincidenteFallas);
  const topCamara = t.vehiculos.filter((v) => v.fallasCamara > 0).slice(0, 5).map((v) => v.codigo);
  const descuadre = t.vehiculos
    .filter((v) => v.comparables > 0 && v.diferenciaDfs < 0)
    .sort((a, b) => a.diferenciaDfs - b.diferenciaDfs)
    .slice(0, 5)
    .map((v) => v.codigo);

  const descriptivo: Insight[] = [];
  const recomendaciones: Insight[] = [];

  // 1) Cobertura de revisión
  if (cobertura != null) {
    const tono: InsightTono = cobertura >= UMBRAL.coberturaBuena ? "bueno" : cobertura >= UMBRAL.coberturaCritica ? "alerta" : "critico";
    descriptivo.push({
      tono, titulo: `Cobertura ${pctTxt(cobertura)}`,
      detalle: `Se revisaron ${t.viajesRevisados} de ${despachados} viajes despachados en GEMA.`,
    });
    if (cobertura < UMBRAL.coberturaBuena) {
      const meta = Math.ceil((UMBRAL.coberturaBuena / 100) * despachados) - t.viajesRevisados;
      recomendaciones.push({
        tono: cobertura < UMBRAL.coberturaCritica ? "critico" : "alerta",
        titulo: "Subir la cobertura de revisión",
        detalle: `Faltan ~${Math.max(0, meta)} viajes revisados para llegar al ${UMBRAL.coberturaBuena} %. Prioriza los buses y días sin ninguna revisión.`,
      });
    }
  }

  // 2) Tasa de falla y elemento que manda
  if (tasaFalla != null) {
    const peor = (tasaCam ?? 0) >= (tasaSen ?? 0) ? "cámara" : "sensor";
    descriptivo.push({
      tono: "info", titulo: `Tasa de falla ${pctTxt(tasaFalla)}`,
      detalle: `Cámara ${pctTxt(tasaCam)} · sensor ${pctTxt(tasaSen)}. Hoy pesa más la ${peor}.`,
    });
  }

  // 3) Salud de cámaras de la flota
  if (t.busesRevisados > 0) {
    const sanos = t.busesRevisados - t.busesConFallaCamara;
    const pctSanos = pct(sanos, t.busesRevisados);
    descriptivo.push({
      tono: (pctSanos ?? 100) >= 80 ? "bueno" : "alerta", titulo: `Cámaras sanas ${pctTxt(pctSanos)}`,
      detalle: `${sanos} de ${t.busesRevisados} buses revisados sin falla de cámara en el periodo.`,
    });
  }
  if (topCamara.length > 0) {
    recomendaciones.push({
      tono: reincidentes.length ? "critico" : "alerta",
      titulo: "Mantenimiento de cámara",
      detalle: `Programa revisión de cámara/MicroSD en: ${lista(topCamara)}.`,
    });
  }

  // 4) Cuadre del sensor con el aforo
  if (t.pctCuadra != null) {
    const tono: InsightTono = t.pctCuadra >= UMBRAL.cuadreBueno ? "bueno" : t.pctCuadra >= UMBRAL.cuadreCritico ? "alerta" : "critico";
    descriptivo.push({
      tono, titulo: `Sensor cuadra ${pctTxt(t.pctCuadra)}`,
      detalle: `En ${t.comparables} viajes con DFS y aforo (histórico del Forms).`,
    });
    if (t.pctCuadra < UMBRAL.cuadreBueno && descuadre.length > 0) {
      recomendaciones.push({
        tono: t.pctCuadra < UMBRAL.cuadreCritico ? "critico" : "alerta",
        titulo: "Calibrar sensores de conteo",
        detalle: `El conteo cuadra solo en ${pctTxt(t.pctCuadra)}. Empieza por los de mayor descuadre: ${lista(descuadre)}.`,
      });
    }
  }

  // 5) Oportunidad: qué tan al día se revisa
  if (t.latenciaMedidas > 0) {
    const tono: InsightTono = (t.latenciaDentro7Pct ?? 0) >= UMBRAL.dentro7Bueno ? "bueno" : "alerta";
    descriptivo.push({
      tono, titulo: `Revisión al día: ${pctTxt(t.latenciaDentro7Pct)} en ≤ 7 días`,
      detalle: `Mediana de ${t.latenciaMediana} día(s) entre el viaje y la revisión.`,
    });
    if ((t.latenciaDentro7Pct ?? 100) < UMBRAL.dentro7Bueno) {
      recomendaciones.push({
        tono: "alerta", titulo: "Revisar más cerca del viaje",
        detalle: `Solo ${pctTxt(t.latenciaDentro7Pct)} se revisa en 7 días; un rezago grande vuelve ciega la operación reciente.`,
      });
    }
  }

  // 6) Evasión de caja por conductor
  if (riesgo.length > 0) {
    descriptivo.push({
      tono: "critico", titulo: `${riesgo.length} conductor(es) con faltante ≥ 15 %`,
      detalle: "La caja quedó por debajo del aforo contado en el video.",
    });
    recomendaciones.push({
      tono: "critico", titulo: "Auditar caja de conductores",
      detalle: `Revisa a ${lista(riesgo.map((c) => c.nombre))} (faltante de caja frente al aforo). Es indicio, no prueba.`,
    });
  }

  // 7) Reprocesos
  if (t.repetidas > 0 && t.revisiones > 0 && t.repetidas / t.revisiones >= 0.1) {
    recomendaciones.push({
      tono: "info", titulo: "Reducir revisiones repetidas",
      detalle: `${t.repetidas} de ${t.revisiones} revisiones son repetidas: revisa el flujo para no reprocesar.`,
    });
  }

  const peso: Record<InsightTono, number> = { critico: 0, alerta: 1, info: 2, bueno: 3 };
  recomendaciones.sort((a, b) => peso[a.tono] - peso[b.tono]);
  return { descriptivo, recomendaciones };
}
