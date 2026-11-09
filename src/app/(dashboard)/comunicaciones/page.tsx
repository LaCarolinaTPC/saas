import { LOTE_CONVERSACIONES, getBandeja, getMensajes } from "@/lib/comunicaciones/data";
import { asegurarMedios } from "@/lib/comunicaciones/medios";
import { getFichaContacto } from "@/lib/comunicaciones/ficha";
import { getActiveVacancies } from "@/lib/actions";
import { getAgenteConfig } from "@/lib/comunicaciones/agente/config";
import BandejaClient from "./BandejaClient";

// Al devolverle un chat a la IA, la acción responde con after(): necesita tiempo para el modelo.
export const maxDuration = 60;

/**
 * Comunicaciones: bandeja del WhatsApp de la empresa, portada de Varylo a
 * Gestivo para uso interno de RRHH. Con medios, adjuntos, plantillas y la
 * ficha del contacto (conductor o propietario) al lado del hilo.
 *
 * `?n=` cuántas conversaciones recientes cargar (de 200 en 200) y `?q=` una
 * búsqueda sobre todas; se conservan en la URL para que el refresco
 * automático no las pierda.
 */
export default async function ComunicacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; n?: string; q?: string }>;
}) {
  const { c, n, q } = await searchParams;
  const limite = Math.max(LOTE_CONVERSACIONES, Number(n) || LOTE_CONVERSACIONES);
  const [bandeja, agente] = await Promise.all([getBandeja({ limite, q, incluir: c ?? null }), getAgenteConfig()]);
  const activa = c && bandeja.conversaciones.some((x) => x.id === c) ? c : null;
  // Red de seguridad: medios que quedaron sin copia local (p. ej. si el
  // webhook no alcanzó a descargarlos) se archivan al abrir el hilo.
  if (activa) await asegurarMedios(activa);
  const [mensajes, ficha, vacantes] = activa
    ? await Promise.all([getMensajes(activa), getFichaContacto(activa), getActiveVacancies()])
    : [[], null, []];

  return (
    <BandejaClient
      conversaciones={bandeja.conversaciones}
      totales={{ total: bandeja.total, sinLeer: bandeja.sinLeer, paraHumano: bandeja.paraHumano }}
      hayMas={bandeja.hayMas}
      limite={limite}
      busquedaServidor={bandeja.busqueda}
      activa={activa}
      mensajes={mensajes}
      ficha={ficha}
      vacantes={(vacantes as { id: string; title: string }[]).map((v) => ({ id: v.id, title: v.title }))}
      agenteActivo={agente.activo}
    />
  );
}
