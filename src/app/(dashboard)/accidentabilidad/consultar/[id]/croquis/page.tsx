import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getAccidente } from "@/lib/rotacion/data/accidentes";
import { getCatalogosAccidente } from "@/lib/accidentabilidad/datos";
import { formatoDesdeRegistro } from "@/lib/accidentabilidad/formato";
import { croquisVacio, validarCroquis, vehiculosDelReporte } from "@/lib/accidentabilidad/croquis";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import CroquisEdicion from "./croquis-edicion";

export const dynamic = "force-dynamic";

export default async function CroquisAccidentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [perms, result, catalogos] = await Promise.all([
    getCurrentPermissions(),
    getAccidente(id),
    getCatalogosAccidente({ incluirInactivos: true }),
  ]);
  if (!result) notFound();
  const { accidente: a, vehiculos, victimas } = result;
  if (!canAccess(perms, "accidentabilidad") || !perms.puedeEditar || a.origen === "historico") {
    redirect(`/accidentabilidad/consultar/${id}`);
  }

  const formato = formatoDesdeRegistro(a, vehiculos, victimas, catalogos.factor);
  const ciudad = catalogos.ciudad.find((c) => c.codigo === a.ciudad)?.label ?? a.ciudad;
  const fecha = new Date(a.fecha_accidente).toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        volver={{ href: `/accidentabilidad/consultar/${id}`, label: "Reporte" }}
        titulo={`Croquis del reporte #${a.consecutivo}`}
        descripcion="Reporte gráfico del formato GO-R-16."
      />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <CroquisEdicion
          accidenteId={a.id}
          inicial={validarCroquis(a.croquis_json) ?? croquisVacio()}
          vehiculos={vehiculosDelReporte(formato.vehiculo_propio, formato.terceros)}
          encabezado={{
            fecha,
            lugar: [a.direccion_accidente, ciudad].filter(Boolean).join(", "),
            vehiculo: "",
          }}
        />
      </div>
    </div>
  );
}
