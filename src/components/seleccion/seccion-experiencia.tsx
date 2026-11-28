"use client";

/**
 * «Experiencia y referencias» en el Resumen de la ficha: los empleos del
 * aspirante (de la hoja de vida o escritos a mano), cada uno sin verificar
 * hasta que llegue la carta laboral o se llame a la referencia, y las
 * referencias con su llamada.
 */
import { useCallback, useEffect, useState } from "react";
import { confirmar } from "@/components/ui/confirmar";
import { BriefcaseBusiness, Phone } from "lucide-react";
import { guardarEmpleoFicha, marcarVerificacionFicha } from "@/app/(dashboard)/candidatos/entrega4-actions";
import { ETIQUETA_COMO, ETIQUETA_VERIFICACION, type EstadoExperiencia, type ExperienciaLaboral } from "@/lib/seleccion/experiencia";
import type { ExperienciaVista, ReferenciaResumen } from "@/lib/seleccion/experiencia-servidor";
import { botonPri, botonSec, campo, fechaHora, useAccion } from "./seccion-entrega3";
import { leerFicha } from "@/lib/lectura-ficha";

const COLOR_ESTADO: Record<EstadoExperiencia, string> = {
  sin_datos: "bg-gray-100 text-gray-600",
  sin_verificar: "bg-amber-50 text-amber-800",
  parcial: "bg-amber-50 text-amber-800",
  verificada: "bg-emerald-50 text-emerald-700",
  con_problema: "bg-red-50 text-red-700",
};
const NOMBRE_ESTADO: Record<EstadoExperiencia, string> = {
  sin_datos: "Sin datos",
  sin_verificar: "Sin verificar",
  parcial: "Verificada en parte",
  verificada: "Verificada",
  con_problema: "Con problema",
};
const COLOR_VERIFICACION = { sin_verificar: "text-amber-700", verificada: "text-emerald-700", no_confirmada: "text-red-700" } as const;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mes = (v: string | null) => {
  if (!v) return "¿?";
  if (v === "actual") return "hoy";
  const [a, m] = v.split("-");
  return m ? `${MESES[Number(m) - 1] ?? m} ${a}` : a;
};

type Datos = { experiencia: ExperienciaVista; referencias: ReferenciaResumen[]; puedeEditar: boolean };
const VACIO = { empresa: "", cargo: "", desde: "", hasta: "", actual: false, vehiculo: "", conduccion: true };

