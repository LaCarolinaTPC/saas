import { getVacancy, updateVacancyStatus } from "@/lib/actions";
import { VACANCY_STATUSES } from "@/lib/constants";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Banknote, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VacancyStatusActions } from "./vacancy-status-actions";

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "No especificado";
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    return `$${n.toLocaleString("es-CO")}`;
  };
  if (min && max) return `${fmt(min)} - ${fmt(max)} COP / mes`;
  if (min) return `Desde ${fmt(min)} COP / mes`;
  return `Hasta ${fmt(max!)} COP / mes`;
}

function formatModality(modality: string | null, contractType: string | null): string {
  const parts: string[] = [];
  if (contractType) {
    const map: Record<string, string> = {
      indefinido: "Tiempo completo",
      fijo: "Término fijo",
      obra_labor: "Obra o labor",
      prestacion_servicios: "Prestación de servicios",
    };
    parts.push(map[contractType] || contractType);
  }
  if (modality) {
    const map: Record<string, string> = {
      presencial: "Presencial",
      remoto: "Remoto",
      hibrido: "Híbrido",
    };
    parts.push(map[modality] || modality);
  }
  return parts.join(" \u00B7 ") || "No especificado";
}

export default async function VacancyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data;
  try {
    data = await getVacancy(id);
  } catch {
    notFound();
  }

  const { vacancy, candidates, candidateCount } = data;
  const statusConfig = VACANCY_STATUSES.find((s) => s.value === vacancy.status);

  return (
    <>
      <TopBar title="Detalle de Vacante" />
      <div className="flex flex-1 flex-col gap-6 p-8">
        <Link href="/vacantes" className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#334155]">
          <ArrowLeft className="h-4 w-4" /> Volver a vacantes
        </Link>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-[#0F172A]">{vacancy.title}</h2>
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: statusConfig?.bg ?? "#F1F5F9",
                    color: statusConfig?.color ?? "#64748B",
                  }}
                >
                  {statusConfig?.label ?? vacancy.status}
                </span>
              </div>
              <p className="mt-1 text-[#64748B]">{vacancy.departments?.name ?? "Sin departamento"}</p>
            </div>
            <VacancyStatusActions vacancyId={id} currentStatus={vacancy.status} />
          </div>

          <div className="mt-6 flex gap-6">
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <MapPin className="h-4 w-4 text-[#94A3B8]" /> {vacancy.location ?? "Sin ubicación"}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <Clock className="h-4 w-4 text-[#94A3B8]" /> {formatModality(vacancy.modality, vacancy.contract_type)}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <Banknote className="h-4 w-4 text-[#94A3B8]" /> {formatSalary(vacancy.salary_min, vacancy.salary_max)}
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#4F46E5]">
              <Users className="h-4 w-4" /> {candidateCount} candidatos
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-8">
            <div className="col-span-2 space-y-6">
              {vacancy.description && (
                <div>
                  <h3 className="mb-3 text-base font-semibold text-[#0F172A]">Descripción</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#64748B]">
                    {vacancy.description}
                  </p>
                </div>
              )}
              {vacancy.requirements && (
                <div>
                  <h3 className="mb-3 text-base font-semibold text-[#0F172A]">Requisitos</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#64748B]">
                    {vacancy.requirements}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-5">
              <h3 className="mb-4 text-sm font-semibold text-[#0F172A]">Candidatos Recientes</h3>
              {candidates.length === 0 ? (
                <p className="text-sm text-[#94A3B8]">No hay candidatos aplicados aún</p>
              ) : (
                <div className="space-y-3">
                  {candidates.map((cv: { id: string; candidates: { full_name: string } | null }) => {
                    const name = cv.candidates?.full_name ?? "Sin nombre";
                    const initials = name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div key={cv.id} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E0E7FF] text-xs font-semibold text-[#4F46E5]">
                          {initials}
                        </div>
                        <span className="text-sm text-[#334155]">{name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
