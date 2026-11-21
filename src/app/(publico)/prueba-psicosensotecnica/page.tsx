import type { Metadata } from "next";
import { equipoActual, leerConfigPsico } from "@/lib/psicosensotecnica/servidor";
import { PruebaClient } from "./prueba-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prueba psicosensotécnica",
  robots: { index: false, follow: false },
};

/**
 * Prueba psicosensotécnica de conductores: pública, sin cuenta. La persona se
 * identifica con la cédula. Quién puede presentarla y desde qué equipo lo
 * decide la configuración del módulo (/psicosensotecnica/configuracion).
 */
export default async function PruebaPsicosensotecnicaPage() {
  let estado: { activo: boolean; pideEquipo: boolean; equipo: string | null } | null = null;
  try {
    const [config, equipo] = await Promise.all([leerConfigPsico(), equipoActual()]);
    estado = { activo: config.activo, pideEquipo: config.exigirEquipoVinculado && !equipo, equipo: equipo?.nombre ?? null };
  } catch {
    // Sin la migración aplicada no hay nada que presentar.
  }

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-4 py-6 text-gray-900 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-center text-xl font-bold sm:text-2xl">Prueba psicosensotécnica</h1>
        {estado?.equipo && <p className="mt-1 text-center text-xs text-gray-400">Equipo: {estado.equipo}</p>}
        <div className="mt-6">
          {!estado || !estado.activo ? (
            <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
              La prueba no está disponible en este momento. Comuníquese con el área de selección.
            </p>
          ) : (
            <PruebaClient pideEquipo={estado.pideEquipo} />
          )}
        </div>
      </div>
    </main>
  );
}
