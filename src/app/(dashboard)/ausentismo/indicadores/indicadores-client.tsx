"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  CORTES, calcularIndicadores, topN, ordenarPor, SIN_DATO,
  type CorteId, type FilaIndicador, type Grupo, type GrupoMensual,
} from "@/lib/ausentismo/indicadores";
import { TIPOS_CONDUCTOR } from "@/lib/ausentismo/matriz-reglas";
import type { CatalogoItem } from "@/lib/ausentismo/matriz";
import { exportarIndicadoresPdf } from "@/lib/ausentismo/indicadores-pdf";
import {
  BarrasHorizontales, BarrasMensuales, COLOR_MEDIDA, ETIQUETA_MEDIDA, type Medida,
} from "@/components/graficos/graficos-ausentismo";

export interface FiltrosIndicadoresUI {
  desde: string;
  hasta: string;
  origen: string;
  eps: string;
  tipo: string;
  estado: string;
  /** "10" | "20" | "" (todos). */
  top: string;
}

export function paramsIndicadores(f: FiltrosIndicadoresUI): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  return sp;
}

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const fmt = (n: number) => n.toLocaleString("es-CO");

/**
 * Pestaña Indicadores: la matriz agregada en siete cortes con gráfico y tabla,
 * más los indicadores globales y el análisis en frases. Todo se calcula en el
 * cliente a partir de las filas ya filtradas en el servidor, así cambiar el
 * "Top" no recarga nada.
 */
