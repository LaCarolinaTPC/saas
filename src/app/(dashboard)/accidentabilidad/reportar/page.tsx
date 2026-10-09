import { redirect } from "next/navigation";
import ReportWizard from "@/components/accidentabilidad/ReportWizard";
import AccidenteStatusBadge, { type AccidenteEstado } from "@/components/accidentabilidad/AccidenteStatusBadge";
import { PageHeader } from "@/components/layout/page-header";
import { getCatalogosAccidente } from "@/lib/accidentabilidad/datos";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Módulo aparte (reporte_accidente), como registro_dano en Mantenimiento: el
// auxiliar de ruta reporta desde el sitio sin abrir la consulta, la
// evaluación ni el histórico. Quien tiene Accidentabilidad también entra.
export default async function ReportarAccidentePage() {
  const perms = await getCurrentPermissions();
  const puedeConsultar = perms.isAdmin || canAccess(perms, "accidentabilidad");
  if (!puedeConsultar && !canAccess(perms, "reporte_accidente")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const [catalogos, recientes] = await Promise.all([
    getCatalogosAccidente(),
    // Sin la consulta, el auxiliar ve aquí lo que reportó (solo el estado).
    puedeConsultar || !perms.userId
      ? Promise.resolve([])
      : createAdminClient()
          .from("accidentes")
          .select("id, consecutivo, fecha_accidente, conductor_nombre, direccion_accidente, estado")
          .eq("created_by", perms.userId)
          .order("created_at", { ascending: false })
          .limit(10)
          .then(({ data }) => data ?? []),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Reportar accidente"
        descripcion="Registro de accidente de tránsito de un conductor."
      />
      <div className="px-6 py-8">
        <ReportWizard catalogos={catalogos} puedeConsultar={puedeConsultar} />

        {recientes.length > 0 && (
          <section className="mx-auto mt-4 max-w-2xl rounded-xl border border-[#E2E8F0] bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Tus reportes recientes</h2>
            <ul className="divide-y divide-[#F1F5F9] text-sm">
              {recientes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">#{r.consecutivo} · {r.conductor_nombre}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {new Date(r.fecha_accidente).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                      {r.direccion_accidente ? ` · ${r.direccion_accidente}` : ""}
                    </span>
                  </span>
                  <AccidenteStatusBadge estado={r.estado as AccidenteEstado} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
