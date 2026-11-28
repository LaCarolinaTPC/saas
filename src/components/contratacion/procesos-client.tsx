"use client";

import { useAvisosProcesos } from "@/hooks/use-avisos-procesos";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ClipboardList, FileSpreadsheet, HeartHandshake, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PROCESO_ESTADOS, CAUSAS_NO_CONTRATO, SIMIT_ESTADOS, ANTECEDENTES_ESTADOS,
  MEDIOS_POSTULACION, LICENCIA_CATEGORIAS, CAMPOS_FECHA, estadoInfo, campoFecha,
  type ProcesoContratacion,
  FILTRO_REINGRESOS,
  FILTRO_ANTECEDENTES,
  FILTRO_APADRINADOS,
  FILTRO_PSICO_INSCRIBIR,
} from "@/lib/contratacion/constants";
import { createProceso, updateProceso, updateProcesoEstado, deleteProceso, exportarProcesos, type ProcesoInput } from "@/lib/contratacion/actions";
import { toast } from "sonner";
import { usePermisos } from "@/components/permisos/permisos-provider";
import { PanelSeleccion } from "@/components/seleccion/panel-seleccion";
import { confirmacionBorrado, pideParaBorrar } from "@/lib/contratacion/borrado";
import { NovedadesDelDia } from "@/components/seleccion/novedades-del-dia";
import { movimientoAlSoltar, type EtapaConPaso } from "@/lib/seleccion/mover-tablero";
import { SemaforoPuntos } from "@/components/seleccion/semaforo";
import { requiereLentes } from "@/lib/seleccion/preseleccion";

interface Filters { q: string; estado: string; medio: string; campo: string; desde: string; hasta: string }

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
  /** Puede registrar referidos del Plan Padrino (sub-función padrino_registro). */
  puedePadrino?: boolean;
  /** Ids de los candidatos en curso que vienen recomendados y todavía no tienen padrino en el Plan Padrino. */
  apadrinadosSinPadrino?: string[];
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

