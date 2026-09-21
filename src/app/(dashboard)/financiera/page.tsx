import { redirect } from "next/navigation";
import { getCurrentPermissions } from "@/lib/permissions";
import { pestanasPermitidas } from "./flota/marco";
import { SinAcceso } from "./sin-acceso";

export const dynamic = "force-dynamic";

/**
 * Raíz del módulo Financiera: manda a la primera pantalla que el usuario
 * puede ver. Hoy la única opción es Gestión de flota; cuando haya otras,
 * esta ruta elige entre ellas.
 */
export default async function FinancieraPage() {
  const perms = await getCurrentPermissions();
  const permitidas = pestanasPermitidas(perms);
  if (permitidas.length === 0) return <SinAcceso />;
  redirect(permitidas[0].href);
}
