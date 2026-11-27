"use client";

import { usePermisos } from "@/components/permisos/permisos-provider";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BarChart3, Brain, CalendarClock, ClipboardList, LayoutGrid, List, Users, Trash2, MoreHorizontal, Eye, Briefcase, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanProcesos } from "@/components/candidatos/kanban-procesos";
import { AgendaDia } from "@/components/seleccion/agenda-dia";
import { AgendaExamenes } from "@/components/seleccion/agenda-examenes";
import type { ProcesoContratacion } from "@/lib/contratacion/constants";
import { CandidateTable } from "@/components/candidatos/candidate-table";
import { ContratacionClient, type ProcesosData } from "@/components/contratacion/procesos-client";
import { formatDateBogota } from "@/lib/utils";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { deleteCandidate, assignCandidateToVacancy, getAllCandidates, getCandidatesPipeline } from "@/lib/actions";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type View = "procesos" | "agenda" | "kanban" | "tabla" | "todos";

interface Vacancy {
  id: string;
  title: string;
  departments: { name: string } | { name: string }[] | null;
}

interface CandidatosClientProps {
  vacancies: Vacancy[];
  /** Procesos para el tablero (en curso y cerrados recientes). */
  tablero: ProcesoContratacion[];
  procesos: ProcesosData;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CandidatosClient({ vacancies, tablero, procesos }: CandidatosClientProps) {
  const [view, setView] = useState<View>("procesos");
  const [vacancyFilter, setVacancyFilter] = useState("all");

  const isKanban = view === "kanban";

  // Se cargan al abrir su pestaña (27-nov-2026): antes venían con la página en cada carga.
  const [pipeline, setPipeline] = useState<any[] | null>(null);
  const [allCandidates, setAllCandidates] = useState<any[] | null>(null);
  const cargarPipeline = useCallback(() => {
    void getCandidatesPipeline()
      .then((d) => setPipeline(d ?? []))
      .catch(() => setPipeline([]));
  }, []);
  const cargarTodos = useCallback(() => {
    void getAllCandidates()
      .then((d) => setAllCandidates(d ?? []))
      .catch(() => setAllCandidates([]));
  }, []);
  useEffect(() => {
    if (view === "tabla") cargarPipeline();
    if (view === "todos") cargarTodos();
  }, [view, cargarPipeline, cargarTodos]);

  const filteredPipeline =
    vacancyFilter === "all"
      ? (pipeline ?? [])
      : (pipeline ?? []).filter((r) => r.vacancy_id === vacancyFilter);
  const filteredTablero =
    vacancyFilter === "all" ? tablero : tablero.filter((p) => p.vacancy_id === vacancyFilter);

  const viewSwitcher = (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#F1F5F9] bg-white p-1">
      <Button variant={view === "procesos" ? "default" : "ghost"} size="sm" onClick={() => setView("procesos")} className={view === "procesos" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}>
        <ClipboardList className="h-4 w-4" /> Procesos
      </Button>
      <Button variant={view === "agenda" ? "default" : "ghost"} size="sm" onClick={() => setView("agenda")} className={view === "agenda" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}>
        <CalendarClock className="h-4 w-4" /> Agenda
      </Button>
      <Button variant={view === "todos" ? "default" : "ghost"} size="sm" onClick={() => setView("todos")} className={view === "todos" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}>
        <Users className="h-4 w-4" /> Todos
      </Button>
      <Button variant={view === "kanban" ? "default" : "ghost"} size="sm" onClick={() => setView("kanban")} className={view === "kanban" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}>
        <LayoutGrid className="h-4 w-4" /> Tablero
      </Button>
      <Button variant={view === "tabla" ? "default" : "ghost"} size="sm" onClick={() => setView("tabla")} className={view === "tabla" ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "text-gray-500"}>
        <List className="h-4 w-4" /> Tabla
      </Button>
      {/* Página aparte: lee la base en el servidor y su periodo va en la URL. */}
      <Link
        href="/candidatos/indicadores"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-gray-500 hover:bg-gray-100"
      >
        <BarChart3 className="h-4 w-4" /> Indicadores
      </Link>
      {/* 24-nov-2026: inscribir en PsicoAlianza y subir los resultados. */}
      <Link
        href="/candidatos/psicosensotecnica"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-gray-500 hover:bg-gray-100"
      >
        <Brain className="h-4 w-4" /> Psicosensotécnica
      </Link>
    </div>
  );

  if (view === "procesos") {
    return <ContratacionClient {...procesos} headerActions={viewSwitcher} />;
  }

  if (view === "agenda") {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <h1 className="text-xl font-bold text-gray-900">Agenda de citas</h1>
          {viewSwitcher}
        </div>
        <AgendaExamenes puedeEditar={procesos.canEdit} />
        <AgendaDia puedeEditar={procesos.canEdit} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#F8FAFC] ${isKanban ? "flex flex-col h-screen overflow-hidden" : ""}`}>
      <div className={isKanban ? "px-4 py-3" : "mx-auto max-w-[1400px] px-6 py-6"}>
        <div className={`flex items-center justify-between ${isKanban ? "mb-3" : "mb-6"}`}>
          <div className="flex items-center gap-3">
            <h1 className={`font-bold text-gray-900 ${isKanban ? "text-lg" : "text-xl"}`}>
              {isKanban ? "Tablero de procesos" : "Candidatos"}
            </h1>
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4F46E5]">
              {isKanban ? filteredTablero.length : view === "tabla" ? (pipeline ? filteredPipeline.length : "…") : (allCandidates?.length ?? "…")}
            </span>
          </div>
          <div className="flex items-center gap-2">
          {view !== "todos" && (
            <select
              value={vacancyFilter}
              onChange={(e) => setVacancyFilter(e.target.value)}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
            >
              <option value="all">Todas las vacantes</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          )}
          {viewSwitcher}
          </div>
        </div>
      </div>

      {isKanban ? (
        <div className="flex-1 overflow-hidden px-4">
          <KanbanProcesos
            procesos={filteredTablero}
            vacancies={vacancies.map((v) => ({ id: v.id, title: v.title }))}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-[1400px] px-6">
          {(view === "tabla" ? pipeline : allCandidates) === null ? (
            <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
          ) : view === "tabla" ? (
            <CandidateTable pipeline={filteredPipeline} />
          ) : (
            <AllCandidatesView candidates={allCandidates ?? []} vacancies={vacancies} onCambio={cargarTodos} />
          )}
        </div>
      )}
    </div>
  );
}

