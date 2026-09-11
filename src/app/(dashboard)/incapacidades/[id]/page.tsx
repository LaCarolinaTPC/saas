import { notFound } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaExpediente } from "@/lib/incapacidades/auditoria";
import { leerExpediente } from "@/lib/incapacidades/expedientes";
import { ChipEstado } from "../bandeja-tabla";
import { ExpedienteFicha } from "../expediente-ficha";
import { Fallo, SinAcceso } from "../sin-acceso";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function ExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso />;

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  let detalle: Awaited<ReturnType<typeof leerExpediente>> = null;
  let fallo: string | null = null;
  try {
    detalle = await leerExpediente(id);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo && !detalle) notFound();

  if (detalle) {
    await auditarConsultaExpediente({
      expedienteId: detalle.vista.id,
      cedula: detalle.vista.cedula,
      nombre: detalle.vista.nombre,
      estado: detalle.vista.estado,
      rol: perms.userType,
      userEmail: perms.userEmail,
    });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo={detalle ? `Expediente · ${detalle.vista.nombre ?? detalle.vista.cedula}` : "Expediente"}
        icono={HeartPulse}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        junto={detalle ? <ChipEstado estado={detalle.vista.estado} /> : undefined}
      />
      <div className="p-6">
        {fallo && <Fallo mensaje={fallo} />}
        {detalle && <ExpedienteFicha d={detalle} />}
      </div>
    </div>
  );
}
