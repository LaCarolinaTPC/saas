"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Banknote, TriangleAlert, CircleCheck, Loader2 } from "lucide-react";
import { registrarEntrega } from "@/lib/devengados/actions";
import type { EstadoConductor, ViajeDia } from "@/lib/devengados/data";

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

export function CajaClient({
  conductores,
  baseDiaria,
  hoy,
}: {
  conductores: Conductor[];
  baseDiaria: number;
  hoy: string;
}) {
  const [query, setQuery] = useState("");
  const [seleccionado, setSeleccionado] = useState<Conductor | null>(null);
  const [estado, setEstado] = useState<EstadoConductor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [viajesSel, setViajesSel] = useState<Set<number>>(new Set());
  const [valorEntrega, setValorEntrega] = useState("");
  const [observacion, setObservacion] = useState("");
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

  async function cargarEstado(cedula: string) {
    setCargando(true);
    setErrorCarga(null);
    setEstado(null);
    setViajesSel(new Set());
    setResultado(null);
    try {
      const res = await fetch(
        `/api/devengados/estado?cedula=${cedula}&fecha=${hoy}`
      );
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

  // Cruce del día: lo ya liquidado cuenta como base cubierta; la selección
  // primero termina de cubrir la base y el resto es excedente.
  const netoLiquidado = useMemo(
    () =>
      (estado?.viajesDia ?? [])
        .filter((v) => v.liquidado)
        .reduce((s, v) => s + (v.neto ?? 0), 0),
    [estado]
  );
  const totalSeleccion = useMemo(
    () =>
      (estado?.viajesDia ?? [])
        .filter((v) => viajesSel.has(v.numero))
        .reduce((s, v) => s + (v.neto ?? 0), 0),
    [estado, viajesSel]
  );
  const basePendiente = Math.max(0, (estado?.baseDiaria ?? baseDiaria) - netoLiquidado);
  const aBase = Math.min(totalSeleccion, basePendiente);
  const aExcedente = Math.max(0, totalSeleccion - aBase);
  const disponible = estado?.resumen.disponible ?? 0;
  const maxEntrega = Math.min(aExcedente, disponible);

  useEffect(() => {
    setValorEntrega(maxEntrega > 0 ? String(Math.floor(maxEntrega)) : "");
  }, [maxEntrega]);

  function toggleViaje(v: ViajeDia) {
    if (v.liquidado) return;
    setViajesSel((prev) => {
      const next = new Set(prev);
      if (next.has(v.numero)) next.delete(v.numero);
      else next.add(v.numero);
      return next;
    });
  }

  function aprobar() {
    if (!seleccionado || !estado) return;
    setResultado(null);
    startTransition(async () => {
      const res = await registrarEntrega({
        cedula: seleccionado.cedula,
        codigo: seleccionado.codigo,
        nombre: seleccionado.nombre,
        viajes: [...viajesSel],
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

  const r = estado?.resumen;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Devengados · Caja</h1>
            <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
              {hoy}
            </span>
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
            Busca un conductor para ver sus viajes del día y el excedente disponible.
            <p className="mt-2 text-xs text-gray-400">
              Base diaria vigente: {cop.format(baseDiaria)} (parametrizada)
            </p>
          </div>
        )}

        {cargando && (
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando viajes y acumulado de la quincena...
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
            {r.enAlerta && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Protección de base activa</p>
                  <p>
                    El acumulado de la quincena {r.saldoAcumulado < 0 ? "está en déficit" : "retuvo excedentes de días anteriores"}
                    {" "}({cop.format(r.saldoAcumulado)}). Solo se libera excedente cuando la
                    producción acumulada supere la base acumulada exigida.
                  </p>
                </div>
              </div>
            )}

            {/* Estado del día y la quincena */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Base del día" value={cop.format(estado.baseDiaria)} hint="Parámetro de empresa" />
              <StatCard
                label="Producción del día"
                value={cop.format(estado.produccionDia)}
                tone={estado.produccionDia >= estado.baseDiaria ? "ok" : "warn"}
                hint={
                  estado.produccionDia >= estado.baseDiaria
                    ? "Base del día cubierta"
                    : `Faltan ${cop.format(estado.baseDiaria - estado.produccionDia)} para la base`
                }
              />
              <StatCard
                label="Saldo quincena (corte a corte)"
                value={cop.format(r.saldoAcumulado)}
                tone={r.saldoAcumulado >= 0 ? "ok" : "bad"}
                hint={`Producción ${cop.format(r.produccionAcum)} vs base ${cop.format(r.baseAcum)}`}
              />
              <StatCard
                label="Excedente disponible"
                value={cop.format(disponible)}
                tone={disponible > 0 ? "ok" : "neutral"}
                hint={r.entregado > 0 ? `Ya entregado en la quincena: ${cop.format(r.entregado)}` : undefined}
              />
            </div>

            {/* Viajes del día */}
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#F1F5F9] px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  Viajes del día pendientes de liquidar
                </h2>
                <p className="text-xs text-gray-500">
                  Selecciona los viajes que el conductor va a liquidar en caja.
                </p>
              </div>
              {estado.viajesDia.length === 0 ? (
                <p className="p-6 text-sm text-gray-500">
                  Sin viajes recaudados registrados hoy para este conductor. GEMA puede
                  reportarlos con atraso.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2"></th>
                        <th className="px-4 py-2">Viaje</th>
                        <th className="px-4 py-2">Ruta</th>
                        <th className="px-4 py-2">Vehículo</th>
                        <th className="px-4 py-2">Despacho</th>
                        <th className="px-4 py-2 text-right">Neto</th>
                        <th className="px-4 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estado.viajesDia.map((v) => (
                        <tr
                          key={v.numero}
                          onClick={() => toggleViaje(v)}
                          className={`border-b border-[#F1F5F9] ${
                            v.liquidado
                              ? "bg-[#F8FAFC] text-gray-400"
                              : "cursor-pointer hover:bg-[#F8FAFC]"
                          }`}
                        >
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={viajesSel.has(v.numero)}
                              disabled={v.liquidado}
                              readOnly
                            />
                          </td>
                          <td className="px-4 py-2">{v.viaje ?? v.numero}</td>
                          <td className="px-4 py-2">{v.ruta ?? "—"}</td>
                          <td className="px-4 py-2">{v.placa ?? v.codigo_vehiculo ?? "—"}</td>
                          <td className="px-4 py-2">{v.hora_despacho ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {cop.format(v.neto ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {v.liquidado ? "Liquidado" : v.novedad ?? v.estado ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cruce y aprobación */}
            {viajesSel.size > 0 && (
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-900">Cruce contra la base del día</h2>
                <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Total seleccionado" value={cop.format(totalSeleccion)} />
                  <StatCard label="Cubre base del día" value={cop.format(aBase)} tone="warn" />
                  <StatCard label="Clasifica como otros devengados" value={cop.format(aExcedente)} tone="ok" />
                  <StatCard
                    label="Entregable (limitado por quincena)"
                    value={cop.format(maxEntrega)}
                    tone={maxEntrega > 0 ? "ok" : "bad"}
                    hint={maxEntrega < aExcedente ? "El acumulado quincenal retiene parte del excedente" : undefined}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Valor a entregar
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={Math.floor(maxEntrega)}
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
                    disabled={pending || maxEntrega <= 0 || Number(valorEntrega) <= 0}
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
