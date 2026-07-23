"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Search, TriangleAlert } from "lucide-react";
import type { RendimientoGrupo } from "@/lib/devengados/rendimiento";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Domingo en Colombia (la fecha es YYYY-MM-DD, sin zona). */
function esDomingo(fecha: string): boolean {
  return new Date(`${fecha}T12:00:00-05:00`).getDay() === 0;
}

/**
 * Rendimiento real del día: la simulación de pago por producción que usan
 * las promotoras. Toma la timbrada de cuota única (TIMB. CU) calculada como
 * GEMA y aplica: CU × tarifa × %pago − base − ahorro × viajes realizados.
 * Solo muestra el CÓDIGO del conductor (sin nombre ni cédula).
 */
export function RendimientoTab({
  grupos,
  fecha,
  hoy,
  baseVigente,
}: {
  grupos: RendimientoGrupo[];
  fecha: string;
  hoy: string;
  baseVigente: number;
}) {
  const router = useRouter();
  const domingo = esDomingo(fecha);
  const [festivo, setFestivo] = useState(false);
  const [pct, setPct] = useState(16);
  const [base, setBase] = useState(baseVigente);
  const [ahorroViaje, setAhorroViaje] = useState(2000);
  const [grupoFiltro, setGrupoFiltro] = useState("todos");
  const [flotaFiltro, setFlotaFiltro] = useState("todas");
  const [segFiltro, setSegFiltro] = useState("todos");
  const [query, setQuery] = useState("");

  const tarifa = domingo || festivo ? 3400 : 3300;

  const gruposFiltrados = useMemo(() => {
    const q = query.trim();
    return grupos
      .filter((g) => grupoFiltro === "todos" || g.grupo === grupoFiltro)
      .filter((g) => flotaFiltro === "todas" || g.flota === flotaFiltro)
      .map((g) => ({
        ...g,
        segmentos: g.segmentos
          .filter((s) => segFiltro === "todos" || s.segmento === segFiltro)
          .map((s) => ({
            ...s,
            conductores: s.conductores.filter(
              (c) =>
                !q ||
                c.codigo.includes(q) ||
                c.vehiculos.some((v) => v.includes(q))
            ),
          }))
          .filter((s) => s.conductores.length > 0),
      }))
      .filter((g) => g.segmentos.length > 0);
  }, [grupos, grupoFiltro, flotaFiltro, segFiltro, query]);

  const nombresGrupos = useMemo(
    () => [...new Set(grupos.map((g) => g.grupo))],
    [grupos]
  );

  /**
   * Día consolidado por conductor: un conductor puede rodar en varias rutas
   * el mismo día y la TIMB. CU se suma, pero la BASE se descuenta UNA sola
   * vez (es del día, no del viaje); el ahorro sí es por viaje realizado.
   */
  const consolidado = useMemo(() => {
    const q = query.trim();
    const m = new Map<
      string,
      { vehiculos: Set<string>; rutas: Set<string>; vjsR: number; vjsL: number; timbCu: number }
    >();
    for (const g of grupos)
      for (const s of g.segmentos)
        for (const c of s.conductores) {
          let acc = m.get(c.codigo);
          if (!acc)
            m.set(
              c.codigo,
              (acc = { vehiculos: new Set(), rutas: new Set(), vjsR: 0, vjsL: 0, timbCu: 0 })
            );
          c.vehiculos.forEach((v) => acc.vehiculos.add(v));
          acc.rutas.add(g.grupo);
          acc.vjsR += c.vjsR;
          acc.vjsL += c.vjsL;
          acc.timbCu += c.timbCu;
        }
    return [...m.entries()]
      .map(([codigo, a]) => ({
        codigo,
        vehiculos: [...a.vehiculos].sort(),
        rutas: [...a.rutas],
        vjsR: a.vjsR,
        vjsL: a.vjsL,
        timbCu: Math.round(a.timbCu * 100) / 100,
      }))
      .filter(
        (c) => !q || c.codigo.includes(q) || c.vehiculos.some((v) => v.includes(q))
      )
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  }, [grupos, query]);

  const valorDia = (timbCu: number, vjsR: number) =>
    Math.round(timbCu * tarifa * (pct / 100) - base - ahorroViaje * vjsR);

  const selectCls =
    "rounded-lg border border-[#E2E8F0] bg-white px-2 py-2 text-sm outline-none focus:border-[#4F46E5]";

  return (
    <div className="space-y-4">
      {/* Parámetros de la fórmula */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Día (producción real)
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && v <= hoy)
                    router.push(`/tesoreria/devengados/simulador?fecha=${v}`);
                }}
                className="border-0 bg-transparent text-sm outline-none"
              />
            </span>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={domingo || festivo}
              disabled={domingo}
              onChange={(e) => setFestivo(e.target.checked)}
            />
            Domingo/festivo (tarifa {cop.format(3400)})
            {domingo && <span className="text-xs text-gray-400">— domingo automático</span>}
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">% pago</span>
            <input
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-20 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-right text-sm outline-none focus:border-[#4F46E5]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Base</span>
            <input
              type="text"
              inputMode="numeric"
              value={base.toLocaleString("es-CO")}
              onChange={(e) => setBase(Number(e.target.value.replace(/\D/g, "")))}
              className="w-28 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-right text-sm outline-none focus:border-[#4F46E5]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Ahorro por viaje
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={ahorroViaje.toLocaleString("es-CO")}
              onChange={(e) => setAhorroViaje(Number(e.target.value.replace(/\D/g, "")))}
              className="w-24 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-right text-sm outline-none focus:border-[#4F46E5]"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Valor día = (TIMB. CU del día × {cop.format(tarifa)}) × {pct}% − {cop.format(base)}{" "}
          (base, una sola vez por día) − {cop.format(ahorroViaje)} × viajes realizados. Si el
          conductor rodó en varias rutas, sus timbradas CU se suman y la base se descuenta una
          única vez.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)} className={selectCls}>
          <option value="todos">Todas las rutas</option>
          {nombresGrupos.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select value={flotaFiltro} onChange={(e) => setFlotaFiltro(e.target.value)} className={selectCls}>
          <option value="todas">NV y GN</option>
          <option value="NV">NV (ecológica)</option>
          <option value="GN">GN</option>
        </select>
        <select value={segFiltro} onChange={(e) => setSegFiltro(e.target.value)} className={selectCls}>
          <option value="todos">Superior e inferior</option>
          <option value="SUPERIOR">Superior</option>
          <option value="INFERIOR">Inferior</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Código o vehículo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-44 rounded-lg border border-[#E2E8F0] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4F46E5]"
          />
        </div>
      </div>

      {/* Día consolidado por conductor: aquí vive el "valor a recibir" */}
      {consolidado.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[#4F46E5] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#4F46E5] px-4 py-2 text-white">
            <p className="text-sm font-semibold">Valor a recibir por conductor (día consolidado)</p>
            <p className="text-xs opacity-90">{consolidado.length} conductores</p>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Cód. conductor</th>
                  <th className="px-4 py-2">Vehículo</th>
                  <th className="px-4 py-2">Rutas</th>
                  <th className="px-4 py-2 text-right">Viajes</th>
                  <th className="px-4 py-2 text-right">Timb. CU día</th>
                  <th className="px-4 py-2 text-right">Valor a recibir</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {consolidado.map((c) => {
                  const valor = valorDia(c.timbCu, c.vjsR);
                  return (
                    <tr key={c.codigo} className="border-b border-[#F1F5F9]">
                      <td className="px-4 py-2 font-medium text-gray-900">{c.codigo}</td>
                      <td className="px-4 py-2 text-gray-600">{c.vehiculos.join(", ")}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{c.rutas.join(" · ")}</td>
                      <td className="px-4 py-2 text-right">{c.vjsR}</td>
                      <td className="px-4 py-2 text-right">{c.timbCu.toLocaleString("es-CO")}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${valor > 0 ? "text-gray-900" : "text-red-600"}`}>
                        {cop.format(valor)}
                      </td>
                      <td className="px-4 py-2">
                        {valor > 0 ? (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-[#D1FAE5] px-2 py-0.5 text-xs font-medium text-[#059669]">
                            Habilitado para entregar
                          </span>
                        ) : (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-medium text-[#EF4444]">
                            Sin excedente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#F1F5F9] md:hidden">
            {consolidado.map((c) => {
              const valor = valorDia(c.timbCu, c.vjsR);
              return (
                <div key={c.codigo} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">Cód. {c.codigo}</p>
                    <p className="text-xs text-gray-500">
                      Veh. {c.vehiculos.join(", ")} · {c.vjsR} viajes · CU {c.timbCu.toLocaleString("es-CO")}
                    </p>
                    <p className="truncate text-xs text-gray-400">{c.rutas.join(" · ")}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-base font-semibold ${valor > 0 ? "text-gray-900" : "text-red-600"}`}>
                      {cop.format(valor)}
                    </p>
                    {valor > 0 ? (
                      <span className="inline-flex rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-medium text-[#059669]">
                        Habilitado
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-medium text-[#EF4444]">
                        Sin excedente
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gruposFiltrados.length === 0 && (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
          Sin viajes para este día con los filtros elegidos (GEMA puede reportar con atraso).
        </p>
      )}

      {gruposFiltrados.length > 0 && (
        <p className="pt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          Detalle por ruta y segmento (cálculo de la TIMB. CU)
        </p>
      )}

      {gruposFiltrados.map((g) => (
        <div key={`${g.grupo}|${g.flota}`} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0EA5E9] px-4 py-2 text-white">
            <p className="text-sm font-semibold">
              {g.grupo} · {g.flota} <span className="font-normal opacity-90">(prom. {g.promedio.toFixed(2)})</span>
            </p>
            <p className="text-xs opacity-90">
              Viajes L: {g.vjsL} · Timb IND: {g.timbInd.toLocaleString("es-CO")}
            </p>
          </div>
          {g.segmentos.map((s) => (
            <div key={s.segmento}>
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#E0F2FE] px-4 py-1.5 text-xs font-medium text-[#075985]">
                <span>{s.segmento} (prom. {s.promedio.toFixed(2)})</span>
                <span>Vjs L: {s.vjsL} · Timb: {s.timbInd.toLocaleString("es-CO")}</span>
              </div>

              {/* Tabla en pantallas medianas+ */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Cód. conductor</th>
                      <th className="px-4 py-2">Vehículo</th>
                      <th className="px-4 py-2 text-right">Vjs R</th>
                      <th className="px-4 py-2 text-right">Vjs L</th>
                      <th className="px-4 py-2 text-right">Timb. IND</th>
                      <th className="px-4 py-2 text-right">Timb. CU</th>
                      <th className="px-4 py-2 text-right">Dif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.conductores.map((c) => (
                      <tr key={c.codigo} className="border-b border-[#F1F5F9]">
                        <td className="px-4 py-2 font-medium text-gray-900">{c.codigo}</td>
                        <td className="px-4 py-2 text-gray-600">{c.vehiculos.join(", ")}</td>
                        <td className="px-4 py-2 text-right">{c.vjsR}</td>
                        <td className="px-4 py-2 text-right">{c.vjsL}</td>
                        <td className="px-4 py-2 text-right">{c.timbInd.toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2 text-right">{c.timbCu.toLocaleString("es-CO")}</td>
                        <td className={`px-4 py-2 text-right ${c.timbInd - c.timbCu < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {Math.round(c.timbInd - c.timbCu)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas en celular */}
              <div className="divide-y divide-[#F1F5F9] md:hidden">
                {s.conductores.map((c) => (
                  <div key={c.codigo} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">Cód. {c.codigo}</p>
                      <p className="text-xs text-gray-500">
                        Veh. {c.vehiculos.join(", ")} · {c.vjsR} viajes
                      </p>
                    </div>
                    <p className="text-right text-sm text-gray-600">
                      Timb {c.timbInd.toLocaleString("es-CO")} → CU{" "}
                      <span className="font-semibold text-gray-900">{c.timbCu.toLocaleString("es-CO")}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      <p className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-xs text-[#92400E]">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Herramienta de socialización: la TIMB. CU se calcula con la misma metodología del reporte
        de GEMA y puede diferir levemente (±2%) mientras se confirma la regla de los medios
        viajes. El valor oficial de pago es el del cierre de GEMA.
      </p>
    </div>
  );
}
