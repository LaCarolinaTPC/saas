"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, X, Check, Loader2, TriangleAlert, FileSpreadsheet, ClipboardList,
  Pencil, Download, History, Trash2, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Catalogos, CatalogoItem, MatrizFila, ResumenMatriz, ParesProfesionalIps,
} from "@/lib/ausentismo/matriz";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import {
  INDICADORES_PRORROGA, TIPOS_CONDUCTOR, ORIGENES_ARL, ORIGENES_SOAT, ESTADOS_REGISTRO,
  REVISION_LABEL, CIE10_RE, SEGMENTOS_COBRO,
  fechaAAMMDD, diasEntre, mesDe, diaDe, clave, normalizarCie10, diasMinimosCobro, esSegmentoCobro,
} from "@/lib/ausentismo/matriz-reglas";
import { exportarInformeCobro, resumirCobro } from "@/lib/ausentismo/cobro";
import type { FormatoExport } from "@/lib/exportar/formatos";
import {
  registrarIncapacidad, editarIncapacidad, eliminarIncapacidad, restaurarIncapacidad,
  buscarEmpleado, crearCatalogo,
  type EmpleadoMaestro, type TipoCreable, type MatrizResultado,
} from "./actions";

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] disabled:bg-[#F8FAFC] disabled:text-gray-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

/** Valor del selector que abre el bloque de alta de una entidad. */
const OPCION_NUEVA = "__nueva__";

/** Etiqueta de una opción del catálogo; lo creado desde el formulario va marcado. */
function etiquetaCatalogo(c: CatalogoItem) {
  return c.verificado ? c.nombre : `${c.nombre} (por verificar)`;
}

/** Busca en una lista del catálogo por nombre, sin tildes ni mayúsculas. */
function buscarPorNombre(items: CatalogoItem[], nombre: string) {
  const k = clave(nombre);
  return k ? items.find((c) => clave(c.nombre) === k) ?? null : null;
}

export interface FiltrosMatrizUI {
  desde: string;
  hasta: string;
  eps: string;
  origen: string;
  estado: string;
  revision: boolean;
  q: string;
  /** Ver solo las incapacidades eliminadas (para restaurar una borrada por error). */
  eliminadas: boolean;
  /** Segmento de cobro: "" | eps | arl. */
  cobro: string;
  /** Días mínimos de incapacidad (texto del input; vacío = umbral del segmento). */
  diasMin: string;
}

function paramsDe(f: FiltrosMatrizUI): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.desde) sp.set("desde", f.desde);
  if (f.hasta) sp.set("hasta", f.hasta);
  if (f.eps) sp.set("eps", f.eps);
  if (f.origen) sp.set("origen", f.origen);
  if (f.estado) sp.set("estado", f.estado);
  if (f.revision) sp.set("rev", "1");
  if (f.q) sp.set("q", f.q);
  if (f.eliminadas) sp.set("elim", "1");
  if (f.cobro) sp.set("cobro", f.cobro);
  if (f.diasMin) sp.set("dmin", f.diasMin);
  return sp;
}

