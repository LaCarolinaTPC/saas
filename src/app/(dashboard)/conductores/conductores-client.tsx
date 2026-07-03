"use client";

import { useState, useMemo } from "react";
import { Search, Filter, Truck } from "lucide-react";
import Link from "next/link";
import { formatDateBogota } from "@/lib/utils";

interface Conductor {
  id: string;
  cedula: string;
  nombre: string;
  codigo: string | null;
  tipo_conductor: string | null;
  estado: string | null;
  fecha_ingreso: string | null;
  celular: string | null;
  correo: string | null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function estadoStyle(estado: string | null): { bg: string; color: string } {
  const e = (estado ?? "").toUpperCase();
  if (e === "ACTIVO") return { bg: "#DCFCE7", color: "#166534" };
  if (e === "RETIRADO") return { bg: "#FEE2E2", color: "#EF4444" };
  return { bg: "#F1F5F9", color: "#64748B" };
}

export function ConductoresClient({ conductores }: { conductores: Conductor[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const estados = useMemo(
    () =>
      Array.from(
        new Set(conductores.map((c) => c.estado).filter(Boolean))
      ) as string[],
    [conductores]
  );

  const filtered = conductores.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.nombre.toLowerCase().includes(q) ||
      c.cedula.toLowerCase().includes(q) ||
      c.tipo_conductor?.toLowerCase().includes(q) ||
      c.codigo?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "Todos" || c.estado === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Conductores</h1>
            <span className="inline-flex items-center justify-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {conductores.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre, cédula o cargo..."
              className="h-9 w-64 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Filtro estado */}
        <div className="mb-6 flex items-center justify-end">
          <div className="relative inline-flex items-center">
            <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 appearance-none rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-8 text-sm font-medium text-gray-700 outline-none hover:bg-gray-50 focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
            >
              <option value="Todos">Todos los estados</option>
              {estados.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] bg-white py-16">
            <Truck className="h-12 w-12 text-[#CBD5E1]" />
            <h3 className="mt-4 text-base font-semibold text-[#334155]">
              No hay conductores
            </h3>
            <p className="mt-1 text-sm text-[#64748B]">
              {searchQuery || statusFilter !== "Todos"
                ? "No se encontraron conductores con ese criterio"
                : "Sincroniza desde GEMA para ver los conductores"}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Conductor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Documento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Cargo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Ingreso
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {paged.map((c) => {
                  const st = estadoStyle(c.estado);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/10 text-sm font-medium text-[#4F46E5]">
                            {getInitials(c.nombre)}
                          </div>
                          <div>
                            <Link
                              href={`/conductores/${c.cedula}`}
                              className="text-sm font-medium text-gray-900 hover:text-[#4F46E5]"
                            >
                              {c.nombre}
                            </Link>
                            <p className="text-xs text-gray-500">
                              {c.codigo ? `Cód. ${c.codigo}` : c.celular ?? ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {c.cedula}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {c.tipo_conductor ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: st.bg, color: st.color }}
                        >
                          {c.estado ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {c.fecha_ingreso ? formatDateBogota(c.fecha_ingreso) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-[#F1F5F9] px-6 py-3">
              <p className="text-sm text-gray-500">
                {filtered.length === 0
                  ? "0 conductores"
                  : `Mostrando ${(currentPage - 1) * pageSize + 1}–${Math.min(
                      currentPage * pageSize,
                      filtered.length
                    )} de ${filtered.length}`}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
                >
                  {[20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n} / pág.</option>
                  ))}
                </select>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-500">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
