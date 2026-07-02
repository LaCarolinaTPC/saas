"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PROCESO_ESTADOS, CAUSAS_NO_CONTRATO, SIMIT_ESTADOS, ANTECEDENTES_ESTADOS,
  MEDIOS_POSTULACION, LICENCIA_CATEGORIAS, estadoInfo, type ProcesoContratacion,
} from "@/lib/contratacion/constants";
import { createProceso, updateProceso, updateProcesoEstado, deleteProceso, type ProcesoInput } from "./actions";

interface Filters { q: string; estado: string; medio: string; desde: string; hasta: string }

interface Props {
  rows: ProcesoContratacion[];
  total: number;
  stats: { total: number; contratados: number; cierres: number; enCurso: number };
  page: number;
  pageSize: number;
  filters: Filters;
  canEdit: boolean;
}

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export function ContratacionClient({ rows, total, stats, page, pageSize, filters, canEdit }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.q);
  const [editing, setEditing] = useState<ProcesoContratacion | null>(null);
  const [creating, setCreating] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setFilter(patch: Partial<Filters & { page: string }>) {
    const params = new URLSearchParams();
    const next = { ...filters, page: "1", ...patch };
    if (next.q) params.set("q", next.q);
    if (next.estado !== "todos") params.set("estado", next.estado);
    if (next.medio !== "todos") params.set("medio", next.medio);
    if (next.desde) params.set("desde", next.desde);
    if (next.hasta) params.set("hasta", next.hasta);
    if (next.page !== "1") params.set("page", next.page);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setFilter({ q: value }), 400);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Procesos de contratación</h1>
          <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4F46E5]">{total}</span>
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
            <Plus className="h-4 w-4" /> Nuevo proceso
          </Button>
        )}
      </div>

      <div className="px-6 py-6">
        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Postulaciones" value={stats.total} />
          <Stat label="En curso" value={stats.enCurso} color="#D97706" />
          <Stat label="Contratados" value={stats.contratados} color="#059669" />
          <Stat label="Cierre de proceso" value={stats.cierres} color="#EF4444" />
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nombre, cédula o celular..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-full max-w-xs rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
          <select
            value={filters.estado}
            onChange={(e) => setFilter({ estado: e.target.value })}
            className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
          >
            <option value="todos">Todos los estados</option>
            {PROCESO_ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <select
            value={filters.medio}
            onChange={(e) => setFilter({ medio: e.target.value })}
            className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
          >
            <option value="todos">Todos los medios</option>
            {MEDIOS_POSTULACION.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1">
            <span className="text-xs font-medium text-gray-500">Desde</span>
            <input
              type="date"
              value={filters.desde}
              onChange={(e) => setFilter({ desde: e.target.value })}
              className="h-7 rounded border-0 bg-transparent text-sm text-gray-700 outline-none"
            />
            <span className="text-xs font-medium text-gray-500">Hasta</span>
            <input
              type="date"
              value={filters.hasta}
              onChange={(e) => setFilter({ hasta: e.target.value })}
              className="h-7 rounded border-0 bg-transparent text-sm text-gray-700 outline-none"
            />
            {(filters.desde || filters.hasta) && (
              <button
                type="button"
                onClick={() => setFilter({ desde: "", hasta: "" })}
                className="ml-1 text-gray-400 hover:text-gray-600"
                title="Limpiar fechas"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Candidato</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Validaciones</th>
                <th className="px-4 py-3">Medio</th>
                <th className="px-4 py-3">F. contrato</th>
                <th className="px-4 py-3">Observación</th>
                {canEdit && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-4 py-12 text-center text-gray-400">
                    <ClipboardList className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    No hay procesos con estos filtros.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const est = estadoInfo(r.estado);
                  const simit = SIMIT_ESTADOS.find((s) => s.value === r.simit);
                  const ant = ANTECEDENTES_ESTADOS.find((a) => a.value === r.antecedentes);
                  const medio = MEDIOS_POSTULACION.find((m) => m.value === r.medio_postulacion);
                  return (
                    <tr key={r.id} className="border-b border-[#F1F5F9] align-top last:border-0 hover:bg-[#F8FAFC]">
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{fmtDate(r.fecha_creacion)}</td>
                      <td className="px-4 py-3">
                        {r.candidate_id ? (
                          <Link href={`/candidatos/${r.candidate_id}`} className="font-medium text-gray-900 hover:text-[#4F46E5] hover:underline">
                            {r.nombre}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{r.nombre}</span>
                        )}
                        <span className="block text-xs text-gray-500">
                          CC {r.cedula}
                          {r.celular && <> · {r.celular}</>}
                          {r.reingreso && (
                            <span className="ml-1.5 rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-semibold text-[#92400E]">
                              REINGRESO
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <EstadoSelect proceso={r} onCierre={() => setEditing({ ...r, estado: "cierre" })} />
                        ) : est ? (
                          <span
                            className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: est.bg, color: est.color }}
                          >
                            {est.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">{r.estado}</span>
                        )}
                        {r.causa_no_contrato && (
                          <span className="mt-1 block max-w-[180px] text-[11px] leading-tight text-gray-500">
                            {r.causa_no_contrato}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs leading-5">
                        <span className="text-gray-400">SIMIT:</span>{" "}
                        {simit ? (
                          <span className={r.simit === "ok" ? "text-[#059669]" : "font-medium text-[#D97706]"}>
                            {r.simit === "ok" ? "OK" : simit.label}
                            {r.simit_valor > 0 && ` (${COP.format(r.simit_valor)})`}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        <br />
                        <span className="text-gray-400">Anteced:</span>{" "}
                        <span className={r.antecedentes === "con_antecedentes" ? "font-medium text-[#D97706]" : "text-gray-600"}>
                          {ant ? (r.antecedentes === "ok" ? "OK" : ant.label) : "—"}
                        </span>
                        {" · "}
                        <span className="text-gray-400">Lic:</span>{" "}
                        <span className="text-gray-600">{r.licencia_categoria ?? "—"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{medio?.label ?? r.medio_postulacion ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{fmtDate(r.fecha_contrato)}</td>
                      <td className="px-4 py-3">
                        {r.observacion ? (
                          <span className="line-clamp-2 max-w-[320px] text-xs text-gray-500" title={r.observacion}>
                            {r.observacion}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <RowActions proceso={r} onEdit={() => setEditing(r)} />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            {total === 0
              ? "Sin registros"
              : `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total.toLocaleString("es-CO")}`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilter({ page: String(page - 1) })}>
                Anterior
              </Button>
              {pageNumbers(page, totalPages).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setFilter({ page: String(p) })}
                    className={`h-8 min-w-8 rounded-lg px-2 text-sm font-medium ${
                      p === page
                        ? "bg-[#4F46E5] text-white"
                        : "border border-[#E2E8F0] bg-white text-gray-600 hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setFilter({ page: String(page + 1) })}>
                Siguiente
              </Button>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <ProcesoFormDialog
          proceso={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Números de página a mostrar: 1 … (p-1) p (p+1) … última. */
function pageNumbers(current: number, total: number): (number | null)[] {
  const wanted = new Set([1, current - 1, current, current + 1, total]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) out.push(null);
    out.push(pages[i]);
  }
  return out;
}

function Stat({ label, value, color = "#0F172A" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-2xl font-bold" style={{ color }}>{value.toLocaleString("es-CO")}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

/**
 * Selector de estado inline con estilo de badge. Pasar a "Cierre de proceso"
 * abre el formulario para capturar la causa; los demás estados se guardan al
 * instante.
 */
function EstadoSelect({ proceso, onCierre }: { proceso: ProcesoContratacion; onCierre: () => void }) {
  const [isPending, startTransition] = useTransition();
  const est = estadoInfo(proceso.estado);

  function handleChange(estado: string) {
    if (estado === proceso.estado) return;
    if (estado === "cierre") {
      onCierre();
      return;
    }
    startTransition(async () => {
      await updateProcesoEstado(proceso.id, estado);
    });
  }

  return (
    <select
      value={proceso.estado}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value)}
      className="cursor-pointer appearance-none rounded-full border-0 py-0.5 pl-2.5 pr-2.5 text-xs font-medium outline-none disabled:opacity-60"
      style={{ backgroundColor: est?.bg ?? "#F1F5F9", color: est?.color ?? "#64748B" }}
      title="Cambiar estado"
    >
      {PROCESO_ESTADOS.map((e) => (
        <option key={e.value} value={e.value}>{e.label}</option>
      ))}
    </select>
  );
}

function RowActions({ proceso, onEdit }: { proceso: ProcesoContratacion; onEdit: () => void }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Eliminar el proceso de "${proceso.nombre}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      await deleteProceso(proceso.id);
    });
  }

  return (
    <div className="inline-flex gap-1">
      <button
        onClick={onEdit}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title="Editar"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        title="Eliminar"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Formulario crear / editar ──────────────────────────────────────────────

function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function ProcesoFormDialog({ proceso, onClose }: { proceso: ProcesoContratacion | null; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProcesoInput>(() => ({
    fecha_creacion: proceso?.fecha_creacion ?? todayBogota(),
    nombre: proceso?.nombre ?? "",
    cedula: proceso?.cedula ?? "",
    celular: proceso?.celular ?? "",
    reingreso: proceso?.reingreso ?? false,
    estado: proceso?.estado ?? "pendiente",
    causa_no_contrato: proceso?.causa_no_contrato ?? "",
    observacion: proceso?.observacion ?? "",
    simit: proceso?.simit ?? "",
    simit_valor: proceso?.simit_valor ?? 0,
    antecedentes: proceso?.antecedentes ?? "",
    licencia_categoria: proceso?.licencia_categoria ?? "",
    medio_postulacion: proceso?.medio_postulacion ?? "whatsapp",
    fecha_citacion: proceso?.fecha_citacion ?? "",
    fecha_examenes: proceso?.fecha_examenes ?? "",
    fecha_prueba_manejo: proceso?.fecha_prueba_manejo ?? "",
    fecha_contrato: proceso?.fecha_contrato ?? "",
  }));

  function set<K extends keyof ProcesoInput>(key: K, value: ProcesoInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (proceso) await updateProceso(proceso.id, form);
        else await createProceso(form);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  const showDeuda = form.simit === "deuda" || form.simit === "acuerdo_pago";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {proceso ? "Editar proceso" : "Nuevo proceso de contratación"}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre completo *">
            <input
              required
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              className={inputCls}
              placeholder="Nombre del candidato"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cédula *">
              <input required value={form.cedula} onChange={(e) => set("cedula", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Celular">
              <input value={form.celular ?? ""} onChange={(e) => set("celular", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Fecha de creación">
            <input
              type="date"
              value={form.fecha_creacion}
              onChange={(e) => set("fecha_creacion", e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Medio de postulación">
            <select
              value={form.medio_postulacion ?? ""}
              onChange={(e) => set("medio_postulacion", e.target.value)}
              className={inputCls}
            >
              {MEDIOS_POSTULACION.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Estado del proceso">
            <select value={form.estado} onChange={(e) => set("estado", e.target.value)} className={inputCls}>
              {PROCESO_ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </Field>
          {form.estado === "cierre" ? (
            <Field label="Causa de no contrato">
              <input
                list="causas-no-contrato"
                value={form.causa_no_contrato ?? ""}
                onChange={(e) => set("causa_no_contrato", e.target.value)}
                className={inputCls}
                placeholder="Selecciona o escribe la causa"
              />
              <datalist id="causas-no-contrato">
                {CAUSAS_NO_CONTRATO.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          ) : (
            <Field label="Reingreso">
              <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.reingreso}
                  onChange={(e) => set("reingreso", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#4F46E5]"
                />
                Es reingreso (trabajó antes en la empresa)
              </label>
            </Field>
          )}

          <Field label="SIMIT">
            <select value={form.simit ?? ""} onChange={(e) => set("simit", e.target.value)} className={inputCls}>
              <option value="">Sin verificar</option>
              {SIMIT_ESTADOS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          {showDeuda ? (
            <Field label="Valor deuda SIMIT (COP)">
              <input
                type="number"
                min={0}
                step="any"
                value={form.simit_valor || ""}
                onChange={(e) => set("simit_valor", parseFloat(e.target.value) || 0)}
                className={inputCls}
                placeholder="0"
              />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}

          <Field label="Antecedentes policía">
            <select
              value={form.antecedentes ?? ""}
              onChange={(e) => set("antecedentes", e.target.value)}
              className={inputCls}
            >
              <option value="">Sin verificar</option>
              {ANTECEDENTES_ESTADOS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Categoría de licencia (RUNT)">
            <input
              list="licencia-categorias"
              value={form.licencia_categoria ?? ""}
              onChange={(e) => set("licencia_categoria", e.target.value)}
              className={inputCls}
              placeholder="C2"
            />
            <datalist id="licencia-categorias">
              {LICENCIA_CATEGORIAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Fecha de citación">
            <input type="date" value={form.fecha_citacion ?? ""} onChange={(e) => set("fecha_citacion", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fecha exámenes médicos">
            <input type="date" value={form.fecha_examenes ?? ""} onChange={(e) => set("fecha_examenes", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fecha prueba de manejo">
            <input type="date" value={form.fecha_prueba_manejo ?? ""} onChange={(e) => set("fecha_prueba_manejo", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fecha de contrato">
            <input type="date" value={form.fecha_contrato ?? ""} onChange={(e) => set("fecha_contrato", e.target.value)} className={inputCls} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Observación">
              <textarea
                rows={3}
                value={form.observacion ?? ""}
                onChange={(e) => set("observacion", e.target.value)}
                className={`${inputCls} h-auto py-2`}
                placeholder="Notas del proceso: citaciones, llamadas, resultados..."
              />
            </Field>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
            {isPending ? "Guardando..." : proceso ? "Guardar cambios" : "Crear proceso"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  );
}
