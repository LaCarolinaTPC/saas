import { LineChart } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { analizar, type Analisis } from "@/lib/analisis-liquidacion/analisis";
import { leerDatos } from "@/lib/analisis-liquidacion/datos";
import { hoyBogota } from "@/lib/riesgo/fechas";
import { AnalisisLiquidacionClient } from "./analisis-client";

export const dynamic = "force-dynamic";
// Lee el maestro y la vista mensual y entrena el modelo en cada carga (~1 s de
// cálculo); el margen es para la lectura de la base.
export const maxDuration = 60;

export default async function AnalisisLiquidacionPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "analisis_liquidacion")) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Análisis de liquidación" icono={LineChart} />
        <div className="p-6">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
            No tienes acceso a este módulo. Muestra el ingreso de cada conductor, así que se
            habilita por solicitud a Administración.
          </div>
        </div>
      </div>
    );
  }

  let analisis: Analisis | null = null;
  let fallo: string | null = null;
  try {
    const { conductores, meses, novedades, coberturas } = await leerDatos();
    analisis = analizar(conductores, meses, hoyBogota(), novedades, coberturas);
  } catch (e) {
    // Lo más probable recién desplegado: la vista liquidacion_conductor_mes
    // todavía no se ha creado en el SQL Editor.
    fallo = e instanceof Error ? e.message : String(e);
  }

  return <AnalisisLiquidacionClient analisis={analisis} fallo={fallo} />;
}
