"use client";

import { usePermisos } from "@/components/permisos/permisos-provider";
/**
 * Procesos disciplinarios: filtros comunes y tres vistas — el registro de
 * procesos, el resumen por conductor (cuántas veces fue a descargos y por
 * qué) y el resumen por motivo. Todo se filtra aquí: son pocos cientos.
 */

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BarChart3, Check, ChevronDown, ChevronRight, ClipboardList, Pencil, Plus, Search, SlidersHorizontal, Trash2, Users, X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { descargarCsv } from "@/lib/exportar/csv";
import type { OpcionConductor } from "@/lib/disciplinarios/data";
import {
  AREAS_PROCESO,
  FILTROS_EXTRA,
  FILTROS_VACIOS,
  MEDIDAS_PROCESO,
  MOTIVOS_PROCESO,
  NORMAS_INCUMPLIDAS,
  ORIGENES_PROCESO,
  PARAMS_FILTRO,
  TIPOS_PROCESO,
  anioDeRango,
  estaAbierto,
  etiquetaArea,
  etiquetaMedida,
  etiquetaMotivo,
  etiquetaNorma,
  etiquetaOrigen,
  etiquetaResponsable,
  etiquetaTipo,
  filtrarProcesos,
  rangoAnio,
  resumenPorConductor,
  resumenPorMotivo,
  valoresDistintos,
  type FiltrosProceso,
  type Proceso,
  type ResumenConductor,
} from "@/lib/disciplinarios/reglas";
import { anularProceso } from "./actions";
import { ProcesoDialog } from "./proceso-dialog";

const inputCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

const ESTADOS = [
  { key: "abiertos", label: "Abiertos (medida pendiente)" },
  { key: "cerrados", label: "Cerrados" },
] as const;
const DESCARGOS = [
  { key: "asistio", label: "Asistió" },
  { key: "no_asistio", label: "No asistió" },
  { key: "sin_dato", label: "Sin dato" },
] as const;
const SITUACIONES = [
  { key: "activo", label: "Activo en el maestro" },
  { key: "retirado", label: "Retirado" },
] as const;

/** Los filtros aplicados en una línea, para la cabecera de los exportes. */
function textoFiltros(f: FiltrosProceso): string {
  const partes: string[] = [];
  const anio = anioDeRango(f.desde, f.hasta);
  if (anio) partes.push(`Año ${anio}`);
  else if (f.desde || f.hasta) partes.push(`Del ${f.desde || "inicio"} al ${f.hasta || "hoy"}`);
  if (f.tipo) partes.push(etiquetaTipo(f.tipo));
  if (f.motivo) partes.push(`Motivo: ${etiquetaMotivo(f.motivo)}`);
  if (f.norma) partes.push(`Norma: ${etiquetaNorma(f.norma)}`);
  if (f.medida) partes.push(`Medida: ${etiquetaMedida(f.medida)}`);
  if (f.estado) partes.push(ESTADOS.find((e) => e.key === f.estado)?.label ?? f.estado);
  if (f.descargos) partes.push(`Descargos: ${DESCARGOS.find((d) => d.key === f.descargos)?.label ?? f.descargos}`);
  if (f.area) partes.push(`Área: ${etiquetaArea(f.area)}`);
  if (f.cargo) partes.push(`Cargo: ${f.cargo}`);
  if (f.realizadoPor) partes.push(`Realizado por: ${f.realizadoPor}`);
  if (f.origen) partes.push(etiquetaOrigen(f.origen));
  if (f.situacion) partes.push(SITUACIONES.find((s) => s.key === f.situacion)?.label ?? f.situacion);
  if (f.q) partes.push(`Búsqueda: «${f.q}»`);
  return partes.length ? `Filtros: ${partes.join(" · ")}` : "Sin filtros";
}

function ChipTipo({ tipo }: { tipo: Proceso["tipo"] }) {
  const descargos = tipo === "citacion_descargos";
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${descargos ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#E0E7FF] text-[#3730A3]"}`}>
      {etiquetaTipo(tipo)}
    </span>
  );
}

