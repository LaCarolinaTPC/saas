"use client";

/**
 * Confirmación al arrastrar una cita a otro día en la semana de la agenda:
 * dice de dónde a dónde se mueve, pregunta quién pidió el cambio (cuenta o no
 * como reprogramación del aspirante) y muestra el mensaje de WhatsApp tal como
 * le llegará. Solo al aceptar se mueve la cita y se le avisa.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarClock, Loader2, X } from "lucide-react";
import { fechaEnTexto, hhmm, horaEnTexto } from "@/lib/seleccion/agenda";
import type { CitaDelDia, ResultadoAgenda, VistaCitacion } from "@/lib/seleccion/agenda-servidor";
import { reprogramar, vistaDeCitacion } from "@/app/(dashboard)/candidatos/agenda-actions";

const CANAL: Record<VistaCitacion["canal"], string> = {
  texto: "Sale ya por WhatsApp.",
  plantilla: "Sale ya por WhatsApp (plantilla aprobada).",
  prueba: "Candidato de prueba: aparece en el chat de prueba, no sale por WhatsApp.",
  no_sale: "No sale solo.",
};

export function MoverCitaDialog({
  cita,
  destino,
  reprogramacionesMax,
  onClose,
  onHecho,
}: {
  cita: CitaDelDia;
  destino: { fecha: string; hora: string };
  reprogramacionesMax: number;
  onClose: () => void;
  onHecho: (r: ResultadoAgenda) => void;
}) {
  const [hora, setHora] = useState(hhmm(destino.hora));
  const [por, setPor] = useState<"aspirante" | "empresa" | null>(null);
  const [vista, setVista] = useState<VistaCitacion | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pedido = useRef(0);

  // El mensaje depende de quién pidió el cambio («Cita reprogramada» o «Cita
  // movida por la empresa») y se arma con la fecha y la hora nuevas.
  function pedirVista(quien: "aspirante" | "empresa", h: string) {
    if (!/^\d{2}:\d{2}$/.test(h)) return;
    const n = ++pedido.current;
    setCargandoVista(true);
    vistaDeCitacion(cita.proceso_id, { fecha: destino.fecha, hora: h }, true, quien)
      .then((v) => n === pedido.current && setVista(v))
      .catch(() => undefined)
      .finally(() => n === pedido.current && setCargandoVista(false));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !enviando && onClose();
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, enviando]);

  async function confirmar() {
    if (!por || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await reprogramar(cita.id, { fecha: destino.fecha, hora }, por).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setEnviando(false);
    if (!r.ok) return setError(r.error ?? "No se pudo mover la cita.");
    onHecho(r);
  }

  const llegaAlMaximo = por === "aspirante" && cita.reprogramaciones + 1 > reprogramacionesMax;
  const boton = vista?.canal === "no_sale" ? "Mover (el aviso queda como borrador)" : vista?.canal === "prueba" ? "Mover la cita" : "Mover y avisar por WhatsApp";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !enviando && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mover la cita"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <CalendarClock className="h-5 w-5 shrink-0 text-[#4F46E5]" /> ¿Mover la cita?
            </h3>
            <p className="truncate text-sm text-gray-500">
              {cita.nombre} · CC {cita.cedula}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={enviando} aria-label="Cerrar" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-sm">
            <span className="text-gray-500 line-through decoration-gray-300">
              <span className="first-letter:uppercase">{fechaEnTexto(cita.fecha)}</span> · {horaEnTexto(cita.hora)}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="font-semibold text-gray-900">
              {fechaEnTexto(destino.fecha)} · {/^\d{2}:\d{2}$/.test(hora) ? horaEnTexto(hora) : "—"}
            </span>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Hora
            <input
              type="time"
              value={hora}
              onChange={(e) => {
                setHora(e.target.value);
                if (por) pedirVista(por, e.target.value);
              }}
              className="mt-1 h-11 w-40 rounded-lg border border-[#E2E8F0] px-3 text-base outline-none focus:border-[#4F46E5] sm:text-sm"
            />
          </label>

          <fieldset className="text-sm">
            <legend className="mb-1 font-medium text-gray-700">¿Quién pidió moverla?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["aspirante", "El aspirante", `Cuenta como reprogramación (lleva ${cita.reprogramaciones} de ${reprogramacionesMax})`],
                  ["empresa", "La empresa", "No le cuenta al aspirante"],
                ] as const
              ).map(([v, t, nota]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setPor(v);
                    pedirVista(v, hora);
                  }}
                  aria-pressed={por === v}
                  className={`rounded-lg border px-3 py-2 text-left ${por === v ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]" : "border-[#E2E8F0] text-gray-700 hover:bg-gray-50"}`}
                >
                  <span className="block font-medium">{t}</span>
                  <span className="block text-xs opacity-80">{nota}</span>
                </button>
              ))}
            </div>
            {llegaAlMaximo && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">Con esta pasa el máximo de reprogramaciones: se propondrá cerrar el proceso por «Desistimiento».</p>
            )}
          </fieldset>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Mensaje que le llega por WhatsApp</p>
            <div className="whitespace-pre-wrap break-words rounded-xl bg-[#EFEAE2] p-3">
              {!por ? (
                <p className="text-sm text-gray-600">Elige quién pidió moverla para ver el mensaje: es distinto si la pidió el aspirante o si la movió la empresa.</p>
              ) : cargandoVista ? (
                <p className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Armando el mensaje…
                </p>
              ) : (
                <p className="rounded-xl rounded-bl-md bg-white px-3 py-2 text-sm text-gray-900 shadow-sm">{vista?.texto ?? "No hay mensaje para avisarle en Selección › Mensajes."}</p>
              )}
            </div>
            {por && vista && !cargandoVista && (
              <p className={`mt-1 text-xs ${vista.canal === "no_sale" ? "font-medium text-amber-700" : "text-gray-500"}`}>
                {CANAL[vista.canal]} {vista.aviso ?? ""}
              </p>
            )}
          </div>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={enviando} className="h-12 rounded-lg border border-[#E2E8F0] px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
            No, dejarla como estaba
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!por || enviando || cargandoVista || !/^\d{2}:\d{2}$/.test(hora)}
            title={!por ? "Elige quién pidió moverla" : undefined}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {boton}
          </button>
        </div>
      </div>
    </div>
  );
}
