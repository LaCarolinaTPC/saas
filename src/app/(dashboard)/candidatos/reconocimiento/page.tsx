import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { ReconocimientoClient } from "../../reconocimiento/client";

export const dynamic = "force-dynamic";

/**
 * Candidatos › Reconocimiento de ruta (27-nov-2026): la misma pantalla del
 * encargado (/reconocimiento), dentro de Candidatos para encontrarla fácil.
 * Muestra a quienes pueden hacerlo (desde la fase 1 de exámenes) para citarlos.
 */
export default async function ReconocimientoCandidatosPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") && !tienePermiso(perms, "reconocimiento.ver")) redirect("/");
  return <ReconocimientoClient enCandidatos puedeEditar={tienePermiso(perms, "reconocimiento.editar") || tienePermiso(perms, "candidatos.editar")} />;
}
