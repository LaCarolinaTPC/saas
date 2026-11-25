/**
 * Estado de los servicios externos (24-nov-2026): Croma, la IA, WhatsApp y el
 * correo, según sus últimos resultados guardados. No consulta a los
 * servicios: mira lo que ya pasó (consultas a Croma, ejecuciones del
 * asistente, mensajes enviados y correos a los laboratorios). Lo muestran
 * Selección › Tiempos y reglas y un aviso en Candidatos y Comunicaciones
 * cuando uno está fallando. Solo servidor (evaluarEventos es puro).
 */

export type IdServicio = "croma" | "ia" | "whatsapp" | "correo";
export type NivelServicio = "ok" | "fallando" | "sin_datos" | "pausado" | "sin_configurar";

/** Un resultado, del más nuevo al más viejo. */
export interface EventoServicio {
  ok: boolean;
  at: string;
  error?: string | null;
}

export interface EstadoServicio {
  id: IdServicio;
  nombre: string;
  nivel: NivelServicio;
  /** Errores seguidos desde el último que salió bien. */
  seguidos: number;
  errores24h: number;
  total24h: number;
  ultimoError: { texto: string; at: string } | null;
  ultimoOkAt: string | null;
  /** Qué hacer, en una línea. */
  consejo: string | null;
}

const HORA = 3_600_000;

/**
 * Fallando: 3 o más errores seguidos y el último hace menos de 3 horas, o en
 * la última hora 5 o más errores que son la mitad o más de los intentos.
 */
export function evaluarEventos(eventos: EventoServicio[], ahora: Date = new Date()): Pick<EstadoServicio, "nivel" | "seguidos" | "errores24h" | "total24h" | "ultimoError" | "ultimoOkAt"> {
  const t = ahora.getTime();
  const orden = [...eventos].sort((a, b) => b.at.localeCompare(a.at));
  let seguidos = 0;
  for (const e of orden) {
    if (e.ok) break;
    seguidos++;
  }
  const dia = orden.filter((e) => t - new Date(e.at).getTime() <= 24 * HORA);
  const hora = orden.filter((e) => t - new Date(e.at).getTime() <= HORA);
  const erroresHora = hora.filter((e) => !e.ok).length;
  const error = orden.find((e) => !e.ok) ?? null;
  const ok = orden.find((e) => e.ok) ?? null;
  const reciente = error ? t - new Date(error.at).getTime() <= 3 * HORA : false;
  const fallando = (seguidos >= 3 && reciente) || (erroresHora >= 5 && erroresHora * 2 >= hora.length);
  return {
    nivel: !orden.length ? "sin_datos" : fallando ? "fallando" : "ok",
    seguidos,
    errores24h: dia.filter((e) => !e.ok).length,
    total24h: dia.length,
    ultimoError: error ? { texto: (error.error ?? "").trim().slice(0, 300) || "Sin detalle", at: error.at } : null,
    ultimoOkAt: ok?.at ?? null,
  };
}

const NOMBRES: Record<IdServicio, string> = {
  croma: "Croma (RUNT, SIMIT y antecedentes)",
  ia: "Asistente de IA",
  whatsapp: "WhatsApp (envíos)",
  correo: "Correo (órdenes a laboratorios)",
};

const CONSEJO: Record<IdServicio, string> = {
  croma: "Si Croma está caído, páuselo en Selección › Tiempos y reglas › Verificaciones con Croma: el proceso sigue y lo que falta se revisa a mano.",
  ia: "Los chats donde falló quedan en la Bandeja como «Requieren humano». Revise la clave o el saldo del proveedor en Selección › IA.",
  whatsapp: "Revise el canal en Selección › Canal de WhatsApp («Probar conexión») y los mensajes con ⚠ en la Bandeja.",
  correo: "Revise el SMTP del servidor; las órdenes que no salieron se envían a mano desde Selección › Laboratorios.",
};

let cache: { hasta: number; datos: Promise<EstadoServicio[]> } | null = null;

/** Los cuatro servicios. Un minuto en memoria (lo piden varias pantallas). */
export async function leerEstadoServicios(): Promise<EstadoServicio[]> {
  if (cache && cache.hasta > Date.now()) return cache.datos;
  const datos = calcular().catch((e) => {
    console.error("[estado-servicios]", e);
    return [] as EstadoServicio[];
  });
  cache = { hasta: Date.now() + 60_000, datos };
  return datos;
}

async function calcular(): Promise<EstadoServicio[]> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { cromaPausado } = await import("@/lib/verificacion/pausa");
  const { correoConfigurado } = await import("@/lib/correo/enviar");
  const db = createAdminClient();
  const [croma, ia, wa, correo, pausado] = await Promise.all([
    db.from("verificaciones_externas").select("estado, error, created_at").eq("proveedor", "croma").in("estado", ["ok", "hallazgo", "error"]).order("created_at", { ascending: false }).limit(30),
    db.from("wa_agente_ejecuciones").select("resultado, error, created_at").in("resultado", ["respondido", "transferido", "error"]).order("created_at", { ascending: false }).limit(30),
    db
      .from("wa_mensajes")
      .select("estado, error_mensaje, created_at")
      .eq("direccion", "saliente")
      .not("estado", "is", null)
      .not("wamid", "like", "simulado-%")
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("seleccion_envios_laboratorio").select("resultado, error, created_at").eq("canal", "correo").in("resultado", ["enviado", "fallido"]).order("created_at", { ascending: false }).limit(20),
    cromaPausado(),
  ]);
  const filas = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[];
  const eventos: Record<IdServicio, EventoServicio[]> = {
    croma: filas(croma).map((f) => ({ ok: f.estado !== "error", at: f.created_at as string, error: f.error as string | null })),
    // «WhatsApp rechazó el envío» queda como error del asistente, pero es de WhatsApp.
    ia: filas(ia)
      .filter((f) => !/WhatsApp rechaz/i.test(String(f.error ?? "")))
      .map((f) => ({ ok: f.resultado !== "error", at: f.created_at as string, error: f.error as string | null })),
    whatsapp: filas(wa).map((f) => ({ ok: f.estado !== "failed", at: f.created_at as string, error: f.error_mensaje as string | null })),
    correo: filas(correo).map((f) => ({ ok: f.resultado !== "fallido", at: f.created_at as string, error: f.error as string | null })),
  };
  return (Object.keys(NOMBRES) as IdServicio[]).map((id) => {
    const ev = evaluarEventos(eventos[id]);
    let nivel = ev.nivel;
    if (id === "croma" && !process.env.CROMA_API_KEY?.trim()) nivel = "sin_configurar";
    else if (id === "croma" && pausado) nivel = "pausado";
    else if (id === "correo" && !correoConfigurado()) nivel = "sin_configurar";
    return { id, nombre: NOMBRES[id], ...ev, nivel, consejo: nivel === "fallando" ? CONSEJO[id] : null };
  });
}

/** Para las pruebas. */
export function olvidarEstadoServicios(): void {
  cache = null;
}
