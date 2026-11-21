"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateBogota } from "@/lib/utils";
import { etapaDePostulacion } from "@/lib/contratacion/constants";
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
    document_number?: string | null;
    email?: string | null;
    [key: string]: unknown;
  };
  vacancies: {
    title: string;
  };
}

interface CandidateTableProps {
  pipeline: PipelineRecord[];
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

/**
 * La etapa no se cambia desde aquí: es el estado del proceso de contratación y
 * se mueve en la ficha del proceso (así la postulación y el proceso no se separan).
 */
export function CandidateTable({ pipeline }: CandidateTableProps) {
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {pag.filas.map((record) => {
            const candidate = record.candidates;
            const stage = etapaDePostulacion(record.current_stage);
            const initials = getInitials(candidate?.full_name ?? "??");
            const candidateId = candidate?.id ?? record.candidate_id;
            const detalle = candidate?.document_number ? `C.C. ${candidate.document_number}` : candidate?.email ?? "";

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
                      <div className="text-xs text-gray-500">{detalle}</div>
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Paginador p={pag} unidad="candidatos" ancla={ancla} />
    </div>
  );
}
