import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { getCierreConDetalle, getRendimientoRango } from "@/lib/devengados/rendimiento";
import { RendimientoTab } from "../tesoreria/devengados/simulador/rendimiento-client";

export const dynamic = "force-dynamic";

/**
 * Rendimiento del día para conductores (pedido de Nestor, 28-jul-2026):
 * la misma consulta del simulador pero SOLO esa vista, sin las otras
 * pestañas ni edición de parámetros, y sin listado inicial — la información
 * aparece únicamente al digitar el código del conductor o el vehículo.
 * El simulador completo sigue reservado al administrador (SUBS_SOLO_ADMIN);
 * esta ruta se concede por el módulo "rendimiento" (rol propio).
 */
export default async function RendimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; hasta?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "rendimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const { fecha, hasta } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const valida = (f?: string) =>
    f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : null;
  const fechaSel = valida(fecha) ?? hoy;
  const hastaParam = valida(hasta);
  const fechaFin = hastaParam && hastaParam >= fechaSel ? hastaParam : fechaSel;

  const [baseVigente, { conductores: cierre, detalle }] = await Promise.all([
    getBaseDiaria(),
    getCierreConDetalle(fechaSel, fechaFin),
  ]);
  // Con cierre, el detalle por ruta sale del MISMO cierre; sin cierre se
  // estima desde los viajes (idéntico al simulador).
  const rendimiento =
    cierre.length > 0 ? detalle : await getRendimientoRango(fechaSel, fechaFin);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Rendimiento del día</h1>
          <span className="inline-flex items-center rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#075985]">
            CONSULTA POR CÓDIGO
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <RendimientoTab
          grupos={rendimiento}
          cierre={cierre}
          fecha={fechaSel}
          fechaFin={fechaFin}
          hoy={hoy}
          baseVigente={baseVigente}
          basePath="/rendimiento"
          restringido
        />
      </div>
    </div>
  );
}
