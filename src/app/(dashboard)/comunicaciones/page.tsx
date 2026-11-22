import { after } from "next/server";
import { LOTE_CONVERSACIONES, getBandeja, getMensajes, marcarLeida } from "@/lib/comunicaciones/data";
import { asegurarMedios } from "@/lib/comunicaciones/medios";
import { getFichaContacto } from "@/lib/comunicaciones/ficha";
import { getActiveVacancies } from "@/lib/actions";
import { getAgenteConfig } from "@/lib/comunicaciones/agente/config";
import BandejaClient from "./BandejaClient";

// Al devolverle un chat a la IA, la acción responde con after(): necesita tiempo para el modelo.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comunicaciones: bandeja del WhatsApp de la empresa, portada de Varylo a
 * Gestivo para uso interno de RRHH. Con medios, adjuntos, plantillas y la
 * ficha del contacto (conductor o propietario) al lado del hilo.
 *
 * `?n=` cuántas conversaciones recientes cargar (de 200 en 200) y `?q=` una
 * búsqueda sobre todas; se conservan en la URL para que el refresco
 * automático no las pierda.
 *
 * Rendimiento: la bandeja, el hilo, la ficha y las vacantes se piden a la vez,
 * y lo que no hace falta para pintar (archivar medios pendientes de Meta,
 * marcar como leído) corre con after(), después de responder. Antes archivar
 * medios iba primero y, si Meta tardaba o ya los había borrado, el chat se
 * quedaba cargando.
 */
export default async function ComunicacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; n?: string; q?: string }>;
}) {
  const { c, n, q } = await searchParams;
  const limite = Math.max(LOTE_CONVERSACIONES, Number(n) || LOTE_CONVERSACIONES);
  const pedida = c && UUID.test(c) ? c : null;

  const [bandeja, agente, mensajes, ficha, vacantes] = await Promise.all([
    getBandeja({ limite, q, incluir: pedida }),
    getAgenteConfig(),
    pedida ? getMensajes(pedida) : Promise.resolve([]),
    pedida ? getFichaContacto(pedida) : Promise.resolve(null),
    pedida ? getActiveVacancies() : Promise.resolve([]),
  ]);
  const activa = pedida && bandeja.conversaciones.some((x) => x.id === pedida) ? pedida : null;
  const conv = activa ? bandeja.conversaciones.find((x) => x.id === activa) : undefined;
  // La abierta se muestra ya leída (en la base se marca justo después, con after()).
  const conversaciones = conv && conv.noLeidos > 0
    ? bandeja.conversaciones.map((x) => (x.id === activa ? { ...x, noLeidos: 0 } : x))
    : bandeja.conversaciones;
  const sinLeer = conv && conv.noLeidos > 0 ? Math.max(0, bandeja.sinLeer - 1) : bandeja.sinLeer;

  if (activa) {
    after(async () => {
      // Abrir el hilo lo marca como leído.
      if (conv && conv.noLeidos > 0) await marcarLeida(activa);
      // Red de seguridad: medios que quedaron sin copia local (p. ej. si el
      // webhook no alcanzó a descargarlos). Llegan en el siguiente refresco.
      await asegurarMedios(activa);
    });
  }

  return (
    <BandejaClient
      conversaciones={conversaciones}
      totales={{ total: bandeja.total, sinLeer, paraHumano: bandeja.paraHumano, pendientes: bandeja.pendientes }}
      hayMas={bandeja.hayMas}
      limite={limite}
      busquedaServidor={bandeja.busqueda}
      activa={activa}
      mensajes={activa ? mensajes : []}
      ficha={activa ? ficha : null}
      vacantes={(vacantes as { id: string; title: string }[]).map((v) => ({ id: v.id, title: v.title }))}
      agenteActivo={agente.activo}
    />
  );
}
