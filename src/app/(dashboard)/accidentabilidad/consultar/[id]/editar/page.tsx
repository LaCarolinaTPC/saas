import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { getAccidente } from "@/lib/rotacion/data/accidentes";
import AccidenteEditForm from "@/components/accidentabilidad/AccidenteEditForm";
import { getCatalogosAccidente } from "@/lib/accidentabilidad/datos";
import { formatoDesdeRegistro } from "@/lib/accidentabilidad/formato";

export default async function EditarAccidentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, catalogos] = await Promise.all([getAccidente(id), getCatalogosAccidente()]);
  if (!result) notFound();
  const { accidente: a, vehiculos, victimas } = result;

  // Solo editable cuando falta información
  if (a.estado !== "falta_informacion") {
    redirect(`/accidentabilidad/consultar/${id}`);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        volver={{ href: `/accidentabilidad/consultar/${id}`, label: "Reporte" }}
        titulo={`Editar reporte #${a.consecutivo}`}
        descripcion="Completa la información que falta."
      />

      <div className="mx-auto max-w-3xl px-6 py-8">
        <AccidenteEditForm
          catalogos={catalogos}
          initial={{
            id: a.id,
            fecha_accidente: a.fecha_accidente,
            direccion_accidente: a.direccion_accidente,
            ciudad: a.ciudad,
            resumen_hechos: a.resumen_hechos,
            hubo_arreglo: a.hubo_arreglo,
            arreglo_monto: a.arreglo_monto,
            arreglo_receptor_nombre: a.arreglo_receptor_nombre,
            arreglo_receptor_cedula: a.arreglo_receptor_cedula,
            solicito_aseguradora: a.solicito_aseguradora,
            aseguradora_nombre: a.aseguradora_nombre,
            abogado_nombre: a.abogado_nombre,
            abogado_apellidos: a.abogado_apellidos,
            abogado_cedula: a.abogado_cedula,
            abogado_celular: a.abogado_celular,
            formato: formatoDesdeRegistro(a, vehiculos, victimas, catalogos.factor),
          }}
        />
      </div>
    </div>
  );
}
