import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getCurrentPermissions } from "@/lib/permissions";
import { getFechaOperativa } from "@/lib/devengados/data";
import { quincenaDe } from "@/lib/devengados/engine";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import { getLiquidacionConductor } from "@/lib/devengados/liquidacion";
import { puedeVerAntesCorreccion } from "@/lib/devengados/antes-correccion";
import { PageHeader } from "@/components/layout/page-header";
import { LiquidacionClient } from "../../liquidacion/liquidacion-client";

export const dynamic = "force-dynamic";

/**
 * Liquidación Producción como se veía ANTES de la corrección del 06-nov-2026
 * (cierres duplicados del 27 y 28 de octubre). Ver antes-correccion.ts.
 */
export default async function LiquidacionAntesCorreccionPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; fecha?: string; hasta?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!puedeVerAntesCorreccion(perms.userEmail)) redirect("/liquidacion-conductor-quincena");

  const { codigo, fecha, hasta } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const valida = (f?: string) =>
    f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : null;
  const fechaSel = valida(fecha) ?? quincenaDe("2026-10-27").ini;
  const hastaParam = valida(hasta);
  const fechaFin = hastaParam && hastaParam >= fechaSel ? hastaParam : quincenaDe("2026-10-27").fin;
  const codigoSel = codigo && esBusquedaCodigo(codigo.trim()) ? codigo.trim() : null;
  const liquidacion = codigoSel
    ? await getLiquidacionConductor(codigoSel, fechaSel, fechaFin, {
        excluirVacaciones: true,
        incluirSobrantesCorreccion: true,
      })
    : null;
  const qs = codigoSel ? `?codigo=${codigoSel}&fecha=${fechaSel}&hasta=${fechaFin}` : "";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Liquidacion Producción"
        icono={History}
        junto={
          <span className="inline-flex items-center rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-[#991B1B]">
            ANTES DE LA CORRECCIÓN
          </span>
        }
      />
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm text-[#7F1D1D]">
          <p className="font-semibold">Estos valores NO son los vigentes.</p>
          <p className="mt-1">
            Así se veía la liquidación antes del 6 de noviembre, cuando el sistema todavía tenía
            duplicados algunos cierres del 27 y 28 de octubre que GEMA había rehecho. Úsela solo
            para mostrar la diferencia.{" "}
            <Link
              href={`/liquidacion-conductor-quincena${qs}`}
              className="font-semibold underline"
            >
              Ver la liquidación correcta
            </Link>
          </p>
        </div>
        <LiquidacionClient
          key={`${codigoSel ?? ""}|${fechaSel}|${fechaFin}`}
          codigo={codigoSel}
          fecha={fechaSel}
          fechaFin={fechaFin}
          hoy={hoy}
          liquidacion={liquidacion}
          mostrarSaldos={false}
          mostrarResumen={false}
          ruta="/liquidacion-conductor-quincena/antes-correccion"
          descripcionReporte="Liquidacion Producción (antes de la corrección)"
          tituloExcel="Liquidacion ANTES correccion"
          tipoAuditoria="liquidacion_antes_correccion"
          mensajeTotalNeto="valor ANTES de la corrección: no es el vigente"
        />
      </div>
    </div>
  );
}
