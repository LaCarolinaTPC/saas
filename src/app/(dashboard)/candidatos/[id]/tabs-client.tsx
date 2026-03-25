"use client";

import { useState, useTransition } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Linkedin,
  GraduationCap,
  MessageSquare,
  Clock,
  ArrowRight,
  FileText,
  ExternalLink,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PIPELINE_STAGES } from "@/lib/constants";
import { addNote, updateCandidateStage } from "@/lib/actions";

function getStageDisplay(stageValue: string) {
  const stage = PIPELINE_STAGES.find((s) => s.value === stageValue);
  if (stage) return { label: stage.label, bg: stage.color, color: stage.textColor };
  const label = stageValue
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { label, bg: "#F1F5F9", color: "#64748B" };
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const tabs = ["Perfil", "Documentos", "Notas", "Linea de Tiempo"] as const;

interface CandidateProfileTabsProps {
  candidate: any;
  applications: any[];
  notes: any[];
  documents: any[];
  history: any[];
}

export function CandidateProfileTabs({
  candidate,
  applications,
  notes,
  documents,
  history,
}: CandidateProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<string>("Perfil");

  const skills: string[] = candidate.skills ?? [];

  return (
    <>
      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#F1F5F9]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "text-[#4F46E5]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4F46E5]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content - Perfil */}
      {activeTab === "Perfil" && (
        <div className="flex gap-6">
          {/* Left column */}
          <div className="w-[320px] shrink-0 space-y-5">
            {/* Informacion Personal */}
            <div className="rounded-lg border border-[#F1F5F9] bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">
                Informacion Personal
              </h2>
              <div className="space-y-3.5">
                {candidate.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-gray-600">{candidate.email}</span>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-gray-600">{candidate.phone}</span>
                  </div>
                )}
                {candidate.location && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-gray-600">{candidate.location}</span>
                  </div>
                )}
                {candidate.linkedin_url && (
                  <div className="flex items-center gap-3 text-sm">
                    <Linkedin className="h-4 w-4 shrink-0 text-gray-400" />
                    <a
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {candidate.linkedin_url}
                    </a>
                  </div>
                )}
                {!candidate.email &&
                  !candidate.phone &&
                  !candidate.location &&
                  !candidate.linkedin_url && (
                    <p className="text-sm text-gray-400">
                      Sin informacion personal registrada
                    </p>
                  )}
              </div>
            </div>

            {/* Habilidades */}
            <div className="rounded-lg border border-[#F1F5F9] bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">
                Habilidades
              </h2>
              {skills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill: string) => (
                    <span
                      key={skill}
                      className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Sin habilidades registradas
                </p>
              )}
            </div>

            {/* Aplicaciones */}
            {applications.length > 0 && (
              <div className="rounded-lg border border-[#F1F5F9] bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">
                  Aplicaciones
                </h2>
                <div className="space-y-3">
                  {applications.map((app: any) => {
                    const stage = getStageDisplay(app.current_stage);
                    return (
                      <div key={app.id} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {app.vacancies?.title ?? "Sin vacante"}
                        </span>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: stage.bg, color: stage.color }}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Experiencia */}
            <div className="rounded-lg border border-[#F1F5F9] bg-white p-5">
              <h2 className="mb-5 text-sm font-semibold text-gray-900">
                Experiencia
              </h2>
              <p className="text-sm text-gray-400">
                Sin informacion de experiencia registrada
              </p>
            </div>

            {/* Educacion */}
            <div className="rounded-lg border border-[#F1F5F9] bg-white p-5">
              <h2 className="mb-5 text-sm font-semibold text-gray-900">
                Educacion
              </h2>
              <p className="text-sm text-gray-400">
                Sin informacion de educacion registrada
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab content - Documentos */}
      {activeTab === "Documentos" && (
        <div>
          {documents.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-[#F1F5F9] bg-white py-16">
              <div className="text-center">
                <FileText className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">Sin documentos registrados</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg border border-[#F1F5F9] bg-white p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-[#4F46E5]" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {doc.mime_type && <span className="text-xs text-gray-400">{doc.mime_type}</span>}
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-yellow-50 text-yellow-700">
                          {doc.status ?? "pendiente"}
                        </span>
                        {doc.document_categories?.name && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#EEF2FF] text-[#4F46E5]">
                            {doc.document_categories.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {doc.file_path && (
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.file_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Ver
                      </a>
                      <a
                        href={doc.file_path}
                        download
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Download className="h-3.5 w-3.5" /> Descargar
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab content - Notas */}
      {activeTab === "Notas" && (
        <div className="space-y-5">
          <AddNoteForm candidateId={candidate.id} />

          {notes.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-[#F1F5F9] bg-white py-16">
              <div className="text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">
                  No hay notas registradas
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note: any) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-[#F1F5F9] bg-white p-5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {note.profiles?.full_name ?? "Usuario"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {note.created_at ? formatDateTime(note.created_at) : ""}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab content - Linea de Tiempo */}
      {activeTab === "Linea de Tiempo" && (
        <div>
          {history.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-[#F1F5F9] bg-white py-16">
              <div className="text-center">
                <Clock className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">
                  Sin historial de etapas
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-[#F1F5F9] bg-white p-5">
              <h2 className="mb-5 text-sm font-semibold text-gray-900">
                Historial de Etapas
              </h2>
              <div className="space-y-0">
                {history.map((entry: any, i: number) => {
                  const fromStage = entry.from_stage
                    ? getStageDisplay(entry.from_stage)
                    : null;
                  const toStage = getStageDisplay(entry.to_stage);

                  return (
                    <div
                      key={entry.id}
                      className="relative flex gap-4 pb-6 last:pb-0"
                    >
                      {/* Timeline dot + line */}
                      <div className="flex flex-col items-center">
                        <div
                          className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                            i === 0
                              ? "border-indigo-600 bg-indigo-600"
                              : "border-gray-300 bg-gray-300"
                          }`}
                        />
                        {i < history.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="-mt-1">
                        <div className="flex items-center gap-2">
                          {fromStage && (
                            <>
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{
                                  backgroundColor: fromStage.bg,
                                  color: fromStage.color,
                                }}
                              >
                                {fromStage.label}
                              </span>
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                            </>
                          )}
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: toStage.bg,
                              color: toStage.color,
                            }}
                          >
                            {toStage.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {entry.profiles?.full_name
                            ? `Por ${entry.profiles.full_name} - `
                            : ""}
                          {entry.created_at
                            ? formatDateTime(entry.created_at)
                            : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const STAGE_ORDER = PIPELINE_STAGES.filter((s) => s.value !== "rechazado").map((s) => s.value);

function getNextStage(currentStage: string): string | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[currentIndex + 1];
}

function getNextStageLabel(stage: string): string {
  const found = PIPELINE_STAGES.find((s) => s.value === stage);
  return found?.label ?? stage;
}

export function AdvanceStageButton({
  candidateVacancyId,
  currentStage,
}: {
  candidateVacancyId: string;
  currentStage: string;
}) {
  const [isPending, startTransition] = useTransition();
  const nextStage = getNextStage(currentStage);

  if (!nextStage || currentStage === "rechazado") {
    return (
      <Button size="sm" disabled className="bg-gray-300 text-gray-500">
        <ArrowRight className="h-4 w-4" />
        {currentStage === "rechazado" ? "Rechazado" : "Etapa final"}
      </Button>
    );
  }

  function handleAdvance() {
    startTransition(async () => {
      try {
        await updateCandidateStage(candidateVacancyId, nextStage!);
      } catch (error) {
        console.error("Error advancing stage:", error);
      }
    });
  }

  return (
    <Button
      size="sm"
      className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
      onClick={handleAdvance}
      disabled={isPending}
    >
      <ArrowRight className="h-4 w-4" />
      {isPending ? "Avanzando..." : `Avanzar a ${getNextStageLabel(nextStage)}`}
    </Button>
  );
}

function AddNoteForm({ candidateId }: { candidateId: string }) {
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    startTransition(async () => {
      await addNote("candidate", candidateId, content.trim());
      setContent("");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[#F1F5F9] bg-white p-5"
    >
      <h2 className="mb-3 text-sm font-semibold text-gray-900">
        Agregar Nota
      </h2>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe una nota sobre este candidato..."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        rows={3}
      />
      <div className="mt-3 flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !content.trim()}
          className="bg-[#4F46E5] text-white hover:bg-[#4338CA]"
        >
          {isPending ? "Guardando..." : "Guardar Nota"}
        </Button>
      </div>
    </form>
  );
}
