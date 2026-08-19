import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getFechaOperativa } from "@/lib/devengados/data";
import { quincenaDe } from "@/lib/devengados/engine";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import { getLiquidacionConductor } from "@/lib/devengados/liquidacion";
import { LiquidacionClient } from "../liquidacion/liquidacion-client";

export const dynamic = "force-dynamic";

/**
 * Producción del conductor: el mismo reporte de /liquidacion pero SIN base,
 * saldos, retiros ni disponible — solo lo producido por día. Vive en un
 * módulo de permiso propio ("produccion_conductor", migración 045) para poder
 * entregarlo a quien no debe ver la deuda del conductor; el cálculo es el
 * mismo (getLiquidacionConductor), solo cambia lo que se presenta.
 */
export default async function ProduccionConductorPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; fecha?: string; hasta?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "produccion_conductor")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const { codigo, fecha, hasta } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const valida = (f?: string) =>
    f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : null;
  // Rango por defecto: la quincena en curso hasta hoy.
  const fechaSel = valida(fecha) ?? quincenaDe(hoy).ini;
  const hastaParam = valida(hasta);
  const fechaFin = hastaParam && hastaParam >= fechaSel ? hastaParam : hoy >= fechaSel ? hoy : fechaSel;

  const codigoSel = codigo && esBusquedaCodigo(codigo.trim()) ? codigo.trim() : null;
  const liquidacion = codigoSel
    ? await getLiquidacionConductor(codigoSel, fechaSel, fechaFin)
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Producción conductor</h1>
          <span className="inline-flex items-center rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#075985]">
            CONSULTA POR CÓDIGO
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <LiquidacionClient
          key={`${codigoSel ?? ""}|${fechaSel}|${fechaFin}`}
          codigo={codigoSel}
          fecha={fechaSel}
          fechaFin={fechaFin}
          hoy={hoy}
          liquidacion={liquidacion}
          mostrarSaldos={false}
          ruta="/produccion-conductor"
        />
      </div>
    </div>
  );
}
