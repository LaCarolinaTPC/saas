import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { PipelineClient } from "./pipeline-client";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const perms = await getCurrentPermissions();

  if (!perms.isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
        </div>
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          Solo un administrador puede configurar las etapas del pipeline.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, key, label, color, text_color, orden, tipo, activo")
    .order("orden", { ascending: true });

  // Conteo de candidatos por etapa (para avisar antes de borrar).
  const { data: cvs } = await admin.from("candidate_vacancy").select("current_stage");
  const counts: Record<string, number> = {};
  for (const r of cvs ?? []) {
    const k = r.current_stage as string;
    if (k) counts[k] = (counts[k] ?? 0) + 1;
  }

  return <PipelineClient stages={stages ?? []} counts={counts} />;
}
