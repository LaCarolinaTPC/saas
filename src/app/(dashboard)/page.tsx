import { Users, Briefcase, UsersRound, CircleCheck } from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/layout/top-bar";
import { StatCard } from "@/components/shared/stat-card";
import { getDashboardStats } from "@/lib/actions";
import { PIPELINE_STAGES } from "@/lib/constants";

function getStageDisplay(stageValue: string) {
  const stage = PIPELINE_STAGES.find((s) => s.value === stageValue);
  if (stage) return { label: stage.label, bg: stage.color, color: stage.textColor };
  // Fallback: format snake_case to label
  const label = stageValue
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { label, bg: "#F1F5F9", color: "#64748B" };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-CO", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="flex flex-1 flex-col gap-6 p-8">
        <div className="grid grid-cols-4 gap-5">
          <StatCard
            label="Total Candidatos"
            value={stats.totalCandidates.toLocaleString()}
            change=""
            icon={Users}
          />
          <StatCard
            label="Vacantes Abiertas"
            value={String(stats.openVacancies)}
            change=""
            icon={Briefcase}
          />
          <StatCard
            label="Empleados"
            value={String(stats.totalEmployees)}
            change=""
            icon={UsersRound}
          />
          <StatCard
            label="Aplicaciones Recientes"
            value={String(stats.recentApplications.length)}
            change=""
            icon={CircleCheck}
          />
        </div>

        <div className="rounded-xl border border-[#F1F5F9] bg-white">
          <div className="flex items-center justify-between px-6 py-5">
            <h2 className="text-base font-semibold text-[#0F172A]">
              Aplicaciones Recientes
            </h2>
            <Link
              href="/candidatos"
              className="cursor-pointer text-[13px] font-medium text-[#4F46E5]"
            >
              Ver Todas
            </Link>
          </div>

          <div className="border-t border-[#F1F5F9]">
            <div className="flex items-center bg-[#F8FAFC] px-4 py-3">
              <span className="w-[220px] text-xs font-semibold tracking-wide text-[#64748B]">
                Candidato
              </span>
              <span className="w-[160px] text-xs font-semibold tracking-wide text-[#64748B]">
                Cargo
              </span>
              <span className="w-[120px] text-xs font-semibold tracking-wide text-[#64748B]">
                Estado
              </span>
              <span className="w-[120px] text-xs font-semibold tracking-wide text-[#64748B]">
                Fecha
              </span>
            </div>

            {stats.recentApplications.length === 0 ? (
              <div className="flex items-center justify-center px-4 py-10">
                <p className="text-sm text-[#94A3B8]">
                  Sin aplicaciones recientes
                </p>
              </div>
            ) : (
              stats.recentApplications.map((app: any) => {
                const stage = getStageDisplay(app.current_stage);
                const candidate = app.candidates;
                const initials = getInitials(candidate?.full_name ?? "??");
                return (
                  <div
                    key={app.id}
                    className="flex items-center border-t border-[#F1F5F9] px-4 py-3.5"
                  >
                    <div className="flex w-[220px] items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E0E7FF]">
                        <span className="text-xs font-semibold text-[#4F46E5]">
                          {initials}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">
                          {candidate?.full_name ?? "Sin nombre"}
                        </p>
                        <p className="text-xs text-[#94A3B8]">
                          {candidate?.email ?? ""}
                        </p>
                      </div>
                    </div>
                    <span className="w-[160px] text-[13px] text-[#334155]">
                      {app.vacancies?.title ?? "Sin vacante"}
                    </span>
                    <div className="w-[120px]">
                      <span
                        className="inline-block rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: stage.bg,
                          color: stage.color,
                        }}
                      >
                        {stage.label}
                      </span>
                    </div>
                    <span className="w-[120px] text-[13px] text-[#64748B]">
                      {app.applied_at ? formatDate(app.applied_at) : ""}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