export function IndicadoresClient({ hoy, filtros, filas, activos, origenes, pagadores }: {
  hoy: string;
  filtros: FiltrosIndicadoresUI;
  filas: FilaIndicador[];
  activos: number | null;
  origenes: CatalogoItem[];
  pagadores: CatalogoItem[];
}) {
  const router = useRouter();
  const ind = useMemo(
    () => calcularIndicadores(filas, { desde: filtros.desde, hasta: filtros.hasta, activos }),
    [filas, filtros.desde, filtros.hasta, activos]
  );
  const n = filtros.top === "" ? null : Number(filtros.top) || 10;
  const [generandoPdf, setGenerandoPdf] = useState(false);

  function irA(f: Partial<FiltrosIndicadoresUI>) {
    const sp = paramsIndicadores({ ...filtros, ...f });
    sp.set("tab", "indicadores");
    router.push(`/ausentismo?${sp.toString()}`);
  }

  // Las dos exportaciones reciben la misma segmentación que la pantalla.
  const filtrosInforme = {
    desde: filtros.desde, hasta: filtros.hasta, origen: filtros.origen || null,
    eps: filtros.eps || null, tipo: filtros.tipo || null, estado: filtros.estado || null,
  };
  const excelHref = `/api/ausentismo/indicadores/export?${paramsIndicadores({ ...filtros, top: "" }).toString()}`;

  async function descargarPdf() {
    setGenerandoPdf(true);
    try {
      await exportarIndicadoresPdf({ indicadores: ind, filtros: filtrosInforme, top: n });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setGenerandoPdf(false);
    }
  }

  const botonCls = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      <Filtros filtros={filtros} hoy={hoy} origenes={origenes} pagadores={pagadores} onAplicar={irA} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {fmt(filas.length)} incapacidad{filas.length === 1 ? "" : "es"} en la segmentación
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={descargarPdf}
            disabled={generandoPdf || filas.length === 0}
            title="Informe PDF con los gráficos, las tablas y el análisis de esta segmentación"
            className={botonCls}
          >
            {generandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-[#DC2626]" />}
            Informe PDF
          </button>
          <a
            href={filas.length === 0 ? undefined : excelHref}
            aria-disabled={filas.length === 0}
            title="Libro Excel con una hoja por corte, el análisis y el detalle de las incapacidades"
            className={`${botonCls} ${filas.length === 0 ? "pointer-events-none opacity-50" : ""}`}
          >
            <FileSpreadsheet className="h-4 w-4 text-[#059669]" />
            Excel
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Incapacidades" valor={fmt(ind.totales.eventos)} />
        <Kpi label="Días perdidos" valor={fmt(ind.totales.dias)} destacado />
        <Kpi label="Días por incapacidad" valor={String(ind.totales.promedio)} />
        <Kpi
          label="Trabajadores afectados"
          valor={fmt(ind.totales.trabajadores)}
          nota={ind.totales.pctAfectados != null ? `${ind.totales.pctAfectados}% de ${fmt(ind.totales.activos!)} activos` : undefined}
        />
        <Kpi label="Prórrogas" valor={fmt(ind.totales.prorrogas)} nota={`${ind.totales.pctProrrogas}% de las incapacidades`} />
      </div>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Análisis</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {ind.analisis.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </section>

      <SeccionMensual datos={ind.mensual} conTasa={activos != null} />

      {CORTES.filter((c) => c.id !== "mensual").map((c) => (
        <SeccionCorte
          key={c.id}
          id={c.id}
          titulo={c.titulo}
          dimension={c.dimension}
          todos={ind[c.id as Exclude<CorteId, "mensual">]}
          n={n}
        />
      ))}
    </>
  );
}

function Filtros({ filtros, hoy, origenes, pagadores, onAplicar }: {
  filtros: FiltrosIndicadoresUI;
  hoy: string;
  origenes: CatalogoItem[];
  pagadores: CatalogoItem[];
  onAplicar: (f: FiltrosIndicadoresUI) => void;
}) {
  const [f, setF] = useState(filtros);
  const set = (k: keyof FiltrosIndicadoresUI) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const campo = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {el}
    </label>
  );
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
      {campo("Desde", <input type="date" value={f.desde} max={hoy} onChange={(e) => set("desde")(e.target.value)} className={inputCls} />)}
      {campo("Hasta", <input type="date" value={f.hasta} min={f.desde} max={hoy} onChange={(e) => set("hasta")(e.target.value)} className={inputCls} />)}
      {campo("Origen", (
        <select value={f.origen} onChange={(e) => set("origen")(e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {origenes.map((o) => <option key={o.id} value={o.codigo ?? ""}>{o.codigo} · {o.nombre}</option>)}
        </select>
      ))}
      {campo("EPS / ARL", (
        <select value={f.eps} onChange={(e) => set("eps")(e.target.value)} className={`${inputCls} max-w-56`}>
          <option value="">Todas</option>
          {pagadores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
      ))}
      {campo("Tipo de trabajador", (
        <select value={f.tipo} onChange={(e) => set("tipo")(e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {TIPOS_CONDUCTOR.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      ))}
      {campo("Registro", (
        <select value={f.estado} onChange={(e) => set("estado")(e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          <option value="cerrado">Cerrados</option>
          <option value="pendiente">Pendientes</option>
        </select>
      ))}
      {campo("Top", (
        <select value={f.top} onChange={(e) => set("top")(e.target.value)} className={inputCls}>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="">Todos</option>
        </select>
      ))}
      <button
        onClick={() => onAplicar(f)}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
      >
        <Search className="h-4 w-4" /> Aplicar
      </button>
    </div>
  );
}

function Kpi({ label, valor, nota, destacado }: { label: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destacado ? "border-[#C7D2FE] bg-[#EEF2FF]" : "border-[#E2E8F0] bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${destacado ? "text-[#3730A3]" : "text-gray-900"}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

function Leyenda({ medida }: { medida: Medida }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_MEDIDA[medida] }} />
      {ETIQUETA_MEDIDA[medida]}
    </span>
  );
}

function SeccionMensual({ datos, conTasa }: { datos: GrupoMensual[]; conTasa: boolean }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Ausentismo mensual</h2>
      <div className="mt-3 grid gap-6 lg:grid-cols-2">
        <div>
          <Leyenda medida="dias" />
          <BarrasMensuales datos={datos} medida="dias" />
        </div>
        <div>
          <Leyenda medida="eventos" />
          <BarrasMensuales datos={datos} medida="eventos" />
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Mes</th>
              <th className="px-3 py-2 text-right">Incapacidades</th>
              <th className="px-3 py-2 text-right">Prórrogas</th>
              <th className="px-3 py-2 text-right">Días perdidos</th>
              <th className="px-3 py-2 text-right">Días / incap.</th>
              <th className="px-3 py-2 text-right">% días</th>
              <th className="px-3 py-2 text-right">Trabajadores</th>
              {conTasa && <th className="px-3 py-2 text-right">Tasa</th>}
            </tr>
          </thead>
          <tbody>
            {datos.map((m) => (
              <tr key={m.mes} className="border-b border-[#F1F5F9]">
                <td className="px-3 py-1.5 font-medium text-gray-900">{m.etiqueta}</td>
                <td className="px-3 py-1.5 text-right">{fmt(m.eventos)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{fmt(m.prorrogas)}</td>
                <td className="px-3 py-1.5 text-right font-medium">{fmt(m.dias)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{m.promedio}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{m.pctDias}%</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{fmt(m.trabajadores)}</td>
                {conTasa && <td className="px-3 py-1.5 text-right text-gray-600">{m.tasa ?? "—"}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeccionCorte({ id, titulo, dimension, todos, n }: {
  id: CorteId;
  titulo: string;
  dimension: string;
  todos: Grupo[];
  n: number | null;
}) {
  const [medida, setMedida] = useState<Medida>("dias");
  const esTrabajador = id === "trabajador";
  // El ranking y el "Top" siguen a la medida que se está mirando.
  const grupos = useMemo(() => topN(ordenarPor(todos, medida), n), [todos, medida, n]);
  const totalGrupos = todos.filter((g) => g.clave !== SIN_DATO).length;
  const mostrados = grupos.filter((g) => g.clave !== "__otros__" && g.clave !== SIN_DATO).length;
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
          <p className="text-xs text-gray-500">
            {mostrados < totalGrupos ? `Top ${mostrados} de ${fmt(totalGrupos)}` : `${fmt(totalGrupos)} en total`}, ordenado por {ETIQUETA_MEDIDA[medida].toLowerCase()}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0] text-xs">
          {(["dias", "eventos"] as Medida[]).map((m) => (
            <button
              key={m}
              onClick={() => setMedida(m)}
              className={`px-2.5 py-1.5 font-medium ${medida === m ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
            >
              {ETIQUETA_MEDIDA[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <Leyenda medida={medida} />
          <BarrasHorizontales datos={grupos} medida={medida} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">{dimension}</th>
                <th className="px-3 py-2 text-right">Incap.</th>
                <th className="px-3 py-2 text-right">Prórr.</th>
                <th className="px-3 py-2 text-right">Días</th>
                <th className="px-3 py-2 text-right">Días / incap.</th>
                <th className="px-3 py-2 text-right">% días</th>
                {!esTrabajador && <th className="px-3 py-2 text-right">Trabaj.</th>}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.clave} className={`border-b border-[#F1F5F9] ${g.clave === "__otros__" || g.clave === SIN_DATO ? "text-gray-500" : ""}`}>
                  <td className="px-3 py-1.5">
                    <p className="font-medium text-gray-900">{g.etiqueta}</p>
                    {g.detalle && <p className="text-xs text-gray-500">{g.detalle}</p>}
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmt(g.eventos)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{fmt(g.prorrogas)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{fmt(g.dias)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{g.promedio}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600">{g.pctDias}%</td>
                  {!esTrabajador && <td className="px-3 py-1.5 text-right text-gray-600">{g.clave === "__otros__" ? "—" : fmt(g.trabajadores)}</td>}
                </tr>
              ))}
              {grupos.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">Sin datos para este corte.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
