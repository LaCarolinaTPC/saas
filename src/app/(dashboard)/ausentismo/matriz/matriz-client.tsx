"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, X, Check, Loader2, TriangleAlert, FileSpreadsheet, ClipboardList, Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import type { Catalogos, CatalogoItem, MatrizFila, ResumenMatriz } from "@/lib/ausentismo/matriz";
import {
  INDICADORES_PRORROGA, TIPOS_CONDUCTOR, ORIGENES_ARL, ORIGENES_SOAT, ESTADOS_REGISTRO,
  REVISION_LABEL, CIE10_RE,
  fechaAAMMDD, diasEntre, mesDe, diaDe, clave, normalizarCie10,
} from "@/lib/ausentismo/matriz-reglas";
import {
  abrirIncapacidad, cerrarIncapacidad, buscarEmpleado, type EmpleadoMaestro,
} from "./actions";

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5] disabled:bg-[#F8FAFC] disabled:text-gray-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

export interface FiltrosMatrizUI {
  desde: string;
  hasta: string;
  eps: string;
  origen: string;
  estado: string;
  revision: boolean;
  q: string;
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

  function irA(f: Partial<FiltrosMatrizUI>) {
    const n = { ...filtros, ...f };
    const sp = new URLSearchParams({ tab: "matriz" });
    if (n.desde) sp.set("desde", n.desde);
    if (n.hasta) sp.set("hasta", n.hasta);
    if (n.eps) sp.set("eps", n.eps);
    if (n.origen) sp.set("origen", n.origen);
    if (n.estado) sp.set("estado", n.estado);
    if (n.revision) sp.set("rev", "1");
    if (n.q) sp.set("q", n.q);
    router.push(`/ausentismo?${sp.toString()}`);
  }

  const origenLabel = useMemo(
    () => Object.fromEntries(catalogos.ORIGEN.map((o) => [o.codigo ?? "", o.nombre])),
    [catalogos.ORIGEN]
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
              setCerrando(null);
              setMostrarForm((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
          >
            {mostrarForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {mostrarForm ? "Cancelar" : "Nueva incapacidad"}
          </button>
        )}
      </div>

      {mostrarForm && !cerrando && (
        <AperturaForm
          hoy={hoy}
          catalogos={catalogos}
          onDone={() => {
            setMostrarForm(false);
            router.refresh();
          }}
        />
      )}

      {cerrando && (
        <CierreForm
          key={cerrando.id}
          fila={cerrando}
          catalogos={catalogos}
          origenLabel={origenLabel}
          onDone={() => {
            setCerrando(null);
            router.refresh();
          }}
        />
      )}

      <FiltrosMatriz filtros={filtros} hoy={hoy} catalogos={catalogos} onAplicar={irA} />

      <TablaMatriz
        filas={filas}
        origenLabel={origenLabel}
        puedeEditar={puedeEditar}
        onCerrar={(r) => {
          setMostrarForm(false);
          setCerrando(r);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </>
  );
}

/** GRD que propone la letra inicial del CIE10, según la regla sembrada desde la data. */
function grdPorLetra(catalogos: Catalogos, codigo: string): string[] {
  const letra = codigo.charAt(0);
  if (!letra) return [];
  return catalogos.CIE10_LETRA
    .filter((c) => c.codigo === letra)
    .sort((a, b) => b.usos - a.usos)
    .map((c) => c.nombre);
}

/** Momento 2: cierre con CIE10, DX, SOAT y GRD. */
function CierreForm({
  fila, catalogos, origenLabel, onDone,
}: {
  fila: MatrizFila;
  catalogos: Catalogos;
  origenLabel: Record<string, string>;
  onDone: () => void;
}) {
  const [cie10, setCie10] = useState(fila.cie10 ?? "");
  const [dx, setDx] = useState(fila.diagnostico ?? "");
  const [dxEditado, setDxEditado] = useState(!!fila.diagnostico);
  const [grd, setGrd] = useState(fila.grd ?? "");
  const [grdEditado, setGrdEditado] = useState(!!fila.grd);
  const [soat, setSoat] = useState(fila.soat === "SI" ? "SI" : "NO");
  const [pending, start] = useTransition();

  const codigo = normalizarCie10(cie10);
  const formatoOk = CIE10_RE.test(codigo);
  const enCatalogo = useMemo(
    () => catalogos.CIE10.find((c) => (c.codigo ?? "").toUpperCase() === codigo) ?? null,
    [catalogos.CIE10, codigo]
  );
  const grdOpciones = useMemo(() => catalogos.GRD.filter((g) => g.activo), [catalogos.GRD]);
  const propuestasLetra = useMemo(() => grdPorLetra(catalogos, codigo), [catalogos, codigo]);
  const permiteSoat = ORIGENES_SOAT.has(fila.origen ?? "");

  // Valores efectivos: lo del catálogo salvo que el usuario haya escrito otra cosa.
  const dxEfectivo = dxEditado ? dx : enCatalogo?.nombre ?? "";
  const grdEfectivo = grdEditado
    ? grd
    : enCatalogo?.relacionado ?? propuestasLetra[0] ?? "";

  function submit() {
    if (!formatoOk) {
      toast.error("CIE10 no válido. Ejemplos: M545, I10X, J00.");
      return;
    }
    if (!enCatalogo) {
      toast.error(`El CIE10 ${codigo} no está en el catálogo. Créalo con su diagnóstico antes de cerrar.`);
      return;
    }
    if (!grdEfectivo) {
      toast.error("Elige el GRD.");
      return;
    }
    start(async () => {
      const res = await cerrarIncapacidad({
        id: fila.id,
        cie10: codigo,
        dx: dxEfectivo.trim() || null,
        soat: permiteSoat ? soat : "NO",
        grd: grdEfectivo,
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
        <div>
          <label className={labelCls}>CIE10</label>
          <input
            type="text"
            list="matriz-cie10"
            value={cie10}
            autoFocus
            onChange={(e) => setCie10(e.target.value)}
            placeholder="M545"
            className={`${inputCls} uppercase ${cie10 && !formatoOk ? "border-red-300" : ""}`}
          />
          <datalist id="matriz-cie10">
            {catalogos.CIE10.filter((c) => c.activo).map((c) => (
              <option key={c.id} value={c.codigo ?? ""}>{c.nombre}</option>
            ))}
          </datalist>
          <p className={`mt-1 text-[11px] ${!cie10 ? "text-gray-500" : !formatoOk ? "text-red-600" : enCatalogo ? "text-emerald-700" : "text-amber-700"}`}>
            {!cie10
              ? "Escribe el código; el catálogo propone el DX y el GRD."
              : !formatoOk
                ? "Formato: letra, dos dígitos y opcional un carácter (M545, I10X)."
                : enCatalogo
                  ? `En el catálogo · ${enCatalogo.usos} uso(s)`
                  : "Código nuevo: aún no está en el catálogo."}
          </p>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>DX (diagnóstico)</label>
          <input
            type="text"
            value={dxEfectivo}
            onChange={(e) => { setDx(e.target.value); setDxEditado(true); }}
            placeholder="Se llena desde el CIE10"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>SOAT</label>
          <select
            value={permiteSoat ? soat : "NO"}
            disabled={!permiteSoat}
            onChange={(e) => setSoat(e.target.value)}
            className={inputCls}
          >
            <option value="NO">No</option>
            <option value="SI">Sí</option>
          </select>
          {!permiteSoat && (
            <p className="mt-1 text-[11px] text-gray-500">Solo aplica a accidente de trabajo (AT).</p>
          )}
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Grupo relacionado de diagnóstico (GRD)</label>
          <select
            value={grdEfectivo}
            onChange={(e) => { setGrd(e.target.value); setGrdEditado(true); }}
            className={inputCls}
          >
            <option value="">— Elige el GRD —</option>
            {grdOpciones.map((g) => (
              <option key={g.id} value={g.nombre}>{g.nombre}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-500">
            {enCatalogo?.relacionado
              ? `El catálogo trae "${enCatalogo.relacionado}" para este código.`
              : propuestasLetra.length > 1
                ? `La letra ${codigo.charAt(0)} se usa con: ${propuestasLetra.join(" / ")}. Elige el correcto.`
                : propuestasLetra.length === 1
                  ? `La letra ${codigo.charAt(0)} corresponde a "${propuestasLetra[0]}".`
                  : "Se propone según la letra del CIE10."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          Al cerrar, la fila queda protegida de la carga del Excel y sale en la matriz oficial.
        </p>
        <button
          onClick={submit}
          disabled={pending || !formatoOk}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#059669] px-4 py-2 text-sm font-medium text-white hover:bg-[#047857] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Cerrar registro
        </button>
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
    </div>
  );
}

function TablaMatriz({
  filas, origenLabel, puedeEditar, onCerrar,
}: {
  filas: MatrizFila[];
  origenLabel: Record<string, string>;
  puedeEditar: boolean;
  onCerrar: (r: MatrizFila) => void;
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
                    {r.estado_registro === "pendiente" && (
                      <button
                        onClick={() => onCerrar(r)}
                        title="Completar CIE10, DX, SOAT y GRD"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#A7F3D0] px-2 py-1 text-xs font-medium text-[#047857] hover:bg-[#ECFDF5]"
                      >
                        <Stethoscope className="h-3.5 w-3.5" /> Cerrar diagnóstico
                      </button>
                    )}
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

/** Momento 1: apertura de la incapacidad con los datos administrativos. */
function AperturaForm({
  hoy, catalogos, onDone,
}: {
  hoy: string;
  catalogos: Catalogos;
  onDone: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<EmpleadoMaestro[]>([]);
  const [emp, setEmp] = useState<EmpleadoMaestro | null>(null);
  const [consecutivo, setConsecutivo] = useState("");
  const [indicador, setIndicador] = useState("INICIAL");
  const [origen, setOrigen] = useState(catalogos.ORIGEN[0]?.codigo ?? "EG");
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [diasManual, setDiasManual] = useState("");
  const [eps, setEps] = useState("");
  const [arl, setArl] = useState("");
  const [ips, setIps] = useState("");
  const [profesional, setProfesional] = useState("");
  const [tipoConductor, setTipoConductor] = useState<string>("EMPRESA");
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
  const rangoValido = !!fechaInicio && !!fechaFin && fechaFin >= fechaInicio;
  const diasCalc = rangoValido ? diasEntre(fechaInicio, fechaFin) : 0;
  const dias = diasManual === "" ? diasCalc : Number(diasManual);
  const diasDifiere = diasManual !== "" && Number.isFinite(dias) && dias !== diasCalc;

  // Búsqueda en los maestros con debounce.
  useEffect(() => {
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
  }, [busqueda, emp]);

  function elegir(e: EmpleadoMaestro) {
    setEmp(e);
    setSugerencias([]);
    setTipoConductor(e.tipo_conductor);
    // EPS y ARL del maestro, si coinciden con el catálogo.
    if (e.eps) {
      const k = clave(e.eps);
      const m = epsOpciones.find((c) => clave(c.nombre) === k);
      if (m) setEps(m.nombre);
    }
    if (e.arl) {
      const k = clave(e.arl);
      const m = arlOpciones.find((c) => clave(c.nombre) === k);
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
    start(async () => {
      const res = await abrirIncapacidad({
        cedula: emp.cedula,
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
      });
      if (res.success) {
        toast.success(`Incapacidad abierta: ${emp.nombre}. Queda pendiente de diagnóstico.`);
        onDone();
        return;
      }
      if (res.requiereConfirmacion) {
        if (window.confirm(res.error)) submit(true);
        return;
      }
      toast.error(res.error ?? "No se pudo registrar");
    });
  }

  return (
    <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Nueva incapacidad · apertura</h2>
          <p className="text-xs text-gray-500">
            Datos administrativos. El diagnóstico (CIE10, DX, SOAT, GRD) se completa al cerrar.
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
              <button onClick={() => { setEmp(null); setBusqueda(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
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
            <select value={arl} onChange={(e) => setArl(e.target.value)} className={inputCls}>
              <option value="">— Elige la ARL —</option>
              {arlOpciones.map((c) => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          ) : (
            <select value={eps} onChange={(e) => setEps(e.target.value)} className={inputCls}>
              <option value="">— Elige la EPS —</option>
              {epsOpciones.map((c) => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>

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
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          IPS y profesional deben existir en el catálogo. Si no aparecen, avisa a RRHH para crearlos.
        </p>
        <button
          onClick={() => submit(false)}
          disabled={pending || !emp}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Abrir incapacidad
        </button>
      </div>
    </div>
  );
}
