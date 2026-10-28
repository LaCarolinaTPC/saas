import Link from "next/link";
import { Gavel } from "lucide-react";
import { getProcesosDe, tieneAccesoDisciplinarios } from "@/lib/disciplinarios/data";
import { etiquetaMedida, etiquetaMotivo, etiquetaTipo, resumenPorConductor } from "@/lib/disciplinarios/reglas";

/**
 * Procesos disciplinarios de un conductor, para su ficha (Recursos Humanos ›
 * Conductores y Rotación › Conductores). Solo lo ve quien tiene el módulo
 * `disciplinarios`: es información sensible. Si la tabla aún no existe o la
 * consulta falla, no muestra nada en vez de romper la ficha.
 */
export async function ResumenDisciplinarioConductor({ cedula, compacto = false }: { cedula: string; compacto?: boolean }) {
  if (!(await tieneAccesoDisciplinarios())) return null;
  let procesos;
  try {
    procesos = await getProcesosDe(cedula);
  } catch (e) {
    console.error("[disciplinarios] ficha del conductor:", e instanceof Error ? e.message : e);
    return null;
  }
  const r = resumenPorConductor(procesos)[0];
  const href = `/disciplinarios?tab=conductores&q=${encodeURIComponent(cedula)}`;

  return (
    <section className={`rounded-xl border border-[#E2E8F0] bg-white ${compacto ? "p-4" : "p-6"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-gray-900">Procesos disciplinarios</h2>
          {r && <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-semibold text-gray-600">{r.total}</span>}
        </div>
        <Link href={href} className="text-xs font-medium text-[#4F46E5] hover:underline">
          {r ? "Ver todos" : "Registrar"}
        </Link>
      </div>

      {!r ? (
        <p className="text-sm text-gray-500">Sin llamados de atención ni citaciones a descargos.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            <span className="rounded-full bg-[#E0E7FF] px-2 py-0.5 text-[#3730A3]">
              {r.llamados} llamado{r.llamados === 1 ? "" : "s"} de atención
            </span>
            <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[#92400E]">
              {r.citaciones} citaci{r.citaciones === 1 ? "ón" : "ones"} a descargos
            </span>
            {r.citaciones > 0 && (
              <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[#166534]">
                Asistió {r.asistencias}
                {r.inasistencias > 0 && ` · no asistió ${r.inasistencias}`}
              </span>
            )}
            {r.suspensiones > 0 && (
              <span className="rounded-full bg-[#FFEDD5] px-2 py-0.5 text-[#9A3412]">
                {r.suspensiones} suspensi{r.suspensiones === 1 ? "ón" : "ones"} ({r.diasSuspension} d)
              </span>
            )}
            {r.terminaciones > 0 && <span className="rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[#991B1B]">Terminación</span>}
            {r.abiertos > 0 && (
              <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-gray-700">
                {r.abiertos} con medida pendiente
              </span>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Motivos</p>
            <div className="flex flex-wrap gap-1">
              {r.motivos.map((m) => (
                <span key={m.motivo} className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs text-gray-700">
                  {m.etiqueta} <b>×{m.cantidad}</b>
                </span>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-[#F1F5F9] border-t border-[#F1F5F9]">
            {procesos.slice(0, 5).map((p) => (
              <li key={p.id} className={`py-2 text-sm ${compacto ? "" : "flex flex-wrap items-baseline justify-between gap-x-4"}`}>
                <span className="text-gray-800">
                  <span className="font-medium">{p.fechaHecho}</span> · {etiquetaTipo(p.tipo)} · {etiquetaMotivo(p.motivo, p.motivoDetalle)}
                </span>
                <span className={`block text-xs text-gray-500 ${compacto ? "" : "sm:inline"}`}>
                  {p.tipo === "citacion_descargos" && (p.asistio === true ? "Asistió · " : p.asistio === false ? "No asistió · " : "")}
                  {etiquetaMedida(p.medida, p.diasSuspension)}
                </span>
              </li>
            ))}
          </ul>
          {procesos.length > 5 && <p className="text-xs text-gray-500">Y {procesos.length - 5} más en el módulo.</p>}
        </div>
      )}
    </section>
  );
}
