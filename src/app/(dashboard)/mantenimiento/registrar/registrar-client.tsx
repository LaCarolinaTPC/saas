"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, UserCheck, X } from "lucide-react";
import { crearReporteMantenimiento } from "../actions";

type Vehiculo = { codigo: string; placa: string | null; marca: string | null; clase: string | null; ruta: string | null; cedula_conductor: string | null };
type Conductor = { cedula: string; nombre: string; codigo: string | null };
type Concepto = { id: string; nombre: string };

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-gray-900";

function ahoraLocal() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

// El maestro identifica el vehículo por código; la placa es el dato con el que
// la operación lo reconoce, así que se muestran juntos.
function etiquetaVehiculo(v: { codigo: string; placa: string | null }) {
  return v.placa ? `${v.codigo} — ${v.placa}` : v.codigo;
}

export function RegistrarDanoClient({ vehiculos, conductores, conceptos, erroresCarga, puedeEditar }: {
  vehiculos: Vehiculo[];
  conductores: Conductor[];
  conceptos: Concepto[];
  erroresCarga: string[];
  puedeEditar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fecha, setFecha] = useState(ahoraLocal());
  const [codigoVehiculo, setCodigoVehiculo] = useState("");
  const [conceptoId, setConceptoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  // El registro arranca identificando al conductor, igual que la caja de
  // devengados: son casi doscientos activos y un desplegable no se navega.
  const [busqueda, setBusqueda] = useState("");
  const [conductor, setConductor] = useState<Conductor | null>(null);
  const disabled = pending || erroresCarga.length > 0;
  const vehiculo = vehiculos.find((v) => v.codigo === codigoVehiculo);

  const sugerencias = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q || conductor) return [];
    return conductores
      .filter((c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.cedula.includes(q) ||
        (c.codigo?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 8);
  }, [busqueda, conductores, conductor]);

  // Al identificarlo se propone el vehículo que GEMA le tiene asignado, que
  // sigue siendo editable por si ese día condujo otro.
  function elegirConductor(c: Conductor) {
    setConductor(c);
    setBusqueda("");
    setMensaje(null);
    const suyo = vehiculos.find((v) => v.cedula_conductor === c.cedula);
    if (suyo) setCodigoVehiculo(suyo.codigo);
  }

  function limpiar() {
    setConductor(null);
    setCodigoVehiculo("");
    setConceptoId("");
    setDescripcion("");
    setBusqueda("");
  }

  function guardar() {
    if (!conductor) return;
    setMensaje(null);
    startTransition(async () => {
      const res = await crearReporteMantenimiento({ codigoVehiculo, cedula: conductor.cedula, conceptoId, descripcion, fecha });
      setMensaje(res.success ? "Reporte registrado correctamente." : (res.error ?? "No se pudo guardar el reporte."));
      // Cada reporte empieza por identificar a quién reporta.
      if (res.success) { limpiar(); setFecha(ahoraLocal()); }
    });
  }

  if (!puedeEditar) {
    return <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
        Tu perfil puede consultar Mantenimiento pero no registrar daños. Habla con el administrador si necesitas hacerlo.
      </p>
    </div>;
  }

  return <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
    {erroresCarga.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">No se pudieron cargar todos los datos.</p><p className="mt-1">Detalle: {erroresCarga[0]}</p></div>}
    {mensaje && <p className={mensaje.includes("correctamente") ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{mensaje}</p>}

    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      {/* Paso 1: identificar al conductor. Hasta que no haya uno no hay nada
          que registrar, así que los demás campos ni se muestran. */}
      {!conductor ? (
        <div>
          <label htmlFor="buscar-conductor" className="text-sm font-medium text-gray-700">Buscar conductor</label>
          <p className="text-sm text-gray-500">Nombre o número de cédula</p>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="buscar-conductor"
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o cédula..."
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-[#4F46E5]"
            />
            {sugerencias.length > 0 && (
              <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                {sugerencias.map((c) => (
                  <button key={c.cedula} type="button" onClick={() => elegirConductor(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]">
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="whitespace-nowrap text-xs text-gray-500">CC {c.cedula}{c.codigo ? ` · Cód. ${c.codigo}` : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {busqueda.trim() && sugerencias.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">Ningún conductor activo coincide con «{busqueda.trim()}».</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] p-3">
            <span className="flex items-center gap-2 text-sm text-[#3730A3]">
              <UserCheck className="h-4 w-4" />
              <strong>{conductor.nombre}</strong>
              <span className="text-[#4F46E5]">CC {conductor.cedula}{conductor.codigo ? ` · Cód. ${conductor.codigo}` : ""}</span>
            </span>
            <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:underline"><X className="h-4 w-4" />Cambiar conductor</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-600">Vehículo<select value={codigoVehiculo} onChange={(e) => setCodigoVehiculo(e.target.value)} className={inputClass}><option value="">Seleccione</option>{vehiculos.map((v) => <option key={v.codigo} value={v.codigo}>{etiquetaVehiculo(v)}</option>)}</select></label>
            <label className="text-sm text-gray-600">Concepto<select value={conceptoId} onChange={(e) => setConceptoId(e.target.value)} className={inputClass}><option value="">Seleccione</option>{conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
            <label className="text-sm text-gray-600">Fecha y hora<input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} /></label>
            <label className="text-sm text-gray-600">Descripción<input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} /></label>
          </div>
          {vehiculo && <p className="mt-3 text-sm text-gray-500">{[vehiculo.clase, vehiculo.marca, vehiculo.ruta].filter(Boolean).join(" · ")}</p>}
          <button type="button" onClick={guardar} disabled={disabled || !codigoVehiculo || !conceptoId} className="mt-4 w-full rounded-lg bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50 sm:w-auto">{pending ? "Guardando…" : "Guardar reporte"}</button>
        </>
      )}
    </section>
  </div>;
}
