"use client";

import { useState, useTransition } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { RegistroFrenos, VehiculoFrenos } from "@/lib/mantenimiento/frenos";
import { contarRegistrosDelDia, registrarGraduacionFrenos } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-gray-900";
const fmtFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

function etiqueta(v: { codigo: string; placa: string | null }) {
  return v.placa ? `${v.codigo} — ${v.placa}` : v.codigo;
}

export function FrenosClient({ vehiculos, ultimos, hoy, erroresCarga, puedeEditar }: {
  vehiculos: VehiculoFrenos[];
  ultimos: RegistroFrenos[];
  hoy: string;
  erroresCarga: string[];
  puedeEditar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [codigoVehiculo, setCodigoVehiculo] = useState("");
  const [graduacion, setGraduacion] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [duplicados, setDuplicados] = useState(0);
  const disabled = pending || erroresCarga.length > 0;

  // Aviso no bloqueante: repetir vehículo y día es válido, pero casi siempre
  // es un descuido. Se consulta al cambiar cualquiera de los dos campos.
  function revisarDuplicados(codigo: string, dia: string) {
    if (!codigo || !dia) return setDuplicados(0);
    contarRegistrosDelDia(codigo, dia).then((r) => setDuplicados(r.count));
  }

  function cambiarVehiculo(codigo: string) {
    setCodigoVehiculo(codigo);
    revisarDuplicados(codigo, fecha);
  }

  function cambiarFecha(dia: string) {
    setFecha(dia);
    revisarDuplicados(codigoVehiculo, dia);
  }

  function guardar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await registrarGraduacionFrenos({ fecha, codigoVehiculo, graduacion, observacion });
      if (!res.success) return setMensaje({ ok: false, texto: res.error ?? "No se pudo guardar." });
      setMensaje({
        ok: true,
        texto: graduacion
          ? "Graduación registrada."
          : "Registro guardado sin graduación, con la observación.",
      });
      // Se conserva la fecha para encadenar varios vehículos del mismo día.
      setCodigoVehiculo("");
      setDuplicados(0);
      setGraduacion(false);
      setObservacion("");
    });
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    {erroresCarga.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">No se pudieron cargar todos los datos.</p><p className="mt-1">Detalle: {erroresCarga[0]}</p></div>}
    {mensaje && <p className={mensaje.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{mensaje.texto}</p>}

    {puedeEditar && <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Registrar graduación</h2>
      <p className="mt-1 text-sm text-gray-500">Bitácora del formato CPA-R-31 del SGC.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-gray-600">Fecha
          <input type="date" value={fecha} max={hoy} onChange={(e) => cambiarFecha(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm text-gray-600">Vehículo
          <select value={codigoVehiculo} onChange={(e) => cambiarVehiculo(e.target.value)} className={inputClass}>
            <option value="">Seleccione</option>
            {vehiculos.map((v) => <option key={v.codigo} value={v.codigo}>{etiqueta(v)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
          <input type="checkbox" checked={graduacion} onChange={(e) => setGraduacion(e.target.checked)} className="h-4 w-4" />
          Se realizó la graduación
        </label>
      </div>

      <label className="mt-3 block text-sm text-gray-600">
        Observación {graduacion
          ? <span className="text-gray-400">(opcional: hallazgos o pendientes del sistema de frenos)</span>
          : <span className="font-medium text-amber-700">obligatoria: explica por qué no se realizó</span>}
        <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} rows={2} className={inputClass} />
      </label>

      {duplicados > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Este vehículo ya tiene {duplicados} registro{duplicados === 1 ? "" : "s"} en esa fecha. Puedes guardar de todos modos.
      </p>}

      <button type="button" onClick={guardar} disabled={disabled || !codigoVehiculo} className="mt-3 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">
        {pending ? "Guardando…" : "Guardar registro"}
      </button>
    </section>}

    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="border-b border-[#E2E8F0] px-4 py-3"><h2 className="font-semibold text-gray-900">Últimos registros</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
            <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Vehículo</th><th className="px-4 py-3">Graduación</th><th className="px-4 py-3">Observación</th><th className="px-4 py-3">Registró</th></tr>
          </thead>
          <tbody>
            {ultimos.map((r) => <tr key={r.id} className="border-t border-[#F1F5F9]">
              <td className="px-4 py-3">{fmtFecha.format(new Date(`${r.fecha}T00:00:00Z`))}</td>
              <td className="px-4 py-3 font-medium">{r.codigo_vehiculo}{r.vehiculos?.placa ? ` — ${r.vehiculos.placa}` : ""}</td>
              <td className="px-4 py-3">{r.graduacion
                ? <span className="inline-flex items-center gap-1 text-emerald-700"><CircleCheck className="h-4 w-4" />Sí</span>
                : <span className="inline-flex items-center gap-1 text-amber-700"><CircleX className="h-4 w-4" />No</span>}</td>
              <td className="px-4 py-3">{r.observacion ?? "—"}</td>
              <td className="px-4 py-3 text-gray-500">{r.registrado_por_email ?? "—"}</td>
            </tr>)}
            {ultimos.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Aún no hay registros de graduación.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
