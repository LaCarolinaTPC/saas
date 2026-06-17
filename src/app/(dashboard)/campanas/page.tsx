import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CampanasClient } from "./campanas-client";
import { deriveDailyMetrics, type CandidateRow, type MetaDailyRow, type StageInfo } from "@/lib/recruitment/derive";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  const supabase = await createClient();

  // 1. Pipeline de candidatos (postulantes → contratados), paginado.
  const candidates: CandidateRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("candidate_vacancy")
      .select("applied_at, current_stage, candidates(source)")
      .order("applied_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as {
      applied_at: string | null;
      current_stage: string | null;
      candidates: { source: string | null } | null;
    }[];
    for (const r of rows) {
      candidates.push({
        applied_at: r.applied_at,
        current_stage: r.current_stage,
        source: r.candidates?.source ?? null,
      });
    }
    if (rows.length < PAGE) break;
  }

  // 2. Conversaciones iniciadas por Meta + gasto.
  const { data: spend } = await supabase
    .from("meta_spend_daily")
    .select("fecha, gasto, leads");
  const metaDaily = (spend ?? []) as (MetaDailyRow & { gasto: number | null })[];
  const gastoMeta = metaDaily.reduce((s, r) => s + (Number(r.gasto) || 0), 0);

  // Configuración real del pipeline (orden + tipo) para clasificar el embudo.
  const admin = createAdminClient();
  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("key, orden, tipo");
  const stageInfo = (stages ?? []) as StageInfo[];

  const metrics = deriveDailyMetrics(candidates, metaDaily, stageInfo);

  return <CampanasClient metrics={metrics} gastoMeta={gastoMeta} />;
}
