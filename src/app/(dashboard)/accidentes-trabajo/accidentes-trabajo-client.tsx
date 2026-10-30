"use client";

/**
 * Accidentes de trabajo (SST): filtros comunes y dos vistas — el registro de
 * casos y la caracterización (la pestaña «Carac.» del Excel, calculada: cifras,
 * figura del cuerpo y gráficos por mes, lesión, parte, mecanismo, agente y día).
 * Todo se filtra aquí: son decenas de casos al año.
 */

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, Check, ChevronDown, ChevronRight, ClipboardList, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { usePermisos } from "@/components/permisos/permisos-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { BarrasConteo, ColumnasConteo, FiguraCuerpo } from "@/components/graficos/graficos-sst";
import { descargarCsv } from "@/lib/exportar/csv";
import type { OpcionTrabajador } from "@/lib/sst/data";
import {
  AGENTES, GRUPOS_PARTE_CUERPO, MECANISMOS, MESES, TIPOS_LESION,
  caracterizar, etiquetaAgente, etiquetaEstadoInvestigacion, etiquetaGrupoParte, etiquetaMecanismo, etiquetaTipoLesion,
  type AccidenteTrabajo, type Caracterizacion, type Conteo,
} from "@/lib/sst/reglas";
import { anularAccidenteTrabajo } from "./actions";
import { AccidenteTrabajoDialog } from "./accidente-trabajo-dialog";

const inputCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type Filtros = { anio: string; mes: string; q: string; tipoLesion: string; parte: string; mecanismo: string; agente: string; transito: string };
const VACIOS: Filtros = { anio: "", mes: "", q: "", tipoLesion: "", parte: "", mecanismo: "", agente: "", transito: "" };

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
const siNo = (v: boolean | null) => (v == null ? "—" : v ? "Sí" : "No");

