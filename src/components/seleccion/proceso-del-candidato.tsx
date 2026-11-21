"use client";

/**
 * El proceso de selección dentro del perfil del candidato (/candidatos/[id]):
 * los datos del proceso y el mismo panel de la ficha (semáforo, citas, lo que
 * respondió Croma, lo que registró el profesor y la línea de tiempo). Antes el
 * perfil no mostraba nada de esto y había que abrir el lápiz en la lista.
 */
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { estadoInfo, type ProcesoContratacion } from "@/lib/contratacion/constants";
import { useAvisosProcesos } from "@/hooks/use-avisos-procesos";
import { PanelSeleccion } from "./panel-seleccion";

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—";
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

export function ProcesoDelCandidato({ proceso, otros, puedeEditar }: { proceso: ProcesoContratacion; otros: number; puedeEditar: boolean }) {
  const router = useRouter();
  // Se actualiza solo cuando cambia el proceso, una cita o un registro del profesor.
  useAvisosProcesos(useCallback(() => router.refresh(), [router]));
  const est = estadoInfo(proceso.estado);
  const datos: [string, string][] = [
    ["Cédula", proceso.cedula],
    ["Celular (WhatsApp)", proceso.celular || (proceso.origen === "chat_prueba" ? "Chat de prueba: sin teléfono" : "—")],
    ["Edad", proceso.edad != null ? `${proceso.edad} años` : "—"],
    ["Ciudad donde vive", proceso.ciudad_residencia ?? "—"],
    ["¿Se traslada?", proceso.dispuesto_traslado == null ? "—" : proceso.dispuesto_traslado ? "Sí" : "No"],
    ...(proceso.llegada_ciudad ? ([["¿Cuándo estaría en la ciudad?", proceso.llegada_ciudad]] as [string, string][]) : []),
    ["Licencia", proceso.licencia_categoria ? `${proceso.licencia_categoria}${proceso.licencia_verificada_runt ? " (verificada en el RUNT)" : ""}` : "—"],
    ["Experiencia", proceso.experiencia_meses != null ? `${proceso.experiencia_meses} meses` : "—"],
    ["Disponibilidad", proceso.disponibilidad || "—"],
    ["SIMIT", proceso.simit ? `${proceso.simit === "ok" ? "Sin deuda" : proceso.simit === "deuda" ? "Deuda" : proceso.simit}${proceso.simit_valor ? ` · ${pesos(Number(proceso.simit_valor))}` : ""}` : "Sin consultar"],
    ["Antecedentes", proceso.antecedentes === "ok" ? "Sin antecedentes" : proceso.antecedentes === "con_antecedentes" ? "Con antecedentes" : proceso.antecedentes === "pendiente" ? "Pendiente" : "Sin consultar"],
    ["Citación", fecha(proceso.fecha_citacion)],
    ["Prueba de manejo", fecha(proceso.fecha_prueba_manejo)],
    ["Exámenes, fase 1", fecha(proceso.fecha_examenes)],
  ];
  return (
    <section className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Proceso de selección</h2>
        <div className="flex flex-wrap items-center gap-2">
          {proceso.origen === "chat_prueba" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <Bot className="h-3 w-3" /> Chat de prueba
            </span>
          )}
          {est && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: est.bg, color: est.color }}>
              {est.label}
              {proceso.estado === "cierre" && proceso.causa_no_contrato ? ` · ${proceso.causa_no_contrato}` : ""}
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Creado el {fecha(proceso.fecha_creacion)}
        {otros > 0 ? ` · tiene ${otros} ${otros === 1 ? "proceso anterior" : "procesos anteriores"} (abajo, en «Postuló antes»)` : ""}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
        {datos.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="truncate font-medium text-gray-800" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {proceso.observacion && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{proceso.observacion}</p>}
      <PanelSeleccion proceso={proceso} puedeEditar={puedeEditar} onCerrado={() => router.refresh()} />
    </section>
  );
}
