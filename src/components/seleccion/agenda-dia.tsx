"use client";

/**
 * Agenda del día en Candidatos (entrega 2, D1–D4): los citados a la prueba de
 * manejo con su estado y los botones Llegó · No asistió · Reprogramar · Llamar,
 * y los días en que el profesor no puede. Pensada también para el celular.
 * La vista «Semana» (AgendaSemana) reprograma arrastrando la cita a otro día.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarOff, ChevronLeft, ChevronRight, Glasses, Loader2, Phone, PhoneCall, RefreshCw } from "lucide-react";
import { estadoInfo } from "@/lib/contratacion/constants";
import { ESTADO_CITA_LABEL, citaVigente, fechaEnTexto, hhmm, horaEnTexto } from "@/lib/seleccion/agenda";
import type { CitaDelDia, ResultadoAgenda } from "@/lib/seleccion/agenda-servidor";
import { agendaDelDia, cambiarCita, reprogramar as reprogramarCitaAccion, type AgendaDelDia } from "@/app/(dashboard)/candidatos/agenda-actions";
import { useAvisosProcesos } from "@/hooks/use-avisos-procesos";
import { CITAR_REAL, DISPONIBILIDAD_GH } from "./acciones-reales";
import { AgendaSemana } from "./agenda-semana";
import { CitarDialog } from "./citar-dialog";
import { DisponibilidadProfesor } from "./disponibilidad-profesor";
import { textoEnvio } from "./profesor-tipos";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const enDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const TONO: Record<string, string> = {
  programada: "bg-amber-50 text-amber-800",
  confirmada: "bg-sky-50 text-sky-700",
  pide_otra_fecha: "bg-violet-50 text-violet-700",
  asistio: "bg-emerald-50 text-emerald-700",
  no_asistio: "bg-red-50 text-red-700",
};

const BOTON = "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

export function AgendaDia({ puedeEditar }: { puedeEditar: boolean }) {
  const [fecha, setFecha] = useState(hoyBogota);
  const [agenda, setAgenda] = useState<AgendaDelDia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [reprogramar, setReprogramar] = useState<CitaDelDia | null>(null);
  // Salida de reconocimiento de ruta que se está moviendo (su propio formulario: no es la citación a la prueba).
  const [moverRuta, setMoverRuta] = useState<CitaDelDia | null>(null);
  const [verDias, setVerDias] = useState(false);
  const [vista, setVista] = useState<"dia" | "semana">("dia");

  // Solo vale la respuesta del día que se está viendo (una lectura vieja que llegue tarde no la tapa).
  const pedido = useRef(0);
  const cargar = useCallback(() => {
    const n = ++pedido.current;
    return agendaDelDia(fecha)
      .then((a) => {
        if (n !== pedido.current) return;
        setAgenda(a);
        setError(null);
      })
      .catch((e: Error) => n === pedido.current && setError(e.message));
  }, [fecha]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const actualizar = () => {
    setCargando(true);
    void cargar().finally(() => setCargando(false));
  };
  useAvisosProcesos(cargar);

  async function accion(c: CitaDelDia, que: "llego" | "no_asistio" | "deshacer" | "confirmo") {
    if (ocupado) return;
    setOcupado(`${c.id}-${que}`);
    setMensaje(null);
    const r = await cambiarCita(c.id, que).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setOcupado(null);
    if (!r.ok) return setMensaje(r.error ?? "No se pudo guardar.");
    if (que === "no_asistio") setMensaje(`${c.nombre}: no asistió${c.tipo === "reconocimiento" ? " al reconocimiento de ruta" : ""}. ${r.envio === "borrador" ? "El aviso de inasistencia quedó como borrador en la bandeja para revisarlo y enviarlo." : textoEnvio(r.envio)}`);
    cargar();
  }

  const esHoy = fecha === hoyBogota();
  const citas = agenda?.citas ?? [];
  const deManejo = citas.filter((c) => c.tipo !== "reconocimiento");
  const deRuta = citas.length - deManejo.length;
  const horaYa = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date());

  const selectorVista = (
    <div role="tablist" aria-label="Vista de la agenda" className="inline-flex rounded-lg border border-[#E2E8F0] bg-white p-0.5">
      {(
        [
          ["dia", "Día"],
          ["semana", "Semana"],
        ] as const
      ).map(([v, t]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={vista === v}
          onClick={() => setVista(v)}
          className={`min-h-10 rounded-md px-4 text-sm font-medium ${vista === v ? "bg-[#4F46E5] text-white" : "text-gray-600 hover:bg-gray-50"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  if (vista === "semana") {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-10 sm:px-6">
        {selectorVista}
        <AgendaSemana
          puedeEditar={puedeEditar}
          fechaInicial={fecha}
          onVerDia={(f) => {
            setFecha(f);
            setVista("dia");
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 sm:px-6">
      {selectorVista}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFecha(enDias(fecha, -1))} aria-label="Día anterior" className={`${BOTON} w-11 px-0`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Día" className="h-11 min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-base sm:max-w-48 sm:flex-none sm:text-sm" />
        <button type="button" onClick={() => setFecha(enDias(fecha, 1))} aria-label="Día siguiente" className={`${BOTON} w-11 px-0`}>
          <ChevronRight className="h-4 w-4" />
        </button>
        {!esHoy && (
          <button type="button" onClick={() => setFecha(hoyBogota())} className={BOTON}>
            Hoy
          </button>
        )}
        <button type="button" onClick={actualizar} aria-label="Actualizar" className={`${BOTON} w-11 px-0`}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setVerDias((v) => !v)} className={`${BOTON} sm:ml-auto ${verDias ? "border-[#4F46E5] text-[#4F46E5]" : ""}`}>
          <CalendarOff className="h-4 w-4" /> Días del profesor
        </button>
      </div>

      <div>
        <h2 className="text-lg font-bold first-letter:uppercase text-gray-900">
          {esHoy ? "Hoy · " : ""}
          {fechaEnTexto(fecha)}
        </h2>
        {agenda && (
          <p className={`text-sm ${agenda.horaPrueba ? "text-gray-600" : "font-medium text-amber-700"}`}>
            {agenda.horaPrueba
              ? `Prueba de manejo a las ${horaEnTexto(agenda.horaPrueba)}${agenda.excepcion?.disponible ? " (el profesor cambió la hora de este día)" : ""} · ${deManejo.length} ${deManejo.length === 1 ? "citado" : "citados"}${deRuta ? ` · ${deRuta} al reconocimiento de ruta` : ""}`
              : agenda.excepcion
                ? `El profesor no puede este día${citas.some(citaVigente) ? ": hay citas por reprogramar (botón «Días del profesor»)." : "."}`
                : "Domingo o festivo: no hay prueba de manejo."}
          </p>
        )}
      </div>

      {verDias && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <DisponibilidadProfesor acciones={DISPONIBILIDAD_GH} puedeEditar={puedeEditar} fechaInicial={fecha} onCambio={cargar} />
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-gray-700">{mensaje}</p>}

      {agenda && citas.length === 0 && <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-10 text-center text-sm text-gray-500">No hay citados para este día.</p>}

      <ul className="space-y-3">
        {citas.map((c) => {
          const vigente = citaVigente(c);
          const sinConfirmar = esHoy && c.estado === "programada" && (Boolean(c.alerta_at) || horaYa >= "11:00");
          return (
            <li key={c.id} className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-gray-900">{c.nombre}</p>
                  {c.tipo === "reconocimiento" && <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Reconocimiento de ruta</p>}
                  <p className="text-sm text-gray-600">
                    {horaEnTexto(c.hora)} · CC {c.cedula} · {estadoInfo(c.procesoEstado)?.label ?? c.procesoEstado}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {sinConfirmar && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                      <PhoneCall className="h-3 w-3" /> Llamar: no ha confirmado
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONO[c.estado] ?? "bg-gray-100 text-gray-600"}`}>{ESTADO_CITA_LABEL[c.estado]}</span>
                </div>
              </div>
              {(c.lentes || c.reprogramaciones > 0) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {c.lentes && (
                    <span className="flex items-center gap-1 font-medium text-amber-700">
                      <Glasses className="h-4 w-4" /> Debe traer lentes
                    </span>
                  )}
                  {c.reprogramaciones > 0 && (
                    <span className={c.proponeCierre ? "font-medium text-red-700" : "text-gray-600"}>
                      {c.reprogramaciones} {c.reprogramaciones === 1 ? "reprogramación" : "reprogramaciones"} de {agenda?.reprogramacionesMax ?? 2}
                      {c.proponeCierre ? " · se propone cerrar por «Desistimiento»" : ""}
                    </span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {puedeEditar && vigente && (
                  <>
                    <button type="button" onClick={() => accion(c, "llego")} disabled={!!ocupado} className={`${BOTON} border-[#4F46E5] bg-[#4F46E5] text-white hover:bg-[#4338CA]`}>
                      {ocupado === `${c.id}-llego` && <Loader2 className="h-4 w-4 animate-spin" />} Llegó
                    </button>
                    <button type="button" onClick={() => accion(c, "no_asistio")} disabled={!!ocupado} className={BOTON}>
                      {ocupado === `${c.id}-no_asistio` && <Loader2 className="h-4 w-4 animate-spin" />} No asistió
                    </button>
                    {c.estado !== "confirmada" && (
                      <button type="button" onClick={() => accion(c, "confirmo")} disabled={!!ocupado} className={BOTON} title="Confirmó por teléfono o en persona">
                        {ocupado === `${c.id}-confirmo` && <Loader2 className="h-4 w-4 animate-spin" />} Confirmó
                      </button>
                    )}
                  </>
                )}
                {puedeEditar && c.estado === "no_asistio" && (
                  <button type="button" onClick={() => accion(c, "deshacer")} disabled={!!ocupado} className={BOTON}>
                    {ocupado === `${c.id}-deshacer` && <Loader2 className="h-4 w-4 animate-spin" />} Sí vino (deshacer)
                  </button>
                )}
                {puedeEditar && (vigente || c.estado === "no_asistio") && c.procesoEstado !== "cierre" && (
                  <button type="button" onClick={() => (c.tipo === "reconocimiento" ? setMoverRuta(c) : setReprogramar(c))} disabled={!!ocupado} className={BOTON}>
                    Reprogramar
                  </button>
                )}
                {c.celular && (
                  <a href={`tel:${c.celular}`} className={BOTON}>
                    <Phone className="h-4 w-4" /> Llamar
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {moverRuta && (
        <MoverReconocimiento
          cita={moverRuta}
          onClose={() => setMoverRuta(null)}
          onHecho={(r) => {
            setMoverRuta(null);
            setMensaje(`Reconocimiento de ruta reprogramado. ${textoEnvio(r.envio)}${r.proponeCierre ? " Superó el máximo de reprogramaciones: se propone cerrar por «Desistimiento»." : ""}`);
            cargar();
          }}
        />
      )}

      {reprogramar && (
        <CitarDialog
          procesoId={reprogramar.proceso_id}
          nombre={reprogramar.nombre}
          acciones={CITAR_REAL}
          onClose={() => setReprogramar(null)}
          onHecho={(r) => {
            setReprogramar(null);
            setMensaje(`Cita reprogramada. ${textoEnvio(r.envio)}${r.proponeCierre ? " Superó el máximo de reprogramaciones: se propone cerrar por «Desistimiento»." : ""}`);
            cargar();
          }}
        />
      )}
    </div>
  );
}

/** Mueve una salida de reconocimiento de ruta: fecha, hora y quién pidió el cambio (cuenta o no como reprogramación del aspirante). */
function MoverReconocimiento({ cita, onClose, onHecho }: { cita: CitaDelDia; onClose: () => void; onHecho: (r: ResultadoAgenda) => void }) {
  const [fecha, setFecha] = useState(cita.fecha);
  const [hora, setHora] = useState(hhmm(cita.hora));
  const [por, setPor] = useState<"aspirante" | "empresa" | null>(cita.estado === "pide_otra_fecha" || cita.estado === "no_asistio" ? "aspirante" : null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Reprogramar el reconocimiento de ruta">
      <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <p className="text-base font-semibold text-gray-900">Reprogramar el reconocimiento de ruta</p>
        <p className="text-sm text-gray-600">{cita.nombre} · ahora: {fechaEnTexto(cita.fecha)}, {horaEnTexto(cita.hora)}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-gray-700">
            Día
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#E2E8F0] px-3" />
          </label>
          <label className="text-sm text-gray-700">
            Hora
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-[#E2E8F0] px-3" />
          </label>
        </div>
        <fieldset className="space-y-1 text-sm text-gray-700">
          <legend className="mb-1">¿Quién pidió el cambio?</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={por === "aspirante"} onChange={() => setPor("aspirante")} /> El aspirante (cuenta como reprogramación)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={por === "empresa"} onChange={() => setPor("empresa")} /> La empresa (no cuenta)
          </label>
        </fieldset>
        <p className="text-xs text-gray-500">Se le envía el mensaje «Reconocimiento de ruta reprogramado» con el día y la hora nuevos.</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={enviando} className={BOTON}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando || !por || !fecha || !hora}
            className={`${BOTON} border-[#4F46E5] bg-[#4F46E5] text-white hover:bg-[#4338CA]`}
            onClick={async () => {
              setEnviando(true);
              setError(null);
              const r = await reprogramarCitaAccion(cita.id, { fecha, hora }, por!).catch((e: Error) => ({ ok: false as const, error: e.message }));
              setEnviando(false);
              if (!r.ok) return setError(r.error ?? "No se pudo reprogramar.");
              onHecho(r);
            }}
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Reprogramar y avisar
          </button>
        </div>
      </div>
    </div>
  );
}
