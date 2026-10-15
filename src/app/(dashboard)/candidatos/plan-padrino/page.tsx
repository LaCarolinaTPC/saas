import { HeartHandshake } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { cedulaDelUsuario, getPoliticaVigente, getProcesoOpcion, hoyBogota, listarReferidos } from "@/lib/padrino/datos";
import { PlanPadrinoClient } from "./plan-padrino-client";

export const dynamic = "force-dynamic";

export default async function PlanPadrinoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", "padrino_consulta")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const sp = await searchParams;
  const filtros = { estado: sp.estado ?? "todos", q: sp.q ?? "", anulados: sp.anulados === "1" };
  const puedeRegistrar = canAccessSub(perms, "candidatos", "padrino_registro") && (perms.puedeEditar || perms.isAdmin);

  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  const [lista, politica, procesoInicial] = await Promise.all([
    listarReferidos(filtros, cedula).then(
      (filas) => ({ filas, error: null as string | null }),
      (e: Error) => ({ filas: [], error: e.message })
    ),
    getPoliticaVigente(hoyBogota()).catch(() => null),
    puedeRegistrar && sp.registrar ? getProcesoOpcion(sp.registrar) : Promise.resolve(null),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Plan Padrino"
        icono={HeartHandshake}
        volver={{ href: "/candidatos", label: "Candidatos" }}
        descripcion="Bonificación al colaborador operativo que refiere un conductor que permanece en la empresa."
      />
      <PlanPadrinoClient
        filas={lista.filas}
        error={lista.error}
        filtros={filtros}
        puedeRegistrar={puedeRegistrar}
        politica={politica ? { version: politica.version, vigenteDesde: politica.vigente_desde, esquemas: politica.esquemas } : null}
        procesoInicial={procesoInicial}
      />
    </div>
  );
}
