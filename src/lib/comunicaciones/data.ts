import { createAdminClient } from "@/lib/supabase/admin";
import { firmarMedios } from "./medios";
import { LOTE_CONVERSACIONES, MAX_CONVERSACIONES } from "./constantes";

export interface ConversacionResumen {
  id: string;
  telefono: string;
  nombre: string | null;
  ultimoMensaje: string;
  ultimoMensajeAt: string;
  ultimoEntranteAt: string | null;
  noLeidos: number;
  /** La conversación ya tiene un proceso de contratación (candidato) creado desde aquí. */
  esCandidato: boolean;
  /** El agente de IA no responde en esta conversación (la tomó un humano o se pausó). */
  agentePausado: boolean;
  /** Pasó a humano y nadie de Gestivo ha respondido todavía. */
  requiereHumano: boolean;
  /**
   * El agente ya respondió en esta conversación. Las que existían antes del
   * agente y no ha atendido no cuentan como "a cargo de la IA".
   */
  iaRespondio: boolean;
}

export interface MensajeChat {
  id: string;
  direccion: "entrante" | "saliente";
  contenido: string;
  estado: string | null;
  errorMensaje: string | null;
  mediaTipo: string | null;
  mimeType: string | null;
  nombreArchivo: string | null;
  /** URL firmada (1 h) del archivo en Storage; null si no hay copia local. */
  mediaUrl: string | null;
  plantilla: string | null;
  enviadoPor: string | null;
  /** Lo escribió el agente de IA. */
  generadoPorIa: boolean;
  timestamp: string;
}

const ETIQUETA_MEDIO: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Video",
  audio: "🎤 Audio",
  document: "📄 Documento",
  sticker: "Sticker",
};

export { LOTE_CONVERSACIONES, MAX_CONVERSACIONES };

export interface Bandeja {
  /** Las más recientes (o las que coinciden con la búsqueda). */
  conversaciones: ConversacionResumen[];
  /** Totales de TODAS las conversaciones, no solo de las cargadas. */
  total: number;
  sinLeer: number;
  paraHumano: number;
  /** Hay conversaciones más antiguas sin cargar. */
  hayMas: boolean;
  /** Búsqueda hecha en el servidor sobre todas las conversaciones (null = sin búsqueda). */
  busqueda: string | null;
}

const SELECT_CONVERSACION =
  "id, ultimo_mensaje_at, ultimo_entrante_at, no_leidos, proceso_id, agente_pausado, requiere_humano, wa_contactos(telefono, nombre)";

/**
 * La bandeja. Antes traía solo las 200 conversaciones más recientes: las
 * anteriores no aparecían ni se encontraban con el buscador. Ahora:
 * - `limite`: cuántas de las más recientes cargar (de 200 en 200);
 * - `q`: busca por nombre o teléfono en TODAS las conversaciones;
 * - `incluir`: la conversación abierta aparece aunque sea más antigua que el lote.
 */
