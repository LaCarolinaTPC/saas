import { notFound, redirect } from "next/navigation";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getCurrentPermissions } from "@/lib/permissions";
import { tieneAccesoPantalla } from "@/lib/pantalla/acceso";
import { getMediosBiblioteca, getPresentacion } from "@/lib/pantalla/consultas";
import { firmarMedios } from "@/lib/pantalla/dispositivos";
import { datosDeMuestra } from "@/lib/pantalla/datos-reglas";
import { refsDeMedios } from "@/lib/pantalla/modelo";
import { hoyBogota } from "@/lib/operativo/constants";
import { EditorPresentacion } from "@/components/pantalla/editor/EditorPresentacion";

export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await tieneAccesoPantalla())) {
    const perms = await getCurrentPermissions();
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const { id } = await params;
  const fila = await getPresentacion(id);
  if (!fila) notFound();

  const [medios, biblioteca] = await Promise.all([firmarMedios(refsDeMedios(fila.borrador)), getMediosBiblioteca()]);
  // El editor pinta los widgets con datos de ejemplo: no consulta la base en
  // cada cambio. La vista previa y el TV usan los reales.
  const datos = datosDeMuestra(hoyBogota());

  return (
    <EditorPresentacion
      id={fila.id}
      nombre={fila.nombre}
      inicial={fila.borrador}
      updatedAt={fila.updatedAt}
      version={fila.version}
      publicadaAt={fila.publicadaAt}
      cambiosSinPublicar={fila.cambiosSinPublicar}
      medios={medios}
      biblioteca={biblioteca}
      datos={datos}
    />
  );
}
