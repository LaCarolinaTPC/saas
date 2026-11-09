import { redirect } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getCurrentPermissions } from "@/lib/permissions";
import { getTrabajadoresParaAt, type OpcionTrabajador } from "@/lib/sst/data";
import {
  getExamenes, getNovedadesExamenes, getPersonasExamenes, getProfesiograma, getRetiradosEnMaestro, tieneAccesoExamenes,
  type DatosProfesiograma, type NovedadExamenes,
} from "@/lib/sst/examenes-data";
import type { ExamenPeriodico, PersonaExamen } from "@/lib/sst/examenes";
import { PROFESIOGRAMA } from "@/lib/sst/profesiograma";
import { ExamenesClient } from "./examenes-client";

export const dynamic = "force-dynamic";

const PESTANAS = ["control", "atenciones", "profesiograma"] as const;

/**
 * Exámenes periódicos (Recursos Humanos – SST): el control de vencimientos por
 * persona (las hojas de control del Excel «LISTADO PERSONAL EXAMEN PERIODICO»)
 * y el registro de cada atención con su entrega y sus recomendaciones (las
 * hojas mensuales). Ver docs/modulos/examenes-periodicos.md.
 */
export default async function ExamenesPeriodicosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await tieneAccesoExamenes())) {
    const perms = await getCurrentPermissions();
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const tab = (PESTANAS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof PESTANAS)[number]) : "control";
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  let personas: PersonaExamen[] = [];
  let examenes: ExamenPeriodico[] = [];
  let trabajadores: OpcionTrabajador[] = [];
  let retirados: string[] = [];
  let novedades: { disponible: boolean; novedades: NovedadExamenes[] } = { disponible: false, novedades: [] };
  let profesiograma: DatosProfesiograma = { tabla: PROFESIOGRAMA, editable: false, cargas: [] };
  let error: string | null = null;
  try {
    [personas, examenes, trabajadores, novedades, profesiograma] = await Promise.all([
      getPersonasExamenes(),
      getExamenes(),
      getTrabajadoresParaAt(),
      getNovedadesExamenes(),
      getProfesiograma(),
    ]);
    retirados = await getRetiradosEnMaestro(personas.filter((p) => p.activo).map((p) => p.cedula));
  } catch (e) {
    // Sin la migración aplicada las tablas no existen: se dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Exámenes periódicos"
        icono={Stethoscope}
        descripcion="Recursos Humanos – SST: vencimientos de los exámenes médicos ocupacionales y registro de cada atención."
      />
      <div className="px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">El módulo todavía no está listo en la base de datos.</p>
            <p className="mt-1">
              Falta aplicar la migración <code>20261105161614_sst_examenes_periodicos.sql</code> en el SQL Editor.
            </p>
            <p className="mt-2 text-xs text-amber-700">Detalle: {error}</p>
          </div>
        ) : (
          <ExamenesClient tabInicial={tab} personas={personas} examenes={examenes} trabajadores={trabajadores} retiradosMaestro={retirados} novedades={novedades} profesiograma={profesiograma} hoy={hoy} />
        )}
      </div>
    </div>
  );
}
