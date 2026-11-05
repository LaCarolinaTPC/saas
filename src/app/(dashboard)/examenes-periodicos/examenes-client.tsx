"use client";

/**
 * Exámenes periódicos (SST): filtros comunes y dos vistas — el control por
 * persona (semáforo del próximo examen, como las hojas de control del Excel) y
 * las atenciones (cada examen con su entrega y recomendaciones, como las hojas
 * mensuales). Todo se filtra aquí: son unos cientos de personas.
 */

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, ClipboardList, ListChecks, Pencil, Plus, Search, Trash2, UserPlus, UserRoundCog, X } from "lucide-react";
import { usePermisos } from "@/components/permisos/permisos-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { descargarCsv } from "@/lib/exportar/csv";
import type { OpcionTrabajador } from "@/lib/sst/data";
import {
  ESTADOS_EXAMEN, GRUPOS_EXAMEN, POR_VENCER_DIAS, armarControl, etiquetaEstado, etiquetaGrupo, ordenarControl, resumirControl, textoDias,
  type EstadoExamen, type ExamenPeriodico, type FilaControl, type PersonaExamen,
} from "@/lib/sst/examenes";
import { anularExamen } from "./actions";
import { ExamenDialog, type ExamenInicial } from "./examen-dialog";
import { PersonaDialog } from "./persona-dialog";

const inputCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const fechaCorta = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const COLOR_ESTADO: Record<EstadoExamen, string> = {
  vencido: "bg-[#FEE2E2] text-[#991B1B]",
  por_vencer: "bg-[#FEF3C7] text-[#92400E]",
  sin_examen: "bg-[#F1F5F9] text-[#475569]",
  vigente: "bg-[#DCFCE7] text-[#166534]",
};

type Filtros = { grupo: string; estado: string; anio: string; q: string; inactivos: boolean };
const VACIOS: Filtros = { grupo: "", estado: "", anio: "", q: "", inactivos: false };

type Dialogo =
  | { tipo: "examen"; inicial: ExamenInicial }
  | { tipo: "persona"; persona: PersonaExamen | null }
  | null;