function TextoAsistencia({ p }: { p: Proceso }) {
  if (p.tipo !== "citacion_descargos") return <span className="text-gray-400">—</span>;
  if (p.asistio === true) return <span className="font-medium text-[#166534]">Asistió{p.fechaDescargos ? ` · ${p.fechaDescargos}` : ""}</span>;
  if (p.asistio === false) return <span className="font-semibold text-[#991B1B]">No asistió{p.fechaDescargos ? ` · ${p.fechaDescargos}` : ""}</span>;
  return <span className="text-gray-500">{p.fechaDescargos ? `Citado para ${p.fechaDescargos}` : "Sin fecha de descargos"}</span>;
}

function ChipMedida({ p }: { p: Proceso }) {
  const color =
    p.medida === "pendiente"
      ? "bg-[#F1F5F9] text-gray-700"
      : p.medida === "terminacion"
        ? "bg-[#FEE2E2] text-[#991B1B]"
        : p.medida === "suspension"
          ? "bg-[#FFEDD5] text-[#9A3412]"
          : p.medida === "sin_medida"
            ? "bg-[#DCFCE7] text-[#166534]"
            : p.medida === "no_registrada"
              ? "bg-[#F8FAFC] text-gray-500"
              : "bg-[#E0F2FE] text-[#075985]";
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{etiquetaMedida(p.medida, p.diasSuspension)}</span>;
}

