import { redirect } from "next/navigation";
import { getCurrentPermissions, canAccessSub, type Permissions } from "@/lib/permissions";
import { MODULE_SUBS } from "@/lib/permissions-shared";

const SUB_HOME: Record<string, string> = {
  caja: "/tesoreria/devengados",
  analisis: "/tesoreria/devengados/analisis",
  entregas: "/tesoreria/devengados/entregas",
  parametros: "/tesoreria/devengados/parametros",
  auditoria: "/tesoreria/devengados/auditoria",
};

/**
 * Exige la sub-función de Tesorería en páginas server. Si el usuario no la
 * tiene, lo manda a la primera sub-función suya (o al dashboard).
 */
export async function requireTesoreriaSub(sub: string): Promise<Permissions> {
  const perms = await getCurrentPermissions();
  if (canAccessSub(perms, "tesoreria", sub)) return perms;
  const fallback = MODULE_SUBS.tesoreria.find((s) =>
    canAccessSub(perms, "tesoreria", s)
  );
  redirect(fallback ? SUB_HOME[fallback] : "/");
}
