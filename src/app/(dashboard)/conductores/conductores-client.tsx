"use client";

import { useState, useMemo, useRef } from "react";
import { Search, Filter, Truck, NotebookPen } from "lucide-react";
import Link from "next/link";
import { formatDateBogota } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { CAUSAS_RETIRO, retiroVigente, type RetiroRegistrado } from "@/lib/conductores/retiro";
import { ChipCausa, ModalCausaRetiro, type ConductorRetirado } from "./causa-retiro";

interface Conductor {
  id: string;
  cedula: string;
  nombre: string;
  codigo: string | null;
  tipo_conductor: string | null;
  estado: string | null;
  fecha_ingreso: string | null;
  fecha_retiro: string | null;
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

const esRetirado = (c: Conductor) => (c.estado ?? "").toUpperCase() === "RETIRADO";

export function ConductoresClient({
  conductores, retiros: retirosIniciales, retirosDisponible, puedeEditar,
}: {
  conductores: Conductor[];
  /** Causas de retiro registradas, por cédula. */
  retiros: Record<string, RetiroRegistrado[]>;
  retirosDisponible: boolean;
  puedeEditar: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  // "" = todas; "SIN" = retirados sin causa; si no, la clave de la causa.
  const [causaFilter, setCausaFilter] = useState("");
  const [retiros, setRetiros] = useState(retirosIniciales);
  const [editando, setEditando] = useState<ConductorRetirado | null>(null);
  const causaDe = (c: Conductor) => (esRetirado(c) ? retiroVigente(retiros[c.cedula] ?? [], c.fecha_retiro) : null);
  const retirados = conductores.filter(esRetirado);
  const sinCausa = retirados.filter((c) => !causaDe(c)).length;

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
    let matchesCausa = true;
    if (causaFilter) {
      const r = causaDe(c);
      matchesCausa = esRetirado(c) && (causaFilter === "SIN" ? !r : r?.causa === causaFilter);
    }
    return matchesSearch && matchesStatus && matchesCausa;
  });

  const pag = usePaginacion(filtered, { reiniciar: `${searchQuery}|${statusFilter}|${causaFilter}` });
  const ancla = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <PageHeader
        titulo="Conductores"
        junto={
          <span className="inline-flex items-center justify-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
            {conductores.length}
          </span>
        }
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, cédula o cargo..."
            className="h-9 w-64 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
        </div>
      </PageHeader>

      <div className="px-6 py-6">
        {/* Filtros: estado y causa de retiro */}
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
          {retirosDisponible && retirados.length > 0 && (
            <button
              type="button"
              onClick={() => { setStatusFilter("Todos"); setCausaFilter(sinCausa ? "SIN" : ""); }}
              className="mr-auto text-sm text-gray-600 hover:text-[#4F46E5]"
              title="Ver los retirados sin causa registrada"
            >
              <NotebookPen className="mr-1 inline h-4 w-4 text-gray-400" />
              {sinCausa === 0
                ? `Los ${retirados.length.toLocaleString("es-CO")} retirados tienen causa registrada`
                : `${sinCausa.toLocaleString("es-CO")} de ${retirados.length.toLocaleString("es-CO")} retirados sin causa de retiro`}
            </button>
          )}
          {retirosDisponible && (
            <select
              value={causaFilter}
              onChange={(e) => setCausaFilter(e.target.value)}
              aria-label="Causa de retiro"
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 outline-none hover:bg-gray-50 focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
            >
              <option value="">Todas las causas de retiro</option>
              <option value="SIN">Retirados sin causa registrada</option>
              {CAUSAS_RETIRO.map((c) => (
                <option key={c.clave} value={c.clave}>{c.label}</option>
              ))}
            </select>
          )}
          <div className="relative inline-flex items-center">
            <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
          <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
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
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Retiro
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {pag.filas.map((c) => {
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
                      <td className="max-w-[280px] px-6 py-4">
                        {esRetirado(c) ? (
                          <RetiroCelda
                            fecha={c.fecha_retiro}
                            retiro={causaDe(c)}
                            disponible={retirosDisponible}
                            puedeEditar={puedeEditar}
                            onEditar={() => setEditando({ cedula: c.cedula, nombre: c.nombre, fechaRetiro: c.fecha_retiro })}
                          />
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Paginador p={pag} unidad="conductores" ancla={ancla} />
          </div>
        )}
        {editando && (
          <ModalCausaRetiro
            conductor={editando}
            actual={retiroVigente(retiros[editando.cedula] ?? [], editando.fechaRetiro)}
            onCerrar={() => setEditando(null)}
            onGuardado={(r) =>
              setRetiros((prev) => ({
                ...prev,
                [r.cedula]: [...(prev[r.cedula] ?? []).filter((x) => x.fechaRetiro !== r.fechaRetiro), r],
              }))
            }
          />
        )}
      </div>
    </div>
  );
}

/** Celda de retiro: fecha, causa, inicio de la nota y el botón para registrarla o editarla. */
function RetiroCelda({
  fecha, retiro, disponible, puedeEditar, onEditar,
}: {
  fecha: string | null;
  retiro: RetiroRegistrado | null;
  disponible: boolean;
  puedeEditar: boolean;
  onEditar: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">{fecha ? formatDateBogota(fecha) : "Sin fecha en GEMA"}</p>
      {disponible && <ChipCausa causa={retiro?.causa ?? null} />}
      {retiro?.nota && (
        <p className="line-clamp-2 text-xs text-gray-600" title={retiro.nota}>{retiro.nota}</p>
      )}
      {disponible && puedeEditar && (
        <button type="button" onClick={onEditar} className="block text-xs font-medium text-[#4F46E5] hover:underline">
          {retiro ? "Editar causa" : "Registrar causa"}
        </button>
      )}
    </div>
  );
}