export function SeccionExperiencia({ procesoId, version }: { procesoId: string; version: number }) {
  const [datos, setDatos] = useState<Datos | { error: string } | null>(null);
  const [propia, setPropia] = useState(0);
  const [form, setForm] = useState<typeof VACIO | null>(null);
  useEffect(() => {
    let vivo = true;
    leerFicha("datosExperiencia", procesoId)
      .then((d) => vivo && setDatos(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [procesoId, version, propia]);
  const recargar = useCallback(() => setPropia((n) => n + 1), []);
  const { mensaje, ocupado, correr } = useAccion(recargar);

  if (!datos) return null;
  if ("error" in datos) return <p className="text-sm text-red-700">{datos.error}</p>;
  const { experiencia: ex, referencias, puedeEditar } = datos;
  if (!ex.disponible) return null; // sin la migración de la experiencia laboral
  const r = ex.resumen;

  const verificar = (e: ExperienciaLaboral, como: "carta_laboral" | "referencia") =>
    correr(() => marcarVerificacionFicha(procesoId, e.id, "verificada", como, ""), "Empleo verificado.");
  const noConfirmo = (e: ExperienciaLaboral) => {
    const nota = prompt("¿Qué pasó? Por ejemplo: la empresa no lo reconoce, las fechas no coinciden.");
    if (nota?.trim()) correr(() => marcarVerificacionFicha(procesoId, e.id, "no_confirmada", null, nota), "Marcado como no confirmado.");
  };

  return (
    <section className="rounded-lg border border-[#F1F5F9] p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <BriefcaseBusiness className="h-4 w-4" /> Experiencia y referencias
        </h4>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_ESTADO[r.estado]}`}>{NOMBRE_ESTADO[r.estado]}</span>
      </div>
      <p className="text-xs text-gray-600">{r.texto}</p>
      {r.estado !== "sin_datos" && (
        <p className="mt-1 text-xs text-gray-600">
          Conducción: <strong>{r.mesesDeclarados} meses</strong> según lo declarado · <strong>{r.mesesVerificados}</strong> verificados
          {r.sinFecha ? ` · ${r.sinFecha} sin fecha completa (no se cuentan)` : ""}
          {ex.experienciaMeses != null && ex.experienciaMeses !== r.mesesDeclarados ? ` · el dato «Experiencia» del proceso dice ${ex.experienciaMeses} meses` : ""}
        </p>
      )}

      {ex.items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {ex.items.map((e) => (
            <li key={e.id} className="rounded-md bg-gray-50 px-2 py-1.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-gray-900">{e.empresa ?? "Empresa sin nombre"}</span>
                {e.cargo && <span className="text-gray-700">{e.cargo}</span>}
                <span className="text-xs text-gray-500">
                  {mes(e.desde)} – {mes(e.hasta)}
                  {e.vehiculo ? ` · ${e.vehiculo}` : ""}
                </span>
                {e.conduccion && <span className="rounded bg-[#EEF2FF] px-1.5 text-[10px] text-[#4F46E5]">conducción</span>}
                {e.origen === "manual" && <span className="rounded bg-gray-200 px-1.5 text-[10px] text-gray-600">escrito a mano</span>}
              </div>
              <p className={`text-xs ${COLOR_VERIFICACION[e.verificacion]}`}>
                {ETIQUETA_VERIFICACION[e.verificacion]}
                {e.verificacion === "verificada" && e.como ? ` ${ETIQUETA_COMO[e.como]}` : ""}
                {e.verificacion === "sin_verificar" ? ": a la espera de la carta laboral o de llamar a una referencia de esta empresa" : ""}
                {e.verificada_por ? <span className="text-gray-400"> · {e.verificada_por} · {fechaHora(e.verificada_at)}</span> : null}
              </p>
              {e.nota && <p className="text-[11px] text-gray-500">{e.nota}</p>}
              {e.diferencias && <p className="text-[11px] font-medium text-amber-700">Diferencias con la hoja de vida: {e.diferencias}.</p>}
              {e.declarado && <p className="text-[11px] text-gray-500">La hoja de vida decía {e.declarado}; quedaron las fechas de la carta.</p>}
              {puedeEditar && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {e.verificacion !== "verificada" && (
                    <>
                      <button type="button" disabled={ocupado} className="text-emerald-700 hover:underline" onClick={() => verificar(e, "carta_laboral")}>
                        Verificada con carta
                      </button>
                      <button type="button" disabled={ocupado} className="text-emerald-700 hover:underline" onClick={() => verificar(e, "referencia")}>
                        Verificada con referencia
                      </button>
                    </>
                  )}
                  {e.verificacion !== "no_confirmada" && (
                    <button type="button" disabled={ocupado} className="text-red-700 hover:underline" onClick={() => noConfirmo(e)}>
                      No se confirmó
                    </button>
                  )}
                  {e.verificacion !== "sin_verificar" && (
                    <button
                      type="button"
                      disabled={ocupado}
                      className="text-gray-500 hover:underline"
                      onClick={() => correr(() => marcarVerificacionFicha(procesoId, e.id, "sin_verificar", null, ""), "Vuelve a quedar sin verificar.")}
                    >
                      Deshacer
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={ocupado}
                    className="text-gray-400 hover:underline"
                    onClick={async () => await confirmar(`¿Quitar el empleo en ${e.empresa ?? "esta empresa"}?`) && correr(() => guardarEmpleoFicha(procesoId, { id: e.id }, true), "Empleo quitado.")}
                  >
                    quitar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar &&
        (form ? (
          <div
            className="mt-2 grid gap-2 rounded-md border border-dashed border-[#E2E8F0] p-2 sm:grid-cols-3">
            <label className="text-xs text-gray-500">
              Empresa
              <input value={form.empresa} maxLength={120} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className={`${campo} mt-0.5`} />
            </label>
            <label className="text-xs text-gray-500">
              Cargo
              <input value={form.cargo} maxLength={120} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className={`${campo} mt-0.5`} />
            </label>
            <label className="text-xs text-gray-500">
              Vehículo
              <input value={form.vehiculo} maxLength={60} placeholder="bus, buseta, camión…" onChange={(e) => setForm({ ...form, vehiculo: e.target.value })} className={`${campo} mt-0.5`} />
            </label>
            <label className="text-xs text-gray-500">
              Desde
              <input type="month" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} className={`${campo} mt-0.5`} />
            </label>
            <label className="text-xs text-gray-500">
              Hasta
              <input type="month" disabled={form.actual} value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} className={`${campo} mt-0.5`} />
            </label>
            <div className="flex flex-col justify-end gap-1 text-xs text-gray-600">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.checked })} /> Trabaja ahí todavía
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={form.conduccion} onChange={(e) => setForm({ ...form, conduccion: e.target.checked })} /> Era de conducción
              </label>
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <button type="button" onClick={() => { const empleo = { empresa: form.empresa, cargo: form.cargo, desde: form.desde || null, hasta: form.actual ? "actual" : form.hasta || null, vehiculo: form.vehiculo, conduccion: form.conduccion };
              correr(() => guardarEmpleoFicha(procesoId, empleo), "Empleo agregado, sin verificar.", () => setForm(null)); }} className={botonPri} disabled={ocupado}>
                Agregar
              </button>
              <button type="button" className={botonSec} onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="mt-2 text-xs text-[#4F46E5] hover:underline" onClick={() => setForm(VACIO)}>
            Agregar un empleo a mano
          </button>
        ))}

      <div className="mt-3">
        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
          <Phone className="h-3.5 w-3.5" /> Referencias ({referencias.length})
        </p>
        {referencias.length === 0 ? (
          <p className="text-xs text-gray-500">Sin referencias todavía. Se agregan solas al aceptar la hoja de vida o la carta laboral, o a mano en la pestaña Carpeta.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {referencias.map((ref) => (
              <li key={ref.id} className="flex flex-wrap gap-x-2 text-gray-700">
                <span className="font-medium">{ref.nombre}</span>
                {ref.telefono && <span>{ref.telefono}</span>}
                <span className="text-gray-500">
                  {ref.tipo}
                  {ref.empresa ? ` · ${ref.empresa}` : ""}
                </span>
                {ref.validadaAt ? (
                  <span className="text-emerald-700">
                    Llamada: habló con {ref.habloCon}
                    {ref.resultado ? ` — ${ref.resultado}` : ""}
                  </span>
                ) : (
                  <span className="text-amber-700">Por llamar (se registra en la pestaña Carpeta)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {mensaje && <p className="mt-2 text-xs text-gray-600">{mensaje}</p>}
    </section>
  );
}
