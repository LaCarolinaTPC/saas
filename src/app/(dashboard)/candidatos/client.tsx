"use client";

import { useState } from "react";
import { LayoutGrid, List, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/candidatos/kanban-board";
import { CandidateTable } from "@/components/candidatos/candidate-table";
import Link from "next/link";

type View = "kanban" | "tabla" | "todos";

interface CandidatosClientProps {
  pipeline: any[];
  allCandidates: any[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CandidatosClient({ pipeline, allCandidates }: CandidatosClientProps) {
  const [view, setView] = useState<View>("todos");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {/* TopBar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Candidatos</h1>
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4F46E5]">
              {allCandidates.length}
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#F1F5F9] bg-white p-1">
            <Button
              variant={view === "todos" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("todos")}
              className={view === "todos" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}
            >
              <Users className="h-4 w-4" />
              Todos
            </Button>
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("kanban")}
              className={view === "kanban" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}
            >
              <LayoutGrid className="h-4 w-4" />
              Pipeline
            </Button>
            <Button
              variant={view === "tabla" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("tabla")}
              className={view === "tabla" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}
            >
              <List className="h-4 w-4" />
              Tabla
            </Button>
          </div>
        </div>

        {/* Content */}
        {view === "kanban" ? (
          <KanbanBoard pipeline={pipeline} />
        ) : view === "tabla" ? (
          <CandidateTable pipeline={pipeline} />
        ) : (
          <AllCandidatesView candidates={allCandidates} />
        )}
      </div>
    </div>
  );
}

function AllCandidatesView({ candidates }: { candidates: any[] }) {
  const [search, setSearch] = useState("");

  const filtered = candidates.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.document_number?.includes(q)
    );
  });

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre, email, teléfono o cédula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full max-w-md rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E2E8F0] bg-white py-16">
          <Users className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No hay candidatos</p>
          <p className="mt-1 text-xs text-gray-400">Los candidatos aparecerán aquí cuando se registren via webhook o manualmente</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F1F5F9]">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Candidato</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contacto</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Documento</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Vacante</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Etapa</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Fuente</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filtered.map((c: any) => {
                const cv = c.candidate_vacancy?.[0];
                const vacancy = cv?.vacancies?.title;
                const stage = cv?.current_stage;

                return (
                  <tr key={c.id} className="transition-colors hover:bg-[#F8FAFC]">
                    <td className="px-6 py-4">
                      <Link href={`/candidatos/${c.id}`} className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E0E7FF] text-xs font-semibold text-[#4F46E5]">
                          {getInitials(c.full_name ?? "?")}
                        </div>
                        <span className="text-sm font-medium text-gray-900 hover:text-[#4F46E5]">
                          {c.full_name ?? "Sin nombre"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">{c.phone ?? "—"}</div>
                      <div className="text-xs text-gray-400">{c.email ?? ""}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {c.document_number ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {vacancy ?? (
                        <span className="text-xs text-gray-400">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {stage ? (
                        <span className="inline-flex items-center rounded-full bg-[#DBEAFE] px-2.5 py-0.5 text-xs font-medium text-[#2563EB]">
                          {stage.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {c.source ?? "manual"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(c.created_at).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
