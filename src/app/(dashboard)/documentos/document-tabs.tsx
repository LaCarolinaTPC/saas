"use client";

import { useState } from "react";
import { Search, File, MoreHorizontal, ExternalLink, Download, Eye, Trash2 } from "lucide-react";

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
}

const TABS = [
  { label: "Todos", slug: null },
  { label: "Contratos", slug: "contrato" },
  { label: "Politicas", slug: "politica" },
  { label: "Vinculacion", slug: "vinculacion" },
  { label: "Nomina", slug: "nomina" },
];

export function DocumentTabs({ rows }: { rows: DocumentRow[] }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = rows.filter((doc) => {
    const matchTab = activeTab === null || doc.categorySlug === activeTab;
    const matchSearch =
      search === "" ||
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      (doc.assignedName?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchTab && matchSearch;
  });

  return (
    <>
      {/* Filter Row */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {TABS.map((tab) => (
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
            placeholder="Buscar documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
        </div>
      </div>

      {/* Table or Empty State */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E2E8F0] bg-white py-16">
          <File className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No se encontraron documentos</p>
          <p className="mt-1 text-xs text-gray-400">Sube un documento o cambia los filtros de busqueda</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F1F5F9]">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nombre del Documento</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Categoria</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Asignado a</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Modificado</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filtered.map((doc) => (
                <tr key={doc.id} className="transition-colors hover:bg-[#F8FAFC]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <File className="h-5 w-5 shrink-0 text-[#4F46E5]" />
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
                        <p className="text-xs text-gray-500">{doc.fileSize}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: doc.categoryBg, color: doc.categoryCo }}
                    >
                      {doc.categoryLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: doc.statusBg, color: doc.statusText }}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: doc.statusDot }} />
                      {doc.statusLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {doc.assignedName ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4F46E5]/10 text-[10px] font-medium text-[#4F46E5]">
                          {doc.assignedInitials}
                        </div>
                        <span className="text-sm text-gray-700">{doc.assignedName}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{doc.updatedAt}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={() => setOpenMenu(openMenu === doc.id ? null : doc.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openMenu === doc.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
                            {doc.filePath && (
                              <>
                                <a
                                  href={doc.filePath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => setOpenMenu(null)}
                                >
                                  <Eye className="h-4 w-4" /> Ver documento
                                </a>
                                <a
                                  href={doc.filePath}
                                  download
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => setOpenMenu(null)}
                                >
                                  <Download className="h-4 w-4" /> Descargar
                                </a>
                                <a
                                  href={doc.filePath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => setOpenMenu(null)}
                                >
                                  <ExternalLink className="h-4 w-4" /> Abrir en nueva pestaña
                                </a>
                                <div className="my-1 border-t border-[#F1F5F9]" />
                              </>
                            )}
                            {!doc.filePath && (
                              <p className="px-4 py-2 text-xs text-gray-400">Sin archivo adjunto</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