export function DisciplinariosClient({
  tabInicial,
  filtrosIniciales,
  procesos,
  conductores,
  hoy,
}: {
  tabInicial: string;
  /** Filtros de la URL (desde la ficha de un conductor llega su cédula en `q`). */
  filtrosIniciales: FiltrosProceso;
  procesos: Proceso[];
  conductores: OpcionConductor[];
  hoy: string;
}) {
  const [tab, setTab] = useState(tabInicial);
  const [f, setF] = useState<FiltrosProceso>(filtrosIniciales);
  const set = (k: keyof FiltrosProceso) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const extrasActivos = FILTROS_EXTRA.filter((k) => f[k]).length;
  // «Más filtros» abierto de entrada si la URL ya trae alguno.
  const [masFiltros, setMasFiltros] = useState(extrasActivos > 0);
  // null = cerrado; "nuevo" o el proceso a editar.
  const [dialogo, setDialogo] = useState<Proceso | "nuevo" | null>(null);
  // Registrar, editar y anular, cada uno con su permiso (también en el servidor).
  const puede = usePermisos();
  const crea = puede("disciplinarios.crear");
  const edita = puede("disciplinarios.editar");

  // Situación en el maestro, para el filtro activo / retirado.
  const situacion = useMemo(
    () => ({
      activos: new Set(conductores.filter((c) => !c.retirado).map((c) => c.cedula)),
      retirados: new Set(conductores.filter((c) => c.retirado).map((c) => c.cedula)),
    }),
    [conductores]
  );
  const filtrados = useMemo(() => filtrarProcesos(procesos, f, situacion), [procesos, f, situacion]);
  const porConductor = useMemo(() => resumenPorConductor(filtrados), [filtrados]);
  const porMotivo = useMemo(() => resumenPorMotivo(filtrados), [filtrados]);
  const abiertos = filtrados.filter(estaAbierto).length;
  const citaciones = filtrados.filter((p) => p.tipo === "citacion_descargos").length;
  const hayFiltro = (Object.keys(FILTROS_VACIOS) as (keyof FiltrosProceso)[]).some((k) => f[k]);
  const filtrosTxt = textoFiltros(f);

  // Opciones que salen de los datos: años con procesos, cargos y quién los hizo.
  const anios = useMemo(() => {
    const s = new Set(procesos.map((p) => p.fechaHecho.slice(0, 4)));
    s.add(hoy.slice(0, 4));
    return [...s].sort().reverse();
  }, [procesos, hoy]);
  const cargos = useMemo(() => valoresDistintos(procesos, "cargo"), [procesos]);
  const realizadoPor = useMemo(() => valoresDistintos(procesos, "realizadoPor"), [procesos]);
  const anio = anioDeRango(f.desde, f.hasta);

  // Los filtros viajan en la URL: un enlace o recargar conserva la vista.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const k of Object.keys(PARAMS_FILTRO) as (keyof FiltrosProceso)[]) {
      if (f[k]) url.searchParams.set(PARAMS_FILTRO[k], f[k]);
      else url.searchParams.delete(PARAMS_FILTRO[k]);
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [f]);

  const cambiarTab = (v: string) => {
    setTab(v);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", v);
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  const select = (k: keyof FiltrosProceso, opciones: readonly { key: string; label: string }[], todos = "Todos") => (
    <select className={inputCls} value={f[k]} onChange={(e) => set(k)(e.target.value)}>
      <option value="">{todos}</option>
      {opciones.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const campo = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {el}
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        {campo(
          "Año",
          <select
            className={inputCls}
            value={anio || (f.desde || f.hasta ? "rango" : "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== "rango") setF((x) => ({ ...x, ...rangoAnio(v) }));
            }}
          >
            <option value="">Todos</option>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {!anio && (f.desde || f.hasta) && <option value="rango">Rango</option>}
          </select>
        )}
        {campo("Desde", <input type="date" className={inputCls} value={f.desde} max={hoy} onChange={(e) => set("desde")(e.target.value)} />)}
        {campo("Hasta", <input type="date" className={inputCls} value={f.hasta} onChange={(e) => set("hasta")(e.target.value)} />)}
        {campo("Tipo", select("tipo", TIPOS_PROCESO))}
        {campo("Motivo", select("motivo", MOTIVOS_PROCESO))}
        {campo(
          "Buscar",
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputCls} w-64 pl-8`}
              value={f.q}
              placeholder="Nombre, cédula, código, N.º o texto"
              title="También busca en la descripción de los hechos, los descargos y el detalle de la medida"
              onChange={(e) => set("q")(e.target.value)}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setMasFiltros((v) => !v)}
          aria-expanded={masFiltros}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${
            masFiltros || extrasActivos ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]" : "border-[#E2E8F0] text-gray-600 hover:bg-gray-50"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" /> Más filtros
          {extrasActivos > 0 && <span className="rounded-full bg-[#4F46E5] px-1.5 text-xs font-semibold text-white">{extrasActivos}</span>}
        </button>
        {hayFiltro && (
          <button type="button" onClick={() => setF(FILTROS_VACIOS)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
            <X className="h-4 w-4" /> Limpiar
          </button>
        )}
        {crea && (
          <button
            type="button"
            onClick={() => setDialogo("nuevo")}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
          >
            <Plus className="h-4 w-4" /> Nuevo proceso
          </button>
        )}
      </div>

      {masFiltros && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
          {campo("Norma incumplida", select("norma", NORMAS_INCUMPLIDAS, "Todas"))}
          {campo("Medida / sanción", select("medida", MEDIDAS_PROCESO, "Todas"))}
          {campo("Estado", select("estado", ESTADOS))}
          {campo("Descargos", select("descargos", DESCARGOS))}
          {campo("Área", select("area", AREAS_PROCESO, "Todas"))}
          {campo("Cargo", select("cargo", cargos.map((c) => ({ key: c, label: c }))))}
          {campo("Realizado por", select("realizadoPor", realizadoPor.map((r) => ({ key: r, label: r }))))}
          {campo("Origen", select("origen", ORIGENES_PROCESO))}
          {campo("Situación del trabajador", select("situacion", SITUACIONES))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-gray-700">{filtrados.length} procesos</span>
        <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[#92400E]">{citaciones} citaciones a descargos</span>
        <span className="rounded-full bg-[#E0E7FF] px-2.5 py-1 text-[#3730A3]">{filtrados.length - citaciones} llamados de atención</span>
        <span className={`rounded-full px-2.5 py-1 ${abiertos ? "bg-[#FFEDD5] text-[#9A3412]" : "bg-[#F1F5F9] text-gray-500"}`}>{abiertos} con medida pendiente</span>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-gray-700">{porConductor.length} trabajadores</span>
      </div>

      <Tabs value={tab} onValueChange={(v) => cambiarTab(String(v))}>
        <TabsList className="mb-4 h-10">
          <TabsTrigger value="registro" className="px-4">
            <ClipboardList /> Registro
          </TabsTrigger>
          <TabsTrigger value="conductores" className="px-4">
            <Users /> Por conductor
          </TabsTrigger>
          <TabsTrigger value="motivos" className="px-4">
            <BarChart3 /> Por motivo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="registro">
          <Registro procesos={filtrados} filtrosTxt={filtrosTxt} onEditar={edita ? setDialogo : null} />
        </TabsContent>
        <TabsContent value="conductores">
          <PorConductor filas={porConductor} procesos={filtrados} filtrosTxt={filtrosTxt} onEditar={edita ? setDialogo : null} />
        </TabsContent>
        <TabsContent value="motivos">
          <PorMotivo filas={porMotivo} total={filtrados.length} />
        </TabsContent>
      </Tabs>

      {dialogo && (
        <ProcesoDialog
          proceso={dialogo === "nuevo" ? null : dialogo}
          conductores={conductores}
          hoy={hoy}
          sugerencias={{ cargos, realizadoPor }}
          onClose={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

// ── Registro ─────────────────────────────────────────────────────────────────

function filaExport(p: Proceso) {
  return [
    p.consecutivo,
    p.fechaHecho,
    p.codigo ?? "",
    p.nombre,
    p.cedula,
    etiquetaTipo(p.tipo),
    etiquetaMotivo(p.motivo, p.motivoDetalle),
    p.normaIncumplida ? etiquetaNorma(p.normaIncumplida) : "",
    p.cargo ?? "",
    p.area ? etiquetaArea(p.area) : "",
    p.descripcion ?? "",
    p.fechaCitacion ?? "",
    p.fechaDescargos ?? "",
    p.tipo === "citacion_descargos" ? (p.asistio === true ? "Sí" : p.asistio === false ? "No" : "Sin dato") : "",
    p.resumenDescargos ?? "",
    etiquetaMedida(p.medida, p.diasSuspension),
    p.fechaMedida ?? "",
    p.medidaDetalle ?? "",
    p.realizadoPor ?? "",
    p.responsable ? etiquetaResponsable(p.responsable) : "",
    etiquetaOrigen(p.origen),
    p.createdByEmail ?? "",
  ];
}
const CABECERA_EXPORT = [
  "N.º", "Fecha hechos", "Código", "Trabajador", "Cédula", "Tipo", "Motivo", "Norma incumplida", "Cargo", "Área", "Hechos",
  "Fecha citación", "Fecha descargos", "Asistió", "Resumen descargos", "Medida", "Fecha medida", "Detalle medida",
  "Realizado por", "Responsable", "Origen", "Registró",
];

function Registro({ procesos, filtrosTxt, onEditar }: {
  procesos: Proceso[];
  /** Filtros aplicados, para la primera fila del Excel. */
  filtrosTxt: string;
  onEditar: ((p: Proceso) => void) | null;
}) {
  const anula = usePermisos()("disciplinarios.anular");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const p = usePaginacion(procesos, { reiniciar: procesos.length });
  const ancla = useRef<HTMLDivElement>(null);

  function anular(id: string) {
    start(async () => {
      const res = await anularProceso(id, motivo);
      if (!res.success) {
        toast.error(res.error ?? "No se pudo anular.");
        return;
      }
      toast.success("Proceso anulado; queda como rastro.");
      setAnulando(null);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <BotonesExportar
          formatos={["xlsx", "csv"]}
          sinDatos={procesos.length === 0}
          onExportar={async (formato) => {
            const filas = procesos.map(filaExport);
            if (formato === "csv") return descargarCsv("procesos_disciplinarios.csv", [CABECERA_EXPORT, ...filas]);
            const XLSX = await import("xlsx");
            const libro = XLSX.utils.book_new();
            const hoja = XLSX.utils.aoa_to_sheet([[filtrosTxt], CABECERA_EXPORT, ...filas]);
            hoja["!cols"] = [6, 11, 8, 32, 13, 20, 30, 28, 20, 13, 40, 12, 12, 8, 40, 26, 12, 30, 20, 24, 16, 26].map((w) => ({ wch: w }));
            XLSX.utils.book_append_sheet(libro, hoja, "Procesos");
            XLSX.writeFile(libro, "procesos_disciplinarios.xlsx");
          }}
        />
      </div>
      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">N.º</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Trabajador</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Descargos</th>
                <th className="px-3 py-2">Medida</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {p.filas.map((x) => (
                <tr key={x.id} className="border-b border-[#F1F5F9] align-top">
                  <td className="px-3 py-2 font-medium text-gray-500">{x.consecutivo}</td>
                  <td className="whitespace-nowrap px-3 py-2">{x.fechaHecho}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">
                      {x.codigo ? `${x.codigo} · ` : ""}
                      {x.nombre}
                    </p>
                    <p className="text-xs text-gray-500">
                      CC {x.cedula}
                      {x.cargo ? ` · ${x.cargo}` : ""}
                    </p>
                    {x.origen === "historico" && (
                      <span className="mt-0.5 inline-block rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[11px] font-semibold text-gray-600" title="Cargado del Excel de RRHH">
                        Histórico
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ChipTipo tipo={x.tipo} />
                  </td>
                  <td className="px-3 py-2">
                    <p>{etiquetaMotivo(x.motivo, x.motivoDetalle)}</p>
                    {x.normaIncumplida && <p className="text-xs text-gray-500">{etiquetaNorma(x.normaIncumplida)}</p>}
                    {x.descripcion && <p className="line-clamp-2 max-w-xs text-xs text-gray-500" title={x.descripcion}>{x.descripcion}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <TextoAsistencia p={x} />
                  </td>
                  <td className="px-3 py-2">
                    <ChipMedida p={x} />
                    {x.fechaMedida && <p className="mt-0.5 text-xs text-gray-500">{x.fechaMedida}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {anulando === x.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          className={`${inputCls} h-8 w-48 text-xs`}
                          placeholder="Motivo de la anulación"
                          value={motivo}
                          maxLength={300}
                          onChange={(e) => setMotivo(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && anular(x.id)}
                        />
                        <button type="button" disabled={pending} onClick={() => anular(x.id)} title="Anular" className="rounded p-1.5 text-red-600 hover:bg-red-50">
                          <Check className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => { setAnulando(null); setMotivo(""); }} title="Cancelar" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                          <X className="h-4 w-4" />
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-1">
                        {onEditar && (
                          <button type="button" onClick={() => onEditar(x)} title="Editar" className="rounded p-1.5 text-[#4F46E5] hover:bg-[#EEF2FF]">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {anula && (
                          <button type="button" onClick={() => setAnulando(x.id)} title="Anular" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {procesos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay procesos con estos filtros. Use «Nuevo proceso» para registrar el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador p={p} unidad="procesos" ancla={ancla} />
      </div>
    </div>
  );
}

// ── Por conductor ────────────────────────────────────────────────────────────

function PorConductor({ filas, procesos, filtrosTxt, onEditar }: {
  filas: ResumenConductor[];
  procesos: Proceso[];
  filtrosTxt: string;
  onEditar: ((p: Proceso) => void) | null;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const p = usePaginacion(filas, { reiniciar: filas.length });
  const ancla = useRef<HTMLDivElement>(null);
  const alternar = (c: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const cabecera = ["Código", "Trabajador", "Cédula", "Procesos", "Llamados", "Citaciones", "Asistió", "No asistió", "Suspensiones", "Días suspensión", "Terminaciones", "Pendientes", "Motivos", "Último"];
  const exportar = (r: ResumenConductor) => [
    r.codigo ?? "", r.nombre, r.cedula, r.total, r.llamados, r.citaciones, r.asistencias, r.inasistencias, r.suspensiones, r.diasSuspension,
    r.terminaciones, r.abiertos, r.motivos.map((m) => `${m.etiqueta} (${m.cantidad})`).join("; "), r.ultimaFecha,
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <BotonesExportar
          formatos={["xlsx", "csv"]}
          sinDatos={filas.length === 0}
          onExportar={async (formato) => {
            if (formato === "csv") return descargarCsv("procesos_por_conductor.csv", [cabecera, ...filas.map(exportar)]);
            const XLSX = await import("xlsx");
            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[filtrosTxt], cabecera, ...filas.map(exportar)]), "Por conductor");
            XLSX.writeFile(libro, "procesos_por_conductor.xlsx");
          }}
        />
      </div>
      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Trabajador</th>
                <th className="px-3 py-2 text-right">Procesos</th>
                <th className="px-3 py-2 text-right">Llamados</th>
                <th className="px-3 py-2 text-right">Citaciones</th>
                <th className="px-3 py-2">Asistencia a descargos</th>
                <th className="px-3 py-2">Medidas</th>
                <th className="px-3 py-2">Motivos</th>
                <th className="px-3 py-2">Último</th>
              </tr>
            </thead>
            <tbody>
              {p.filas.map((r) => {
                const abierto = abiertos.has(r.cedula);
                return (
                  <Fragment key={r.cedula}>
                    <tr className="border-b border-[#F1F5F9] align-top">
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => alternar(r.cedula)} aria-expanded={abierto} title={abierto ? "Ocultar procesos" : "Ver procesos"} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">
                          {r.codigo ? `${r.codigo} · ` : ""}
                          {r.nombre}
                        </p>
                        <p className="text-xs text-gray-500">CC {r.cedula}</p>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                      <td className="px-3 py-2 text-right">{r.llamados}</td>
                      <td className={`px-3 py-2 text-right ${r.citaciones ? "font-semibold text-[#92400E]" : ""}`}>{r.citaciones}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.citaciones ? (
                          <span>
                            <span className="font-medium text-[#166534]">Asistió {r.asistencias}</span>
                            {r.inasistencias > 0 && <span className="font-semibold text-[#991B1B]"> · No asistió {r.inasistencias}</span>}
                            {r.citaciones - r.asistencias - r.inasistencias > 0 && (
                              <span className="text-gray-500"> · Sin dato {r.citaciones - r.asistencias - r.inasistencias}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {[
                          r.suspensiones ? `${r.suspensiones} suspensión${r.suspensiones === 1 ? "" : "es"} (${r.diasSuspension} d)` : "",
                          r.terminaciones ? "Terminación" : "",
                          r.abiertos ? `${r.abiertos} pendiente${r.abiertos === 1 ? "" : "s"}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {r.motivos.map((m) => (
                            <span key={m.motivo} className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs text-gray-700">
                              {m.etiqueta} <b>×{m.cantidad}</b>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{r.ultimaFecha}</td>
                    </tr>
                    {abierto && (
                      <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                        <td />
                        <td colSpan={8} className="px-3 py-2">
                          <table className="w-full text-xs">
                            <tbody>
                              {procesos
                                .filter((x) => x.cedula === r.cedula)
                                .map((x) => (
                                  <tr key={x.id} className="border-t border-[#E2E8F0] first:border-t-0">
                                    <td className="py-1.5 pr-3 text-gray-500">N.º {x.consecutivo}</td>
                                    <td className="py-1.5 pr-3 font-medium">{x.fechaHecho}</td>
                                    <td className="py-1.5 pr-3">
                                      <ChipTipo tipo={x.tipo} />
                                    </td>
                                    <td className="py-1.5 pr-3">{etiquetaMotivo(x.motivo, x.motivoDetalle)}</td>
                                    <td className="py-1.5 pr-3">
                                      <TextoAsistencia p={x} />
                                    </td>
                                    <td className="py-1.5 pr-3">
                                      <ChipMedida p={x} />
                                    </td>
                                    <td className="py-1.5 text-right">
                                      {onEditar && (
                                        <button type="button" onClick={() => onEditar(x)} title="Editar" className="rounded p-1 text-[#4F46E5] hover:bg-[#EEF2FF]">
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay procesos con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador p={p} unidad="trabajadores" ancla={ancla} />
      </div>
    </div>
  );
}

// ── Por motivo ───────────────────────────────────────────────────────────────

function PorMotivo({ filas, total }: { filas: ReturnType<typeof resumenPorMotivo>; total: number }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2">Motivo</th>
            <th className="w-2/5 px-3 py-2">Procesos</th>
            <th className="px-3 py-2 text-right">Llamados</th>
            <th className="px-3 py-2 text-right">Citaciones</th>
            <th className="px-3 py-2 text-right">Trabajadores</th>
            <th className="px-3 py-2 text-right">% del total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.motivo} className="border-b border-[#F1F5F9]">
              <td className="px-3 py-2 font-medium text-gray-900">{f.etiqueta}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                    <div className="flex h-full" style={{ width: `${(f.total / max) * 100}%` }}>
                      <div className="h-full bg-[#F59E0B]" style={{ width: `${(f.citaciones / f.total) * 100}%` }} title="Citaciones a descargos" />
                      <div className="h-full bg-[#6366F1]" style={{ width: `${(f.llamados / f.total) * 100}%` }} title="Llamados de atención" />
                    </div>
                  </div>
                  <span className="w-8 text-right font-semibold">{f.total}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right">{f.llamados}</td>
              <td className="px-3 py-2 text-right">{f.citaciones}</td>
              <td className="px-3 py-2 text-right">{f.conductores}</td>
              <td className="px-3 py-2 text-right text-gray-600">{total ? Math.round((f.total / total) * 100) : 0}%</td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                No hay procesos con estos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {filas.length > 0 && (
        <p className="flex gap-4 border-t border-[#F1F5F9] px-3 py-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" /> Citaciones a descargos
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#6366F1]" /> Llamados de atención
          </span>
        </p>
      )}
    </div>
  );
}
