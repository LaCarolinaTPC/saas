"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import { normalizarTexto } from "@/components/ui/buscador-opciones";
import { fechaLegible } from "@/lib/operativo/constants";
import type { ConductorPreop, RevisionPreop, VehiculoPreop } from "@/lib/operativo/preoperacional-data";
import {
  ORDEN_ESTADO, RESULTADO_COLOR, RESULTADO_LABEL, compararCodigo, conteoDia, ultimaPorVehiculo,
  type DocumentoPreop, type EstadoDia,
} from "@/lib/operativo/preoperacional-reglas";
import { ChipResultado, horaBogota } from "./comunes";
import { FormularioBus } from "./formulario-bus";

const FILTROS: (EstadoDia | "todos")[] = ["todos", "pendiente", "no_apto", "apto_obs", "apto"];

export function PreoperacionalClient({ hoy, vehiculos, conductores, documentos, revisiones, puedeEditar, error }: {
  hoy: string;
  vehiculos: VehiculoPreop[];
  conductores: ConductorPreop[];
  documentos: Record<string, DocumentoPreop[]>;
  revisiones: RevisionPreop[];
  puedeEditar: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<EstadoDia | "todos">("todos");
  const [abierto, setAbierto] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const ultimas = useMemo(() => ultimaPorVehiculo(revisiones), [revisiones]);
  const codigos = useMemo(() => vehiculos.map((v) => v.codigo), [vehiculos]);
  const conteo = useMemo(() => conteoDia(codigos, ultimas), [codigos, ultimas]);
  const revisados = codigos.length - conteo.pendiente;
  const estadoDe = (codigo: string): EstadoDia => ultimas.get(codigo)?.resultado ?? "pendiente";

  // Pendientes primero, luego lo que no puede salir; dentro, por número de bus.
  const ordenados = useMemo(
    () => [...vehiculos].sort((a, b) =>
      ORDEN_ESTADO[ultimas.get(a.codigo)?.resultado ?? "pendiente"] - ORDEN_ESTADO[ultimas.get(b.codigo)?.resultado ?? "pendiente"]
      || compararCodigo(a.codigo, b.codigo)),
    [vehiculos, ultimas],
  );

  // El número del bus primero: «50» trae 500-509 antes que 150. La placa se
  // busca también sin guion, como la dictan.
  const visibles = useMemo(() => {
    const q = normalizarTexto(busqueda).replace(/[\s-]/g, "");
    return ordenados.filter((v) => {
      if (filtro !== "todos" && (ultimas.get(v.codigo)?.resultado ?? "pendiente") !== filtro) return false;
      if (!q) return true;
      return v.codigo.toLowerCase().startsWith(q)
        || normalizarTexto(v.placa ?? "").replace(/[\s-]/g, "").includes(q)
        || normalizarTexto(v.conductor_nombre ?? "").includes(q);
    });
  }, [ordenados, busqueda, filtro, ultimas]);

  const siguientePendiente = useMemo(
    () => ordenados.find((v) => !ultimas.has(v.codigo) && v.codigo !== abierto)?.codigo ?? null,
    [ordenados, ultimas, abierto],
  );

  function abrirExacto() {
    const q = busqueda.trim();
    const exacto = vehiculos.find((v) => v.codigo === q);
    const unico = visibles.length === 1 ? visibles[0] : null;
    const elegido = exacto ?? unico;
    if (elegido) setAbierto(elegido.codigo);
  }

  function alGuardar() {
    setAbierto(null);
    setBusqueda("");
    router.refresh();
    // Listo para digitar el siguiente bus.
    setTimeout(() => buscador.current?.focus(), 50);
  }

  const cerrar = useCallback(() => setAbierto(null), []);
  const vehiculoAbierto = abierto ? vehiculos.find((v) => v.codigo === abierto) ?? null : null;

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">No se pudo cargar la revisión preoperacional.</p>
          <p className="mt-1">Si es la primera vez, falta aplicar la migración 20261002150857 en el SQL Editor. Detalle: {error}</p>
        </div>
      </div>
    );
  }

  const pct = codigos.length ? Math.round((revisados / codigos.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">Revisión del {fechaLegible(hoy)}</h2>
          <p className="text-sm text-gray-600"><strong className="text-gray-900">{revisados}</strong> de {codigos.length} vehículos revisados</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F1F5F9]" aria-hidden>
          <div className="h-full rounded-full bg-[#4F46E5] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const activo = filtro === f;
            const n = f === "todos" ? codigos.length : conteo[f];
            const c = f === "todos" ? null : RESULTADO_COLOR[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={activo}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${activo ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3730A3]" : "border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]"}`}
              >
                {c && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.fuerte }} />}
                {f === "todos" ? "Todos" : RESULTADO_LABEL[f]}
                <span className="text-gray-500">{n}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          ref={buscador}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") abrirExacto(); }}
          enterKeyHint="go"
          placeholder="Número del bus, placa o conductor…"
          aria-label="Buscar vehículo"
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-[#E2E8F0] bg-white pl-12 pr-12 text-lg text-gray-900 outline-none focus:border-[#4F46E5]"
        />
        {busqueda && (
          <button type="button" onClick={() => { setBusqueda(""); buscador.current?.focus(); }} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-400 hover:bg-[#F1F5F9]">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {siguientePendiente && !busqueda && puedeEditar && (
        <button
          type="button"
          onClick={() => setAbierto(siguientePendiente)}
          className="flex w-full items-center justify-between rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-3 text-left text-sm text-[#3730A3] hover:bg-[#E0E7FF]"
        >
          <span>Siguiente pendiente: <strong className="text-base">{siguientePendiente}</strong></span>
          <ArrowRight className="h-5 w-5" />
        </button>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-center text-sm text-gray-500">
          {busqueda ? `Ningún vehículo activo coincide con «${busqueda.trim()}».` : "No hay vehículos en este filtro."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((v) => {
            const ultima = ultimas.get(v.codigo);
            const estado = estadoDe(v.codigo);
            const vencidos = (documentos[v.codigo] ?? []).filter((d) => d.nivel === "vencido").length;
            return (
              <li key={v.codigo} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setAbierto(v.codigo)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3 text-left transition hover:border-[#C7D2FE] hover:bg-[#F8FAFC]"
                  style={{ borderLeft: `4px solid ${RESULTADO_COLOR[estado].fuerte}` }}
                >
                  <span className="w-14 shrink-0 text-2xl font-bold tabular-nums text-gray-900">{v.codigo}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-700">{[v.placa, v.clase, v.modelo].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="block truncate text-xs text-gray-500">{v.conductor_nombre ?? "Sin conductor asignado"}</span>
                    {vencidos > 0 && <span className="mt-0.5 block text-xs font-medium text-red-700">{vencidos} documento{vencidos === 1 ? "" : "s"} vencido{vencidos === 1 ? "" : "s"}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <ChipResultado estado={estado} pequeno />
                    {ultima && <span className="text-[11px] text-gray-500">{horaBogota(ultima.created_at)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {vehiculoAbierto && (
        <FormularioBus
          key={vehiculoAbierto.codigo}
          vehiculo={vehiculoAbierto}
          conductores={conductores}
          documentos={documentos[vehiculoAbierto.codigo] ?? []}
          ultima={ultimas.get(vehiculoAbierto.codigo) ?? null}
          puedeEditar={puedeEditar}
          onCerrar={cerrar}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}
