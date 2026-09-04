"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, Search, Settings2, TriangleAlert } from "lucide-react";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import { normalizarTexto } from "@/components/ui/buscador-opciones";
import { useColapsables } from "@/lib/mantenimiento/colapsables";
import {
  NIVELES_VENCIMIENTO, NIVELES_ALERTA, NIVEL_LABEL, NIVEL_ACCION, NIVEL_COLOR,
  conteoPorNivel, nivelMasGrave, etiquetaVehiculo, fechaLegible, textoDias,
  type TipoDocumento, type Vencimiento,
} from "@/lib/operativo/constants";
import { exportarVencimientos } from "@/lib/operativo/exportar";
import { actualizarUmbrales } from "./actions";
import { ChipNivel, Indicador } from "./ui";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

/**
 * Tablero de vencimientos: indicadores por nivel, filtros por documento,
 * nivel y vehículo, y la tabla agrupada por nivel con el color de cada uno.
 * Abajo, los umbrales de aviso por tipo de documento (quien puede editar).
 */
export function TableroClient({ hoy, tipos, filas, puedeEditar }: {
  hoy: string;
  tipos: TipoDocumento[];
  filas: Vencimiento[];
  puedeEditar: boolean;
}) {
  const [tipo, setTipo] = useState("");
  const [nivel, setNivel] = useState("");
  const [q, setQ] = useState("");
  const secciones = useColapsables("operativo-vencimientos", {
    sin_dato: true, vencido: true, critico: true, proximo: true, al_dia: false, umbrales: false,
  });
  const tiposLabel = useMemo(() => Object.fromEntries(tipos.map((t) => [t.key, t.nombre])), [tipos]);

  const visibles = useMemo(() => {
    const nq = normalizarTexto(q);
    return filas.filter((f) => {
      if (tipo && f.tipo !== tipo) return false;
      if (nivel && f.nivel !== nivel) return false;
      if (nq) {
        const texto = normalizarTexto(`${f.codigo} ${f.placa ?? ""} ${f.conductor_nombre ?? ""} ${f.ruta ?? ""}`);
        if (!texto.includes(nq)) return false;
      }
      return true;
    });
  }, [filas, tipo, nivel, q]);

  const conteosTotales = useMemo(() => conteoPorNivel(filas), [filas]);
  const grave = nivelMasGrave(conteosTotales);
  const vehiculosEnAlerta = useMemo(
    () => new Set(filas.filter((f) => f.nivel !== "al_dia").map((f) => f.codigo)).size,
    [filas]
  );

  const grupos = useMemo(
    () => NIVELES_VENCIMIENTO
      .map((n) => ({
        nivel: n,
        filas: visibles
          .filter((f) => f.nivel === n)
          .sort((a, b) => (a.dias ?? -Infinity) - (b.dias ?? -Infinity) || a.codigo.localeCompare(b.codigo, "es", { numeric: true })),
      }))
      .filter((g) => g.filas.length > 0),
    [visibles]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {grave && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: NIVEL_COLOR[grave].fuerte, backgroundColor: NIVEL_COLOR[grave].suave, color: NIVEL_COLOR[grave].texto }}
        >
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>{vehiculosEnAlerta}</strong> vehículo{vehiculosEnAlerta === 1 ? "" : "s"} con documentos por atender:{" "}
              {NIVELES_ALERTA.filter((n) => conteosTotales[n] > 0)
                .map((n) => `${conteosTotales[n]} ${NIVEL_LABEL[n].toLowerCase()}`)
                .join(" · ")}.
            </span>
          </span>
          <button
            onClick={() => { setNivel(""); setTipo(""); setQ(""); secciones.abrir(grave); }}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-current px-3 py-1.5 text-xs font-semibold hover:bg-white/60"
          >
            Ver todo lo pendiente
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {NIVELES_VENCIMIENTO.map((n) => (
          <Indicador
            key={n}
            nivel={n}
            valor={conteosTotales[n]}
            activo={nivel === n}
            onClick={() => { setNivel(nivel === n ? "" : n); secciones.abrir(n); }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Documento</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {tipos.filter((t) => t.activo).map((t) => <option key={t.key} value={t.key}>{t.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Nivel</span>
          <select value={nivel} onChange={(e) => setNivel(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {NIVELES_VENCIMIENTO.map((n) => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Vehículo</span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código, placa, conductor o ruta"
              className={`${inputCls} w-64 pl-8`}
            />
          </div>
        </label>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-600">{visibles.length} de {filas.length} filas</span>
          <BotonesExportar
            formatos={["pdf", "csv"]}
            sinDatos={visibles.length === 0}
            onExportar={(formato) => exportarVencimientos({ formato, hoy, filtros: { tipo, nivel, q }, filas: visibles, tiposLabel })}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Nivel</th>
                <th className="px-3 py-2">Vehículo</th>
                <th className="px-3 py-2">Conductor</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Fecha GEMA</th>
                <th className="px-3 py-2">Documento cargado</th>
                <th className="px-3 py-2">Vigente hasta</th>
                <th className="px-3 py-2">Días</th>
                <th className="px-3 py-2">Número · entidad</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const abierto = secciones.estaAbierta(g.nivel);
                const c = NIVEL_COLOR[g.nivel];
                return (
                  <Fragment key={g.nivel}>
                    <tr>
                      <td colSpan={10} className="border-y border-[#E2E8F0] px-3 py-1.5" style={{ backgroundColor: c.suave, color: c.texto }}>
                        <button type="button" onClick={() => secciones.alternar(g.nivel)} className="inline-flex items-center gap-2 text-xs font-semibold">
                          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {NIVEL_LABEL[g.nivel]} · {NIVEL_ACCION[g.nivel]} ({g.filas.length})
                        </button>
                      </td>
                    </tr>
                    {abierto && g.filas.map((f) => (
                      <tr key={`${f.codigo}-${f.tipo}`} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        <td className="px-3 py-2"><ChipNivel nivel={f.nivel} /></td>
                        <td className="px-3 py-2">
                          <Link href={`/operativo/vehiculos/${f.codigo}`} className="font-medium text-gray-900 hover:text-[#4F46E5]">
                            {etiquetaVehiculo(f)}
                          </Link>
                          {f.ruta && <p className="text-xs text-gray-500">Ruta {f.ruta}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">{f.conductor_nombre ?? "—"}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{f.tipo_nombre}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{fechaLegible(f.fecha_gema)}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {fechaLegible(f.fecha_documento)}
                          {f.discrepancia && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700" title="GEMA y el documento cargado no coinciden: revisa cuál está actualizado">
                              <TriangleAlert className="h-3 w-3" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold" style={{ color: c.texto }}>{fechaLegible(f.fecha_vigente)}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: c.texto }}>{textoDias(f.dias)}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{[f.numero, f.entidad].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/operativo/vehiculos/${f.codigo}`} title="Abrir la ficha del vehículo" className="inline-flex rounded p-1 text-gray-400 hover:bg-white hover:text-[#4F46E5]">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                    {filas.length === 0
                      ? "Sin vehículos activos en el maestro o sin tipos de documento activos."
                      : "Ninguna fila cumple los filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Umbrales tipos={tipos} puedeEditar={puedeEditar} abierto={secciones.estaAbierta("umbrales")} onAlternar={() => secciones.alternar("umbrales")} />
    </div>
  );
}

/** Umbrales de aviso por tipo de documento, editables en línea. */
function Umbrales({ tipos, puedeEditar, abierto, onAlternar }: {
  tipos: TipoDocumento[];
  puedeEditar: boolean;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edicion, setEdicion] = useState<Record<string, { proximo: string; critico: string }>>({});
  const valor = (t: TipoDocumento) => edicion[t.key] ?? { proximo: String(t.dias_proximo), critico: String(t.dias_critico) };
  const cambiado = (t: TipoDocumento) => {
    const v = valor(t);
    return v.proximo !== String(t.dias_proximo) || v.critico !== String(t.dias_critico);
  };

  function guardar(t: TipoDocumento) {
    const v = valor(t);
    const proximo = Number(v.proximo), critico = Number(v.critico);
    if (!Number.isInteger(proximo) || !Number.isInteger(critico) || critico > proximo) {
      toast.error("Crítico debe ser un entero menor o igual que próximo a vencer.");
      return;
    }
    start(async () => {
      const res = await actualizarUmbrales({ tipo: t.key, diasProximo: proximo, diasCritico: critico });
      if (!res.success) {
        toast.error(res.error ?? "No se pudieron guardar los umbrales");
        return;
      }
      toast.success(`Umbrales de ${t.nombre} guardados`);
      setEdicion((p) => { const s = { ...p }; delete s[t.key]; return s; });
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white">
      <button type="button" onClick={onAlternar} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Settings2 className="h-4 w-4 text-[#4F46E5]" /> Umbrales de aviso por documento
        </span>
        {abierto ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
      </button>
      {abierto && (
        <div className="border-t border-[#F1F5F9] px-4 py-3">
          <p className="mb-3 text-xs text-gray-500">
            Días antes del vencimiento en los que el documento pasa a <strong style={{ color: NIVEL_COLOR.proximo.texto }}>próximo a vencer</strong> y a{" "}
            <strong style={{ color: NIVEL_COLOR.critico.texto }}>crítico</strong>. Vencido y sin dato no dependen de umbral.
            {!puedeEditar && " Tu tipo de usuario solo consulta."}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1 pr-3">Documento</th>
                <th className="py-1 pr-3">Columna GEMA</th>
                <th className="py-1 pr-3">Próximo (días)</th>
                <th className="py-1 pr-3">Crítico (días)</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => {
                const v = valor(t);
                return (
                  <tr key={t.key} className={`border-t border-[#F1F5F9] ${t.activo ? "" : "text-gray-400"}`}>
                    <td className="py-2 pr-3 font-medium">{t.nombre}{t.activo ? "" : " (inactivo)"}</td>
                    <td className="py-2 pr-3 text-xs text-gray-500">{t.columna_gema ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <input type="number" min={1} max={365} value={v.proximo} disabled={!puedeEditar}
                        onChange={(e) => setEdicion((p) => ({ ...p, [t.key]: { ...v, proximo: e.target.value } }))}
                        className={`${inputCls} w-24`} />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="number" min={0} max={365} value={v.critico} disabled={!puedeEditar}
                        onChange={(e) => setEdicion((p) => ({ ...p, [t.key]: { ...v, critico: e.target.value } }))}
                        className={`${inputCls} w-24`} />
                    </td>
                    <td className="py-2 text-right">
                      {puedeEditar && cambiado(t) && (
                        <button type="button" onClick={() => guardar(t)} disabled={pending}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">
                          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
