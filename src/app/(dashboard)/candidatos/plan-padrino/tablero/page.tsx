import { BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { cedulaDelUsuario, hoyBogota } from "@/lib/padrino/datos";
import { getTablero } from "@/lib/padrino/tablero-datos";
import { TableroClient } from "./tablero-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TableroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", "padrino_consulta")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const hoy = hoyBogota();
  const filtros = {
    desde: FECHA_RE.test(sp.desde ?? "") ? (sp.desde as string) : `${hoy.slice(0, 4)}-01-01`,
    hasta: FECHA_RE.test(sp.hasta ?? "") ? (sp.hasta as string) : hoy,
  };
  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  const { datos, error } = await getTablero(filtros, hoy, cedula).then(
    (d) => ({ datos: d, error: null as string | null }),
    (e: Error) => ({ datos: null, error: e.message })
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Tablero del Plan Padrino"
        icono={BarChart3}
        volver={{ href: "/candidatos/plan-padrino", label: "Plan Padrino" }}
        descripcion="Referidos, hitos y pagos; permanencia de los referidos frente a otras fuentes, y alertas antes de que venza un hito."
      />
      <TableroClient datos={datos} error={error} filtros={filtros} hoy={hoy} />
    </div>
  );
}
