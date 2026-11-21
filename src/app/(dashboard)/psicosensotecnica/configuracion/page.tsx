import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { canAccessSub, getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { CONFIG_POR_DEFECTO, type ConfigPsico } from "@/lib/psicosensotecnica/config";
import { leerConfigPsico, listarEquipos } from "@/lib/psicosensotecnica/servidor";
import type { Equipo } from "@/lib/psicosensotecnica/tipos";
import { ConfigClient } from "./config-client";

export const dynamic = "force-dynamic";

/**
 * Configuración de la prueba psicosensotécnica: quién puede presentarla (solo
 * candidatos o libre), desde qué equipos, cuántos intentos y qué se le resalta
 * a la psicóloga. Función sensible `psicosensotecnica.config`.
 */
export default async function PsicoConfiguracionPage() {
  const perms = await getCurrentPermissions();
  if (!perms.userId || !canAccessSub(perms, "psicosensotecnica", "psico_config")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  let config: ConfigPsico = CONFIG_POR_DEFECTO;
  let equipos: Equipo[] = [];
  let error: string | null = null;
  try {
    [config, equipos] = await Promise.all([leerConfigPsico(), listarEquipos()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Configuración de la prueba" icono={Settings} volver={{ href: "/psicosensotecnica", label: "Pruebas" }} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">El módulo todavía no está listo en la base de datos.</p>
            <p className="mt-1">
              Falta aplicar la migración <code>20261120170136_psicosensotecnica_prueba_para_conductores.sql</code> en el SQL Editor.
            </p>
            <p className="mt-2 text-xs text-amber-700">Detalle: {error}</p>
          </div>
        ) : (
          <ConfigClient config={config} equipos={equipos} puedeEditar={tienePermiso(perms, "psicosensotecnica.config.editar")} />
        )}
      </div>
    </div>
  );
}
