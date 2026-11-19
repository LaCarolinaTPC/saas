import { redirect } from "next/navigation";
import { getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { ProfesorClient } from "./client";

export const dynamic = "force-dynamic";

/** Pantalla del profesor de manejo (selección, entrega 2): lo de hoy, en el celular. */
export default async function ProfesorPage() {
  const perms = await getCurrentPermissions();
  if (!tienePermiso(perms, "profesor.ver")) redirect("/");
  return <ProfesorClient puedeEditar={tienePermiso(perms, "profesor.editar")} />;
}
