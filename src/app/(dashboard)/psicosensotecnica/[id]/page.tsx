import { notFound, redirect } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DetalleIntento } from "@/components/psicosensotecnica/detalle-intento";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getCurrentPermissions } from "@/lib/permissions";
import { detalleIntento, tieneAccesoPsico } from "@/lib/psicosensotecnica/servidor";

export const dynamic = "force-dynamic";

/** Resultado de una prueba, en página completa: a ella enlaza la ficha del candidato. */
export default async function PruebaPsicoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tieneAccesoPsico())) {
    const p = await getCurrentPermissions();
    redirect(p.modules[0] ? (MODULE_HOME[p.modules[0]] ?? "/login") : "/login");
  }
  const { id } = await params;
  // Un id que no es UUID hace fallar la consulta: para quien llega es «no existe».
  const intento = /^[0-9a-f-]{36}$/i.test(id) ? await detalleIntento(id) : null;
  if (!intento) notFound();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo={intento.nombre ?? "Prueba psicosensotécnica"} icono={BrainCircuit} volver={{ href: "/psicosensotecnica", label: "Pruebas" }} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <DetalleIntento intento={intento} />
        </div>
      </div>
    </div>
  );
}
