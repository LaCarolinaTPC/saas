import { Flame } from "lucide-react";
import MapaCalorClient from "@/app/(dashboard)/rotacion/mapa-calor/MapaCalorClient";
import { getMapaCalorData } from "@/lib/rotacion/data/mapa-calor";
import { PestanasCartulina } from "../pestanas";

/**
 * Revisión Cartulina (Tesorería) · Mapa de calor: la misma pantalla del mapa
 * de calor de Rotación — subidas/bajadas, timbradas netas, viajes con alerta
 * de VERIFICACIÓN DE TIMBRADA — orientada al cuadre de cartulinas.
 */
export default async function RevisionCartulinaMapaPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string; hasta?: string; ruta?: string; punto?: string;
    vehiculo?: string; despacho?: string; hd?: string; hh?: string;
  }>;
}) {
  const params = await searchParams;
  const data = await getMapaCalorData(params);

  return (
    <>
      <div className="mx-auto flex max-w-7xl justify-end px-6 pt-4 lg:px-8">
        <PestanasCartulina activa="mapa" />
      </div>
      {data ? (
        <MapaCalorClient data={data} titulo="Revisión Cartulina" />
      ) : (
        <div className="max-w-4xl mx-auto pt-16 text-center animate-fade-in">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
            <Flame className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Error cargando datos</h1>
          <p className="text-sm text-text-tertiary mt-2">
            No se pudieron obtener los puntos de subida y bajada de pasajeros.
          </p>
        </div>
      )}
    </>
  );
}
