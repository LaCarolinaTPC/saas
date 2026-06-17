"use client";

import { useState, useTransition } from "react";
import {
  Search,
  Filter,
  MoreHorizontal,
  UsersRound,
  Eye,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { EMPLOYEE_STATUSES } from "@/lib/constants";
import { formatDateBogota } from "@/lib/utils";
import Link from "next/link";
import { deleteEmployee } from "@/lib/actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  document_number: string | null;
  department_id: string | null;
  position: string | null;
  status: string;
  hire_date: string | null;
  departments: { name: string } | null;
}

interface Department {
  id: string;
  name: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function EmpleadosClient({
  employees,
  departments,
}: {
  employees: Employee[];
  departments: Department[];
}) {
  const [activeTab, setActiveTab] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [, startTransition] = useTransition();

  function handleDelete(emp: Employee) {
    if (!confirm(`¿Eliminar al empleado "${emp.full_name}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      await deleteEmployee(emp.id);
    });
  }

  const tabs = ["Todos", ...departments.map((d) => d.name)];

  const filtered = employees.filter((e) => {
    const matchesDept =
      activeTab === "Todos" || e.departments?.name === activeTab;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      e.full_name.toLowerCase().includes(q) ||
      e.document_number?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.position?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "Todos" || e.status === statusFilter;
    return matchesDept && matchesSearch && matchesStatus;
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
            <h1 className="text-xl font-semibold text-gray-900">Empleados</h1>
            <span className="inline-flex items-center justify-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {employees.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
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
      </div>

      <div className="px-6 py-6">
        {/* Filter Row */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
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
              {EMPLOYEE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] bg-white py-16">
            <UsersRound className="h-12 w-12 text-[#CBD5E1]" />
            <h3 className="mt-4 text-base font-semibold text-[#334155]">
              No hay empleados
            </h3>
            <p className="mt-1 text-sm text-[#64748B]">
              {searchQuery
                ? "No se encontraron empleados con ese criterio"
                : activeTab === "Todos"
                  ? "Agrega tu primer empleado para comenzar"
                  : `No hay empleados en ${activeTab}`}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Empleado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Documento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Departamento
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
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {paged.map((emp) => {
                  const statusConfig = EMPLOYEE_STATUSES.find(
                    (s) => s.value === emp.status
                  );
                  return (
                    <tr
                      key={emp.id}
                      className="transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/10 text-sm font-medium text-[#4F46E5]">
                            {getInitials(emp.full_name)}
                          </div>
                          <div>
                            <Link
                              href={`/empleados/${emp.id}`}
                              className="text-sm font-medium text-gray-900 hover:text-[#4F46E5]"
                            >
                              {emp.full_name}
                            </Link>
                            <p className="text-xs text-gray-500">
                              {emp.email ?? "Sin email"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {emp.document_number ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {emp.departments?.name ?? "Sin departamento"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {emp.position ?? "Sin cargo"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: statusConfig?.bg ?? "#F1F5F9",
                            color: statusConfig?.color ?? "#64748B",
                          }}
                        >
                          {statusConfig?.label ?? emp.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {emp.hire_date
                          ? formatDateBogota(emp.hire_date)
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
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
                              <Link href={`/empleados/${emp.id}`} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" /> Ver perfil
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pencil className="h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <RefreshCw className="h-4 w-4" /> Cambiar estado
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => handleDelete(emp)}>
                              <Trash2 className="h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-[#F1F5F9] px-6 py-3">
              <p className="text-sm text-gray-500">
                {filtered.length === 0
                  ? "0 empleados"
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
