"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarDays, Search, TriangleAlert } from "lucide-react";
import type { CierreConductorDia, RendimientoGrupo } from "@/lib/devengados/rendimiento";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import { quincenaDe } from "@/lib/devengados/engine";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Domingo en Colombia (la fecha es YYYY-MM-DD, sin zona). */
function esDomingo(fecha: string): boolean {
  return new Date(`${fecha}T12:00:00-05:00`).getDay() === 0;
}

/** Código digitado (solo dígitos) → coincidencia EXACTA; texto → parcial. */
function coincide(q: string, codigo: string, vehiculos: string[]): boolean {
  if (!q) return true;
  if (esBusquedaCodigo(q)) return codigo === q || vehiculos.includes(q);
  return codigo.includes(q) || vehiculos.some((v) => v.includes(q));
}

/**
 * Rendimiento real del día. Dos modos según haya llegado el cierre de GEMA:
 * - CONSULTA (cierre disponible): el valor a recibir sale de los campos ya
 *   liquidados en cierres_diarios (salario neto día − base), idéntico al
 *   análisis quincenal — sin diferencias frente a lo pagado.
 * - ESTIMADO (cierre pendiente, p. ej. el día en curso): se calcula la
 *   TIMB. CU como GEMA y se aplica CU × tarifa × %pago − base − ahorro.
 * Solo muestra el CÓDIGO del conductor (sin nombre ni cédula).
 */
