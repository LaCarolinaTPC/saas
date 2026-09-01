import { getConversaciones, getMensajes } from "@/lib/comunicaciones/data";
import BandejaClient from "./BandejaClient";

/**
 * Comunicaciones (Fase 1): bandeja del WhatsApp de la empresa, portada de
 * Varylo a Gestivo para uso interno de RRHH.
 */
export default async function ComunicacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const conversaciones = await getConversaciones();
  const activa = c && conversaciones.some((x) => x.id === c) ? c : null;
  const mensajes = activa ? await getMensajes(activa) : [];

  return (
    <BandejaClient
      conversaciones={conversaciones}
      activa={activa}
      mensajes={mensajes}
    />
  );
}
