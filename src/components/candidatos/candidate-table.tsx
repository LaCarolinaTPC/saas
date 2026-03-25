"use client";

import { useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateBogota } from "@/lib/utils";
import { PIPELINE_STAGES } from "@/lib/constants";
import { updateCandidateStage, hireCandidate } from "@/lib/actions";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface PipelineRecord {
  id: string;
  candidate_id: string;
  vacancy_id: string;
  current_stage: string;
  applied_at: string;
  candidates: {
    id: string;
    full_name: string;
    email: string;
    [key: string]: any;
  };
  vacancies: {
    title: string;
  };
}

interface CandidateTableProps {
  pipeline: PipelineRecord[];
}

const STAGE_ORDER: string[] = PIPELINE_STAGES.filter((s) => s.value !== "rechazado").map((s) => s.value);

function getNextStage(currentStage: string): string | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[currentIndex + 1];
}

function getStageDisplay(stageValue: string) {
  const stage = PIPELINE_STAGES.find((s) => s.value === stageValue);
  if (stage)
    return { label: stage.label, bg: stage.color, color: stage.textColor };
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

function CandidateRowActions({ record }: { record: PipelineRecord }) {
  const [isPending, startTransition] = useTransition();
  const candidateId = record.candidates?.id ?? record.candidate_id;
  const nextStage = getNextStage(record.current_stage);
  const nextStageDisplay = nextStage ? getStageDisplay(nextStage) : null;

  function handleAdvanceStage() {
    if (!nextStage) return;
    startTransition(async () => {
      try {
        await updateCandidateStage(record.id, nextStage);
      } catch (error) {
        console.error("Error advancing stage:", error);
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await updateCandidateStage(record.id, "rechazado");
      } catch (error) {
        console.error("Error rejecting candidate:", error);
      }
    });
  }

  function handleHire() {
    if (!confirm(`¿Contratar a "${record.candidates?.full_name}"? Se creará como empleado.`)) return;
    startTransition(async () => {
      try {
        await hireCandidate(record.candidate_id, record.vacancy_id);
      } catch (error) {
        console.error("Error hiring candidate:", error);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={isPending}>
            <MoreHorizontal className={`h-4 w-4 text-gray-400 ${isPending ? "animate-pulse" : ""}`} />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link href={`/candidatos/${candidateId}`}>
              Ver Perfil
            </Link>
          }
        />
        {nextStage && record.current_stage !== "rechazado" ? (
          <DropdownMenuItem onSelect={handleAdvanceStage}>
            Avanzar a {nextStageDisplay?.label}
          </DropdownMenuItem>
        ) : null}
        {record.current_stage === "aprobado" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleHire}>
              ✓ Contratar
            </DropdownMenuItem>
          </>
        )}
        {record.current_stage !== "rechazado" && record.current_stage !== "aprobado" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleReject}>
              Rechazar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CandidateTable({ pipeline }: CandidateTableProps) {
  if (pipeline.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-[#F1F5F9] bg-white py-20">
        <p className="text-sm text-gray-400">No hay candidatos registrados</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#F1F5F9] bg-white">
      <Table>
        <TableHeader>
          <TableRow className="border-[#F1F5F9] hover:bg-transparent">
            <TableHead className="text-gray-500 text-xs font-medium uppercase tracking-wider">
              Candidato
            </TableHead>
            <TableHead className="text-gray-500 text-xs font-medium uppercase tracking-wider">
              Vacante
            </TableHead>
            <TableHead className="text-gray-500 text-xs font-medium uppercase tracking-wider">
              Etapa
            </TableHead>
            <TableHead className="text-gray-500 text-xs font-medium uppercase tracking-wider">
              Fecha
            </TableHead>
            <TableHead className="text-gray-500 text-xs font-medium uppercase tracking-wider text-right">
              Acciones
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pipeline.map((record) => {
            const candidate = record.candidates;
            const stage = getStageDisplay(record.current_stage);
            const initials = getInitials(candidate?.full_name ?? "??");
            const candidateId = candidate?.id ?? record.candidate_id;

            return (
              <TableRow
                key={record.id}
                className="border-[#F1F5F9] hover:bg-gray-50/50"
              >
                <TableCell>
                  <Link
                    href={`/candidatos/${candidateId}`}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-medium text-white">
                      {initials}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {candidate?.full_name ?? "Sin nombre"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {candidate?.email ?? ""}
                      </div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {record.vacancies?.title ?? "Sin vacante"}
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: stage.bg,
                      color: stage.color,
                    }}
                  >
                    {stage.label}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {record.applied_at ? formatDateBogota(record.applied_at) : ""}
                </TableCell>
                <TableCell className="text-right">
                  <CandidateRowActions record={record} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
