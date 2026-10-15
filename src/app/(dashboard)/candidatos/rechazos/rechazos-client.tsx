"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { formatDateBogota } from "@/lib/utils";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { ORIGEN_LABEL, SIN_FASE, type Conteo, type FilaRechazo, type ResumenRechazos } from "@/lib/rechazos/reporte";
import type { FiltrosRechazos } from "@/lib/rechazos/datos";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function RechazosClient({
  filtros,
  vacantes,
  filas,
  resumen,
  error,
}: {
  filtros: FiltrosRechazos;
  vacantes: string[];
  filas: FilaRechazo[];
  resumen: ResumenRechazos;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function aplicar(cambio: Partial<FiltrosRechazos>) {
    const f = { ...filtros, ...cambio };
    const p = new URLSearchParams({ desde: f.desde, hasta: f.hasta });
    if (f.vacante) p.set("vacante", f.vacante);
    router.push(`${pathname}?${p}`);
  }

  const exportar = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.vacante) exportar.set("vacante", filtros.vacante);

  const r = resumen;
  const faseTop = r.porFase.filter((c) => c.etiqueta !== SIN_FASE).sort((a, b) => b.total - a.total)[0];
  const causaTop = r.porCausa[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-500">
          Desde
          <input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => e.target.value && aplicar({ desde: e.target.value })} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-xs font-medium text-gray-500">
          Hasta
          <input type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => e.target.value && aplicar({ hasta: e.target.value })} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-xs font-medium text-gray-500">
          Vacante
          <select value={filtros.vacante ?? ""} onChange={(e) => aplicar({ vacante: e.target.value || null })} className={`${inputCls} mt-1 block min-w-[200px]`}>
            <option value="">Todas</option>
            {vacantes.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <a
          href={`/api/candidatos/rechazos/export?${exportar}`}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:border-[#4F46E5] hover:text-[#4F46E5]"
        >
          <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
        </a>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Rechazos" valor={r.total} />
        <Tile label="Fase con más rechazos" valor={faseTop ? faseTop.etiqueta : "—"} detalle={faseTop ? `${faseTop.total} · ${faseTop.pct}%` : undefined} />
        <Tile label="Causa principal" valor={causaTop ? causaTop.etiqueta : "—"} detalle={causaTop ? `${causaTop.total} · ${causaTop.pct}%` : undefined} />
        <Tile label="Sin fase registrada" valor={r.sinFase} detalle="Históricos sin rastro" />
        <Tile label="Reactivados" valor={r.revertidos} detalle="No cuentan en el reporte" />
      </div>

      {r.analisis.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-[#E2E8F0] bg-white p-4 text-sm text-gray-700">
          {r.analisis.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}

      {r.total === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white py-16 text-center text-sm text-gray-500">
          No hay rechazos en este rango.
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel titulo="Rechazos por fase" nota="En el orden del pipeline">
              <Barras conteos={r.porFase} />
            </Panel>
            <Panel titulo="Rechazos por causa">
              <Barras conteos={r.porCausa} />
            </Panel>
          </div>

          <Panel titulo="Fase × causa" nota="Cuántos candidatos se rechazaron en cada fase por cada causa">
            <Matriz resumen={r} />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel titulo="Por mes">
              <Barras conteos={r.mensual.map((m) => ({ clave: m.mes, etiqueta: nombreMes(m.mes), total: m.total, pct: 0 }))} sinPct />
            </Panel>
            <Panel titulo="Por vacante">
              <Barras conteos={r.porVacante} />
            </Panel>
          </div>
        </>
      )}

      <Detalle filas={filas} />
    </div>
  );
}

function Tile({ label, valor, detalle }: { label: string; valor: React.ReactNode; detalle?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-gray-900" title={typeof valor === "string" ? valor : undefined}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-gray-400">{detalle}</p>}
    </div>
  );
}

