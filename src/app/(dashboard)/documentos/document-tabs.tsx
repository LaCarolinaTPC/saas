"use client";

import { useState, useTransition } from "react";
import {
  Search,
  File,
  MoreHorizontal,
  Eye,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  FileCheck,
  ShieldCheck,
  User,
  Users,
  Briefcase,
  ChevronDown,
  ChevronUp,
  FileText,
  Trash2,
} from "lucide-react";
import { updateDocumentStatus, deleteDocument } from "@/lib/actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DocumentRow {
  id: string;
  name: string;
  filePath: string | null;
  fileSize: string;
  mimeType: string | null;
  categoryLabel: string;
  categoryBg: string;
  categoryCo: string;
  statusLabel: string;
  statusBg: string;
  statusDot: string;
  statusText: string;
  assignedName: string | null;
  assignedInitials: string;
  updatedAt: string;
  categorySlug: string;
  candidateName: string | null;
  employeeName: string | null;
}

const CATEGORY_TABS = [
  { label: "Todos", slug: null },
  { label: "Contratos", slug: "contrato" },
  { label: "Politicas", slug: "politica" },
  { label: "Vinculacion", slug: "vinculacion" },
  { label: "Nomina", slug: "nomina" },
];

type PersonFilter = "todos" | "candidatos" | "empleados" | "sin_asignar";

const PERSON_FILTERS: { label: string; value: PersonFilter; icon: typeof Users }[] = [
  { label: "Todos", value: "todos", icon: Users },
  { label: "Candidatos", value: "candidatos", icon: User },
  { label: "Empleados", value: "empleados", icon: Briefcase },
  { label: "Sin asignar", value: "sin_asignar", icon: FileText },
];

function getPersonInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

interface PersonGroup {
  key: string;
  name: string;
  type: "candidato" | "empleado";
  docs: DocumentRow[];
}

