import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getCurrentPermissions } from "@/lib/permissions";
import { getAccidentesTrabajo, getTrabajadoresParaAt, tieneAccesoAccidentesTrabajo, type OpcionTrabajador } from "@/lib/sst/data";
import type { AccidenteTrabajo } from "@/lib/sst/reglas";
import { AccidentesTrabajoClient } from "./accidentes-trabajo-client";

export const dynamic = "force-dynamic";

const PESTANAS = ["registro", "caracterizacion"] as const;

/**
 * Accidentes de trabajo (Recursos Humanos – SST): el registro de cada
 * accidente del trabajador y la caracterización de la accidentalidad (por mes,
 * tipo de lesión, parte del cuerpo, mecanismo, agente y día). Reemplaza el
 * Excel «INFORMACION ACCIDENTES DE TRABAJO».
 */
export default async function AccidentesTrabajoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await tieneAccesoAccidentesTrabajo())) {
    const perms = await getCurrentPermissions();
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const tab = (PESTANAS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof PESTANAS)[number]) : "registro";
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  let accidentes: AccidenteTrabajo[] = [];
  let trabajadores: OpcionTrabajador[] = [];
  let error: string | null = null;
  try {
    [accidentes, trabajadores] = await Promise.all([getAccidentesTrabajo(), getTrabajadoresParaAt()]);
  } catch (e) {
    // Sin la migración aplicada la tabla no existe: se dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Accidentes de trabajo"
        icono={HardHat}
        descripcion="Recursos Humanos – SST: registro de accidentes laborales y caracterización de la accidentalidad."
      />
      <div className="px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">El módulo todavía no está listo en la base de datos.</p>
            <p className="mt-1">
              Falta aplicar la migración <code>20261029231220_sst_accidentes_de_trabajo.sql</code> en el SQL Editor.
            </p>
            <p className="mt-2 text-xs text-amber-700">Detalle: {error}</p>
          </div>
        ) : (
          <AccidentesTrabajoClient tabInicial={tab} accidentes={accidentes} trabajadores={trabajadores} hoy={hoy} />
        )}
      </div>
    </div>
  );
}
