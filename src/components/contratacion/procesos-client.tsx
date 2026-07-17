"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ClipboardList, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PROCESO_ESTADOS, CAUSAS_NO_CONTRATO, SIMIT_ESTADOS, ANTECEDENTES_ESTADOS,
  MEDIOS_POSTULACION, LICENCIA_CATEGORIAS, estadoInfo, type ProcesoContratacion,
} from "@/lib/contratacion/constants";
import { createProceso, updateProceso, updateProcesoEstado, deleteProceso, exportarProcesos, type ProcesoInput } from "@/lib/contratacion/actions";

interface Filters { q: string; estado: string; medio: string; desde: string; hasta: string }

export interface VacanteOption {
  id: string;
  title: string;
}

export interface ProcesosData {
  vacancies: VacanteOption[];
  rows: ProcesoContratacion[];
  total: number;
  stats: { total: number; contratados: number; cierres: number; enCurso: number };
  page: number;
  pageSize: number;
  filters: Filters;
  canEdit: boolean;
}

interface Props extends ProcesosData {
  /** Contenido extra en el encabezado (p. ej. el conmutador de vistas de Candidatos). */
  headerActions?: React.ReactNode;
}

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** Último día de un mes 'YYYY-MM' como 'YYYY-MM-DD'. */
function finDeMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
}

/** 'YYYY-MM' si desde/hasta cubren exactamente un mes completo, o "". */
function mesDeRango(desde: string, hasta: string): string {
  if (!/-01$/.test(desde)) return "";
  const mes = desde.slice(0, 7);
  return hasta === finDeMes(mes) ? mes : "";
}

