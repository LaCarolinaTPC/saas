"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Banknote,
  TriangleAlert,
  CircleCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { registrarEntrega } from "@/lib/devengados/actions";
import type { EstadoConductor } from "@/lib/devengados/data";
import type { DiaCalculado } from "@/lib/devengados/engine";

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

function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
  hint?: string;
}) {
  const colors = {
    neutral: "text-gray-900",
    ok: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  } as const;
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/** Estado por día con las etiquetas de la hoja Simulacion_Diaria. */
function estadoDia(d: DiaCalculado): { label: string; bg: string; color: string } {
  if (d.estado === "sin_produccion")
    return { label: "Sin producción", bg: "#F1F5F9", color: "#64748B" };
  if (d.entregarHoy > 0)
    return { label: "Entrega autorizada", bg: "#D1FAE5", color: "#059669" };
  return { label: "Retenido – déficit acumulado", bg: "#FEE2E2", color: "#EF4444" };
}

export function CajaClient({
  conductores,
  baseDiaria,
  hoy,
  fechaCorte: fechaCorteInicial,
  esSimulada,
}: {
  conductores: Conductor[];
  baseDiaria: number;
  hoy: string;
  fechaCorte: string;
  esSimulada: boolean;
}) {
  const [fechaCorte, setFechaCorte] = useState(fechaCorteInicial);
  const [query, setQuery] = useState("");
  const [seleccionado, setSeleccionado] = useState<Conductor | null>(null);
  const [estado, setEstado] = useState<EstadoConductor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [valorEntrega, setValorEntrega] = useState("");
  const [observacion, setObservacion] = useState("");
  const [verViajes, setVerViajes] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const sugerencias = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || seleccionado) return [];
    return conductores
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.cedula.includes(q) ||
          c.codigo?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, conductores, seleccionado]);

  async function cargarEstado(cedula: string, fecha: string = fechaCorte) {
    setCargando(true);
    setErrorCarga(null);
    setEstado(null);
    setResultado(null);
    setVerViajes(false);
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
    void cargarEstado(c.cedula);
  }

  function cambiarFecha(fecha: string) {
    if (!fecha || fecha > hoy) return;
    setFechaCorte(fecha);
    if (seleccionado) void cargarEstado(seleccionado.cedula, fecha);
  }

  const esCorteHoy = fechaCorte === hoy;
  const r = estado?.resumen;
  const diaHoy = r?.dias.find((d) => d.fecha === fechaCorte) ?? null;
  // Lo pendiente por entregar es el acumulado liberado menos lo ya entregado
  // en la quincena (incluye lo represado de días anteriores sin pagar).
  const disponible = r?.disponible ?? 0;

  useEffect(() => {
    setValorEntrega(disponible > 0 ? String(Math.floor(disponible)) : "");
  }, [disponible]);

  function aprobar() {
    if (!seleccionado || !estado) return;
    setResultado(null);
    startTransition(async () => {
      // Identidad, viajes de soporte y tope se resuelven en el servidor;
      // del cliente solo viajan cédula, valor y observación.
      const res = await registrarEntrega({
        cedula: seleccionado.cedula,
        valor: Number(valorEntrega),
        observacion: observacion.trim() || null,
      });
      if (res.success) {
        setResultado({ ok: true, msg: "Entrega registrada (cuenta 281505010, débito)." });
        setObservacion("");
        void cargarEstado(seleccionado.cedula);
      } else {
        setResultado({ ok: false, msg: res.error ?? "No se pudo registrar la entrega." });
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Tesorería · Caja de devengados</h1>
            <input
              type="date"
              value={fechaCorte}
              max={hoy}
              onChange={(e) => cambiarFecha(e.target.value)}
              title="Fecha de corte (para consultar quincenas anteriores)"
              className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs outline-none focus:border-[#4F46E5]"
            />
            {esSimulada && (
              <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
                Fecha operativa de prueba: {hoy}
              </span>
            )}
            {!esCorteHoy && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Consulta histórica · solo lectura
              </span>
            )}
          </div>
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar conductor por nombre, cédula o código..."
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
      </div>

      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {!seleccionado && (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-12 text-center text-sm text-gray-500">
            <Banknote className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            Busca un conductor para ver su registro diario acumulado y el excedente a entregar.
            <p className="mt-2 text-xs text-gray-400">
              Base diaria vigente: {cop.format(baseDiaria)} (parametrizada)
            </p>
          </div>
        )}

        {cargando && (
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando el acumulado de la quincena...
          </div>
        )}

        {errorCarga && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorCarga}
          </div>
        )}

        {estado && r && seleccionado && (
          <>
            {/* Alerta de acumulado en déficit */}
            {r.saldoAcumulado < 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Retenido – déficit acumulado</p>
                  <p>
                    Al corte del {fechaCorte} la producción acumulada ({cop.format(r.produccionAcum)}) no
                    cubre la base acumulada exigida ({cop.format(r.baseAcum)}). Diferencia:{" "}
                    {cop.format(r.saldoAcumulado)}. La entrega queda bloqueada hasta que el
                    acumulado se recupere.
                  </p>
                </div>
              </div>
            )}

            {/* Registro del día acumulado (no por viajes) */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Salario neto del día (producción)"
                value={cop.format(diaHoy?.produccion ?? estado.produccionDia)}
                tone={(diaHoy?.produccion ?? 0) >= estado.baseDiaria ? "ok" : "warn"}
                hint={`Del cierre GEMA · Base del día: ${cop.format(estado.baseDiaria)}${
                  (diaHoy?.produccion ?? 0) < estado.baseDiaria
                    ? ` · faltan ${cop.format(estado.baseDiaria - (diaHoy?.produccion ?? 0))}`
                    : " · cubierta"
                }`}
              />
              <StatCard
                label={`Diferencia acumulada (corte al ${fechaCorte})`}
                value={cop.format(r.saldoAcumulado)}
                tone={r.saldoAcumulado >= 0 ? "ok" : "bad"}
                hint={`Producción ${cop.format(r.produccionAcum)} vs base ${cop.format(r.baseAcum)} · Q${estado.quincena.quincena} desde ${estado.quincena.ini}`}
              />
              <StatCard
                label="Excedente del día (a entregar hoy)"
                value={cop.format(diaHoy?.entregarHoy ?? 0)}
                tone={(diaHoy?.entregarHoy ?? 0) > 0 ? "ok" : "neutral"}
                hint="Incremento liberado por el día, corte a corte"
              />
              <StatCard
                label="Pendiente por entregar (acumulado)"
                value={cop.format(disponible)}
                tone={disponible > 0 ? "ok" : "neutral"}
                hint={
                  r.entregado > 0
                    ? `Liberado ${cop.format(r.excedenteAcum)} − entregado ${cop.format(r.entregado)}`
                    : `Liberado acumulado al ${fechaCorte} sin entregas registradas`
                }
              />
            </div>

            {/* Simulación diaria de la quincena (como la hoja del Excel) */}
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#F1F5F9] px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  Registro diario · {estado.quincena.periodo} Q{estado.quincena.quincena} (corte al {fechaCorte})
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
                        <th className="px-4 py-2">Estado / Alerta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.dias.map((d) => {
                        const est = estadoDia(d);
                        const esHoy = d.fecha === fechaCorte;
                        return (
                          <tr
                            key={d.fecha}
                            className={`border-b border-[#F1F5F9] ${
                              esHoy ? "bg-[#EEF2FF]" : ""
                            }`}
                          >
                            <td className="px-4 py-2 font-medium">
                              {d.fecha}
                              {esHoy && (
                                <span className="ml-1 text-xs text-[#4F46E5]">
                                  {esCorteHoy ? "(hoy)" : "(corte)"}
                                </span>
                              )}
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
                            <td className="px-4 py-2">
                              <span
                                className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: est.bg, color: est.color }}
                              >
                                {est.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Viajes del día: solo referencia/soporte, la entrega es por día acumulado */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white">
              <button
                onClick={() => setVerViajes((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700"
              >
                {verViajes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Detalle de viajes del día ({estado.viajesDia.length}) — solo soporte (la producción es el salario neto del cierre)
              </button>
              {verViajes && (
                <div className="overflow-x-auto border-t border-[#F1F5F9]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2">Viaje</th>
                        <th className="px-4 py-2">Ruta</th>
                        <th className="px-4 py-2">Vehículo</th>
                        <th className="px-4 py-2">Despacho</th>
                        <th className="px-4 py-2 text-right">Neto</th>
                        <th className="px-4 py-2">Novedad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estado.viajesDia.map((v) => (
                        <tr key={v.numero} className="border-b border-[#F1F5F9]">
                          <td className="px-4 py-2">{v.viaje ?? v.numero}</td>
                          <td className="px-4 py-2">{v.ruta ?? "—"}</td>
                          <td className="px-4 py-2">{v.placa ?? v.codigo_vehiculo ?? "—"}</td>
                          <td className="px-4 py-2">{v.hora_despacho ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-medium">{cop.format(v.neto ?? 0)}</td>
                          <td className="px-4 py-2 text-xs">{v.novedad ?? v.estado ?? "—"}</td>
                        </tr>
                      ))}
                      {estado.viajesDia.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                            Sin viajes recaudados hoy (GEMA puede reportar con atraso).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Aprobación de la entrega del día (solo con corte en el día actual) */}
            {!esCorteHoy ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Estás consultando el corte del {fechaCorte} (histórico). Las entregas solo se
                registran con la fecha de hoy ({hoy}); vuelve al día actual para aprobar una
                entrega.
              </div>
            ) : (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Entrega del día</h2>
              <p className="mt-1 text-xs text-gray-500">
                Pendiente por entregar al corte del {hoy}: <strong>{cop.format(disponible)}</strong>
                {estado.entregadoDia > 0 && <> · ya entregado hoy: {cop.format(estado.entregadoDia)}</>}
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Valor a entregar
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(disponible)}
                    value={valorEntrega}
                    onChange={(e) => setValorEntrega(e.target.value)}
                    className="w-40 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Observación (opcional)
                  </label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <button
                  onClick={aprobar}
                  disabled={pending || disponible <= 0 || Number(valorEntrega) <= 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Aprobar entrega
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                La entrega queda en el cierre contable de hoy ({hoy}) — cuenta 281505010, movimiento débito.
              </p>
            </div>
            )}

            {resultado && (
              <div
                className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${
                  resultado.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {resultado.ok ? <CircleCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                {resultado.msg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
