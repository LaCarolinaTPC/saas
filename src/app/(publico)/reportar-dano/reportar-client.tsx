"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Wrench } from "lucide-react";
import {
  crearReportePublico,
  identificarConductor,
  type ConceptoPublico,
  type VehiculoPublico,
} from "./actions";

type Paso =
  | { nombre: "cedula" }
  | { nombre: "formulario"; conductor: string; vehiculos: VehiculoPublico[]; conceptos: ConceptoPublico[] }
  | { nombre: "listo"; vehiculo: string; concepto: string };

// Pensado para el celular del conductor: un dato por pantalla, campos altos y
// texto grande. Nada de tablas ni de menús.
const campo = "mt-2 w-full rounded-xl border border-[#CBD5E1] bg-white p-4 text-lg text-gray-900";
const boton = "mt-6 w-full rounded-xl bg-[#4F46E5] p-4 text-lg font-semibold text-white disabled:opacity-50";

export function ReportarClient() {
  const [paso, setPaso] = useState<Paso>({ nombre: "cedula" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [codigoVehiculo, setCodigoVehiculo] = useState("");
  const [conceptoId, setConceptoId] = useState("");
  const [descripcion, setDescripcion] = useState("");

  function identificar() {
    setError(null);
    startTransition(async () => {
      const res = await identificarConductor(cedula);
      if (!res.success) return setError(res.error);
      setPaso({ nombre: "formulario", conductor: res.nombre, vehiculos: res.vehiculos, conceptos: res.conceptos });
    });
  }

  function enviar() {
    setError(null);
    startTransition(async () => {
      const res = await crearReportePublico({ cedula, codigoVehiculo, conceptoId, descripcion });
      if (!res.success) return setError(res.error ?? "No se pudo enviar el reporte.");
      setPaso({ nombre: "listo", vehiculo: res.vehiculo ?? "", concepto: res.concepto ?? "" });
    });
  }

  function otro() {
    setCodigoVehiculo("");
    setConceptoId("");
    setDescripcion("");
    setError(null);
    setPaso({ nombre: "cedula" });
    setCedula("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col p-5">
      <header className="flex items-center gap-3 py-6">
        <Wrench className="h-7 w-7 text-[#4F46E5]" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportar daño</h1>
          <p className="text-sm text-gray-500">Transportes La Carolina</p>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-base text-red-800">{error}</p>}

      {paso.nombre === "cedula" && (
        <section>
          <label className="block text-base text-gray-700">
            Tu número de cédula
            <input
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              className={campo}
            />
          </label>
          <button type="button" onClick={identificar} disabled={pending || !cedula} className={boton}>
            {pending ? "Verificando…" : "Continuar"}
          </button>
        </section>
      )}

      {paso.nombre === "formulario" && (
        <section>
          <p className="rounded-xl bg-[#EEF2FF] p-4 text-base text-[#3730A3]">
            Hola, <strong>{paso.conductor}</strong>
          </p>

          <label className="mt-5 block text-base text-gray-700">
            Vehículo
            <select value={codigoVehiculo} onChange={(e) => setCodigoVehiculo(e.target.value)} className={campo}>
              <option value="">Selecciona el vehículo</option>
              {paso.vehiculos.map((v) => (
                <option key={v.codigo} value={v.codigo}>
                  {v.placa ? `${v.codigo} — ${v.placa}` : v.codigo}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-5 block text-base text-gray-700">
            Tipo de daño
            <select value={conceptoId} onChange={(e) => setConceptoId(e.target.value)} className={campo}>
              <option value="">Selecciona el tipo de daño</option>
              {paso.conceptos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>

          <label className="mt-5 block text-base text-gray-700">
            ¿Qué pasó? <span className="text-gray-400">(opcional)</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              className={campo}
            />
          </label>

          <button
            type="button"
            onClick={enviar}
            disabled={pending || !codigoVehiculo || !conceptoId}
            className={boton}
          >
            {pending ? "Enviando…" : "Enviar reporte"}
          </button>
        </section>
      )}

      {paso.nombre === "listo" && (
        <section className="text-center">
          <CheckCircle2 className="mx-auto mt-8 h-16 w-16 text-emerald-600" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Reporte enviado</h2>
          <p className="mt-2 text-base text-gray-600">
            {paso.concepto} en el vehículo {paso.vehiculo}. Mantenimiento ya lo tiene.
          </p>
          <button type="button" onClick={otro} className={boton}>Reportar otro daño</button>
        </section>
      )}
    </main>
  );
}
