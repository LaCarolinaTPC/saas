"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { RechazoDialog } from "./rechazo-dialog";
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
import { Paginador, usePaginacion } from "@/components/shared/paginacion";

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
    [key: string]: unknown;
  };
  vacancies: {
    title: string;
  };
}

interface Stage {
  key: string;
  label: string;
  color: string;
  text_color: string;
  tipo: string;
  orden: number;
}

interface CandidateTableProps {
  pipeline: PipelineRecord[];
  /** Etapas activas del pipeline, en orden. */
  stages: Stage[];
}

/** Siguiente etapa que no sea de rechazo, según el orden configurado del pipeline. */
function getNextStage(stages: Stage[], currentStage: string): Stage | null {
  const avance = stages.filter((s) => s.tipo !== "perdido");
  const i = avance.findIndex((s) => s.key === currentStage);
  if (i === -1 || i >= avance.length - 1) return null;
  return avance[i + 1];
}

function getStageDisplay(stages: Stage[], stageValue: string) {
  const configurada = stages.find((s) => s.key === stageValue);
  if (configurada) return { label: configurada.label, bg: configurada.color, color: configurada.text_color };
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

function CandidateRowActions({ record, stages }: { record: PipelineRecord; stages: Stage[] }) {
  const [isPending, startTransition] = useTransition();
  const [rechazando, setRechazando] = useState(false);
  const candidateId = record.candidates?.id ?? record.candidate_id;
  const nextStage = getNextStage(stages, record.current_stage);
  const rechazado = stages.find((s) => s.tipo === "perdido");
  const estaRechazado = stages.find((s) => s.key === record.current_stage)?.tipo === "perdido";

  function handleAdvanceStage() {
    if (!nextStage) return;
    startTransition(async () => {
      const res = await updateCandidateStage(record.id, nextStage.key);
      if (!res.success) toast.error(res.error);
    });
  }

  async function confirmarRechazo(causa: string, nota: string): Promise<string | null> {
    if (!rechazado) return "No hay una etapa de rechazo configurada en el pipeline.";
    try {
      const res = await updateCandidateStage(record.id, rechazado.key, { causa, nota, origen: "tabla" });
      if (!res.success) return res.error;
    } catch {
      return "No se pudo guardar el rechazo. Intenta de nuevo.";
    }
    setRechazando(false);
    toast.success("Candidato rechazado");
    return null;
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
    <>
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
        {nextStage && !estaRechazado ? (
          <DropdownMenuItem onSelect={handleAdvanceStage}>
            Avanzar a {nextStage.label}
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
        {!estaRechazado && rechazado && record.current_stage !== "aprobado" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setRechazando(true)}>
              Rechazar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {rechazando && rechazado && (
      <RechazoDialog
        nombre={record.candidates?.full_name ?? "Candidato"}
        faseLabel={getStageDisplay(stages, record.current_stage).label}
        destinoLabel={rechazado.label}
        onCancel={() => setRechazando(false)}
        onConfirm={confirmarRechazo}
      />
    )}
    </>
  );
}

export function CandidateTable({ pipeline, stages }: CandidateTableProps) {
  const pag = usePaginacion(pipeline);
  const ancla = useRef<HTMLDivElement>(null);

  if (pipeline.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-[#F1F5F9] bg-white py-20">
        <p className="text-sm text-gray-400">No hay candidatos registrados</p>
      </div>
    );
  }

  return (
    <div ref={ancla} className="rounded-lg border border-[#F1F5F9] bg-white">
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
          {pag.filas.map((record) => {
            const candidate = record.candidates;
            const stage = getStageDisplay(stages, record.current_stage);
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
                  <CandidateRowActions record={record} stages={stages} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Paginador p={pag} unidad="candidatos" ancla={ancla} />
    </div>
  );
}
