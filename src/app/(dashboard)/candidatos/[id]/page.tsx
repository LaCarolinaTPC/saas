import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  CalendarDays,
  MapPin,
  Phone,
  Linkedin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getCandidate } from "@/lib/actions";
import { PIPELINE_STAGES } from "@/lib/constants";
import { CandidateProfileTabs, AdvanceStageButton, HireCandidateButton } from "./tabs-client";

function getStageDisplay(stageValue: string) {
  const stage = PIPELINE_STAGES.find((s) => s.value === stageValue);
  if (stage) return { label: stage.label, bg: stage.color, color: stage.textColor };
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
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeDate(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Hace 1 dia";
  return `Hace ${diffDays} dias`;
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getCandidate(id);
  } catch {
    notFound();
  }

  const { candidate, applications, notes, documents, history } = data;

  if (!candidate) {
    notFound();
  }

  const initials = getInitials(candidate.full_name ?? "??");

  // Get the current stage from the first application
  const currentApplication = applications[0];
  const currentStage = currentApplication
    ? getStageDisplay(currentApplication.current_stage)
    : null;

  const skills: string[] = candidate.skills ?? [];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        {/* Back link */}
        <Link
          href="/candidatos"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al pipeline
        </Link>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {candidate.full_name}
                </h1>
                {currentStage && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: currentStage.bg,
                      color: currentStage.color,
                    }}
                  >
                    {currentStage.label}
                  </span>
                )}
              </div>
              {currentApplication?.vacancies?.title && (
                <p className="mt-1 text-base text-gray-500">
                  {currentApplication.vacancies.title}
                </p>
              )}
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                {candidate.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {candidate.location}
                  </span>
                )}
                {currentApplication?.applied_at && (
                  <span>
                    Aplico {formatRelativeDate(currentApplication.applied_at)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Mail className="h-4 w-4" />
              Mensaje
            </Button>
            <Button variant="outline" size="sm">
              <CalendarDays className="h-4 w-4" />
              Agendar
            </Button>
            {currentApplication && (
              <>
                <AdvanceStageButton
                  candidateVacancyId={currentApplication.id}
                  currentStage={currentApplication.current_stage}
                />
                {currentApplication.current_stage === "aprobado" && (
                  <HireCandidateButton
                    candidateId={candidate.id}
                    vacancyId={currentApplication.vacancy_id}
                    candidateName={candidate.full_name}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Client component for tabs */}
        <CandidateProfileTabs
          candidate={candidate}
          applications={applications}
          notes={notes}
          documents={documents}
          history={history}
        />
      </div>
    </div>
  );
}
