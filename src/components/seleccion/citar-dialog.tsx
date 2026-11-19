"use client";

/**
 * Citar a la prueba de manejo (entrega 2, D1): propone la fecha y la hora
 * (saltando los días sin profesor), muestra el mensaje tal como saldría y, al
 * confirmar, lo envía de una vez. Si ya tiene una cita en pie, la reprograma.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import { fechaEnTexto, hhmm, horaDelDia, horaEnTexto } from "@/lib/seleccion/agenda";
import type { ResultadoAgenda, VistaCitacion } from "@/lib/seleccion/agenda-servidor";
import type { AccionesCitar, DatosCitar } from "./profesor-tipos";

const CANAL: Record<VistaCitacion["canal"], string> = {
  texto: "Sale ya por WhatsApp.",
  plantilla: "Sale ya por WhatsApp (plantilla aprobada).",
  prueba: "Candidato de prueba: aparece en el chat de prueba, no sale por WhatsApp.",
  no_sale: "No sale solo.",
};

export function CitarDialog({
  procesoId,
  nombre,
  acciones,
  onClose,
  onHecho,
}: {
  procesoId: string;
  nombre: string;
  acciones: AccionesCitar;
  onClose: () => void;
  onHecho: (r: ResultadoAgenda, reprogramada: boolean) => void;
}) {
  const [datos, setDatos] = useState<DatosCitar | null>(null);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [por, setPor] = useState<"aspirante" | "empresa">("aspirante");
  const [vista, setVista] = useState<VistaCitacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pedido = useRef(0);

  useEffect(() => {
    let vivo = true;
    acciones
      .datos(procesoId)
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setFecha(d.propuesta.fecha);
        setHora(d.propuesta.hora);
        setVista(d.vista);
      })
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [acciones, procesoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !enviando && onClose();
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, enviando]);

  const reprogramar = Boolean(datos?.vigente);

  function cambiar(f: string, h: string) {
    setFecha(f);
    setHora(h);
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{2}:\d{2}$/.test(h)) return;
    const n = ++pedido.current;
    acciones
      .vista(procesoId, { fecha: f, hora: h }, reprogramar)
      .then((v) => n === pedido.current && setVista(v))
      .catch(() => undefined);
  }

  /** Al cambiar el día, la hora pasa a la de ese día (sábado, o la que marcó el profesor). */
  function cambiarFecha(f: string) {
    const h = datos && /^\d{4}-\d{2}-\d{2}$/.test(f) ? horaDelDia(f, datos.ajustes, datos.excepciones) : null;
    cambiar(f, h ?? hora);
  }

  const excepcion = datos?.excepciones.find((e) => e.fecha === fecha) ?? null;
  const aviso =
    excepcion && !excepcion.disponible
      ? "Ese día el profesor no puede. Elige otro día."
      : excepcion?.hora && hhmm(excepcion.hora) !== hora
        ? `Ese día el profesor puede a las ${horaEnTexto(excepcion.hora)}.`
        : fecha && datos && horaDelDia(fecha, datos.ajustes, []) === null
          ? "Ese día es domingo o festivo."
          : null;

  async function confirmar() {
    if (!datos || enviando) return;
    setEnviando(true);
    setError(null);
    const cuando = { fecha, hora };
    const r = await (datos.vigente ? acciones.reprogramar(datos.vigente.id, cuando, por) : acciones.citar(procesoId, cuando)).catch((e: Error) => ({
      ok: false as const,
      error: e.message,
    }));
    setEnviando(false);
    if (!r.ok) return setError(r.error ?? "No se pudo citar.");
    onHecho(r, reprogramar);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !enviando && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Citar a la prueba de manejo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <CalendarClock className="h-5 w-5 shrink-0 text-[#4F46E5]" /> {reprogramar ? "Reprogramar la cita" : "Citar a la prueba de manejo"}
            </h3>
            <p className="truncate text-sm text-gray-500">{nombre}</p>
          </div>
          <button type="button" onClick={onClose} disabled={enviando} aria-label="Cerrar" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!datos && !error ? (
          <p className="flex items-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando la próxima fecha…
          </p>
        ) : (
          datos && (
            <div className="space-y-4">
              {datos.vigente && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Ya está citado para el {fechaEnTexto(datos.vigente.fecha)} a las {horaEnTexto(datos.vigente.hora)}. Al guardar, esa cita se mueve.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-gray-700">
                  Día
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => cambiarFecha(e.target.value)}
                    className="mt-1 h-12 w-full rounded-lg border border-[#E2E8F0] px-3 text-base outline-none focus:border-[#4F46E5]"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Hora
                  <input
                    type="time"
                    value={hora}
                    onChange={(e) => cambiar(fecha, e.target.value)}
                    className="mt-1 h-12 w-full rounded-lg border border-[#E2E8F0] px-3 text-base outline-none focus:border-[#4F46E5]"
                  />
                </label>
              </div>
              {fecha && hora && (
                <p className="text-sm text-gray-600">
                  {fechaEnTexto(fecha)} a las {horaEnTexto(hora)}
                </p>
              )}
              {aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{aviso}</p>}

              {datos.vigente && (
                <fieldset className="text-sm">
                  <legend className="mb-1 font-medium text-gray-700">¿Quién pidió moverla?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["aspirante", "El aspirante", "Cuenta como reprogramación"],
                        ["empresa", "La empresa", "No le cuenta al aspirante"],
                      ] as const
                    ).map(([v, t, nota]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPor(v)}
                        className={`rounded-lg border px-3 py-2 text-left ${por === v ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]" : "border-[#E2E8F0] text-gray-700"}`}
                      >
                        <span className="block font-medium">{t}</span>
                        <span className="block text-xs opacity-80">{nota}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Mensaje para el aspirante</p>
                <div className="whitespace-pre-wrap break-words rounded-xl bg-[#EFEAE2] p-3">
                  <p className="rounded-xl rounded-bl-md bg-white px-3 py-2 text-sm text-gray-900 shadow-sm">{vista?.texto ?? "—"}</p>
                </div>
                {vista && (
                  <p className={`mt-1 text-xs ${vista.canal === "no_sale" ? "font-medium text-amber-700" : "text-gray-500"}`}>
                    {CANAL[vista.canal]} {vista.aviso ?? ""}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={enviando} className="h-12 rounded-lg border border-[#E2E8F0] px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!datos || enviando || !fecha || !hora || (excepcion ? !excepcion.disponible : false)}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {reprogramar ? "Mover la cita y avisar" : vista?.canal === "no_sale" ? "Citar (sin enviar el mensaje)" : "Citar y enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
