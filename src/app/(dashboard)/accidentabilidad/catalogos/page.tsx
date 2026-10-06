import { PageHeader } from "@/components/layout/page-header";
import { getCurrentPermissions } from "@/lib/permissions";
import { getCatalogosAccidente } from "@/lib/accidentabilidad/datos";
import CatalogosClient from "./catalogos-client";

export const dynamic = "force-dynamic";

export default async function CatalogosAccidentesPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Catálogos de accidentalidad" volver={{ href: "/accidentabilidad/consultar", label: "Accidentes" }} />
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          Solo un administrador puede configurar los catálogos de accidentalidad.
        </div>
      </div>
    );
  }

  const catalogos = await getCatalogosAccidente({ incluirInactivos: true });
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Catálogos de accidentalidad"
        descripcion="Opciones del formulario de reporte: ciudades, códigos de tránsito, tipos de vehículo y aseguradoras."
        volver={{ href: "/accidentabilidad/consultar", label: "Accidentes" }}
      />
      <div className="mx-auto max-w-4xl px-6 py-6">
        <CatalogosClient catalogos={catalogos} />
      </div>
    </div>
  );
}
