"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ClipboardList, Wrench } from "lucide-react";
import { cerrarAlertaMantenimiento, crearBusetaMantenimiento, crearReporteMantenimiento } from "./actions";

type Buseta = { placa: string; numero_interno: string | null };
type Concepto = { id: string; nombre: string };
type Reporte = { id: string; placa_buseta: string; cedula_conductor: string; descripcion: string | null; fecha_reporte: string; alerta_id: string | null; mantenimiento_conceptos: { nombre: string }[]; conductores: { nombre: string }[] };
type Alerta = { id: string; placa_buseta: string; cantidad: number; created_at: string; mantenimiento_conceptos: { nombre: string }[] };
type Cierre = { orden: string; notas: string };

const inputClass = "mt-1 w-full rounded-lg border border-[#E2E8F0] p-2 text-gray-900";
const fmt = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

function ahoraLocal() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function MantenimientoClient({ busetas, conceptos, reportes, alertas, erroresCarga, puedeEditar }: { busetas: Buseta[]; conceptos: Concepto[]; reportes: Reporte[]; alertas: Alerta[]; erroresCarga: string[]; puedeEditar: boolean }) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fecha, setFecha] = useState(ahoraLocal());
  const [placa, setPlaca] = useState("");
  const [cedula, setCedula] = useState("");
  const [conceptoId, setConceptoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [nuevaBuseta, setNuevaBuseta] = useState({ placa: "", numeroInterno: "", descripcion: "" });
  const [cierres, setCierres] = useState<Record<string, Cierre>>({});
  const disabled = pending || erroresCarga.length > 0;

  function result(res: { success: boolean; error?: string }, ok: string) {
    setMensaje(res.success ? ok : (res.error ?? "No se pudo completar la operación."));
  }

  function guardarReporte() {
    setMensaje(null);
    startTransition(async () => {
      const res = await crearReporteMantenimiento({ placa, cedula, conceptoId, descripcion, fecha });
      result(res, "Reporte registrado correctamente.");
      if (res.success) { setCedula(""); setConceptoId(""); setDescripcion(""); setFecha(ahoraLocal()); }
    });
  }

  function guardarBuseta() {
    setMensaje(null);
    startTransition(async () => {
      const res = await crearBusetaMantenimiento(nuevaBuseta);
      result(res, "Buseta agregada al maestro.");
      if (res.success) setNuevaBuseta({ placa: "", numeroInterno: "", descripcion: "" });
    });
  }

  function cerrar(alertaId: string) {
    const cierre = cierres[alertaId] ?? { orden: "", notas: "" };
    setMensaje(null);
    startTransition(async () => result(await cerrarAlertaMantenimiento({ alertaId, ordenTaller: cierre.orden, notasCierre: cierre.notas }), "Alerta cerrada y auditada."));
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    {erroresCarga.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">No se pudieron cargar todos los datos de Mantenimiento.</p><p className="mt-1">Detalle: {erroresCarga[0]}</p></div>}
    {mensaje && <p className={mensaje.includes("correctamente") || mensaje.includes("agregada") || mensaje.includes("cerrada") ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{mensaje}</p>}
    <div className="grid gap-4 sm:grid-cols-3"><Indicador icon={<ClipboardList className="h-5 w-5" />} label="Reportes recientes" valor={reportes.length} color="text-[#4F46E5]" /><Indicador icon={<AlertTriangle className="h-5 w-5" />} label="Alertas abiertas" valor={alertas.length} color="text-amber-600" /><Indicador icon={<Wrench className="h-5 w-5" />} label="Busetas activas" valor={busetas.length} color="text-emerald-600" /></div>
    {puedeEditar && <section className="rounded-xl border border-[#E2E8F0] bg-white p-4"><h2 className="text-base font-semibold text-gray-900">Registrar daño</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-sm text-gray-600">Buseta<select value={placa} onChange={(e) => setPlaca(e.target.value)} className={inputClass}><option value="">Seleccione</option>{busetas.map((b) => <option key={b.placa} value={b.placa}>{b.numero_interno ? `${b.numero_interno} — ` : ""}{b.placa}</option>)}</select></label><label className="text-sm text-gray-600">Cédula del conductor<input value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputClass} /></label><label className="text-sm text-gray-600">Concepto<select value={conceptoId} onChange={(e) => setConceptoId(e.target.value)} className={inputClass}><option value="">Seleccione</option>{conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label className="text-sm text-gray-600">Fecha y hora<input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} /></label><label className="text-sm text-gray-600">Descripción<input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} /></label></div><button type="button" onClick={guardarReporte} disabled={disabled} className="mt-3 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">{pending ? "Guardando…" : "Guardar reporte"}</button></section>}
    {puedeEditar && <section className="rounded-xl border border-[#E2E8F0] bg-white p-4"><h2 className="text-base font-semibold text-gray-900">Agregar buseta al maestro</h2><p className="mt-1 text-sm text-gray-500">Complete el catálogo operativo con datos validados; no se crean vehículos automáticamente.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm text-gray-600">Placa<input value={nuevaBuseta.placa} onChange={(e) => setNuevaBuseta((v) => ({ ...v, placa: e.target.value.toUpperCase() }))} className={inputClass} /></label><label className="text-sm text-gray-600">Número interno<input value={nuevaBuseta.numeroInterno} onChange={(e) => setNuevaBuseta((v) => ({ ...v, numeroInterno: e.target.value }))} className={inputClass} /></label><label className="text-sm text-gray-600">Descripción<input value={nuevaBuseta.descripcion} onChange={(e) => setNuevaBuseta((v) => ({ ...v, descripcion: e.target.value }))} className={inputClass} /></label></div><button type="button" onClick={guardarBuseta} disabled={disabled} className="mt-3 rounded-lg border border-[#4F46E5] px-4 py-2 text-sm font-semibold text-[#4F46E5] hover:bg-indigo-50 disabled:opacity-50">Agregar buseta</button></section>}
    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"><div className="border-b border-[#E2E8F0] px-4 py-3"><h2 className="font-semibold text-gray-900">Alertas abiertas</h2></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{alertas.map((alerta) => { const cierre = cierres[alerta.id] ?? { orden: "", notas: "" }; return <article key={alerta.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold text-amber-900">{alerta.placa_buseta} · {alerta.mantenimiento_conceptos[0]?.nombre ?? "Concepto"}</p><p className="mt-1 text-amber-800">{alerta.cantidad} reportes recurrentes desde {fmt.format(new Date(alerta.created_at))}.</p>{puedeEditar && <><input aria-label="Orden de taller" placeholder="Orden de taller (opcional)" value={cierre.orden} onChange={(e) => setCierres((v) => ({ ...v, [alerta.id]: { ...cierre, orden: e.target.value } }))} className={`${inputClass} bg-white`} /><textarea aria-label="Notas de cierre" placeholder="Notas de cierre (opcional)" value={cierre.notas} onChange={(e) => setCierres((v) => ({ ...v, [alerta.id]: { ...cierre, notas: e.target.value } }))} className={`${inputClass} min-h-16 bg-white`} /><button type="button" onClick={() => cerrar(alerta.id)} disabled={disabled} className="mt-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">Cerrar alerta</button></>}</article>; })}{alertas.length === 0 && <p className="text-sm text-gray-500">No hay alertas abiertas.</p>}</div></section>
    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"><div className="border-b border-[#E2E8F0] px-4 py-3"><h2 className="font-semibold text-gray-900">Reportes recientes</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[740px] text-sm"><thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Buseta</th><th className="px-4 py-3">Conductor</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>{reportes.map((r) => <tr key={r.id} className="border-t border-[#F1F5F9]"><td className="px-4 py-3">{fmt.format(new Date(r.fecha_reporte))}</td><td className="px-4 py-3 font-medium">{r.placa_buseta}</td><td className="px-4 py-3">{r.conductores[0]?.nombre ?? r.cedula_conductor}</td><td className="px-4 py-3">{r.mantenimiento_conceptos[0]?.nombre ?? "—"}</td><td className="px-4 py-3">{r.descripcion ?? "—"}</td><td className="px-4 py-3">{r.alerta_id ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Recurrente</span> : "—"}</td></tr>)}{reportes.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Aún no hay reportes de mantenimiento.</td></tr>}</tbody></table></div></section>
  </div>;
}

function Indicador({ icon, label, valor, color }: { icon: React.ReactNode; label: string; valor: number; color: string }) {
  return <div className="rounded-xl border border-[#E2E8F0] bg-white p-4"><div className={`flex items-center gap-2 text-sm font-medium ${color}`}>{icon}{label}</div><div className="mt-2 text-3xl font-bold text-gray-900">{valor}</div></div>;
}
