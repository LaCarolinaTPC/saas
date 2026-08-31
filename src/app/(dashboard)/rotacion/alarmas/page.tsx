import { TriangleAlert } from "lucide-react";
import AlarmasClient from "./AlarmasClient";
import { getAlarmasData } from "@/lib/rotacion/data/alarmas";

export default async function AlarmasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; tipo?: string; ruta?: string }>;
}) {
  const params = await searchParams;
  const data = await getAlarmasData(params);

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto pt-16 text-center animate-fade-in">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
          <TriangleAlert className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary">Error cargando datos</h1>
        <p className="text-sm text-text-tertiary mt-2">
          No se pudieron obtener las alarmas de las registradoras.
        </p>
      </div>
    );
  }

  return <AlarmasClient data={data} />;
}
