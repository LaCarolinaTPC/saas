/**
 * Cálculos del embudo de reclutamiento (módulo Campañas).
 * Funciones puras sobre las métricas diarias + gasto de Meta.
 */

export interface DailyMetric {
  fecha: string;
  canal: string;
  conversaciones: number;
  postulantes: number;
  pasan: number;
  continuan: number;
  evaluaciones: number;
  aptos: number;
  contratados: number;
  motivo_fuga: string | null;
}

// Canales atribuibles a inversión en Meta Ads (para costo por contratación).
export const META_CHANNELS = ["WhatsApp", "ManyChat", "Varylo"];

export type Semaforo = "verde" | "amarillo" | "rojo";

export interface FunnelTotals {
  conversaciones: number;
  postulantes: number;
  pasan: number;
  continuan: number;
  evaluaciones: number;
  aptos: number;
  contratados: number;
  contratadosMeta: number;
  gastoMeta: number;
  costoPorContratacion: number | null;
}

export interface SourceStat {
  canal: string;
  postulantes: number;
  contratados: number;
  conversion: number; // %
}

export interface Kpis {
  convAPostulante: number; // conversaciones → CV %
  cvAContratado: number; // CV → contratado (Meta) %
  convAContratado: number; // conversaciones → contratado %
}

function pct(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

export function computeTotals(rows: DailyMetric[], gastoMeta: number): FunnelTotals {
  const t = rows.reduce(
    (acc, r) => {
      acc.conversaciones += r.conversaciones || 0;
      acc.postulantes += r.postulantes || 0;
      acc.pasan += r.pasan || 0;
      acc.continuan += r.continuan || 0;
      acc.evaluaciones += r.evaluaciones || 0;
      acc.aptos += r.aptos || 0;
      acc.contratados += r.contratados || 0;
      if (META_CHANNELS.includes(r.canal)) acc.contratadosMeta += r.contratados || 0;
      return acc;
    },
    {
      conversaciones: 0, postulantes: 0, pasan: 0, continuan: 0,
      evaluaciones: 0, aptos: 0, contratados: 0, contratadosMeta: 0,
    }
  );
  return {
    ...t,
    gastoMeta,
    costoPorContratacion: t.contratadosMeta > 0 ? gastoMeta / t.contratadosMeta : null,
  };
}

export function computeSourceStats(rows: DailyMetric[]): SourceStat[] {
  const byCanal = new Map<string, { postulantes: number; contratados: number }>();
  for (const r of rows) {
    const cur = byCanal.get(r.canal) ?? { postulantes: 0, contratados: 0 };
    cur.postulantes += r.postulantes || 0;
    cur.contratados += r.contratados || 0;
    byCanal.set(r.canal, cur);
  }
  return [...byCanal.entries()]
    .map(([canal, v]) => ({
      canal,
      postulantes: v.postulantes,
      contratados: v.contratados,
      conversion: pct(v.contratados, v.postulantes),
    }))
    .sort((a, b) => b.contratados - a.contratados);
}

export function computeKpis(t: FunnelTotals): Kpis {
  const postulantesMeta = t.postulantes; // aproximación; refinar con atribución por canal
  return {
    convAPostulante: pct(t.postulantes, t.conversaciones),
    cvAContratado: pct(t.contratadosMeta, postulantesMeta),
    convAContratado: pct(t.contratados, t.conversaciones),
  };
}

/** Semáforo del día según los umbrales del dashboard. */
export function semaforoDia(r: DailyMetric): Semaforo {
  const conv = pct(r.contratados, r.postulantes);
  if (r.contratados >= 2 || conv >= 8 || r.continuan >= 5) return "verde";
  if (r.continuan >= 3 || r.contratados >= 1 || r.evaluaciones >= 2) return "amarillo";
  return "rojo";
}

/** Agrupa por fecha (sumando canales) para el gráfico diario. */
export function byDate(rows: DailyMetric[]): {
  fecha: string;
  postulantes: number;
  contratados: number;
}[] {
  const map = new Map<string, { postulantes: number; contratados: number }>();
  for (const r of rows) {
    const cur = map.get(r.fecha) ?? { postulantes: 0, contratados: 0 };
    cur.postulantes += r.postulantes || 0;
    cur.contratados += r.contratados || 0;
    map.set(r.fecha, cur);
  }
  return [...map.entries()]
    .map(([fecha, v]) => ({ fecha, ...v }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
