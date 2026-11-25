import { redirect } from "next/navigation";
import { getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { ReconocimientoClient } from "./client";

export const dynamic = "force-dynamic";

/** Reconocimiento de ruta (24-nov-2026): la pantalla del encargado, pensada también para el celular. */
export default async function ReconocimientoPage() {
  const perms = await getCurrentPermissions();
  if (!tienePermiso(perms, "reconocimiento.ver")) redirect("/");
  return <ReconocimientoClient puedeEditar={tienePermiso(perms, "reconocimiento.editar")} />;
}
