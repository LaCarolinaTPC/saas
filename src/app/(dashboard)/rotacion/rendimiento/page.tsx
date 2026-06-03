import { BarChart3 } from "lucide-react";
import RendimientoDashboard from "./RendimientoDashboard";
import { getRendimientoData } from "@/lib/rotacion/data/rendimiento";

export default async function RendimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const data = await getRendimientoData(params.desde, params.hasta);

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto pt-16 text-center animate-fade-in">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
          <BarChart3 className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary">
          Error cargando datos
        </h1>
        <p className="text-sm text-text-tertiary mt-2">
          No se pudieron obtener las metricas de rendimiento.
        </p>
      </div>
    );
  }

  return (
    <RendimientoDashboard
      data={data}
      fechaDesde={params.desde}
      fechaHasta={params.hasta}
    />
  );
}