function Panel({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
        {nota && <span className="text-xs text-gray-400">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Barras({ conteos, sinPct }: { conteos: Conteo[]; sinPct?: boolean }) {
  const max = Math.max(1, ...conteos.map((c) => c.total));
  return (
    <ul className="space-y-2">
      {conteos.map((c) => (
        <li key={c.clave} className="grid grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-3 text-sm">
          <span className={`truncate ${c.etiqueta === SIN_FASE ? "italic text-gray-400" : "text-gray-700"}`} title={c.etiqueta}>
            {c.etiqueta}
          </span>
          <span className="h-2.5 rounded-full bg-[#F1F5F9]">
            <span className="block h-2.5 rounded-full bg-[#4F46E5]" style={{ width: `${(c.total / max) * 100}%` }} />
          </span>
          <span className="w-20 text-right tabular-nums text-gray-600">
            {c.total}
            {!sinPct && <span className="ml-1 text-xs text-gray-400">{c.pct}%</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Matriz({ resumen }: { resumen: ResumenRechazos }) {
  const { fases, causas, celdas } = resumen.matriz;
  const max = Math.max(1, ...celdas.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#F1F5F9]">
            <th className="sticky left-0 bg-white px-2 py-2 text-left text-xs font-medium text-gray-500">Fase</th>
            {causas.map((c) => (
              <th key={c.clave} className="min-w-[90px] px-2 py-2 text-right text-xs font-medium text-gray-500">{c.etiqueta}</th>
            ))}
            <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700">Total</th>
          </tr>
        </thead>
        <tbody>
          {fases.map((f, i) => (
            <tr key={f.clave} className="border-b border-[#F8FAFC]">
              <td className={`sticky left-0 bg-white px-2 py-1.5 ${f.etiqueta === SIN_FASE ? "italic text-gray-400" : "text-gray-700"}`}>{f.etiqueta}</td>
              {celdas[i].map((n, j) => (
                <td
                  key={causas[j].clave}
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={n ? { backgroundColor: `rgba(79, 70, 229, ${0.08 + 0.5 * (n / max)})`, color: n / max > 0.6 ? "#fff" : "#1E1B4B" } : { color: "#CBD5E1" }}
                >
                  {n || "·"}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900">{f.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detalle({ filas }: { filas: FilaRechazo[] }) {
  const [conRevertidos, setConRevertidos] = useState(false);
  const visibles = conRevertidos ? filas : filas.filter((f) => !f.revertido_at);
  const pag = usePaginacion(visibles, { reiniciar: conRevertidos });
  const ancla = useRef<HTMLDivElement>(null);

  return (
    <section ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Detalle</h2>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={conRevertidos} onChange={(e) => setConRevertidos(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" />
          Mostrar reactivados
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#F1F5F9] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Candidato</th>
              <th className="px-4 py-2">Vacante</th>
              <th className="px-4 py-2">Fase</th>
              <th className="px-4 py-2">Causa</th>
              <th className="px-4 py-2">Detalle</th>
              <th className="px-4 py-2">Origen</th>
              <th className="px-4 py-2">Registró</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {pag.filas.map((f) => (
              <tr key={f.id} className={f.revertido_at ? "bg-gray-50 text-gray-400" : ""}>
                <td className="whitespace-nowrap px-4 py-2 text-xs">{formatDateBogota(f.registrado_at)}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{f.nombre ?? "—"}</div>
                  <div className="text-xs text-gray-400">{f.cedula ?? ""}</div>
                </td>
                <td className="px-4 py-2 text-gray-600">{f.vacante ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{f.fase_origen_label ?? f.fase_origen ?? <span className="italic text-gray-400">{SIN_FASE}</span>}</td>
                <td className="px-4 py-2 text-gray-700">{f.causa ?? <span className="italic text-gray-400">Sin causa</span>}</td>
                <td className="max-w-[260px] px-4 py-2 text-xs text-gray-500">
                  <span className="line-clamp-2" title={f.nota ?? undefined}>{f.nota ?? ""}</span>
                  {f.revertido_at && (
                    <span className="mt-0.5 block text-[11px] text-amber-600">
                      Reactivado {formatDateBogota(f.revertido_at)}
                      {f.revertido_por_email ? ` por ${f.revertido_por_email}` : ""}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">{ORIGEN_LABEL[f.origen] ?? f.origen}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{f.registrado_por_email ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Sin registros.</p>
      ) : (
        <Paginador p={pag} unidad="rechazos" ancla={ancla} />
      )}
    </section>
  );
}
