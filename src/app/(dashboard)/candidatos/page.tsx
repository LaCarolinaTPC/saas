import { getCandidatesPipeline, getAllCandidates, getActiveVacancies } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { CandidatosClient } from "./client";

export const dynamic = "force-dynamic";

export default async function CandidatosPage() {
  const [pipeline, allCandidates, vacancies] = await Promise.all([
    getCandidatesPipeline(),
    getAllCandidates(),
    getActiveVacancies(),
  ]);

  // Etapas configurables del pipeline (activas, en orden).
  const admin = createAdminClient();
  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("key, label, color, text_color, orden, tipo, activo")
    .eq("activo", true)
    .order("orden", { ascending: true });

  return (
    <CandidatosClient
      pipeline={pipeline}
      allCandidates={allCandidates}
      vacancies={vacancies}
      stages={stages ?? []}
    />
  );
}
