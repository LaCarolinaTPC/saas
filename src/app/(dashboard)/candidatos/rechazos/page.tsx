import { UserX } from "lucide-react";
import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { getEtapasReporte, getRechazos, getVacantesConRechazos, parseFiltrosRechazos } from "@/lib/rechazos/datos";
import { resumirRechazos } from "@/lib/rechazos/reporte";
import { RechazosClient } from "./rechazos-client";

export const dynamic = "force-dynamic";

export default async function RechazosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const sp = await searchParams;
  const filtros = parseFiltrosRechazos({ get: (k) => sp[k] ?? null });

  const [{ filas, error }, etapas, vacantes] = await Promise.all([
    getRechazos(filtros).then(
      (f) => ({ filas: f, error: null }),
      (e: Error) => ({ filas: [], error: e.message })
    ),
    getEtapasReporte(),
    getVacantesConRechazos().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Rechazos por fase"
        icono={UserX}
        volver={{ href: "/candidatos", label: "Candidatos" }}
        descripcion="En qué fase del pipeline se rechaza a los candidatos y por qué."
      />
      <RechazosClient
        filtros={filtros}
        vacantes={vacantes}
        filas={filas}
        resumen={resumirRechazos(filas, etapas)}
        error={error}
      />
    </div>
  );
}
