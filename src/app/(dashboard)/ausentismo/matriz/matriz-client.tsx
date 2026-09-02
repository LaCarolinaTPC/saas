"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, X, Check, Loader2, TriangleAlert, FileSpreadsheet, ClipboardList,
  Stethoscope, Pencil, Download, History,
} from "lucide-react";
import { toast } from "sonner";
import type { Catalogos, CatalogoItem, MatrizFila, ResumenMatriz } from "@/lib/ausentismo/matriz";
import {
  INDICADORES_PRORROGA, TIPOS_CONDUCTOR, ORIGENES_ARL, ORIGENES_SOAT, ESTADOS_REGISTRO,
  REVISION_LABEL, CIE10_RE,
  fechaAAMMDD, diasEntre, mesDe, diaDe, clave, normalizarCie10,
} from "@/lib/ausentismo/matriz-reglas";
import {
  abrirIncapacidad, cerrarIncapacidad, editarIncapacidad, buscarEmpleado, crearCatalogo,
  type EmpleadoMaestro, type TipoCreable, type AperturaResultado,
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
  return sp;
}

export function MatrizClient({
  hoy, filtros, filas, catalogos, resumen, puedeEditar,
}: {
  hoy: string;
  filtros: FiltrosMatrizUI;
  filas: MatrizFila[];
  catalogos: Catalogos;
  resumen: ResumenMatriz;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cerrando, setCerrando] = useState<MatrizFila | null>(null);
  const [editando, setEditando] = useState<MatrizFila | null>(null);
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
    setCerrando(null);
    setEditando(null);
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
          registro={editando}
          onCreado={onCreado}
          onDone={() => {
            cerrarPaneles();
            router.refresh();
          }}
        />
      )}

      {cerrando && (
        <CierreForm
          key={cerrando.id}
          fila={cerrando}
          catalogos={cat}
          origenLabel={origenLabel}
          onCreado={onCreado}
          onDone={() => {
            cerrarPaneles();
            router.refresh();
          }}
        />
      )}

      <FiltrosMatriz filtros={filtros} hoy={hoy} catalogos={cat} onAplicar={irA} />

      <TablaMatriz
        filas={filas}
        origenLabel={origenLabel}
        puedeEditar={puedeEditar}
        onCerrar={(r) => {
          cerrarPaneles();
          setCerrando(r);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onEditar={(r) => {
          cerrarPaneles();
          setEditando(r);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </>
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

function TablaMatriz({
  filas, origenLabel, puedeEditar, onCerrar, onEditar,
}: {
  filas: MatrizFila[];
  origenLabel: Record<string, string>;
  puedeEditar: boolean;
  onCerrar: (r: MatrizFila) => void;
  onEditar: (r: MatrizFila) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Empleado</th>
              <th className="px-3 py-2">Consec.</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Inicio → Fin</th>
              <th className="px-3 py-2 text-right">Días</th>
              <th className="px-3 py-2">Pagador</th>
              <th className="px-3 py-2">IPS · Profesional</th>
              <th className="px-3 py-2">Diagnóstico</th>
              <th className="px-3 py-2">Registro</th>
              {puedeEditar && <th className="px-3 py-2 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id} className="border-b border-[#F1F5F9] align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-900">{r.nombre ?? "—"}</p>
                  <p className="text-xs text-gray-500">
                    CC {r.cedula} · {r.cargo ?? "—"}
                    {r.tipo_conductor ? ` · ${r.tipo_conductor}` : ""}
                    {r.estado === "RETIRADO" ? " · RETIRADO" : ""}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                  <p>{r.consecutivo_incapacidad ?? "—"}</p>
                  <p className={r.indicador_prorroga === "PRORROGA" ? "font-medium text-amber-700" : "text-gray-400"}>
                    {r.indicador_prorroga === "PRORROGA" ? "Prórroga" : "Inicial"}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600" title={origenLabel[r.origen ?? ""] ?? ""}>
                  {r.origen ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                  {fechaAAMMDD(r.fecha_inicio)} → {fechaAAMMDD(r.fecha_fin)}
                  <p className="text-gray-400">{r.dia_ocurrencia ?? ""}</p>
                </td>
                <td className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                  {r.dias_it_pagados ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {r.arl ?? r.eps ?? "—"}
                  {r.soat === "SI" && <p className="text-gray-400">SOAT</p>}
                </td>
                <td className="max-w-56 px-3 py-2 text-xs text-gray-600">
                  <p className="truncate" title={r.ips ?? ""}>{r.ips ?? "—"}</p>
                  <p className="truncate text-gray-400" title={r.profesional_responsable ?? ""}>
                    {r.profesional_responsable ?? ""}
                  </p>
                </td>
                <td className="max-w-64 px-3 py-2 text-xs text-gray-600">
                  {r.cie10 ? (
                    <>
                      <p className="truncate" title={r.diagnostico ?? ""}>
                        <span className="font-medium text-gray-800">{r.cie10}</span> · {r.diagnostico ?? ""}
                      </p>
                      <p className="truncate text-gray-400">{r.grd ?? ""}</p>
                    </>
                  ) : (
                    <span className="text-gray-400">Sin diagnóstico</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    {r.estado_registro === "cerrado" ? (
                      <span className="inline-flex whitespace-nowrap rounded-full bg-[#D1FAE5] px-2 py-0.5 text-xs font-medium text-[#059669]">
                        Cerrado
                      </span>
                    ) : (
                      <span className="inline-flex whitespace-nowrap rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-medium text-[#B45309]">
                        Pendiente
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                      {r.origen_registro === "formulario" ? (
                        <><ClipboardList className="h-3 w-3" /> formulario</>
                      ) : (
                        <><FileSpreadsheet className="h-3 w-3" /> excel</>
                      )}
                    </span>
                    {r.motivo_modificacion && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-gray-500"
                        title={`Modificado: ${r.motivo_modificacion}${r.modificado_por_email ? `\nPor: ${r.modificado_por_email}` : ""}`}
                      >
                        <History className="h-3 w-3" /> modificado
                      </span>
                    )}
                    {r.revision.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-red-600"
                        title={r.revision.map((m) => REVISION_LABEL[m] ?? m).join("\n")}
                      >
                        <TriangleAlert className="h-3 w-3" /> revisar
                      </span>
                    )}
                  </div>
                </td>
                {puedeEditar && (
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-col items-end gap-1">
                      {r.estado_registro === "pendiente" && (
                        <button
                          onClick={() => onCerrar(r)}
                          title="Completar CIE10, DX, SOAT y GRD"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#A7F3D0] px-2 py-1 text-xs font-medium text-[#047857] hover:bg-[#ECFDF5]"
                        >
                          <Stethoscope className="h-3.5 w-3.5" /> Cerrar diagnóstico
                        </button>
                      )}
                      <button
                        onClick={() => onEditar(r)}
                        title="Editar con motivo (queda en la bitácora)"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-medium text-gray-600 hover:bg-[#F8FAFC]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={puedeEditar ? 10 : 9} className="px-4 py-8 text-center text-sm text-gray-500">
                  Sin incapacidades con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
    start(async () => {
      const res = await crearCatalogo({ tipo, nombre: valor.trim(), relacionado: relacionado ?? null });
      if (!res.success || !res.item) {
        toast.error(res.error ?? "No se pudo crear");
        return;
      }
      toast.success(
        res.existente ? `Ya existía: se usa "${res.item.nombre}"` : `Creado en el catálogo (por verificar): ${res.item.nombre}`
      );
      onCreado(res.item);
    });
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

// ── Diagnóstico (momento 2) ──────────────────────────────────────────────────

/** GRD que propone la letra inicial del CIE10, según la regla sembrada desde la data. */
function grdPorLetra(catalogos: Catalogos, codigo: string): string[] {
  const letra = codigo.charAt(0);
  if (!letra) return [];
  return catalogos.CIE10_LETRA
    .filter((c) => c.codigo === letra)
    .sort((a, b) => b.usos - a.usos)
    .map((c) => c.nombre);
}

/** Estado y derivaciones del bloque CIE10 / DX / SOAT / GRD, compartido por cierre y edición. */
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
  d, catalogos, onCreado, opcional,
}: {
  d: Diagnostico;
  catalogos: Catalogos;
  onCreado: (item: CatalogoItem) => void;
  /** En edición el diagnóstico puede quedar vacío (reabre el registro). */
  opcional?: boolean;
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
    ? { cls: "text-gray-500", txt: opcional ? "Vacío: el registro queda pendiente de diagnóstico." : "Escribe el código; el catálogo propone el DX y el GRD." }
    : !d.formatoOk
      ? { cls: "text-red-600", txt: "Formato: letra, dos dígitos y opcional un carácter (M545, I10X)." }
      : d.enCatalogo
        ? { cls: "text-emerald-700", txt: `En el catálogo · ${d.enCatalogo.usos} uso(s)${d.enCatalogo.verificado ? "" : " · por verificar"}` }
        : { cls: "text-amber-700", txt: "Código nuevo: escribe el DX, elige el GRD y créalo." };

  return (
    <>
      <div>
        <label className={labelCls}>CIE10</label>
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

/** Momento 2: cierre con CIE10, DX, SOAT y GRD. */
function CierreForm({
  fila, catalogos, origenLabel, onCreado, onDone,
}: {
  fila: MatrizFila;
  catalogos: Catalogos;
  origenLabel: Record<string, string>;
  onCreado: (item: CatalogoItem) => void;
  onDone: () => void;
}) {
  const d = useDiagnostico(fila, fila.origen, catalogos);
  const [pending, start] = useTransition();

  function submit() {
    if (!d.formatoOk) {
      toast.error("CIE10 no válido. Ejemplos: M545, I10X, J00.");
      return;
    }
    if (!d.enCatalogo) {
      toast.error(`El CIE10 ${d.codigo} no está en el catálogo. Créalo con su diagnóstico antes de cerrar.`);
      return;
    }
    if (!d.grdEfectivo) {
      toast.error("Elige el GRD.");
      return;
    }
    start(async () => {
      const res = await cerrarIncapacidad({
        id: fila.id,
        cie10: d.codigo,
        dx: d.dxEfectivo.trim() || null,
        soat: d.soat,
        grd: d.grdEfectivo,
      });
      if (res.success) {
        toast.success(`Incapacidad cerrada: ${fila.nombre ?? fila.cedula}`);
        onDone();
      } else {
        toast.error(res.error ?? "No se pudo cerrar");
      }
    });
  }

  return (
    <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Stethoscope className="h-4 w-4 text-[#059669]" /> Cerrar diagnóstico · {fila.nombre ?? fila.cedula}
          </h2>
          <p className="text-xs text-gray-500">
            CC {fila.cedula} · {fila.origen} {origenLabel[fila.origen ?? ""] ? `(${origenLabel[fila.origen ?? ""]})` : ""} ·{" "}
            {fechaAAMMDD(fila.fecha_inicio)} → {fechaAAMMDD(fila.fecha_fin)} · {fila.dias_it_pagados ?? "—"} día(s) ·{" "}
            {fila.arl ?? fila.eps ?? "sin pagador"}
          </p>
        </div>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <DiagnosticoCampos d={d} catalogos={catalogos} onCreado={onCreado} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          Al cerrar, la fila queda protegida de la carga del Excel y sale en la matriz oficial.
        </p>
        <button
          onClick={submit}
          disabled={pending || !d.formatoOk}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#059669] px-4 py-2 text-sm font-medium text-white hover:bg-[#047857] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Cerrar registro
        </button>
      </div>
    </div>
  );
}

// ── Apertura (momento 1) y edición ───────────────────────────────────────────

/**
 * Alta y edición de una incapacidad. Sin `registro` es apertura: solo los
 * datos administrativos. Con `registro` es edición: el empleado no cambia,
 * se exige motivo y se puede corregir o retirar el diagnóstico.
 */
function IncapacidadForm({
  hoy, catalogos, registro, onCreado, onDone,
}: {
  hoy: string;
  catalogos: Catalogos;
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
  // Lo escrito en IPS/profesional que aún no existe en el catálogo se puede crear.
  const ipsEnCatalogo = buscarPorNombre(ipsOpciones, ips);
  const profesionalEnCatalogo = buscarPorNombre(profesionales, profesional);
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
    if (edicion) {
      if (!motivo.trim()) {
        toast.error("Indica el motivo de la modificación.");
        return;
      }
      if (!d.vacio && !d.formatoOk) {
        toast.error("CIE10 no válido. Ejemplos: M545, I10X, J00.");
        return;
      }
      if (!d.vacio && !d.enCatalogo) {
        toast.error(`El CIE10 ${d.codigo} no está en el catálogo. Créalo antes de guardar.`);
        return;
      }
      if (d.vacio && registro?.estado_registro === "cerrado" && !forzarSolape) {
        const ok = window.confirm(
          "Vas a guardar sin diagnóstico: el registro se reabre y vuelve a quedar pendiente. ¿Continuar?"
        );
        if (!ok) return;
      }
    }
    const administrativos = {
      consecutivo: consecutivo.trim() || null,
      indicador,
      origen,
      fechaInicio,
      fechaFin,
      dias: Number.isFinite(dias) ? dias : null,
      eps: esArl ? eps || null : eps,
      arl: esArl ? arl : null,
      ips: ips.trim(),
      profesional: profesional.trim(),
      tipoConductor,
      forzarSolape,
    };
    start(async () => {
      const res: AperturaResultado = edicion
        ? await editarIncapacidad({
            ...administrativos,
            id: registro!.id,
            motivo: motivo.trim(),
            diagnostico: d.vacio
              ? null
              : { cie10: d.codigo, dx: d.dxEfectivo.trim() || null, soat: d.soat, grd: d.grdEfectivo },
          })
        : await abrirIncapacidad({ ...administrativos, cedula: emp.cedula });
      if (res.success) {
        toast.success(
          edicion
            ? `Incapacidad actualizada (quedó en la bitácora)`
            : `Incapacidad abierta: ${emp.nombre}. Queda pendiente de diagnóstico.`
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
            {edicion ? `Editar incapacidad · ${registro?.nombre ?? registro?.cedula}` : "Nueva incapacidad · apertura"}
          </h2>
          <p className="text-xs text-gray-500">
            {edicion
              ? "Toda modificación exige motivo y queda en la bitácora. La fila pasa a origen formulario."
              : "Datos administrativos. El diagnóstico (CIE10, DX, SOAT, GRD) se completa al cerrar."}
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
          <label className={labelCls}>IPS</label>
          <input
            type="text"
            list="matriz-ips"
            value={ips}
            onChange={(e) => setIps(e.target.value)}
            placeholder="Escribe para buscar en el catálogo"
            className={inputCls}
          />
          <datalist id="matriz-ips">
            {ipsOpciones.map((c) => <option key={c.id} value={c.nombre} />)}
          </datalist>
          {ips.trim().length >= 3 && !ipsEnCatalogo && (
            <CrearValorBoton
              tipo="IPS"
              valor={ips}
              onCreado={(item) => {
                onCreado(item);
                setIps(item.nombre);
              }}
            />
          )}
          {ipsEnCatalogo && !ipsEnCatalogo.verificado && (
            <p className="mt-1 text-[11px] text-amber-700">IPS por verificar.</p>
          )}
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Profesional responsable</label>
          <input
            type="text"
            list="matriz-profesionales"
            value={profesional}
            onChange={(e) => setProfesional(e.target.value)}
            placeholder={ips ? "Primero los de esa IPS" : "Escribe para buscar en el catálogo"}
            className={inputCls}
          />
          <datalist id="matriz-profesionales">
            {profesionales.slice(0, 400).map((c) => <option key={c.id} value={c.nombre} />)}
          </datalist>
          {profesional.trim().length >= 3 && !profesionalEnCatalogo && (
            <CrearValorBoton
              tipo="PROFESIONAL"
              valor={profesional}
              relacionado={ipsEnCatalogo?.nombre ?? null}
              onCreado={(item) => {
                onCreado(item);
                setProfesional(item.nombre);
              }}
            />
          )}
          {profesionalEnCatalogo && !profesionalEnCatalogo.verificado && (
            <p className="mt-1 text-[11px] text-amber-700">Profesional por verificar.</p>
          )}
        </div>

        {edicion && (
          <>
            <div className="md:col-span-4 mt-1 border-t border-[#FDE68A] pt-3">
              <p className="text-xs font-semibold text-gray-700">Diagnóstico</p>
              <p className="text-[11px] text-gray-500">
                Déjalo vacío para reabrir el registro; complétalo para cerrarlo o corregirlo.
              </p>
            </div>
            <DiagnosticoCampos d={d} catalogos={catalogos} onCreado={onCreado} opcional />
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
          IPS y profesional deben existir en el catálogo. Si escribes uno nuevo, créalo con el botón:
          queda &quot;por verificar&quot; y se puede usar desde ya.
        </p>
        <button
          onClick={() => submit(false)}
          disabled={pending || !emp || (edicion && !motivo.trim())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {edicion ? "Guardar cambios" : "Abrir incapacidad"}
        </button>
      </div>
    </div>
  );
}
