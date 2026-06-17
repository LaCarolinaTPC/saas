import type { DailyMetric } from "./funnel";

/**
 * Deriva las métricas diarias del embudo a partir de los datos reales de la app:
 *  - postulantes…contratados  → pipeline de candidatos (candidate_vacancy.current_stage)
 *  - conversaciones           → conversaciones iniciadas por anuncios de Meta
 *                               (meta_spend_daily.leads = messaging conversations started)
 *
 * El mapeo etapa → embudo es aproximado y ajustable:
 *   recibido(0) en_revision(1) validacion_documental(2) preseleccionado(3)
 *   entrevistado(4) en_pruebas(5) aprobado(6) rechazado(-1)
 */

const STAGE_RANK: Record<string, number> = {
  recibido: 0,
  en_revision: 1,
  validacion_documental: 2,
  preseleccionado: 3,
  entrevistado: 4,
  en_pruebas: 5,
  aprobado: 6,
  rechazado: -1,
};

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
  metaDaily: MetaDailyRow[]
): DailyMetric[] {
  const map = new Map<string, Bucket>(); // key = `${fecha}|${canal}`

  const get = (fecha: string, canal: string) => {
    const k = `${fecha}|${canal}`;
    let b = map.get(k);
    if (!b) { b = emptyBucket(); map.set(k, b); }
    return b;
  };

  // Pipeline de candidatos
  for (const c of candidates) {
    if (!c.applied_at) continue;
    const fecha = c.applied_at.slice(0, 10);
    const canal = sourceToChannel(c.source);
    const rank = STAGE_RANK[c.current_stage ?? "recibido"] ?? 0;
    const b = get(fecha, canal);
    b.postulantes += 1;
    if (rank >= 1) b.pasan += 1;
    if (rank >= 3 && rank !== 6) b.continuan += 1;
    if (rank >= 5) b.evaluaciones += 1;
    if (rank >= 5) b.aptos += 1;
    if (rank === 6) b.contratados += 1;
  }

  // Conversaciones iniciadas por Meta (atribuidas al canal WhatsApp)
  for (const m of metaDaily) {
    const fecha = m.fecha.slice(0, 10);
    get(fecha, "WhatsApp").conversaciones += Number(m.leads) || 0;
  }

  return [...map.entries()].map(([key, b]) => {
    const [fecha, canal] = key.split("|");
    return { fecha, canal, motivo_fuga: null, ...b };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