export function DocumentTabs({ rows }: { rows: DocumentRow[] }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<PersonFilter>("todos");
  const [search, setSearch] = useState("");
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

  // Filter documents
  const filtered = rows.filter((doc) => {
    const matchTab = activeTab === null || doc.categorySlug === activeTab;
    const searchLower = search.toLowerCase();
    const matchSearch =
      search === "" ||
      doc.name.toLowerCase().includes(searchLower) ||
      (doc.candidateName?.toLowerCase().includes(searchLower) ?? false) ||
      (doc.employeeName?.toLowerCase().includes(searchLower) ?? false);
    const personName = doc.candidateName ?? doc.employeeName ?? null;
    const matchPerson =
      personFilter === "todos" ||
      (personFilter === "candidatos" && doc.candidateName !== null) ||
      (personFilter === "empleados" && doc.employeeName !== null) ||
      (personFilter === "sin_asignar" && personName === null);
    return matchTab && matchSearch && matchPerson;
  });

  // Group by person
  const groupMap = new Map<string, PersonGroup>();
  const unassigned: DocumentRow[] = [];

  for (const doc of filtered) {
    const personName = doc.candidateName ?? doc.employeeName ?? null;
    const personType = doc.candidateName ? "candidato" : "empleado";

    if (!personName) {
      unassigned.push(doc);
      continue;
    }

    const key = `${personType}:${personName}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, name: personName, type: personType as "candidato" | "empleado", docs: [] });
    }
    groupMap.get(key)!.docs.push(doc);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  function togglePerson(key: string) {
    setExpandedPerson((prev) => (prev === key ? null : key));
  }

  return (
    <>
      {/* Filter Row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab.slug)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.slug
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar documento o persona..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-72 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
        </div>
      </div>

      {/* Person Type Filter */}
      <div className="mb-6 flex items-center gap-2">
        {PERSON_FILTERS.map((pf) => {
          const Icon = pf.icon;
          const count =
            pf.value === "todos"
              ? groups.length + (unassigned.length > 0 ? 1 : 0)
              : pf.value === "candidatos"
                ? groups.filter((g) => g.type === "candidato").length
                : pf.value === "empleados"
                  ? groups.filter((g) => g.type === "empleado").length
                  : unassigned.length > 0
                    ? 1
                    : 0;
          return (
            <button
              key={pf.value}
              onClick={() => setPersonFilter(pf.value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                personFilter === pf.value
                  ? "bg-[#4F46E5] text-white"
                  : "bg-white border border-[#E2E8F0] text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {pf.label}
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  personFilter === pf.value
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Person Cards Grid */}
      {groups.length === 0 && unassigned.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] bg-white py-16">
          <File className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No se encontraron documentos</p>
          <p className="mt-1 text-xs text-gray-400">Sube un documento o cambia los filtros</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isExpanded = expandedPerson === group.key;
            const initials = getPersonInitials(group.name);
            const categories = [...new Set(group.docs.map((d) => d.categoryLabel))];

            return (
              <div key={group.key} className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
                {/* Person Header Card */}
                <button
                  onClick={() => togglePerson(group.key)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#F8FAFC]"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      group.type === "candidato"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{group.name}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          group.type === "candidato"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {group.type === "candidato" ? "Candidato" : "Empleado"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {group.docs.length} documento{group.docs.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-gray-400">
                        {categories.join(" · ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Mini status summary */}
                    <div className="hidden sm:flex items-center gap-1.5">
                      {(() => {
                        const pending = group.docs.filter((d) => d.statusLabel === "Pendiente").length;
                        const approved = group.docs.filter((d) => d.statusLabel === "Aprobado").length;
                        if (pending > 0) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                              {pending} pendiente{pending !== 1 ? "s" : ""}
                            </span>
                          );
                        }
                        if (approved === group.docs.length && approved > 0) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                              <CheckCircle className="h-3 w-3" />
                              Todo aprobado
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Document List */}
                {isExpanded && (
                  <div className="border-t border-[#F1F5F9]">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                          <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Documento</th>
                          <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Categoria</th>
                          <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Estado</th>
                          <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Modificado</th>
                          <th className="px-6 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {group.docs.map((doc) => (
                          <tr key={doc.id} className="transition-colors hover:bg-[#F8FAFC]">
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2.5">
                                <File className="h-4 w-4 shrink-0 text-[#4F46E5]" />
                                <div>
                                  {doc.filePath ? (
                                    <a
                                      href={doc.filePath}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-medium text-gray-900 hover:text-[#4F46E5] hover:underline"
                                    >
                                      {doc.name}
                                    </a>
                                  ) : (
                                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                                  )}
                                  <p className="text-[11px] text-gray-400">{doc.fileSize}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ backgroundColor: doc.categoryBg, color: doc.categoryCo }}
                              >
                                {doc.categoryLabel}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ backgroundColor: doc.statusBg, color: doc.statusText }}
                              >
                                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: doc.statusDot }} />
                                {doc.statusLabel}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-xs text-gray-500">{doc.updatedAt}</td>
                            <td className="px-6 py-3 text-right">
                              <DocumentActions doc={doc} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned Documents */}
          {unassigned.length > 0 && (personFilter === "todos" || personFilter === "sin_asignar") && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
              <button
                onClick={() => togglePerson("__unassigned__")}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#F8FAFC]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900">Sin asignar</span>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {unassigned.length} documento{unassigned.length !== 1 ? "s" : ""} sin persona asociada
                  </p>
                </div>
                {expandedPerson === "__unassigned__" ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {expandedPerson === "__unassigned__" && (
                <div className="border-t border-[#F1F5F9]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                        <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Documento</th>
                        <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Categoria</th>
                        <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Estado</th>
                        <th className="px-6 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Modificado</th>
                        <th className="px-6 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {unassigned.map((doc) => (
                        <tr key={doc.id} className="transition-colors hover:bg-[#F8FAFC]">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2.5">
                              <File className="h-4 w-4 shrink-0 text-gray-400" />
                              <div>
                                {doc.filePath ? (
                                  <a
                                    href={doc.filePath}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-gray-900 hover:text-[#4F46E5] hover:underline"
                                  >
                                    {doc.name}
                                  </a>
                                ) : (
                                  <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                                )}
                                <p className="text-[11px] text-gray-400">{doc.fileSize}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{ backgroundColor: doc.categoryBg, color: doc.categoryCo }}
                            >
                              {doc.categoryLabel}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{ backgroundColor: doc.statusBg, color: doc.statusText }}
                            >
                              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: doc.statusDot }} />
                              {doc.statusLabel}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-500">{doc.updatedAt}</td>
                          <td className="px-6 py-3 text-right">
                            <DocumentActions doc={doc} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DocumentActions({ doc }: { doc: DocumentRow }) {
  const [isPending, startTransition] = useTransition();

  function handleStatus(status: string) {
    startTransition(async () => {
      await updateDocumentStatus(doc.id, status);
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar "${doc.name}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      await deleteDocument(doc.id);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        }
      />
      <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
        {doc.filePath && (
          <>
            <DropdownMenuItem>
              <a href={doc.filePath} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Ver documento
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <a href={doc.filePath} download className="flex items-center gap-2">
                <Download className="h-4 w-4" /> Descargar
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">Cambiar estado</p>
        <DropdownMenuItem onClick={() => handleStatus("aprobado")} disabled={isPending}>
          <CheckCircle className="h-4 w-4 text-green-600" /> Aprobar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatus("revisado")} disabled={isPending}>
          <FileCheck className="h-4 w-4 text-blue-600" /> Marcar como revisado
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatus("firmado")} disabled={isPending}>
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Marcar como firmado
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatus("pendiente")} disabled={isPending}>
          <Clock className="h-4 w-4 text-yellow-600" /> Dejar pendiente
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => handleStatus("rechazado")} disabled={isPending}>
          <XCircle className="h-4 w-4" /> Rechazar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete} disabled={isPending}>
          <Trash2 className="h-4 w-4" /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
