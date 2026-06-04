import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAccidente } from "@/lib/rotacion/data/accidentes";
import AccidenteEditForm from "@/components/accidentabilidad/AccidenteEditForm";

export default async function EditarAccidentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAccidente(id);
  if (!result) notFound();
  const { accidente: a, vehiculos } = result;

  // Solo editable cuando falta información
  if (a.estado !== "falta_informacion") {
    redirect(`/accidentabilidad/consultar/${id}`);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <Link href={`/accidentabilidad/consultar/${id}`} className="text-gray-500 hover:text-gray-900">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Editar reporte #{a.consecutivo}</h1>
          <p className="text-sm text-gray-500">Completa la información que falta.</p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8">
        <AccidenteEditForm
          initial={{
            id: a.id,
            fecha_accidente: a.fecha_accidente,
            direccion_accidente: a.direccion_accidente,
            resumen_hechos: a.resumen_hechos,
            tiene_peaton: a.tiene_peaton,
            peaton_nombre: a.peaton_nombre,
            peaton_cedula: a.peaton_cedula,
            peaton_telefono: a.peaton_telefono,
            peaton_direccion: a.peaton_direccion,
            peaton_correo: a.peaton_correo,
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
            vehiculos: vehiculos.map((v) => ({
              placa: v.placa ?? "",
              descripcion: v.descripcion ?? "",
              es_propio: Boolean(v.es_propio),
            })),
          }}
        />
      </div>
    </div>
  );
}