export function AccidentesTrabajoClient({ tabInicial, accidentes, trabajadores, hoy }: {
  tabInicial: string;
  accidentes: AccidenteTrabajo[];
  trabajadores: OpcionTrabajador[];
  hoy: string;
}) {
  const anios = useMemo(() => [...new Set(accidentes.map((a) => String(a.anio)))].sort().reverse(), [accidentes]);
  const [tab, setTab] = useState(tabInicial);
  // Por defecto el año más reciente con casos, como el Excel (una hoja por año).
  const [f, setF] = useState<Filtros>({ ...VACIOS, anio: anios[0] ?? "" });
  const set = (k: keyof Filtros) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const [dialogo, setDialogo] = useState<AccidenteTrabajo | "nuevo" | null>(null);
  const puede = usePermisos();
  const crea = puede("accidentes_trabajo.crear");
  const edita = puede("accidentes_trabajo.editar");

  const filtrados = useMemo(() => {
    const q = sinAcentos(f.q.trim());
    return accidentes.filter(
      (a) =>
        (!f.anio || String(a.anio) === f.anio) &&
        (!f.mes || Number(a.fechaAt.slice(5, 7)) === Number(f.mes)) &&
        (!f.tipoLesion || a.tipoLesion === f.tipoLesion) &&
        (!f.parte || a.parteCuerpoGrupo === f.parte) &&
        (!f.mecanismo || a.mecanismo === f.mecanismo) &&
        (!f.agente || a.agente === f.agente) &&
        (!f.transito || (f.transito === "si") === a.accidenteTransito) &&
        (!q || sinAcentos(`${a.nombre} ${a.cedula ?? ""} ${a.caso} ${a.cargo ?? ""} ${a.parteCuerpo ?? ""} ${a.descripcion ?? ""}`).includes(q))
    );
  }, [accidentes, f]);
  const carac = useMemo(() => caracterizar(filtrados), [filtrados]);
  const hayFiltro = Object.entries(f).some(([k, v]) => v && !(k === "anio" && v === (anios[0] ?? "")));
  const textoFiltro = [
    f.anio ? `Año ${f.anio}` : "Todos los años",
    f.mes && MESES[Number(f.mes) - 1],
    f.tipoLesion && etiquetaTipoLesion(f.tipoLesion),
    f.parte && etiquetaGrupoParte(f.parte),
    f.mecanismo && etiquetaMecanismo(f.mecanismo),
    f.agente && etiquetaAgente(f.agente),
    f.transito && (f.transito === "si" ? "Accidentes de tránsito" : "Sin accidente de tránsito"),
    f.q && `«${f.q}»`,
  ].filter(Boolean).join(" · ");

  const cambiarTab = (v: string) => {
    setTab(v);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", v);
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  const campo = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {el}
    </label>
  );
  const select = (k: keyof Filtros, opciones: readonly { key: string; label: string }[], todos = "Todos") => (
    <select className={inputCls} value={f[k]} onChange={(e) => set(k)(e.target.value)}>
      <option value="">{todos}</option>
      {opciones.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        {campo("Año", select("anio", anios.map((a) => ({ key: a, label: a })), "Todos"))}
        {campo("Mes", select("mes", MESES.map((m, i) => ({ key: String(i + 1), label: m }))))}
        {campo("Tipo de lesión", select("tipoLesion", TIPOS_LESION))}
        {campo("Parte del cuerpo", select("parte", GRUPOS_PARTE_CUERPO, "Todas"))}
        {campo("Mecanismo", select("mecanismo", MECANISMOS))}
        {campo("Agente", select("agente", AGENTES))}
        {campo("Tránsito", select("transito", [{ key: "si", label: "Accidente de tránsito" }, { key: "no", label: "Sin tránsito" }]))}
        {campo(
          "Buscar",
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputCls} w-56 pl-8`} value={f.q} placeholder="Nombre, cédula, caso o texto" onChange={(e) => set("q")(e.target.value)} />
          </div>
        )}
        {hayFiltro && (
          <button type="button" onClick={() => setF({ ...VACIOS, anio: anios[0] ?? "" })} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
            <X className="h-4 w-4" /> Limpiar
          </button>
        )}
        {crea && (
          <button
            type="button"
            onClick={() => setDialogo("nuevo")}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
          >
            <Plus className="h-4 w-4" /> Nuevo accidente
          </button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => cambiarTab(String(v))}>
        <TabsList className="mb-4 h-10">
          <TabsTrigger value="registro" className="px-4">
            <ClipboardList /> Registro
          </TabsTrigger>
          <TabsTrigger value="caracterizacion" className="px-4">
            <BarChart3 /> Caracterización
          </TabsTrigger>
        </TabsList>
        <TabsContent value="registro">
          <Registro accidentes={filtrados} textoFiltro={textoFiltro} onEditar={edita ? setDialogo : null} />
        </TabsContent>
        <TabsContent value="caracterizacion">
          <CaracterizacionVista c={carac} textoFiltro={textoFiltro} />
        </TabsContent>
      </Tabs>

      {dialogo && (
        <AccidenteTrabajoDialog accidente={dialogo === "nuevo" ? null : dialogo} trabajadores={trabajadores} hoy={hoy} onClose={() => setDialogo(null)} />
      )}
    </div>
  );
}

// ── Registro ─────────────────────────────────────────────────────────────────

const CABECERA = [
  "Año", "Caso", "Mes", "Fecha AT", "Hora", "Fecha notificación", "Cédula", "Nombres y apellidos", "Cargo", "Empresa usuaria", "Ciudad",
  "Tipo de lesión", "Descripción", "Parte del cuerpo", "Grupo parte del cuerpo", "Mecanismo", "Agente", "Accidente de tránsito",
  "Días de incapacidad", "Sexo", "Día de la semana", "Estado de la investigación", "Cierre administrativo ARL", "Observaciones", "Origen",
];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
function filaExport(a: AccidenteTrabajo): (string | number)[] {
  return [
    a.anio, a.caso, MESES[Number(a.fechaAt.slice(5, 7)) - 1], a.fechaAt, a.hora ?? "", a.fechaNotificacion ?? "", a.cedula ?? "", a.nombre,
    a.cargo ?? "", a.empresaUsuaria ?? "", a.ciudad ?? "", etiquetaTipoLesion(a.tipoLesion), a.descripcion ?? "", a.parteCuerpo ?? "",
    etiquetaGrupoParte(a.parteCuerpoGrupo), etiquetaMecanismo(a.mecanismo), etiquetaAgente(a.agente), a.accidenteTransito ? "Sí" : "No",
    a.diasIncapacidad, a.sexo ?? "", DIAS[new Date(`${a.fechaAt}T12:00:00Z`).getUTCDay()],
    a.estadoInvestigacion ? etiquetaEstadoInvestigacion(a.estadoInvestigacion) : "", siNo(a.cierreAdministrativoArl), a.observaciones ?? "",
    a.origen === "historico" ? "Histórico (Excel)" : "Gestivo",
  ];
}

function Registro({ accidentes, textoFiltro, onEditar }: { accidentes: AccidenteTrabajo[]; textoFiltro: string; onEditar: ((a: AccidenteTrabajo) => void) | null }) {
  const anula = usePermisos()("accidentes_trabajo.anular");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const p = usePaginacion(accidentes, { reiniciar: accidentes.length });
  const ancla = useRef<HTMLDivElement>(null);

  function anular(id: string) {
    start(async () => {
      const r = await anularAccidenteTrabajo(id, motivo);
      if (!r.success) {
        toast.error(r.error ?? "No se pudo anular.");
        return;
      }
      toast.success("Accidente anulado; queda como rastro.");
      setAnulando(null);
      setMotivo("");
      router.refresh();
    });
  }
  const alternar = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">{accidentes.length}</strong> accidente{accidentes.length === 1 ? "" : "s"} · {textoFiltro}
        </p>
        <BotonesExportar
          formatos={["xlsx", "csv"]}
          sinDatos={accidentes.length === 0}
          onExportar={async (formato) => {
            const filas = accidentes.map(filaExport);
            if (formato === "csv") return descargarCsv("accidentes_de_trabajo.csv", [CABECERA, ...filas]);
            const XLSX = await import("xlsx");
            const libro = XLSX.utils.book_new();
            const hoja = XLSX.utils.aoa_to_sheet([[textoFiltro], CABECERA, ...filas]);
            XLSX.utils.book_append_sheet(libro, hoja, "Accidentes de trabajo");
            // La caracterización de lo filtrado, como la pestaña «Carac.» del Excel.
            const c = caracterizar(accidentes);
            const tabla = (titulo: string, datos: Conteo[]) => [[titulo, "Nº", "%"], ...datos.map((d) => [d.label, d.n, d.pct]), ["TOTAL", c.total, 100], []];
            const carac = [
              [`CARACTERIZACIÓN DE LA ACCIDENTALIDAD · ${textoFiltro}`], [],
              ...tabla("Mes", c.porMes), ...tabla("Tipo de lesión", c.porTipoLesion), ...tabla("Parte del cuerpo", c.porParteCuerpo),
              ...tabla("Mecanismo del AT", c.porMecanismo), ...tabla("Agente del AT", c.porAgente), ...tabla("Día del AT", c.porDia),
            ];
            XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(carac), "Caracterización");
            XLSX.writeFile(libro, "accidentes_de_trabajo.xlsx");
          }}
        />
      </div>
      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Caso</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Trabajador</th>
                <th className="px-3 py-2">Lesión</th>
                <th className="px-3 py-2">Mecanismo · agente</th>
                <th className="px-3 py-2 text-right">Días incap.</th>
                <th className="px-3 py-2">Tránsito</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {p.filas.map((a) => {
                const abierto = abiertos.has(a.id);
                return (
                  <Fragment key={a.id}>
                    <tr className="border-b border-[#F1F5F9] align-top">
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => alternar(a.id)} aria-expanded={abierto} title={abierto ? "Ocultar descripción" : "Ver descripción"} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-700 tabular-nums">
                        {a.anio}-{String(a.caso).padStart(2, "0")}
                        {a.origen === "historico" && (
                          <span className="ml-1.5 rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[11px] font-semibold text-gray-600" title="Cargado del Excel de SST">
                            Histórico
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {fechaCorta(a.fechaAt)}
                        {a.hora && <p className="text-xs text-gray-500">{a.hora}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{a.nombre}</p>
                        <p className="text-xs text-gray-500">
                          {a.cedula ? `CC ${a.cedula}` : "Sin cédula"}
                          {a.cargo ? ` · ${a.cargo}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{etiquetaTipoLesion(a.tipoLesion)}</p>
                        <p className="text-xs text-gray-500">{a.parteCuerpo || etiquetaGrupoParte(a.parteCuerpoGrupo)}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        <p>{etiquetaMecanismo(a.mecanismo)}</p>
                        <p className="text-gray-500">{etiquetaAgente(a.agente)}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.diasIncapacidad}</td>
                      <td className="px-3 py-2">
                        {a.accidenteTransito ? (
                          <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#92400E]">Sí</span>
                        ) : (
                          <span className="text-xs text-gray-400">No</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {anulando === a.id ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              autoFocus
                              className={`${inputCls} h-8 w-48 text-xs`}
                              placeholder="Motivo de la anulación"
                              value={motivo}
                              maxLength={500}
                              onChange={(e) => setMotivo(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && anular(a.id)}
                            />
                            <button type="button" disabled={pending} onClick={() => anular(a.id)} title="Anular" className="rounded p-1.5 text-red-600 hover:bg-red-50">
                              <Check className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => { setAnulando(null); setMotivo(""); }} title="Cancelar" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                              <X className="h-4 w-4" />
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1">
                            {onEditar && (
                              <button type="button" onClick={() => onEditar(a)} title="Editar" className="rounded p-1.5 text-[#4F46E5] hover:bg-[#EEF2FF]">
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {anula && (
                              <button type="button" onClick={() => setAnulando(a.id)} title="Anular" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                        <td />
                        <td colSpan={8} className="px-3 py-3 text-sm text-gray-700">
                          <p className="whitespace-pre-wrap">{a.descripcion || "Sin descripción."}</p>
                          <p className="mt-2 text-xs text-gray-500">
                            {[
                              a.empresaUsuaria && `Empresa usuaria: ${a.empresaUsuaria}`,
                              a.ciudad && `Ciudad: ${a.ciudad}`,
                              a.sexo && `Sexo: ${a.sexo}`,
                              a.fechaNotificacion && `Notificado a la ARL: ${fechaCorta(a.fechaNotificacion)}`,
                              `Investigación: ${a.estadoInvestigacion ? etiquetaEstadoInvestigacion(a.estadoInvestigacion) : "sin registrar"}`,
                              `Cierre administrativo ARL: ${siNo(a.cierreAdministrativoArl)}`,
                            ].filter(Boolean).join(" · ")}
                          </p>
                          {a.observaciones && <p className="mt-1 text-xs text-gray-600">Observaciones: {a.observaciones}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {accidentes.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay accidentes de trabajo con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador p={p} unidad="accidentes" ancla={ancla} />
      </div>
    </div>
  );
}

// ── Caracterización ──────────────────────────────────────────────────────────

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] leading-tight text-gray-500">{detalle}</p>}
    </div>
  );
}

function Panel({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#E2E8F0] bg-white p-4 ${className}`}>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{titulo}</h3>
      {children}
    </section>
  );
}

/** Tabla de conteos con su total, como las del Excel (sirve también de vista accesible del gráfico). */
function TablaConteo({ datos, total }: { datos: Conteo[]; total: number }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Ver tabla</summary>
      <table className="mt-1 w-full">
        <tbody>
          {datos.map((d) => (
            <tr key={d.key} className="border-b border-[#F1F5F9]">
              <td className="py-1 pr-2 text-gray-700">{d.label}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-gray-900">{d.n}</td>
              <td className="py-1 text-right tabular-nums text-gray-500">{d.pct}%</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1 pr-2">Total</td>
            <td className="py-1 pr-2 text-right tabular-nums">{total}</td>
            <td className="py-1 text-right tabular-nums">{total ? "100%" : "—"}</td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}

function CaracterizacionVista({ c, textoFiltro }: { c: Caracterizacion; textoFiltro: string }) {
  if (c.total === 0) {
    return <p className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-500">No hay accidentes de trabajo con estos filtros.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Caracterización de la accidentalidad · {textoFiltro}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra titulo="Accidentes de trabajo" valor={String(c.total)} detalle={`${c.trabajadores} trabajador${c.trabajadores === 1 ? "" : "es"}`} />
        <Cifra titulo="Días de incapacidad" valor={c.diasIncapacidad.toLocaleString("es-CO")} detalle={`${c.promedioDias} por accidente`} />
        <Cifra titulo="De tránsito" valor={String(c.transito)} detalle={`${c.total ? Math.round((c.transito * 100) / c.total) : 0}% de los accidentes`} />
        <Cifra titulo="Más de un accidente" valor={String(c.repetidos.length)} detalle={c.repetidos.length ? c.repetidos.map((r) => `${r.nombre} (${r.n})`).join(", ") : "ningún trabajador repite"} />
        <Cifra titulo="Por sexo" valor={c.porSexo.map((s) => `${s.n}`).join(" / ")} detalle={c.porSexo.map((s) => s.label).join(" / ")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Partes del cuerpo afectadas">
          <FiguraCuerpo datos={c.porParteCuerpo} />
          <TablaConteo datos={c.porParteCuerpo} total={c.total} />
        </Panel>
        <div className="space-y-4">
          <Panel titulo="Accidentalidad por mes">
            <ColumnasConteo datos={c.porMes} />
            <TablaConteo datos={c.porMes} total={c.total} />
          </Panel>
          <Panel titulo="Día de ocurrencia">
            <ColumnasConteo datos={c.porDia} alto={190} />
            <TablaConteo datos={c.porDia} total={c.total} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Tipo de lesiones más frecuentes">
          <BarrasConteo datos={c.porTipoLesion} />
          <TablaConteo datos={c.porTipoLesion} total={c.total} />
        </Panel>
        <Panel titulo="Mecanismo del accidente">
          <BarrasConteo datos={c.porMecanismo} anchoEtiqueta={240} />
          <TablaConteo datos={c.porMecanismo} total={c.total} />
        </Panel>
        <Panel titulo="Agente del accidente">
          <BarrasConteo datos={c.porAgente} />
          <TablaConteo datos={c.porAgente} total={c.total} />
        </Panel>
        <Panel titulo="Cargo del trabajador">
          <BarrasConteo datos={c.porCargo} />
          <TablaConteo datos={c.porCargo} total={c.total} />
        </Panel>
      </div>
    </div>
  );
}
