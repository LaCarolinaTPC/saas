import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getCurrentPermissions } from "@/lib/permissions";
import { getConductoresParaProcesos, getProcesos, tieneAccesoDisciplinarios, type OpcionConductor } from "@/lib/disciplinarios/data";
import type { Proceso } from "@/lib/disciplinarios/reglas";
import { DisciplinariosClient } from "./disciplinarios-client";

export const dynamic = "force-dynamic";

const PESTANAS = ["registro", "conductores", "motivos"] as const;

/**
 * Procesos disciplinarios (Recursos Humanos): llamados de atención,
 * citaciones a descargos y la medida tomada. Reemplaza el Excel de RRHH y
 * resume por conductor (cuántas veces fue a descargos y por qué) y por motivo.
 */
export default async function DisciplinariosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await tieneAccesoDisciplinarios())) {
    const perms = await getCurrentPermissions();
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const tab = (PESTANAS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof PESTANAS)[number]) : "registro";
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  let procesos: Proceso[] = [];
  let conductores: OpcionConductor[] = [];
  let error: string | null = null;
  try {
    [procesos, conductores] = await Promise.all([getProcesos(), getConductoresParaProcesos()]);
  } catch (e) {
    // Sin la migración aplicada la tabla no existe: se dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Procesos disciplinarios"
        icono={Gavel}
        descripcion="Llamados de atención, citaciones a descargos y la medida tomada, con el resumen por conductor y por motivo."
      />
      <div className="px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">El módulo todavía no está listo en la base de datos.</p>
            <p className="mt-1">
              Falta aplicar la migración <code>20261027200246_procesos_disciplinarios_llamados_de_atencion_y_descargos.sql</code> en el SQL Editor.
            </p>
            <p className="mt-2 text-xs text-amber-700">Detalle: {error}</p>
          </div>
        ) : (
          <DisciplinariosClient tabInicial={tab} qInicial={(sp.q ?? "").slice(0, 80)} procesos={procesos} conductores={conductores} hoy={hoy} />
        )}
      </div>
    </div>
  );
}