export function ContratacionClient({ rows, total, stats, page, pageSize, filters, canEdit, puedePadrino, apadrinadosSinPadrino, headerActions, vacancies }: Props) {
  const sinPadrino = new Set(apadrinadosSinPadrino ?? []);
  const router = useRouter();
  // La lista se actualiza sola cuando cambia un proceso, una cita o un registro del profesor.
  useAvisosProcesos(useCallback(() => router.refresh(), [router]));
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.q);
  const [editing, setEditing] = useState<ProcesoContratacion | null>(null);
  // Elegido en el selector de la lista: hacia adelante, la ficha con lo que pide esa etapa;
  // «Cierre», la ficha con el estado ya puesto (y el real para no confundirlo al guardar).
  const [destinoLista, setDestinoLista] = useState<EtapaConPaso | null>(null);
  const [estadoReal, setEstadoReal] = useState<string | undefined>(undefined);
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
    if (next.campo && next.campo !== "creacion") params.set("campo", next.campo);
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
  const campo = campoFecha(filters.campo);

  /** Descarga la relación completa (todos los filtros, sin paginar) en Excel. */
  async function exportarExcel() {
    setExportando(true);
    setExportError(null);
    try {
      const res = await exportarProcesos({
        q: filters.q,
        estado: filters.estado,
        medio: filters.medio,
        campo: campo.value,
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
        fmtDate(r.fecha_examenes_fase2 as string),
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
        "Licencia", "Medio", "F. citación", "F. exámenes fase 1",
        "F. exámenes fase 2", "F. prueba manejo",
        "F. contrato", "Observación",
      ];
      const ANCHOS = [11, 28, 12, 13, 22, 10, 18, 24, 14, 13, 14, 9, 13, 11, 13, 13, 13, 11, 40];
      ws.columns = ANCHOS.map((w) => ({ width: w }));

      // Título y subtítulo
      const rango = mesSeleccionado
        ? mesSeleccionado
        : filters.desde || filters.hasta
          ? `${filters.desde || "…"} a ${filters.hasta || "…"}`
          : "";
      const titulo =
        `GESTIVO · Relación de candidatos` +
        (rango ? ` — ${campo.label} ${rango}` : "");
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
          c.alignment = { vertical: "top", wrapText: i === 7 || i === HEADERS.length - 1 };
          if (idx % 2 === 1) {
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          }
          c.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
          if (i === 9) c.numFmt = '"$"#,##0';
        });
      });

      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS.length } };

      const sufijo =
        (campo.value === "citacion" ? "citacion_" : "") +
        (mesSeleccionado ||
          [filters.desde, filters.hasta].filter(Boolean).join("_a_") ||
          "todo");
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
        {/* 27-nov-2026: las revisiones manuales del día (lo que se avisó por correo) y si ya se hicieron. */}
        <NovedadesDelDia />
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
            <option value={FILTRO_REINGRESOS}>Reingresos por revisar</option>
            <option value={FILTRO_ANTECEDENTES}>Antecedentes por revisar</option>
            <option value={FILTRO_APADRINADOS}>Apadrinados sin padrino</option>
            <option value={FILTRO_PSICO_INSCRIBIR}>Psicotécnica: por inscribir</option>
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
          <select
            value={campo.value}
            onChange={(e) => setFilter({ campo: e.target.value })}
            className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm font-medium text-gray-700 outline-none focus:border-[#4F46E5]"
            title="Campo de fecha que segmentan el mes y el rango desde/hasta"
          >
            {CAMPOS_FECHA.map((c) => (
              <option key={c.value} value={c.value}>Segmentar por {c.label.toLowerCase()}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1" title={`Filtra un mes completo de ${campo.label.toLowerCase()} de una sola vez`}>
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
                <th className="px-4 py-3">{campo.corto}</th>
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
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {fmtDate(campo.value === "citacion" ? r.fecha_citacion : r.fecha_creacion)}
                      </td>
                      <td className="px-4 py-3">
                        {r.candidate_id ? (
                          <Link href={`/candidatos/${r.candidate_id}`} className="font-medium text-gray-900 hover:text-[#4F46E5] hover:underline">
                            {r.nombre}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{r.nombre}</span>
                        )}
                        {r.estado === "pendiente" && <SemaforoPuntos resultado={r.preseleccion} className="ml-2 align-middle" />}
                        <span className="block text-xs text-gray-500">
                          CC {r.cedula}
                          {r.celular && <> · {r.celular}</>}
                          {r.origen === "chat_prueba" && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700" title="Guardado desde el chat de prueba: no tiene WhatsApp ni teléfono">
                              Chat de prueba
                            </span>
                          )}
                          {r.origen === "whatsapp_agente" && (
                            <span className="ml-1.5 rounded-full bg-[#EEF2FF] px-1.5 py-px text-[10px] font-medium text-[#4F46E5]" title="Lo creó el asistente de WhatsApp; el celular es el número desde el que escribe">
                              WhatsApp
                            </span>
                          )}
                          {r.reingreso && (
                            <span className="ml-1.5 rounded-full bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-semibold text-[#92400E]">
                              REINGRESO
                            </span>
                          )}
                          {r.recomendado &&
                            (sinPadrino.has(r.id) ? (
                              <Link
                                href={`/candidatos/plan-padrino?registrar=${r.id}`}
                                className="ml-1.5 rounded-full bg-[#FCE7F3] px-1.5 py-0.5 text-[10px] font-semibold text-[#9D174D] hover:underline"
                                title={`Dijo que viene recomendado${r.recomendado_por ? ` por ${r.recomendado_por}` : ""}. Falta asignarle el padrino en el Plan Padrino.`}
                              >
                                APADRINADO · SIN PADRINO
                              </Link>
                            ) : (
                              <span
                                className="ml-1.5 rounded-full bg-[#FCE7F3] px-1.5 py-0.5 text-[10px] font-semibold text-[#9D174D]"
                                title={`Viene recomendado${r.recomendado_por ? ` por ${r.recomendado_por}` : ""}.`}
                              >
                                APADRINADO
                              </span>
                            ))}
                        </span>
                        {r.vacancies?.title && (
                          <span className="mt-0.5 block text-xs font-medium text-[#4F46E5]">
                            {r.vacancies.title}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <EstadoSelect
                            proceso={r}
                            onCierre={() => {
                              setEstadoReal(r.estado);
                              setEditing({ ...r, estado: "cierre", causa_no_contrato: r.causa_no_contrato ?? r.requisito_incumplido ?? null });
                            }}
                            onAvanzar={(d) => {
                              setDestinoLista(d);
                              setEditing(r);
                            }}
                          />
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
                        <span className="text-gray-600">
                          {r.licencia_categoria ?? "—"}
                          {r.licencia_categoria && r.licencia_verificada_runt ? " (RUNT)" : ""}
                        </span>
                        {(r.fecha_citacion || r.fecha_prueba_manejo || r.profesor_concepto) && (
                          <>
                            <br />
                            {r.fecha_citacion && !r.fecha_prueba_manejo && <span className="text-gray-600">Citado: {fmtDate(r.fecha_citacion)}</span>}
                            {r.fecha_prueba_manejo && <span className="text-gray-600">Prueba: {fmtDate(r.fecha_prueba_manejo)}</span>}
                            {r.profesor_concepto && (
                              <span className={r.profesor_concepto === "acepta" ? "text-[#059669]" : "font-medium text-[#DC2626]"}>
                                {" · "}Profesor: {r.profesor_concepto === "acepta" ? "lo acepta" : "no lo acepta"}
                              </span>
                            )}
                          </>
                        )}
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
                          <RowActions proceso={r} onEdit={() => setEditing(r)} puedePadrino={puedePadrino} />
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
          destino={destinoLista}
          estadoAlAbrir={estadoReal}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setDestinoLista(null);
            setEstadoReal(undefined);
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
 * abre el formulario para capturar la causa; hacia adelante abre la ficha con lo
 * que pide esa etapa (24-nov-2026, como el tablero); hacia atrás se guarda al instante.
 */
function EstadoSelect({ proceso, onCierre, onAvanzar }: { proceso: ProcesoContratacion; onCierre: () => void; onAvanzar: (destino: EtapaConPaso) => void }) {
  const [isPending, startTransition] = useTransition();
  const est = estadoInfo(proceso.estado);

  function handleChange(estado: string) {
    const mov = movimientoAlSoltar(proceso.estado, estado);
    if (mov.tipo === "nada") return;
    if (mov.tipo === "cierre") {
      onCierre();
      return;
    }
    if (mov.tipo === "ficha") {
      onAvanzar(mov.destino);
      return;
    }
    startTransition(async () => {
      try {
        const r = await updateProcesoEstado(proceso.id, estado);
        if (!r.ok) toast.error(r.error, { duration: 10_000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
      }
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

// 27-nov-2026: sin «Eliminar» en la lista (un clic bastaba para borrar uno real por error):
// se elimina desde la ficha, escribiendo la cédula del candidato.
function RowActions({ proceso, onEdit, puedePadrino }: { proceso: ProcesoContratacion; onEdit: () => void; puedePadrino?: boolean }) {
  return (
    <div className="inline-flex gap-1">
      {puedePadrino && (
        <Link
          href={`/candidatos/plan-padrino?registrar=${proceso.id}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-[#4F46E5]"
          title="Registrar como referido del Plan Padrino"
        >
          <HeartHandshake className="h-4 w-4" />
        </Link>
      )}
      <button
        onClick={onEdit}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        title="Editar"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Formulario crear / editar ──────────────────────────────────────────────

function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/**
 * Formulario de crear/editar proceso. Se exporta porque también lo abre
 * Comunicaciones para crear al contacto como candidato sin salir del hilo:
 * `inicial` precarga campos (nombre, celular, medio) y `onCreado` recibe el
 * id del proceso nuevo para vincularlo a la conversación.
 */
export function ProcesoFormDialog({
  proceso,
  vacancies,
  onClose,
  inicial,
  onCreado,
  titulo,
  destino,
  estadoAlAbrir,
}: {
  proceso: ProcesoContratacion | null;
  vacancies: VacanteOption[];
  onClose: () => void;
  inicial?: Partial<ProcesoInput>;
  onCreado?: (id: string) => void;
  titulo?: string;
  /** Se abrió al arrastrar la tarjeta hacia adelante en el tablero (24-nov-2026). */
  destino?: EtapaConPaso | null;
  /** El estado real cuando la ficha se abre con otro ya elegido (p. ej. «Cierre» desde la lista). */
  estadoAlAbrir?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Eliminar (27-nov-2026): solo aquí, con la cédula escrita.
  const [borrando, setBorrando] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [form, setForm] = useState<ProcesoInput>(() => ({
    fecha_creacion: proceso?.fecha_creacion ?? todayBogota(),
    nombre: proceso?.nombre ?? inicial?.nombre ?? "",
    cedula: proceso?.cedula ?? inicial?.cedula ?? "",
    vacancy_id: proceso?.vacancy_id ?? "",
    celular: proceso?.celular ?? inicial?.celular ?? "",
    reingreso: proceso?.reingreso ?? false,
    estado: proceso?.estado ?? "pendiente",
    causa_no_contrato: proceso?.causa_no_contrato ?? "",
    observacion: proceso?.observacion ?? inicial?.observacion ?? "",
    simit: proceso?.simit ?? "",
    simit_valor: proceso?.simit_valor ?? 0,
    antecedentes: proceso?.antecedentes ?? "",
    licencia_categoria: proceso?.licencia_categoria ?? "",
    medio_postulacion: proceso?.medio_postulacion ?? inicial?.medio_postulacion ?? "whatsapp",
    fecha_citacion: proceso?.fecha_citacion ?? "",
    fecha_examenes: proceso?.fecha_examenes ?? "",
    fecha_examenes_fase2: proceso?.fecha_examenes_fase2 ?? "",
    fecha_prueba_manejo: proceso?.fecha_prueba_manejo ?? "",
    fecha_contrato: proceso?.fecha_contrato ?? "",
    edad: proceso?.edad ?? null,
    ciudad_residencia: proceso?.ciudad_residencia ?? "",
    dispuesto_traslado: proceso?.dispuesto_traslado ?? null,
    experiencia_meses: proceso?.experiencia_meses ?? null,
    licencia_verificada_runt: proceso?.licencia_verificada_runt ?? false,
    recomendado: proceso?.recomendado ?? null,
    recomendado_por: proceso?.recomendado_por ?? "",
    recomendado_motivo: "",
  }));
  const permisos = usePermisos();
  const puedeEditar = permisos("candidatos.editar");
  // «Viene recomendado» lo responde el candidato; solo un administrador lo corrige (21-nov-2026).
  const puedeCorregirRecomendado = permisos("candidatos.padrino_aprobacion");
  const cambiaRecomendado = puedeCorregirRecomendado && (form.recomendado ?? null) !== (proceso?.recomendado ?? null);

  function set<K extends keyof ProcesoInput>(key: K, value: ProcesoInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lo que mostraba el formulario al abrir: al guardar solo va lo que la persona cambió
  // (una acción del panel pudo cambiar el estado o las fechas mientras tanto).
  const [formAlAbrir] = useState(() => (estadoAlAbrir ? { ...form, estado: estadoAlAbrir } : form));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (proceso) {
          const r = await updateProceso(proceso.id, form, formAlAbrir);
          if (!r.ok) return setError(r.error);
        } else {
          const r = await createProceso(form);
          if (!r.ok) return setError(r.error);
          onCreado?.(r.id);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  const showDeuda = form.simit === "deuda" || form.simit === "acuerdo_pago";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4">
      {/* 24-nov-2026: con un proceso, en pantalla ancha, dos columnas que se desplazan por separado
          (datos a la izquierda, selección a la derecha) y encabezado y botones siempre a la vista. */}
      <form
        onSubmit={handleSubmit}
        className={`flex w-full flex-col rounded-xl bg-white shadow-xl ${proceso ? "max-w-[1400px] lg:h-[calc(100vh-2rem)]" : "max-w-2xl"}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-gray-900">
              {titulo ?? (proceso ? proceso.nombre || "Editar proceso" : "Nuevo proceso de contratación")}
            </h3>
            {proceso && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>CC {proceso.cedula}</span>
                {estadoInfo(proceso.estado) && (
                  <span className="rounded-full px-2 py-0.5 font-medium" style={{ backgroundColor: estadoInfo(proceso.estado)!.bg, color: estadoInfo(proceso.estado)!.color }}>
                    {estadoInfo(proceso.estado)!.label}
                  </span>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={proceso ? "grid min-h-0 flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}>
        <div className={`p-5 ${proceso ? "min-h-0 lg:overflow-y-auto lg:border-r lg:border-[#F1F5F9]" : ""}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <Field label="¿Viene recomendado? (Plan Padrino)">
            <select
              value={form.recomendado == null ? "" : form.recomendado ? "si" : "no"}
              onChange={(e) => set("recomendado", e.target.value === "" ? null : e.target.value === "si")}
              disabled={!puedeCorregirRecomendado}
              title={puedeCorregirRecomendado ? undefined : "Lo responde el candidato en el chat. Solo quien tiene «Plan Padrino · aprobación» puede corregirlo."}
              className={inputCls}
            >
              <option value="">Sin respuesta</option>
              <option value="si">Sí, viene recomendado</option>
              <option value="no">No</option>
            </select>
            {!puedeCorregirRecomendado && (
              <p className="mt-1 text-[11px] text-gray-500">Lo responde el candidato en el chat; lo corrige quien tiene «Plan Padrino · aprobación».</p>
            )}
          </Field>
          {cambiaRecomendado && (
            <Field label="Motivo del cambio (queda en el historial)">
              <input
                type="text"
                value={form.recomendado_motivo ?? ""}
                onChange={(e) => set("recomendado_motivo", e.target.value)}
                placeholder="Por ejemplo: se equivocó en el chat; lo confirmó el padrino"
                maxLength={300}
                required
                className={inputCls}
              />
            </Field>
          )}
          {form.recomendado === true && (
            <Field label="Quién lo recomendó (opcional)">
              <input
                type="text"
                value={form.recomendado_por ?? ""}
                onChange={(e) => set("recomendado_por", e.target.value)}
                disabled={!puedeCorregirRecomendado}
                placeholder="Si se sabe; el padrino se asigna en el Plan Padrino"
                maxLength={120}
                className={inputCls}
              />
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

          <div className="sm:col-span-2 rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Prefiltro</p>
            <div className={`grid grid-cols-2 gap-3 ${proceso ? "xl:grid-cols-4" : "sm:grid-cols-4"}`}>
              <Field label="Edad">
                <input
                  type="number"
                  min={14}
                  max={90}
                  value={form.edad ?? ""}
                  onChange={(e) => set("edad", e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls}
                />
                {proceso?.fecha_nacimiento && (
                  <span className="mt-1 block text-xs text-gray-500">
                    Nació el{" "}
                    {new Date(`${proceso.fecha_nacimiento.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </Field>
              <Field label="Ciudad donde vive">
                <input value={form.ciudad_residencia ?? ""} onChange={(e) => set("ciudad_residencia", e.target.value)} className={inputCls} placeholder="Barranquilla" />
              </Field>
              <Field label="¿Se traslada?">
                <select
                  value={form.dispuesto_traslado == null ? "" : form.dispuesto_traslado ? "si" : "no"}
                  onChange={(e) => set("dispuesto_traslado", e.target.value === "" ? null : e.target.value === "si")}
                  className={inputCls}
                >
                  <option value="">Sin dato</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Experiencia (meses)">
                <input
                  type="number"
                  min={0}
                  max={600}
                  value={form.experiencia_meses ?? ""}
                  onChange={(e) => set("experiencia_meses", e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(proceso?.licencia_runt) || Boolean(form.licencia_verificada_runt)}
                disabled={Boolean(proceso?.licencia_runt)}
                onChange={(e) => set("licencia_verificada_runt", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-[#4F46E5] disabled:opacity-60"
              />
              Licencia verificada en el RUNT
              {proceso?.licencia_runt && (
                <span className="text-xs text-gray-500">
                  (consultada con Croma
                  {proceso.licencia_runt.consultadoEl ? ` el ${new Date(proceso.licencia_runt.consultadoEl).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}` : ""}
                  )
                </span>
              )}
            </label>
            {proceso?.licencia_runt && (proceso.licencia_runt.restricciones?.length ?? 0) > 0 && (
              <p className="mt-2 text-sm text-gray-700">
                <span className="font-medium">Restricciones de la licencia (RUNT):</span> {proceso.licencia_runt.restricciones!.join(" · ")}
              </p>
            )}
            {requiereLentes(proceso?.licencia_runt?.restricciones) && (
              <p className="mt-1 text-sm font-medium text-amber-700">Debe traer los lentes a la prueba de manejo (restricción de la licencia).</p>
            )}
            {proceso?.renovara_licencia != null && (
              <p className="mt-1 text-sm text-gray-700">
                Licencia vencida: {proceso.renovara_licencia ? "dijo que la va a renovar." : "dijo que no la va a renovar."}
              </p>
            )}
          </div>

          {/* Las fechas casi siempre las llena el sistema (citar, exámenes, contratar): plegadas para no alargar la ficha. */}
          <details className="group sm:col-span-2 rounded-lg border border-[#F1F5F9] p-3" open={!proceso}>
            <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-gray-500">
              Fechas del proceso
              {proceso && (
                <span className="ml-2 font-normal normal-case tracking-normal text-gray-400">
                  {[form.fecha_citacion, form.fecha_prueba_manejo, form.fecha_examenes, form.fecha_examenes_fase2, form.fecha_contrato].filter(Boolean).length} de 5 con fecha
                </span>
              )}
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Fecha de citación">
                <input type="date" value={form.fecha_citacion ?? ""} onChange={(e) => set("fecha_citacion", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Fecha prueba de manejo">
                <input type="date" value={form.fecha_prueba_manejo ?? ""} onChange={(e) => set("fecha_prueba_manejo", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Exámenes · fase 1">
                <input type="date" value={form.fecha_examenes ?? ""} onChange={(e) => set("fecha_examenes", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Exámenes · fase 2">
                <input type="date" value={form.fecha_examenes_fase2 ?? ""} onChange={(e) => set("fecha_examenes_fase2", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Fecha de contrato">
                <input type="date" value={form.fecha_contrato ?? ""} onChange={(e) => set("fecha_contrato", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </details>

          <div className="sm:col-span-2">
            <Field label="Observación">
              <textarea
                rows={2}
                value={form.observacion ?? ""}
                onChange={(e) => set("observacion", e.target.value)}
                className={`${inputCls} h-auto py-2`}
                placeholder="Notas del proceso: citaciones, llamadas, resultados..."
              />
            </Field>
          </div>
        </div>

        </div>

        {proceso && (
          <div className="min-h-0 border-t border-[#F1F5F9] p-5 lg:overflow-y-auto lg:border-t-0">
            <PanelSeleccion proceso={proceso} puedeEditar={puedeEditar} onCerrado={onClose} destino={destino} lateral />
          </div>
        )}
        </div>

        {error && <p className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {proceso && puedeEditar && borrando && (
          <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">¿Eliminar el proceso de {proceso.nombre || "este candidato"}?</p>
            <p className="mt-1 text-xs">
              Se borra con su historial, citas, consultas y documentos. No se puede deshacer. Para confirmar, escriba su {pideParaBorrar(proceso).que}
              {pideParaBorrar(proceso).que === "cédula" ? ` (${pideParaBorrar(proceso).valor})` : ""}.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder={pideParaBorrar(proceso).que === "cédula" ? "Cédula" : "Nombre completo"}
                className="h-9 w-56 rounded-lg border border-red-300 bg-white px-3 text-sm outline-none focus:border-red-500"
                autoFocus
              />
              <Button
                type="button"
                disabled={eliminando || !confirmacionBorrado(proceso, confirmacion)}
                onClick={async () => {
                  setEliminando(true);
                  const r = await deleteProceso(proceso.id, confirmacion).catch((e: Error) => ({ ok: false, error: e.message }));
                  setEliminando(false);
                  if (!r.ok) return setError(r.error ?? "No se pudo eliminar.");
                  toast.success(`Proceso de ${proceso.nombre || "el candidato"} eliminado.`);
                  onClose();
                }}
                className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
              >
                {eliminando ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setBorrando(false); setConfirmacion(""); }} disabled={eliminando}>
                No eliminar
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[#F1F5F9] px-5 py-3">
          {proceso && puedeEditar && !borrando && (
            <button type="button" onClick={() => setBorrando(true)} className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" /> Eliminar proceso
            </button>
          )}
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