export function ContratacionClient({ rows, total, stats, page, pageSize, filters, canEdit, headerActions, vacancies }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.q);
  const [editing, setEditing] = useState<ProcesoContratacion | null>(null);
  const [creating, setCreating] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
  const mesSeleccionado = mesDeRango(filters.desde, filters.hasta);

  /** Descarga la relación completa (todos los filtros, sin paginar) en Excel. */
  async function exportarExcel() {
    setExportando(true);
    setExportError(null);
    try {
      const res = await exportarProcesos({
        q: filters.q,
        estado: filters.estado,
        medio: filters.medio,
        desde: filters.desde,
        hasta: filters.hasta,
      });
      if (res.error) throw new Error(res.error);
      const label = (
        lista: readonly { value: string; label: string }[],
        v: unknown
      ) => lista.find((x) => x.value === v)?.label ?? (v ? String(v) : "");
      const filas = res.rows.map((r) => [
        fmtDate(r.fecha_creacion as string),
        r.nombre ?? "",
        r.cedula ?? "",
        r.celular ?? "",
        (r.vacancies as { title?: string } | null)?.title ?? "",
        r.reingreso ? "Sí" : "No",
        label(PROCESO_ESTADOS, r.estado),
        r.causa_no_contrato ?? "",
        label(SIMIT_ESTADOS, r.simit),
        Number(r.simit_valor ?? 0) || 0,
        label(ANTECEDENTES_ESTADOS, r.antecedentes),
        r.licencia_categoria ?? "",
        label(MEDIOS_POSTULACION, r.medio_postulacion),
        fmtDate(r.fecha_citacion as string),
        fmtDate(r.fecha_examenes as string),
        fmtDate(r.fecha_prueba_manejo as string),
        fmtDate(r.fecha_contrato as string),
        r.observacion ?? "",
      ].map((v) => (v === "—" ? "" : v)));

      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Candidatos", {
        views: [{ state: "frozen", ySplit: 3 }],
      });

      const HEADERS = [
        "Fecha", "Nombre", "Cédula", "Celular", "Vacante", "Reingreso",
        "Estado", "Causa no contrato", "SIMIT", "Valor SIMIT", "Antecedentes",
        "Licencia", "Medio", "F. citación", "F. exámenes", "F. prueba manejo",
        "F. contrato", "Observación",
      ];
      const ANCHOS = [11, 28, 12, 13, 22, 10, 18, 24, 14, 13, 14, 9, 13, 11, 11, 13, 11, 40];
      ws.columns = ANCHOS.map((w) => ({ width: w }));

      // Título y subtítulo
      const titulo =
        `GESTIVO · Relación de candidatos` +
        (mesSeleccionado
          ? ` — ${mesSeleccionado}`
          : filters.desde || filters.hasta
            ? ` — ${filters.desde || "…"} a ${filters.hasta || "…"}`
            : "");
      ws.mergeCells(1, 1, 1, HEADERS.length);
      const celTitulo = ws.getCell(1, 1);
      celTitulo.value = titulo;
      celTitulo.font = { bold: true, size: 14, color: { argb: "FF312E81" } };
      celTitulo.alignment = { vertical: "middle" };
      ws.getRow(1).height = 24;
      ws.mergeCells(2, 1, 2, HEADERS.length);
      const celSub = ws.getCell(2, 1);
      celSub.value = `${filas.length} registros · generado ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`;
      celSub.font = { size: 9, color: { argb: "FF64748B" } };

      // Encabezado
      const filaHeader = ws.getRow(3);
      HEADERS.forEach((h, i) => {
        const c = filaHeader.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
        c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        c.border = { bottom: { style: "thin", color: { argb: "FF312E81" } } };
      });
      filaHeader.height = 20;

      // Datos con filas cebra y bordes suaves
      filas.forEach((fila, idx) => {
        const row = ws.getRow(idx + 4);
        fila.forEach((v, i) => {
          const c = row.getCell(i + 1);
          c.value = v as string | number;
          c.font = { size: 10 };
          c.alignment = { vertical: "top", wrapText: i === 7 || i === 17 };
          if (idx % 2 === 1) {
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          }
          c.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
          if (i === 9) c.numFmt = '"$"#,##0';
        });
      });

      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS.length } };

      const sufijo =
        mesSeleccionado ||
        [filters.desde, filters.hasta].filter(Boolean).join("_a_") ||
        "todo";
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `candidatos_${sufijo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Candidatos</h1>
          <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4F46E5]">{total}</span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {canEdit && (
            <Button onClick={() => setCreating(true)} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
              <Plus className="h-4 w-4" /> Nuevo proceso
            </Button>
          )}
        </div>
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
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1" title="Filtra un mes completo de una sola vez">
            <span className="text-xs font-medium text-gray-500">Mes</span>
            <input
              type="month"
              value={mesSeleccionado}
              onChange={(e) => {
                const mes = e.target.value;
                if (mes) setFilter({ desde: `${mes}-01`, hasta: finDeMes(mes) });
                else setFilter({ desde: "", hasta: "" });
              }}
              className="h-7 rounded border-0 bg-transparent text-sm text-gray-700 outline-none"
            />
          </div>
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
          <button
            type="button"
            onClick={exportarExcel}
            disabled={exportando}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] bg-[#EEF2FF] px-3 text-sm font-medium text-[#4F46E5] hover:bg-[#E0E7FF] disabled:opacity-50"
            title="Descarga en Excel la relación completa con los filtros aplicados"
          >
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Exportar Excel
          </button>
          {exportError && <span className="text-xs text-red-600">{exportError}</span>}
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
                        {r.vacancies?.title && (
                          <span className="mt-0.5 block text-xs font-medium text-[#4F46E5]">
                            {r.vacancies.title}
                          </span>
                        )}
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
          vacancies={vacancies}
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

function ProcesoFormDialog({ proceso, vacancies, onClose }: { proceso: ProcesoContratacion | null; vacancies: VacanteOption[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProcesoInput>(() => ({
    fecha_creacion: proceso?.fecha_creacion ?? todayBogota(),
    nombre: proceso?.nombre ?? "",
    cedula: proceso?.cedula ?? "",
    vacancy_id: proceso?.vacancy_id ?? "",
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

          <Field label="Vacante">
            <select
              value={form.vacancy_id ?? ""}
              onChange={(e) => set("vacancy_id", e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Sin vacante —</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          </Field>
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
              {/* Texto con formato es-CO: el punto es separador de MILES
                  (1.250.000). Un input number lo tomaba como decimal. */}
              <input
                type="text"
                inputMode="numeric"
                value={form.simit_valor ? form.simit_valor.toLocaleString("es-CO") : ""}
                onChange={(e) => {
                  const digitos = e.target.value.replace(/\D/g, "");
                  set("simit_valor", digitos ? Number(digitos) : 0);
                }}
                className={inputCls}
                placeholder="1.250.000"
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
