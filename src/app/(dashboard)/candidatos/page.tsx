import { getCandidatesPipeline, getAllCandidates, getActiveVacancies } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { CandidatosClient } from "./client";

export const dynamic = "force-dynamic";

export default async function CandidatosPage() {
  const [pipeline, allCandidates, vacancies, perms] = await Promise.all([
    getCandidatesPipeline(),
    getAllCandidates(),
    getActiveVacancies(),
    getCurrentPermissions(),
  ]);

  // Etapas configurables del pipeline (activas, en orden).
  const admin = createAdminClient();
  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, key, label, color, text_color, orden, tipo, activo")
    .eq("activo", true)
    .order("orden", { ascending: true });

  return (
    <CandidatosClient
      pipeline={pipeline}
      allCandidates={allCandidates}
      vacancies={vacancies}
      stages={stages ?? []}
      canManageStages={perms.isAdmin}
    />
  );
}
