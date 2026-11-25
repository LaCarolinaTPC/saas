"use client";

/**
 * Antecedentes del aspirante en la ficha (entrega 3): qué trajo cada fuente,
 * qué dicen las reglas de Gestión Humana (Selección › Tiempos y reglas ›
 * «Antecedentes: qué se tolera») y la decisión de una persona cuando las
 * reglas mandan el caso a revisión o proponen el cierre.
 *
 * La evaluación se pide al servidor: es la única que conoce las reglas, la
 * identidad confirmada por el RUNT y las fuentes opcionales.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import {
  antecedentesDelProceso, consultarAntecedentes, decidirAntecedentes, reevaluarAntecedentes, type AntecedentesVista,
} from "@/lib/contratacion/actions";
import { NOMBRE_FUENTE, type EstadoFuente, type VeredictoAntecedentes } from "@/lib/seleccion/antecedentes";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));

const VEREDICTO: Record<VeredictoAntecedentes, { texto: string; clase: string }> = {
  limpio: { texto: "Sin antecedentes en las cuatro fuentes.", clase: "text-emerald-700" },
  tolerable: { texto: "Tiene hallazgos que las reglas toleran: el proceso sigue.", clase: "text-emerald-700" },
  revision: { texto: "Tiene hallazgos que debe revisar una persona de Gestión Humana.", clase: "text-amber-700" },
  descarta: { texto: "Las reglas proponen cerrar el proceso por antecedentes. Lo confirma una persona.", clase: "text-red-700" },
  pendiente: { texto: "Faltan fuentes por consultar.", clase: "text-amber-700" },
};

const ESTADO: Record<EstadoFuente, string> = {
  limpio: "Limpio",
  hallazgo: "Con hallazgo",
  pendiente: "En curso",
  error: "Sin veredicto",
  sin_consultar: "Sin consultar",
};

const ACCION = { tolera: "Pasa solo", revision: "Revisión manual", descarta: "Propone cierre" } as const;
const CLASE_ACCION = { tolera: "bg-emerald-50 text-emerald-700", revision: "bg-amber-50 text-amber-800", descarta: "bg-red-50 text-red-700" } as const;

export function SeccionAntecedentes({
  procesoId, abierto, puedeEditar, version, compacta = false, onCambio, onVerDetalle,
}: {
  procesoId: string;
  /** El proceso no está cerrado ni contratado. */
  abierto: boolean;
  puedeEditar: boolean;
  /** Cambia para volver a leer (una revisión manual, un cambio en tiempo real). */
  version: number;
  /** Solo el veredicto y las fuentes, para el Resumen. */
  compacta?: boolean;
  onCambio: () => void;
  onVerDetalle?: () => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<AntecedentesVista | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const [propia, setPropia] = useState(0);

  useEffect(() => {
    let vivo = true;
    antecedentesDelProceso(procesoId)
      .then((v) => vivo && setVista(v))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [procesoId, version, propia]);

  const ev = vista?.evaluacion;
  if (!ev) return null;
  const consultado = ev.fuentes.some((f) => f.estado !== "sin_consultar");
  if (compacta && !consultado) return null;

  const correr = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    setMensaje(null);
    enTransicion(async () => {
      const r = await accion();
      setMensaje(r.ok ? exito : (r.error ?? "No se pudo completar."));
      if (r.ok) {
        setPropia((n) => n + 1);
        onCambio();
        router.refresh();
      }
    });
  };

  const v = VEREDICTO[ev.veredicto];
  const decidido = ev.decision === "aprobado" ? "Aprobado para seguir" : ev.decision === "rechazado" ? "Rechazado" : null;
  const porDecidir = abierto && !ev.decision && (ev.veredicto === "revision" || ev.veredicto === "descarta");
  const faltan = ev.fuentes.some((f) => f.estado === "sin_consultar" || f.estado === "error");

  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        {ev.veredicto === "descarta" ? <ShieldX className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4" />} Antecedentes
      </h4>
      <p className={`text-sm font-medium ${decidido ? (ev.decision === "aprobado" ? "text-emerald-700" : "text-red-700") : v.clase}`}>
        {consultado ? (decidido ? `${decidido} por una persona. ${ev.veredicto === "revision" || ev.veredicto === "descarta" ? "Las reglas lo habían mandado a revisión o descarte." : ""}` : v.texto) : "Todavía no se han consultado."}
      </p>

      {compacta ? (
        <>
          <ul className="mt-1 flex flex-wrap gap-2 text-xs">
            {ev.fuentes.map((f) => (
              <li key={f.fuente} className={`rounded-full px-2 py-1 ${f.accion ? CLASE_ACCION[f.accion] : "bg-gray-100 text-gray-700"}`} title={f.motivo ?? f.detalle ?? undefined}>
                {NOMBRE_FUENTE[f.fuente]}: {f.accion ? `${ESTADO[f.estado].toLowerCase()} · ${ACCION[f.accion].toLowerCase()}` : ESTADO[f.estado].toLowerCase()}
              </li>
            ))}
          </ul>
          {porDecidir && onVerDetalle && (
            <button type="button" onClick={onVerDetalle} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#4F46E5] hover:underline">
              <TriangleAlert className="h-4 w-4" /> Ver el detalle y decidir →
            </button>
          )}
        </>
      ) : (
        <>
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-[#F1F5F9]">
              {ev.fuentes.map((f) => (
                <tr key={f.fuente}>
                  <td className="w-28 py-1.5 pr-2 align-top font-medium text-gray-800">{NOMBRE_FUENTE[f.fuente]}</td>
                  <td className="py-1.5 pr-2 align-top text-gray-600">
                    {ESTADO[f.estado]}
                    {(f.motivo || f.detalle) && <span className="block text-xs text-gray-500">{f.motivo ?? f.detalle}</span>}
                  </td>
                  <td className="py-1.5 text-right align-top">
                    {f.accion && <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASE_ACCION[f.accion]}`}>{ACCION[f.accion]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-xs text-gray-400">
            Qué pasa solo y qué va a revisión (y las palabras que mandan a revisión) se define en{" "}
            <a href="/candidatos/seleccion?pestana=antecedentes" target="_blank" rel="noreferrer" className="text-[#4F46E5] hover:underline">
              Selección › Antecedentes
            </a>
            . Si este caso debió ir a revisión, o fue de más, ajuste allí la lista.
          </p>

          {ev.decision && (
            <div className="mt-3 rounded-lg border border-[#E2E8F0] p-3 text-sm">
              <p className="font-medium text-gray-900">
                {decidido} · {vista.decisionPor ?? "—"}
                {vista.decisionAt ? ` · ${fechaHora(vista.decisionAt)}` : ""}
              </p>
              {vista.justificacion && <p className="mt-1 whitespace-pre-wrap text-gray-700">{vista.justificacion}</p>}
            </div>
          )}

          {porDecidir &&
            (vista.puedeDecidir ? (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                  {ev.veredicto === "descarta" ? "Gestivo propone cerrar el proceso. ¿Qué decide?" : "Este caso espera su decisión."}
                </p>
                <textarea
                  rows={2}
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder="Justificación (queda en la ficha y en el historial)"
                  className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={ocupado || justificacion.trim().length < 10}
                    onClick={() => correr(() => decidirAntecedentes(procesoId, true, justificacion), "Aprobado: el proceso sigue.")}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Aprobar y seguir
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || justificacion.trim().length < 10}
                    onClick={() => correr(() => decidirAntecedentes(procesoId, false, justificacion), "Proceso cerrado por antecedentes.")}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Rechazar y cerrar el proceso
                  </button>
                </div>
                <p className="text-xs text-amber-800">Al rechazar, al aspirante se le avisa que no continúa, sin decirle el motivo.</p>
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                Espera la decisión de quien tiene el permiso «aprobar o rechazar a un aspirante con hallazgos de antecedentes».
              </p>
            ))}

          {puedeEditar && abierto && (
            <div className="mt-3 flex flex-wrap gap-2">
              {faltan && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => correr(() => consultarAntecedentes(procesoId), "Consulta lanzada en Croma.")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" /> {ocupado ? "Consultando…" : "Consultar antecedentes"}
                </button>
              )}
              {consultado && (
                <button
                  type="button"
                  disabled={ocupado}
                  title="Aplica las reglas vigentes a lo ya consultado"
                  onClick={() => correr(() => reevaluarAntecedentes(procesoId), "Evaluado con las reglas vigentes.")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" /> Volver a evaluar
                </button>
              )}
            </div>
          )}
          {mensaje && <p className="mt-2 text-sm text-gray-700">{mensaje}</p>}
        </>
      )}
    </section>
  );
}
