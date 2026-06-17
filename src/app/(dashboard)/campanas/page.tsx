import { createClient } from "@/lib/supabase/server";
import { CampanasClient } from "./campanas-client";
import type { DailyMetric } from "@/lib/recruitment/funnel";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  const supabase = await createClient();

  const [metricsRes, spendRes] = await Promise.all([
    supabase
      .from("recruitment_daily_metrics")
      .select(
        "fecha, canal, conversaciones, postulantes, pasan, continuan, evaluaciones, aptos, contratados, motivo_fuga"
      )
      .order("fecha", { ascending: true }),
    supabase.from("meta_spend_daily").select("fecha, gasto"),
  ]);

  const metrics = (metricsRes.data ?? []) as DailyMetric[];
  const gastoMeta = (spendRes.data ?? []).reduce(
    (s: number, r: { gasto: number | null }) => s + (Number(r.gasto) || 0),
    0
  );

  return <CampanasClient metrics={metrics} gastoMeta={gastoMeta} />;
}
