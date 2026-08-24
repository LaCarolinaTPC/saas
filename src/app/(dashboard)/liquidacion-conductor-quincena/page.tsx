import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getFechaOperativa } from "@/lib/devengados/data";
import { quincenaDe } from "@/lib/devengados/engine";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import { getLiquidacionConductor } from "@/lib/devengados/liquidacion";
import { LiquidacionClient } from "../liquidacion/liquidacion-client";

export const dynamic = "force-dynamic";

/**
 * Consulta quincenal por código sin resumen, base, saldos ni retiros.
 * Comparte el cálculo de liquidación, pero se concede con un permiso propio
 * para no revelar valores sensibles de la liquidación consolidada.
 */
export default async function LiquidacionConductorQuincenaPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; fecha?: string; hasta?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "liquidacion_conductor_quincena")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const { codigo, fecha, hasta } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const valida = (f?: string) =>
    f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : null;
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
          <ReceiptText className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Liquidación conductor Quincena</h1>
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
          mostrarResumen={false}
          ruta="/liquidacion-conductor-quincena"
          descripcionReporte="liquidación quincenal"
          tituloExcel="Liquidación conductor Quincena"
          tipoAuditoria="liquidacion_conductor_quincena"
        />
      </div>
    </div>
  );
}
