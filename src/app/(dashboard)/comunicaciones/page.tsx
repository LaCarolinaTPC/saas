import { getConversaciones, getMensajes } from "@/lib/comunicaciones/data";
import { asegurarMedios } from "@/lib/comunicaciones/medios";
import { getFichaContacto } from "@/lib/comunicaciones/ficha";
import { getActiveVacancies } from "@/lib/actions";
import BandejaClient from "./BandejaClient";

/**
 * Comunicaciones: bandeja del WhatsApp de la empresa, portada de Varylo a
 * Gestivo para uso interno de RRHH. Con medios, adjuntos, plantillas y la
 * ficha del contacto (conductor o propietario) al lado del hilo.
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
  const [mensajes, ficha, vacantes] = activa
    ? await Promise.all([getMensajes(activa), getFichaContacto(activa), getActiveVacancies()])
    : [[], null, []];

  return (
    <BandejaClient
      conversaciones={conversaciones}
      activa={activa}
      mensajes={mensajes}
      ficha={ficha}
      vacantes={(vacantes as { id: string; title: string }[]).map((v) => ({ id: v.id, title: v.title }))}
    />
  );
}
