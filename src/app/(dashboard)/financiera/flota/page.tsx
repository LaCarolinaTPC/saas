import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { Fallo, SinAcceso } from "../sin-acceso";
import { ResumenVista } from "./resumen-vista";

export const dynamic = "force-dynamic";

/**
 * Portada de Financiera · Gestión Resultado Flota. Resuelve permisos, carga el
 * rango y delega el render en `ResumenVista`.
 */
export default async function ResumenPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_tablero")) {
    return (
      <SinAcceso
        titulo="Gestión Resultado Flota"
        motivo="Tu tipo de usuario no tiene el tablero de Gestión de flota. Pídelo a Administración."
      />
    );
  }

  const sp = await searchParams;
  let p: Awaited<ReturnType<typeof cargarPantalla>> | null = null;
  let fallo: string | null = null;
  try {
    p = await cargarPantalla(sp, { anioAnterior: true });
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!p) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6">
        <Fallo mensaje={fallo ?? "No se pudo leer el módulo."} />
      </div>
    );
  }

  return (
    <ResumenVista
      perms={perms}
      p={p}
      verAnalisis={canAccessSub(perms, "financiera", "fin_analisis")}
      verDatos={canAccessSub(perms, "financiera", "fin_datos")}
    />
  );
}
