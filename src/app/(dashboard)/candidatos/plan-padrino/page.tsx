import { HeartHandshake } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccessSub, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { cedulaDelUsuario, getPoliticas, getPoliticaVigente, getProcesoOpcion, hoyBogota, listarReferidos } from "@/lib/padrino/datos";
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
  const puedeRegistrar = puedeEditarEn(perms, "candidatos.padrino_registro");

  const cedula = await cedulaDelUsuario(perms.userId, perms.userEmail);
  const [lista, politica, procesoInicial, todas] = await Promise.all([
    listarReferidos(filtros, cedula).then(
      (filas) => ({ filas, error: null as string | null }),
      (e: Error) => ({ filas: [], error: e.message })
    ),
    getPoliticaVigente(hoyBogota()).catch(() => null),
    puedeRegistrar && sp.registrar ? getProcesoOpcion(sp.registrar) : Promise.resolve(null),
    getPoliticas(undefined, { borradores: true }).catch(() => []),
  ]);
  // La versión en borrador (p. ej. la v3) se muestra aparte, marcada como que aún no rige.
  const borrador = todas.filter((p) => p.estado === "borrador").at(-1) ?? null;

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
        politica={politica ? { version: politica.version, vigenteDesde: politica.vigente_desde, parametros: politica.parametros } : null}
        borrador={borrador ? { id: borrador.id, version: borrador.version, parametros: borrador.parametros } : null}
        // Simular solo lee (aprobación o administrador); publicar es solo de administradores.
        puedeSimular={perms.isAdmin || canAccessSub(perms, "candidatos", "padrino_aprobacion")}
        puedePublicar={perms.isAdmin}
        hoy={hoyBogota()}
        procesoInicial={procesoInicial}
      />
    </div>
  );
}