function AllCandidatesView({ candidates, vacancies, onCambio }: { candidates: any[]; vacancies: Vacancy[]; onCambio: () => void }) {
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
  const pag = usePaginacion(filtered, { reiniciar: search });
  const ancla = useRef<HTMLDivElement>(null);

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
        <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
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
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {pag.filas.map((c: any) => {
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
                    <td className="px-6 py-4 text-sm text-gray-600">{c.document_number ?? "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {vacancy ?? <span className="text-xs text-gray-400">Sin asignar</span>}
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
                      {formatDateBogota(c.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <CandidateActions id={c.id} name={c.full_name} hasVacancy={!!cv} vacancies={vacancies} onCambio={onCambio} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Paginador p={pag} unidad="candidatos" ancla={ancla} />
        </div>
      )}
    </>
  );
}

function CandidateActions({ id, name, hasVacancy, vacancies, onCambio }: { id: string; name: string | null; hasVacancy: boolean; vacancies: Vacancy[]; onCambio: () => void }) {
  const [isPending, startTransition] = useTransition();
  // Asignar exige `candidatos.editar` y eliminar `candidatos.eliminar` (también en el servidor).
  const puede = usePermisos();
  const edita = puede("candidatos.editar");
  const elimina = puede("candidatos.eliminar");
  const [showAssign, setShowAssign] = useState(false);

  function handleDelete() {
    if (!confirm(`¿Eliminar candidato "${name ?? "Sin nombre"}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      await deleteCandidate(id);
      onCambio();
    });
  }

  function handleAssign(vacancyId: string) {
    startTransition(async () => {
      await assignCandidateToVacancy(id, vacancyId);
      setShowAssign(false);
      onCambio();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        />
        <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
          <DropdownMenuItem>
            <Link href={`/candidatos/${id}`} className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Ver perfil
            </Link>
          </DropdownMenuItem>
          {edita && !hasVacancy && vacancies.length > 0 && (
            <DropdownMenuItem onClick={() => setShowAssign(true)}>
              <Briefcase className="h-4 w-4" /> Asignar a vacante
            </DropdownMenuItem>
          )}
          {elimina && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="h-4 w-4" /> {isPending ? "Eliminando..." : "Eliminar"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Assign to vacancy modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Asignar a Vacante</h3>
              <button onClick={() => setShowAssign(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Selecciona la vacante para <strong>{name ?? "este candidato"}</strong>:
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {vacancies.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleAssign(v.id)}
                  disabled={isPending}
                  className="flex w-full items-center justify-between rounded-lg border border-[#E2E8F0] p-3 text-left transition-colors hover:border-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{v.title}</p>
                    <p className="text-xs text-gray-500">{Array.isArray(v.departments) ? v.departments[0]?.name : v.departments?.name ?? ""}</p>
                  </div>
                  <Briefcase className="h-4 w-4 text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
