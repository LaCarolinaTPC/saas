"use client";

/**
 * Sección «Citas y profesor» de la ficha del proceso: la cita en pie con el
 * botón Citar / Reprogramar, el historial de citas con el contador de
 * reprogramaciones y lo que registró el profesor (solo lectura).
 * `modo = "prueba"` usa las acciones del chat de prueba (sin WhatsApp).
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, GraduationCap } from "lucide-react";
import { ESTADO_CITA_LABEL, citaVigente, fechaEnTexto, horaEnTexto, reprogramacionesDe, type Cita } from "@/lib/seleccion/agenda";
import type { ResultadoAgenda } from "@/lib/seleccion/agenda-servidor";
import type { HistorialProfesor } from "@/lib/seleccion/profesor-servidor";
import { citasYProfesorDeProceso } from "@/app/(dashboard)/candidatos/agenda-actions";
import { citasPrueba, historialProfesorPrueba } from "@/lib/seleccion/prueba-profesor-actions";
import { CITAR_REAL } from "./acciones-reales";
import { CITAR_PRUEBA } from "./acciones-prueba";
import { CitarDialog } from "./citar-dialog";
import { HistorialProfesorLista } from "./historial-profesor";
import { textoEnvio } from "./profesor-tipos";

const TIPO: Record<Cita["tipo"], string> = { prueba_manejo: "Prueba de manejo", examen_f1: "Exámenes, fase 1", examen_f2: "Exámenes, fase 2", psicotecnica: "Psicotécnica" };

export function SeccionCitas({
  proceso,
  puedeEditar,
  modo = "real",
  version = 0,
  onCitado,
}: {
  proceso: { id: string; nombre: string; estado: string };
  puedeEditar: boolean;
  modo?: "real" | "prueba";
  /** Cambia para volver a leer (por ejemplo, cuando el profesor registra algo en el marco de prueba). */
  version?: number;
  onCitado?: (r: ResultadoAgenda, reprogramada: boolean) => void;
}) {
  const [citas, setCitas] = useState<Cita[] | null>(null);
  const [historial, setHistorial] = useState<HistorialProfesor | null>(null);
  const [max, setMax] = useState(2);
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [n, setN] = useState(0);

  const cargar = useCallback(() => {
    if (modo === "prueba") {
      citasPrueba(proceso.id)
        .then((r) => {
          setCitas(r.citas);
          setMax(r.reprogramacionesMax);
        })
        .catch(() => setCitas([]));
      historialProfesorPrueba(proceso.id)
        .then(setHistorial)
        .catch(() => setHistorial(null));
    } else {
      citasYProfesorDeProceso(proceso.id)
        .then((r) => {
          setCitas(r.citas);
          setHistorial(r.historial);
          setMax(r.reprogramacionesMax);
        })
        .catch(() => setCitas([]));
    }
  }, [modo, proceso.id]);
  useEffect(cargar, [cargar, version, n]);

  const abiertoProceso = proceso.estado !== "cierre" && proceso.estado !== "contratado";
  const vigente = citas?.find((c) => c.tipo === "prueba_manejo" && citaVigente(c)) ?? null;
  const reprogramaciones = reprogramacionesDe(citas ?? []);
  const puedeCitar = puedeEditar && abiertoProceso && (vigente || ["pendiente", "antecedentes", "citado"].includes(proceso.estado));

  return (
    <>
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <CalendarClock className="h-4 w-4" /> Citas
          </h4>
          {puedeCitar && (
            <button type="button" onClick={() => setAbierto(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA]">
              {vigente ? "Reprogramar" : "Citar a la prueba de manejo"}
            </button>
          )}
        </div>
        {citas === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : citas.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se ha citado.</p>
        ) : (
          <>
            {vigente && (
              <p className="mb-2 rounded-lg bg-[#EEF2FF] px-3 py-2 text-sm text-[#4338CA]">
                Citado para el <strong>{fechaEnTexto(vigente.fecha)}</strong> a las <strong>{horaEnTexto(vigente.hora)}</strong> · {ESTADO_CITA_LABEL[vigente.estado]}
              </p>
            )}
            {reprogramaciones > 0 && (
              <p className={`mb-2 text-sm ${reprogramaciones > max ? "font-medium text-red-700" : "text-gray-600"}`}>
                Reprogramaciones pedidas por el aspirante: {reprogramaciones} de {max}
                {reprogramaciones > max ? " · superó el máximo: se propone cerrar por «Desistimiento» (lo decide una persona)." : ""}
              </p>
            )}
            <ul className="space-y-1 text-sm text-gray-700">
              {citas.map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                  <span className="inline-block first-letter:uppercase">
                    {fechaEnTexto(c.fecha)}, {horaEnTexto(c.hora)}
                  </span>
                  <span className="text-gray-500">
                    {TIPO[c.tipo]} · {ESTADO_CITA_LABEL[c.estado]}
                    {c.estado === "reprogramada" ? ` por ${c.reprogramada_por === "empresa" ? "la empresa" : "el aspirante"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {mensaje && <p className="mt-2 text-xs text-gray-600">{mensaje}</p>}
      </section>

      {historial && (historial.registros.length > 0 || historial.concepto) && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <GraduationCap className="h-4 w-4" /> Profesor
          </h4>
          <HistorialProfesorLista historial={historial} />
        </section>
      )}

      {abierto && (
        <CitarDialog
          procesoId={proceso.id}
          nombre={proceso.nombre}
          acciones={modo === "prueba" ? CITAR_PRUEBA : CITAR_REAL}
          onClose={() => setAbierto(false)}
          onHecho={(r, reprogramada) => {
            setAbierto(false);
            setMensaje(`${reprogramada ? "Cita reprogramada." : "Citado."} ${textoEnvio(r.envio)}${r.proponeCierre ? " Superó el máximo de reprogramaciones: se propone cerrar por «Desistimiento»." : ""}`);
            setN((x) => x + 1);
            onCitado?.(r, reprogramada);
          }}
        />
      )}
    </>
  );
}
