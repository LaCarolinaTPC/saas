import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getFechaOperativa, getUltimoCierre } from "@/lib/devengados/data";
import { elegirQuincena, quincenasConsultables } from "@/lib/devengados/quincenas-liquidacion";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import { getLiquidacionConductor } from "@/lib/devengados/liquidacion";
import { puedeVerAntesCorreccion } from "@/lib/devengados/antes-correccion";
import { PageHeader } from "@/components/layout/page-header";
import { LiquidacionClient } from "../liquidacion/liquidacion-client";

export const dynamic = "force-dynamic";

/**
 * Consulta quincenal por código sin resumen, base, saldos ni retiros.
 * Comparte el cálculo de liquidación, pero se concede con un permiso propio
 * para no revelar valores sensibles de la liquidación consolidada.
 *
 * Desde el 2026-11-10 solo se consulta la quincena actual o la anterior, para
 * todos los usuarios (administradores incluidos): ?q=actual|anterior en lugar
 * de fechas libres. La actual llega hasta el último cierre cargado
 * (quincenas-liquidacion.ts). Los enlaces viejos con ?fecha=&hasta= se ignoran
 * y abren la quincena por defecto. Se consulta en un TV: controles grandes,
 * todo el ancho y el resultado se quita al cambiar el código o la quincena.
 */
export default async function LiquidacionConductorQuincenaPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; q?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "liquidacion_conductor_quincena")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const { codigo, q } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const quincenas = quincenasConsultables(hoy, await getUltimoCierre(hoy));
  const sel = elegirQuincena(quincenas, q);
  const fechaSel = sel?.ini ?? hoy;
  const fechaFin = sel?.fin ?? hoy;
  const codigoSel = codigo && esBusquedaCodigo(codigo.trim()) ? codigo.trim() : null;
  const liquidacion = codigoSel && sel
    ? await getLiquidacionConductor(codigoSel, sel.ini, sel.fin, { excluirVacaciones: true })
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Liquidacion Producción"
        icono={ReceiptText}
        junto={
          <span className="inline-flex items-center rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#075985]">
            CONSULTA POR CÓDIGO
          </span>
        }
      />
      {/* Todo el ancho: en el TV no se desperdician los costados. */}
      <div className="w-full space-y-4 p-4 sm:p-6 xl:px-8">
        {puedeVerAntesCorreccion(perms.userEmail) && (
          <div className="flex justify-end">
            <Link
              href={`/liquidacion-conductor-quincena/antes-correccion${
                codigoSel && sel ? `?codigo=${codigoSel}&fecha=${fechaSel}&hasta=${fechaFin}` : ""
              }`}
              className="rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-sm font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
            >
              Ver cómo estaba antes de la corrección
            </Link>
          </div>
        )}
        <LiquidacionClient
          key={`${codigoSel ?? ""}|${sel?.clave ?? ""}|${fechaFin}`}
          codigo={codigoSel}
          fecha={fechaSel}
          fechaFin={fechaFin}
          hoy={hoy}
          liquidacion={liquidacion}
          quincenas={quincenas}
          quincena={sel?.clave ?? null}
          grande
          limpiarAlCambiar
          mostrarSaldos={false}
          mostrarResumen={false}
          ruta="/liquidacion-conductor-quincena"
          descripcionReporte="Liquidacion Producción"
          tituloExcel="Liquidacion Producción"
          tipoAuditoria="liquidacion_conductor_quincena"
          mensajeTotalNeto="no tiene descuentos aplicados"
        />
      </div>
    </div>
  );
}
