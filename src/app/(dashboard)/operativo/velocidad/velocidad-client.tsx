"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, FileSpreadsheet, Loader2, MapPin,
  Search, Send, Settings2, TriangleAlert, Undo2, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import type { FormatoExport } from "@/lib/exportar/formatos";
import {
  NIVEL_VELOCIDAD_COLOR, NIVEL_VELOCIDAD_LABEL, agruparPorConductorSemana, ddmm, duracionMinutos, enlaceMapa,
  horaDe, mesLabel, mesVecino, nivelVelocidad, reglaTexto, resumirSemanas,
  type ConductorSemana, type Incidencia, type ParametrosVelocidad, type ReporteRrhh, type Semana,
} from "@/lib/operativo/velocidad-reglas";
import { exportarInformeVelocidad } from "@/lib/operativo/velocidad-export";
import { actualizarParametrosVelocidad, anularReporteVelocidad, marcarReporteVelocidad } from "./actions";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] disabled:bg-[#F8FAFC] disabled:text-gray-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";
const btnCls = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-50";

export function VelocidadClient({
  hoy, mes, mesActual, semanas, parametros, incidencias, reportes, rangoDatos,
  soloReportablesInicial, queryInicial, semanaInicial, puedeEditar, error,
}: {
  hoy: string;
  mes: string;
  mesActual: string;
  semanas: Semana[];
  parametros: ParametrosVelocidad;
  incidencias: Incidencia[];
  reportes: ReporteRrhh[];
  rangoDatos: { desde: string | null; hasta: string | null };
  soloReportablesInicial: boolean;
  queryInicial: string;
  semanaInicial: number | null;
  puedeEditar: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [soloReportables, setSoloReportables] = useState(soloReportablesInicial);
  const [query, setQuery] = useState(queryInicial);
  const [semanaSel, setSemanaSel] = useState<number | null>(semanaInicial);
  const [verParametros, setVerParametros] = useState(false);
  const [verSinConductor, setVerSinConductor] = useState(false);
  const [exportando, setExportando] = useState<FormatoExport | null>(null);

  const grupos = useMemo(
    () => agruparPorConductorSemana(incidencias, semanas, reportes, parametros.minimoIncidencias),
    [incidencias, semanas, reportes, parametros.minimoIncidencias]
  );
  const resumen = useMemo(() => resumirSemanas(semanas, grupos, incidencias), [semanas, grupos, incidencias]);
  const sinConductor = useMemo(
    () => incidencias.filter((i) => !i.cedula).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [incidencias]
  );

  const q = query.trim().toLowerCase();
  const visibles = useMemo(
    () =>
      grupos.filter((g) => {
        if (soloReportables && !g.reportable) return false;
        if (semanaSel != null && g.semana.numero !== semanaSel) return false;
        if (!q) return true;
        return (
          g.nombre.toLowerCase().includes(q) ||
          g.cedula.includes(q) ||
          (g.codigo ?? "").toLowerCase().includes(q) ||
          g.vehiculos.some((v) => v.toLowerCase().includes(q))
        );
      }),
    [grupos, soloReportables, semanaSel, q]
  );

  function irAMes(m: string) {
    const sp = new URLSearchParams();
    sp.set("mes", m);
    if (!soloReportables) sp.set("todos", "1");
    if (query.trim()) sp.set("q", query.trim());
    router.push(`/operativo/velocidad?${sp.toString()}`);
  }

  async function exportar(formato: FormatoExport) {
    setExportando(formato);
    try {
      await exportarInformeVelocidad({
        formato, mes, resumen, grupos: visibles, sinConductor, parametros, soloReportables, query: query.trim(),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el informe");
    } finally {
      setExportando(null);
    }
  }

  const totalReportables = grupos.filter((g) => g.reportable).length;
  const totalReportados = grupos.filter((g) => g.reportable && g.reporte).length;
  const datosParciales = rangoDatos.desde && rangoDatos.desde > semanas[0].desde;

  return (
    <div className="space-y-4 p-6">
      {/* Mes, filtros y exportación */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div>
          <span className={labelCls}>Mes</span>
          <div className="flex items-center gap-1">
            <button onClick={() => irAMes(mesVecino(mes, -1))} title="Mes anterior" className={`${btnCls} border-[#E2E8F0] px-2 text-gray-600 hover:bg-[#F8FAFC]`}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              value={mes}
              max={mesActual}
              onChange={(e) => e.target.value && irAMes(e.target.value)}
              className={`${inputCls} w-40`}
            />
            <button
              onClick={() => irAMes(mesVecino(mes, 1))}
              disabled={mes >= mesActual}
              title="Mes siguiente"
              className={`${btnCls} border-[#E2E8F0] px-2 text-gray-600 hover:bg-[#F8FAFC]`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={soloReportables} onChange={(e) => setSoloReportables(e.target.checked)} />
          Solo reportables ({parametros.minimoIncidencias}+ incidencias en la semana)
        </label>
        <div>
          <span className={labelCls}>Conductor o vehículo</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, cédula, código o bus"
              className={`${inputCls} w-56 pl-8`}
            />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">Informe</span>
          {(
            [
              { f: "pdf" as const, l: "PDF", I: Download },
              { f: "xlsx" as const, l: "Excel", I: FileSpreadsheet },
              { f: "csv" as const, l: "CSV", I: ClipboardList },
            ]
          ).map(({ f, l, I }) => (
            <button
              key={f}
              onClick={() => exportar(f)}
              disabled={exportando !== null || !!error}
              title={`Descargar el informe mensual en ${l} con lo que se ve en pantalla`}
              className={`${btnCls} border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]`}
            >
              {exportando === f ? <Loader2 className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4" />}
              {l}
            </button>
          ))}
          <button
            onClick={() => setVerParametros((v) => !v)}
            title="Umbral, mínimo de incidencias y minutos de agrupación"
            className={`${btnCls} ${verParametros ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]" : "border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]"}`}
          >
            <Settings2 className="h-4 w-4" /> Parámetros
          </button>
        </div>
      </div>

      {verParametros && (
        <Parametros parametros={parametros} puedeEditar={puedeEditar} onDone={() => { setVerParametros(false); router.refresh(); }} />
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          No se pudieron calcular las incidencias. Si la migración de exceso de velocidad no se ha aplicado, ese es el motivo. Detalle: {error}
        </p>
      )}

      {!error && datosParciales && (
        <p className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Los eventos de velocidad de GEMA están disponibles desde el {rangoDatos.desde}. Las semanas anteriores de este mes salen vacías por falta de datos, no porque no hubiera excesos.
        </p>
      )}

      {/* Semanas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {resumen.map((r) => {
          const activa = semanaSel === r.semana.numero;
          const grave = r.reportables - r.reportados > 0;
          return (
            <button
              key={r.semana.numero}
              type="button"
              onClick={() => setSemanaSel(activa ? null : r.semana.numero)}
              className={`rounded-xl border bg-white p-3 text-left transition hover:bg-[#F8FAFC] ${activa ? "border-[#4F46E5] ring-2 ring-[#4F46E5]" : "border-[#E2E8F0]"}`}
            >
              <p className="text-xs font-medium text-gray-500">{r.semana.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {r.reportables}
                <span className="ml-1 text-xs font-normal text-gray-500">reportable{r.reportables === 1 ? "" : "s"}</span>
              </p>
              <p className="text-[11px] text-gray-500">
                {r.conductores} conductor{r.conductores === 1 ? "" : "es"} · {r.incidencias} incidencia{r.incidencias === 1 ? "" : "s"}
                {r.sinConductor > 0 ? ` · ${r.sinConductor} sin conductor` : ""}
              </p>
              <p className={`mt-1 text-[11px] font-medium ${grave ? "text-[#B91C1C]" : r.reportables > 0 ? "text-[#065F46]" : "text-gray-400"}`}>
                {r.reportables === 0
                  ? "Nadie alcanza el mínimo"
                  : grave
                    ? `${r.reportables - r.reportados} pendiente${r.reportables - r.reportados === 1 ? "" : "s"} de reportar a RRHH`
                    : "Todos reportados a RRHH"}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span><strong>{mesLabel(mes)}</strong></span>
        <span><strong>{incidencias.length}</strong> incidencias en el mes</span>
        <span><strong>{grupos.length}</strong> conductor-semana con exceso</span>
        <span className={totalReportables - totalReportados > 0 ? "text-[#B91C1C]" : ""}>
          <strong>{totalReportables}</strong> reportables · <strong>{totalReportados}</strong> reportados
        </span>
        {semanaSel != null && (
          <button onClick={() => setSemanaSel(null)} className="inline-flex items-center gap-1 text-[#4F46E5] underline">
            <X className="h-3 w-3" /> quitar filtro de semana
          </button>
        )}
      </div>

      <TablaConductores
        filas={visibles}
        semanas={semanas}
        hoy={hoy}
        puedeEditar={puedeEditar}
        vacio={
          error
            ? "Sin datos."
            : soloReportables
              ? `Ningún conductor alcanza ${parametros.minimoIncidencias} incidencias${semanaSel != null ? " en esa semana" : ""}${q ? ` con "${query}"` : ""}. Quita "Solo reportables" para ver a todos los que tuvieron exceso.`
              : "Sin incidencias con esos filtros."
        }
        onCambio={() => router.refresh()}
      />

      {/* Sin conductor */}
      {sinConductor.length > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white">
          <button
            type="button"
            onClick={() => setVerSinConductor((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-gray-900">
              Incidencias sin conductor asignado <span className="ml-1 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-gray-600">{sinConductor.length}</span>
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-500">
              Ningún viaje despachado cubre la hora: revisar por vehículo
              <ChevronDown className={`h-4 w-4 transition ${verSinConductor ? "rotate-180" : ""}`} />
            </span>
          </button>
          {verSinConductor && <ListaIncidencias incidencias={sinConductor} conConductor={false} />}
        </div>
      )}

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-[11px] text-gray-500">
        <p className="mb-1 font-semibold text-gray-700">Reglas aplicadas</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {reglaTexto(parametros).map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>
    </div>
  );
}

// ── Parámetros ───────────────────────────────────────────────────────────────

function Parametros({ parametros, puedeEditar, onDone }: {
  parametros: ParametrosVelocidad;
  puedeEditar: boolean;
  onDone: () => void;
}) {
  const [umbral, setUmbral] = useState(String(parametros.umbralKmh));
  const [minimo, setMinimo] = useState(String(parametros.minimoIncidencias));
  const [minutos, setMinutos] = useState(String(parametros.minutosAgrupacion));
  const [pending, start] = useTransition();

  function guardar() {
    start(async () => {
      const res = await actualizarParametrosVelocidad({
        umbralKmh: Number(umbral), minimoIncidencias: Number(minimo), minutosAgrupacion: Number(minutos),
      });
      if (res.success) {
        toast.success("Parámetros guardados. Las incidencias se recalculan con la nueva regla.");
        onDone();
      } else {
        toast.error(res.error ?? "No se pudieron guardar");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/50 p-4">
      <div>
        <label className={labelCls}>Umbral (km/h, igual o mayor)</label>
        <input type="number" min={50} max={150} step={1} value={umbral} disabled={!puedeEditar} onChange={(e) => setUmbral(e.target.value)} className={`${inputCls} w-28`} />
      </div>
      <div>
        <label className={labelCls}>Incidencias por semana para reportar</label>
        <input type="number" min={1} max={100} value={minimo} disabled={!puedeEditar} onChange={(e) => setMinimo(e.target.value)} className={`${inputCls} w-28`} />
      </div>
      <div>
        <label className={labelCls}>Minutos que separan dos incidencias</label>
        <input type="number" min={1} max={120} value={minutos} disabled={!puedeEditar} onChange={(e) => setMinutos(e.target.value)} className={`${inputCls} w-28`} />
      </div>
      {puedeEditar && (
        <button onClick={guardar} disabled={pending} className={`${btnCls} border-transparent bg-[#4F46E5] text-white hover:bg-[#4338CA]`}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      )}
      <p className="basis-full text-[11px] text-gray-500">
        GEMA solo entrega eventos desde 50 km/h, así que el umbral no puede bajar de ahí. Cambiar los parámetros queda en la auditoría.
        {parametros.updatedByEmail ? ` Última modificación: ${parametros.updatedByEmail}.` : ""}
      </p>
    </div>
  );
}

// ── Tabla por semana y conductor ─────────────────────────────────────────────

function ChipVelocidad({ kmh }: { kmh: number }) {
  const n = nivelVelocidad(kmh);
  const c = NIVEL_VELOCIDAD_COLOR[n];
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: c.fuerte }}
      title={NIVEL_VELOCIDAD_LABEL[n]}
    >
      {kmh.toFixed(0)} km/h
    </span>
  );
}

function TablaConductores({ filas, semanas, hoy, puedeEditar, vacio, onCambio }: {
  filas: ConductorSemana[];
  semanas: Semana[];
  hoy: string;
  puedeEditar: boolean;
  vacio: string;
  onCambio: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500";
  const td = "px-3 py-2 align-top text-xs text-gray-600";

  const porSemana = semanas
    .map((s) => ({ semana: s, filas: filas.filter((f) => f.semana.desde === s.desde) }))
    .filter((x) => x.filas.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className={puedeEditar ? "w-[14%]" : "w-[24%]"} />
          {puedeEditar && <col className="w-[10%]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-[#F1F5F9]">
            <th className={th}>Conductor</th>
            <th className={`${th} text-right`}>Incidencias</th>
            <th className={`${th} text-center`}>Vel. máx</th>
            <th className={th}>Vehículos</th>
            <th className={th}>Rutas</th>
            <th className={th}>Reporte a RRHH</th>
            {puedeEditar && <th className={`${th} text-right`}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {porSemana.map(({ semana, filas: fs }) => (
            <SemanaFilas
              key={semana.numero}
              semana={semana}
              filas={fs}
              td={td}
              hoy={hoy}
              puedeEditar={puedeEditar}
              abierta={abierta}
              marcando={marcando}
              anulando={anulando}
              setAbierta={setAbierta}
              setMarcando={setMarcando}
              setAnulando={setAnulando}
              onCambio={onCambio}
            />
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={puedeEditar ? 7 : 6} className="px-4 py-8 text-center text-sm text-gray-500">{vacio}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SemanaFilas({
  semana, filas, td, hoy, puedeEditar, abierta, marcando, anulando, setAbierta, setMarcando, setAnulando, onCambio,
}: {
  semana: Semana;
  filas: ConductorSemana[];
  td: string;
  hoy: string;
  puedeEditar: boolean;
  abierta: string | null;
  marcando: string | null;
  anulando: string | null;
  setAbierta: (k: string | null) => void;
  setMarcando: (k: string | null) => void;
  setAnulando: (k: string | null) => void;
  onCambio: () => void;
}) {
  const cols = puedeEditar ? 7 : 6;
  const reportables = filas.filter((f) => f.reportable).length;
  return (
    <>
      <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
        <td colSpan={cols} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
          {semana.label}
          <span className="ml-2 font-normal text-gray-500">
            {filas.length} conductor{filas.length === 1 ? "" : "es"} · {reportables} reportable{reportables === 1 ? "" : "s"}
          </span>
        </td>
      </tr>
      {filas.map((g) => {
        const expandida = abierta === g.key;
        const pendiente = g.reportable && !g.reporte;
        return (
          <FilaConductor
            key={g.key}
            g={g}
            td={td}
            cols={cols}
            hoy={hoy}
            puedeEditar={puedeEditar}
            expandida={expandida}
            pendiente={pendiente}
            marcando={marcando === g.key}
            anulando={anulando === g.key}
            onToggle={() => setAbierta(expandida ? null : g.key)}
            onMarcar={() => { setAnulando(null); setMarcando(marcando === g.key ? null : g.key); }}
            onAnular={() => { setMarcando(null); setAnulando(anulando === g.key ? null : g.key); }}
            onCerrar={() => { setMarcando(null); setAnulando(null); }}
            onCambio={onCambio}
          />
        );
      })}
    </>
  );
}

function FilaConductor({
  g, td, cols, hoy, puedeEditar, expandida, pendiente, marcando, anulando, onToggle, onMarcar, onAnular, onCerrar, onCambio,
}: {
  g: ConductorSemana;
  td: string;
  cols: number;
  hoy: string;
  puedeEditar: boolean;
  expandida: boolean;
  pendiente: boolean;
  marcando: boolean;
  anulando: boolean;
  onToggle: () => void;
  onMarcar: () => void;
  onAnular: () => void;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  function marcar() {
    start(async () => {
      const res = await marcarReporteVelocidad({
        cedula: g.cedula, codigo: g.codigo, nombre: g.nombre,
        semanaDesde: g.semana.desde, semanaHasta: g.semana.hasta,
        incidencias: g.incidencias.length, velocidadMax: g.velocidadMax,
        reportadoEn: fecha, observaciones: obs,
      });
      if (res.success) {
        toast.success(res.existente ? "Ya estaba reportado; se conserva la marca anterior." : `Reporte a RRHH registrado: ${g.nombre}`);
        onCerrar();
        onCambio();
      } else {
        toast.error(res.error ?? "No se pudo registrar");
      }
    });
  }

  function anular() {
    if (!g.reporte) return;
    start(async () => {
      const res = await anularReporteVelocidad(g.reporte!.id, motivo);
      if (res.success) {
        toast.success("Reporte anulado (queda en la auditoría).");
        onCerrar();
        onCambio();
      } else {
        toast.error(res.error ?? "No se pudo anular");
      }
    });
  }

  const accion = "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-medium disabled:opacity-50";
  return (
    <>
      <tr className={`border-b border-[#F1F5F9] ${pendiente ? "bg-[#FEF2F2]/40" : ""}`}>
        <td className={td}>
          <button type="button" onClick={onToggle} className="flex w-full items-start gap-1 text-left">
            <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition ${expandida ? "rotate-180" : ""}`} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-gray-900" title={g.nombre}>{g.nombre}</span>
              <span className="block text-[11px] text-gray-500">CC {g.cedula}{g.codigo ? ` · cód. ${g.codigo}` : ""}</span>
            </span>
          </button>
        </td>
        <td className={`${td} text-right`}>
          <span className={`text-sm font-bold ${g.reportable ? "text-[#B91C1C]" : "text-gray-800"}`}>{g.incidencias.length}</span>
          {g.reportable && <span className="block text-[10px] font-medium uppercase text-[#B91C1C]">reportable</span>}
        </td>
        <td className={`${td} text-center`}><ChipVelocidad kmh={g.velocidadMax} /></td>
        <td className={td}>{g.vehiculos.join(", ")}</td>
        <td className={`${td} truncate`} title={g.rutas.join(" · ")}>{g.rutas.join(" · ") || "—"}</td>
        <td className={td}>
          {g.reporte ? (
            <span
              className="inline-flex flex-col rounded-lg bg-[#D1FAE5] px-2 py-1 text-[11px] text-[#065F46]"
              title={`${g.reporte.createdByEmail ?? ""}${g.reporte.observaciones ? `\n${g.reporte.observaciones}` : ""}`}
            >
              <span className="font-semibold">Reportado el {ddmm(g.reporte.reportadoEn)}</span>
              {g.reporte.observaciones && <span className="truncate">{g.reporte.observaciones}</span>}
            </span>
          ) : g.reportable ? (
            <span className="inline-flex rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-semibold text-[#991B1B]">Pendiente</span>
          ) : (
            <span className="text-[11px] text-gray-400">Bajo el mínimo</span>
          )}
        </td>
        {puedeEditar && (
          <td className={`${td} text-right`}>
            {g.reporte ? (
              <button onClick={onAnular} title="Anular la marca de reporte con motivo" className={`${accion} border-[#E2E8F0] text-gray-600 hover:bg-[#F8FAFC]`}>
                <Undo2 className="h-3.5 w-3.5" /> Anular
              </button>
            ) : (
              <button
                onClick={onMarcar}
                title={g.reportable ? "Registrar que se reportó a Recursos Humanos" : "No alcanza el mínimo; se puede reportar de todos modos"}
                className={`${accion} ${g.reportable ? "border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]" : "border-[#E2E8F0] text-gray-600 hover:bg-[#F8FAFC]"}`}
              >
                <Send className="h-3.5 w-3.5" /> Reportar
              </button>
            )}
          </td>
        )}
      </tr>

      {marcando && (
        <tr className="border-b border-[#F1F5F9] bg-[#FFFBEB]/60">
          <td colSpan={cols} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={labelCls}>Fecha del reporte a RRHH</label>
                <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
              </div>
              <div className="min-w-64 flex-1">
                <label className={labelCls}>Observaciones (medio, acta, memorando…)</label>
                <input type="text" value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className={`${inputCls} w-full`} />
              </div>
              <button onClick={marcar} disabled={pending || !fecha} className={`${btnCls} border-transparent bg-[#B91C1C] text-white hover:bg-[#991B1B]`}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Registrar reporte
              </button>
              <button onClick={onCerrar} className={`${btnCls} border-[#E2E8F0] bg-white text-gray-600`}>Cancelar</button>
              <p className="basis-full text-[11px] text-gray-500">
                {g.nombre} · {g.semana.label} · {g.incidencias.length} incidencias · máx {g.velocidadMax.toFixed(0)} km/h. La marca queda en la auditoría.
              </p>
            </div>
          </td>
        </tr>
      )}

      {anulando && g.reporte && (
        <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
          <td colSpan={cols} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <label className={labelCls}>Motivo de la anulación <span className="text-red-500">*</span></label>
                <input type="text" value={motivo} maxLength={200} autoFocus onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. se marcó al conductor equivocado" className={`${inputCls} w-full`} />
              </div>
              <button onClick={anular} disabled={pending || motivo.trim().length < 5} className={`${btnCls} border-transparent bg-gray-900 text-white hover:bg-gray-800`}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Anular reporte
              </button>
              <button onClick={onCerrar} className={`${btnCls} border-[#E2E8F0] bg-white text-gray-600`}>Cancelar</button>
            </div>
          </td>
        </tr>
      )}

      {expandida && (
        <tr className="border-b border-[#F1F5F9]">
          <td colSpan={cols} className="bg-[#F8FAFC] px-4 py-2">
            <ListaIncidencias incidencias={g.incidencias} conConductor />
          </td>
        </tr>
      )}
    </>
  );
}

/** Detalle de incidencias: una fila por episodio con hora, bus, ruta, eventos, velocidad y mapa. */
function ListaIncidencias({ incidencias, conConductor }: { incidencias: Incidencia[]; conConductor: boolean }) {
  const th = "px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-gray-500";
  const td = "px-2 py-1 align-top text-xs text-gray-600";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#E2E8F0]">
            <th className={th}>Fecha</th>
            <th className={th}>Hora</th>
            <th className={`${th} text-right`}>Min</th>
            <th className={th}>Bus</th>
            {!conConductor && <th className={th}>Conductor</th>}
            <th className={th}>Ruta · viaje</th>
            <th className={`${th} text-right`}>Eventos</th>
            <th className={`${th} text-center`}>Vel. máx</th>
            <th className={`${th} text-right`}>Prom.</th>
            <th className={th}>Dirección</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {incidencias.map((i) => {
            const mapa = enlaceMapa(i.latitud, i.longitud);
            return (
              <tr key={i.id} className="border-b border-[#F1F5F9]">
                <td className={`${td} whitespace-nowrap`}>{ddmm(i.fecha)}</td>
                <td className={`${td} whitespace-nowrap`}>{horaDe(i.inicio)}–{horaDe(i.fin)}</td>
                <td className={`${td} text-right`}>{duracionMinutos(i)}</td>
                <td className={`${td} font-medium text-gray-800`}>{i.vehiculo}</td>
                {!conConductor && <td className={td}>{i.nombre ?? <span className="text-gray-400">Sin viaje despachado</span>}</td>}
                <td className={td}>
                  {i.ruta ?? "—"}
                  {i.viaje != null && <span className="text-gray-400"> · viaje {i.viaje}{i.horaDespacho ? ` (${i.horaDespacho.slice(0, 5)})` : ""}</span>}
                </td>
                <td className={`${td} text-right`}>{i.eventos}</td>
                <td className={`${td} text-center`}><ChipVelocidad kmh={i.velocidadMax} /></td>
                <td className={`${td} text-right`}>{i.velocidadProm != null ? i.velocidadProm.toFixed(0) : "—"}</td>
                <td className={`${td} max-w-64 truncate`} title={i.direccion ?? ""}>{i.direccion ?? "—"}</td>
                <td className={td}>
                  {mapa && (
                    <a href={mapa} target="_blank" rel="noreferrer" title="Ver el punto de mayor velocidad en el mapa" className="inline-flex items-center gap-1 text-[#4F46E5] hover:underline">
                      <MapPin className="h-3.5 w-3.5" /> mapa
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
