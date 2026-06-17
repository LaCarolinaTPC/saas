import type { DailyMetric } from "./funnel";

/**
 * Deriva las métricas diarias del embudo a partir de los datos reales de la app:
 *  - postulantes…contratados  → pipeline de candidatos (candidate_vacancy.current_stage)
 *  - conversaciones           → conversaciones iniciadas por anuncios de Meta
 *                               (meta_spend_daily.leads = messaging conversations started)
 *
 * El progreso se calcula desde la configuración real del pipeline
 * (pipeline_stages: orden + tipo), por lo que respeta las etapas personalizadas:
 *   - contratado          → etapa de tipo 'ganado'
 *   - perdido/rechazado   → etapa de tipo 'perdido' (no cuenta como "continúa")
 *   - pasan/continúan/eval → según el orden relativo de la etapa
 */

export interface StageInfo {
  key: string;
  orden: number;
  tipo: string; // 'normal' | 'ganado' | 'perdido'
}

export function sourceToChannel(source: string | null): string {
  const s = (source ?? "").toLowerCase();
  if (s.includes("whats")) return "WhatsApp";
  if (s.includes("refer")) return "Referido";
  if (s.includes("computrabajo")) return "Computrabajo";
  if (s.includes("manychat")) return "ManyChat";
  if (s.includes("varylo")) return "Varylo";
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram"))
    return "WhatsApp";
  return "Otros";
}

export interface CandidateRow {
  source: string | null;
  applied_at: string | null; // candidate_vacancy.applied_at
  current_stage: string | null;
}

export interface MetaDailyRow {
  fecha: string;
  leads: number | null;
}

type Bucket = {
  postulantes: number; pasan: number; continuan: number;
  evaluaciones: number; aptos: number; contratados: number; conversaciones: number;
};

function emptyBucket(): Bucket {
  return { postulantes: 0, pasan: 0, continuan: 0, evaluaciones: 0, aptos: 0, contratados: 0, conversaciones: 0 };
}

export function deriveDailyMetrics(
  candidates: CandidateRow[],
  metaDaily: MetaDailyRow[],
  stages: StageInfo[]
): DailyMetric[] {
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const normales = stages.filter((s) => s.tipo === "normal").map((s) => s.orden);
  const firstOrden = normales.length ? Math.min(...normales) : 1;
  const lastOrden = normales.length ? Math.max(...normales) : 1;

  const map = new Map<string, Bucket>(); // key = `${fecha}|${canal}`
  const get = (fecha: string, canal: string) => {
    const k = `${fecha}|${canal}`;
    let b = map.get(k);
    if (!b) { b = emptyBucket(); map.set(k, b); }
    return b;
  };

  for (const c of candidates) {
    if (!c.applied_at) continue;
    const fecha = c.applied_at.slice(0, 10);
    const canal = sourceToChannel(c.source);
    const info = c.current_stage ? byKey.get(c.current_stage) : undefined;
    const tipo = info?.tipo ?? "normal";
    const orden = info?.orden ?? firstOrden;

    const b = get(fecha, canal);
    b.postulantes += 1;
    const ganado = tipo === "ganado";
    const perdido = tipo === "perdido";

    if (ganado || (!perdido && orden > firstOrden)) b.pasan += 1;
    if (tipo === "normal" && orden > firstOrden) b.continuan += 1;
    if (ganado || (!perdido && orden >= lastOrden)) { b.evaluaciones += 1; b.aptos += 1; }
    if (ganado) b.contratados += 1;
  }

  for (const m of metaDaily) {
    get(m.fecha.slice(0, 10), "WhatsApp").conversaciones += Number(m.leads) || 0;
  }

  return [...map.entries()].map(([key, b]) => {
    const [fecha, canal] = key.split("|");
    return { fecha, canal, motivo_fuga: null, ...b };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
