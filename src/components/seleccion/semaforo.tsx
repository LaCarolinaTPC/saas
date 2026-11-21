"use client";

import { REQUISITOS_PRESELECCION, type ColorSemaforo, type ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";

const COLOR: Record<ColorSemaforo, string> = {
  verde: "bg-emerald-500",
  rojo: "bg-red-500",
  pendiente: "bg-gray-300",
};

const TEXTO: Record<ColorSemaforo, string> = {
  verde: "Cumple",
  rojo: "No cumple",
  pendiente: "Pendiente",
};

/** Cuatro puntos: edad, residencia, licencia y SIMIT. */
export function SemaforoPuntos({ resultado, className = "" }: { resultado: ResultadoPreseleccionGuardado | null | undefined; className?: string }) {
  if (!resultado) return null;
  const titulo = REQUISITOS_PRESELECCION.map((r) => `${r.label}: ${TEXTO[resultado[r.key].color]} — ${resultado[r.key].motivo}`).join("\n");
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={titulo} aria-label={`Preselección. ${titulo}`}>
      {REQUISITOS_PRESELECCION.map((r) => (
        <span key={r.key} className={`h-2 w-2 rounded-full ${COLOR[resultado[r.key].color]}`} />
      ))}
    </span>
  );
}

/** Semáforo con el detalle de cada requisito, para la ficha del proceso. */
export function SemaforoDetalle({ resultado }: { resultado: ResultadoPreseleccionGuardado }) {
  return (
    <ul className="space-y-1.5">
      {REQUISITOS_PRESELECCION.map((r) => {
        const req = resultado[r.key];
        return (
          <li key={r.key} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COLOR[req.color]}`} />
            <span className="w-20 shrink-0 font-medium text-gray-700">{r.label}</span>
            <span className="text-gray-600">
              {req.motivo}
              {req.origen && (
                <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  {req.origen}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
