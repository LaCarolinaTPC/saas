import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsulta } from "@/lib/riesgo/auditoria";
import { contarNiveles, leerCorrida, listarCorridas } from "@/lib/riesgo/persistir";
import RiesgoClient from "./riesgo-client";

export const dynamic = "force-dynamic";
// El botón de recalcular es una Server Action de esta ruta y hereda el límite
// del segmento: la corrida tarda lo que tarda bajar las cinco fuentes.
export const maxDuration = 300;

export default async function RiesgoPage({
  searchParams,
}: {
  searchParams: Promise<{ corrida?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "riesgo")) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Riesgo predictivo de conductores" icono={Activity} />
        <div className="p-6">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
            No tienes acceso a este módulo. Contiene datos personales de los conductores, así
            que se habilita por solicitud a Administración.
          </div>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const pedida = typeof sp.corrida === "string" && sp.corrida.length > 0 ? sp.corrida : null;

  let corridas: Awaited<ReturnType<typeof listarCorridas>> = [];
  let corrida: Awaited<ReturnType<typeof leerCorrida>> = null;
  let niveles: Awaited<ReturnType<typeof contarNiveles>> | null = null;
  let fallo: string | null = null;

  try {
    [corridas, corrida] = await Promise.all([listarCorridas(), leerCorrida(pedida)]);
    if (corrida) niveles = await contarNiveles(corrida.id);
  } catch (e) {
    // Lo más probable recién desplegado: la migración del módulo aún no se ha
    // corrido en el SQL Editor.
    fallo = e instanceof Error ? e.message : String(e);
  }

  // Quién consultó qué corte: la corrida contiene datos personales de toda la
  // plantilla, y ese rastro es la mitad de la razón para traerla a la app.
  if (!fallo) {
    await auditarConsulta({
      corridaId: corrida?.id ?? null,
      corte: corrida?.corte ?? null,
      rol: perms.userType,
    });
  }

  return (
    <RiesgoClient
      corridas={corridas}
      corrida={corrida}
      niveles={niveles}
      fallo={fallo}
      puedeRecalcular={perms.puedeEditar}
    />
  );
}
