"use client";

/** Lo que el profesor ha registrado de un aspirante: prueba, clases, rutas, observaciones y concepto. */
import type { HistorialProfesor, RegistroProfesor } from "@/lib/seleccion/profesor-servidor";

const RESULTADO: Record<string, string> = {
  aprobo: "pasa a exámenes",
  escuela: "va a escuela",
  no_continua: "no continúa",
  sigue: "sigue en escuela",
  listo: "listo, pasa a exámenes",
  aprendida: "aprendida",
  repetir: "debe repetirla",
};
const SI_NO: Record<string, string> = { si: "bien", no: "mal", sin_tomar: "no se tomó" };

const fechaCorta = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short" });

function titulo(r: RegistroProfesor): string {
  const res = r.resultado ? (RESULTADO[r.resultado] ?? r.resultado) : "";
  if (r.tipo === "prueba") return `Prueba de manejo · ${res}`;
  if (r.tipo === "clase") return r.falto ? `No llegó a la clase${r.resultado === "no_continua" ? " · no continúa" : ""}` : `Clase ${r.numero ?? ""} · ${res}`;
  if (r.tipo === "ruta") return `Ruta ${r.ruta ?? ""} · ${res}`;
  return "Observación";
}

export function HistorialProfesorLista({ historial, grande = false }: { historial: HistorialProfesor; grande?: boolean }) {
  const t = grande ? "text-base" : "text-sm";
  const c = historial.concepto;
  if (!c && historial.registros.length === 0) return <p className={`${t} text-gray-500`}>El profesor todavía no ha registrado nada.</p>;
  return (
    <div className="space-y-2">
      {c && (
        <p className={`rounded-lg px-3 py-2 ${t} font-medium ${c.concepto === "acepta" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          Concepto del profesor: {c.concepto === "acepta" ? "lo acepta" : "no lo acepta"}
          {c.nota ? ` · ${c.nota}` : ""}
        </p>
      )}
      {(historial.clases > 0 || historial.faltas > 0) && (
        <p className={`${t} text-gray-600`}>
          Escuela: {historial.clases === 1 ? "1 clase" : `${historial.clases} clases`}
          {historial.faltas > 0 ? ` · ${historial.faltas === 1 ? "1 falta" : `${historial.faltas} faltas`}` : ""}
          {historial.clasesPendientes != null ? ` · le faltan ${historial.clasesPendientes}` : ""}
        </p>
      )}
      {historial.registros.some((r) => r.tipo === "ruta") && (
        <p className={`${t} text-gray-600`}>
          Rutas aprendidas: {Math.min(historial.rutasAprendidas.length, historial.rutasMinimas)} de {historial.rutasMinimas}
          {historial.rutasAprendidas.length ? ` (${historial.rutasAprendidas.join(", ")})` : ""}
        </p>
      )}
      <ul className="space-y-1.5">
        {historial.registros.map((r) => (
          <li key={`${r.tipo}-${r.id}`} className={`rounded-lg border border-[#F1F5F9] bg-white px-3 py-2 ${t}`}>
            <p className="font-medium text-gray-900">
              {titulo(r)} <span className="font-normal text-gray-400">· {fechaCorta(r.fecha)}</span>
            </p>
            {r.tipo === "prueba" && (r.rutaEscrita || r.partesMotor || r.clasesSugeridas) && (
              <p className="text-gray-600">
                {[
                  r.rutaEscrita ? `Ruta escrita: ${SI_NO[r.rutaEscrita] ?? r.rutaEscrita}` : null,
                  r.partesMotor ? `Partes del motor: ${SI_NO[r.partesMotor] ?? r.partesMotor}` : null,
                  r.clasesSugeridas ? `Clases sugeridas: ${r.clasesSugeridas}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {r.tipo === "clase" && r.clasesFaltantes != null && <p className="text-gray-600">Calcula que le faltan {r.clasesFaltantes === 1 ? "1 clase" : `${r.clasesFaltantes} clases`}</p>}
            {r.observacion && <p className="whitespace-pre-wrap text-gray-700">{r.observacion}</p>}
            {!grande && r.por && <p className="text-xs text-gray-400">{r.por}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