export function RendimientoTab({
  grupos,
  cierre,
  fecha,
  fechaFin,
  hoy,
  baseVigente,
}: {
  grupos: RendimientoGrupo[];
  cierre: CierreConductorDia[];
  fecha: string;
  fechaFin: string;
  hoy: string;
  baseVigente: number;
}) {
  const router = useRouter();
  const esRango = fechaFin !== fecha;
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
  const oficial = cierre.length > 0;

  const gruposFiltrados = useMemo(() => {
    const q = query.trim();
    return grupos
      .filter((g) => grupoFiltro === "todos" || g.grupo === grupoFiltro)
      .filter((g) => flotaFiltro === "todas" || g.flota === flotaFiltro)
      .map((g) => ({
        ...g,
        segmentos: g.segmentos
          // En rango no hay partición superior/inferior (segmento RANGO).
          .filter((s) => esRango || segFiltro === "todos" || s.segmento === segFiltro)
          .map((s) => ({
            ...s,
            conductores: s.conductores.filter((c) =>
              coincide(q, c.codigo, c.vehiculos)
            ),
          }))
          .filter((s) => s.conductores.length > 0),
      }))
      .filter((g) => g.segmentos.length > 0);
  }, [grupos, grupoFiltro, flotaFiltro, segFiltro, query, esRango]);

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
      .filter((c) => coincide(q, c.codigo, c.vehiculos))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  }, [grupos, query]);

  /** Modo CONSULTA: filas del cierre de GEMA filtradas por la búsqueda. */
  const cierreFiltrado = useMemo(() => {
    const q = query.trim();
    return cierre.filter((c) => coincide(q, c.codigo, c.vehiculos));
  }, [cierre, query]);

  const valorDia = (timbCu: number, vjsR: number) =>
    Math.round(timbCu * tarifa * (pct / 100) - base - ahorroViaje * vjsR);

  /** Modo CONSULTA: lo liquidado por GEMA menos la base (una vez por cada
   *  día con cierre — en rango, tantas bases como días trabajados). */
  const valorCierre = (c: CierreConductorDia) =>
    Math.round(c.salarioNetoDia - base * c.dias);

  /** Navega conservando el rango desde/hasta. */
  function irA(desde: string, hasta: string) {
    if (!desde || desde > hoy) return;
    const h = hasta && hasta > desde ? (hasta > hoy ? hoy : hasta) : desde;
    const extra = h !== desde ? `&hasta=${h}` : "";
    router.push(`/tesoreria/devengados/simulador?fecha=${desde}${extra}`);
  }

  /** Segmenta al corte (quincena) de la fecha final, sin pasar de hoy. */
  function irAlCorte() {
    const q = quincenaDe(fechaFin);
    irA(q.ini, q.fin > hoy ? hoy : q.fin);
  }

  const selectCls =
    "rounded-lg border border-[#E2E8F0] bg-white px-2 py-2 text-sm outline-none focus:border-[#4F46E5]";

  return (
    <div className="space-y-4">
      {/* Parámetros de la fórmula */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Desde (producción real)
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => irA(e.target.value, fechaFin)}
                className="border-0 bg-transparent text-sm outline-none"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Hasta
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-2 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={fechaFin}
                min={fecha}
                max={hoy}
                onChange={(e) => irA(fecha, e.target.value)}
                className="border-0 bg-transparent text-sm outline-none"
              />
            </span>
          </label>
          <button
            onClick={irAlCorte}
            className="mb-0.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]"
            title="Segmentar por el corte (quincena) de la fecha final"
          >
            Quincena del corte
          </button>
          {!oficial && !esRango && (
            <>
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
            </>
          )}
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
          {!oficial && !esRango && (
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
          )}
          <span
            className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              oficial ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEF3C7] text-[#B45309]"
            }`}
          >
            {oficial ? (
              <>
                <BadgeCheck className="h-3.5 w-3.5" /> Consulta del cierre GEMA
              </>
            ) : (
              <>
                <TriangleAlert className="h-3.5 w-3.5" /> Estimado — cierre GEMA pendiente
              </>
            )}
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {oficial ? (
            <>
              Valor a recibir = salario neto {esRango ? "del rango" : "día"} del cierre de GEMA −{" "}
              {cop.format(base)} (base, una sola vez por cada día con cierre). Los valores no se
              calculan: se consultan tal cual quedaron liquidados, por eso coinciden con el
              análisis quincenal.
            </>
          ) : (
            <>
              Valor día = (TIMB. CU del día × {cop.format(tarifa)}) × {pct}% − {cop.format(base)}{" "}
              (base, una sola vez por día) − {cop.format(ahorroViaje)} × viajes realizados. Si el
              conductor rodó en varias rutas, sus timbradas CU se suman y la base se descuenta una
              única vez.
            </>
          )}
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
        {!esRango && (
          <select value={segFiltro} onChange={(e) => setSegFiltro(e.target.value)} className={selectCls}>
            <option value="todos">Superior e inferior</option>
            <option value="SUPERIOR">Superior</option>
            <option value="INFERIOR">Inferior</option>
          </select>
        )}
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

      {/* Modo CONSULTA: valores tal cual los liquidó GEMA (cierres_diarios) */}
      {oficial && cierreFiltrado.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[#047857] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#047857] px-4 py-2 text-white">
            <p className="text-sm font-semibold">
              Valor a recibir por conductor{" "}
              {esRango
                ? `(cierre GEMA del ${fecha} al ${fechaFin})`
                : "(cierre GEMA del día)"}
            </p>
            <p className="text-xs opacity-90">{cierreFiltrado.length} conductores</p>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Cód.</th>
                  <th className="px-3 py-2">Vehículo</th>
                  {esRango && <th className="px-3 py-2 text-right">Días</th>}
                  <th className="px-3 py-2 text-right">Viajes</th>
                  <th className="px-3 py-2 text-right">Timbradas CU</th>
                  <th className="px-3 py-2 text-right">Tarifa</th>
                  <th className="px-3 py-2 text-right">Bruto</th>
                  <th className="px-3 py-2 text-right">Salario bruto día</th>
                  <th className="px-3 py-2 text-right">Ahorro</th>
                  <th className="px-3 py-2 text-right">Salario neto día</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">Vr a recibir</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {cierreFiltrado.map((c) => {
                  const valor = valorCierre(c);
                  return (
                    <tr key={c.codigo} className="border-b border-[#F1F5F9]">
                      <td className="px-3 py-2 font-medium text-gray-900">{c.codigo}</td>
                      <td className="px-3 py-2 text-gray-600">{c.vehiculos.join(", ")}</td>
                      {esRango && <td className="px-3 py-2 text-right">{c.dias}</td>}
                      <td className="px-3 py-2 text-right">{c.viajes.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {c.timbrada.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.tarifa > 0 ? cop.format(c.tarifa) : "Mixta"}
                      </td>
                      <td className="px-3 py-2 text-right">{cop.format(c.bruto)}</td>
                      <td className="px-3 py-2 text-right">{cop.format(c.salarioBrutoDia)}</td>
                      <td className="px-3 py-2 text-right">{cop.format(c.ahorro)}</td>
                      <td className="px-3 py-2 text-right">{cop.format(c.salarioNetoDia)}</td>
                      <td className="px-3 py-2 text-right">{cop.format(base * c.dias)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${valor > 0 ? "text-gray-900" : "text-red-600"}`}>
                        {cop.format(valor)}
                      </td>
                      <td className="px-3 py-2">
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
            {cierreFiltrado.map((c) => {
              const valor = valorCierre(c);
              return (
                <div key={c.codigo} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">Cód. {c.codigo}</p>
                    <p className="text-xs text-gray-500">
                      Veh. {c.vehiculos.join(", ")}
                      {esRango ? ` · ${c.dias} días` : ""} · {c.viajes.toLocaleString("es-CO")} viajes · CU{" "}
                      {c.timbrada.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-500">
                      Bruto {cop.format(c.salarioBrutoDia)} · Ahorro {cop.format(c.ahorro)} · Neto{" "}
                      {cop.format(c.salarioNetoDia)}
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

      {oficial && cierreFiltrado.length === 0 && (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
          El cierre {esRango ? "del rango" : "del día"} no tiene conductores que coincidan con
          la búsqueda.
        </p>
      )}

      {esRango && !oficial && (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
          Sin cierres de GEMA sincronizados entre el {fecha} y el {fechaFin}.
        </p>
      )}

      {/* Modo ESTIMADO: día consolidado calculado desde los viajes (la
          fórmula descuenta la base una sola vez — solo aplica a día único) */}
      {!oficial && !esRango && consolidado.length > 0 && (
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

      {!oficial && !esRango && gruposFiltrados.length === 0 && (
        <p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
          Sin viajes para este día con los filtros elegidos (GEMA puede reportar con atraso).
        </p>
      )}

      {gruposFiltrados.length > 0 && (
        <p className="pt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          {esRango
            ? "Detalle por ruta del rango (suma de los cálculos diarios de la TIMB. CU"
            : "Detalle por ruta y segmento (cálculo de la TIMB. CU"}
          {oficial ? " — solo referencia, el valor oficial es el del cierre" : ""})
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
              {s.segmento !== "RANGO" && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#E0F2FE] px-4 py-1.5 text-xs font-medium text-[#075985]">
                  <span>{s.segmento} (prom. {s.promedio.toFixed(2)})</span>
                  <span>Vjs L: {s.vjsL} · Timb: {s.timbInd.toLocaleString("es-CO")}</span>
                </div>
              )}

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

      {oficial ? (
        <p className="flex items-start gap-2 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2 text-xs text-[#065F46]">
          <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Consulta del cierre de GEMA: el valor a recibir sale del salario neto ya liquidado
          (menos la base diaria por cada día con cierre) y coincide con el análisis quincenal.
          {" "}El detalle por ruta de abajo es solo referencia del cálculo de la TIMB. CU
          {esRango ? " (cada día se calcula por separado y se suma)" : ""}.
        </p>
      ) : esRango ? null : (
        <p className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-xs text-[#92400E]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          El cierre de GEMA de este día aún no está sincronizado: los valores son un ESTIMADO con
          la metodología del reporte y pueden diferir levemente. Cuando llegue el cierre, esta
          pantalla mostrará los valores oficiales liquidados.
        </p>
      )}
    </div>
  );
}