export function MatrizClient({
  hoy, filtros, filas, catalogos, resumen, pares, puedeEditar,
}: {
  hoy: string;
  filtros: FiltrosMatrizUI;
  filas: MatrizFila[];
  catalogos: Catalogos;
  resumen: ResumenMatriz;
  pares: ParesProfesionalIps;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<MatrizFila | null>(null);
  const [eliminando, setEliminando] = useState<MatrizFila | null>(null);
  const [restaurando, startRestaurar] = useTransition();
  // Valores del catálogo creados en esta sesión: se ven de inmediato y, cuando
  // el servidor los devuelve tras el refresh, se descartan del extra.
  const [extras, setExtras] = useState<CatalogoItem[]>([]);
  const cat = useMemo<Catalogos>(() => {
    const out = { ...catalogos };
    for (const e of extras) {
      const lista = out[e.tipo] ?? [];
      if (!lista.some((x) => x.id === e.id)) out[e.tipo] = [e, ...lista];
    }
    return out;
  }, [catalogos, extras]);
  function onCreado(item: CatalogoItem) {
    setExtras((p) => (p.some((x) => x.id === item.id) ? p : [...p, item]));
  }

  function irA(f: Partial<FiltrosMatrizUI>) {
    const sp = paramsDe({ ...filtros, ...f });
    sp.set("tab", "matriz");
    router.push(`/ausentismo?${sp.toString()}`);
  }

  function cerrarPaneles() {
    setMostrarForm(false);
    setEditando(null);
    setEliminando(null);
  }

  function restaurar(r: MatrizFila) {
    if (!window.confirm(`¿Restaurar la incapacidad de ${r.nombre ?? r.cedula} (${fechaAAMMDD(r.fecha_inicio)})? Vuelve a la matriz tal como estaba.`)) return;
    startRestaurar(async () => {
      const res = await restaurarIncapacidad({ id: r.id });
      if (res.success) {
        toast.success("Incapacidad restaurada (quedó en la auditoría).");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo restaurar");
      }
    });
  }

  const origenLabel = useMemo(
    () => Object.fromEntries(cat.ORIGEN.map((o) => [o.codigo ?? "", o.nombre])),
    [cat.ORIGEN]
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Chip label="Incapacidades" valor={resumen.total} />
          <Chip
            label="Pendientes de diagnóstico"
            valor={resumen.pendientes}
            tono={resumen.pendientes > 0 ? "amber" : "gris"}
            onClick={() => irA({ estado: "pendiente" })}
          />
          <Chip
            label="En revisión"
            valor={resumen.enRevision}
            tono={resumen.enRevision > 0 ? "rojo" : "gris"}
            onClick={() => irA({ revision: true })}
          />
          <Chip label="Capturadas en el formulario" valor={resumen.formulario} />
          <Chip
            label={filtros.eliminadas ? "Viendo eliminadas · volver" : "Eliminadas"}
            valor={resumen.eliminadas}
            tono={filtros.eliminadas ? "rojo" : "gris"}
            onClick={() => irA({ eliminadas: !filtros.eliminadas })}
          />
        </div>
        {puedeEditar && (
          <button
            onClick={() => {
              const abrir = !mostrarForm;
              cerrarPaneles();
              setMostrarForm(abrir);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
          >
            {mostrarForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mostrarForm ? "Cancelar" : "Nueva incapacidad"}
          </button>
        )}
      </div>

      {mostrarForm && (
        <IncapacidadForm
          hoy={hoy}
          catalogos={cat}
          pares={pares}
          registro={null}
          onCreado={onCreado}
          onDone={() => {
            cerrarPaneles();
            router.refresh();
          }}
        />
      )}

      {editando && (
        <IncapacidadForm
          key={editando.id}
          hoy={hoy}
          catalogos={cat}
          pares={pares}
          registro={editando}
          onCreado={onCreado}
          onDone={() => {
            cerrarPaneles();
            router.refresh();
          }}
        />
      )}

      {eliminando && (
        <EliminarForm
          key={eliminando.id}
          fila={eliminando}
          onDone={() => {
            cerrarPaneles();
            router.refresh();
          }}
          onCancel={() => setEliminando(null)}
        />
      )}

      <FiltrosMatriz filtros={filtros} hoy={hoy} catalogos={cat} onAplicar={irA} />

      {(filtros.cobro || filtros.diasMin) && !filtros.eliminadas && (
        <BarraCobro filtros={filtros} filas={filas} />
      )}

      {filtros.eliminadas && (
        <p className="flex items-center gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]">
          <Trash2 className="h-3.5 w-3.5" />
          Estás viendo las incapacidades eliminadas del rango. No cuentan en la matriz, los indicadores ni
          las exportaciones. Puedes restaurar la que se haya eliminado por error.
        </p>
      )}

      <TablaMatriz
        filas={filas}
        origenLabel={origenLabel}
        puedeEditar={puedeEditar}
        ocupado={restaurando}
        onEditar={(r) => {
          cerrarPaneles();
          setEditando(r);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onEliminar={(r) => {
          cerrarPaneles();
          setEliminando(r);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onRestaurar={restaurar}
      />
    </>
  );
}

/** Eliminación lógica con motivo obligatorio; queda en la bitácora y en la auditoría. */
function EliminarForm({
  fila, onDone, onCancel,
}: {
  fila: MatrizFila;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!motivo.trim()) {
      toast.error("Indica el motivo de la eliminación.");
      return;
    }
    start(async () => {
      const res = await eliminarIncapacidad({ id: fila.id, motivo: motivo.trim() });
      if (res.success) {
        toast.success(`Incapacidad eliminada: ${fila.nombre ?? fila.cedula}. Se puede restaurar desde "Eliminadas".`);
        onDone();
      } else {
        toast.error(res.error ?? "No se pudo eliminar");
      }
    });
  }

  return (
    <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2]/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Trash2 className="h-4 w-4 text-[#DC2626]" /> Eliminar incapacidad · {fila.nombre ?? fila.cedula}
          </h2>
          <p className="text-xs text-gray-500">
            CC {fila.cedula} · {fila.origen ?? "—"} · {fechaAAMMDD(fila.fecha_inicio)} → {fechaAAMMDD(fila.fecha_fin)} ·{" "}
            {fila.dias_it_pagados ?? "—"} día(s) · {fila.arl ?? fila.eps ?? "sin pagador"}
            {fila.cie10 ? ` · ${fila.cie10}` : ""}
          </p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <label className={labelCls}>
        Motivo de la eliminación <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={motivo}
        maxLength={200}
        autoFocus
        onChange={(e) => setMotivo(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Ej. registro duplicado · empleado equivocado · incapacidad anulada por la EPS"
        className={inputCls}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          La fila sale de la matriz, los indicadores y las exportaciones, y la carga del Excel no la vuelve a
          traer. Queda quién la eliminó y por qué; se puede restaurar.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={pending || !motivo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({
  label, valor, tono = "gris", onClick,
}: {
  label: string;
  valor: number;
  tono?: "gris" | "amber" | "rojo";
  onClick?: () => void;
}) {
  const color =
    tono === "amber"
      ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
      : tono === "rojo"
        ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
        : "border-[#E2E8F0] bg-white text-gray-600";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${color} ${onClick ? "hover:opacity-80" : ""}`}
    >
      {label} <strong>{valor.toLocaleString("es-CO")}</strong>
    </Tag>
  );
}

function FiltrosMatriz({
  filtros, hoy, catalogos, onAplicar,
}: {
  filtros: FiltrosMatrizUI;
  hoy: string;
  catalogos: Catalogos;
  onAplicar: (f: Partial<FiltrosMatrizUI>) => void;
}) {
  const [f, setF] = useState(filtros);
  const set = (k: keyof FiltrosMatrizUI, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const pagadores = [...catalogos.EPS, ...catalogos.ARL];
  // La exportación oficial lleva solo cerrados; con el filtro en "pendiente"
  // o "todos" se exporta lo que se ve.
  const exportParams = paramsDe(filtros);
  if (filtros.estado !== "cerrado") exportParams.set("todo", "1");
  const exportHref = `/api/ausentismo/matriz/export?${exportParams.toString()}`;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Inicio desde</span>
        <input type="date" value={f.desde} max={hoy} onChange={(e) => set("desde", e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hasta</span>
        <input type="date" value={f.hasta} min={f.desde} max={hoy} onChange={(e) => set("hasta", e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Pagador</span>
        <select value={f.eps} onChange={(e) => set("eps", e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {pagadores.map((c) => (
            <option key={c.id} value={c.nombre}>{c.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Origen</span>
        <select value={f.origen} onChange={(e) => set("origen", e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {catalogos.ORIGEN.map((o) => (
            <option key={o.id} value={o.codigo ?? ""}>{o.codigo} · {o.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Registro</span>
        <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {ESTADOS_REGISTRO.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </label>
      <label className="flex h-9 items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={f.revision} onChange={(e) => set("revision", e.target.checked)} />
        Solo en revisión
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Cobro</span>
        <select
          value={f.cobro}
          onChange={(e) => set("cobro", e.target.value)}
          title="Segmenta las incapacidades que se cobran al pagador"
          className={inputCls}
        >
          <option value="">Todas</option>
          {SEGMENTOS_COBRO.map((s) => (
            <option key={s.key} value={s.key} title={s.descripcion}>{s.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Días mín.</span>
        <input
          type="number"
          min={1}
          max={999}
          value={f.diasMin}
          onChange={(e) => set("diasMin", e.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(e) => e.key === "Enter" && onAplicar(f)}
          placeholder={f.cobro === "eps" ? "4" : f.cobro === "arl" ? "1" : "—"}
          title="Solo incapacidades con estos días o más. Vacío: el umbral del segmento de cobro"
          className={`${inputCls} w-20`}
        />
      </label>
      <label className="flex h-9 items-center gap-2 text-xs text-gray-600" title="Ver las incapacidades eliminadas para restaurar una borrada por error">
        <input type="checkbox" checked={f.eliminadas} onChange={(e) => set("eliminadas", e.target.checked)} />
        Eliminadas
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Empleado</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAplicar(f)}
            placeholder="Nombre o documento"
            className={`${inputCls} w-48 pl-8`}
          />
        </div>
      </label>
      <button
        onClick={() => onAplicar(f)}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
      >
        <Search className="h-4 w-4" /> Buscar
      </button>
      <a
        href={exportHref}
        title={
          filtros.estado === "cerrado"
            ? "Exporta los registros cerrados del rango, con las columnas del Excel original"
            : "Exporta lo que se ve con estos filtros, incluidos los pendientes"
        }
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]"
      >
        <Download className="h-4 w-4" /> Exportar Excel
      </a>
    </div>
  );
}

/**
 * Totales del segmento de cobro y descarga del informe (PDF, Excel, CSV) con
 * las filas que se ven, agrupadas por pagador.
 */
function BarraCobro({ filtros, filas }: { filtros: FiltrosMatrizUI; filas: MatrizFila[] }) {
  const [exportando, setExportando] = useState<FormatoExport | null>(null);
  const resumen = useMemo(() => resumirCobro(filas), [filas]);
  const segmento = SEGMENTOS_COBRO.find((s) => s.key === filtros.cobro);
  const minimo = diasMinimosCobro(
    esSegmentoCobro(filtros.cobro) ? filtros.cobro : null,
    filtros.diasMin ? Number(filtros.diasMin) : null
  );
  const esArl = filtros.cobro === "arl";

  async function exportar(formato: FormatoExport) {
    setExportando(formato);
    try {
      await exportarInformeCobro({ formato, filtros, filas });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el informe");
    } finally {
      setExportando(null);
    }
  }

  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border bg-white px-2.5 text-xs font-medium disabled:opacity-50";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${esArl ? "border-[#FDE68A] bg-[#FFFBEB]/60" : "border-[#C7D2FE] bg-[#EEF2FF]/60"}`}>
      <div className="text-xs text-gray-700">
        <p className="text-sm font-semibold text-gray-900">
          {segmento?.label ?? "Incapacidades por días"}
          {minimo != null && <span className="ml-1 font-normal text-gray-500">· {minimo} día{minimo === 1 ? "" : "s"} o más</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3">
          <span><strong>{resumen.grupos.length}</strong> pagador{resumen.grupos.length === 1 ? "" : "es"}</span>
          <span><strong>{resumen.incapacidades}</strong> incapacidad{resumen.incapacidades === 1 ? "" : "es"}</span>
          <span><strong>{resumen.dias.toLocaleString("es-CO")}</strong> días de incapacidad</span>
          <span title="ARL: todos los días. EPS: desde el día 3 de la inicial (los 2 primeros los asume el empleador) y la prórroga completa">
            <strong>{resumen.diasACargo.toLocaleString("es-CO")}</strong> días a cargo del pagador
          </span>
          {resumen.pendientes > 0 && (
            <span className="text-amber-700">
              <strong>{resumen.pendientes}</strong> pendiente{resumen.pendientes === 1 ? "" : "s"} de diagnóstico
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Informe de cobro</span>
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
            disabled={exportando !== null || filas.length === 0}
            title={`Descargar el informe de cobro en ${l}, agrupado por pagador`}
            className={`${btn} border-[#E2E8F0] text-gray-700 hover:bg-[#F8FAFC]`}
          >
            {exportando === f ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <I className="h-3.5 w-3.5" />}
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Tabla de la matriz ajustada al ancho de la pantalla: siete columnas con
 * ancho fijo en porcentaje (`table-fixed`), texto que se parte en vez de
 * desbordar y lo largo (IPS, profesional, DX) recortado con el valor completo
 * en el título. Consecutivo, origen y fechas van juntos en "Incapacidad";
 * pagador, IPS y profesional en una sola columna. Las acciones son iconos.
 */
function TablaMatriz({
  filas, origenLabel, puedeEditar, ocupado, onEditar, onEliminar, onRestaurar,
}: {
  filas: MatrizFila[];
  origenLabel: Record<string, string>;
  puedeEditar: boolean;
  /** Hay una restauración en curso: se deshabilitan las acciones. */
  ocupado: boolean;
  onEditar: (r: MatrizFila) => void;
  onEliminar: (r: MatrizFila) => void;
  onRestaurar: (r: MatrizFila) => void;
}) {
  const th = "px-2 py-2 font-medium";
  const td = "px-2 py-2 align-top text-xs text-gray-600 break-words";
  const accionCls =
    "inline-flex h-7 w-7 items-center justify-center rounded-lg border disabled:opacity-50";
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[19%]" />
          <col className="w-[16%]" />
          <col className="w-[5%]" />
          <col className="w-[18%]" />
          <col className="w-[22%]" />
          <col className={puedeEditar ? "w-[12%]" : "w-[20%]"} />
          {puedeEditar && <col className="w-[8%]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-[#F1F5F9] text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className={th}>Empleado</th>
            <th className={th}>Incapacidad</th>
            <th className={`${th} text-right`}>Días</th>
            <th className={th}>Pagador · IPS</th>
            <th className={th}>Diagnóstico</th>
            <th className={th}>Registro</th>
            {puedeEditar && <th className={`${th} text-right`}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => {
            const eliminada = !!r.eliminado_at;
            const pendiente = r.estado_registro === "pendiente";
            return (
              <tr key={r.id} className={`border-b border-[#F1F5F9] ${eliminada ? "bg-[#FEF2F2]/50" : ""}`}>
                {/* Empleado */}
                <td className={td}>
                  <p
                    className={`truncate text-sm font-medium ${eliminada ? "text-gray-500 line-through" : "text-gray-900"}`}
                    title={r.nombre ?? undefined}
                  >
                    {r.nombre ?? "—"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    CC {r.cedula}
                    {r.estado === "RETIRADO" ? " · RETIRADO" : ""}
                  </p>
                  <p className="truncate text-[11px] text-gray-400" title={`${r.cargo ?? ""}${r.tipo_conductor ? ` · ${r.tipo_conductor}` : ""}`}>
                    {r.cargo ?? "—"}
                    {r.tipo_conductor ? ` · ${r.tipo_conductor}` : ""}
                  </p>
                </td>

                {/* Incapacidad: consecutivo, tipo, origen y fechas */}
                <td className={td}>
                  <p className="text-gray-800">
                    <span className="font-medium">{r.consecutivo_incapacidad ?? "s/n"}</span>
                    <span className={`ml-1 ${r.indicador_prorroga === "PRORROGA" ? "font-medium text-amber-700" : "text-gray-400"}`}>
                      {r.indicador_prorroga === "PRORROGA" ? "Prórroga" : "Inicial"}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    <span
                      className="rounded bg-[#F1F5F9] px-1 font-medium text-gray-700"
                      title={origenLabel[r.origen ?? ""] ?? ""}
                    >
                      {r.origen ?? "—"}
                    </span>{" "}
                    {fechaAAMMDD(r.fecha_inicio)} → {fechaAAMMDD(r.fecha_fin)}
                  </p>
                  <p className="text-[11px] text-gray-400">{r.dia_ocurrencia ?? ""}</p>
                </td>

                {/* Días */}
                <td className={`${td} text-right text-sm font-semibold text-gray-700`}>
                  {r.dias_it_pagados ?? "—"}
                </td>

                {/* Pagador · IPS · profesional */}
                <td className={td}>
                  <p className="truncate font-medium text-gray-700" title={r.arl ?? r.eps ?? ""}>
                    {r.arl ?? r.eps ?? "—"}
                    {r.soat === "SI" && <span className="ml-1 font-normal text-gray-400">· SOAT</span>}
                  </p>
                  <p className="truncate" title={r.ips ?? ""}>{r.ips ?? "—"}</p>
                  <p className="truncate text-gray-400" title={r.profesional_responsable ?? ""}>
                    {r.profesional_responsable ?? ""}
                  </p>
                </td>

                {/* Diagnóstico */}
                <td className={td}>
                  {r.cie10 ? (
                    <>
                      <p className="truncate" title={`${r.cie10} · ${r.diagnostico ?? ""}`}>
                        <span className="font-medium text-gray-800">{r.cie10}</span> · {r.diagnostico ?? ""}
                      </p>
                      <p className="truncate text-gray-400" title={r.grd ?? ""}>{r.grd ?? ""}</p>
                    </>
                  ) : (
                    <span className="text-gray-400">Sin diagnóstico</span>
                  )}
                </td>

                {/* Registro */}
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-1">
                    {eliminada ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-medium text-[#B91C1C]"
                        title={`Eliminada: ${r.motivo_eliminacion ?? ""}${r.eliminado_por_email ? `\nPor: ${r.eliminado_por_email}` : ""}\n${new Date(r.eliminado_at!).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`}
                      >
                        <Trash2 className="h-3 w-3" /> Eliminada
                      </span>
                    ) : pendiente ? (
                      <span className="inline-flex rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-medium text-[#B45309]">
                        Pendiente
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[11px] font-medium text-[#059669]">
                        Cerrado
                      </span>
                    )}
                    <span
                      className="inline-flex items-center text-gray-400"
                      title={r.origen_registro === "formulario" ? "Capturada en el formulario" : "Cargada del Excel"}
                    >
                      {r.origen_registro === "formulario" ? (
                        <ClipboardList className="h-3.5 w-3.5" />
                      ) : (
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                      )}
                    </span>
                    {r.motivo_modificacion && (
                      <span
                        className="inline-flex items-center text-gray-500"
                        title={`Modificado: ${r.motivo_modificacion}${r.modificado_por_email ? `\nPor: ${r.modificado_por_email}` : ""}`}
                      >
                        <History className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {r.revision.length > 0 && (
                      <span
                        className="inline-flex items-center text-red-600"
                        title={`Revisar:\n${r.revision.map((m) => REVISION_LABEL[m] ?? m).join("\n")}`}
                      >
                        <TriangleAlert className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </td>

                {/* Acciones */}
                {puedeEditar && (
                  <td className={`${td} text-right`}>
                    <div className="inline-flex items-center gap-1">
                      {eliminada ? (
                        <button
                          onClick={() => onRestaurar(r)}
                          disabled={ocupado}
                          title="Restaurar: devolver la incapacidad a la matriz (queda en la auditoría)"
                          aria-label="Restaurar"
                          className={`${accionCls} border-[#A7F3D0] text-[#047857] hover:bg-[#ECFDF5]`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => onEditar(r)}
                            title={
                              pendiente
                                ? "Completar el diagnóstico y corregir datos, con motivo (queda en la auditoría)"
                                : "Editar con motivo (queda en la auditoría)"
                            }
                            aria-label={pendiente ? "Completar" : "Editar"}
                            className={`${accionCls} ${
                              pendiente
                                ? "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7]"
                                : "border-[#E2E8F0] text-gray-600 hover:bg-[#F8FAFC]"
                            }`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onEliminar(r)}
                            title="Eliminar con motivo (queda en la auditoría y se puede restaurar)"
                            aria-label="Eliminar"
                            className={`${accionCls} border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2]`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {filas.length === 0 && (
            <tr>
              <td colSpan={puedeEditar ? 7 : 6} className="px-4 py-8 text-center text-sm text-gray-500">
                Sin incapacidades con esos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Alta en línea de una EPS o ARL: nombre y NIT/código. */
function NuevaEntidadForm({
  tipo, onCreada, onCancelar,
}: {
  tipo: "EPS" | "ARL";
  onCreada: (item: CatalogoItem) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [creando, start] = useTransition();

  function crear() {
    if (nombre.trim().length < 3) {
      toast.error(`Escribe el nombre de la ${tipo}.`);
      return;
    }
    if (codigo.trim().length < 3) {
      toast.error(`Indica el NIT o código de la ${tipo}.`);
      return;
    }
    start(async () => {
      const res = await crearCatalogo({ tipo, nombre: nombre.trim(), codigo: codigo.trim() });
      if (!res.success || !res.item) {
        toast.error(res.error ?? "No se pudo crear");
        return;
      }
      toast.success(
        res.existente ? `Ya existía: se seleccionó "${res.item.nombre}"` : `${tipo} creada (por verificar): ${res.item.nombre}`
      );
      onCreada(res.item);
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-[#A5B4FC] bg-white p-3 md:col-span-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Nueva {tipo}</p>
        <button type="button" onClick={onCancelar} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className={labelCls}>Nombre</label>
          <input
            type="text"
            value={nombre}
            autoFocus
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
            placeholder={tipo === "EPS" ? "Ej. COMPENSAR EPS" : "Ej. ARL SURA"}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>NIT o código Supersalud</label>
          <input
            type="text"
            value={codigo}
            maxLength={20}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
            placeholder="Ej. 860066942"
            className={inputCls}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={crear}
            disabled={creando}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] px-3 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
          >
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear y usar
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Queda en el catálogo marcada &quot;por verificar&quot; hasta que un administrador la confirme. Se puede usar desde ya.
      </p>
    </div>
  );
}

/**
 * Da de alta en el catálogo lo que el usuario escribió y no existe, avisa el
 * resultado y entrega el ítem (o el equivalente que ya existía).
 */
async function crearEnCatalogo(
  tipo: TipoCreable,
  valor: string,
  relacionado: string | null | undefined,
  onCreado: (item: CatalogoItem) => void
) {
  const res = await crearCatalogo({ tipo, nombre: valor.trim(), relacionado: relacionado ?? null });
  if (!res.success || !res.item) {
    toast.error(res.error ?? "No se pudo crear");
    return;
  }
  toast.success(
    res.existente ? `Ya existía: se usa "${res.item.nombre}"` : `Creado en el catálogo (por verificar): ${res.item.nombre}`
  );
  onCreado(res.item);
}

/** Botón para crear en el catálogo el valor que el usuario escribió y no existe. */
function CrearValorBoton({
  tipo, valor, relacionado, onCreado,
}: {
  tipo: TipoCreable;
  valor: string;
  relacionado?: string | null;
  onCreado: (item: CatalogoItem) => void;
}) {
  const [creando, start] = useTransition();
  function crear() {
    start(() => crearEnCatalogo(tipo, valor, relacionado, onCreado));
  }
  return (
    <button
      type="button"
      onClick={crear}
      disabled={creando}
      className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[#4F46E5] px-2 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
    >
      {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      Crear &quot;{valor.trim()}&quot; en el catálogo
    </button>
  );
}

/**
 * Valor que trae una fila y no está en el catálogo (o está inactivo). La base
 * no lo aceptaría al guardar, así que se ofrece crearlo o elegir otro.
 */
function FueraDeCatalogo({
  tipo, valor, relacionado, onCreado, onCambiar,
}: {
  tipo: TipoCreable;
  valor: string;
  relacionado?: string | null;
  onCreado: (item: CatalogoItem) => void;
  onCambiar: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
      <p className="flex items-start gap-1">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>&quot;{valor}&quot; no está en el catálogo activo. Créalo o elige otro valor.</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <CrearValorBoton tipo={tipo} valor={valor} relacionado={relacionado} onCreado={onCreado} />
        <button
          type="button"
          onClick={onCambiar}
          className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC]"
        >
          <X className="h-3.5 w-3.5" /> Elegir otro
        </button>
      </div>
    </div>
  );
}

// ── Diagnóstico (CIE10, DX, SOAT, GRD) ───────────────────────────────────────

/** GRD que propone la letra inicial del CIE10, según la regla sembrada desde la data. */
function grdPorLetra(catalogos: Catalogos, codigo: string): string[] {
  const letra = codigo.charAt(0);
  if (!letra) return [];
  return catalogos.CIE10_LETRA
    .filter((c) => c.codigo === letra)
    .sort((a, b) => b.usos - a.usos)
    .map((c) => c.nombre);
}

/** Estado y derivaciones del bloque CIE10 / DX / SOAT / GRD, compartido por alta y edición. */
function useDiagnostico(
  inicial: { cie10: string | null; diagnostico: string | null; grd: string | null; soat: string | null } | null,
  origen: string | null,
  catalogos: Catalogos
) {
  const [cie10, setCie10Raw] = useState(inicial?.cie10 ?? "");
  const [dx, setDx] = useState(inicial?.diagnostico ?? "");
  const [dxEditado, setDxEditado] = useState(!!inicial?.diagnostico);
  const [grd, setGrd] = useState(inicial?.grd ?? "");
  const [grdEditado, setGrdEditado] = useState(!!inicial?.grd);
  const [soat, setSoat] = useState(inicial?.soat === "SI" ? "SI" : "NO");

  const codigo = normalizarCie10(cie10);
  const vacio = codigo === "";
  const formatoOk = CIE10_RE.test(codigo);
  const enCatalogo = useMemo(
    () => catalogos.CIE10.find((c) => (c.codigo ?? "").toUpperCase() === codigo) ?? null,
    [catalogos.CIE10, codigo]
  );
  const propuestasLetra = useMemo(() => grdPorLetra(catalogos, codigo), [catalogos, codigo]);
  const permiteSoat = ORIGENES_SOAT.has(origen ?? "");

  // Valores efectivos: lo del catálogo salvo que el usuario haya escrito otra cosa.
  const dxEfectivo = dxEditado ? dx : enCatalogo?.nombre ?? "";
  const grdEfectivo = grdEditado ? grd : enCatalogo?.relacionado ?? propuestasLetra[0] ?? "";
  const puedeCrearCie = formatoOk && !enCatalogo && dxEfectivo.trim().length >= 3 && !!grdEfectivo;

  function setCie10(v: string) {
    setCie10Raw(v);
    // Al cambiar el código, DX y GRD vuelven a proponerse desde el catálogo.
    if (normalizarCie10(v) !== codigo) {
      setDxEditado(false);
      setGrdEditado(false);
    }
  }

  return {
    cie10, setCie10, codigo, vacio, formatoOk, enCatalogo, propuestasLetra, permiteSoat,
    dxEfectivo, setDx: (v: string) => { setDx(v); setDxEditado(true); },
    grdEfectivo, setGrd: (v: string) => { setGrd(v); setGrdEditado(true); },
    soat: permiteSoat ? soat : "NO", setSoat,
    puedeCrearCie,
  };
}

type Diagnostico = ReturnType<typeof useDiagnostico>;

function DiagnosticoCampos({
  d, catalogos, onCreado,
}: {
  d: Diagnostico;
  catalogos: Catalogos;
  onCreado: (item: CatalogoItem) => void;
}) {
  const [creando, startCrear] = useTransition();
  const grdOpciones = useMemo(() => catalogos.GRD.filter((g) => g.activo), [catalogos.GRD]);

  function crearCie10() {
    startCrear(async () => {
      const res = await crearCatalogo({
        tipo: "CIE10",
        codigo: d.codigo,
        nombre: d.dxEfectivo.trim(),
        relacionado: d.grdEfectivo,
      });
      if (!res.success || !res.item) {
        toast.error(res.error ?? "No se pudo crear el código");
        return;
      }
      onCreado(res.item);
      toast.success(
        res.existente
          ? `El CIE10 ${d.codigo} ya existía; se usa el del catálogo.`
          : `CIE10 ${d.codigo} creado en el catálogo (por verificar).`
      );
    });
  }

  const estadoCie = d.vacio
    ? { cls: "text-gray-500", txt: "Obligatorio. Escribe el código; el catálogo propone el DX y el GRD." }
    : !d.formatoOk
      ? { cls: "text-red-600", txt: "Formato: letra, dos dígitos y opcional un carácter (M545, I10X)." }
      : d.enCatalogo
        ? { cls: "text-emerald-700", txt: `En el catálogo · ${d.enCatalogo.usos} uso(s)${d.enCatalogo.verificado ? "" : " · por verificar"}` }
        : { cls: "text-amber-700", txt: "Código nuevo: escribe el DX, elige el GRD y créalo." };

  return (
    <>
      <div>
        <label className={labelCls}>CIE10 <span className="text-red-500">*</span></label>
        <input
          type="text"
          list="matriz-cie10"
          value={d.cie10}
          onChange={(e) => d.setCie10(e.target.value)}
          placeholder="M545"
          className={`${inputCls} uppercase ${d.cie10 && !d.formatoOk ? "border-red-300" : ""}`}
        />
        <datalist id="matriz-cie10">
          {catalogos.CIE10.filter((c) => c.activo).map((c) => (
            <option key={c.id} value={c.codigo ?? ""}>{c.nombre}</option>
          ))}
        </datalist>
        <p className={`mt-1 text-[11px] ${estadoCie.cls}`}>{estadoCie.txt}</p>
        {d.formatoOk && !d.enCatalogo && (
          <button
            type="button"
            onClick={crearCie10}
            disabled={creando || !d.puedeCrearCie}
            title={d.puedeCrearCie ? "" : "Escribe el diagnóstico y elige el GRD"}
            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[#4F46E5] px-2 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
          >
            {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Crear {d.codigo} en el catálogo
          </button>
        )}
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>DX (diagnóstico)</label>
        <input
          type="text"
          value={d.dxEfectivo}
          disabled={d.vacio}
          onChange={(e) => d.setDx(e.target.value)}
          placeholder="Se llena desde el CIE10"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>SOAT</label>
        <select
          value={d.soat}
          disabled={!d.permiteSoat || d.vacio}
          onChange={(e) => d.setSoat(e.target.value)}
          className={inputCls}
        >
          <option value="NO">No</option>
          <option value="SI">Sí</option>
        </select>
        {!d.permiteSoat && (
          <p className="mt-1 text-[11px] text-gray-500">Solo aplica a accidente de trabajo (AT).</p>
        )}
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Grupo relacionado de diagnóstico (GRD)</label>
        <select
          value={d.grdEfectivo}
          disabled={d.vacio}
          onChange={(e) => d.setGrd(e.target.value)}
          className={inputCls}
        >
          <option value="">— Elige el GRD —</option>
          {grdOpciones.map((g) => (
            <option key={g.id} value={g.nombre}>{g.nombre}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-gray-500">
          {d.vacio
            ? ""
            : d.enCatalogo?.relacionado
              ? `El catálogo trae "${d.enCatalogo.relacionado}" para este código.`
              : d.propuestasLetra.length > 1
                ? `La letra ${d.codigo.charAt(0)} se usa con: ${d.propuestasLetra.join(" / ")}. Elige el correcto.`
                : d.propuestasLetra.length === 1
                  ? `La letra ${d.codigo.charAt(0)} corresponde a "${d.propuestasLetra[0]}".`
                  : "Se propone según la letra del CIE10."}
        </p>
      </div>
    </>
  );
}

// ── Registro y edición ───────────────────────────────────────────────────────

/**
 * Registro y edición de una incapacidad en un solo formulario: datos
 * administrativos y diagnóstico, todo obligatorio. Sin `registro` es alta y
 * la fila nace cerrada. Con `registro` es edición: el empleado no cambia y se
 * exige motivo; sirve también para completar las que el Excel dejó pendientes.
 */
function IncapacidadForm({
  hoy, catalogos, pares, registro, onCreado, onDone,
}: {
  hoy: string;
  catalogos: Catalogos;
  pares: ParesProfesionalIps;
  registro: MatrizFila | null;
  onCreado: (item: CatalogoItem) => void;
  onDone: () => void;
}) {
  const edicion = !!registro;
  const [nuevaEntidad, setNuevaEntidad] = useState<"EPS" | "ARL" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<EmpleadoMaestro[]>([]);
  const [emp, setEmp] = useState<EmpleadoMaestro | null>(
    registro
      ? {
          cedula: registro.cedula,
          nombre: registro.nombre ?? registro.cedula,
          cargo: registro.cargo ?? "",
          tipo_conductor: registro.tipo_conductor ?? "EMPRESA",
          estado: registro.estado ?? "",
          eps: registro.eps,
          arl: registro.arl,
          fuente: "conductores",
        }
      : null
  );
  const [consecutivo, setConsecutivo] = useState(registro?.consecutivo_incapacidad ?? "");
  const [indicador, setIndicador] = useState(registro?.indicador_prorroga === "PRORROGA" ? "PRORROGA" : "INICIAL");
  const [origen, setOrigen] = useState(registro?.origen ?? catalogos.ORIGEN[0]?.codigo ?? "EG");
  const [fechaInicio, setFechaInicio] = useState(registro?.fecha_inicio ?? hoy);
  const [fechaFin, setFechaFin] = useState(registro?.fecha_fin ?? hoy);
  const [diasManual, setDiasManual] = useState(
    registro?.dias_it_pagados != null &&
      registro.fecha_inicio && registro.fecha_fin &&
      registro.dias_it_pagados !== diasEntre(registro.fecha_inicio, registro.fecha_fin)
      ? String(registro.dias_it_pagados)
      : ""
  );
  const [eps, setEps] = useState(registro && !registro.arl ? registro.eps ?? "" : "");
  const [arl, setArl] = useState(registro?.arl ?? "");
  const [ips, setIps] = useState(registro?.ips ?? "");
  const [profesional, setProfesional] = useState(registro?.profesional_responsable ?? "");
  const [tipoConductor, setTipoConductor] = useState<string>(registro?.tipo_conductor ?? "EMPRESA");
  const [motivo, setMotivo] = useState("");
  const d = useDiagnostico(registro, origen, catalogos);
  const [pending, start] = useTransition();

  const activos = (items: CatalogoItem[]) => items.filter((c) => c.activo);
  const epsOpciones = useMemo(() => activos(catalogos.EPS), [catalogos.EPS]);
  const arlOpciones = useMemo(() => activos(catalogos.ARL), [catalogos.ARL]);
  const ipsOpciones = useMemo(() => activos(catalogos.IPS), [catalogos.IPS]);
  const profesionales = useMemo(() => {
    const todos = activos(catalogos.PROFESIONAL);
    if (!ips) return todos;
    // Primero los que atienden en la IPS elegida, luego el resto.
    const k = clave(ips);
    const propios = todos.filter((p) => p.relacionado && clave(p.relacionado) === k);
    const otros = todos.filter((p) => !(p.relacionado && clave(p.relacionado) === k));
    return [...propios, ...otros];
  }, [catalogos.PROFESIONAL, ips]);

  const esArl = ORIGENES_ARL.has(origen);
  // IPS y profesional solo se eligen del catálogo. Lo que trae una fila vieja y
  // no está en él se muestra aparte, con la opción de crearlo o cambiarlo.
  const ipsEnCatalogo = buscarPorNombre(ipsOpciones, ips);
  const profesionalEnCatalogo = buscarPorNombre(profesionales, profesional);
  // Forma canónica del catálogo, por si la fila vieja difiere en tildes o mayúsculas.
  const ipsValor = ipsEnCatalogo?.nombre ?? ips;
  const profesionalValor = profesionalEnCatalogo?.nombre ?? profesional;

  const opcionesIps = useMemo<OpcionBuscable[]>(() => ipsOpciones.map((c) => ({
    valor: c.nombre,
    etiqueta: c.nombre,
    secundario: `${c.usos} uso${c.usos === 1 ? "" : "s"}${c.verificado ? "" : " · por verificar"}`,
    claves: [c.nombre],
  })), [ipsOpciones]);
  const opcionesProfesional = useMemo<OpcionBuscable[]>(() => profesionales.map((c) => ({
    valor: c.nombre,
    etiqueta: c.nombre,
    secundario: [c.relacionado, c.verificado ? null : "por verificar"].filter(Boolean).join(" · ") || undefined,
    claves: [c.nombre],
  })), [profesionales]);

  // Coherencia IPS ↔ profesional con lo que la matriz ya registra. Un
  // profesional puede atender en varias IPS: se avisa, no se bloquea.
  const avisoCoherencia = useMemo(() => {
    if (!ipsEnCatalogo || !profesionalEnCatalogo) return null;
    const kIps = clave(ipsEnCatalogo.nombre);
    const hist = pares[clave(profesionalEnCatalogo.nombre)] ?? [];
    if (hist.length === 0) {
      const habitual = profesionalEnCatalogo.relacionado;
      return habitual && clave(habitual) !== kIps
        ? `En el catálogo, la IPS habitual de este profesional es "${habitual}".`
        : null;
    }
    if (hist.some((h) => clave(h.ips) === kIps)) return null;
    const total = hist.reduce((a, h) => a + h.n, 0);
    const top = hist.slice(0, 2).map((h) => `${h.ips} (${h.n})`).join(", ");
    return `Este profesional figura en ${total} incapacidad${total === 1 ? "" : "es"} con ${top} y en ninguna con "${ipsEnCatalogo.nombre}". Revisa que sea correcto.`;
  }, [ipsEnCatalogo, profesionalEnCatalogo, pares]);
  const rangoValido = !!fechaInicio && !!fechaFin && fechaFin >= fechaInicio;
  const diasCalc = rangoValido ? diasEntre(fechaInicio, fechaFin) : 0;
  const dias = diasManual === "" ? diasCalc : Number(diasManual);
  const diasDifiere = diasManual !== "" && Number.isFinite(dias) && dias !== diasCalc;

  // Búsqueda en los maestros con debounce (solo en apertura).
  useEffect(() => {
    if (edicion) return;
    const q = busqueda.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2 || emp) {
        setSugerencias([]);
        return;
      }
      try {
        setSugerencias(await buscarEmpleado(q));
      } catch {
        setSugerencias([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [busqueda, emp, edicion]);

  function elegir(e: EmpleadoMaestro) {
    setEmp(e);
    setSugerencias([]);
    setTipoConductor(e.tipo_conductor);
    // EPS y ARL del maestro, si coinciden con el catálogo.
    if (e.eps) {
      const m = buscarPorNombre(epsOpciones, e.eps);
      if (m) setEps(m.nombre);
    }
    if (e.arl) {
      const m = buscarPorNombre(arlOpciones, e.arl);
      if (m) setArl(m.nombre);
    }
  }

  function submit(forzarSolape = false) {
    if (!emp) {
      toast.error("Busca y selecciona el empleado.");
      return;
    }
    if (!rangoValido) {
      toast.error("Revisa las fechas: el fin no puede ser anterior al inicio.");
      return;
    }
    if (esArl ? !arl : !eps) {
      toast.error(esArl ? "Indica la ARL." : "Indica la EPS.");
      return;
    }
    if (!ips.trim() || !profesional.trim()) {
      toast.error("Indica la IPS y el profesional responsable.");
      return;
    }
    if (edicion && !motivo.trim()) {
      toast.error("Indica el motivo de la modificación.");
      return;
    }
    // Diagnóstico obligatorio: la incapacidad se guarda completa y cerrada.
    if (d.vacio) {
      toast.error("Indica el CIE10: el diagnóstico es obligatorio.");
      return;
    }
    if (!d.formatoOk) {
      toast.error("CIE10 no válido. Ejemplos: M545, I10X, J00.");
      return;
    }
    if (!d.enCatalogo) {
      toast.error(`El CIE10 ${d.codigo} no está en el catálogo. Créalo con su diagnóstico antes de guardar.`);
      return;
    }
    if (!d.grdEfectivo) {
      toast.error("Elige el GRD.");
      return;
    }
    const diagnostico = {
      cie10: d.codigo,
      dx: d.dxEfectivo.trim() || null,
      soat: d.soat,
      grd: d.grdEfectivo,
    };
    const administrativos = {
      consecutivo: consecutivo.trim() || null,
      indicador,
      origen,
      fechaInicio,
      fechaFin,
      dias: Number.isFinite(dias) ? dias : null,
      eps: esArl ? eps || null : eps,
      arl: esArl ? arl : null,
      ips: ipsValor.trim(),
      profesional: profesionalValor.trim(),
      tipoConductor,
      forzarSolape,
    };
    start(async () => {
      const res: MatrizResultado = edicion
        ? await editarIncapacidad({
            ...administrativos,
            id: registro!.id,
            motivo: motivo.trim(),
            diagnostico,
          })
        : await registrarIncapacidad({ ...administrativos, cedula: emp.cedula, diagnostico });
      if (res.success) {
        toast.success(
          edicion
            ? registro?.estado_registro === "pendiente"
              ? `Incapacidad completada y cerrada: ${emp.nombre} (quedó en la auditoría)`
              : `Incapacidad actualizada (quedó en la auditoría)`
            : `Incapacidad registrada y cerrada: ${emp.nombre}.`
        );
        onDone();
        return;
      }
      if (res.requiereConfirmacion) {
        if (window.confirm(res.error)) submit(true);
        return;
      }
      toast.error(res.error ?? "No se pudo guardar");
    });
  }

  return (
    <div className={`rounded-xl border p-4 ${edicion ? "border-[#FDE68A] bg-[#FFFBEB]/40" : "border-[#C7D2FE] bg-[#EEF2FF]/40"}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            {edicion
              ? `${registro?.estado_registro === "pendiente" ? "Completar" : "Editar"} incapacidad · ${registro?.nombre ?? registro?.cedula}`
              : "Nueva incapacidad"}
          </h2>
          <p className="text-xs text-gray-500">
            {edicion
              ? "Toda modificación exige motivo y queda en la auditoría. Al guardar, el registro queda cerrado y pasa a origen formulario."
              : "Datos administrativos y diagnóstico en un solo paso. Al guardar, la incapacidad queda cerrada."}
          </p>
        </div>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {/* Empleado */}
        <div className="relative md:col-span-2">
          <label className={labelCls}>Documento de identidad</label>
          {emp ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm">
              <span className="truncate">
                <strong>{emp.nombre}</strong>{" "}
                <span className="text-xs text-gray-500">CC {emp.cedula}</span>
              </span>
              {!edicion && (
                <button onClick={() => { setEmp(null); setBusqueda(""); }} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Cédula o nombre en el maestro…"
                  className={`${inputCls} pl-8`}
                />
              </div>
              {sugerencias.length > 0 && (
                <div className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                  {sugerencias.map((s) => (
                    <button
                      key={s.cedula}
                      onClick={() => elegir(s)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                    >
                      <span className="font-medium text-gray-900">{s.nombre}</span>
                      <span className="text-xs text-gray-500">
                        CC {s.cedula} · {s.cargo}
                        {s.estado !== "ACTIVO" ? ` · ${s.estado}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className={labelCls}>Cargo</label>
          <input type="text" value={emp?.cargo ?? ""} disabled className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <input type="text" value={emp?.estado ?? ""} disabled className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Tipo de conductor</label>
          <select value={tipoConductor} onChange={(e) => setTipoConductor(e.target.value)} className={inputCls}>
            {TIPOS_CONDUCTOR.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Indicador</label>
          <select value={indicador} onChange={(e) => setIndicador(e.target.value)} className={inputCls}>
            {INDICADORES_PRORROGA.map((i) => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Consecutivo incapacidad{indicador === "PRORROGA" ? "" : " (opcional)"}
          </label>
          <input
            type="text"
            value={consecutivo}
            onChange={(e) => setConsecutivo(e.target.value)}
            placeholder={indicador === "PRORROGA" ? "Se toma de la incapacidad previa" : ""}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Origen</label>
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={inputCls}>
            {activos(catalogos.ORIGEN).map((o) => (
              <option key={o.id} value={o.codigo ?? ""}>{o.codigo} · {o.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Fecha inicio</label>
          <input type="date" value={fechaInicio} max={hoy} onChange={(e) => setFechaInicio(e.target.value)} className={inputCls} />
          {fechaInicio && (
            <p className="mt-1 text-[11px] text-gray-500">
              {fechaAAMMDD(fechaInicio)} · {mesDe(fechaInicio)} · {diaDe(fechaInicio)}
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Fecha fin</label>
          <input type="date" value={fechaFin} min={fechaInicio || undefined} onChange={(e) => setFechaFin(e.target.value)} className={inputCls} />
          {fechaFin && <p className="mt-1 text-[11px] text-gray-500">{fechaAAMMDD(fechaFin)}</p>}
        </div>
        <div>
          <label className={labelCls}>Días perdidos</label>
          <input
            type="number"
            min={1}
            value={diasManual === "" ? (rangoValido ? diasCalc : "") : diasManual}
            onChange={(e) => setDiasManual(e.target.value)}
            className={inputCls}
          />
          <p className={`mt-1 text-[11px] ${diasDifiere ? "text-amber-700" : "text-gray-500"}`}>
            {diasDifiere
              ? `El rango da ${diasCalc} día(s); se guardará ${dias}.`
              : "Calculado del rango; puedes corregirlo."}
          </p>
        </div>
        <div>
          <label className={labelCls}>{esArl ? "ARL (pagador)" : "EPS"}</label>
          {esArl ? (
            <select
              value={arl}
              onChange={(e) => (e.target.value === OPCION_NUEVA ? setNuevaEntidad("ARL") : setArl(e.target.value))}
              className={inputCls}
            >
              <option value="">— Elige la ARL —</option>
              {arlOpciones.map((c) => (
                <option key={c.id} value={c.nombre}>{etiquetaCatalogo(c)}</option>
              ))}
              <option value={OPCION_NUEVA}>＋ Agregar ARL nueva…</option>
            </select>
          ) : (
            <select
              value={eps}
              onChange={(e) => (e.target.value === OPCION_NUEVA ? setNuevaEntidad("EPS") : setEps(e.target.value))}
              className={inputCls}
            >
              <option value="">— Elige la EPS —</option>
              {epsOpciones.map((c) => (
                <option key={c.id} value={c.nombre}>{etiquetaCatalogo(c)}</option>
              ))}
              <option value={OPCION_NUEVA}>＋ Agregar EPS nueva…</option>
            </select>
          )}
        </div>

        {nuevaEntidad && (
          <NuevaEntidadForm
            key={nuevaEntidad}
            tipo={nuevaEntidad}
            onCreada={(item) => {
              onCreado(item);
              if (item.tipo === "ARL") setArl(item.nombre);
              else setEps(item.nombre);
              setNuevaEntidad(null);
            }}
            onCancelar={() => setNuevaEntidad(null)}
          />
        )}

        <div className="md:col-span-2">
          <label htmlFor="matriz-ips" className={labelCls}>IPS</label>
          {ips && !ipsEnCatalogo ? (
            <FueraDeCatalogo
              tipo="IPS"
              valor={ips}
              onCreado={(item) => {
                onCreado(item);
                setIps(item.nombre);
              }}
              onCambiar={() => setIps("")}
            />
          ) : (
            <BuscadorOpciones
              id="matriz-ips"
              opciones={opcionesIps}
              value={ipsValor}
              onChange={setIps}
              placeholder="Escribe para buscar en el catálogo"
              vacio={(q) => `Ninguna IPS del catálogo coincide con «${q}».`}
              crear={{
                etiqueta: (q) => `Crear nueva IPS "${q}"`,
                onCrear: (q) =>
                  crearEnCatalogo("IPS", q, null, (item) => {
                    onCreado(item);
                    setIps(item.nombre);
                  }),
              }}
            />
          )}
          {ipsEnCatalogo && !ipsEnCatalogo.verificado && (
            <p className="mt-1 text-[11px] text-amber-700">IPS por verificar.</p>
          )}
        </div>
        <div className="md:col-span-2">
          <label htmlFor="matriz-profesional" className={labelCls}>Profesional responsable</label>
          {profesional && !profesionalEnCatalogo ? (
            <FueraDeCatalogo
              tipo="PROFESIONAL"
              valor={profesional}
              relacionado={ipsEnCatalogo?.nombre ?? null}
              onCreado={(item) => {
                onCreado(item);
                setProfesional(item.nombre);
              }}
              onCambiar={() => setProfesional("")}
            />
          ) : (
            <BuscadorOpciones
              id="matriz-profesional"
              opciones={opcionesProfesional}
              value={profesionalValor}
              onChange={setProfesional}
              placeholder={ipsEnCatalogo ? "Primero los de esa IPS" : "Escribe para buscar en el catálogo"}
              vacio={(q) => `Ningún profesional del catálogo coincide con «${q}».`}
              crear={{
                etiqueta: (q) =>
                  `Crear nuevo profesional "${q}"${ipsEnCatalogo ? ` en ${ipsEnCatalogo.nombre}` : ""}`,
                onCrear: (q) =>
                  crearEnCatalogo("PROFESIONAL", q, ipsEnCatalogo?.nombre ?? null, (item) => {
                    onCreado(item);
                    setProfesional(item.nombre);
                  }),
              }}
            />
          )}
          {profesionalEnCatalogo && !profesionalEnCatalogo.verificado && (
            <p className="mt-1 text-[11px] text-amber-700">Profesional por verificar.</p>
          )}
          {avisoCoherencia && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {avisoCoherencia}
            </p>
          )}
        </div>

        <div className={`md:col-span-4 mt-1 border-t pt-3 ${edicion ? "border-[#FDE68A]" : "border-[#C7D2FE]"}`}>
          <p className="text-xs font-semibold text-gray-700">Diagnóstico</p>
          <p className="text-[11px] text-gray-500">
            CIE10, DX, SOAT y GRD son obligatorios: la incapacidad se guarda completa y cerrada.
          </p>
        </div>
        <DiagnosticoCampos d={d} catalogos={catalogos} onCreado={onCreado} />

        {edicion && (
          <>
            <div className="md:col-span-4">
              <label className={labelCls}>
                Motivo de la modificación <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={motivo}
                maxLength={200}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. llegó la prórroga · corrección de fechas · cambio de IPS"
                className={inputCls}
              />
              {registro?.motivo_modificacion && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Última modificación: {registro.motivo_modificacion}
                  {registro.modificado_por_email ? ` · ${registro.modificado_por_email}` : ""}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          IPS y profesional se eligen del catálogo; la base rechaza cualquier otro valor. Si el que
          necesitas no existe, usa la fila &quot;+ Crear nuevo&quot; de la lista: queda &quot;por verificar&quot;
          y se puede usar desde ya.
        </p>
        <button
          onClick={() => submit(false)}
          disabled={pending || !emp || d.vacio || (edicion && !motivo.trim())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {edicion ? "Guardar y cerrar" : "Registrar incapacidad"}
        </button>
      </div>
    </div>
  );
}
