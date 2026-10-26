import { notFound, redirect } from "next/navigation";
import { tieneAccesoPantalla } from "@/lib/pantalla/acceso";
import { getPresentacion, getPresentacionPublicada } from "@/lib/pantalla/consultas";
import { datosParaWidgets } from "@/lib/pantalla/datos";
import { firmarMedios } from "@/lib/pantalla/dispositivos";
import { refsDeMedios, tiposDeWidget } from "@/lib/pantalla/modelo";
import { VistaPreviaClient } from "./vista-previa-client";

export const dynamic = "force-dynamic";

/**
 * Vista previa a pantalla completa, con datos reales. Va en el grupo (print)
 * para salir sin el menú lateral; exige sesión y el módulo `pantalla`.
 * `?de=borrador` (por defecto) o `?de=publicada` (lo que ven los TV).
 */
export default async function VistaPreviaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await tieneAccesoPantalla())) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const de = sp.de === "publicada" ? "publicada" : "borrador";

  const fila = await getPresentacion(id);
  if (!fila) notFound();
  const presentacion = de === "publicada" ? await getPresentacionPublicada(id) : fila.borrador;

  if (!presentacion || presentacion.diapositivas.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-slate-300">
        {de === "publicada" ? "Esta presentación no está publicada." : "La presentación no tiene diapositivas todavía."}
      </div>
    );
  }

  const [datos, medios] = await Promise.all([datosParaWidgets(tiposDeWidget(presentacion)), firmarMedios(refsDeMedios(presentacion))]);
  return <VistaPreviaClient id={id} nombre={fila.nombre} de={de} presentacion={presentacion} datos={datos} medios={medios} />;
}
