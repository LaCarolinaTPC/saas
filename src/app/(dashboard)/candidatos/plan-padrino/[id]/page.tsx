import { HeartHandshake } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { cedulaDelUsuario, getReferido } from "@/lib/padrino/datos";
import { alertasDeReferido } from "@/lib/padrino/tablero-datos";
import { ReferidoClient } from "./referido-client";

export const dynamic = "force-dynamic";

export default async function ReferidoPage({ params }: { params: Promise<{ id: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "candidatos", "padrino_consulta")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const [datos, cedula] = await Promise.all([getReferido((await params).id), cedulaDelUsuario(perms.userId, perms.userEmail)]);
  // El padrino no ve su propio registro (RQ-07): para él no existe.
  if (!datos || (cedula && datos.referido.cedula_padrino === cedula)) notFound();

  const edita = perms.puedeEditar || perms.isAdmin;
  const alertas = await alertasDeReferido(datos.referido, datos.hitos).catch(() => []);
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo={datos.referido.nombre_referido ?? datos.referido.cedula_referido}
        icono={HeartHandshake}
        volver={{ href: "/candidatos/plan-padrino", label: "Plan Padrino" }}
      />
      <ReferidoClient
        datos={datos}
        alertas={alertas.flatMap((a) => a.motivos)}
        puedeRegistrar={edita && canAccessSub(perms, "candidatos", "padrino_registro")}
        puedeAprobar={edita && canAccessSub(perms, "candidatos", "padrino_aprobacion")}
      />
    </div>
  );
}
