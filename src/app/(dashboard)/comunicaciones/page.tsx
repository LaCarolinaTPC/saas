import { getConversaciones, getMensajes } from "@/lib/comunicaciones/data";
import { asegurarMedios } from "@/lib/comunicaciones/medios";
import BandejaClient from "./BandejaClient";

/**
 * Comunicaciones: bandeja del WhatsApp de la empresa, portada de Varylo a
 * Gestivo para uso interno de RRHH. Con medios, adjuntos y plantillas.
 */
export default async function ComunicacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const conversaciones = await getConversaciones();
  const activa = c && conversaciones.some((x) => x.id === c) ? c : null;
  // Red de seguridad: medios que quedaron sin copia local (p. ej. si el
  // webhook no alcanzó a descargarlos) se archivan al abrir el hilo.
  if (activa) await asegurarMedios(activa);
  const mensajes = activa ? await getMensajes(activa) : [];

  return (
    <BandejaClient
      conversaciones={conversaciones}
      activa={activa}
      mensajes={mensajes}
    />
  );
}