export async function getBandeja(opciones: { limite?: number; q?: string | null; incluir?: string | null } = {}): Promise<Bandeja> {
  const db = createAdminClient();
  const limite = Math.min(MAX_CONVERSACIONES, Math.max(LOTE_CONVERSACIONES, opciones.limite ?? LOTE_CONVERSACIONES));
  // Caracteres que romperían el filtro .or() de PostgREST.
  const q = (opciones.q ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 60);

  const contar = async (filtro?: (x: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let consulta = db.from("wa_conversaciones").select("id", { count: "exact", head: true });
    if (filtro) consulta = filtro(consulta);
    const { count } = await consulta;
    return count ?? 0;
  };
  // Los totales no dependen de la lista: arrancan ya, en paralelo.
  const totales = Promise.all([contar(), contar((x) => x.gt("no_leidos", 0)), contar((x) => x.eq("requiere_humano", true))]);

  let filas: Fila[];
  if (q.length >= 2) {
    const digitos = q.replace(/\D/g, "");
    const condiciones = [`nombre.ilike.%${q}%`, ...(digitos.length >= 3 ? [`telefono.ilike.%${digitos}%`] : [])];
    const { data: contactos, error: e1 } = await db.from("wa_contactos").select("id").or(condiciones.join(",")).limit(LOTE_CONVERSACIONES);
    if (e1) throw new Error(`buscar contactos: ${e1.message}`);
    const idsContacto = (contactos ?? []).map((c) => c.id);
    filas = [];
    if (idsContacto.length) {
      const { data, error } = await db
        .from("wa_conversaciones")
        .select(SELECT_CONVERSACION)
        .in("contacto_id", idsContacto)
        .order("ultimo_mensaje_at", { ascending: false });
      if (error) throw new Error(`conversaciones: ${error.message}`);
      filas = (data ?? []) as Fila[];
    }
  } else {
    const { data, error } = await db
      .from("wa_conversaciones")
      .select(SELECT_CONVERSACION)
      .order("ultimo_mensaje_at", { ascending: false })
      .order("id", { ascending: true })
      .range(0, limite - 1);
    if (error) throw new Error(`conversaciones: ${error.message}`);
    filas = (data ?? []) as Fila[];
  }

  // La conversación abierta siempre está, aunque quede fuera del lote o de la búsqueda.
  if (opciones.incluir && !filas.some((f) => f.id === opciones.incluir)) {
    const { data } = await db.from("wa_conversaciones").select(SELECT_CONVERSACION).eq("id", opciones.incluir).maybeSingle();
    if (data) filas.push(data as Fila);
  }

  const [conversaciones, [total, sinLeer, paraHumano]] = await Promise.all([resumir(filas), totales]);
  return {
    conversaciones,
    total,
    sinLeer,
    paraHumano,
    hayMas: !q && filas.length >= limite && total > limite,
    busqueda: q.length >= 2 ? q : null,
  };
}

type Fila = {
  id: string;
  ultimo_mensaje_at: string;
  ultimo_entrante_at: string | null;
  no_leidos: number | null;
  proceso_id: string | null;
  agente_pausado: boolean | null;
  requiere_humano: boolean | null;
  wa_contactos: unknown;
};

const vistaPrevia = (m: { contenido: string | null; media_tipo: string | null }) =>
  m.contenido || (m.media_tipo ? ETIQUETA_MEDIO[m.media_tipo] ?? `[${m.media_tipo}]` : "");

async function resumir(data: Fila[]): Promise<ConversacionResumen[]> {
  const db = createAdminClient();
  // Último mensaje por conversación sin N+1: el mensaje cuyo timestamp es el
  // ultimo_mensaje_at de su conversación (así lo escriben el webhook y el envío).
  // Lotes de 50 en paralelo: cada consulta lleva ids y horas en la URL y con
  // 200 de una vez se pasaba del tamaño que acepta el proxy de la base.
  const LOTE = 50;
  const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE));
  const ultimos = new Map<string, string>();
  const poner = (msjs: { conversacion_id: string; contenido: string | null; media_tipo: string | null }[] | null) => {
    for (const m of msjs ?? []) if (!ultimos.has(m.conversacion_id)) ultimos.set(m.conversacion_id, vistaPrevia(m));
  };

  // Conversaciones donde el agente ya escribió. Solo se consulta en las que
  // podría estar atendiendo (sin pausar y con la ventana de 24 h abierta),
  // que son pocas, para no recorrer todo el historial de la IA. Va en
  // paralelo con las vistas previas.
  const hace24h = Date.now() - 24 * 60 * 60 * 1000;
  const candidatas = data
    .filter((c) => !c.agente_pausado && c.ultimo_entrante_at && new Date(c.ultimo_entrante_at).getTime() > hace24h)
    .map((c) => c.id);
  const deIaPromesa = candidatas.length
    ? db.from("wa_mensajes").select("conversacion_id").in("conversacion_id", candidatas).eq("generado_por_ia", true).limit(2000)
    : Promise.resolve({ data: [] as { conversacion_id: string }[] });

  await Promise.all(
    lotes(data).map(async (lote) => {
      const { data: msjs } = await db
        .from("wa_mensajes")
        .select("conversacion_id, contenido, media_tipo, timestamp")
        .in("conversacion_id", lote.map((c) => c.id))
        .in("timestamp", [...new Set(lote.map((c) => c.ultimo_mensaje_at))])
        .order("timestamp", { ascending: false });
      poner(msjs);
    })
  );
  // Las que no casaron (p. ej. datos viejos con otra hora): el más reciente de cada una.
  const faltan = data.map((c) => c.id).filter((id) => !ultimos.has(id));
  await Promise.all(
    lotes(faltan).map(async (lote) => {
      const { data: msjs } = await db
        .from("wa_mensajes")
        .select("conversacion_id, contenido, media_tipo, timestamp")
        .in("conversacion_id", lote)
        .order("timestamp", { ascending: false })
        .limit(lote.length * 20);
      poner(msjs);
    })
  );

  const conRespuestaIa = new Set<string>();
  for (const m of (await deIaPromesa).data ?? []) conRespuestaIa.add(m.conversacion_id);

  return data.map((c) => {
    // El embed de PostgREST llega como objeto (FK única), tipado como array.
    const contacto = (Array.isArray(c.wa_contactos) ? c.wa_contactos[0] : c.wa_contactos) as {
      telefono: string; nombre: string | null;
    } | null;
    return {
      id: c.id,
      telefono: contacto?.telefono ?? "",
      nombre: contacto?.nombre ?? null,
      ultimoMensaje: ultimos.get(c.id) ?? "",
      ultimoMensajeAt: c.ultimo_mensaje_at,
      ultimoEntranteAt: c.ultimo_entrante_at,
      noLeidos: Number(c.no_leidos ?? 0),
      esCandidato: !!c.proceso_id,
      agentePausado: !!c.agente_pausado,
      requiereHumano: !!c.requiere_humano,
      iaRespondio: conRespuestaIa.has(c.id),
    };
  });
}

/** Abrir el hilo lo marca como leído (la página lo llama con after(), sin hacer esperar). */
export async function marcarLeida(conversacionId: string): Promise<void> {
  await createAdminClient().from("wa_conversaciones").update({ no_leidos: 0 }).eq("id", conversacionId);
}

export async function getMensajes(conversacionId: string): Promise<MensajeChat[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("wa_mensajes")
    .select(
      "id, direccion, contenido, estado, error_mensaje, media_tipo, mime_type, nombre_archivo, media_path, plantilla, enviado_por, generado_por_ia, timestamp"
    )
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: true })
    .limit(500);
  if (error) throw new Error(`mensajes: ${error.message}`);

  const urls = await firmarMedios((data ?? []).map((m) => m.media_path as string | null).filter((p): p is string => !!p));

  return (data ?? []).map((m) => ({
    id: m.id,
    direccion: m.direccion as "entrante" | "saliente",
    contenido: m.contenido,
    estado: m.estado,
    errorMensaje: m.error_mensaje,
    mediaTipo: m.media_tipo,
    mimeType: m.mime_type,
    nombreArchivo: m.nombre_archivo,
    mediaUrl: m.media_path ? urls.get(m.media_path) ?? null : null,
    plantilla: m.plantilla,
    enviadoPor: m.enviado_por,
    generadoPorIa: !!m.generado_por_ia,
    timestamp: m.timestamp,
  }));
}
