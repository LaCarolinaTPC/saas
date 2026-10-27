import { notFound, redirect } from "next/navigation";
import { tieneAccesoPantalla } from "@/lib/pantalla/acceso";
import { getPresentacion, getPresentacionPublicada } from "@/lib/pantalla/consultas";
import { datosParaWidgets } from "@/lib/pantalla/datos";
import { firmarMedios } from "@/lib/pantalla/dispositivos";
import { refsDeMedios, tiposDeWidget } from "@/lib/pantalla/modelo";
import { diaAnterior } from "@/lib/pantalla/datos-reglas";
import { hoyBogota } from "@/lib/padrino/datos";
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

  // TEMPORAL (pruebas): `?dia=AAAA-MM-DD` muestra los datos como si hoy fuera
  // el día siguiente, para ver «Accidentes de ayer» de ese día. Solo cambia la
  // vista previa: el caché de datos va por fecha, así que los TV no se ven
  // afectados. Quitar junto con el selector de vista-previa-client.tsx.
  const hoyReal = hoyBogota();
  const dia = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) && sp.dia < hoyReal ? sp.dia : null;
  const hoy = dia ? new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : hoyReal;

  const [datos, medios] = await Promise.all([datosParaWidgets(tiposDeWidget(presentacion), hoy), firmarMedios(refsDeMedios(presentacion))]);
  return (
    <VistaPreviaClient
      id={id}
      nombre={fila.nombre}
      de={de}
      presentacion={presentacion}
      datos={datos}
      medios={medios}
      diaPrueba={dia}
      ayerReal={diaAnterior(hoyReal)}
    />
  );
}