export function ExamenesClient({ tabInicial, personas, examenes, trabajadores, retiradosMaestro, hoy }: {
  tabInicial: string;
  personas: PersonaExamen[];
  examenes: ExamenPeriodico[];
  trabajadores: OpcionTrabajador[];
  retiradosMaestro: string[];
  hoy: string;
}) {
  const [tab, setTab] = useState(tabInicial);
  const [f, setF] = useState<Filtros>(VACIOS);
  const set = (k: keyof Filtros) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const puede = usePermisos();
  const crea = puede("examenes_periodicos.crear");
  const edita = puede("examenes_periodicos.editar");

  const control = useMemo(() => ordenarControl(armarControl(personas, examenes, hoy)), [personas, examenes, hoy]);
  const porCedula = useMemo(() => new Map(personas.map((p) => [p.cedula, p])), [personas]);
  const retirados = useMemo(() => new Set(retiradosMaestro), [retiradosMaestro]);
  const anios = useMemo(() => [...new Set(examenes.map((e) => e.fechaAtencion.slice(0, 4)))].sort().reverse(), [examenes]);

  const q = sinAcentos(f.q.trim());
  const coincide = (texto: string) => !q || sinAcentos(texto).includes(q);
  const filasControl = useMemo(
    () =>
      control.filter(
        (c) =>
          (f.inactivos || c.persona.activo) &&
          (!f.grupo || c.persona.grupo === f.grupo) &&
          (!f.estado || (c.persona.activo && c.estado === f.estado)) &&
          coincide(`${c.persona.nombre} ${c.persona.cedula} ${c.persona.cargo ?? ""}`)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [control, f]
  );
  const filasAtenciones = useMemo(
    () =>
      examenes
        .filter((e) => {
          const p = porCedula.get(e.cedula);
          return (
            (!f.anio || e.fechaAtencion.startsWith(f.anio)) &&
            (!f.grupo || p?.grupo === f.grupo) &&
            coincide(`${e.nombre} ${e.cedula} ${e.cargo ?? ""} ${e.recomendaciones ?? ""}`)
          );
        })
        .sort((a, b) => b.fechaAtencion.localeCompare(a.fechaAtencion) || a.nombre.localeCompare(b.nombre)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examenes, porCedula, f]
  );
  const resumen = useMemo(() => resumirControl(control.filter((c) => !f.grupo || c.persona.grupo === f.grupo), hoy), [control, f.grupo, hoy]);
  const hayFiltro = Boolean(f.grupo || f.estado || f.anio || f.q || f.inactivos);
  const textoFiltro = [
    f.grupo ? etiquetaGrupo(f.grupo) : "Todos los grupos",
    f.estado && etiquetaEstado(f.estado),
    f.anio && tab === "atenciones" && `Año ${f.anio}`,
    f.inactivos && "con quienes salieron del control",
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
  const select = (k: "grupo" | "estado" | "anio", opciones: readonly { key: string; label: string }[], todos = "Todos") => (
    <select className={inputCls} value={f[k]} onChange={(e) => set(k)(e.target.value)}>
      <option value="">{todos}</option>
      {opciones.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const nuevoExamenDe = (p: PersonaExamen | null): ExamenInicial => ({ examen: null, persona: p });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        {campo("Grupo", select("grupo", GRUPOS_EXAMEN))}
        {tab === "control"
          ? campo("Estado", select("estado", ESTADOS_EXAMEN))
          : campo("Año de atención", select("anio", anios.map((a) => ({ key: a, label: a }))))}
        {campo(
          "Buscar",
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputCls} w-56 pl-8`} value={f.q} placeholder="Nombre, cédula o cargo" onChange={(e) => set("q")(e.target.value)} />
          </div>
        )}
        {tab === "control" && (
          <label className="flex h-9 items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={f.inactivos} onChange={(e) => set("inactivos")(e.target.checked)} className="h-4 w-4 rounded border-[#CBD5E1]" />
            Incluir retirados
          </label>
        )}
        {hayFiltro && (
          <button type="button" onClick={() => setF(VACIOS)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
            <X className="h-4 w-4" /> Limpiar
          </button>
        )}
        {crea && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setDialogo({ tipo: "persona", persona: null })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <UserPlus className="h-4 w-4" /> Agregar al control
            </button>
            <button
              type="button"
              onClick={() => setDialogo({ tipo: "examen", inicial: nuevoExamenDe(null) })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              <Plus className="h-4 w-4" /> Registrar examen
            </button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => cambiarTab(String(v))}>
        <TabsList className="mb-4 h-10">
          <TabsTrigger value="control" className="px-4">
            <ListChecks /> Control
          </TabsTrigger>
          <TabsTrigger value="atenciones" className="px-4">
            <ClipboardList /> Atenciones
          </TabsTrigger>
        </TabsList>
        <TabsContent value="control">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Cifra titulo="En control" valor={resumen.activos} detalle={`${resumen.atendidosAnio} examen${resumen.atendidosAnio === 1 ? "" : "es"} en ${hoy.slice(0, 4)}`} />
            <Cifra titulo="Vencidos" valor={resumen.vencido} tono="text-[#B91C1C]" activo={f.estado === "vencido"} onClick={() => set("estado")(f.estado === "vencido" ? "" : "vencido")} />
            <Cifra titulo="Por vencer" valor={resumen.por_vencer} detalle={`en ${POR_VENCER_DIAS} días o menos`} tono="text-[#B45309]" activo={f.estado === "por_vencer"} onClick={() => set("estado")(f.estado === "por_vencer" ? "" : "por_vencer")} />
            <Cifra titulo="Sin examen" valor={resumen.sin_examen} activo={f.estado === "sin_examen"} onClick={() => set("estado")(f.estado === "sin_examen" ? "" : "sin_examen")} />
            <Cifra titulo="Vigentes" valor={resumen.vigente} tono="text-[#15803D]" activo={f.estado === "vigente"} onClick={() => set("estado")(f.estado === "vigente" ? "" : "vigente")} />
          </div>
          <Control
            filas={filasControl}
            textoFiltro={textoFiltro}
            retirados={retirados}
            onRegistrar={crea ? (p) => setDialogo({ tipo: "examen", inicial: nuevoExamenDe(p) }) : null}
            onEditarPersona={edita ? (p) => setDialogo({ tipo: "persona", persona: p }) : null}
            onEditarExamen={edita ? (e) => setDialogo({ tipo: "examen", inicial: { examen: e, persona: porCedula.get(e.cedula) ?? null } }) : null}
          />
        </TabsContent>
        <TabsContent value="atenciones">
          <Atenciones
            examenes={filasAtenciones}
            porCedula={porCedula}
            textoFiltro={textoFiltro}
            onEditar={edita ? (e) => setDialogo({ tipo: "examen", inicial: { examen: e, persona: porCedula.get(e.cedula) ?? null } }) : null}
          />
        </TabsContent>
      </Tabs>

      {dialogo?.tipo === "examen" && (
        <ExamenDialog inicial={dialogo.inicial} personas={porCedula} trabajadores={trabajadores} hoy={hoy} onClose={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === "persona" && <PersonaDialog persona={dialogo.persona} personas={porCedula} trabajadores={trabajadores} hoy={hoy} onClose={() => setDialogo(null)} />}
    </div>
  );
}

function Cifra({ titulo, valor, detalle, tono = "text-gray-900", activo = false, onClick }: {
  titulo: string;
  valor: number;
  detalle?: string;
  tono?: string;
  activo?: boolean;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tono}`}>{valor.toLocaleString("es-CO")}</p>
      {detalle && <p className="mt-0.5 text-[11px] leading-tight text-gray-500">{detalle}</p>}
    </>
  );
  const cls = `rounded-xl border bg-white p-4 text-left ${activo ? "border-[#4F46E5] ring-1 ring-[#4F46E5]" : "border-[#E2E8F0]"}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={activo} title="Filtrar por este estado" className={`${cls} hover:border-[#C7D2FE]`}>
      {contenido}
    </button>
  ) : (
    <div className={cls}>{contenido}</div>
  );
}

function BadgeEstado({ fila }: { fila: FilaControl }) {
  if (!fila.persona.activo) {
    return <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-semibold text-gray-500">Fuera del control</span>;
  }
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_ESTADO[fila.estado]}`}>
      {fila.estado === "sin_examen" ? "Sin examen" : textoDias(fila.dias)}
    </span>
  );
}

// ── Control ──────────────────────────────────────────────────────────────────

const CABECERA_CONTROL = [
  "Cédula", "Nombre", "Cargo", "Grupo", "Fecha de ingreso", "Último examen", "Entrega", "Periodicidad (meses)",
  "Próximo examen", "Próximo contado desde", "Días restantes", "Alerta", "Exámenes registrados", "En control",
];

function filaControlExport(c: FilaControl): (string | number)[] {
  return [
    c.persona.cedula, c.persona.nombre, c.persona.cargo ?? "", etiquetaGrupo(c.persona.grupo), c.persona.fechaIngreso ?? "",
    c.ultimo?.fechaAtencion ?? "", c.ultimo?.fechaEntrega ?? "", c.ultimo?.periodicidadMeses ?? c.persona.periodicidadMeses, c.proximo ?? "",
    c.base === "ingreso" ? "Fecha de ingreso" : c.base === "examen" ? "Último examen" : "",
    c.dias ?? "", c.persona.activo ? (c.estado === "sin_examen" ? "Sin examen" : textoDias(c.dias)) : "Fuera del control",
    c.examenes.length, c.persona.activo ? "Sí" : `No (${c.persona.motivoInactivo ?? "—"})`,
  ];
}

function Control({ filas, textoFiltro, retirados, onRegistrar, onEditarPersona, onEditarExamen }: {
  filas: FilaControl[];
  textoFiltro: string;
  retirados: Set<string>;
  onRegistrar: ((p: PersonaExamen) => void) | null;
  onEditarPersona: ((p: PersonaExamen) => void) | null;
  onEditarExamen: ((e: ExamenPeriodico) => void) | null;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const p = usePaginacion(filas, { reiniciar: filas.length });
  const ancla = useRef<HTMLDivElement>(null);
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
          <strong className="text-gray-900">{filas.length}</strong> persona{filas.length === 1 ? "" : "s"} · {textoFiltro}
        </p>
        <BotonesExportar
          formatos={["xlsx", "csv"]}
          sinDatos={filas.length === 0}
          onExportar={async (formato) => {
            const datos = filas.map(filaControlExport);
            if (formato === "csv") return descargarCsv("control_examenes_periodicos.csv", [CABECERA_CONTROL, ...datos]);
            const XLSX = await import("xlsx");
            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[`Control de exámenes periódicos · ${textoFiltro}`], CABECERA_CONTROL, ...datos]), "Control");
            XLSX.writeFile(libro, "control_examenes_periodicos.xlsx");
          }}
        />
      </div>
      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Grupo</th>
                <th className="px-3 py-2">Último examen</th>
                <th className="px-3 py-2">Próximo examen</th>
                <th className="px-3 py-2">Alerta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {p.filas.map((c) => {
                const abierto = abiertos.has(c.persona.cedula);
                return (
                  <Fragment key={c.persona.cedula}>
                    <tr className={`border-b border-[#F1F5F9] align-top ${c.persona.activo ? "" : "opacity-60"}`}>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => alternar(c.persona.cedula)} aria-expanded={abierto} title={abierto ? "Ocultar historial" : "Ver historial de exámenes"} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{c.persona.nombre}</p>
                        <p className="text-xs text-gray-500">
                          CC {c.persona.cedula}
                          {c.persona.cargo ? ` · ${c.persona.cargo}` : ""}
                        </p>
                        {c.persona.activo && retirados.has(c.persona.cedula) && (
                          <p className="mt-0.5 text-[11px] font-medium text-[#B45309]" title="GEMA o el maestro de empleados lo dan por retirado: sáquelo del control si ya no trabaja">
                            Retirado en el maestro
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{etiquetaGrupo(c.persona.grupo)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {c.ultimo ? fechaCorta(c.ultimo.fechaAtencion) : <span className="text-xs text-gray-500">Ninguno</span>}
                        <p className="text-xs text-gray-500">cada {c.ultimo?.periodicidadMeses ?? c.persona.periodicidadMeses} meses</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {fechaCorta(c.proximo)}
                        {c.base === "ingreso" && (
                          <p className="text-xs text-gray-500" title="Sin exámenes periódicos: el examen de ingreso cuenta como el primero">
                            desde el ingreso ({fechaCorta(c.persona.fechaIngreso)})
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <BadgeEstado fila={c} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="inline-flex gap-1">
                          {onRegistrar && c.persona.activo && (
                            <button type="button" onClick={() => onRegistrar(c.persona)} title="Registrar examen" className="rounded p-1.5 text-[#4F46E5] hover:bg-[#EEF2FF]">
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                          {onEditarPersona && (
                            <button type="button" onClick={() => onEditarPersona(c.persona)} title="Editar persona (grupo, cargo, salida del control)" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                              <UserRoundCog className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                        <td />
                        <td colSpan={6} className="px-3 py-3">
                          {!c.persona.activo && (
                            <p className="mb-2 text-xs text-gray-600">
                              Fuera del control desde {fechaCorta(c.persona.inactivoDesde)} ({c.persona.motivoInactivo === "retirado" ? "retirado" : "otro motivo"}).
                            </p>
                          )}
                          {c.persona.observaciones && <p className="mb-2 text-xs text-gray-600">Observaciones: {c.persona.observaciones}</p>}
                          {c.examenes.length === 0 ? (
                            <p className="text-sm text-gray-500">No tiene exámenes registrados.</p>
                          ) : (
                            <HistorialExamenes examenes={c.examenes} onEditar={onEditarExamen} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay personas con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador p={p} unidad="personas" ancla={ancla} />
      </div>
    </div>
  );
}

function HistorialExamenes({ examenes, onEditar }: { examenes: ExamenPeriodico[]; onEditar: ((e: ExamenPeriodico) => void) | null }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left uppercase tracking-wide text-gray-500">
          <th className="py-1 pr-3">Atención</th>
          <th className="py-1 pr-3">Entrega</th>
          <th className="py-1 pr-3">Próximo</th>
          <th className="py-1 pr-3">Recomendaciones</th>
          <th className="py-1" />
        </tr>
      </thead>
      <tbody>
        {examenes.map((e) => (
          <tr key={e.id} className="border-t border-[#E2E8F0] align-top">
            <td className="whitespace-nowrap py-1.5 pr-3 text-gray-800">
              {fechaCorta(e.fechaAtencion)}
              {e.origen === "historico" && <span className="ml-1 rounded-full bg-[#E2E8F0] px-1.5 text-[10px] font-semibold text-gray-600" title="Cargado del Excel de SST">Histórico</span>}
            </td>
            <td className="whitespace-nowrap py-1.5 pr-3 text-gray-700">{fechaCorta(e.fechaEntrega)}</td>
            <td className="whitespace-nowrap py-1.5 pr-3 text-gray-700">
              {fechaCorta(e.proximoExamen)} <span className="text-gray-400">({e.periodicidadMeses} m)</span>
            </td>
            <td className="py-1.5 pr-3 text-gray-700">
              <p className="whitespace-pre-wrap">{e.recomendaciones || "—"}</p>
              {e.observaciones && <p className="mt-0.5 text-gray-500">Obs.: {e.observaciones}</p>}
            </td>
            <td className="py-1.5 text-right">
              <AccionesExamen examen={e} onEditar={onEditar} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Editar y anular (con motivo) un examen. */
function AccionesExamen({ examen, onEditar }: { examen: ExamenPeriodico; onEditar: ((e: ExamenPeriodico) => void) | null }) {
  const anula = usePermisos()("examenes_periodicos.anular");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");

  function anular() {
    start(async () => {
      const r = await anularExamen(examen.id, motivo);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Examen anulado; queda como rastro.");
      setAnulando(false);
      setMotivo("");
      router.refresh();
    });
  }

  if (anulando) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          className={`${inputCls} h-8 w-44 text-xs`}
          placeholder="Motivo de la anulación"
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && anular()}
        />
        <button type="button" disabled={pending} onClick={anular} title="Anular" className="rounded p-1.5 text-red-600 hover:bg-red-50">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { setAnulando(false); setMotivo(""); }} title="Cancelar" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex gap-1">
      {onEditar && (
        <button type="button" onClick={() => onEditar(examen)} title="Editar examen" className="rounded p-1.5 text-[#4F46E5] hover:bg-[#EEF2FF]">
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {anula && (
        <button type="button" onClick={() => setAnulando(true)} title="Anular examen" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

// ── Atenciones ───────────────────────────────────────────────────────────────

const CABECERA_ATENCIONES = [
  "Fecha de atención", "Cédula", "Nombre", "Cargo", "Grupo", "Fecha de entrega", "Periodicidad (meses)", "Próximo examen",
  "Recomendaciones", "Observaciones", "Origen",
];

function Atenciones({ examenes, porCedula, textoFiltro, onEditar }: {
  examenes: ExamenPeriodico[];
  porCedula: Map<string, PersonaExamen>;
  textoFiltro: string;
  onEditar: ((e: ExamenPeriodico) => void) | null;
}) {
  const p = usePaginacion(examenes, { reiniciar: examenes.length });
  const ancla = useRef<HTMLDivElement>(null);
  const grupoDe = (e: ExamenPeriodico) => {
    const g = porCedula.get(e.cedula)?.grupo;
    return g ? etiquetaGrupo(g) : "";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">{examenes.length}</strong> examen{examenes.length === 1 ? "" : "es"} · {textoFiltro}
        </p>
        <BotonesExportar
          formatos={["xlsx", "csv"]}
          sinDatos={examenes.length === 0}
          onExportar={async (formato) => {
            const datos = examenes.map((e) => [
              e.fechaAtencion, e.cedula, e.nombre, e.cargo ?? "", grupoDe(e), e.fechaEntrega ?? "", e.periodicidadMeses, e.proximoExamen,
              e.recomendaciones ?? "", e.observaciones ?? "", e.origen === "historico" ? "Histórico (Excel)" : "Gestivo",
            ]);
            if (formato === "csv") return descargarCsv("atenciones_examenes_periodicos.csv", [CABECERA_ATENCIONES, ...datos]);
            const XLSX = await import("xlsx");
            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[`Exámenes periódicos · ${textoFiltro}`], CABECERA_ATENCIONES, ...datos]), "Atenciones");
            XLSX.writeFile(libro, "atenciones_examenes_periodicos.xlsx");
          }}
        />
      </div>
      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Atención</th>
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Entrega</th>
                <th className="px-3 py-2">Próximo</th>
                <th className="px-3 py-2">Recomendaciones</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {p.filas.map((e) => (
                <tr key={e.id} className="border-b border-[#F1F5F9] align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    {fechaCorta(e.fechaAtencion)}
                    {e.origen === "historico" && (
                      <span className="ml-1.5 rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[11px] font-semibold text-gray-600" title="Cargado del Excel de SST">
                        Histórico
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{e.nombre}</p>
                    <p className="text-xs text-gray-500">
                      CC {e.cedula}
                      {e.cargo ? ` · ${e.cargo}` : ""}
                      {grupoDe(e) ? ` · ${grupoDe(e)}` : ""}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{e.fechaEntrega ? fechaCorta(e.fechaEntrega) : <span className="text-xs text-[#B45309]">Pendiente</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {fechaCorta(e.proximoExamen)}
                    <p className="text-xs text-gray-500">{e.periodicidadMeses} meses</p>
                  </td>
                  <td className="max-w-md px-3 py-2 text-xs text-gray-700">
                    <p className="line-clamp-3 whitespace-pre-wrap" title={e.recomendaciones ?? undefined}>{e.recomendaciones || "—"}</p>
                    {e.observaciones && <p className="mt-0.5 text-gray-500">Obs.: {e.observaciones}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <AccionesExamen examen={e} onEditar={onEditar} />
                  </td>
                </tr>
              ))}
              {examenes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    No hay exámenes con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador p={p} unidad="exámenes" ancla={ancla} />
      </div>
    </div>
  );
}
