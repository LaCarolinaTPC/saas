import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getCatalogoRutas, getGeometriasVigentes, type GeometriaKml, type RutaCatalogo } from "@/lib/operativo/rutas-kml";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { RutasClient } from "./rutas-client";

export const dynamic = "force-dynamic";

/**
 * Operativo · Rutas: trazado KML de cada ruta (Google My Maps), con
 * versiones, y vista «En vivo» que cruza el GPS de cada bus con su ruta. Una ruta = una línea de ida y vuelta. La vista previa del KML se
 * hace en el navegador; el servidor lo vuelve a validar al guardarlo.
 */
export default async function RutasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const { vista } = await searchParams;
  let rutas: RutaCatalogo[] = [];
  let geometrias: GeometriaKml[] = [];
  let error: string | null = null;
  try {
    [rutas, geometrias] = await Promise.all([getCatalogoRutas(), getGeometriasVigentes()]);
  } catch (e) {
    // Sin la migración la tabla no existe: la pantalla lo dice en vez de caerse.
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <EncabezadoOperativo titulo="Operativo · Rutas">
        <PestanasOperativo activa="rutas" />
      </EncabezadoOperativo>
      <RutasClient
        rutas={rutas}
        geometrias={geometrias}
        error={error}
        puedeEditar={perms.isAdmin || puedeEditarEn(perms, "operativo")}
        vistaInicial={vista === "vivo" ? "vivo" : "trazados"}
      />
    </div>
  );
}
