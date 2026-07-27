"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import type { EstadoConductor } from "@/lib/devengados/data";
import { construirCuenta, estadoDia } from "@/lib/devengados/estado-dia";

interface Conductor {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * Registro diario de la quincena (el mismo reporte de la Caja de devengados)
 * como pestaña de consulta del simulador — pestaña adicional pedida por
 * Nestor (24-jul-2026). Solo lectura: aquí no se registran entregas.
 */
export function RegistroTab({
  conductores,
  hoy,
}: {
  conductores: Conductor[];
  hoy: string;
}) {
  const [fechaCorte, setFechaCorte] = useState(hoy);
  const [query, setQuery] = useState("");
  const [seleccionado, setSeleccionado] = useState<Conductor | null>(null);
  const [estado, setEstado] = useState<EstadoConductor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const sugerencias = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || seleccionado) return [];
    return conductores
      .filter((c) =>
        esBusquedaCodigo(q)
          ? c.codigo === q
          : c.nombre.toLowerCase().includes(q) ||
            c.cedula.includes(q) ||
            c.codigo?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, conductores, seleccionado]);

  async function cargarEstado(cedula: string, fecha: string) {
    setCargando(true);
    setErrorCarga(null);
    setEstado(null);
    try {
      const res = await fetch(`/api/devengados/estado?cedula=${cedula}&fecha=${fecha}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error consultando el estado");
      setEstado(json as EstadoConductor);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  function elegir(c: Conductor) {
    setSeleccionado(c);
    setQuery(c.nombre);
    void cargarEstado(c.cedula, fechaCorte);
  }

  function cambiarFecha(fecha: string) {
    if (!fecha || fecha > hoy) return;
    setFechaCorte(fecha);
    if (seleccionado) void cargarEstado(seleccionado.cedula, fecha);
  }

  const r = estado?.resumen;
  const cuenta = useMemo(() => {
    if (!estado || !r) return { filas: [], totalPago: 0 };
    return construirCuenta(r.dias, estado.entregas);
  }, [estado, r]);
  const disponible = r?.disponible ?? 0;

  return (
    <div className="space-y-4">
      {/* Búsqueda y corte */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Fecha de corte
            </span>
            <input
              type="date"
              value={fechaCorte}
              max={hoy}
              onChange={(e) => cambiarFecha(e.target.value)}
              className="rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm outline-none focus:border-[#4F46E5]"
            />
          </label>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar conductor por nombre, cédula o código…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSeleccionado(null);
                setEstado(null);
              }}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4F46E5]"
            />
            {sugerencias.length > 0 && (
              <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                {sugerencias.map((c) => (
                  <button
                    key={c.cedula}
                    onClick={() => elegir(c)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                  >
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-xs text-gray-500">
                      CC {c.cedula} {c.codigo ? `· Cód. ${c.codigo}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          El mismo registro diario de la Caja de devengados, en modo consulta: la alerta de cada
          renglón sale del saldo (pendiente por entregar), y cuando lo liberado ya se entregó
          completo aparece &quot;Total Entregado&quot;.
        </p>
      </div>

      {!seleccionado && !cargando && (
        <p className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-10 text-center text-sm text-gray-500">
          Busca un conductor para ver su registro diario de la quincena al corte elegido.
        </p>
      )}

      {cargando && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando el acumulado de la quincena…
        </div>
      )}

      {errorCarga && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorCarga}
        </div>
      )}

      {estado && r && seleccionado && (
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Registro diario · {estado.quincena.periodo} Q{estado.quincena.quincena} (corte al{" "}
              {fechaCorte}) — {seleccionado.nombre}
            </h2>
            <p className="text-xs text-gray-500">
              El acumulado se protege corte a corte: solo se libera excedente cuando la
              producción acumulada supera la base acumulada exigida.
            </p>
          </div>
          {r.dias.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Sin producción registrada en la quincena. GEMA puede reportar con atraso.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2 text-right">Salario neto día</th>
                    <th className="px-4 py-2 text-right">Base diaria</th>
                    <th className="px-4 py-2 text-right">Excedente día</th>
                    <th className="px-4 py-2 text-right">Prod. acumulada</th>
                    <th className="px-4 py-2 text-right">Base acumulada</th>
                    <th className="px-4 py-2 text-right">Dif. acumulada</th>
                    <th className="px-4 py-2 text-right">Liberado acum.</th>
                    <th className="px-4 py-2 text-right">Entregar hoy</th>
                    <th className="px-4 py-2 text-right">Pago (real)</th>
                    <th className="px-4 py-2 text-right">Saldo</th>
                    <th className="px-4 py-2">Estado / Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {cuenta.filas.map((d) => {
                    const est = estadoDia(d, estado.quincena.quincena);
                    const esCorte = d.fecha === fechaCorte;
                    return (
                      <tr
                        key={d.fecha}
                        className={`border-b border-[#F1F5F9] ${esCorte ? "bg-[#EEF2FF]" : ""}`}
                      >
                        <td className="px-4 py-2 font-medium">
                          {d.fecha}
                          {esCorte && <span className="ml-1 text-xs text-[#4F46E5]">(corte)</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{cop.format(d.produccion)}</td>
                        <td className="px-4 py-2 text-right">{cop.format(d.baseExigida)}</td>
                        <td className="px-4 py-2 text-right">{cop.format(d.excedenteDia)}</td>
                        <td className="px-4 py-2 text-right">{cop.format(d.acumProduccion)}</td>
                        <td className="px-4 py-2 text-right">{cop.format(d.acumBase)}</td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            d.saldoAcumulado < 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {cop.format(d.saldoAcumulado)}
                        </td>
                        <td className="px-4 py-2 text-right">{cop.format(d.liberadoAcum)}</td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {cop.format(d.entregarHoy)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-[#4F46E5]">
                          {d.pago > 0 ? cop.format(d.pago) : "—"}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-semibold ${
                            d.saldo > 0 ? "text-amber-600" : "text-gray-500"
                          }`}
                        >
                          {cop.format(d.saldo)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: est.bg, color: est.color }}
                          >
                            {est.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">{cop.format(r.produccionAcum)}</td>
                    <td className="px-4 py-2 text-right">{cop.format(r.baseAcum)}</td>
                    <td className="px-4 py-2" colSpan={4}></td>
                    <td className="px-4 py-2 text-right" title="Excedente liberado neto de la quincena">
                      {cop.format(r.excedenteAcum)}
                    </td>
                    <td className="px-4 py-2"></td>
                    <td className="px-4 py-2 text-right text-[#4F46E5]">
                      {cop.format(cuenta.totalPago)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right ${
                        disponible > 0 ? "text-amber-600" : "text-gray-500"
                      }`}
                      title="Pendiente por pagar al corte"
                    >
                      {cop.format(disponible)}
                    </td>
                    <td className="px-4 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
